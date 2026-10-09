// マレン元絵の頭頂・足裏・頭の中心を測る。画像は読むだけで書き換えない。
//   node measure-maren.cjs          → 6姿の測定値（wardrobe.js の MAREN_SRC はこの出力の写し）
//   node measure-maren.cjs --rows   → 頭の列範囲を決めるための、上端付近の不透明区間
const fs = require('fs'), path = require('path');
const { chromium } = require(path.resolve(__dirname, '../trpg-gm-mock2/node_modules/playwright'));

const A_MIN = 128;   // これ以上の不透明度を人物とみなす（元絵の縁のにじみは数えない）
const DIR = path.join(__dirname, 'assets/maren/');
// crop：1枚に正面・背面が並ぶ元絵の切り出し範囲。head：頭頂を探す列の範囲（杖の先・ランタンを除くため。--rows の出力から決めた）
const POSES = {
  'empty-front': { file: 'maren-empty-review.png', crop: [73, 629], head: [300, 500] },
  'empty-back': { file: 'maren-empty-review.png', crop: [683, 1243], head: [820, 1010] },
  'lantern-front': { file: 'maren-lantern-review.png', crop: [140, 644], head: [330, 540] },
  'lantern-back': { file: 'maren-lantern-review.png', crop: [682, 1181], head: [790, 990] },
  'staff-front': { file: 'staff-front-source.png', crop: null, head: [300, 520] },
  'staff-back': { file: 'staff-back-source.png', crop: null, head: [200, 460] },
};

(async () => {
  const b = await chromium.launch(), p = await b.newPage();
  const rows = process.argv.includes('--rows');
  const files = [...new Set(Object.values(POSES).map((q) => q.file))];
  for (const f of files) {
    const res = await p.evaluate(async ([src, A_MIN, poses, rows]) => {
      const img = new Image(); img.src = src; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data, W = c.width, H = c.height;
      const on = (x, y) => d[(y * W + x) * 4 + 3] >= A_MIN;
      // 列の切れ目（1枚に2体並ぶ元絵の境目）
      const col = new Array(W).fill(0);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (on(x, y)) col[x]++;
      const gaps = []; let s = -1;
      col.forEach((v, x) => { if (v <= 2) { if (s < 0) s = x; } else if (s >= 0) { gaps.push([s, x - 1]); s = -1; } });
      if (s >= 0) gaps.push([s, W - 1]);
      const out = { size: [W, H], gaps: gaps.filter((q) => q[1] - q[0] > 3), poses: {} };
      for (const [name, q] of poses) {
        const [x0, x1] = q.crop || [0, W - 1];
        let top = H, bottom = -1, left = W, right = -1;
        for (let y = 0; y < H; y++) for (let x = x0; x <= x1; x++) if (on(x, y)) {
          if (y < top) top = y; if (y > bottom) bottom = y; if (x < left) left = x; if (x > right) right = x;
        }
        const r = { bbox: [left, top, right, bottom] };
        if (rows) {
          r.rows = [];
          for (let y = top; y < top + 260 && y < H; y += 10) {
            const runs = []; let a = -1;
            for (let x = x0; x <= x1 + 1; x++) { const v = x <= x1 && on(x, y); if (v && a < 0) a = x; if (!v && a >= 0) { if (x - a > 3) runs.push(a + '-' + (x - 1)); a = -1; } }
            r.rows.push(y + ': ' + runs.join(' '));
          }
        }
        if (q.head) {
          // 頭頂：頭の列範囲で最初に不透明になる行。頭の中心：頭頂から60px下までの不透明画素の平均x
          let ht = H;
          for (let y = 0; y < H && ht === H; y++) for (let x = q.head[0]; x <= q.head[1]; x++) if (on(x, y)) { ht = y; break; }
          let sx = 0, n = 0;
          for (let y = ht; y < ht + 60; y++) for (let x = q.head[0]; x <= q.head[1]; x++) if (on(x, y)) { sx += x; n++; }
          r.headTop = ht; r.headX = Math.round(sx / n); r.footY = bottom; r.height = bottom - ht;
        }
        out.poses[name] = r;
      }
      return out;
    }, ['data:image/png;base64,' + fs.readFileSync(DIR + f).toString('base64'), A_MIN, Object.entries(POSES).filter(([, q]) => q.file === f), rows]);
    console.log(f, JSON.stringify(res.size), 'gaps', JSON.stringify(res.gaps));
    for (const [name, r] of Object.entries(res.poses)) {
      console.log(' ', name, 'bbox', JSON.stringify(r.bbox), r.headTop !== undefined ? `headTop ${r.headTop} headX ${r.headX} footY ${r.footY} height ${r.height}` : '');
      if (r.rows) for (const line of r.rows) console.log('    ' + line);
    }
  }
  // 首飾り：全体の範囲と、宝石（鎖の下に垂れる部分）の中心。wardrobe.js の NECKLACE はこの出力の写し
  const nk = await p.evaluate(async ([src, A_MIN]) => {
    const img = new Image(); img.src = src; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data, W = c.width, H = c.height;
    const on = (x, y) => d[(y * W + x) * 4 + 3] >= A_MIN;
    let t = H, bt = -1, l = W, r = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (on(x, y)) { t = Math.min(t, y); bt = y; l = Math.min(l, x); r = Math.max(r, x); }
    // 宝石：中央の列で、鎖より下にある不透明画素の範囲
    let pt = H, pb = -1, pl = W, pr = -1;
    for (let y = Math.round(H * 0.72); y < H; y++) for (let x = Math.round(W * 0.4); x < W * 0.6; x++) if (on(x, y)) { pt = Math.min(pt, y); pb = y; pl = Math.min(pl, x); pr = Math.max(pr, x); }
    return { size: [W, H], bbox: [l, t, r, bt], pendant: [pl, pt, pr, pb], pendantCenter: [Math.round((pl + pr) / 2), Math.round((pt + pb) / 2)] };
  }, ['data:image/png;base64,' + fs.readFileSync(path.join(__dirname, 'assets/accessories/amber-necklace-v1.png')).toString('base64'), A_MIN]);
  console.log('amber-necklace-v1.png', JSON.stringify(nk));
  await b.close();
})();
