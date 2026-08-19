import assert from "node:assert/strict";
import chapter from "../data/chapter_01.json" with { type: "json" };
import drought from "../drafts/drought_ch1.json" with { type: "json" };
import lanternhill from "../drafts/lanternhill_ch1.json" with { type: "json" };
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
/* イントロの候補は「秘密→遭遇→出口」の順で3件に切られる(progression.js の slice(0,3))。
   秘密が4件あると3枠すべてが秘密で埋まり、出口が押し出されて候補に出てこない。
   先頭を1つ押すだけでは進めないので、出口が現れるまで秘密を開けてから進む
   (2026-08-19にイントロへ秘密4件が入って発覚。候補の先頭が出口である前提が崩れた) */
function revealUntilExit(state, exitId) {
  // 判定に失敗すると同じ秘密を何度も調べ直すので、秘密の数より十分多く回す
  for (let guard = 0; guard < 60; guard++) {
    const options = candidates(state);
    const exit = options.find(option => exitId ? option.id === exitId : option.id.startsWith("exit:"));
    if (exit) return exit;
    assert.ok(options.length, "押せる候補が無い");
    act(state, options[0].input);
  }
  throw new Error(`出口${exitId || ""}が候補に現れない`);
}
function enterScene1(state) { act(state, revealUntilExit(state).input); }
function enterRustEater(state) {
  enterScene1(state);
  act(state, candidates(state).find(option => option.id === "secret:s1a").input);
  // 秘密が3枠を埋めると出口が候補から押し出される。出口が現れるまで調べてから進む
  act(state, revealUntilExit(state, "exit:to_scean02").input);
  act(state, candidates(state).find(option => option.id === "inspect_barrier").input);
  if (!state.revealed.has("s2a")) act(state, candidates(state).find(option => option.id === "secret:s2a").input);
  act(state, candidates(state).find(option => option.id === "encounter:encounter_1").input);
}
function sequence(values) {
  let index = 0;
  return () => values[index++] ?? 0;
}
function healingChapter() {
  const copy = structuredClone(chapter);
  copy.healing = [{ name:"回復薬", amount:4, text:"封を切って一息にあおった。傷の熱が引いていく。" }];
  copy.startingInventory.player.push("回復薬");
  return copy;
}
/* 「持っている品をもう一度渡されたときのナレーション」を検査するための検体。
   以前は章データの蝙蝠が回復薬を落とすことに寄りかかっていたが、2026-08-19に
   回復薬の入手経路が場面5の調査へ移り、前提が消えた。エンジンの振る舞いを見る検査なので、
   章の作り込みに依存させず、ここで条件を作る */
function duplicateItemChapter() {
  const copy = structuredClone(chapter);
  const encounter = copy.scenes[1].encounters.find(({ id }) => id === "encounter_2");
  encounter.enemy.itemOnDefeat = "回復薬";
  encounter.enemy.itemOnDefeatCount = 1;
  copy.startingInventory.player.push("回復薬");
  return copy;
}

{
  const state = newGame(healingChapter(), { rng:() => 0.7 });
  assert.equal(candidates(state).some(option => option.id === "heal:回復薬"), false);
}
console.log("ok 13 - HP満タンでは回復候補を出さない");

{
  const state = newGame(healingChapter(), { rng:() => 0.7 });
  state.hp = 6;
  assert.deepEqual(candidates(state).find(option => option.id === "heal:回復薬"), {
    id:"heal:回復薬", label:"回復薬を飲む", input:"回復薬を飲む"
  });
}
console.log("ok 14 - ダメージ中で回復薬を持っていれば候補を出す");

{
  const state = newGame(healingChapter(), { rng:() => 0.7 });
  state.hp = 6;
  act(state, "回復薬を飲む");
  assert.equal(state.hp, 10);
  assert.equal(state.inventory.player.includes("回復薬"), false);
  assert.equal(candidates(state).some(option => option.id === "heal:回復薬"), false);
}
console.log("ok 15 - 回復するとHPが戻り、回復薬を消費する");

{
  const state = newGame(healingChapter(), { rng:() => 0.7 });
  enterRustEater(state);
  state.hp = 5;
  for (const id of ["combat:attack", "combat:defend", "combat:flee", "heal:回復薬"]) {
    assert.ok(candidates(state).some(option => option.id === id), id);
  }
  const events = act(state, "回復薬を飲む");
  assert.deepEqual(events, [
    { type:"item", text:"回復薬を消費した", name:"回復薬", count:1 },
    { type:"narrate", text:"封を切って一息にあおった。傷の熱が引いていく。" },
    { type:"combat", text:"錆喰いの反撃。1ダメージ" }
  ]);
  assert.equal(state.hp, 8);
}
console.log("ok 16 - 交戦中の回復は同じ手番に敵の反撃を受ける");

{
  const state = newGame(drought, { rng:() => 0.7 });
  state.hp = 6;
  assert.equal(candidates(state).some(option => option.id.startsWith("heal:")), false);
}
console.log("ok 17 - healingのない章では回復候補を出さない");

{
  const state = newGame(chapter, { rng:() => 0.7 });
  const exit = chapter.intro.exits[0];
  const events = act(state, revealUntilExit(state, "exit:to_scean01").input);
  assert.equal(events.find(event => event.type === "say").text, exit.npcSay);
  assert.equal(events.find(event => event.type === "say").who, chapter.intro.npc.name);
  assert.ok(events.findIndex(event => event.type === "say") < events.findIndex(event => event.type === "item"));
  assert.ok(events.findIndex(event => event.type === "item") < events.findIndex(event => event.type === "move"));
}
console.log("ok 11 - イントロの出口でNPC発言を報酬より先に記録する");

{
  const state = newGame(duplicateItemChapter(), { rng:() => 0.99 });
  enterScene1(state);
  act(state, candidates(state).find(option => option.id === "secret:s1a").input);
  act(state, candidates(state).find(option => option.id === "exit:to_scean02").input);
  act(state, "崩れた坑道を調べる");
  act(state, candidates(state).find(option => option.id === "encounter:encounter_2").input);
  const events = act(state, "攻撃する");
  assert.ok(events.some(event => event.type === "narrate" && event.text === "回復薬は、もう持っている"));
}
console.log("ok 12 - 既に持っているアイテムの追加をナレーションする");

{
  const state = newGame(chapter, { rng: seeded(7) });
  const visitedScenes = new Map([["1", 1]]);
  for (let turn = 0; turn < 200 && state.node !== "done"; turn += 1) {
    const options = candidates(state);
    assert.ok(options.length, "候補が尽きない");
    /* 出口を最優先にすると、寄り道部屋と本線の間を往復して手番を使い切る
       (2026-08-19: 灯りの部屋⇄柵のある場所で無限に往復した)。また、先へ進む条件が
       品物や秘密になっている章では、調べずに進もうとして条件を満たせない。
       実際のプレイヤーと同じ順で選ぶ: 弱点 → その場でできること → 未訪問へ向かう出口 → 残った出口 */
    const exitTo = option => {
      const id = option.id.startsWith("exit:") ? option.id.slice("exit:".length) : null;
      if (!id || state.node !== "scene") return null;
      const exit = (chapter.scenes[state.sceneIndex].exits || []).find(e => e.id === id);
      return exit ? String(exit.to) : null;
    };
    /* 行き先は「訪問回数が少ない方」を選ぶ。未訪問かどうかだけでは、
       全部訪問済みになった時点で先頭固定に戻り、2部屋の間で往復し続ける。
       回数で選べば、条件を満たす品を取りに離れた部屋まで戻っていける */
    const exitOptions = options.filter(option => exitTo(option));
    const leastVisited = exitOptions
      .sort((a, b) => (visitedScenes.get(exitTo(a)) || 0) - (visitedScenes.get(exitTo(b)) || 0))[0];
    const choice = options.find(option => option.id === "combat:weakness")
      || options.find(option => !option.id.startsWith("exit:"))
      || leastVisited
      || options[0];
    const to = exitTo(choice);
    if (to) visitedScenes.set(to, (visitedScenes.get(to) || 0) + 1);
    labels.push(choice.label);
    act(state, choice.input);
  }
  assert.equal(state.node, "done");
  for (const id of ["s1a", "s2a", "s2a_gap", "s3a", "s3b"]) assert.ok(state.revealed.has(id), id);
}
console.log(`ok 1 - 完走: ${labels.join(" -> ")}`);

{
  const state = newGame(chapter, { rng: seeded(7) });
  enterScene1(state);
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

{
  /* 準備(イントロの秘密を開けて交戦まで進む)は成功する出目で通し、検査したい一手だけ
     必ず外れる出目に差し替える。sequence([0.7,0.7,0])のように手数へ合わせて並べると、
     イントロに秘密が増えた分だけずれて準備が終わらない(2026-08-19) */
  const state = newGame(chapter, { rng: () => 0.7 });
  enterRustEater(state);
  state.rng = () => 0;
  const events = act(state, "攻撃する");
  assert.ok(events.some(event => event.type === "combat" && event.text.includes("空を切った")));
}
console.log("ok 8 - 攻撃を外すと空を切ったと記録する");

{
  const state = newGame(chapter, { rng: () => 0.7 });
  enterRustEater(state);
  state.rng = sequence([0.6, 0]);   // 準備の手数に左右されず、この一手だけを固定する
  const events = act(state, "攻撃する");
  assert.ok(events.some(event => event.type === "combat" && /に \d+ のダメージ/.test(event.text)));
}
console.log("ok 9 - 攻撃が当たるとダメージを記録する");

{
  const state = newGame(chapter, { rng: () => 0.7 });
  enterRustEater(state);
  state.rng = sequence([0.6, 0.9, 0]); // 同上
  const events = act(state, "攻撃する");
  assert.ok(events.some(event => event.type === "combat" && event.text.includes("弱っている")));
}
console.log("ok 10 - 敵の残りHPが閾値以下なら弱りを記録する");

{
  const state = newGame(lanternhill, { rng: seeded(3) });
  state.inventory.player.push("回復薬");
  const before = state.inventory.player.length;
  const events = act(state, "回復薬を飲む");
  assert.equal(state.hp, state.maxHp);
  assert.equal(state.inventory.player.length, before, "満タンで飲んでも品が減らない");
  assert.ok(events.some(({ text }) => String(text).includes("傷が無い")));
}
console.log("ok 17 - 傷が無いときは回復薬を消費しない");
