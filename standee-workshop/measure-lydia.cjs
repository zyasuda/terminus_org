// リディアの元絵を測る。sharp で画素を読むだけで、画像は書き換えない。
//   node measure-lydia.cjs   → wardrobe.js の LYDIA_SRC・LYDIA_WINE_SRC はこの出力の写し
// 測り方：α128以上を人物とみなす。各ファイルの幅の左半分＝正面・右半分＝背面。頭頂は最上行、足裏は最下行、頭の中心は頭頂から60pxの平均x
const path = require('path');
const sharp = require(path.resolve(__dirname, '../trpg-gm-mock2/node_modules/sharp'));

const A_MIN = 128;
const FILES = ['empty-v1.png', 'wine-empty-v3.png'];

(async () => {
  for (const f of FILES) {
    const { data: d, info } = await sharp(path.join(__dirname, 'assets/lydia', f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height, C = info.channels, on = (x, y) => d[(y * W + x) * C + 3] >= A_MIN;
    console.log(f, JSON.stringify([W, H]));
    const half = Math.floor(W / 2), CROPS = { front: [0, half - 1], back: [half, W - 1] };
    for (const [view, [x0, x1]] of Object.entries(CROPS)) {
      let top = H, bottom = -1, left = W, right = -1;
      for (let y = 0; y < H; y++) for (let x = x0; x <= x1; x++) if (on(x, y)) {
        if (y < top) top = y; if (y > bottom) bottom = y; if (x < left) left = x; if (x > right) right = x;
      }
      let sx = 0, n = 0;
      for (let y = top; y < top + 60; y++) for (let x = x0; x <= x1; x++) if (on(x, y)) { sx += x; n++; }
      console.log(`  ${view} bbox ${JSON.stringify([left, top, right, bottom])} headTop ${top} headX ${Math.round(sx / n)} footY ${bottom}`);
    }
  }
})();
