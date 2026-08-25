// 受け入れた元絵を採用し、板・GLB・ゲーム側の参照までを1コマンドで通す。
//
//   node scripts/ship-standee.mjs gareth assets/standee/gareth-standee-v37-front.png \
//                                        assets/standee/gareth-standee-v37-back.png
//   node scripts/ship-standee.mjs --rebuild        (元絵は変えずに板から作り直す)
//
// やること:
//   1. assets/standee/sources.json の元絵を差し替え、板の版を1つ上げる
//   2. src/battle/standeeVersion.js を書き出す(ゲーム側の参照はここ1箇所)
//   3. 全キャラの板テクスチャと外形マスクを作る
//   4. 全キャラのGLBをBlenderで作る
//   5. 検査を走らせる
//
// 版番号を3箇所に手で書いていたため、更新漏れで「テクスチャを作り直しても画面が
// 変わらない」事故が起きた(2026-08-24)。版を上げる操作はこのスクリプトだけが行う。
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const CONFIG = "assets/standee/sources.json";
const VERSION_JS = "src/battle/standeeVersion.js";
const BLENDER = process.env.BLENDER || "/Applications/Blender.app/Contents/MacOS/Blender";

const args = process.argv.slice(2);
const config = JSON.parse(readFileSync(CONFIG, "utf8"));

if (args[0] !== "--rebuild") {
  const [name, front, back] = args;
  if (!name || !front || !back) throw new Error("使い方: node scripts/ship-standee.mjs <キャラ名> <front.png> <back.png>  |  --rebuild");
  if (!config.characters[name]) throw new Error(`知らないキャラ名: ${name} (${Object.keys(config.characters).join(" | ")})`);
  const strip = p => p.replace(/^assets\/standee\//, "");
  config.characters[name].front = strip(front);
  config.characters[name].back = strip(back);
  console.log(`元絵を差し替え: ${name} → ${strip(front)} / ${strip(back)}`);
}

const next = `v${Number(config.plateVersion.slice(1)) + 1}`;
console.log(`板の版: ${config.plateVersion} → ${next}\n`);
config.plateVersion = next;
writeFileSync(CONFIG, JSON.stringify(config, null, 2) + "\n");
writeFileSync(VERSION_JS,
`// スタンディ(厚みのあるアクリル板ソリッド)の現在の版。
//
// このファイルは scripts/ship-standee.mjs が書き換える。手で編集しない。
// 正本は assets/standee/sources.json の plateVersion。
export const STANDEE_VERSION = "${next}";
`);

const run = (label, cmd, cmdArgs) => {
  console.log(`\n--- ${label} ---`);
  const r = spawnSync(cmd, cmdArgs, { stdio: "inherit" });
  if (r.status !== 0) {
    console.log(`\n失敗: ${label}`);
    console.log(`sources.json と ${VERSION_JS} は ${next} に進んでいる。直してから --rebuild で再実行する。`);
    process.exit(1);
  }
};

for (const name of Object.keys(config.characters)) {
  run(`板テクスチャ ${name}`, process.execPath, ["scripts/build-standee-acrylic.mjs", name]);
}
// heightMは実寸(m)。盤面のセル間隔は1ワールド単位なので、1マスの実寸で割って渡す。
// ここを割らずに実寸のまま渡していたため、1マス=150cmの盤面で人物が1.5倍に
// 膨らんでいた(2026-08-25、リディアが258cmになっていた)。
const metresPerTile = config.metresPerTile ?? 1;
for (const name of Object.keys(config.characters)) {
  const heightM = config.characters[name].heightM;
  const units = heightM / metresPerTile;
  run(`GLB ${name} (実身長 ${heightM}m = ${units.toFixed(3)}マス / 1マス${metresPerTile}m)`, BLENDER,
    ["--background", "--python", "tools/standee/create_acrylic_standee.py", "--",
     name, next, String(units), String(metresPerTile)]);
}
for (const name of Object.keys(config.characters)) {
  run(`受け入れ検査 ${name}`, process.execPath, ["scripts/check-standee-pair.mjs", name]);
}

console.log(`\n完了。板とGLBは ${next}。ゲーム側の参照は ${VERSION_JS} 1箇所。`);
console.log("実画面の確認: devサーバを起ち上げてから");
console.log('  STANDEE_ONLY=1 SMOKE_URL="http://127.0.0.1:5174/expedition?standee=1" node src/expedition/smoke.mjs');
