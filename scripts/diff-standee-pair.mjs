// 二面図のどこが食い違っているかを、部位ごとに数字と画像で出す。
// check-standee-pair.mjs は合否だけを返すので、描き直しの指示を書くにはこちらを使う。
//
//   node scripts/diff-standee-pair.mjs lydia
//   node scripts/diff-standee-pair.mjs --front <path> --back <path> [名前]
//     → 部位ごとの左右端のずれを表で出し、
//        output/lydia-turnaround-guide.png に重ね合わせ画像を書く。
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { CHARACTERS, SRC, loadRaw, anchors, alignBackToFront, opaqueAt } from "./standee-lib.mjs";

const argv = process.argv.slice(2);
let name, frontPath, backPath;
if (argv[0] === "--front") {
  [, frontPath, , backPath] = argv;
  name = argv[4] || "custom";
} else {
  name = argv[0];
  if (!CHARACTERS[name]) throw new Error(`キャラ名を指定する: ${Object.keys(CHARACTERS).join(" | ")}`);
  frontPath = SRC + CHARACTERS[name].front;
  backPath = SRC + CHARACTERS[name].back;
}

const front = await loadRaw(frontPath);
const back = await alignBackToFront(front, await loadRaw(backPath));
const a = anchors(front);

// 各行の左端・右端。人物が無い行は null。
const edges = img => {
  const rows = [];
  for (let y = 0; y < img.h; y++) {
    let l = null, r = null;
    for (let x = 0; x < img.w; x++) if (opaqueAt(img, x, y)) { if (l === null) l = x; r = x; }
    rows.push(l === null ? null : { l, r });
  }
  return rows;
};
const ef = edges(front), eb = edges(back);

// 部位は人物の高さに対する比で切る(頭頂 0% → 足元 100%)。
const PARTS = [
  ["頭",       0.00, 0.11],
  ["肩",       0.11, 0.20],
  ["胸・上腕",  0.20, 0.33],
  ["腰・肘",    0.33, 0.45],
  ["手・腰帯",  0.45, 0.56],
  ["腿",       0.56, 0.70],
  ["膝",       0.70, 0.82],
  ["脛・ブーツ", 0.82, 0.95],
  ["足元",      0.95, 1.00],
];

const pct = px => (px / a.height * 100).toFixed(1) + "%";
console.log(`\n二面図の食い違い: ${name}  (人物高さ ${a.height}px)`);
console.log("  背面は左右反転・等倍で前面へ合わせ済み。+ は背面のほうが外側。\n");
// 部位ごとのXOR(食い違い面積)。合計が検査の「シルエットの食い違い」になる。
const bandXor = (y0, y1) => {
  let x = 0, u = 0;
  for (let y = y0; y < y1; y++) for (let px = 0; px < front.w; px++) {
    const fa = opaqueAt(front, px, y), ba = opaqueAt(back, px, y);
    if (fa || ba) u += 1;
    if (fa !== ba) x += 1;
  }
  return u ? x / u * 100 : 0;
};

console.log("  部位        左端のずれ      右端のずれ      幅の差           食い違い");
for (const [label, t0, t1] of PARTS) {
  const y0 = Math.round(a.top + a.height * t0), y1 = Math.round(a.top + a.height * t1);
  let dl = [], dr = [], dw = [];
  for (let y = y0; y < y1; y++) {
    if (!ef[y] || !eb[y]) continue;
    dl.push(ef[y].l - eb[y].l);           // 背面が左へはみ出すと +
    dr.push(eb[y].r - ef[y].r);           // 背面が右へはみ出すと +
    dw.push((eb[y].r - eb[y].l) - (ef[y].r - ef[y].l));
  }
  const med = v => v.length ? v.sort((x, y) => x - y)[v.length >> 1] : 0;
  const s = n => (n >= 0 ? "+" : "") + n + "px(" + pct(Math.abs(n)) + ")";
  console.log(`  ${label.padEnd(10, "　")} ${s(med(dl)).padEnd(15)} ${s(med(dr)).padEnd(15)} ${s(med(dw)).padEnd(16)} ${bandXor(y0, y1).toFixed(1)}%`);
}

// 重ね合わせ画像。前面をそのまま、背面の輪郭を赤で乗せる。描き直しの下敷きにする。
const overlay = Buffer.alloc(front.w * front.h * 4);
front.data.copy(overlay);
for (let y = 0; y < front.h; y++) for (let x = 0; x < front.w; x++) {
  const i = y * front.w + x;
  if (!opaqueAt(back, x, y)) continue;
  const edge = x === 0 || y === 0 || x === front.w - 1 || y === front.h - 1
    || !opaqueAt(back, x - 1, y) || !opaqueAt(back, x + 1, y)
    || !opaqueAt(back, x, y - 1) || !opaqueAt(back, x, y + 1);
  if (!edge) continue;
  overlay[i * 4] = 255; overlay[i * 4 + 1] = 32; overlay[i * 4 + 2] = 32; overlay[i * 4 + 3] = 255;
}
// 部位の境界に水平線を引く(目視の対応確認用)
for (const [, t0] of PARTS) {
  const y = Math.round(a.top + a.height * t0);
  for (let x = 0; x < front.w; x += 6) {
    const i = (y * front.w + x) * 4;
    overlay[i] = 0; overlay[i + 1] = 128; overlay[i + 2] = 255; overlay[i + 3] = 255;
  }
}
await mkdir("output", { recursive: true });
const out = `output/${name}-turnaround-guide.png`;
await sharp(overlay, { raw: { width: front.w, height: front.h, channels: 4 } })
  .flatten({ background: { r: 255, g: 255, b: 255 } }).png().toFile(out);
console.log(`\n  重ね合わせ: ${out}  (赤=背面の輪郭 / 青の破線=部位の境界)\n`);
