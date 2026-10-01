/* 実プレイのクロニクルから「プレイヤーが実際に打った宣言」だけを抜き出し、
   辞書レーンの回帰テスト(src/engine/dictLane.test.mjs)が使うコーパスを作る。

   実行: node scripts/extract-declarations.mjs [クロニクルのディレクトリ]

   クロニクル本体はリポジトリの管理外(既定は ../chronicles)なので、抜き出した宣言だけを
   src/engine/declarations.json に固定して配る。こうしておけば、クロニクルを持っていない
   環境でもテストがそのまま走る。

   新しくプレイした分を取り込む手順:
     1. このスクリプトを実行して declarations.json を更新する
     2. npm run test:dictlane を実行し、増えた宣言のレーンを目視で確認する
     3. 問題なければ UPDATE=1 npm run test:dictlane でゴールデンに取り込む */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, "..");
const dir = process.argv[2] || path.join(repo, "..", "chronicles");
const out = path.join(repo, "src", "engine", "declarations.json");

if (!fs.existsSync(dir)) {
  console.error(`クロニクルのディレクトリが無い: ${dir}`);
  process.exit(1);
}

const found = new Set();
let files = 0;
for (const name of fs.readdirSync(dir)) {
  if (!name.endsWith(".md")) continue;
  files++;
  for (const line of fs.readFileSync(path.join(dir, name), "utf8").split("\n")) {
    const m = line.match(/🗣 宣言: (.*)$/);
    if (m && m[1].trim()) found.add(m[1].trim());
  }
}

// 既存分は消さない。クロニクルを消してもコーパスが痩せないようにする(過去に通った
// 言い回しを検査から落とすと、辞書を狭める変更に気づけなくなる)
const before = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")) : [];
const merged = [...new Set([...before, ...found])].sort();
fs.writeFileSync(out, JSON.stringify(merged, null, 2) + "\n");

console.log(`クロニクル ${files}件 から宣言 ${found.size}種を抽出`);
console.log(`コーパス: ${before.length} → ${merged.length}種 (+${merged.length - before.length})`);
console.log(`書き出し: ${path.relative(repo, out)}`);
