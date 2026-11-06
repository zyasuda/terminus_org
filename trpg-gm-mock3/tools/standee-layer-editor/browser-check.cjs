// 実ブラウザーでの操作確認。依存は追加せず、隣のmock2に入っているPlaywrightを借ります。
//   node browser-check.cjs   → screenshots/ に画像を保存
const assert = require('node:assert/strict');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const { chromium } = require(path.resolve(__dirname, '../../../trpg-gm-mock2/node_modules/playwright'));

const repo = path.resolve(__dirname, '../..'), shots = path.join(__dirname, 'screenshots');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let file = path.join(repo, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (file.endsWith(path.sep)) file += 'index.html';
  if (!file.startsWith(repo) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

async function downloads(page, click, count) {
  const got = [];
  const done = new Promise((ok) => page.on('download', async function h(d) {
    got.push({ name: d.suggestedFilename(), path: await d.path() });
    if (got.length === count) { page.off('download', h); ok(); }
  }));
  await click();
  await done;
  return got;
}
// PNGの1画素のアルファと色をブラウザーで読みます。
function pixels(page, file, points) {
  const url = 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
  return page.evaluate(async ({ url, points }) => {
    const img = new Image(); img.src = url; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    return { size: [img.width, img.height], px: points.map(([x, y]) => Array.from(g.getImageData(x, y, 1, 1).data)) };
  }, { url, points });
}

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${server.address().port}/tools/standee-layer-editor/`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const log = (s) => console.log('✓ ' + s);
  try {
    await page.goto(base + 'layer-editor.html');

    // デモ図形
    await page.click('#loadDemo');
    await page.waitForFunction(() => document.getElementById('status').textContent.includes('デモ図形'));
    await page.screenshot({ path: path.join(shots, '01-demo.png') });
    log('デモ図形を読込: ' + (await page.textContent('#status')).split('｜')[0]);

    // 交換手を隠し、素体マスクを追加して書き出す
    await page.uncheck('[data-visible=hand]');
    await page.check('[name=layer][value=body]');
    await page.click('#addMask');
    await page.screenshot({ path: path.join(shots, '02-mask.png') });
    const [front, back] = await downloads(page, () => page.click('#exportPng'), 2);
    assert.deepEqual([front.name, back.name], ['standee-front.png', 'standee-back.png']);
    // (185,650)=素体の元の手だけの位置、(206,650)=剣の柄。マスク範囲(166,610,80,80)の内側。
    const fp = await pixels(page, front.path, [[185, 650], [206, 650], [300, 400]]);
    assert.deepEqual(fp.size, [656, 1199]);
    assert.equal(fp.px[0][3], 0, '素体の手はマスクで透明');
    assert.equal(fp.px[1][3], 255, '手前の装備はマスクで消えない');
    assert.equal(fp.px[2][3], 255, 'マスク外の素体は残る');
    const bp = await pixels(page, back.path, [[450, 650], [5, 5]]);
    assert.equal(bp.px[0][3], 255, '背面にマスクは掛かっていない');
    assert.equal(bp.px[1][3], 0, '背景は透明（ガイドを含まない）');
    // 接続点の十字(206±26, 650)に固有色(#ff2fb4)が出ていないこと
    const ap = await pixels(page, front.path, [[230, 650]]);
    assert.notDeepEqual(ap.px[0].slice(0, 3), [255, 47, 180]);
    fs.copyFileSync(front.path, path.join(shots, '03-export-front.png'));
    log(`透明PNG書き出し: 素体手=${fp.px[0][3]} 柄=${fp.px[1][3]} 胴=${fp.px[2][3]} 背面手=${bp.px[0][3]} 背景=${bp.px[1][3]}`);

    // ファイル入力：既存の剣パーツ(270×1501)を正面の手前装備へ
    await page.check('[name=layer][value=fore]');
    await page.setInputFiles('[data-file=fore]', path.join(repo, 'prototype/art-preview/gareth-equipment-study/gareth-sheathed-part.png'));
    await page.waitForFunction(() => document.getElementById('status').textContent.includes('gareth-sheathed-part.png'));
    log('ファイル入力: ' + (await page.textContent('#status')).split('｜').at(-1).trim());

    // ドラッグ
    await page.fill('#f-scale', '0.4'); await page.press('#f-scale', 'Enter');
    const x0 = Number(await page.inputValue('#f-x')), y0 = Number(await page.inputValue('#f-y'));
    const box = await page.locator('#canvas-front').boundingBox();
    await page.mouse.move(box.x + 100, box.y + 200); await page.mouse.down();
    await page.mouse.move(box.x + 130, box.y + 220, { steps: 5 }); await page.mouse.up();
    const k = box.width / 656;
    const x1 = Number(await page.inputValue('#f-x')), y1 = Number(await page.inputValue('#f-y'));
    assert.equal(x1 - x0, Math.round(30 / k)); assert.equal(y1 - y0, Math.round(20 / k));
    log(`ドラッグ: x ${x0}→${x1}, y ${y0}→${y1}（表示倍率${k.toFixed(2)}）`);

    // 範囲外の数値は反映しない
    await page.fill('#f-scale', '99'); await page.press('#f-scale', 'Enter');
    assert.match(await page.textContent('#error'), /範囲外/);
    assert.equal(await page.inputValue('#f-scale'), '0.4');
    log('範囲外の縮尺: ' + (await page.textContent('#error')));

    // JSON保存 → 壊れたJSONで復元失敗(作業保持) → 正しいJSONで復元
    const [saved] = await downloads(page, () => page.click('#saveJson'), 1);
    const savedText = fs.readFileSync(saved.path, 'utf8');
    await page.fill('#f-x', '7'); await page.press('#f-x', 'Enter');
    await page.setInputFiles('#loadJson', { name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from(savedText.slice(0, 500)) });
    await page.waitForFunction(() => document.getElementById('error').textContent.length > 0);
    assert.equal(await page.inputValue('#f-x'), '7', '壊れたJSONで作業が消えない');
    log('壊れたJSON: ' + (await page.textContent('#error')).slice(0, 80));
    const bad = JSON.parse(savedText); bad.views.front.layers.fore.image = 'data:image/png;base64,AAAA';
    await page.setInputFiles('#loadJson', { name: 'badimage.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) });
    await page.waitForFunction(() => document.getElementById('error').textContent.includes('画像'));
    assert.equal(await page.inputValue('#f-x'), '7', '読めない画像入りJSONで作業が消えない');
    log('読めない画像入りJSON: ' + (await page.textContent('#error')));
    await page.setInputFiles('#loadJson', { name: 'standee-layers.json', mimeType: 'application/json', buffer: Buffer.from(savedText) });
    await page.waitForFunction(() => document.getElementById('status').textContent.includes('から復元'));
    await page.check('[name=layer][value=fore]');
    assert.equal(await page.inputValue('#f-x'), String(x1));
    assert.equal(await page.textContent('#error'), '');
    log(`JSON復元: x=${await page.inputValue('#f-x')}（${savedText.length}文字）`);
    await page.screenshot({ path: path.join(shots, '04-restored.png') });

    // 拡大表示
    await page.selectOption('#zoom', '2');
    const zw = (await page.locator('#canvas-front').boundingBox()).width;
    assert.equal(Math.round(zw), 656 * 2 + 2);
    await page.screenshot({ path: path.join(shots, '05-zoom200.png') });
    await page.selectOption('#zoom', '0.5');
    log('拡大200%: キャンバス幅 ' + Math.round(zw) + 'px');

    // 参照ガイドPNG（接続点の色が出ている）
    const guides = await downloads(page, () => page.click('#exportGuide'), 2);
    const gp = await pixels(page, guides[0].path, [[230, 650]]);
    assert.deepEqual(gp.px[0], [255, 47, 180, 255]);
    fs.copyFileSync(guides[0].path, path.join(shots, '06-guide-front.png'));
    log('参照ガイドPNG: ' + guides.map((g) => g.name).join(', '));

    // 依頼文
    await page.fill('#p-weapon', '片手剣');
    await page.check('[name=method][value=fingers]');
    const prompt = await page.inputValue('#promptText');
    assert.match(prompt, /武器種：片手剣/); assert.match(prompt, /固定指方式/);
    log('依頼文: ' + prompt.split('\n').slice(4, 7).join(' / '));

    // ガレス既存素体（未保存の変更があるので確認が出る。取消で作業が残り、了承で置き換わる）
    page.once('dialog', (d) => d.dismiss());
    await page.click('#loadGareth');
    assert.match(await page.textContent('#status'), /ローカルファイルを含む.*依頼文の条件を変更/);
    page.once('dialog', (d) => d.accept());
    await page.click('#loadGareth');
    await page.waitForFunction(() => document.getElementById('status').textContent.includes('ガレス既存素体'));
    assert.equal(await page.locator('.layer .note', { hasText: '画像あり' }).count(), 1, '素体以外は空');
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(shots, '07-gareth.png') });
    log('ガレス既存素体: ' + (await page.textContent('#status')).split('｜')[0]);

    // ---- 制作フロー（index.html） ----
    const art = (f) => path.join(repo, 'prototype/art-preview/gareth-equipment-study', f);
    const pick = async (view, file) => {
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click(`[data-act=pick][data-view=${view}]`)]);
      await chooser.setFiles(file);
    };
    const status = () => page.textContent('#status');
    const stageText = (id) => page.textContent(`[data-stage=${id}] small`);
    await page.goto(base);
    assert.equal(await page.locator('a[href="layer-editor.html"]').count(), 1, '詳細レイヤー編集への入口は1つ');

    // ②は基準が無いと始められず、前提を操作の場所に出す
    await page.click('[data-stage=drawn]');
    assert.equal(await page.isVisible('#need'), true);
    assert.equal(await page.isDisabled('[data-act=copy][data-view=front]'), true);
    assert.equal(await stageText('drawn'), '納刀の基準待ち');
    log('②の前提表示: ' + (await page.textContent('#need')).slice(0, 30));
    await page.click('[data-act=goto-sheathed]');

    // ①：前後を読み込み→基準として保存
    assert.equal(await page.isDisabled('#saveBase'), true);
    await pick('front', art('gareth-empty-front.png'));
    await page.waitForFunction(() => document.getElementById('status').textContent.includes('gareth-empty-front.png'));
    assert.equal(await page.isDisabled('#saveBase'), true, '片面だけでは保存できない');
    await pick('back', art('gareth-empty-back-natural.png'));
    await page.waitForFunction(() => document.getElementById('status').textContent.includes('gareth-empty-back-natural.png'));
    await page.click('#saveBase');
    assert.equal(await stageText('sheathed'), '基準保存済み');
    log('①基準保存: ' + await stageText('sheathed'));

    // 壊れた画像を読んでも表示中の画像は残る
    const frontPixel = () => page.evaluate(() => { const c = document.querySelector('#pics-front canvas[data-role=current]'); return c && [c.width, c.height, ...c.getContext('2d').getImageData(328, 400, 1, 1).data]; });
    const before = await frontPixel();
    await pick('front', { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not a png') });
    await page.waitForFunction(() => document.getElementById('error').textContent.includes('broken.png'));
    assert.deepEqual(await frontPixel(), before, '読込失敗で既存画像が消えない');
    assert.equal(await stageText('sheathed'), '基準保存済み');
    log('壊れた画像: ' + await page.textContent('#error') + ` / 表示中 ${before.slice(0, 2).join('×')} のまま`);

    // ②：プロンプトは前後別。抜刀画像を読み、基準と同じ寸法で比較
    await page.click('[data-stage=drawn]');
    assert.equal(await page.isVisible('#need'), false);
    const pf = await page.textContent('pre[data-prompt=front]'), pb = await page.textContent('pre[data-prompt=back]');
    assert.match(pf, /正面図では画面の左側/); assert.match(pb, /背面図では画面の右側/);
    await pick('front', art('gareth-empty-front.png'));
    await page.waitForFunction(() => document.getElementById('status').textContent.includes('抜刀・正面'));
    await page.click('#compare');
    const dims = await page.evaluate(() => [...document.querySelectorAll('#pics-front canvas')].map((c) => [c.dataset.role, c.width, c.height, Math.round(c.getBoundingClientRect().width), Math.round(c.getBoundingClientRect().height)]));
    assert.equal(dims.length, 2); assert.deepEqual(dims[0].slice(1), dims[1].slice(1), '基準と現在が同じ寸法');
    await page.screenshot({ path: path.join(shots, '10-flow-compare.png') });
    log('基準と比較: ' + JSON.stringify(dims));

    // 制作データを保存→リロード（未保存なし）→開くで復元。不正データでは今の作業を残す
    const [flowSaved] = await downloads(page, () => page.click('#saveFlow'), 1);
    const flowText = fs.readFileSync(flowSaved.path, 'utf8');
    const openFlow = async (name, buffer) => {
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#openFlow')]);
      await chooser.setFiles({ name, mimeType: 'application/json', buffer });
    };
    await page.reload();
    assert.equal(await stageText('sheathed'), '未読込');
    await openFlow('standee-flow.json', Buffer.from(flowText));
    await page.waitForFunction(() => document.getElementById('status').textContent.includes('を開いた'));
    assert.equal(await stageText('sheathed'), '基準保存済み');
    assert.equal(await stageText('drawn'), '正面のみ');
    await openFlow('layers.json', Buffer.from(savedText));
    await page.waitForFunction(() => document.getElementById('error').textContent.includes('詳細レイヤー編集'));
    const badFlow = JSON.parse(flowText); badFlow.states.empty.back = 'data:image/png;base64,AAAA';
    await openFlow('bad.json', Buffer.from(JSON.stringify(badFlow)));
    await page.waitForFunction(() => document.getElementById('error').textContent.includes('制作データ内の画像'));
    assert.equal(await stageText('drawn'), '正面のみ', '不正データで作業が消えない');
    log(`制作データ復元: ${flowText.length}文字 / 不正読込: ${await page.textContent('#error')}`);

    // 未保存の変更があると離脱時に確認が出る
    await page.click('[data-stage=empty]');
    await pick('back', art('gareth-empty-back-natural.png'));
    await page.waitForFunction(() => document.getElementById('status').textContent.includes('未保存の変更あり'));
    // ponytail: ブラウザー側の確認ダイアログはユーザー操作の有無で出方が変わるので、ハンドラーが離脱を止めるかだけ見る
    const blocks = () => page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); dispatchEvent(e); return e.defaultPrevented; });
    assert.equal(await blocks(), true, '未保存離脱を止める');
    await downloads(page, () => page.click('#saveFlow'), 1);
    assert.equal(await blocks(), false, '保存後は止めない');
    log('未保存離脱: 未保存時だけ beforeunload を止める');

    // 試作デモ：既存ガレス3状態を合成して読み込む
    const demo = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
    demo.on('pageerror', (e) => errors.push(e.message));
    demo.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await demo.goto(base);
    await demo.click('#loadDemo');
    await demo.waitForFunction(() => document.getElementById('status').textContent.includes('試作デモ'), null, { timeout: 30000 });
    for (const id of ['sheathed', 'drawn', 'empty']) assert.match(await demo.textContent(`[data-stage=${id}] small`), /基準保存済み|前後あり/);
    await demo.screenshot({ path: path.join(shots, '11-flow-demo.png') });
    await demo.click('[data-stage=drawn]'); await demo.click('#compare');
    await demo.screenshot({ path: path.join(shots, '12-flow-demo-drawn-compare.png') });
    log('試作デモ: ' + (await Promise.all(['sheathed', 'drawn', 'empty'].map((id) => demo.textContent(`[data-stage=${id}] small`)))).join(' / '));
    await demo.goto(base + 'guide.html');
    await demo.screenshot({ path: path.join(shots, '13-guide.png'), fullPage: true });

    assert.deepEqual(errors, [], 'コンソールエラーなし');
    log('コンソールエラー 0件');
  } finally {
    await browser.close(); server.close();
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
