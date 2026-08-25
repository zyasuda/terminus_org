// スタンディー制作で、下準備(build-standee-acrylic.mjs)と受け入れ検査
// (check-standee-pair.mjs)が共有する処理。正規化のやり方が2箇所で
// 食い違うと検査が意味を失うので、必ずここを通す。
import sharp from "sharp";
import { readFileSync } from "node:fs";

// キャラごとの元絵と、現在の板の版。正本は assets/standee/sources.json。
// コード中に版番号や元絵の名前を書かない。scripts/ship-standee.mjs が
// このJSONを書き換える。2026-08-25まで、この表の複製が
// build-standee-acrylic.mjs にも残っていて、検査と製造が別の絵を見ていた。
const config = JSON.parse(readFileSync(new URL("../assets/standee/sources.json", import.meta.url), "utf8"));
export const CHARACTERS = config.characters;
export const PLATE_VERSION = config.plateVersion;

// 実身長(m)はキャラごと。1つの値を全員に使うと、背の高いキャラが縮む。
// 2026-08-25、ガレスが1.84m→1.72mで作られて「身長が低い」不具合になった。


export const SRC = "assets/standee/";
export const ALPHA_THRESHOLD = 20;   // これ以下のアルファは人物ではないと見なす

// 板の余白。人物の高さに対する比で持つ(元絵の解像度が変わっても同じ見た目になる)。
// build-standee-acrylic.mjs が外形を作るときと、check-standee-pair.mjs が
// 余白を測るときで同じ値を使う。食い違うと検査が意味を失う。
export const MARGIN_RATIO = 0.03;   // 人物高さの3%。1.72mの人物で約5cm

export const loadRaw = async path => {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
};

export const loadPadded = async (path, pad) => {
  const { data, info } = await sharp(path)
    .ensureAlpha()
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
};

export const flipX = ({ data, w, h }) => {
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    data.copy(out, (y * w + x) * 4, (y * w + (w - 1 - x)) * 4, (y * w + (w - 1 - x)) * 4 + 4);
  }
  return { data: out, w, h };
};

export const opaqueAt = ({ data, w }, x, y) => data[(y * w + x) * 4 + 3] > ALPHA_THRESHOLD;

// 人物の基準点。頭頂・足元・胴の中心(高さの40〜60%帯のアルファ重心)
export const anchors = img => {
  const { w, h } = img;
  let top = null, bottom = null;
  for (let y = 0; y < h && top === null; y++) for (let x = 0; x < w; x++) if (opaqueAt(img, x, y)) { top = y; break; }
  for (let y = h - 1; y >= 0 && bottom === null; y--) for (let x = 0; x < w; x++) if (opaqueAt(img, x, y)) { bottom = y; break; }
  if (top === null) throw new Error("不透明な画素が無い");
  let sx = 0, n = 0;
  for (let y = Math.round(top + (bottom - top) * 0.40); y < Math.round(top + (bottom - top) * 0.60); y++)
    for (let x = 0; x < w; x++) if (opaqueAt(img, x, y)) { sx += x; n += 1; }
  return { top, bottom, height: bottom - top, centerX: sx / n };
};

// 背面を前面へ合わせる。等倍スケール(縦横同率)と平行移動だけを使う。
// 縦横を別倍率で伸ばすと人物が太る/痩せるため、相似変換に限る。
// 背面は盤面と同じ向き(左右反転済み)にしてから合わせる。
export const alignBackToFront = async (frontImg, backImg) => {
  const source = flipX(backImg);
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

// 図形の外側への距離(チャンファー距離。斜めは3/2で近似)
export const chamfer = (mask, w, h) => {
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

// 人物部分だけの輝度パーセンタイル
export const luminancePercentiles = ({ data, w, h }, quantiles) => {
  const lum = [];
  for (let i = 0; i < w * h; i++) {
    if (data[i * 4 + 3] < 200) continue;
    lum.push(0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]);
  }
  lum.sort((a, b) => a - b);
  return quantiles.map(q => lum[Math.min(lum.length - 1, Math.floor(lum.length * q))]);
};

// 透明部分のRGBを、最近傍の人物画素の色で埋める(alpha bleed / edge extend)。
//
// なぜ必要か: alphaTestで切り抜いても、ミップマップ生成とバイリニア補間では
// 隣接する透明画素のRGBが人物の縁に混ざる。元絵の透明部分には透過表示の
// 市松模様が焼き込まれていることがあり(ガレスv11は254/248/249/247の白系、
// リディアv16は0系の黒)、そのまま貼ると縁が白く光る/黒く沈む。
// アルファは変えない。RGBだけを人物の色へ置き換える。
export const bleedAlpha = img => {
  const { data, w, h } = img;
  const dist = new Float32Array(w * h);
  const src = new Int32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (data[i * 4 + 3] > ALPHA_THRESHOLD) { dist[i] = 0; src[i] = i; }
    else { dist[i] = 1e9; src[i] = -1; }
  }
  const relax = (i, j, cost) => {
    if (src[j] < 0) return;
    const v = dist[j] + cost;
    if (v < dist[i]) { dist[i] = v; src[i] = src[j]; }
  };
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
  const out = Buffer.from(data);
  let filled = 0;
  for (let i = 0; i < w * h; i++) {
    if (data[i * 4 + 3] > ALPHA_THRESHOLD) continue;
    const s = src[i];
    if (s < 0) continue;
    out[i * 4] = data[s * 4];
    out[i * 4 + 1] = data[s * 4 + 1];
    out[i * 4 + 2] = data[s * 4 + 2];
    filled += 1;
  }
  return { ...img, data: out, filled };
};

// 透明部分の色が人物の縁からどれだけ離れているかを測る。
//
// 見るのは「人物の縁に隣接する透明画素」だけ。ミップマップと補間で縁に混ざるのは
// この帯であって、遠くの透明部分ではない。元絵の透明部分に透過表示の市松模様が
// 焼き込まれている場合、ここが人物の縁と大きく乖離する(ガレスv11で112)。
// 戻り値は輝度の差(0〜255)。bleedAlpha を通せば数以下まで下がる。
export const edgeBleedGap = img => {
  const { data, w, h } = img;
  const lumAt = i => 0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2];
  const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let voidSum = 0, voidCount = 0, edgeSum = 0, edgeCount = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const solid = data[i * 4 + 3] > ALPHA_THRESHOLD;
    let touchesOther = false;
    for (const [dx, dy] of NEIGHBORS) {
      const n = (y + dy) * w + (x + dx);
      if ((data[n * 4 + 3] > ALPHA_THRESHOLD) !== solid) { touchesOther = true; break; }
    }
    if (!touchesOther) continue;
    if (solid) { edgeSum += lumAt(i); edgeCount += 1; }
    else { voidSum += lumAt(i); voidCount += 1; }
  }
  if (!voidCount || !edgeCount) return { gap: 0, voidMean: 0, edgeMean: 0 };
  const voidMean = voidSum / voidCount, edgeMean = edgeSum / edgeCount;
  return { gap: Math.abs(voidMean - edgeMean), voidMean, edgeMean };
};

// 前後アルファの符号付き距離場。板の外形はこの平均で決まる。
export const signedDistance = (img, w, h) => {
  const inside = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (img.data[i * 4 + 3] > ALPHA_THRESHOLD) inside[i] = 1;
  const outside = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) outside[i] = inside[i] ? 0 : 1;
  const dOut = chamfer(inside, w, h), dIn = chamfer(outside, w, h);
  const sdf = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) sdf[i] = dOut[i] - dIn[i];
  return sdf;
};

// 板に出る「余分な余白」を測る。
//
// なぜこれを合否に使うのか: 作者が見るのは板の余白であって、シルエットのXORではない。
// 板の外形は前後SDFの平均なので、前後のずれは両面で折半される。XORが20%でも
// 余分な余白は4%程度にしかならない(2026-08-25に実測)。XORで合否を決めると、
// 板では見えない差を追って絵を描き直し続けることになる。
//
// 返す値: 板の面積に対する「狙いの余白より遠い画素」の割合と、その最大距離。
// 前後が完全に対応していれば、どこでも余白は margin ちょうどになり 0% になる。
export const plateMargin = (front, alignedBack, margin) => {
  const { w, h } = front;
  const sf = signedDistance(front, w, h), sb = signedDistance(alignedBack, w, h);
  const out = {};
  let area = 0;
  for (let i = 0; i < w * h; i++) if ((sf[i] + sb[i]) / 2 <= margin) area += 1;
  for (const [side, sdf] of [["front", sf], ["back", sb]]) {
    let over = 0, max = 0;
    for (let i = 0; i < w * h; i++) {
      if ((sf[i] + sb[i]) / 2 > margin) continue;
      if (sdf[i] > margin) { over += 1; if (sdf[i] > max) max = sdf[i]; }
    }
    out[side] = { ratio: over / area * 100, max };
  }
  return out;
};
