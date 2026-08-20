/* 下書きと、配布された章データを比べて「正本へ持ち帰れる修正案」を作る。
 *
 * なぜ必要か: エディタの編集結果は localStorage の下書きに溜まるだけで、正本
 * (scenario/lanternhill/chapter_01.json)へ届く経路が無かった。遊んでいて気づいた
 * 1行を直しても、次の配布で消える。「直したのに直っていない」が起きる。
 *
 * 形式は playlog.js の fix と同じにする。AIの修正案を採否する仕組みが既にこの形で
 * 動いており、書き換えてよい欄(FIX_FIELDS)の制限も、そこで検査済みだからである。
 * before を足すのは、取り込む側(scripts/apply-proposal.mjs)が「正本が動いていないか」
 * を確かめるため。作者が下書きを触っている間に正本が別の経路で変わっていたら、
 * 黙って上書きせずに止める。
 */
import { FIX_FIELDS, locate } from "./playlog.js";

const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const nodeEntries = chapter => [
  ["intro", "intro", chapter?.intro],
  ...((chapter?.scenes || []).map((scene, index) => [`scenes.${index}`, String(scene?.id), scene])),
  ["ending", "ending", chapter?.ending]
];

// 差異のある葉だけを列挙する。パスは ["secrets", 2, "text"] のような形
function* leafDiffs(before, after, path = []) {
  if (before === after) return;
  if (Array.isArray(before) && Array.isArray(after)) {
    if (before.length !== after.length) { yield { path, before, after }; return; } // 増減は文字列の修正ではない
    for (let i = 0; i < before.length; i++) yield* leafDiffs(before[i], after[i], [...path, i]);
    return;
  }
  if (isObject(before) && isObject(after)) {
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      yield* leafDiffs(before[key], after[key], [...path, key]);
    }
    return;
  }
  yield { path, before, after };
}

/* 葉のパスを fix の (target, field) へ翻訳する。翻訳できないパスは修正案に載せない
   (entity・match・dc・requires などの照合キーと数値は、文字の直しではないため) */
function fixTargetFor(node, path) {
  if (path.length === 1) return { target: "", field: path[0] };
  if (path.length === 2 && path[0] === "decision") return { target: "decision", field: path[1] };
  if (path.length !== 3) return null;
  const [group, index, field] = path;
  const kind = { secrets: "secret", exits: "exit", encounters: "encounter" }[group];
  if (!kind || typeof index !== "number") return null;
  const id = (node?.[group] || [])[index]?.id;
  if (id === undefined || id === null || id === "") return null;
  return { target: `${kind}:${id}`, field };
}

/* base(配布された章データ) と draft(下書き) を比べ、
   { fixes, unsupported } を返す。
   - fixes: そのまま正本へ取り込める修正案。playlog.js の applyFix が受け取れる形だけ
   - unsupported: 修正案に載せられなかった変更。黙って落とさず作者へ見せるためのもの */
export function buildProposal(base, draft) {
  const fixes = [];
  const unsupported = [];
  const draftNodes = new Map(nodeEntries(draft).map(([key, , node]) => [key, node]));

  for (const [key, scene, baseNode] of nodeEntries(base)) {
    const draftNode = draftNodes.get(key);
    if (!baseNode || !draftNode) { if (baseNode !== draftNode) unsupported.push({ where: key, why: "場面の増減は修正案にできない" }); continue; }
    for (const diff of leafDiffs(baseNode, draftNode)) {
      const at = fixTargetFor(baseNode, diff.path);
      const label = `${key} / ${diff.path.join(".")}`;
      if (!at) { unsupported.push({ where: label, why: "文字の直しとして扱える場所ではない" }); continue; }
      const kind = at.target === "" ? "" : at.target === "decision" ? "decision" : at.target.split(":")[0];
      if (!FIX_FIELDS[kind]?.has(at.field)) { unsupported.push({ where: label, why: `${at.field} は書き換えてよい欄ではない` }); continue; }
      if (typeof diff.before !== "string" || typeof diff.after !== "string") { unsupported.push({ where: label, why: "文字列以外の値" }); continue; }
      const fix = { kind: "data", scene, target: at.target, field: at.field, before: diff.before, after: diff.after };
      // 取り込む側が同じ対象を見つけられることを、ここで確かめておく(IDの重複などで locate が諦める場合がある)
      if (!locate(base, fix)) { unsupported.push({ where: label, why: "対象を一意に特定できない" }); continue; }
      fixes.push(fix);
    }
  }
  return { fixes, unsupported };
}
