// ブロム元絵の頭頂・足裏・頭の中心を測る（measure-maren.cjs と同じ測り方）。画像は読むだけで書き換えない。
//   node measure-brom.cjs                 → 12姿の測定値（wardrobe.js の BROM_SRC はこの出力の写し）
//   node measure-brom.cjs --rows          → 頭の列範囲を決めるための、上端付近の不透明区間
//   node measure-brom.cjs --survey a.png  → 任意の画像の透明度の内訳と列の切れ目（元絵選びの下調べ）
const fs = require('fs'), path = require('path');
const { chromium } = require(path.resolve(__dirname, '../trpg-gm-mock2/node_modules/playwright'));

const A_MIN = 128;   // これ以上の不透明度を人物とみなす
const DIR = path.join(__dirname, 'assets/brom/');
// crop：1枚に正面・背面が並ぶ元絵の切り出し範囲（列の切れ目の中間で分ける）。head：頭頂を探す列の範囲（--rows の出力から決めた）
const POSES = {
  "empty-front": {
    "file": "muted-empty-v1.png",
    "crop": [
      0,
      836
    ],
    "head": [
      400,
      636
    ]
  },
  "empty-back": {
    "file": "muted-empty-v1.png",
    "crop": [
      837,
      1674
    ],
    "head": [
      1071,
      1340
    ]
  },
  "hammer-front": {
    "file": "muted-hammer-v1.png",
    "crop": [
      0,
      836
    ],
    "head": [
      400,
      636
    ]
  },
  "hammer-back": {
    "file": "muted-hammer-v1.png",
    "crop": [
      837,
      1674
    ],
    "head": [
      1071,
      1340
    ]
  },
  "shield-front": {
    "file": "muted-shield-v1.png",
    "crop": [
      0,
      836
    ],
    "head": [
      400,
      636
    ]
  },
  "shield-back": {
    "file": "muted-shield-v1.png",
    "crop": [
      837,
      1673
    ],
    "head": [
      1071,
      1340
    ]
  },
  "both-front": {
    "file": "muted-hammer-shield-v1.png",
    "crop": [
      0,
      836
    ],
    "head": [
      400,
      636
    ]
  },
  "both-back": {
    "file": "muted-hammer-shield-v1.png",
    "crop": [
      837,
      1674
    ],
    "head": [
      1071,
      1340
    ]
  },
  "axe-front": {
    "file": "muted-axe-v1.png",
    "crop": [
      0,
      836
    ],
    "head": [
      400,
      636
    ]
  },
  "axe-back": {
    "file": "muted-axe-v1.png",
    "crop": [
      837,
      1673
    ],
    "head": [
      1071,
      1340
    ]
  },
  "axeShield-front": {
    "file": "muted-axe-shield-v1.png",
    "crop": [
      0,
      836
    ],
    "head": [
      400,
      636
    ]
  },
  "axeShield-back": {
    "file": "muted-axe-shield-v1.png",
    "crop": [
      837,
      1674
    ],
    "head": [
      1071,
      1340
    ]
  }
};

(async () => {
  const b = await chromium.launch(), p = await b.newPage();
  const load = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
  if (process.argv[2] === '--survey') {
    for (const f of process.argv.slice(3)) {
      const r = await p.evaluate(async ([src, A_MIN]) => {
        const img = new Image(); img.src = src; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data, W = c.width, H = c.height;
        let zero = 0, full = 0, mid = 0;
        for (let i = 3; i < d.length; i += 4) { const a = d[i]; if (a === 0) zero++; else if (a === 255) full++; else mid++; }
        const col = new Array(W).fill(0);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] >= A_MIN) col[x]++;
        const gaps = []; let s = -1;
        col.forEach((v, x) => { if (v <= 2) { if (s < 0) s = x; } else if (s >= 0) { gaps.push([s, x - 1]); s = -1; } });
        if (s >= 0) gaps.push([s, W - 1]);
        const pct = (n) => +(100 * n / (W * H)).toFixed(1);
        return { size: [W, H], alpha0: pct(zero), alpha255: pct(full), alphaMid: pct(mid), corner: [...d.slice(0, 4)], gaps: gaps.filter((q) => q[1] - q[0] > 3) };
      }, [load(f), A_MIN]);
      console.log(f, JSON.stringify(r));
    }
    return b.close();
  }
  const rows = process.argv.includes('--rows');
  const files = [...new Set(Object.values(POSES).map((q) => q.file))];
  for (const f of files) {
    const res = await p.evaluate(async ([src, A_MIN, poses, rows]) => {
      const img = new Image(); img.src = src; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data, W = c.width, H = c.height;
      const on = (x, y) => d[(y * W + x) * 4 + 3] >= A_MIN;
      const out = { size: [W, H], poses: {} };
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
        // 頭頂：頭の列範囲で最初に不透明になる行。頭の中心：頭頂から60px下までの不透明画素の平均x。足裏：人物範囲の最下行
        let ht = H;
        for (let y = 0; y < H && ht === H; y++) for (let x = q.head[0]; x <= q.head[1]; x++) if (on(x, y)) { ht = y; break; }
        let sx = 0, n = 0;
        for (let y = ht; y < ht + 60; y++) for (let x = q.head[0]; x <= q.head[1]; x++) if (on(x, y)) { sx += x; n++; }
        Object.assign(r, { headTop: ht, headX: Math.round(sx / n), footY: bottom, height: bottom - ht });
        out.poses[name] = r;
      }
      return out;
    }, [load(DIR + f), A_MIN, Object.entries(POSES).filter(([, q]) => q.file === f), rows]);
    console.log(f, JSON.stringify(res.size));
    for (const [name, r] of Object.entries(res.poses)) {
      console.log(' ', name, 'bbox', JSON.stringify(r.bbox), `headTop ${r.headTop} headX ${r.headX} footY ${r.footY} height ${r.height}`);
      if (r.rows) for (const line of r.rows) console.log('    ' + line);
    }
  }
  await b.close();
})();
