// 実ブラウザーでの操作確認。依存は追加せず、隣のmock2に入っているPlaywrightを検査のためだけに借ります。
//   node browser-check.cjs   → screenshots/ui-*.png に保存（旧 01〜06 は上書きしない）
const assert = require('node:assert/strict');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const { chromium } = require(path.resolve(__dirname, '../trpg-gm-mock2/node_modules/playwright'));
const W = require('./wardrobe.js');

const root = __dirname, shots = path.join(root, 'screenshots');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (file.endsWith(path.sep)) file += 'index.html';
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

// 1ページ分の道具
function tools(page) {
  const canvas = page.locator('#stage');
  // キャンバス座標 → 画面座標
  const at = async (p) => { const b = await canvas.boundingBox(); return { x: b.x + p.x * b.width / W.WIDTH, y: b.y + p.y * b.height / W.HEIGHT }; };
  return {
    canvas, at,
    outfit: () => page.textContent('#outfit'),
    hint: () => page.textContent('#hint'),
    cardOpen: () => page.isVisible('#card'),
    cardTitle: () => page.textContent('#card-title'),
    cardButtons: () => page.$$eval('#card .card-actions button', (bs) => bs.map((b) => b.textContent)),
    clickOn: async (p) => { const q = await at(p); await page.mouse.click(q.x, q.y); },
    // キャンバスの1画素（RGB）
    pixel: (p) => page.evaluate(({ x, y }) => [...document.getElementById('stage').getContext('2d').getImageData(x, y, 1, 1).data].slice(0, 3), p),
    shot: (name) => page.screenshot({ path: path.join(shots, `ui-${name}.png`), fullPage: true }),
    noOverflow: () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  };
}
const near = (a, b, tol = 40) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
// 描画したキャンバスで頭頂・足裏・頭の中心・左右の端を測る（頭の列は X±110 だけ見て道具の先を除く）
const measureFigure = (page, X) => page.evaluate(([X, A]) => {
  const c = document.getElementById('stage'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const on = (x, y) => d[(y * c.width + x) * 4 + 3] >= A;
  let top = -1, foot = -1, left = c.width, right = -1, sx = 0, n = 0;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (on(x, y)) {
    foot = y; left = Math.min(left, x); right = Math.max(right, x);
    if (top < 0 && x >= X - 110 && x <= X + 110) top = y;
  }
  for (let y = top; y < top + 60; y++) for (let x = X - 110; x <= X + 110; x++) if (on(x, y)) { sx += x; n++; }
  return { top, foot, headX: Math.round(sx / n), left, right };
}, [X, 128]);
const BRASS = [0xe0, 0xc2, 0x7f];

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const browser = await chromium.launch();
  const url = `http://127.0.0.1:${server.address().port}/`;
  const errors = [];
  const open = async (opts) => {
    const page = await browser.newPage(opts);
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(url);
    await page.waitForSelector('body[data-ready="1"]', { timeout: 10000 });
    return page;
  };
  const log = (s) => console.log('✓ ' + s);
  try {
    // ── 1440px ──
    const page = await open({ viewport: { width: 1440, height: 960 } });
    const t = tools(page);
    assert.equal(await t.outfit(), '素手');
    await page.click('#view-curved-set');
    assert.ok(await page.$eval('#curved-set', (d) => d.open));
    assert.equal(await page.locator('#curved-set img').count(), 2);
    await page.click('#curved-set button');
    assert.equal(await page.locator('.rack canvas').count(), 0, '衣装掛けに人物の絵は無い');
    assert.deepEqual(await page.$$eval('.rack .tag', (ts) => ts.map((x) => x.textContent)), ['鎧は着用中', '替え衣装は準備中']);
    assert.equal(await page.locator('.slot .return').count(), 0, '棚に「棚へ戻す」は無い');
    assert.ok(await page.isHidden('#open-sword') && await page.isHidden('#open-scabbard'));
    assert.ok(!(await page.$eval('details.proto', (d) => d.open)), '試作の注記は畳まれている');
    await t.shot('01-empty');
    log('読込・素手・空の衣装掛け・片刃剣と鞘の候補表示・注記は折りたたみ');

    await t.clickOn(W.HAND_POINT.front);
    assert.ok(!(await t.cardOpen()), '素手の手を押してもカードは出ない');
    await page.locator('.slot[data-item="sword"] .item').dragTo(t.canvas, { targetPosition: await (async () => {
      const b = await t.canvas.boundingBox(), q = await t.at(W.HAND_POINT.front); return { x: q.x - b.x, y: q.y - b.y };
    })() });
    assert.equal(await t.outfit(), '剣を手に（鞘なし）');
    assert.match(await t.hint(), /手を押すと/);
    log('棚の剣を手へドラッグ → 足もとに次の案内');

    await page.click('.slot[data-item="scabbard"] .item');
    const anim = await page.$eval('#stage', (c) => [c.classList.contains('equip-flash'), getComputedStyle(c).animationName]);
    assert.deepEqual(anim, [true, 'equip-flash']);
    assert.equal(await t.outfit(), '抜刀');
    log('鞘をクリックで装着 → 抜刀・装着の光が動く');

    await t.clickOn(W.HAND_POINT.front);
    assert.ok(await t.cardOpen());
    assert.equal(await t.cardTitle(), '片手剣');
    assert.deepEqual(await t.cardButtons(), ['納刀する', '棚へ戻す']);
    assert.equal(await page.getAttribute('#open-sword', 'aria-expanded'), 'true');
    await t.shot('02-sword-card');
    await page.click('#card button:has-text("納刀する")');
    assert.equal(await t.outfit(), '納刀');
    assert.ok(!(await t.cardOpen()), '操作したらカードは閉じる');
    log('人物の手をクリック → 片手剣のカード → 納刀');

    const frameAt = { x: W.WAIST_POINT.front.x, y: W.WAIST_POINT.front.y - W.SCABBARD_RANGE };
    assert.ok(!near(await t.pixel(frameAt), BRASS, 20), '選んでいなければ枠は無い');
    await t.clickOn(W.WAIST_POINT.front);
    assert.equal(await t.cardTitle(), '鞘');
    assert.deepEqual(await t.cardButtons(), ['棚へ戻す']);
    assert.ok(near(await t.pixel(frameAt), BRASS), '鞘を選ぶと真鍮の枠');
    await t.shot('03-scabbard-card-frame');
    await page.keyboard.press('Escape');
    assert.ok(!(await t.cardOpen()));
    assert.ok(!near(await t.pixel(frameAt), BRASS, 20), '閉じたら枠も消える');
    log('鞘をクリック → 鞘のカードと取り付け枠 → Escで閉じる');

    await t.canvas.focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
    assert.match(await page.textContent('#unchecked'), /背面はまだ見ていません/);
    assert.ok(await page.$eval('.turn [data-view="back"]', (b) => b.classList.contains('needs')));
    log('正面だけ動かすと背面の確認を促す');

    // 小さく揺れただけ（5px未満）ならクリック扱い：カードが開き、鞘は動かない
    const w = await t.at({ x: W.WAIST_POINT.front.x + 6, y: W.WAIST_POINT.front.y + 120 });
    await page.mouse.move(w.x, w.y); await page.mouse.down(); await page.mouse.move(w.x + 1, w.y + 1); await page.mouse.up();
    assert.ok(await t.cardOpen(), '1px の揺れはクリック');
    assert.equal(await t.cardTitle(), '鞘');
    await page.keyboard.press('Escape');

    // ドラッグ：枠が出て、範囲で止まり、離してもカードは開かない
    await page.mouse.move(w.x, w.y); await page.mouse.down();
    await page.mouse.move(w.x + 200, w.y, { steps: 5 });
    assert.ok(near(await t.pixel(frameAt), BRASS), 'ドラッグ中は枠');
    await page.mouse.up();
    assert.equal(await t.hint(), 'これ以上は動きません');
    assert.ok(!(await t.cardOpen()), 'ドラッグ終了でカードは開かない');
    await t.shot('04-front-sheathed-moved');
    log('わずかな揺れはクリック・ドラッグは枠つきで範囲内に止まりカードを開かない');

    await page.click('#undo');
    assert.equal(await t.hint(), 'ひとつ前に戻しました');
    log('取り消し');

    await page.click('#open-sword');
    assert.ok(await t.cardOpen());
    assert.deepEqual(await t.cardButtons(), ['抜刀する', '棚へ戻す']);
    assert.equal(await page.evaluate(() => document.activeElement.closest('#card') !== null), true, 'カードへフォーカス');
    await page.click('.turn [data-view="back"]');
    assert.ok(!(await t.cardOpen()), '前後を切り替えたら閉じる');
    assert.equal(await page.textContent('#unchecked'), '');
    await t.shot('05-back-sheathed');
    log('「剣を整える」から同じカード・前後の切替で閉じる・背面を見ると未確認が消える');

    await page.focus('#open-sword');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');        // カードの最初のボタン＝抜刀する
    assert.equal(await t.outfit(), '抜刀');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'open-sword', 'フォーカスは入口へ戻る');
    await t.shot('06-back-drawn');
    log('キーボードだけで 剣を整える → 抜刀（背面）');

    await page.click('#wings');
    assert.ok(await page.$eval('#wings-dialog', (d) => d.open));
    await t.shot('07-wings');
    await page.click('#wings-dialog button');
    log('舞台袖で前後を並べる');

    await page.click('#open-scabbard');
    await page.click('#card button:has-text("棚へ戻す")');
    assert.equal(await t.outfit(), '剣を手に（鞘なし）');
    assert.ok(await page.isHidden('#open-scabbard'));
    await t.clickOn(W.HAND_POINT.back);
    assert.deepEqual(await t.cardButtons(), ['棚へ戻す'], '鞘が無ければ納刀は出ない');
    await page.click('#card button');
    assert.equal(await t.outfit(), '素手');
    assert.ok(!(await t.cardOpen()) && await page.isHidden('#open-sword'));
    await page.click('#undo');
    assert.equal(await t.outfit(), '剣を手に（鞘なし）');
    log('鞘を棚へ → 剣を棚へ → 取り消しで手に戻る');
    await page.close();

    // ── 390px：横にあふれず、タップで同じ操作ができる ──
    const m = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const mt = tools(m);
    assert.ok(await mt.noOverflow(), '390px で横にあふれない');
    await m.tap('.slot[data-item="sword"] .item');
    await m.tap('.slot[data-item="scabbard"] .item');
    assert.equal(await mt.outfit(), '抜刀');
    const h = await mt.at(W.HAND_POINT.front);
    await m.touchscreen.tap(h.x, h.y);
    assert.ok(await mt.cardOpen());
    const cb = await m.locator('#card').boundingBox();
    assert.ok(cb.x >= 0 && cb.x + cb.width <= 390, `カードが画面内 ${JSON.stringify(cb)}`);
    assert.ok(await mt.noOverflow(), 'カードを開いてもあふれない');
    await mt.shot('08-390-card');
    await m.tap('#card button:has-text("納刀する")');
    assert.equal(await mt.outfit(), '納刀');
    await m.tap('#wings');
    const db = await m.locator('#wings-dialog').boundingBox();
    assert.ok(db.x >= 0 && db.x + db.width <= 390, `舞台袖が画面内 ${JSON.stringify(db)}`);
    await mt.shot('09-390-wings');
    await m.close();
    log('390px：あふれなし・タップでカード・カードと舞台袖が画面内');

    // ── reduced motion：装着の動きを止める ──
    const r = await open({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
    await r.click('.slot[data-item="scabbard"] .item');
    assert.equal(await r.$eval('#stage', (c) => getComputedStyle(c).animationName), 'none');
    assert.equal(await r.textContent('#outfit'), '鞘だけ（剣は棚）');
    await r.close();
    log('reduced motion では装着の動きなし');

    // ── マレン ──
    const M = W.maren;
    const mp = await open({ viewport: { width: 1440, height: 960 } });
    const q = tools(mp);
    const mshot = (name) => mp.screenshot({ path: path.join(shots, `maren-${name}.png`), fullPage: true });
    const visible = (sel) => mp.$$eval(sel, (els) => els.filter((e) => e.offsetParent).map((e) => e.dataset.item));
    // ガレスを抜刀にしてからマレンへ
    await mp.click('.slot[data-item="sword"] .item');
    await mp.click('.slot[data-item="scabbard"] .item');
    assert.equal(await q.outfit(), '抜刀');
    await mp.click('.cast [data-actor="maren"]');
    assert.equal(await mp.getAttribute('.cast [data-actor="maren"]', 'aria-pressed'), 'true');
    assert.equal(await mp.locator('.cast button').count(), 3, '俳優の切替は見出しの1か所');
    assert.equal(await q.outfit(), '何も持たない');
    assert.deepEqual(await visible('.shelf .slot[data-item]'), ['staff', 'lantern', 'none', 'necklace'], '棚にガレスの剣・鞘は出ない');
    assert.ok(await mp.isHidden('#view-curved-set'), '片刃剣のデザインもマレンの棚には出ない');
    assert.match(await mp.textContent('.slot[data-item="staff"]'), /おすすめ『魔法使いの身支度』/);
    assert.equal(await mp.textContent('#worn-tag'), '旅装は着用中');
    assert.ok(await mp.$eval('#undo', (b) => b.disabled), 'ガレスの履歴はマレンに混ざらない');
    log('マレンへ切替：棚は杖・ランタン・何も持たない、おすすめは表示だけ、履歴は空');

    const measure = () => measureFigure(mp, M.MAREN_X);
    const poses = {};
    const pose = async (hold, view) => {
      await mp.click(`.turn [data-view="${view}"]`);
      const r = await measure();
      poses[`${hold}-${view}`] = r;
      await mshot(`${hold}-${view}`);
      return r;
    };
    for (const v of ['front', 'back']) await pose('none', v);

    await mp.click('.turn [data-view="front"]');
    await mp.click('.slot[data-item="staff"] .item');
    assert.equal(await q.outfit(), '杖を手に');
    assert.match(await mp.textContent('.slot[data-item="staff"] .where'), /マレンの右手に/);
    for (const v of ['front', 'back']) await pose('staff', v);
    log('棚の杖をクリック → 杖を手に（正面・背面）');

    await mp.click('.turn [data-view="front"]');
    const target = await (async () => { const b = await q.canvas.boundingBox(), p = await q.at(M.itemPoint({ hold: 'lantern' }, 'front')); return { x: p.x - b.x, y: p.y - b.y }; })();
    await mp.locator('.slot[data-item="lantern"] .item').dragTo(q.canvas, { targetPosition: target });
    assert.equal(await q.outfit(), 'ランタンを手に');
    assert.match(await q.hint(), /ランタンに持ち替えました（杖は棚へ）/);
    assert.equal(await mp.textContent('.slot[data-item="staff"] .where'), '棚にあります', '杖とランタンは同時に持たない');
    for (const v of ['front', 'back']) await pose('lantern', v);
    log('ランタンをドラッグ → 杖から持ち替え（排他）');

    // 前後で頭と足元が跳ねない：6姿とも同じ位置（許容2px）、人物はキャンバスからはみ出さない
    console.log('  描画後の実測', JSON.stringify(poses));
    for (const [k, r] of Object.entries(poses)) {
      assert.ok(Math.abs(r.top - M.MAREN_TOP) <= 2, `${k} 頭頂 ${r.top}`);
      assert.ok(Math.abs(r.foot - M.MAREN_FOOT) <= 2, `${k} 足裏 ${r.foot}`);
      assert.ok(Math.abs(r.headX - M.MAREN_X) <= 3, `${k} 頭の中心 ${r.headX}`);
      assert.ok(r.left > 0 && r.right < W.WIDTH - 1, `${k} 左右 ${r.left}-${r.right}`);
    }
    log('6姿の頭頂・足裏・頭の中心が揃う');

    // 持ち物を押すと近くにカード → 棚へ戻す → 取り消し
    await mp.click('.turn [data-view="back"]');
    await q.clickOn(M.itemPoint({ hold: 'lantern' }, 'back'));
    assert.ok(await q.cardOpen());
    assert.equal(await q.cardTitle(), 'ランタン');
    assert.deepEqual(await q.cardButtons(), ['棚へ戻す']);
    const cardBox = await mp.locator('#card').boundingBox(), handAt = await q.at(M.itemPoint({ hold: 'lantern' }, 'back'));
    assert.ok(Math.abs(cardBox.x + cardBox.width / 2 - handAt.x) < 120 && cardBox.y > handAt.y && cardBox.y - handAt.y < 60, 'カードは持ち物のそば');
    await mshot('lantern-card');
    await mp.click('#card button');
    assert.equal(await q.outfit(), '何も持たない');
    await mp.click('#undo');
    assert.equal(await q.outfit(), 'ランタンを手に');
    log('背面でランタンを押す → そばのカード → 棚へ戻す → 取り消し');

    // キーボードだけ：棚の杖 → 持ち物を整える → 棚へ戻す → 何も持たない
    await mp.focus('.slot[data-item="staff"] .item');
    await mp.keyboard.press('Enter');
    assert.equal(await q.outfit(), '杖を手に');
    await mp.focus('#open-hold');
    await mp.keyboard.press('Enter');
    assert.equal(await q.cardTitle(), '杖');
    await mp.keyboard.press('Enter');
    assert.equal(await q.outfit(), '何も持たない');
    await mp.click('.slot[data-item="lantern"] .item');
    await mp.click('.slot[data-item="none"] .item');
    assert.equal(await q.outfit(), '何も持たない');
    assert.match(await q.hint(), /ランタンを棚へ戻しました/);
    await mp.click('.slot[data-item="staff"] .item');
    log('キーボードで杖を持たせて外す・何も持たないを選ぶ');

    // 舞台袖で前後
    await mp.click('#wings');
    assert.ok(await mp.$eval('#wings-dialog', (d) => d.open));
    await mshot('wings');
    await mp.click('#wings-dialog button');

    // 切り替えても各自の身支度と履歴が残る
    await mp.click('.cast [data-actor="gareth"]');
    assert.equal(await q.outfit(), '抜刀', 'ガレスの身支度が残る');
    assert.deepEqual(await visible('.shelf .slot[data-item]'), ['sword', 'scabbard']);
    await mp.click('#undo');
    assert.equal(await q.outfit(), '剣を手に（鞘なし）', 'ガレスの取り消しはガレスの操作だけ');
    await mp.click('.cast [data-actor="maren"]');
    assert.equal(await q.outfit(), '杖を手に', 'マレンはそのまま');
    await mp.click('#undo');
    assert.equal(await q.outfit(), '何も持たない', 'マレンの取り消しはマレンの操作だけ');
    log('切替で各自の身支度を保持・取り消しは俳優ごと');
    await mp.close();

    // ── 首飾り：手持ちと独立。正面は胸元に描き、背面は描かずに札で知らせる ──
    const np = await open({ viewport: { width: 1440, height: 960 } });
    const nq = tools(np);
    const nshot = (name) => np.screenshot({ path: path.join(shots, `maren-necklace-${name}.png`), fullPage: true });
    const sum = () => np.evaluate(() => {   // キャンバス全体の画素の要約（描いたものが同じかを比べる）
      const d = document.getElementById('stage').getContext('2d').getImageData(0, 0, 656, 1199).data;
      let a = 0; for (let i = 0; i < d.length; i++) a = (a * 31 + d[i]) % 1000000007; return a;
    });
    const amber = async (p) => { const [r, g, b] = await nq.pixel({ x: Math.round(p.x), y: Math.round(p.y) + 2 }); return r > g && g > b && r - b > 80; };
    const gem = (hold) => M.itemPoint({ hold, necklace: true }, 'front', 'necklace');
    await np.click('.cast [data-actor="maren"]');
    const bare = { front: await sum() };
    await np.click('.turn [data-view="back"]'); bare.back = await sum();
    await np.click('.turn [data-view="front"]');
    assert.ok(!(await amber(gem(null))), '着ける前の胸元は琥珀色ではない');
    await np.click('.slot[data-item="necklace"] .item');
    assert.equal(await nq.outfit(), '何も持たない・琥珀の首飾り');
    assert.equal(await np.textContent('.slot[data-item="necklace"] .where'), 'マレンの胸元に');
    assert.match(await nq.hint(), /胸元を押すと外せます/);
    assert.ok(await amber(gem(null)), '胸元に琥珀');
    assert.notEqual(await sum(), bare.front);
    await nshot('none');
    log('棚の首飾りをクリック → 正面の胸元に描く・札に表示');

    await np.click('.slot[data-item="staff"] .item');
    assert.equal(await nq.outfit(), '杖を手に・琥珀の首飾り', '杖に持ち替えても着けたまま');
    assert.ok(await amber(gem('staff')));
    await nshot('staff');
    const lt = await (async () => { const b = await nq.canvas.boundingBox(), p = await nq.at(M.itemPoint({ hold: 'lantern' }, 'front')); return { x: p.x - b.x, y: p.y - b.y }; })();
    await np.locator('.slot[data-item="lantern"] .item').dragTo(nq.canvas, { targetPosition: lt });
    assert.equal(await nq.outfit(), 'ランタンを手に・琥珀の首飾り', 'ランタンに持ち替えても着けたまま');
    assert.ok(await amber(gem('lantern')));
    await nshot('lantern');
    log('杖・ランタンへ持ち替えても首飾りは着けたまま（3姿とも胸元に琥珀）');

    // 背面：髪に隠れるので描かない。札と台の下の入口で着けていると分かる
    await np.click('.turn [data-view="back"]');
    assert.equal(await nq.outfit(), 'ランタンを手に・琥珀の首飾り（背面では髪に隠れて見えません）');
    await np.click('.slot[data-item="none"] .item');
    assert.equal(await sum(), bare.back, '背面は首飾りを描かない（着ける前と同じ絵）');
    await np.click('#undo');
    assert.ok(await np.isVisible('#open-necklace'), '背面でも首飾りの入口がある');
    await nq.clickOn(M.itemPoint({ hold: 'lantern', necklace: true }, 'back', 'necklace'));
    assert.ok(!(await nq.cardOpen()), '背面のうなじを押してもカードは出ない');
    await nshot('back');
    await np.focus('#open-necklace');
    await np.keyboard.press('Enter');
    assert.equal(await nq.cardTitle(), '琥珀の首飾り');
    assert.deepEqual(await nq.cardButtons(), ['外す']);
    await np.keyboard.press('Escape');
    assert.equal(await np.evaluate(() => document.activeElement.id), 'open-necklace');
    log('背面：首飾りは描かず、札「髪に隠れて見えません」と「首飾りを整える」で分かる');

    // 正面で胸元を押す → そばのカード → 外す → 取り消し
    await np.click('.turn [data-view="front"]');
    await nq.clickOn(gem('lantern'));
    assert.ok(await nq.cardOpen());
    assert.equal(await nq.cardTitle(), '琥珀の首飾り');
    assert.deepEqual(await nq.cardButtons(), ['外す']);
    const ncb = await np.locator('#card').boundingBox(), gat = await nq.at(gem('lantern'));
    assert.ok(Math.abs(ncb.x + ncb.width / 2 - gat.x) < 120 && ncb.y > gat.y && ncb.y - gat.y < 60, 'カードは胸元のそば');
    await np.click('#card button');
    assert.equal(await nq.outfit(), 'ランタンを手に', '外すと手持ちはそのまま');
    assert.ok(!(await amber(gem('lantern'))));
    assert.ok(await np.isHidden('#open-necklace'));
    await np.click('#undo');
    assert.equal(await nq.outfit(), 'ランタンを手に・琥珀の首飾り', '取り消しで着けた状態に戻る');
    log('胸元クリック → そばのカード → 外す → 取り消しで戻る');

    // キーボードだけ：首飾りを整える → 外す → 棚から Enter で着け直す
    await np.focus('#open-necklace');
    await np.keyboard.press('Enter');
    await np.keyboard.press('Enter');
    assert.equal(await nq.outfit(), 'ランタンを手に');
    await np.focus('.slot[data-item="necklace"] .item');
    await np.keyboard.press('Enter');
    assert.equal(await nq.outfit(), 'ランタンを手に・琥珀の首飾り');
    log('キーボードで外して着け直す');

    // 俳優を切り替えても保持。ガレスには混ざらない
    await np.click('.cast [data-actor="gareth"]');
    assert.equal(await nq.outfit(), '素手');
    assert.ok(await np.isHidden('#open-necklace'));
    await np.click('.cast [data-actor="maren"]');
    assert.equal(await nq.outfit(), 'ランタンを手に・琥珀の首飾り', '切り替えて戻っても着けたまま');
    await np.click('#undo');
    assert.equal(await nq.outfit(), 'ランタンを手に', 'マレンの取り消しはマレンの操作');
    await np.close();
    log('俳優の切替で首飾りを保持・取り消しは俳優ごと');

    // 390px
    const mm = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const mq = tools(mm);
    await mm.tap('.cast [data-actor="maren"]');
    assert.ok(await mq.noOverflow(), '390px でマレンもあふれない');
    await mm.tap('.slot[data-item="staff"] .item');
    assert.equal(await mq.outfit(), '杖を手に');
    const sh = await mq.at(M.itemPoint({ hold: 'staff' }, 'front'));
    await mm.touchscreen.tap(sh.x, sh.y);
    assert.ok(await mq.cardOpen());
    const mcb = await mm.locator('#card').boundingBox();
    assert.ok(mcb.x >= 0 && mcb.x + mcb.width <= 390, `カードが画面内 ${JSON.stringify(mcb)}`);
    assert.ok(await mq.noOverflow());
    await mm.screenshot({ path: path.join(shots, 'maren-390-card.png'), fullPage: true });
    await mm.tap('#card button');
    await mm.tap('.slot[data-item="lantern"] .item');
    assert.equal(await mq.outfit(), 'ランタンを手に');
    await mm.screenshot({ path: path.join(shots, 'maren-390-lantern.png'), fullPage: true });
    await mm.tap('.slot[data-item="necklace"] .item');
    assert.equal(await mq.outfit(), 'ランタンを手に・琥珀の首飾り');
    assert.ok(await mq.noOverflow(), '首飾りを着けてもあふれない');
    await mq.canvas.scrollIntoViewIfNeeded();   // 棚は台の下にあるので、台まで戻ってから胸元をタップする
    const ng =await mq.at(M.itemPoint({ hold: 'lantern', necklace: true }, 'front', 'necklace'));
    await mm.touchscreen.tap(ng.x, ng.y);
    assert.ok(await mq.cardOpen());
    assert.equal(await mq.cardTitle(), '琥珀の首飾り');
    const ncb2 = await mm.locator('#card').boundingBox();
    assert.ok(ncb2.x >= 0 && ncb2.x + ncb2.width <= 390, `首飾りのカードが画面内 ${JSON.stringify(ncb2)}`);
    assert.ok(await mq.noOverflow());
    await mm.screenshot({ path: path.join(shots, 'maren-390-necklace.png'), fullPage: true });
    await mm.tap('#card button');
    assert.equal(await mq.outfit(), 'ランタンを手に');
    await mm.close();
    log('390px：マレンの切替・タップでカード・持ち替え・首飾りの着け外し・あふれなし');

    // ── ブロム：金槌（右手）と盾（左腕）を別々に着け外し。4状態×前後の8姿 ──
    const B = W.brom;
    const bp = await open({ viewport: { width: 1440, height: 960 } });
    const bq = tools(bp);
    const bshot = (name) => bp.screenshot({ path: path.join(shots, `brom-${name}.png`), fullPage: true });
    const bvisible = () => bp.$$eval('.shelf .slot[data-item]', (els) => els.filter((e) => e.offsetParent).map((e) => e.dataset.item));
    const bwhere = (item) => bp.textContent(`.slot[data-item="${item}"] .where`);
    const toTarget = async (p) => { const b = await bq.canvas.boundingBox(), q = await bq.at(p); return { x: q.x - b.x, y: q.y - b.y }; };
    // ガレスを抜刀、マレンを杖にしてからブロムへ
    await bp.click('.slot[data-item="sword"] .item');
    await bp.click('.slot[data-item="scabbard"] .item');
    await bp.click('.cast [data-actor="maren"]');
    await bp.click('.slot[data-item="staff"] .item');
    await bp.click('.cast [data-actor="brom"]');
    assert.equal(await bp.getAttribute('.cast [data-actor="brom"]', 'aria-pressed'), 'true');
    assert.equal(await bp.locator('.cast button').count(), 3, '俳優の切替は見出しの1か所');
    assert.equal(await bq.outfit(), '素手');
    assert.deepEqual(await bvisible(), ['hammer', 'axe', 'shield'], '棚は金槌・手斧・盾だけ');
    assert.ok(await bp.isHidden('#view-curved-set'));
    assert.equal(await bp.textContent('#worn-tag'), '鎧は着用中');
    assert.ok(await bp.$eval('#undo', (b) => b.disabled), '他の俳優の履歴は混ざらない');
    assert.ok(await bp.$$eval('#thumb-hammer, #thumb-shield, #thumb-axe', (cs) => cs.every((c) => {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 128) n++; return n > c.width * c.height * 0.15;
    })), '棚に金槌・盾・手斧の絵');
    log('ブロムへ切替：棚は金槌・手斧・盾、札は鎧は着用中、履歴は空');

    const bposes = {};
    const bpose = async (key, view) => {
      await bp.click(`.turn [data-view="${view}"]`);
      bposes[`${key}-${view}`] = await measureFigure(bp, B.BROM_X);
      await bshot(`${key}-${view}`);
    };
    for (const v of ['front', 'back']) await bpose('empty', v);

    // 棚の金槌をクリック → 金槌だけ
    await bp.click('.turn [data-view="front"]');
    await bp.click('.slot[data-item="hammer"] .item');
    assert.equal(await bq.outfit(), '金槌だけ');
    assert.equal(await bwhere('hammer'), 'ブロムの右手に');
    assert.equal(await bwhere('shield'), '棚にあります');
    assert.ok(await bp.isVisible('#open-hammer') && await bp.isHidden('#open-shield'));
    for (const v of ['front', 'back']) await bpose('hammer', v);
    log('棚の金槌をクリック → 金槌だけ（正面・背面）');

    // 盾をドラッグ → 金槌と盾（金槌はそのまま）
    await bp.click('.turn [data-view="front"]');
    await bp.locator('.slot[data-item="shield"] .item').dragTo(bq.canvas, { targetPosition: await toTarget(B.itemPoint({ shield: true }, 'front', 'shield')) });
    assert.equal(await bq.outfit(), '金槌と盾');
    assert.match(await bq.hint(), /左腕に盾を着けました/);
    assert.equal(await bwhere('shield'), 'ブロムの左腕に');
    for (const v of ['front', 'back']) await bpose('both', v);
    log('盾をドラッグ → 金槌と盾（金槌は外れない）');

    // 背面で金槌を押す → そばのカード → 棚へ戻す → 盾だけ
    await bp.click('.turn [data-view="back"]');
    const bh = B.itemPoint({ hammer: true, shield: true }, 'back', 'hammer');
    await bq.clickOn(bh);
    assert.ok(await bq.cardOpen());
    assert.equal(await bq.cardTitle(), '金槌');
    assert.deepEqual(await bq.cardButtons(), ['棚へ戻す']);
    const bcb = await bp.locator('#card').boundingBox(), bha = await bq.at(bh);
    assert.ok(Math.abs(bcb.x + bcb.width / 2 - bha.x) < 120 && bcb.y > bha.y && bcb.y - bha.y < 60, 'カードは金槌のそば');
    await bshot('hammer-card');
    await bp.click('#card button');
    assert.equal(await bq.outfit(), '盾だけ', '金槌だけ外れて盾は残る');
    assert.equal(await bwhere('hammer'), '棚にあります');
    for (const v of ['front', 'back']) await bpose('shield', v);
    log('背面で金槌をクリック → そばのカード → 棚へ戻す → 盾だけ');

    // 8姿の頭頂・足裏・頭の中心が揃い、はみ出さない
    console.log('  ブロム描画後の実測', JSON.stringify(bposes));
    assert.equal(Object.keys(bposes).length, 8);
    for (const [k, r] of Object.entries(bposes)) {
      assert.ok(Math.abs(r.top - B.BROM_TOP) <= 2, `${k} 頭頂 ${r.top}`);
      assert.ok(Math.abs(r.foot - B.BROM_FOOT) <= 2, `${k} 足裏 ${r.foot}`);
      assert.ok(Math.abs(r.headX - B.BROM_X) <= 3, `${k} 頭の中心 ${r.headX}`);
      assert.ok(r.left > 0 && r.right < W.WIDTH - 1, `${k} 左右 ${r.left}-${r.right}`);
    }
    log('8姿の頭頂・足裏・頭の中心が揃う・左右はみ出しなし');

    // 正面で盾を押す → 棚へ戻す → 取り消し2回で 盾だけ → 金槌と盾
    await bp.click('.turn [data-view="front"]');
    await bq.clickOn(B.itemPoint({ shield: true }, 'front', 'shield'));
    assert.equal(await bq.cardTitle(), '盾');
    await bp.click('#card button');
    assert.equal(await bq.outfit(), '素手');
    assert.ok(await bp.isHidden('#open-hammer') && await bp.isHidden('#open-shield'));
    await bp.click('#undo');
    assert.equal(await bq.outfit(), '盾だけ');
    await bp.keyboard.press('Meta+z');
    assert.equal(await bq.outfit(), '金槌と盾', '取り消しで金槌が戻る');
    log('盾をクリック → 棚へ戻す → 取り消しで 盾だけ → 金槌と盾');

    // キーボードだけ：盾を整える → 棚へ戻す、棚の盾に Enter で着け直す
    await bp.focus('#open-shield');
    await bp.keyboard.press('Enter');
    assert.equal(await bq.cardTitle(), '盾');
    assert.equal(await bp.evaluate(() => document.activeElement.closest('#card') !== null), true, 'カードへフォーカス');
    await bp.keyboard.press('Enter');
    assert.equal(await bq.outfit(), '金槌だけ');
    assert.ok(await bp.isHidden('#open-shield'));
    assert.equal(await bp.evaluate(() => document.activeElement.id), 'stage', '入口が消えたらフォーカスは台へ');
    await bp.focus('#open-hammer');
    await bp.keyboard.press('Enter');
    assert.equal(await bq.cardTitle(), '金槌');
    await bp.keyboard.press('Escape');
    assert.ok(!(await bq.cardOpen()));
    assert.equal(await bp.evaluate(() => document.activeElement.id), 'open-hammer');
    await bp.focus('.slot[data-item="shield"] .item');
    await bp.keyboard.press('Enter');
    assert.equal(await bq.outfit(), '金槌と盾');
    await bq.canvas.focus();
    await bp.keyboard.press('ArrowRight');
    assert.match(await bq.hint(), /位置は動かしません/);
    assert.equal(await bq.outfit(), '金槌と盾', '矢印キーでは何も変わらない');
    log('キーボードで盾を外して着け直す・矢印キーは何も動かさない');

    // 舞台袖
    await bp.click('#wings');
    assert.ok(await bp.$eval('#wings-dialog', (d) => d.open));
    await bshot('wings');
    await bp.click('#wings-dialog button');

    // 俳優ごとの身支度と取り消しの独立
    await bp.click('.cast [data-actor="gareth"]');
    assert.equal(await bq.outfit(), '抜刀', 'ガレスはそのまま');
    assert.deepEqual(await bvisible(), ['sword', 'scabbard']);
    await bp.click('.cast [data-actor="maren"]');
    assert.equal(await bq.outfit(), '杖を手に', 'マレンはそのまま');
    await bp.click('#undo');
    assert.equal(await bq.outfit(), '何も持たない', 'マレンの取り消しはマレンの操作だけ');
    await bp.click('.cast [data-actor="brom"]');
    assert.equal(await bq.outfit(), '金槌と盾', 'ブロムはそのまま');
    await bp.click('#undo');
    assert.equal(await bq.outfit(), '金槌だけ', 'ブロムの取り消しはブロムの操作だけ');
    await bp.click('.cast [data-actor="gareth"]');
    await bp.click('#undo');
    assert.equal(await bq.outfit(), '剣を手に（鞘なし）', 'ガレスの取り消しはガレスの操作だけ');
    await bp.click('.cast [data-actor="brom"]');
    assert.equal(await bq.outfit(), '金槌だけ');
    // 他の俳優の品はドロップしても受け取らない
    await bp.evaluate(() => {
      const dt = new DataTransfer(); dt.setData('text/plain', 'sword');
      document.getElementById('stage').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
    });
    assert.equal(await bq.outfit(), '金槌だけ', '剣は受け取らない');
    await bp.close();
    log('3人を切り替えても各自の身支度を保持・取り消しは俳優ごと・他人の品は受け取らない');

    // 390px
    const bm = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const bmq = tools(bm);
    await bm.tap('.cast [data-actor="brom"]');
    assert.ok(await bmq.noOverflow(), '390px でブロムもあふれない');
    await bm.tap('.slot[data-item="hammer"] .item');
    await bm.tap('.slot[data-item="shield"] .item');
    assert.equal(await bmq.outfit(), '金槌と盾');
    assert.ok(await bmq.noOverflow(), '両方着けてもあふれない');
    await bm.screenshot({ path: path.join(shots, 'brom-390-both.png'), fullPage: true });
    await bmq.canvas.scrollIntoViewIfNeeded();
    const bs = await bmq.at(B.itemPoint({ hammer: true, shield: true }, 'front', 'shield'));
    await bm.touchscreen.tap(bs.x, bs.y);
    assert.ok(await bmq.cardOpen());
    assert.equal(await bmq.cardTitle(), '盾');
    const bmc = await bm.locator('#card').boundingBox();
    assert.ok(bmc.x >= 0 && bmc.x + bmc.width <= 390, `カードが画面内 ${JSON.stringify(bmc)}`);
    assert.ok(await bmq.noOverflow(), 'カードを開いてもあふれない');
    await bm.screenshot({ path: path.join(shots, 'brom-390-card.png'), fullPage: true });
    await bm.tap('#card button');
    assert.equal(await bmq.outfit(), '金槌だけ');
    await bm.tap('#wings');
    const bwd = await bm.locator('#wings-dialog').boundingBox();
    assert.ok(bwd.x >= 0 && bwd.x + bwd.width <= 390, `舞台袖が画面内 ${JSON.stringify(bwd)}`);
    await bm.screenshot({ path: path.join(shots, 'brom-390-wings.png'), fullPage: true });
    await bm.close();
    log('390px：ブロムの切替・タップで着ける・盾のカード・舞台袖・あふれなし');

    // ── ブロムの手斧：右手は金槌／手斧／空のどれか。盾は右手と独立 ──
    const xp = await open({ viewport: { width: 1440, height: 960 } });
    const xq = tools(xp);
    const xshot = (name) => xp.screenshot({ path: path.join(shots, `brom-axe-grip-${name}.png`), fullPage: true });
    const xwhere = (item) => xp.textContent(`.slot[data-item="${item}"] .where`);
    const alpha = (p) => xp.evaluate(({ x, y }) => document.getElementById('stage').getContext('2d').getImageData(x, y, 1, 1).data[3], { x: Math.round(p.x), y: Math.round(p.y) });
    const pt = (st, v, item) => B.itemPoint(st, v, item);
    // 台（キャンバス）だけの画像と、右手のまわりの拡大。金槌と手斧を同じ viewport・同じ範囲で撮る
    const HAND_BOX = 150;   // 手の点から上下左右に取る範囲（キャンバスpx）
    const compare = async (name, st, item, v) => {
      await xq.canvas.screenshot({ path: path.join(shots, `brom-axe-grip-compare-${name}-${v}.png`) });
      const b = await xq.canvas.boundingBox(), p = pt(st, v, item), k = b.width / W.WIDTH;
      await xp.screenshot({ path: path.join(shots, `brom-axe-grip-compare-${name}-${v}-hand.png`),
        clip: { x: b.x + (p.x - HAND_BOX) * k, y: b.y + (p.y - HAND_BOX) * k, width: 2 * HAND_BOX * k, height: 2 * HAND_BOX * k } });
    };
    await xp.click('.slot[data-item="sword"] .item');                 // ガレスは剣を手に
    await xp.click('.cast [data-actor="brom"]');
    assert.doesNotMatch(await xp.textContent('.shelf-items[data-actor="brom"]'), /盾なし/, '旧制限の文言は棚に無い');
    assert.doesNotMatch(await xp.getAttribute('#stage', 'aria-label'), /盾なし/);

    // 比較用：金槌だけの前後（既存の姿）
    await xp.click('.slot[data-item="hammer"] .item');
    for (const v of ['front', 'back']) { await xp.click(`.turn [data-view="${v}"]`); await compare('hammer', { hammer: true }, 'hammer', v); }
    await xp.click('.turn [data-view="front"]');
    await xp.click('.slot[data-item="shield"] .item');
    assert.equal(await xq.outfit(), '金槌と盾');
    // 操作の前：手斧を持たせると金槌だけ棚へ戻ると棚で示す（盾は残る）
    assert.equal(await xwhere('axe'), '棚にあります（着けると金槌は棚へ）');

    // ドラッグで手斧 → 金槌は棚へ・盾はそのまま
    await xp.locator('.slot[data-item="axe"] .item').dragTo(xq.canvas, { targetPosition: await (async () => {
      const b = await xq.canvas.boundingBox(), q = await xq.at(pt({ axe: true, shield: true }, 'front', 'axe')); return { x: q.x - b.x, y: q.y - b.y };
    })() });
    assert.equal(await xq.outfit(), '手斧と盾');
    assert.match(await xq.hint(), /手斧に持ち替えました（金槌は棚へ）/);
    assert.equal(await xwhere('axe'), 'ブロムの右手に');
    assert.equal(await xwhere('shield'), 'ブロムの左腕に');
    assert.equal(await xwhere('hammer'), '棚にあります（着けると手斧は棚へ）');
    assert.ok(await xp.isVisible('#open-axe') && await xp.isVisible('#open-shield') && await xp.isHidden('#open-hammer'));
    log('金槌と盾に手斧をドラッグ → 手斧と盾（金槌だけ棚へ・盾はそのまま）');

    // 12姿の残り4姿（手斧と盾・手斧だけ）を描画して実測。頭頂・足裏・頭の中心は他の8姿と同じ BROM_X
    const xposes = {};
    const xpose = async (key, st, v) => {
      await xp.click(`.turn [data-view="${v}"]`);
      xposes[`${key}-${v}`] = await measureFigure(xp, B.BROM_X);
      assert.ok(await alpha(pt(st, v, 'axe')) >= 128, `${key}-${v} 手斧の握りの位置に絵がある`);
      if (st.shield) assert.ok(await alpha(pt(st, v, 'shield')) >= 128, `${key}-${v} 盾の位置に絵がある`);
    };
    const AS = { axe: true, shield: true }, AO = { axe: true };
    for (const v of ['front', 'back']) { await xpose('axeShield', AS, v); await xshot(`shield-${v}`); }

    // 両道具の近接カード：背面で手斧 → 手斧のカード、盾 → 盾のカード
    for (const item of ['axe', 'shield']) {
      await xq.clickOn(pt(AS, 'back', item));
      assert.ok(await xq.cardOpen());
      assert.equal(await xq.cardTitle(), { axe: '手斧', shield: '盾' }[item]);
      assert.deepEqual(await xq.cardButtons(), ['棚へ戻す']);
      const cb = await xp.locator('#card').boundingBox(), h = await xq.at(pt(AS, 'back', item));
      assert.ok(Math.abs(cb.x + cb.width / 2 - h.x) < 120 && cb.y > h.y && cb.y - h.y < 60, `カードは${item}のそば`);
      await xp.keyboard.press('Escape');
    }
    // 盾だけ外す → 手斧だけ（手斧は残る）→ 取り消し
    await xq.clickOn(pt(AS, 'back', 'shield'));
    await xp.click('#card button');
    assert.equal(await xq.outfit(), '手斧だけ', '盾を外しても手斧は残る');
    assert.ok(await xp.isVisible('#open-axe') && await xp.isHidden('#open-shield'));
    for (const v of ['back', 'front']) await xpose('axe', AO, v);
    for (const v of ['front', 'back']) { await xp.click(`.turn [data-view="${v}"]`); await xshot(v); await compare('axe', AO, 'axe', v); }
    await xp.click('#undo');
    assert.equal(await xq.outfit(), '手斧と盾', '取り消しで盾が戻る');
    // 手斧だけ棚へ → 盾だけ → 取り消し
    await xq.clickOn(pt(AS, 'back', 'axe'));
    await xp.click('#card button');
    assert.equal(await xq.outfit(), '盾だけ', '手斧を棚へ戻しても盾は残る');
    await xp.keyboard.press('Meta+z');
    assert.equal(await xq.outfit(), '手斧と盾');
    log('手斧と盾：両道具のそばにカード・盾だけ外す/手斧だけ戻す・取り消し');

    console.log('  手斧4姿の描画後の実測', JSON.stringify(xposes));
    assert.equal(Object.keys(xposes).length, 4);
    for (const [k, r] of Object.entries(xposes)) {
      assert.ok(Math.abs(r.top - B.BROM_TOP) <= 2, `${k} 頭頂 ${r.top}`);
      assert.ok(Math.abs(r.foot - B.BROM_FOOT) <= 2, `${k} 足裏 ${r.foot}`);
      assert.ok(Math.abs(r.headX - B.BROM_X) <= 3, `${k} 頭の中心 ${r.headX}`);
      assert.ok(r.left > 0 && r.right < W.WIDTH - 1, `${k} 左右 ${r.left}-${r.right}`);
    }
    // 右手の道具は正面で画面左・背面で画面右（反転なし）
    for (const st of [AS, AO]) assert.ok(pt(st, 'front', 'axe').x < B.BROM_X && pt(st, 'back', 'axe').x > B.BROM_X);
    log('手斧4姿：頭頂・足裏・頭の中心が他の8姿と揃う・はみ出しなし・握りは金槌と同じ右手側');

    // 持ち替え：手斧と盾 → 金槌（盾はそのまま）→ 手斧（盾はそのまま）
    await xp.click('.turn [data-view="front"]');
    await xp.click('.slot[data-item="hammer"] .item');
    assert.equal(await xq.outfit(), '金槌と盾', '手斧→金槌でも盾はそのまま');
    assert.match(await xq.hint(), /金槌に持ち替えました（手斧は棚へ）/);
    assert.equal(await xwhere('shield'), 'ブロムの左腕に');
    await xp.click('.slot[data-item="axe"] .item');
    assert.equal(await xq.outfit(), '手斧と盾');
    // 手斧だけのときに盾を着けても手斧は残る
    await xp.focus('#open-shield');
    await xp.keyboard.press('Enter');
    assert.equal(await xq.cardTitle(), '盾');
    await xp.keyboard.press('Enter');
    assert.equal(await xq.outfit(), '手斧だけ');
    await xp.focus('.slot[data-item="shield"] .item');
    await xp.keyboard.press('Enter');
    assert.equal(await xq.outfit(), '手斧と盾', '手斧中に盾を着けても手斧は持ったまま');
    assert.match(await xq.hint(), /ブロムの左腕に盾を着けました/);
    log('持ち替え：手斧と盾→金槌と盾→手斧と盾・キーボードで盾を外して着け直しても手斧は保持');

    // キーボードだけ：手斧を整える → カード → Esc で入口へ → Enter で棚へ戻す → 取り消し
    await xp.focus('#open-axe');
    await xp.keyboard.press('Enter');
    assert.equal(await xq.cardTitle(), '手斧');
    assert.equal(await xp.evaluate(() => document.activeElement.closest('#card') !== null), true, 'カードへフォーカス');
    await xp.keyboard.press('Escape');
    assert.equal(await xp.evaluate(() => document.activeElement.id), 'open-axe');
    await xp.keyboard.press('Enter');
    await xp.keyboard.press('Enter');
    assert.equal(await xq.outfit(), '盾だけ');
    assert.equal(await xp.evaluate(() => document.activeElement.id), 'stage', '入口が消えたらフォーカスは台へ');
    await xp.keyboard.press('Meta+z');
    assert.equal(await xq.outfit(), '手斧と盾');
    log('キーボード：手斧を整える → 同じカード → 棚へ戻す・取り消し');

    // 舞台袖：手斧と盾の前後
    await xp.click('#wings');
    assert.ok(await xp.$eval('#wings-dialog', (d) => d.open));
    await xshot('wings');
    await xp.click('#wings-dialog button');

    // 俳優を切り替えても保持・取り消しは俳優ごと（ガレス・マレンの回帰）
    await xp.click('.cast [data-actor="gareth"]');
    assert.equal(await xq.outfit(), '剣を手に（鞘なし）', 'ガレスはそのまま');
    assert.ok(await xp.isHidden('#open-axe'));
    await xp.click('.cast [data-actor="maren"]');
    assert.equal(await xq.outfit(), '何も持たない');
    await xp.click('.slot[data-item="lantern"] .item');
    assert.equal(await xq.outfit(), 'ランタンを手に');
    await xp.click('.cast [data-actor="brom"]');
    assert.equal(await xq.outfit(), '手斧と盾', '切り替えて戻っても手斧と盾のまま');
    await xp.click('#undo');
    assert.equal(await xq.outfit(), '手斧だけ', 'ブロムの取り消しはブロムの操作（直前に着けた盾が外れる）');
    await xp.click('.cast [data-actor="maren"]');
    assert.equal(await xq.outfit(), 'ランタンを手に', 'ブロムの取り消しはマレンを変えない');
    await xp.click('.cast [data-actor="gareth"]');
    assert.equal(await xq.outfit(), '剣を手に（鞘なし）', 'ブロムの取り消しはガレスを変えない');
    await xp.close();
    log('舞台袖・俳優の切替で手斧と盾を保持・取り消しは俳優ごと（ガレス・マレンは不変）');

    // 390px
    const xm = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const xmq = tools(xm);
    await xm.tap('.cast [data-actor="brom"]');
    await xm.tap('.slot[data-item="shield"] .item');
    await xm.tap('.slot[data-item="axe"] .item');
    assert.equal(await xmq.outfit(), '手斧と盾');
    assert.ok(await xmq.noOverflow(), '390px で手斧と盾を持ってもあふれない');
    await xm.screenshot({ path: path.join(shots, 'brom-axe-grip-390.png'), fullPage: true });
    await xmq.canvas.scrollIntoViewIfNeeded();
    for (const item of ['axe', 'shield']) {
      const q = await xmq.at(pt(AS, 'front', item));
      await xm.touchscreen.tap(q.x, q.y);
      assert.ok(await xmq.cardOpen());
      assert.equal(await xmq.cardTitle(), { axe: '手斧', shield: '盾' }[item]);
      const mc = await xm.locator('#card').boundingBox();
      assert.ok(mc.x >= 0 && mc.x + mc.width <= 390, `${item} のカードが画面内 ${JSON.stringify(mc)}`);
      assert.ok(await xmq.noOverflow(), 'カードを開いてもあふれない');
      await xm.keyboard.press('Escape');
    }
    await xm.tap('#open-axe');
    await xm.tap('#card button');
    assert.equal(await xmq.outfit(), '盾だけ');
    await xm.close();
    log('390px：手斧と盾をタップで持つ・両道具のカードが画面内・あふれなし');

    assert.deepEqual(errors, []);
    log('コンソールエラーなし');
    console.log('standee-workshop browser-check: ok');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
