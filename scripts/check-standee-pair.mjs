// スタンディーの前後2面図が、1枚のアクリル板の駒として使えるかを検査する。
//
// なぜ必要か:
//   板の外形は前後で1つしか作れない。前後のシルエットが食い違うと、その差が
//   そのまま「人物のいない余白」になる。板の作り方(和・距離場の平均など)を
//   どう工夫してもこの差は消せないので、絵の側で対応を取る必要がある。
//
// 使い方:
//   node scripts/check-standee-pair.mjs <キャラ名>
//   node scripts/check-standee-pair.mjs --front <path> --back <path>
//
// 終了コード 0 = 合格、1 = 不合格。数値を見て絵を直す。
import { CHARACTERS, SRC, ALPHA_THRESHOLD, MARGIN_RATIO, loadRaw, anchors, alignBackToFront, opaqueAt, edgeBleedGap, plateMargin } from "./standee-lib.mjs";

const argv = process.argv.slice(2);
let frontPath, backPath, label;
if (argv[0] === "--front") {
  frontPath = argv[1];
  backPath = argv[3];
  label = "(指定ファイル)";
} else {
  const name = argv[0];
  if (!CHARACTERS[name]) throw new Error(`キャラ名を指定する: ${Object.keys(CHARACTERS).join(" | ")}`);
  frontPath = SRC + CHARACTERS[name].front;
  backPath = SRC + CHARACTERS[name].back;
  label = name;
}

const front = await loadRaw(frontPath);
const back = await loadRaw(backPath);

// 合否を決めるのは「板に出る余白」と「型抜きしていないこと」だけ。
// それ以外は、余白が大きいときに原因を探すための参考値として出す。
// 2026-08-25にこの形へ変えた。XORで合否を決めていたときは、板では見えない差を
// 追って絵を描き直し続けることになっていた(3回描き直して余白は5.6%→4.2%)。
const results = [];
const check = (name, value, limit, unit, note) => {
  const pass = value <= limit;
  results.push({ name, value, limit, unit, pass, note });
  return pass;
};
const info = (name, value, unit, note) => results.push({ name, value, unit, note, info: true });

// --- 0. キャンバスが同じか -------------------------------------------------
if (front.w !== back.w || front.h !== back.h) {
  console.log(`不合格: キャンバスサイズが違う 前面 ${front.w}x${front.h} / 背面 ${back.w}x${back.h}`);
  console.log("同じキャンバスで描き出すこと。以降の検査はできない。");
  process.exit(1);
}

const af = anchors(front);
const ab = anchors(back);
const H = af.height;   // 以降の許容値は人物の高さに対する比で決める

// --- 1. 正規化前の素性 -----------------------------------------------------
info("人物高さの差", Math.abs(ab.height - af.height) / H * 100, "%",
     `前面 ${af.height}px / 背面 ${ab.height}px`);

// --- 2. 正規化してシルエットを比べる ---------------------------------------
// 背面を左右反転し、頭頂・足元・胴中心を前面へ合わせる(制作パイプラインと同じ処理)
const aligned = await alignBackToFront(front, back);

const rowDiffs = [];
for (let y = af.top; y <= af.bottom; y++) {
  let fl = null, fr = null, bl = null, br = null;
  for (let x = 0; x < front.w; x++) { if (fl === null && opaqueAt(front, x, y)) fl = x; if (bl === null && opaqueAt(aligned, x, y)) bl = x; }
  for (let x = front.w - 1; x >= 0; x--) { if (fr === null && opaqueAt(front, x, y)) fr = x; if (br === null && opaqueAt(aligned, x, y)) br = x; }
  if (fl === null || bl === null) continue;
  rowDiffs.push({ y, left: Math.abs(bl - fl), right: Math.abs(br - fr) });
}
const allDiffs = rowDiffs.flatMap(r => [r.left, r.right]).sort((a, b) => a - b);
const pct = q => allDiffs[Math.min(allDiffs.length - 1, Math.floor(allDiffs.length * q))];

info("輪郭のずれ 中央値", pct(0.50) / H * 100, "%", `${pct(0.50)}px`);
info("輪郭のずれ p95", pct(0.95) / H * 100, "%", `${pct(0.95)}px`);

// --- 3. シルエットの食い違い面積 -------------------------------------------
let both = 0, onlyFront = 0, onlyBack = 0;
for (let y = 0; y < front.h; y++) for (let x = 0; x < front.w; x++) {
  const fa = opaqueAt(front, x, y), ba = opaqueAt(aligned, x, y);
  if (fa && ba) both += 1; else if (fa) onlyFront += 1; else if (ba) onlyBack += 1;
}
const union = both + onlyFront + onlyBack;
info("シルエットの食い違い(XOR/和集合)", (onlyFront + onlyBack) / union * 100, "%",
     `前面のみ ${onlyFront}px / 背面のみ ${onlyBack}px`);

// --- 4. 足元の接地 ---------------------------------------------------------
// 足を「最下部8%の帯にある塊」として取り出し、塊ごとに横位置と接地高さを比べる。
//
// 行ごとの左右端で比べると、片足の靴底が数十px高いだけで差が数百pxに跳ね上がる
// (その行に片足しか無くなるため)。それでは「足の位置が違う」のか「靴底の高さが
// わずかに違う」のかが区別できないので、塊で見る。
const feet = img => {
  const y0 = Math.round(af.bottom - H * 0.08);
  const blobs = [];
  for (let y = y0; y <= af.bottom; y++) {
    let run = null;
    for (let x = 0; x <= img.w; x++) {
      const on = x < img.w && opaqueAt(img, x, y);
      if (on && run === null) run = x;
      if (!on && run !== null) {
        const hit = blobs.find(b => run <= b.x1 + 4 && x >= b.x0 - 4);
        if (hit) { hit.x0 = Math.min(hit.x0, run); hit.x1 = Math.max(hit.x1, x - 1); hit.y1 = y; }
        else blobs.push({ x0: run, x1: x - 1, y1: y });
        run = null;
      }
    }
  }
  return blobs.filter(b => b.x1 - b.x0 > H * 0.02)
    .map(b => ({ cx: (b.x0 + b.x1) / 2, y1: b.y1 }))
    .sort((a, b) => a.cx - b.cx);
};
const ff = feet(front), fb = feet(aligned);
if (ff.length !== fb.length) {
  info("足の数が一致しない", 100, "%", `前面 ${ff.length}個 / 背面 ${fb.length}個`);
} else {
  const dx = Math.max(0, ...ff.map((f, i) => Math.abs(fb[i].cx - f.cx)));
  const dy = Math.max(0, ...ff.map((f, i) => Math.abs(fb[i].y1 - f.y1)));
  info("足の横位置のずれ", dx / H * 100, "%", `${dx.toFixed(0)}px (足${ff.length}個の中心)`);
  info("靴底の高さのずれ", dy / H * 100, "%", `${dy.toFixed(0)}px`);
}

// --- 5. 板に出る余白(これが合否) -------------------------------------------
// 板の外形は前後SDFの平均で作る。前後が対応していれば余白はどこでも margin ちょうど。
// 対応が崩れた分だけ、片面から見て余白が広がる。作者が見るのはこれである。
{
  const margin = Math.round(H * MARGIN_RATIO);
  const m = plateMargin(front, aligned, margin);
  for (const side of ["front", "back"]) {
    const label = side === "front" ? "前面" : "背面";
    check(`余分な余白の面積(${label})`, m[side].ratio, 5.0, "%", `狙いの余白 ${margin}px`);
    // 「狙いの余白を何px超えたか」で見る。距離の絶対値で見ると、MARGIN_RATIOを
    // 広げただけで数値が悪化して不合格になる(2026-08-25、1.9%→3%にして実際に起きた)。
    // 測りたいのは前後のずれであって、余白の広さではない。
    const over = Math.max(0, m[side].max - margin);
    check(`余白の超過(${label})`, over / H * 100, 3.0, "%",
          `${over.toFixed(0)}px (最大 ${m[side].max.toFixed(0)}px / 狙い ${margin}px)`);
  }
}

// --- 6. 型抜きによる不正合格の検出 -----------------------------------------
// 前面のアルファを左右反転して背面の抜き型に使うと、上の検査は全項目0%で通る。
// 通るだけで中身は伴わない: 絵が無い場所まで不透明になり、板に黒い穴が開く。
// 実際に2026-08-25、生成を委譲した際にこの抜け道を通られた。
{
  let sameAlpha = 0;
  for (let y = 0; y < front.h; y++) for (let x = 0; x < front.w; x++) {
    const i = y * front.w + x;
    if ((front.data[(y * front.w + (front.w - 1 - x)) * 4 + 3] > ALPHA_THRESHOLD)
        === (back.data[i * 4 + 3] > ALPHA_THRESHOLD)) sameAlpha += 1;
  }
  check("前面の反転アルファとの一致", sameAlpha / (front.w * front.h) * 100, 99.5, "%",
        "100%なら前面のシルエットで型抜きしただけ。背面を描いていない");
}

// --- 7. 透明部分の色(市松模様) -------------------------------------------
// これは build-standee-acrylic.mjs の alpha bleed が自動で直すので、合否には
// 含めず警告として出す。元絵の素性を知るための情報。
const warnings = [];
for (const [side, img] of [["front", front], ["back", back]]) {
  const { gap, voidMean, edgeMean } = edgeBleedGap(img);
  if (gap > 25) {
    warnings.push(`${side}: 透明部分の色が人物の縁と${gap.toFixed(0)}離れている` +
      `(透明帯 ${voidMean.toFixed(0)} / 縁 ${edgeMean.toFixed(0)})。` +
      `透過表示の市松模様が焼き込まれている可能性。build-standee-acrylic.mjs が自動で埋めるので作業は止めなくてよい。`);
  }
}

// --- 出力 -----------------------------------------------------------------
console.log(`\n二面図の検査: ${label}`);
console.log(`  前面 ${frontPath}`);
console.log(`  背面 ${backPath}`);
console.log(`  人物高さ ${H}px を基準に判定\n`);
let failed = 0;
for (const r of results.filter(x => !x.info)) {
  const mark = r.pass ? "OK  " : "NG  ";
  if (!r.pass) failed += 1;
  console.log(`  ${mark}${r.name.padEnd(28)} ${r.value.toFixed(2)}${r.unit} (上限 ${r.limit}${r.unit})   ${r.note}`);
}
console.log("\n  参考値(合否には使わない。余白が大きいときに原因を探すため):");
for (const r of results.filter(x => x.info)) {
  console.log(`      ${r.name.padEnd(28)} ${r.value.toFixed(2)}${r.unit}   ${r.note}`);
}
for (const wmsg of warnings) console.log(`  警告 ${wmsg}`);
if (failed) {
  console.log(`\n不合格 ${failed}件。参考値を見て原因の部位を特定する。docs/STANDEE_TURNAROUND_SPEC.md の「直し方」を読む。`);
  process.exit(1);
}
console.log("\n合格。3D化(tools/standee/create_acrylic_standee.py)へ進んでよい。");
