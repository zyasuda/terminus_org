// 生成された二面図/三面図を1コマンドで受け入れ検査する。
//
//   node scripts/accept-standee.mjs assets/standee/gareth-standee-v37-turnaround.png
//
// やること:
//   1. 前面/背面へ切り分ける(三面図なら中央の側面は捨てる)
//   2. 板に出る余白などの受け入れ検査
//   3. 色・アルファ・穴の検査(検査だけ通って絵が壊れている事故を防ぐ)
//   4. 目で見るための1枚(前面・背面・重ね合わせ)を output/ に書く
//
// 終了コード 0 = 合格。合格しても**必ず画像を目で見ること。**
// この検査は余白と素性を測るだけで、構図が成立しているかは測らない。
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { ALPHA_THRESHOLD, loadRaw, opaqueAt } from "./standee-lib.mjs";

const src = process.argv[2];
if (!src) throw new Error("使い方: node scripts/accept-standee.mjs <turnaround.png|threeview.png>");
const prefix = src.replace(/-(turnaround|threeview)\.png$/, "");
if (prefix === src) throw new Error("ファイル名は -turnaround.png か -threeview.png で終わること");

// --- 1. 切り分け -----------------------------------------------------------
const sheet = await loadRaw(src);
const { w, h } = sheet;
const col = new Int32Array(w);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (opaqueAt(sheet, x, y)) col[x] += 1;
const MIN_RUN = Math.round(w * 0.02);
const runs = [];
let start = null;
for (let x = 0; x <= w; x++) {
  const on = x < w && col[x] > 0;
  if (on && start === null) start = x;
  if (!on && start !== null) { if (x - start > MIN_RUN) runs.push([start, x - 1]); start = null; }
}
if (runs.length !== 2 && runs.length !== 3) {
  console.log(`不合格: 人物の塊が2つでも3つでもない(${runs.length}個: ${JSON.stringify(runs)})。`);
  console.log("図がくっついているか、余計なものが写っている。生成し直す。");
  process.exit(1);
}
if (runs.length === 3) console.log("三面図として扱う。左端=前面、右端=背面、中央(側面)は捨てる。");

const first = runs[0], last = runs[runs.length - 1];
const boxW = Math.max(first[1] - first[0], last[1] - last[0]) + Math.round(w * 0.06);
const centered = ([x0, x1]) => { const c = Math.round((x0 + x1) / 2); return c - (boxW >> 1); };
const paths = {};
for (const [side, x0] of [["front", centered(first)], ["back", centered(last)]]) {
  const out = Buffer.alloc(boxW * h * 4);
  for (let y = 0; y < h; y++) for (let x = Math.max(0, x0); x < Math.min(w, x0 + boxW); x++) {
    sheet.data.copy(out, (y * boxW + (x - x0)) * 4, (y * w + x) * 4, (y * w + x) * 4 + 4);
  }
  paths[side] = `${prefix}-${side}.png`;
  await sharp(out, { raw: { width: boxW, height: h, channels: 4 } }).png().toFile(paths[side]);
}
console.log(`切り分け: ${paths.front} / ${paths.back}  (${boxW}x${h})\n`);

// --- 2. 素性の検査 ---------------------------------------------------------
// 検査を通っても絵が壊れていることがある。今日までに実際に起きた壊れ方を測る:
//   ・緑背景のdespillで緑チャンネルが落ちる(茶色が紫になる)
//   ・アルファを2値化して縁のアンチエイリアスを失う
//   ・暗い衣装を暗い背景から抜いて人物に穴が開く
//   ・切り抜きの下地が人物の内側に残る
const audit = async path => {
  const img = await loadRaw(path);
  const { w: iw, h: ih } = img;
  let r = 0, g = 0, b = 0, n = 0, mid = 0, key = 0;
  for (let i = 0; i < iw * ih; i++) {
    const a = img.data[i * 4 + 3];
    if (a > 0 && a < 255) mid += 1;
    if (a < 200) continue;
    const R = img.data[i * 4], G = img.data[i * 4 + 1], B = img.data[i * 4 + 2];
    r += R; g += G; b += B; n += 1;
    if (G > 150 && G > R + 60 && G > B + 60) key += 1;                 // 緑の下地
    if (Math.abs(R - G) < 8 && Math.abs(G - B) < 8 && R > 110 && R < 160) key += 1;  // 灰色の下地
  }
  const seen = new Uint8Array(iw * ih), st = [];
  for (let x = 0; x < iw; x++) { st.push(x); st.push((ih - 1) * iw + x); }
  for (let y = 0; y < ih; y++) { st.push(y * iw); st.push(y * iw + iw - 1); }
  while (st.length) {
    const i = st.pop();
    if (seen[i] || img.data[i * 4 + 3] > ALPHA_THRESHOLD) continue;
    seen[i] = 1;
    const x = i % iw, y = (i - x) / iw;
    if (x > 0) st.push(i - 1); if (x < iw - 1) st.push(i + 1);
    if (y > 0) st.push(i - iw); if (y < ih - 1) st.push(i + iw);
  }
  let holes = 0, fig = 0;
  for (let i = 0; i < iw * ih; i++) { if (img.data[i * 4 + 3] > ALPHA_THRESHOLD) fig += 1; else if (!seen[i]) holes += 1; }
  return { gr: g / r, br: b / r, mid, key, holes: holes / fig * 100, fig };
};

let failed = 0;
const line = (ok, name, text) => { if (!ok) failed += 1; console.log(`  ${ok ? "OK  " : "NG  "}${name.padEnd(24)} ${text}`); };
console.log("素性の検査:");
for (const side of ["front", "back"]) {
  const a = await audit(paths[side]);
  const label = side === "front" ? "前面" : "背面";
  // G/R が 0.4 を切ると、緑を抜きすぎて茶色が紫になっている(2026-08-25の実例)
  line(a.gr > 0.45, `${label} 色 G/R`, `${a.gr.toFixed(3)} (正常 0.7前後 / 0.45未満は緑の抜きすぎ)`);
  line(a.mid > a.fig * 0.002, `${label} 縁の中間アルファ`, `${a.mid}px (2値化されていないか)`);
  line(a.key < a.fig * 0.002, `${label} 下地の残り`, `${a.key}px (緑/灰の切り抜き下地)`);
  line(a.holes < 3, `${label} 内部の穴`, `${a.holes.toFixed(2)}% (3%以上なら切り抜きで人物が欠けている)`);
}

// --- 3. 二面図の受け入れ検査 -----------------------------------------------
console.log();
const check = spawnSync(process.execPath,
  ["scripts/check-standee-pair.mjs", "--front", paths.front, "--back", paths.back],
  { stdio: "inherit" });
if (check.status !== 0) failed += 1;

// --- 4. 目で見るための1枚 --------------------------------------------------
await mkdir("output", { recursive: true });
const review = `output/${prefix.split("/").pop()}-review.png`;
const H = 900;
const shots = [];
for (const side of ["front", "back"]) {
  shots.push(await sharp(paths[side]).trim().flatten({ background: { r: 245, g: 245, b: 245 } })
    .resize({ height: H }).png().toBuffer({ resolveWithObject: true }));
}
let x = 24;
const comp = shots.map(s => { const o = { input: s.data, left: x, top: 20 }; x += s.info.width + 24; return o; });
await sharp({ create: { width: x, height: H + 40, channels: 3, background: { r: 245, g: 245, b: 245 } } })
  .composite(comp).png().toFile(review);

console.log(`\n目で見る: ${review}`);
if (failed) {
  console.log(`\n不合格。生成し直す。docs/STANDEE_TURNAROUND_SPEC.md の第5節・第8節を読む。`);
  process.exit(1);
}
console.log("\n合格。ただし数値は余白と素性しか見ていない。**必ず画像を目で見ること。**");
console.log("  背面図に、胴に隠れて見えないはずの手や武器が描かれていないか(第8.7節)");
console.log("  前面と背面で装備の左右が入れ替わっているか(第4.4節)");
console.log(`\n採用するなら: node scripts/ship-standee.mjs <キャラ名> ${prefix}-front.png ${prefix}-back.png`);
