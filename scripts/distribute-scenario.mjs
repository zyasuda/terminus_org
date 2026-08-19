/* 章データの正本を、各クライアントが読める場所へ配る。
 *
 * なぜ必要か: クライアントは3つともブラウザアプリで、fetch("./data/...") のように
 * サーバーのルート配下を相対パスで読む。ブラウザはルート外のファイルを取得できないため、
 * 正本を1つにしても「各サーバーの配下に届いている」状態は物理的に必要になる。
 * 2026-08-19時点で同期する仕組みは1つも無く、chapter_01.jsonが5箇所に別内容で存在していた。
 *
 * 使い方:
 *   node scripts/distribute-scenario.mjs            # 何をするか表示するだけ(既定)
 *   node scripts/distribute-scenario.mjs --write    # 実際に書く
 *
 * 配った先のファイルは生成物として扱う(.gitignore対象)。手で編集しないこと。
 * 直すのは正本だけ。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SOURCE_DIR = join(ROOT, "scenario", "lanternhill");

// 配布先。キャンペーンIDを含むパスの形はクライアントごとに違うので、ここに書き出す
const TARGETS = [
  "trpg-gm-mock2/public/data/campaigns/lanternhill",
  "trpg-gm-isometric/public/data/campaigns/lanternhill",
  // gamebookは data/ 直下を chapter_01.json 固定で読む(src/editor.js, src/ui.js)
  "trpg-gamebook/data",
  /* TAS自身の読み元。TASはここを /api/context の dataFiles としてブラウザへ渡すだけで、
     書き戻しはしない。配り忘れると、TASが古い章を読み込んだまま「mock側へ出力」した瞬間に
     配布済みの新しい章を旧版で上書きしてしまう */
  "TAS/data",
];

// 正本に置くファイル。増えたらここに足す
/* structure.json は起承転結の宣言。progression.test.mjs の検査17が章データと突き合わせるので、
   章データと一緒に配らないと幕の宣言だけが古いまま残る */
const FILES = ["chapter_01.json", "chapter_01.structure.json", "campaign.json"];

const write = process.argv.includes("--write");

if (!existsSync(SOURCE_DIR)) {
  console.error(`正本が見つかりません: ${SOURCE_DIR}`);
  console.error("先に正本を作ってください(どの版を正本にするかは作者の判断)。");
  process.exit(1);
}

let planned = 0, skipped = 0;
for (const file of FILES) {
  const src = join(SOURCE_DIR, file);
  if (!existsSync(src)) { console.log(`- ${file}: 正本に無いので飛ばす`); skipped++; continue; }
  const body = readFileSync(src);
  // 壊れたJSONを配って全クライアントを起動不能にしないよう、配る前に必ず構文を確認する
  try { JSON.parse(body); } catch (e) {
    console.error(`${file} が壊れたJSONです。配りません: ${e.message}`);
    process.exit(1);
  }
  for (const target of TARGETS) {
    const dest = join(ROOT, target, file);
    const same = existsSync(dest) && readFileSync(dest).equals(body);
    // gamebookは chapter_01.json しか読まないので campaign.json は配らない
    if (file === "campaign.json" && target.endsWith("trpg-gamebook/data")) continue;
    if (same) { console.log(`  = ${target}/${file} (同じ)`); continue; }
    console.log(`  ${write ? "→" : "…"} ${target}/${file}`);
    if (write) { mkdirSync(dirname(dest), { recursive: true }); writeFileSync(dest, body); }
    planned++;
  }
}

console.log(
  write ? `\n${planned}件を書きました。` :
  `\n${planned}件が更新対象です(まだ書いていません)。実行するには --write を付けてください。`
);
if (skipped) console.log(`正本に無くて飛ばしたファイル: ${skipped}件`);
