// 背面の鞘をベルトへつなぐ吊り革を、背面fore画像へcanvasの図形で描き足す候補を作ります。
// 生成AIは使いません。人物・腕・手・鞘の位置は動かしません。吊り革はfore層なので、hand層の腕が手前で遮ります。
// 実行: node make-back-belt.cjs （node 24、mock2のplaywrightを使用）
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('../../../../../trpg-gm-mock2/node_modules/playwright');
const C = require('../../core.js');

const dir = __dirname;
const SRC = path.join(dir, 'state-sheathed-back-occluded.json');
const OUT = path.join(dir, 'state-sheathed-back-belt.json');
// 表示座標。fore層は x=-24 で置かれているので、画像内へは x+24 で描きます。
const STRAP = [[250, 505], [263, 507], [212, 567], [198, 561]];
const RIVET = { x: 256, y: 510, r: 3 };

(async () => {
  const srcText = fs.readFileSync(SRC, 'utf8');
  const old = C.parseProject(srcText);
  const fore = old.views.back.layers.fore;
  assert.ok(fore.image, '背面foreに画像がない');
  assert.strictEqual(fore.x, -24); assert.strictEqual(fore.y, 0); assert.strictEqual(fore.rotation, 0); assert.strictEqual(fore.scale, 1);
  assert.ok(!fs.existsSync(OUT), '出力が既にある（上書きしない）');
  const dx = -fore.x;

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const r = await page.evaluate(async ({ src, hand, strap, rivet, DX, W, H }) => {
    const load = async (u) => { const im = new Image(); im.src = u; await im.decode(); return im; };
    const im = await load(src);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.drawImage(im, 0, 0);
    // 吊り革の本体と縁
    ctx.beginPath(); strap.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
    ctx.fillStyle = '#68412b'; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = '#b38a5b'; ctx.stroke();
    // 中央の細い陰影（上辺の中点から下辺の中点へ）
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const [t, b] = [mid(strap[0], strap[1]), mid(strap[2], strap[3])];
    ctx.beginPath(); ctx.moveTo(t[0], t[1] + 3); ctx.lineTo(b[0], b[1] - 2);
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(40,24,15,0.55)'; ctx.stroke();
    // 基部の真鍮留め具
    ctx.beginPath(); ctx.arc(rivet.x, rivet.y, rivet.r, 0, Math.PI * 2);
    ctx.fillStyle = '#c9a24a'; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = '#6e5222'; ctx.stroke();
    const url = c.toDataURL('image/png');

    // 検査: 読み戻した画像と元画像を全画素で比べ、変わった画素が吊り革と留め具の範囲(縁1.5px込み)に収まるか見る。
    const read = (img) => { const k = document.createElement('canvas'); k.width = W; k.height = H; const g = k.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, W, H).data; };
    const back = await load(url), handIm = hand && await load(hand);
    const a = read(back), o = read(im), h = handIm ? read(handIm) : null;
    const segDist = (px, py, [x1, y1], [x2, y2]) => { const vx = x2 - x1, vy = y2 - y1, k = Math.max(0, Math.min(1, ((px - x1) * vx + (py - y1) * vy) / (vx * vx + vy * vy))); return Math.hypot(px - x1 - k * vx, py - y1 - k * vy); };
    const inPoly = (x, y) => { let s = false; for (let i = 0, j = strap.length - 1; i < strap.length; j = i++) { const [xi, yi] = strap[i], [xj, yj] = strap[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) s = !s; } return s; };
    const nearStrap = (x, y) => inPoly(x, y) || strap.some((p, i) => segDist(x, y, p, strap[(i + 1) % strap.length]) <= 1.5);
    const nearRivet = (x, y) => Math.hypot(x - rivet.x, y - rivet.y) <= rivet.r + 1.5;
    let changed = 0, outside = 0, minX = W, minY = H, maxX = -1, maxY = -1, coveredByHand = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (a[i] === o[i] && a[i + 1] === o[i + 1] && a[i + 2] === o[i + 2] && a[i + 3] === o[i + 3]) continue;
      changed++;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      if (!nearStrap(x + 0.5, y + 0.5) && !nearRivet(x + 0.5, y + 0.5)) outside++;
      // hand層は x=0 なので、fore画像の x は表示上 x-24。そこにhandの不透明画素があれば腕が遮っている。
      const hx = x - DX; if (h && hx >= 0 && h[(y * W + hx) * 4 + 3] === 255) coveredByHand++;
    }
    return { url, w: back.naturalWidth, h: back.naturalHeight, changed, outside, bbox: [minX, minY, maxX, maxY], coveredByHand };
  }, {
    src: fore.image, hand: old.views.back.layers.hand.image,
    strap: STRAP.map(([x, y]) => [x + dx, y]), rivet: { ...RIVET, x: RIVET.x + dx }, DX: dx, W: C.WIDTH, H: C.HEIGHT,
  });
  await browser.close();

  const next = JSON.parse(srcText);
  next.source = 'ガレス：納刀＋背面の鞘をベルトへつなぐ吊り革を足す（比較候補・未採用）';
  next.views.back.layers.fore.image = r.url;
  const text = JSON.stringify(next);
  const p = C.parseProject(text);

  assert.deepStrictEqual(errors, []);
  assert.strictEqual(r.w, C.WIDTH); assert.strictEqual(r.h, C.HEIGHT);
  assert.ok(r.changed > 0, '何も描かれていない');
  assert.strictEqual(r.outside, 0, '吊り革と留め具の外で画素が変わった');
  assert.deepStrictEqual(p.views.front, old.views.front, 'frontが変わった');
  for (const id of ['rear', 'body', 'hand']) assert.deepStrictEqual(p.views.back.layers[id], old.views.back.layers[id], `back.${id}が変わった`);
  assert.deepStrictEqual({ ...p.views.back.layers.fore, image: null }, { ...old.views.back.layers.fore, image: null }, 'back.foreの位置が変わった');
  assert.notStrictEqual(p.views.back.layers.fore.image, old.views.back.layers.fore.image);
  assert.deepStrictEqual({ ...p.views.back, layers: null }, { ...old.views.back, layers: null }, 'masks/anchor/frameが変わった');
  assert.deepStrictEqual({ ...p, views: null, source: null }, { ...old, views: null, source: null }, 'source以外の上位項目が変わった');

  fs.writeFileSync(OUT, text);
  console.log(JSON.stringify({ ...r, url: `${r.url.length} chars` }));
  console.log('OK', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
