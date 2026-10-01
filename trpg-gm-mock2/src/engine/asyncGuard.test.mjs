/* 非同期の混入・リセット時の破損・進行に必要な品の保護の検査。
 * すべて Codexレビュー(2026-08-20)で指摘され、こちらで再現を確認した不具合。
 *
 * 検査1: 「最初から」の後に、旧ゲームのNPCの一言が新ゲームへ混入しない
 *        (turnGuardが手番番号だけを見ていた。resetで手番が0に戻るため一致し得た)
 * 検査2: シーン遷移後に、前のシーンの開示の余韻(revealFlavor)が出ない
 * 検査3: 判定待ちの最中に「最初から」を押しても、旧ターンが待ち続けない
 * 検査4: LLMのremove_itemsで、出口の前提になっている品を失わない
 * 検査5: 導入で作者が渡す品(intro.exits[].addItems)が実際に入る
 *
 * 遅延応答を再現するのが要点。既存の検査はAPIを即時に返していたため、
 * 「応答が届くまでに場面が変わる」経路を1つも通っていなかった。
 *
 * 使い方: node src/engine/asyncGuard.test.mjs
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
mem.set("terminus_gm_mode_v1", "hybrid"); // 非同期の一言はLLMレーンで起きる

/* LLMの返事を、こちらが解放するまで保留できるスタブ。
   これが無いと「応答が届く前に場面が変わる」状況を作れない */
const pending = [];
/* 本編の応答に state_updates.remove_items を混ぜたい手番だけ、ここへ品名を置く。
   LLMが「その品を手放した」と言ってきた状況の再現に使う */
let llmRemoveItems = null;
let npcCalls = 0;
function llmReply(body) {
  const system = String(body.system || "");
  if (system.startsWith("プレイヤーの宣言を分類する")) {
    return { intent: "other", target: null, named: null, actor: "player" };
  }
  if (system.startsWith("ソロTRPGの同行者として")) {
    const who = system.match(/同行者: ([^=\s]+)=/)?.[1] || "member_1";
    return { who, say: "これは前の場面の余韻である" };
  }
  // 何回目の呼び出しかを台詞に入れる。旧ゲームの応答と新ゲームの応答を区別するため
  if (system.startsWith("ソロTRPGの登場人物")) return { say: `これは${++npcCalls}回目の呼び出しの一言である` };
  return { narration: "(スタブ)", companion: null, npc: null, check: null,
    state_updates: llmRemoveItems ? { remove_items: llmRemoveItems } : null,
    engage_enemy: false, flee_enemy: false, scene_complete: false, meta_request: null };
}
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.startsWith("/data/")) {
    const file = path.join(PUBLIC_DIR, u);
    if (!fs.existsSync(file)) return { ok: false, status: 404, json: async () => null };
    return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(file, "utf8")) };
  }
  if (u.startsWith("/api/gm")) {
    const body = JSON.parse(init?.body || "{}");
    const system = String(body.system || "");
    const response = { ok: true, status: 200, json: async () => ({ content: [{ text: JSON.stringify(llmReply(body)) }], usage: {} }) };
    // 分類器と本編は即時。NPC・同行者の一言だけ保留して、後から届かせる
    if (system.startsWith("ソロTRPGの登場人物") || system.startsWith("ソロTRPGの同行者として")) {
      return new Promise(resolve => pending.push(() => resolve(response)));
    }
    return response;
  }
  return { ok: false, status: 503, json: async () => ({}) };
};

let seed = 20260820 % 0x7fffffff;
Math.random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, _ms, ...rest) => realSetTimeout(fn, 0, ...rest);
const tick = () => new Promise(r => realSetTimeout(r, 0));
const settle = async (n = 80) => { for (let i = 0; i < n; i++) await tick(); };

const eng = await import("./index.js");
const { getSnapshot } = await import("./store.js");

let fail = 0;
function check(label, cond, detail) {
  console.log((cond ? "  ok  " : "  NG  ") + label);
  if (!cond) { fail++; if (detail) console.log("        " + detail); }
}
async function say(text) {
  let done = false;
  const p = eng.sendAction(text).then(() => { done = true; }, () => { done = true; });
  for (let i = 0; i < 2000 && !done; i++) {
    await tick();
    if (getSnapshot().pendingRoll) eng.performRoll();
    if (getSnapshot().popups.length) eng.dismissPopup();
  }
  await p;
  await settle(20);
}
const spoken = () => getSnapshot().chat.map(e => e.text || "").join(" | ");

await eng.boot();
await tick();

/* ── 検査1: リセットを跨いだ混入
   手番番号だけで新旧を見分けようとすると、ここで破れる。旧ゲームの1手番目の応答と、
   新ゲームの1手番目が同じ番号になるため。だから新ゲームでも1手番を進めてから、
   旧ゲームの応答を届かせる */
console.log("── 1. 「最初から」の後に旧ゲームの一言が混入しない");
await say("空を見上げる");                  // 旧ゲームの1手番目。マイラの一言(1回目)が保留される
check("前提: 応答が保留されている", pending.length > 0, `保留 ${pending.length}件`);
const oldReply = pending.splice(0);         // 旧ゲームの応答を手元に取っておく
eng.resetGame();
await settle();
await say("空を見上げる");                  // 新ゲームの1手番目(手番番号は旧と同じ1)
pending.splice(0);                           // 新ゲーム側の応答は今回使わない
oldReply.forEach(release => release());      // 旧ゲームの応答が、ここで届く
await settle();
check("旧ゲームの一言(1回目の呼び出し)が新ゲームに出ていない",
  !spoken().includes("これは1回目の呼び出しの一言である"), spoken().slice(-240));

// ── 検査5: 導入で作者が渡す品
console.log("\n── 5. 導入の支度品が入る");
const heldNames = () => Object.values(getSnapshot().inventoryByOwner || [])
  .flatMap(row => row.items || []).join(",");
await say("受ける");
await settle();
check("「干し肉と水袋」を持っている", heldNames().includes("干し肉と水袋"), `所持品: ${heldNames()}`);

// ── 検査2: シーン遷移を跨いだ余韻の混入
console.log("\n── 2. シーン遷移後に前の場面の余韻が出ない");
pending.splice(0); // ここまでの保留は捨てる
await say("木の札を調べる");                 // 開示成功 → revealFlavorが保留される
const flavorHeld = pending.length;
await say("進む");                            // シーン2へ
await settle();
pending.splice(0).forEach(release => release());
await settle();
check(`前提: 余韻の応答が保留されていた（${flavorHeld}件）`, flavorHeld > 0);
check("前の場面の余韻が出ていない", !spoken().includes("これは前の場面の余韻である"),
  spoken().slice(-200));

/* ── 検査4: 進行に必要な品を失わない
   LLMが state_updates.remove_items でその品を捨てたと言ってくる状況を作る。
   章1は「心石の欠片」を シーン3→4 と終端で要求するので、これを守れないと
   章を完了できなくなる。守らない品(ここでは導入の支度品)は従来どおり手放せること
   も同時に見る——守りすぎると物語上の消費ができなくなる */
console.log("\n── 4. 出口の前提になっている品だけを守る");
{
  const scenarioMod = await import("../scenario.js");
  const SCENARIO = scenarioMod.SCENARIO;
  const required = [...new Set([SCENARIO.intro, SCENARIO.ending, ...(SCENARIO.scenes || [])]
    .flatMap(node => ((node && node.exits) || []))
    .flatMap(e => [...((e.requires || {}).itemsAll || []), ...((e.requires || {}).itemsAny || [])]))];
  check(`前提: 出口が品を要求している（${JSON.stringify(required)}）`, required.length > 0);

  const guarded = required[0];
  llmRemoveItems = [guarded];   // 守るべき品を捨てさせようとする
  await say(`${guarded}を袋にしまう`);
  llmRemoveItems = null;
  const note = getSnapshot().chat.map(e => e.text || "").join(" | ");
  check(`「${guarded}」の削除を却下した記録が残る`, note.includes(`「${guarded}」は進行に必要`),
    note.slice(-200));

  // 守らない品は手放せる(導入の支度品)
  llmRemoveItems = ["干し肉と水袋"];
  await say("干し肉と水袋を置いていく");
  llmRemoveItems = null;
  check("守っていない品は従来どおり手放せる", !heldNames().includes("干し肉と水袋"),
    `所持品: ${heldNames()}`);
}

/* ── 検査3: 判定待ちの最中にリセットしても旧ターンが待ち続けない
   requestPlayerRollのresolverは1つしか持てず、リセットで解除していなかったため、
   待っていた手番のPromiseが永久に未解決のまま残っていた(Codexレビュー2026-08-20)。
   ここでは say() を使わない——あれは判定を自動で振ってしまうので、待ち状態を作れない */
console.log("\n── 3. 判定待ちの最中にリセットしても旧ターンが終わる");
{
  let settled = false;
  const turn = eng.sendAction("柵を調べる").then(() => { settled = true; }, () => { settled = true; });
  for (let i = 0; i < 500 && !getSnapshot().pendingRoll; i++) await tick();
  check("前提: 判定待ちになっている", Boolean(getSnapshot().pendingRoll),
    `pendingRoll: ${JSON.stringify(getSnapshot().pendingRoll)}`);
  eng.resetGame();
  for (let i = 0; i < 500 && !settled; i++) await tick();
  check("旧ターンが終了した(永久に待たない)", settled);
  check("判定待ちの表示が消えている", !getSnapshot().pendingRoll);
  check("入力できる状態に戻っている(busyでない)", getSnapshot().busy === false);
  // リセット後にダイスを振られても、旧ターンを起こさない
  eng.performRoll(20);
  await settle(20);
  check("捨てた判定にダイスを振っても何も起きない", !getSnapshot().pendingRoll);
  check("通信エラーとして扱われていない",
    !getSnapshot().chat.some(e => String(e.text || "").includes("通信エラー")),
    getSnapshot().chat.map(e => e.text).slice(-3).join(" | "));
  await turn;
}

console.log(fail ? `\n${fail}件 失敗` : "\n全て通過");
process.exit(fail ? 1 : 0);
