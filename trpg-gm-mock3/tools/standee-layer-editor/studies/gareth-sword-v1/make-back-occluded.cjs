// 背面の素体から人物の左腕（画面左）を切り出し、hand層に載せて鞘の手前へ重ねる候補を作ります。
// 生成はしません。元のbody画像を原寸のまま多角形で切り抜くだけです。
// 実行: node make-back-occluded.cjs （node 24、mock2のplaywrightを使用）
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('../../../../../trpg-gm-mock2/node_modules/playwright');
const C = require('../../core.js');

const dir = __dirname;
const SRC = path.join(dir, 'state-sheathed-back-aligned.json');
const OUT = path.join(dir, 'state-sheathed-back-occluded.json');
const CLIP = [[80, 390], [246, 390], [238, 438], [221, 493], [197, 554], [178, 601], [186, 658], [180, 682], [83, 685]];

(async () => {
  const srcText = fs.readFileSync(SRC, 'utf8');
  const old = C.parseProject(srcText);
  const body = old.views.back.layers.body.image;
  assert.ok(body, '背面bodyに画像がない');
  assert.ok(!fs.existsSync(OUT), '出力が既にある（上書きしない）');

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const r = await page.evaluate(async ({ body, clip, W, H }) => {
    const im = new Image(); im.src = body; await im.decode();
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.beginPath(); clip.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
    ctx.clip();
    ctx.drawImage(im, 0, 0);
    const url = c.toDataURL('image/png');
    // 検査: 作ったPNGを読み戻し、元bodyと画素を比べる。
    const back = new Image(); back.src = url; await back.decode();
    const read = (img) => { const k = document.createElement('canvas'); k.width = W; k.height = H; const g = k.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, W, H).data; };
    const a = read(back), b = read(im);
    const inPoly = (x, y) => { let s = false; for (let i = 0, j = clip.length - 1; i < clip.length; j = i++) { const [xi, yi] = clip[i], [xj, yj] = clip[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) s = !s; } return s; };
    let full = 0, fullSame = 0, outsideOpaque = 0, srcTransparentButHandOpaque = 0, visible = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (a[i + 3]) visible++;
      // 縁のアンチエイリアスを避け、多角形の内側1px以上の画素だけを完全一致で比べる。
      const inside = inPoly(x + 0.5, y + 0.5) && inPoly(x - 0.5, y + 0.5) && inPoly(x + 1.5, y + 0.5) && inPoly(x + 0.5, y - 0.5) && inPoly(x + 0.5, y + 1.5);
      const near = inPoly(x + 0.5, y + 0.5) || inPoly(x - 0.5, y + 0.5) || inPoly(x + 1.5, y + 0.5) || inPoly(x + 0.5, y - 0.5) || inPoly(x + 0.5, y + 1.5);
      if (inside) { full++; if (a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2] && a[i + 3] === b[i + 3]) fullSame++; }
      else if (!near && a[i + 3]) outsideOpaque++;
      if (a[i + 3] && !b[i + 3]) srcTransparentButHandOpaque++;
    }
    return { url, w: im.naturalWidth, h: im.naturalHeight, full, fullSame, outsideOpaque, srcTransparentButHandOpaque, visible };
  }, { body, clip: CLIP, W: C.WIDTH, H: C.HEIGHT });
  await browser.close();

  const next = JSON.parse(srcText);
  next.source = 'ガレス：納刀＋背面で左腕を鞘の手前へ重ねる（比較候補・未採用）';
  next.views.back.layers.hand = { image: r.url, visible: true, x: 0, y: 0, rotation: 0, scale: 1 };
  const text = JSON.stringify(next);
  const p = C.parseProject(text);

  assert.deepStrictEqual(errors, []);
  assert.strictEqual(r.w, C.WIDTH); assert.strictEqual(r.h, C.HEIGHT);
  assert.ok(r.full > 0 && r.fullSame === r.full, `内側の画素が元と一致しない ${r.fullSame}/${r.full}`);
  assert.strictEqual(r.outsideOpaque, 0, '多角形の外に色がある');
  assert.strictEqual(r.srcTransparentButHandOpaque, 0, '元が透明な所に色がある');
  assert.deepStrictEqual(p.views.front, old.views.front, 'frontが変わった');
  assert.deepStrictEqual(p.views.back.layers.body, old.views.back.layers.body, 'back.bodyが変わった');
  assert.deepStrictEqual(p.views.back.layers.fore, old.views.back.layers.fore, 'back.foreが変わった');
  assert.deepStrictEqual(p.views.back.layers.rear, old.views.back.layers.rear);
  assert.deepStrictEqual({ ...p.views.back, layers: null }, { ...old.views.back, layers: null }, 'masks/anchor/frameが変わった');
  assert.deepStrictEqual(p.prompt, old.prompt);
  assert.strictEqual(old.views.back.layers.hand.image, null);
  assert.deepStrictEqual({ ...p.views.back.layers.hand, image: null }, { image: null, visible: true, x: 0, y: 0, rotation: 0, scale: 1 });

  fs.writeFileSync(OUT, text);
  console.log(JSON.stringify({ ...r, url: `${r.url.length} chars` }));
  console.log('OK', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
