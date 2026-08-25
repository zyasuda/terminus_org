// 前後絵から、厚みを持つアクリル板の駒(1つのソリッド)を作るための下準備をする。
// ここでは3D形状は作らない。作るのは3つだけ。
//
// 使い方: node scripts/build-standee-acrylic.mjs <キャラ名>
//   1. 位置合わせ済みの前後の人物絵(front/back、そのまま印刷面として貼る)
//   2. 板の共通外形マスク(前面のシルエット基準。Blender側で境界追跡→押し出し
//      に使う。前後の絵はこの外形の中に収まっていなければならない)
//   3. 人物の枠と外形のbbox(身長スケールに使う)
//
// 実体としての厚み・側面の丸みはBlender側(tools/standee/create_acrylic_standee.py)
// が担当する。ここでテクスチャに縁を焼き込む方式は使わない(v25初期案からの変更。
// 厚みを3Dで持たせることにしたため、テクスチャ側で板の縁を描く必要がなくなった)。
//
// 前後の絵は、頭頂・足元・胴の中心が前面と揃うよう相似変換で正規化する。
// 背面テクスチャはUV上で左右反転して貼られる(GLB実測: 背面メッシュはu=1が
// world x=-0.679)ため、位置合わせも反転した座標系で行う。反転を考慮せずに
// 比べると中心が46pxずれて見えるが、実際のずれは高さ15px・頭頂17px・中心3px。
import sharp from "sharp";
import { CHARACTERS, SRC, PLATE_VERSION, ALPHA_THRESHOLD, bleedAlpha, edgeBleedGap, MARGIN_RATIO } from "./standee-lib.mjs";
import { writeFileSync } from "node:fs";

const VERSION = PLATE_VERSION;   // 正本は assets/standee/sources.json

// 元絵の表は standee-lib.mjs の CHARACTERS が正本。
// ここに複製を持たない。2026-08-25、この位置に古い複製が残っていたため、
// 検査は新しい背面(v28)を見ているのに板は古い背面(v16)から作られていた。
// 検査と製造が別の絵を見ていたら、検査は何の保証にもならない。

const NAME = process.argv[2];
if (!CHARACTERS[NAME]) throw new Error(`キャラ名を指定する: ${Object.keys(CHARACTERS).join(" | ")}`);

const SOURCES = { front: SRC + CHARACTERS[NAME].front, back: SRC + CHARACTERS[NAME].back };
const OUT = { front: `${SRC}${NAME}-standee-${VERSION}-front.png`, back: `${SRC}${NAME}-standee-${VERSION}-back.png` };
const PLATE_MASK_OUT = `${SRC}${NAME}-standee-${VERSION}-plate-mask.png`;
const LAYOUT_OUT = `${SRC}${NAME}-standee-${VERSION}.json`;

// リディアで詰めた値(人物高さ1480pxのとき余白28px・ぼかし8px)を比に直したもの。
// 実寸では約3.3cmの余白にあたる。
const CORNER_BLUR_RATIO = 8 / 1480;

const flipX = ({ data, w, h }) => {
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    data.copy(out, (y * w + x) * 4, (y * w + (w - 1 - x)) * 4, (y * w + (w - 1 - x)) * 4 + 4);
  }
  return { data: out, w, h };
};

// パディング量は人物の高さから決めたいが、高さは読み込まないと分からない。
// まず素のまま読んで高さを測り、そこから余白とパディングを決めて読み直す。
const loadRaw = async path => {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
};

let PAD_PX, MARGIN_PX, CORNER_BLUR;

const load = async path => {
  const { data, info } = await sharp(path)
    .ensureAlpha()
    .extend({ top: PAD_PX, bottom: PAD_PX, left: PAD_PX, right: PAD_PX, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
};

// --- カラーグレード ---------------------------------------------------------
// 人物部分(不透明な画素)だけの輝度パーセンタイルを返す
const luminancePercentiles = ({ data, w, h }, quantiles) => {
  const lum = [];
  for (let i = 0; i < w * h; i++) {
    if (data[i * 4 + 3] < 200) continue;
    lum.push(0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]);
  }
  lum.sort((a, b) => a - b);
  return quantiles.map(q => lum[Math.min(lum.length - 1, Math.floor(lum.length * q))]);
};

// 制御点(src→dst)を単調に通す256段のトーンカーブ。区分線形で足りる。
const toneCurve = (srcPoints, dstPoints) => {
  const pts = [[0, dstPoints[0]], ...srcPoints.map((sv, i) => [sv, dstPoints[i + 1]]), [255, 255]];
  // 単調でない制御点は捨てる(元絵のパーセンタイルが潰れている場合の保険)
  const mono = [pts[0]];
  for (const [sx, sy] of pts.slice(1)) {
    const [px, py] = mono[mono.length - 1];
    if (sx > px && sy >= py) mono.push([sx, sy]);
  }
  if (mono[mono.length - 1][0] < 255) mono.push([255, 255]);
  const lut = new Uint8Array(256);
  let seg = 0;
  for (let v = 0; v < 256; v++) {
    while (seg < mono.length - 2 && v > mono[seg + 1][0]) seg += 1;
    const [x0, y0] = mono[seg], [x1, y1] = mono[seg + 1];
    const t = x1 === x0 ? 0 : (v - x0) / (x1 - x0);
    lut[v] = Math.max(0, Math.min(255, Math.round(y0 + (y1 - y0) * t)));
  }
  return lut;
};

// 輝度にトーンカーブを当て、RGBは同じ比率でスケールして色相を保つ
const applyGrade = (img, lut) => {
  const { data, w, h } = img;
  const out = Buffer.from(data);
  for (let i = 0; i < w * h; i++) {
    if (out[i * 4 + 3] === 0) continue;
    const r = out[i * 4], g = out[i * 4 + 1], b = out[i * 4 + 2];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (lum < 0.5) {   // ほぼ黒。比率が発散するのでカーブの値をそのまま置く
      const v = lut[0];
      out[i * 4] = v; out[i * 4 + 1] = v; out[i * 4 + 2] = v;
      continue;
    }
    const lo = Math.floor(lum), hi = Math.min(255, lo + 1), t = lum - lo;
    const target = lut[lo] + (lut[hi] - lut[lo]) * t;
    const ratio = target / lum;
    out[i * 4] = Math.min(255, Math.round(r * ratio));
    out[i * 4 + 1] = Math.min(255, Math.round(g * ratio));
    out[i * 4 + 2] = Math.min(255, Math.round(b * ratio));
  }
  return { ...img, data: out };
};

const QUANTILES = [0.10, 0.50, 0.90];

// 人物の基準点。頭頂・足元・胴の中心(高さの40〜60%帯のアルファ重心)
const anchors = ({ data, w, h }) => {
  let top = null, bottom = null;
  for (let y = 0; y < h && top === null; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 20) { top = y; break; }
  for (let y = h - 1; y >= 0 && bottom === null; y--) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 20) { bottom = y; break; }
  let sx = 0, n = 0;
  for (let y = Math.round(top + (bottom - top) * 0.40); y < Math.round(top + (bottom - top) * 0.60); y++)
    for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 20) { sx += x; n += 1; }
  return { top, bottom, height: bottom - top, centerX: sx / n };
};

// 背面を前面へ合わせる。等倍スケール(縦横同率)と平行移動だけを使う。
// 縦横を別倍率で伸ばすと人物が太る/痩せるため、相似変換に限る。
const alignBack = async (frontImg, backPath) => {
  const source = flipX(await load(backPath)); // 盤面と同じ向き(左右反転済み)で合わせる
  const target = anchors(frontImg);
  const from = anchors(source);
  const scale = target.height / from.height;
  const sw = Math.round(source.w * scale), sh = Math.round(source.h * scale);
  const scaled = await sharp(source.data, { raw: { width: source.w, height: source.h, channels: 4 } })
    .resize({ width: sw, height: sh }).raw().toBuffer();
  const moved = anchors({ data: scaled, w: sw, h: sh });
  const dx = Math.round(target.centerX - moved.centerX);
  const dy = Math.round(target.bottom - moved.bottom);
  const out = Buffer.alloc(frontImg.w * frontImg.h * 4);
  for (let y = 0; y < sh; y++) {
    const ty = y + dy;
    if (ty < 0 || ty >= frontImg.h) continue;
    for (let x = 0; x < sw; x++) {
      const tx = x + dx;
      if (tx < 0 || tx >= frontImg.w) continue;
      scaled.copy(out, (ty * frontImg.w + tx) * 4, (y * sw + x) * 4, (y * sw + x) * 4 + 4);
    }
  }
  return { data: out, w: frontImg.w, h: frontImg.h, scale: +scale.toFixed(4), dx, dy };
};

// 人物の高さから余白・ぼかし・パディングを確定させる
const probe = anchors(await loadRaw(SOURCES.front));
MARGIN_PX = Math.round(probe.height * MARGIN_RATIO);
CORNER_BLUR = Math.max(1, Math.round(probe.height * CORNER_BLUR_RATIO));
PAD_PX = MARGIN_PX + 20;   // 板が元絵の枠を超えて膨らめる余地
console.log(`${NAME}: 人物高さ ${probe.height}px → 余白 ${MARGIN_PX}px / ぼかし ${CORNER_BLUR} / パディング ${PAD_PX}px`);

let front = await load(SOURCES.front);
let alignedBack = await alignBack(front, SOURCES.back);

// カラーグレード。参照キャラの前面/背面それぞれの輝度分布へ寄せる。
const gradeRef = CHARACTERS[NAME].gradeTo;
if (gradeRef) {
  const ref = CHARACTERS[gradeRef];
  const graded = {};
  for (const [side, img, refFile] of [["front", front, ref.front], ["back", alignedBack, ref.back]]) {
    const target = luminancePercentiles(await loadRaw(SRC + refFile), QUANTILES);
    const source = luminancePercentiles(img, QUANTILES);
    // 黒レベルも参照へ合わせる(グレード前のガレスは暗部が0まで落ちている)
    const lut = toneCurve(source, [target[0] * 0.6, ...target]);
    graded[side] = applyGrade(img, lut);
    const before = source.map(v => Math.round(v)).join("/");
    const after = luminancePercentiles(graded[side], QUANTILES).map(v => Math.round(v)).join("/");
    console.log(`  ${side} グレード p10/p50/p90: ${before} → ${after} (目標 ${target.map(v => Math.round(v)).join("/")})`);
  }
  front = graded.front;
  alignedBack = graded.back;
}

// 位置合わせは反転座標系で行ったので、テクスチャとして貼る向き(盤面向きの反転)
// のまま書き出す。Blender側で背面のUVを反転して元の見た目に戻す。
const art = { front, back: alignedBack };
const { w, h } = front;

const chamfer = mask => {
  const dist = new Float32Array(w * h);
  for (let i = 0; i < dist.length; i++) dist[i] = mask[i] ? 0 : 1e9;
  const relax = (i, j, cost) => { const v = dist[j] + cost; if (v < dist[i]) dist[i] = v; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (x > 0) relax(i, i - 1, 1);
    if (y > 0) relax(i, i - w, 1);
    if (x > 0 && y > 0) relax(i, i - w - 1, 1.5);
    if (x < w - 1 && y > 0) relax(i, i - w + 1, 1.5);
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x;
    if (x < w - 1) relax(i, i + 1, 1);
    if (y < h - 1) relax(i, i + w, 1);
    if (x < w - 1 && y < h - 1) relax(i, i + w + 1, 1.5);
    if (x > 0 && y < h - 1) relax(i, i + w - 1, 1.5);
  }
  return dist;
};

const fillHoles = mask => {
  const outside = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const i = stack.pop();
    if (outside[i] || mask[i]) continue;
    outside[i] = 1;
    const x = i % w, y = (i - x) / w;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - w);
    if (y < h - 1) stack.push(i + w);
  }
  for (let i = 0; i < mask.length; i++) if (!mask[i] && !outside[i]) mask[i] = 255;
  return mask;
};

// 板の共通外形は、前面と背面の**符号付き距離場の平均**から作る。
// 前後の和を使うと、正規化では直らないポーズ差(ガレスなら腕組みの肩で66px、
// 剣の位置で57px)がそのまま片側だけの余白になり、「右肩だけ余白が大きい」
// という見え方になる。距離場の平均なら前後の中間を外形が通るので、余白が
// 均等になる。代わりに前後それぞれが少しはみ出すので、はみ出し量を検算で
// 数値として出す(0にはならない)。
const signedDistance = alphaData => {
  const inside = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (alphaData[i * 4 + 3] > 20) inside[i] = 1;
  const outside = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) outside[i] = inside[i] ? 0 : 1;
  const distOut = chamfer(inside);    // 図形の外側で正、内側は0
  const distIn = chamfer(outside);    // 図形の内側で正、外側は0
  const sdf = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) sdf[i] = distOut[i] - distIn[i];
  return sdf;
};

const sdfFront = signedDistance(front.data);
const sdfBack = signedDistance(alignedBack.data);

const grown = Buffer.alloc(w * h);
for (let i = 0; i < grown.length; i++) {
  const mid = (sdfFront[i] + sdfBack[i]) / 2;
  grown[i] = mid <= MARGIN_PX ? 255 : 0;
}
fillHoles(grown);
const rounded = await sharp(grown, { raw: { width: w, height: h, channels: 1 } })
  .blur(CORNER_BLUR).toColourspace("b-w").raw().toBuffer();
const plateMask = new Uint8Array(w * h);
for (let i = 0; i < plateMask.length; i++) if (rounded[i] >= 128) plateMask[i] = 1;

await sharp(Buffer.from(rounded), { raw: { width: w, height: h, channels: 1 } }).png().toFile(PLATE_MASK_OUT);

// 透明部分のRGBを人物の色で埋めてから書き出す。元絵の透明部分には透過表示の
// 市松模様が焼き込まれており(ガレスは白系254/248、リディアは黒系0)、
// そのまま貼るとミップマップと補間で縁に滲んで白く光る/黒く沈む。
const frontBled = bleedAlpha(front);
const backBled = bleedAlpha(alignedBack);
console.log(`  透明部分のRGBを人物の色で埋めた: front ${frontBled.filled}px / back ${backBled.filled}px`);
// 検算: 埋めた後、透明部分の色が人物の縁と近いこと。ここが離れているままだと
// ミップマップと補間で縁に滲む(元絵の市松模様がそのまま出る)。
const BLEED_GAP_LIMIT = 20;
for (const [side, img] of [["front", frontBled], ["back", backBled]]) {
  const { gap, voidMean, edgeMean } = edgeBleedGap(img);
  console.log(`  ${side}の透明部分と人物の縁の差 ${gap.toFixed(1)} (透明帯 ${voidMean.toFixed(0)} / 縁 ${edgeMean.toFixed(0)})`);
  if (gap > BLEED_GAP_LIMIT) throw new Error(`${side}の透明部分が人物の縁と${gap.toFixed(0)}離れている(上限${BLEED_GAP_LIMIT})`);
}
// 余白(板の内側で人物が無いところ)に、うっすらとアクリルの色を乗せる。
//
// なぜ必要か: 板の外形と厚みは3Dの実体として作ってあるが、前後の面のアルファが
// 0だと、正面・背面から見たときに余白が完全に透けて「板が無い」ように見える。
// 透明アクリルとしては正しいが、駒としては板の存在が分からない。
// 側面(rim)だけが見える状態で、カメラを下げるとその側面も細く潰れる。
//
// 色は create_acrylic_standee.py の rim_material と揃える。前面と側面で
// 違う色にすると、縁で色が変わって板に見えない。
// アルファは rounded(ぼかし済みの外形)に比例させ、板の外周を滑らかにする。
const PLATE_ALPHA = 0.05;
const PLATE_RGB = [222, 237, 245];
let tinted = 0;
for (const [side, img] of [["front", frontBled], ["back", backBled]]) {
  const src = side === "front" ? front.data : alignedBack.data;
  for (let i = 0; i < w * h; i++) {
    if (src[i * 4 + 3] > ALPHA_THRESHOLD) continue;   // 人物は触らない
    const cover = rounded[i] / 255;
    if (cover <= 0) continue;
    img.data[i * 4] = PLATE_RGB[0];
    img.data[i * 4 + 1] = PLATE_RGB[1];
    img.data[i * 4 + 2] = PLATE_RGB[2];
    img.data[i * 4 + 3] = Math.round(PLATE_ALPHA * 255 * cover);
    tinted += 1;
  }
}
console.log(`  余白へアクリルの色を乗せた: ${Math.round(tinted / 2)}px (アルファ ${PLATE_ALPHA})`);

await sharp(frontBled.data, { raw: { width: w, height: h, channels: 4 } }).png().toFile(OUT.front);
await sharp(backBled.data, { raw: { width: w, height: h, channels: 4 } }).png().toFile(OUT.back);

const bbox = (buf, stride, offset, threshold = 8) => {
  let minx = w, maxx = -1, miny = h, maxy = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (buf[(y * w + x) * stride + offset] > threshold) {
    if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
  }
  return [minx, miny, maxx, maxy];
};

const figure = bbox(front.data, 4, 3);
const plateBox = bbox(plateMask, 1, 0, 0);

// 検算: 前後の絵が共通外形からはみ出す量。距離場の平均を外形にしている以上
// 0にはならないが、人物の面積に対して数%を超えるなら正規化かMARGIN_PXを見直す。
const OUTSIDE_LIMIT_RATIO = 0.03;
for (const [label, imgData] of [["front", front.data], ["back", alignedBack.data]]) {
  let outside = 0, total = 0;
  for (let i = 0; i < w * h; i++) {
    if (imgData[i * 4 + 3] <= 20) continue;
    total += 1;
    if (!plateMask[i]) outside += 1;
  }
  const ratio = outside / total;
  console.log(`  ${label}のはみ出し ${outside}px (人物の${(ratio * 100).toFixed(2)}%)`);
  if (ratio > OUTSIDE_LIMIT_RATIO) {
    throw new Error(`${label}の絵が共通外形の外に${(ratio * 100).toFixed(2)}%はみ出している(上限${OUTSIDE_LIMIT_RATIO * 100}%)`);
  }
}

const af = anchors(front), ab = anchors(alignedBack);
const alignment = { 頭頂差: ab.top - af.top, 足元差: ab.bottom - af.bottom, 高さ差: ab.height - af.height, 中心差: Math.round(ab.centerX - af.centerX) };
for (const [k, v] of Object.entries(alignment)) if (Math.abs(v) > 6) throw new Error(`正規化後も${k}が${v}pxずれている`);

writeFileSync(LAYOUT_OUT, JSON.stringify({ width: w, height: h, figure, plate: plateBox }, null, 2) + "\n");
console.log("正規化後の基準点差", alignment);
console.log("figure", figure, "plate", plateBox);
console.log(OUT.front, OUT.back, PLATE_MASK_OUT, LAYOUT_OUT);
