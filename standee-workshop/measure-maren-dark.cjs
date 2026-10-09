// 黒の旅装の元絵を測る。sharp で画素を読むだけで、画像は書き換えない。測り方は measure-maren.cjs と同じ。
//   node measure-maren-dark.cjs          → 測定値（wardrobe.js の MAREN_DARK_SRC はこの出力の写し）
//   node measure-maren-dark.cjs --rows   → 頭の列範囲・手首・首を決めるための、行ごとの不透明区間
const path = require('path');
const sharp = require(path.resolve(__dirname, '../trpg-gm-mock2/node_modules/sharp'));

const A_MIN = 128;   // これ以上の不透明度を人物とみなす（measure-maren.cjs と同じ）
const DIR = path.join(__dirname, 'assets/maren/');
const FILES = ['dark-empty-v1.png', 'dark-staff-v1.png', 'dark-lantern-v1.png'];
// crop：1枚に正面・背面が並ぶ元絵の切り出し範囲。head：頭頂を探す列の範囲。--rows の出力から決める
// crop の境は列の切れ目の中間（empty 590–668→629、staff 604–651→628、lantern 606–668→637）。head は杖の先・ランタンを除く
const POSES = {
  'empty-front': { file: 'dark-empty-v1.png', crop: [0, 628], head: [260, 460] },
  'empty-back': { file: 'dark-empty-v1.png', crop: [629, 1253], head: [800, 1010] },
  'staff-front': { file: 'dark-staff-v1.png', crop: [0, 627], head: [270, 480] },
  'staff-back': { file: 'dark-staff-v1.png', crop: [628, 1253], head: [770, 1000] },
  'lantern-front': { file: 'dark-lantern-v1.png', crop: [0, 636], head: [280, 500] },
  'lantern-back': { file: 'dark-lantern-v1.png', crop: [637, 1253], head: [790, 1010] },
};

(async () => {
  const rows = process.argv.includes('--rows');
  for (const f of FILES) {
    const { data: d, info } = await sharp(DIR + f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height, C = info.channels;
    const on = (x, y) => d[(y * W + x) * C + 3] >= A_MIN;
    let a0 = 0;
    for (let i = 3; i < d.length; i += C) if (d[i] === 0) a0++;
    const col = new Array(W).fill(0);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (on(x, y)) col[x]++;
    const gaps = []; let s = -1;
    col.forEach((v, x) => { if (v <= 2) { if (s < 0) s = x; } else if (s >= 0) { gaps.push([s, x - 1]); s = -1; } });
    if (s >= 0) gaps.push([s, W - 1]);
    console.log(f, JSON.stringify([W, H]), `alpha0 ${(100 * a0 / (W * H)).toFixed(1)}%`, 'gaps', JSON.stringify(gaps.filter((q) => q[1] - q[0] > 3)));
    for (const [name, q] of Object.entries(POSES).filter(([, q]) => q.file === f)) {
      const [x0, x1] = q.crop;
      let top = H, bottom = -1, left = W, right = -1;
      for (let y = 0; y < H; y++) for (let x = x0; x <= x1; x++) if (on(x, y)) {
        if (y < top) top = y; if (y > bottom) bottom = y; if (x < left) left = x; if (x > right) right = x;
      }
      let line = `  ${name} bbox ${JSON.stringify([left, top, right, bottom])}`;
      if (q.head) {
        let ht = H;
        for (let y = 0; y < H && ht === H; y++) for (let x = q.head[0]; x <= q.head[1]; x++) if (on(x, y)) { ht = y; break; }
        let sx = 0, n = 0;
        for (let y = ht; y < ht + 60; y++) for (let x = q.head[0]; x <= q.head[1]; x++) if (on(x, y)) { sx += x; n++; }
        line += ` headTop ${ht} headX ${Math.round(sx / n)} footY ${bottom} height ${bottom - ht}`;
      }
      console.log(line);
    }
    if (rows) {
      // 全行を20px刻みで。手首・首・頭の列範囲を読むため
      for (let y = 0; y < H; y += 20) {
        const runs = []; let a = -1;
        for (let x = 0; x <= W; x++) { const v = x < W && on(x, y); if (v && a < 0) a = x; if (!v && a >= 0) { if (x - a > 3) runs.push(a + '-' + (x - 1)); a = -1; } }
        console.log(`    ${y}: ${runs.join(' ')}`);
      }
    }
  }
})();
