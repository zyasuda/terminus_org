/* ゲームブックのエディタが書き出した修正案を、章データの正本へ取り込む。
 *
 * なぜコマンドなのか: ブラウザからリポジトリへ直接書ける状態を作らずに、環を閉じるため。
 * 何が変わるかを見てから入れられる。編集の出口が無いままだと、遊んでいて気づいた
 * 1行を直しても次の配布で消える(2026-08-20 docs/パイプライン現在地)。
 *
 * 使い方:
 *   node scripts/apply-proposal.mjs ~/Downloads/proposal_chapter_01.json            # 表示だけ(既定)
 *   node scripts/apply-proposal.mjs ~/Downloads/proposal_chapter_01.json --write    # 取り込む
 *   node scripts/apply-proposal.mjs <file> --write --chapter=scenario/x/chapter_02.json
 *
 * 取り込んだ後は必ず配布する:
 *   node scripts/distribute-scenario.mjs --write
 *
 * 安全側の作り:
 *   - before が正本の現在の文と食い違ったら、1件でも**何も書かずに終わる**。
 *     部分適用は「どこまで入ったか」が分からなくなるため許さない
 *   - 書き換えてよい欄は playlog.js の FIX_FIELDS が決める。照合キー(entity・match)や
 *     エンジンの設定は、修正案の形にできない
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { currentText, applyFix, locate } from "../trpg-gamebook/src/playlog.js";

const ROOT = new URL("..", import.meta.url).pathname;
const args = process.argv.slice(2);
const write = args.includes("--write");
const chapterArg = args.find(a => a.startsWith("--chapter="))?.slice("--chapter=".length);
const proposalPath = args.find(a => !a.startsWith("--"));

if (!proposalPath) {
  console.error("修正案のファイルを指定してください。");
  console.error("  node scripts/apply-proposal.mjs <proposal.json> [--write] [--chapter=<正本のパス>]");
  process.exit(1);
}
const chapterPath = chapterArg
  ? (chapterArg.startsWith("/") ? chapterArg : join(ROOT, chapterArg))
  : join(ROOT, "scenario", "lanternhill", "chapter_01.json");

for (const [label, path] of [["修正案", proposalPath], ["正本", chapterPath]]) {
  if (!existsSync(path)) { console.error(`${label}が見つかりません: ${path}`); process.exit(1); }
}

const proposal = JSON.parse(readFileSync(proposalPath, "utf8"));
const fixes = Array.isArray(proposal.fixes) ? proposal.fixes : [];
if (!fixes.length) { console.error("修正案に fixes がありません。"); process.exit(1); }

const chapter = JSON.parse(readFileSync(chapterPath, "utf8"));
console.log(`正本  : ${chapterPath}`);
console.log(`修正案: ${proposalPath}（${fixes.length}件）\n`);

// 1周目: 全件が当てられることを確かめる。1件でも駄目なら何も書かない
const blocked = [];
fixes.forEach((fix, index) => {
  const found = locate(chapter, fix);
  const label = `#${index + 1} ${fix.scene} / ${fix.target || "(場面そのもの)"} / ${fix.field}`;
  if (!found) { blocked.push(`${label}: 正本に対象が見つからない`); return; }
  const now = currentText(chapter, fix);
  // 既に望みの文になっているものは「取り込み済み」。同じ修正案を2回流しても止めない
  if (now === fix.after) { console.log(`= ${label}（既に同じ文。変化なし）`); return; }
  if (typeof fix.before === "string" && now !== fix.before) {
    blocked.push(`${label}: 正本の文が修正案の前提と違う\n      正本 : ${now}\n      前提 : ${fix.before}`);
    return;
  }
  console.log(`- ${label}\n    ${found.label}\n    前: ${now}\n    後: ${fix.after}`);
});

if (blocked.length) {
  console.error(`\n取り込めません（${blocked.length}件）。何も書いていません。`);
  blocked.forEach(line => console.error("  ! " + line));
  console.error("\n正本が別の経路で変わっています。エディタで下書きを捨てて最新を読み直し、直し直してください。");
  process.exit(1);
}

if (!write) {
  console.log("\n表示しただけです。取り込むには --write を付けてください。");
  process.exit(0);
}

const applied = fixes.filter(fix => currentText(chapter, fix) !== fix.after && applyFix(chapter, fix));
if (!applied.length) {
  console.log("\n変化がありませんでした（すべて既に同じ文です）。何も書いていません。");
  process.exit(0);
}
writeFileSync(chapterPath, JSON.stringify(chapter, null, 2) + "\n");
console.log(`\n${applied.length}件を正本へ取り込みました: ${chapterPath}`);
console.log("次に配布してください: node scripts/distribute-scenario.mjs --write");
