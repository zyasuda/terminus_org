import assert from "node:assert/strict";
import chapter from "../data/chapter_01.json" with { type:"json" };
import { inspect } from "../src/validate.js";
import { revisionOf, parseFixes, applyFix } from "../src/playlog.js";

assert.equal(revisionOf("# 廃坑の灯 のプレイ記録（ch2 codex）\n本文"), "ch2 codex");
assert.equal(revisionOf("# 廃坑の灯 のプレイ記録(ch2 rev3)\n本文"), "ch2 rev3");
assert.equal(revisionOf("廃坑の灯（ch2）"), "");
console.log("ok 1 - 1行目の全角・半角括弧から版を取る");

assert.equal(parseFixes("```json\n{\"fixes\":[{\"kind\":\"data\"}]}\n```").length, 1);
assert.deepEqual(parseFixes("```json\n{壊れている\n```"), []);
console.log("ok 2 - JSONブロックから修正案を取り、壊れていても空配列を返す");

{
  const copy = structuredClone(chapter);
  const fix = { kind:"data", scene:2, target:"secret:s2a", field:"text", after:"直した文" };
  assert.equal(applyFix(copy, fix), true);
  assert.equal(copy.scenes[1].secrets[0].text, "直した文");
}
console.log("ok 3 - 秘密の本文を書き換える");

{
  const copy = structuredClone(chapter), before = structuredClone(copy);
  assert.equal(applyFix(copy, { kind:"data", scene:2, target:"secret:s2a", field:"entity", after:"別名" }), false);
  assert.deepEqual(copy, before);
}
console.log("ok 4 - 照合キーの書き換えを拒否する");

{
  const copy = structuredClone(chapter), before = structuredClone(copy);
  assert.equal(applyFix(copy, { kind:"data", scene:99, target:"secret:s2a", field:"text", after:"直した文" }), false);
  assert.equal(applyFix(copy, { kind:"data", scene:2, target:"secret:missing", field:"text", after:"直した文" }), false);
  assert.deepEqual(copy, before);
}
console.log("ok 5 - 実在しない場面・対象を拒否する");

{
  const copy = structuredClone(chapter), before = structuredClone(copy);
  assert.equal(applyFix(copy, { kind:"engine", scene:2, target:"secret:s2a", field:"text", after:"直した文" }), false);
  assert.deepEqual(copy, before);
}
console.log("ok 6 - エンジン修正案を拒否する");

{
  const copy = structuredClone(chapter), before = inspect(copy).structure.filter(item => item.level === "error").length;
  assert.equal(applyFix(copy, { kind:"data", scene:2, target:"secret:s2a", field:"text", after:"直した文" }), true);
  assert.equal(inspect(copy).structure.filter(item => item.level === "error").length, before);
}
console.log("ok 7 - 文字列の修正で検査エラーを増やさない");

{
  // AIは頭書きを落として "s2a" とだけ返してくる。IDが1つに定まるなら受ける
  const copy = structuredClone(chapter);
  assert.equal(applyFix(copy, { kind:"data", scene:2, target:"s2a", field:"text", after:"頭書き無しで直した文" }), true);
  assert.equal(applyFix(copy, { kind:"data", scene:2, target:"s2a", field:"entity", after:"別名" }), false);
}
console.log("ok 8 - 頭書きの無いIDを受け、それでも照合キーは拒否する");
