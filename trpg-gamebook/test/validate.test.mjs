import assert from "node:assert/strict";
import chapter from "../data/chapter_01.json" with { type: "json" };
import { inspect } from "../src/validate.js";

const copy = () => structuredClone(chapter);

{
  const result = inspect(copy());
  assert.equal(result.structure.filter(({ level }) => level === "error").length, 0);
  assert.ok(result.play.cleared > 0);
}
console.log("ok 1 - 無傷の章は構造エラーなく完走できる");

{
  const broken = copy();
  broken.scenes[2].exits[0].to = 0;
  assert.ok(inspect(broken).structure.some(({ message }) => message.includes("実在しない場面を指している")));
}
console.log("ok 2 - 存在しない出口を検出する");

{
  const broken = copy();
  broken.scenes[3].exits = [];
  const result = inspect(broken);
  assert.ok(result.structure.some(({ message }) => message.includes("出口を持たない場面")));
  assert.ok(result.play.stuck > 0);
}
console.log("ok 3 - 出口なしは静的検査と自動プレイの両方で検出する");

{
  const broken = copy();
  broken.scenes[1].decision.choices[0].input = "あああ";
  assert.ok(inspect(broken).structure.some(({ message }) => message.includes("解決できない")));
}
console.log("ok 4 - 解決できない決断入力を検出する");
