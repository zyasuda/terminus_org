/* 空転が続いたとき、GMが1度だけ促すことの検査。
 *
 * 2026-08-20の実プレイ(88手番)では、シーン6で「周辺を調べる」「隙間を調べる」が
 * 空振りし続け、進める語も分からないまま手番が溶けていた。既存の停滞ナッジは
 * LLMへのプロンプト追記だけで、scriptedでは何も起きなかった。
 *
 * ここで確かめること:
 *   - LLMを1度も呼ばない(scriptedの契約)
 *   - 促す語は、作者が場面説明へ書いた語である(シナリオに無い語を作らない)
 *   - 1つの場面で2度は言わない(答えを配らない)
 *
 * 使い方: node src/engine/stagnationHint.test.mjs
 */
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
mem.set("terminus_gm_mode_v1", "scripted");

const llmCalls = [];
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.startsWith("/data/")) {
    const file = path.join(PUBLIC_DIR, u);
    if (!fs.existsSync(file)) return { ok: false, status: 404, json: async () => null };
    return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(file, "utf8")) };
  }
  if (u.startsWith("/api/gm")) { llmCalls.push(String(JSON.parse(init?.body || "{}").system || "").slice(0, 50)); }
  return { ok: false, status: 503, json: async () => ({}) };
};

let seed = 20260820 % 0x7fffffff;
Math.random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, _ms, ...rest) => realSetTimeout(fn, 0, ...rest);
const tick = () => new Promise(r => realSetTimeout(r, 0));

const eng = await import("./index.js");
const { getSnapshot } = await import("./store.js");
const scenarioMod = await import("../scenario.js"); // SCENARIOはboot後に入るので、束縛はモジュール越しに読む

let fail = 0;
function check(label, cond, detail) {
  console.log((cond ? "  ok  " : "  NG  ") + label);
  if (!cond) { fail++; if (detail) console.log("        " + detail); }
}

await eng.boot();
await tick();

async function say(text) {
  let settled = false;
  const p = eng.sendAction(text).then(v => { settled = true; return v; }, () => { settled = true; });
  for (let i = 0; i < 2000 && !settled; i++) {
    await tick();
    if (getSnapshot().pendingRoll) eng.performRoll();
    if (getSnapshot().popups.length) eng.dismissPopup();
  }
  await p;
  for (let i = 0; i < 60; i++) await tick(); // 促しは手番の外(非同期)で来る
}
const gmLines = () => getSnapshot().chat.filter(e => e.kind === "msg" && e.cls === "gm").map(e => e.text);

const VAGUE = "調べていないものがあるみたいだね。";
const NAMED = /^(.+)は、まだ確かめていないね。$/;
const chips = () => getSnapshot().revealedEntities;

// 導入を抜けてシーン1へ入る
await say("受ける");
const scene1 = scenarioMod.SCENARIO.scenes[0];
check(`前提: シーン1にいる（${scene1.name}）`, getSnapshot().sceneInfo.num === 1);

/* 何も起きない宣言を繰り返す。「周辺を調べる」は空振りする(秘密に当たらない)ので
   状態指紋が変わらず、空転として数えられる。1手番ずつ、どの段で何が出るかを見る */
const seen = [];
for (let i = 1; i <= 6; i++) {
  const before = gmLines().length;
  await say("周辺を調べる");
  const line = gmLines().slice(before).find(t => t === VAGUE || NAMED.test(t)) || "";
  seen.push({ 空転: i, 促し: line });
}
console.log("      " + JSON.stringify(seen, null, 0));

/* 段の順番で見る。絶対の手番数では見ない——導入の同行者の返事が手番の外で着地するため、
   場面へ入った直後の1手番は状態が動いており(空転ではない)、数え始めが1つずれる */
const fired = seen.filter(s => s.促し);
check("LLMを1度も呼んでいない", llmCalls.length === 0, llmCalls.join(" / "));
check("最初の2手番では促さない", !seen[0].促し && !seen[1].促し);
check(`促しは2回だけ（実際 ${fired.length}回）`, fired.length === 2, JSON.stringify(fired));
check(`1段目はぼかした一言（${JSON.stringify(fired[0]?.促し)}）`, fired[0]?.促し === VAGUE);
check(`2段目は名指し（${JSON.stringify(fired[1]?.促し)}）`, NAMED.test(fired[1]?.促し || ""));
check("2段目は1段目の次の手番で来る",
  fired.length === 2 && fired[1].空転 === fired[0].空転 + 1,
  `1段目=${fired[0]?.空転}手番 / 2段目=${fired[1]?.空転}手番`);

const named = ((fired[1]?.促し || "").match(NAMED) || [])[1] || "";
{
  const vocab = (scene1.secrets || []).flatMap(s => [s.entity, ...(s.aliases || [])]);
  check(`名指しした「${named}」がシナリオの語である（作った語ではない）`, vocab.includes(named),
    `語彙: ${JSON.stringify(vocab)}`);
  check(`名指しした「${named}」がチップに出ている`, chips().includes(named),
    `チップ: ${JSON.stringify(chips())}`);
}

// 前進している間は促さない(場面1の秘密を開けて、その手番前後で出ないこと)
{
  const before = gmLines().length;
  await say("木の札を調べる");
  const nagged = gmLines().slice(before).filter(t => t === VAGUE || NAMED.test(t));
  check("前進した手番では促さない", nagged.length === 0);
}

/* シーン2は、出口の前提(崩れた坑道・抜け道)がどちらも場面説明に無い。
   場面説明の語(封鎖の木柵)は既にチップなので、それを名指ししても詰まりは解けない。
   出口の前提になっている秘密を先に名指しすること、そして usage:"event" の
   「抜け道」(調べても開かない)を名指ししないことを確かめる */
{
  await say("進む");
  const scene2 = scenarioMod.SCENARIO.scenes[1];
  check(`前提: シーン2にいる（${scene2.name}）`, getSnapshot().sceneInfo.num === 2);
  let line = "";
  for (let i = 0; i < 4 && !NAMED.test(line); i++) {
    const before = gmLines().length;
    await say("周辺を調べる");
    line = gmLines().slice(before).find(t => NAMED.test(t)) || line;
  }
  const word = (line.match(NAMED) || [])[1] || "";
  const gated = new Set((scene2.exits || []).flatMap(e => (e.requires && e.requires.secretsAll) || []));
  const target = (scene2.secrets || []).find(s => s.entity === word || briefWordOf(s, scene2) === word);
  check(`シーン2で名指ししたのは出口の前提「${word}」`, Boolean(target) && gated.has(target.id),
    `出口の前提: ${JSON.stringify([...gated])} / 名指し: ${word}(${target?.id})`);
  check(`「${word}」は調べて開く秘密である（usage:"event"を名指ししない）`, target?.usage !== "event");
  check(`「${word}」がチップに出ている`, chips().includes(word), `チップ: ${JSON.stringify(chips())}`);
}
function briefWordOf(secret, scene) {
  return [secret.entity, ...(secret.aliases || [])].find(w => (scene.brief || "").includes(w)) || "";
}

console.log(fail ? `\n${fail}件 失敗` : "\n全て通過");
process.exit(fail ? 1 : 0);
