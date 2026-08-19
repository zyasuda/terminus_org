/* 回復薬(itemOnDefeatで入手する消耗品)の自己チェック。
   実行: npm run test:healpotion

   playthrough.test.mjsの生成的な章走破では検証できない(蝙蝠を倒して初めて2個手に入るため、
   その蝙蝠戦の最中には使いようがなく、章データ上その後にもう一つ戦闘が無い)。
   restoreGame()で「戦闘中・回復薬所持」の状態を直接組み立て、使用時の挙動だけを狙って確かめる。 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = process.env.MOCK2_PUBLIC_DIR || path.join(HERE, "..", "..", "public");

const mem = new Map();
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k)
};
globalThis.location = { search: "" };
mem.set("terminus_gm_mode_v1", "scripted"); // index.jsはモジュール読み込み時にこのキーを読む

globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.startsWith("/data/")) {
    const file = path.join(PUBLIC_DIR, u);
    if (!fs.existsSync(file)) return { ok: false, status: 404, json: async () => null };
    return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(file, "utf8")) };
  }
  return { ok: false, status: 503, json: async () => ({}) };
};

const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, _ms, ...rest) => realSetTimeout(fn, 0, ...rest);
const tick = () => new Promise(r => realSetTimeout(r, 0));

const eng = await import("./index.js");
const { initialState } = await import("../state.js");
const { getSnapshot } = await import("./store.js");

await eng.boot();
await tick();

function readSaved() {
  for (const raw of mem.values()) {
    try {
      const v = JSON.parse(raw);
      if (v && v.state && Array.isArray(v.revealed)) return v.state;
    } catch (e) { /* 動詞頻度など別のキー */ }
  }
  throw new Error("保存された状態が見つからない");
}

async function say(text) {
  drainPopups();
  let settled = false;
  const p = eng.sendAction(text).then(v => { settled = true; return v; }, e => { settled = true; throw e; });
  for (let i = 0; i < 3000 && !settled; i++) {
    await tick();
    if (getSnapshot().pendingRoll) eng.performRoll();
    if (getSnapshot().popups.length) eng.dismissPopup();
  }
  await p;
  await tick();
  drainPopups();
}
function drainPopups() {
  let guard = 0;
  while (getSnapshot().popups.length && guard++ < 50) eng.dismissPopup();
}

// 戦闘中・回復薬2個所持・HP半分の状態を直接組み立てる(章データを最初から歩く必要が無い)
function restoreMidCombatWithPotions() {
  eng.restoreGame({
    state: {
      ...initialState(),
      sceneIndex: 1,
      hp: 5, maxHp: 10,
      healPotions: 2,
      enemy: {
        name: "錆喰い", unknownName: "不気味な影", trait: "",
        hp: 20, maxHp: 20, // この手番だけで誤って撃破されない十分なHP
        agility: 3, sprite: "s2_rust_eater.png", revealOnDefeat: "s2a_gap", identified: true
      }
    },
    chron: [], history: [], revealed: []
  });
}

let passed = 0;
const failures = [];
function check(ok, label, detail) {
  if (ok) { passed++; console.log(`  ok  ${label}`); return; }
  failures.push(label);
  console.log(`  NG  ${label}`);
  if (detail) console.log(`        ${detail}`);
}

console.log("── 回復薬: 戦闘中に使うとHPが増え、所持数が減り、戦闘が続く");
{
  restoreMidCombatWithPotions();
  await say("回復薬を使う");
  const s = readSaved();
  check(s.healPotions === 1, "使用後の所持数が2→1", `実際は${s.healPotions}`);
  // 「1ターン消費」の設計どおり、この手番のうちに敵も行動する(最大1ダメージ、敵のatk既定値)。
  // なので回復後HPは 5+2=7 ちょうどではなく、敵の攻撃が届いていれば6にもなりうる
  check(s.hp === 6 || s.hp === 7, "使用後のHPが6か7(HP+2から、同ターンの敵の反撃を差し引いた範囲)", `実際は${s.hp}`);
  check(Boolean(s.enemy), "戦闘が継続している(離脱扱いになっていない)");
}

console.log("── 回復薬: 撃破時の付与数はitemOnDefeatCount(データ駆動)に従う");
{
  eng.restoreGame({
    state: {
      ...initialState(), sceneIndex: 1, hp: 10, maxHp: 10, healPotions: 0,
      // dc=1なのでd20=1(ファンブル)以外は必ず命中する。hp=1なので初撃で倒せる
      enemy: { name: "錆喰い", trait: "", hp: 1, maxHp: 1, defenseDc: 1, identified: true,
        itemOnDefeat: "回復薬", itemOnDefeatCount: 3 }
    },
    chron: [], history: [], revealed: []
  });
  for (let i = 0; i < 5 && readSaved().enemy; i++) await say("攻撃する");
  const s = readSaved();
  check(!s.enemy, "前提条件: 敵を倒せた");
  check(s.healPotions === 3, "itemOnDefeatCount(3)どおりに付与された", `実際は${s.healPotions}`);
}

console.log("── 回復薬: itemOnDefeatCount未指定なら既定の1個");
{
  eng.restoreGame({
    state: {
      ...initialState(), sceneIndex: 1, hp: 10, maxHp: 10, healPotions: 0,
      enemy: { name: "錆喰い", trait: "", hp: 1, maxHp: 1, defenseDc: 1, identified: true,
        itemOnDefeat: "回復薬" }
    },
    chron: [], history: [], revealed: []
  });
  for (let i = 0; i < 5 && readSaved().enemy; i++) await say("攻撃する");
  const s = readSaved();
  check(!s.enemy, "前提条件: 敵を倒せた");
  check(s.healPotions === 1, "itemOnDefeatCount未指定なら1個", `実際は${s.healPotions}`);
}

/* 場面5のlootで手に入れた回復薬が飲めるか。2026-08-19の実プレイで、鞄には見えるのに
   「回復薬はもう残っていない」と断られた。原因は入手経路が state.inventory へ入れており、
   使用側が見る state.healPotions を増やしていなかったこと(入手の入口が4箇所あった)。
   itemOnDefeat経路だけを検査していたため、この経路が素通りしていた */
console.log("── 回復薬: lootで入手したものが飲める(入手と使用が同じ在庫を見る)");
{
  const { SCENARIO } = await import("../scenario.js");
  const sceneIdx = SCENARIO.scenes.findIndex(s => String(s.id) === "5");
  check(sceneIdx >= 0, "前提条件: 場面5が存在する");
  eng.restoreGame({
    state: { ...initialState(), sceneIndex: sceneIdx, hp: 5, maxHp: 10, healPotions: 0, enemy: null },
    chron: [], history: [], revealed: ["s5c"] // lootのrequiresを満たしておく
  });
  await say("回復薬を受け取る");
  let s = readSaved();
  check(s.healPotions === 1, "入手で所持数が1になる", `実際は${s.healPotions}`);
  const bag = Object.values(s.inventory || {}).flat();
  check(!bag.includes("回復薬"), "inventory側には入れない(表示は個数から合流させるため)", `実際は${JSON.stringify(bag)}`);
  await say("回復薬を飲む");
  s = readSaved();
  check(s.healPotions === 0, "飲んで所持数が0になる", `実際は${s.healPotions}`);
  check(s.hp === 7, "HPが5→7へ回復する", `実際は${s.hp}`);
}

console.log("── 回復薬: 満タンなら消費しない");
{
  eng.restoreGame({
    state: { ...initialState(), sceneIndex: 1, hp: 10, maxHp: 10, healPotions: 1, enemy: null },
    chron: [], history: [], revealed: []
  });
  await say("回復薬を飲む");
  const s = readSaved();
  check(s.healPotions === 1, "満タン時は所持数が減らない", `実際は${s.healPotions}`);
  check(s.hp === 10, "満タン時はHPが変わらない", `実際は${s.hp}`);
}

console.log("── 回復薬: 持っていなければ回復しない(在庫0でLLMに回復させない)");
{
  eng.restoreGame({
    state: { ...initialState(), sceneIndex: 1, hp: 5, maxHp: 10, healPotions: 0, enemy: null },
    chron: [], history: [], revealed: []
  });
  await say("回復薬を飲む");
  const s = readSaved();
  check(s.healPotions === 0, "所持数0のまま", `実際は${s.healPotions}`);
  check(s.hp === 5, "HPが変わらない", `実際は${s.hp}`);
  const last = getSnapshot().gmBubble.text;
  check(last.includes("残っていない"), "在庫切れを明示して断る", `実際は「${last}」`);
}

console.log("── 回復薬: 戦闘中に在庫0で使おうとしても回復しない");
{
  eng.restoreGame({
    state: { ...initialState(), sceneIndex: 1, hp: 5, maxHp: 10, healPotions: 0,
      enemy: { name: "坑道蝙蝠", identified: true, sprite: "bat.png", hp: 5, maxHp: 5, ac: 12, dmg: "1d2" } },
    chron: [], history: [], revealed: []
  });
  await say("回復薬を使う");
  const s = readSaved();
  check(s.healPotions === 0, "所持数0のまま(戦闘中)", `実際は${s.healPotions}`);
  check(s.hp <= 5, "HPが増えない(戦闘中)", `実際は${s.hp}`);
}

console.log(`\nPASS: ${passed}/${passed + failures.length} 件`);
if (failures.length) { console.log("\n失敗:"); failures.forEach(f => console.log(`  - ${f}`)); process.exit(1); }
