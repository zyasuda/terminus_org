import assert from "node:assert/strict";
import chapter from "../data/chapter_01.json" with { type: "json" };
import { candidates, newGame, act } from "../src/gamebook.js";
import { requiresMet } from "../src/progression.js";

function seeded(seed) {
  let value = seed >>> 0;
  return () => ((value = (value * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const labels = [];
function conditionedChapter() {
  const copy = structuredClone(chapter), scene = copy.scenes[0];
  scene.secrets.push(
    { id:"s_a", entity:"試験の前提", aliases:["前提"], text:"前提を確認した。", trigger:"" },
    { id:"s_b", entity:"試験の秘密", aliases:["秘密"], requires:{ secretsAll:["s_a"] }, text:"秘密が現れた。", trigger:"" }
  );
  scene.loot.push({ name:"試験の薬", requires:"s_b" });
  return copy;
}
function enterScene1(state) { act(state, candidates(state)[0].input); }
{
  const state = newGame(chapter, { rng: seeded(7) });
  for (let turn = 0; turn < 200 && state.node !== "done"; turn += 1) {
    const options = candidates(state);
    assert.ok(options.length, "候補が尽きない");
    const choice = options.find(option => option.id === "combat:weakness")
      || options.find(option => option.id.startsWith("exit:"))
      || options[0];
    labels.push(choice.label);
    act(state, choice.input);
  }
  assert.equal(state.node, "done");
  for (const id of ["s1a", "s2a", "s2a_gap", "s3a", "s3b"]) assert.ok(state.revealed.has(id), id);
}
console.log(`ok 1 - 完走: ${labels.join(" -> ")}`);

{
  const state = newGame(chapter, { rng: seeded(7) });
  act(state, candidates(state)[0].input);
  while (!state.revealed.has("s1a")) act(state, candidates(state).find(option => option.id === "secret:s1a").input);
  act(state, candidates(state).find(option => option.id.startsWith("exit:")).input);
  act(state, candidates(state).find(option => option.id === "inspect_barrier").input);
  while (!state.revealed.has("s2a")) act(state, candidates(state).find(option => option.id === "secret:s2a").input);
  const encounter = candidates(state).find(option => option.id.startsWith("encounter:"));
  act(state, encounter.input);
  const weakness = candidates(state).find(option => option.id === "combat:weakness");
  assert.ok(weakness);
  act(state, weakness.input);
  assert.ok(state.revealed.has("s2a_gap"));
  const exit = chapter.scenes[1].exits.find(({ id }) => id === "to_scean03");
  assert.ok(requiresMet(exit.requires, state));
}
console.log("ok 2 - 弱点で撃退しても抜け道が開く");

{
  const state = newGame(chapter, { rng: seeded(7) });
  const before = { turn: state.turn, revealed: new Set(state.revealed), hp: state.hp, sceneIndex: state.sceneIndex };
  assert.deepEqual(act(state, "壁を殴る"), [{ type: "unknown", text: "壁を殴る" }]);
  assert.equal(state.turn, before.turn);
  assert.deepEqual(state.revealed, before.revealed);
  assert.equal(state.hp, before.hp);
  assert.equal(state.sceneIndex, before.sceneIndex);
}
console.log("ok 3 - 未解決入力は状態を変えない");

{
  const state = newGame(conditionedChapter(), { rng:() => 0.7 });
  enterScene1(state);
  assert.equal(candidates(state).some(option => option.id === "secret:s_b"), false);
}
console.log("ok 4 - 前提未達の秘密は候補に出さない");

{
  const state = newGame(conditionedChapter(), { rng:() => 0.7 });
  enterScene1(state);
  assert.deepEqual(act(state, "試験の秘密を調べる"), [{ type:"unknown", text:"試験の秘密を調べる" }]);
}
console.log("ok 5 - 前提未達の秘密は調べても開かない");

{
  const state = newGame(conditionedChapter(), { rng:() => 0.7 });
  enterScene1(state);
  while (!state.revealed.has("s_a")) act(state, candidates(state).find(option => option.id === "secret:s_a").input);
  assert.ok(candidates(state).some(option => option.id === "secret:s_b"));
}
console.log("ok 6 - 前提を満たすと秘密の候補が現れる");

{
  const state = newGame(conditionedChapter(), { rng:() => 0.7 });
  enterScene1(state);
  while (!state.revealed.has("s_a")) act(state, candidates(state).find(option => option.id === "secret:s_a").input);
  act(state, candidates(state).find(option => option.id === "secret:s_b").input);
  assert.ok(state.inventory.player.includes("試験の薬"));
}
console.log("ok 7 - 前提を満たして秘密を開くと物が手に入る");
