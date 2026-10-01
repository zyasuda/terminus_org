import assert from "node:assert/strict";
import chapter from "../data/chapter_01.json" with { type:"json" };
import { buildProposal } from "../src/proposal.js";
import { applyFix, currentText } from "../src/playlog.js";

const clone = () => structuredClone(chapter);
const sceneAt = (draft, index) => draft.scenes[index];

{
  const draft = clone();
  assert.deepEqual(buildProposal(chapter, draft), { fixes:[], unsupported:[] });
  console.log("ok 1 - 違いが無ければ修正案は空になる");
}

{
  const draft = clone();
  sceneAt(draft, 0).secrets[0].text = "書き直した本文";
  draft.intro.greeting = "書き直した挨拶";
  draft.ending.name = "書き直した名前";
  const { fixes, unsupported } = buildProposal(chapter, draft);
  assert.deepEqual(unsupported, []);
  assert.equal(fixes.length, 3);
  const secretFix = fixes.find(fix => fix.field === "text");
  assert.equal(secretFix.kind, "data");
  assert.equal(secretFix.scene, String(chapter.scenes[0].id));
  assert.equal(secretFix.target, `secret:${chapter.scenes[0].secrets[0].id}`);
  assert.equal(secretFix.before, chapter.scenes[0].secrets[0].text);
  assert.equal(secretFix.after, "書き直した本文");
  assert.equal(fixes.find(fix => fix.field === "greeting").scene, "intro");
  assert.equal(fixes.find(fix => fix.field === "name").scene, "ending");
  console.log("ok 2 - 場面の欄・秘密の本文・イントロ・エンディングを修正案にできる");
}

{
  // 作った修正案が、そのまま正本へ当たること(これが繋がらないと環は閉じない)
  const draft = clone();
  sceneAt(draft, 0).secrets[0].surface = "表層を書き直した";
  sceneAt(draft, 1).exits[0].blockedText = "行き止まりの文を書き直した";
  const { fixes } = buildProposal(chapter, draft);
  assert.equal(fixes.length, 2);
  const target = clone(); // 正本のつもり
  for (const fix of fixes) {
    assert.equal(currentText(target, fix), fix.before, "before が正本の現在の文と一致する");
    assert.equal(applyFix(target, fix), true);
    assert.equal(currentText(target, fix), fix.after);
  }
  console.log("ok 3 - 修正案は applyFix でそのまま正本へ当たる");
}

{
  // 照合キー・数値・エンジンの設定は修正案にしない。黙って落とさず unsupported で見せる
  const draft = clone();
  sceneAt(draft, 0).secrets[0].entity = "別の名前";
  sceneAt(draft, 0).secrets[0].dc = 99;
  sceneAt(draft, 0).exits[0].match = ["まったく別の語"];
  const { fixes, unsupported } = buildProposal(chapter, draft);
  assert.deepEqual(fixes, []);
  assert.equal(unsupported.length, 3);
  assert.ok(unsupported.every(item => item.where && item.why));
  console.log("ok 4 - entity・dc・match は修正案にせず、落とした理由を残す");
}

{
  // 場面や秘密の増減は文字の直しではない。丸ごとの持ち帰り(.jsonを書き出す)へ回す
  const draft = clone();
  sceneAt(draft, 0).secrets.push({ id:"new", entity:"追加", text:"追加した", surface:"" });
  const { fixes, unsupported } = buildProposal(chapter, draft);
  assert.deepEqual(fixes, []);
  assert.equal(unsupported.length, 1);
  console.log("ok 5 - 秘密の追加は修正案にできないと分かる形で返す");
}

{
  const draft = clone();
  draft.scenes.pop();
  const { unsupported } = buildProposal(chapter, draft);
  assert.ok(unsupported.some(item => item.why.includes("場面の増減")));
  console.log("ok 6 - 場面の増減も落とした理由を残す");
}
