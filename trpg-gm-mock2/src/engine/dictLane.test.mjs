/* 動詞辞書を広げた時の回帰検査。
   実行: npm run test:dictlane   /   取り込み: UPDATE=1 npm run test:dictlane

   なぜ要るか: 宣言の意図分類は、まず語幹の辞書(tryScripted)が処理し、そこで決着しなかった
   分だけがLLM分類器へ回る。実プレイ13セッションの実測では宣言506件のうち340件(67%)が
   辞書側で完結していた。この辞書へ機械的に語を足すと、これまで安全なレーンに落ちていた
   宣言が別のレーンへ移りうる。特にMOVE_REは一致した時点でscriptedMoveForwardが走り
   シーンが進むため、誤って移動語を増やすとプレイヤーを勝手に移動させる。
   実プレイで実際に打たれた宣言(declarations.json)を全部通し、レーンの割り当てが
   変わったものを人間に見せるのがこのテストの役目である。差分が出ること自体は失敗ではない
   ——意図した変化なら UPDATE=1 で取り込む。意図しない変化を見逃さないためにある。

   コーパスの更新は scripts/extract-declarations.mjs を参照。 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXAMINE_RE } from "./progression.js";
import { MOVE_RE, BACK_RE, TALK_RE, TAKE_RE, SCRIPTED_ATTACK_RE, mentionsHealPotionUse } from "./index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const corpusPath = path.join(here, "declarations.json");
const goldenPath = path.join(here, "dictLane.golden.json");

/* tryScripted(index.js)の分岐順と同じ順で判定する。あちらの順番を入れ替えたらここも直す。
   talkだけは実際には同行者名の一致も条件になるが、それはキャンペーンのデータ次第で変わり
   辞書の検査には邪魔なので、ここでは動詞だけを見る(hybridではtalkもllmも結局LLMへ流れる
   ため、この差は検査の解像度の問題であって挙動の差ではない)。
   戦闘中・報告シーン・secret.trigger一致といった「文以外の条件」も同じ理由で見ない。 */
const LANES = [
  ["attack", t => SCRIPTED_ATTACK_RE.test(t)],
  ["examine", t => EXAMINE_RE.test(t)],
  ["heal", t => mentionsHealPotionUse(t)],
  ["take", t => TAKE_RE.test(t)],
  ["back", t => BACK_RE.test(t) && !MOVE_RE.test(t)],
  ["move", t => MOVE_RE.test(t)],
  ["talk", t => TALK_RE.test(t)],
];
// 誤爆するとシーンが進む/戻るレーン。ここへ移動した宣言は特に目立たせる
const RISKY = new Set(["move", "back"]);

const laneOf = text => {
  const hit = LANES.find(([, test]) => test(text));
  return hit ? hit[0] : "llm"; // どの辞書にも当たらない = LLM分類器へ回る
};

const corpus = JSON.parse(fs.readFileSync(corpusPath, "utf8"));
const current = {};
corpus.forEach(t => { current[t] = laneOf(t); });

if (process.env.UPDATE) {
  fs.writeFileSync(goldenPath, JSON.stringify(current, null, 2) + "\n");
  console.log(`dictLane: ゴールデンを更新 (${corpus.length}件)`);
  process.exit(0);
}

if (!fs.existsSync(goldenPath)) {
  console.error("dictLane: ゴールデンが無い。UPDATE=1 npm run test:dictlane で作る");
  process.exit(1);
}
const golden = JSON.parse(fs.readFileSync(goldenPath, "utf8"));

const changed = [];
const added = [];
for (const text of corpus) {
  if (!(text in golden)) { added.push(text); continue; }
  if (golden[text] !== current[text]) changed.push([text, golden[text], current[text]]);
}
const removed = Object.keys(golden).filter(t => !(t in current));

const counts = {};
Object.values(current).forEach(l => { counts[l] = (counts[l] || 0) + 1; });
const dictHit = corpus.length - (counts.llm || 0);
console.log(`宣言 ${corpus.length}種 / 辞書で決着 ${dictHit} (${(dictHit / corpus.length * 100).toFixed(1)}%)`);
console.log("  レーン内訳: " + Object.entries(counts).sort((a, b) => b[1] - a[1])
  .map(([l, n]) => `${l}=${n}`).join(" "));

if (added.length) {
  console.log(`\n新しい宣言 ${added.length}件(ゴールデン未登録。UPDATE=1で取り込む)`);
  added.slice(0, 10).forEach(t => console.log(`  + ${t}  → ${current[t]}`));
}
if (removed.length) console.log(`\nコーパスから消えた宣言: ${removed.length}件`);

if (changed.length) {
  const risky = changed.filter(([, , to]) => RISKY.has(to));
  console.error(`\nNG レーンが変わった宣言: ${changed.length}件`);
  if (risky.length) {
    console.error(`\n  ⚠ 移動系レーンへ移った ${risky.length}件(シーンが勝手に進む恐れ)`);
    risky.forEach(([t, from, to]) => console.error(`    ${t}   ${from} → ${to}`));
  }
  const rest = changed.filter(([, , to]) => !RISKY.has(to));
  if (rest.length) {
    console.error(`\n  その他 ${rest.length}件`);
    rest.slice(0, 20).forEach(([t, from, to]) => console.error(`    ${t}   ${from} → ${to}`));
    if (rest.length > 20) console.error(`    …他${rest.length - 20}件`);
  }
  console.error("\n意図した変化なら UPDATE=1 npm run test:dictlane で取り込む");
  process.exit(1);
}

console.log(added.length ? "\ndictLane: OK(既存分に変化なし)" : "\ndictLane: OK");
process.exit(0);
