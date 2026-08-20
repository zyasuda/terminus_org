/* gmMode=scripted は「LLM呼び出し完全ゼロ」が契約。それを守っていることの検査。

   2026-08-20: 導入・終端ノードのNPCの一言(dialogueNodeReply)だけ gmMode を見ておらず、
   scriptedでもLLMを呼んでいた。既存の通しプレイ検査(playthrough.test.mjs)は導入を
   照合語一発で抜けるため踏んでいなかった。ここでは逆に「照合語から外れた宣言」を
   わざと投げる——人が遊ぶと必ず起きる方であり、漏れが出るのはそちら側である。

   使い方: node src/engine/scriptedNoLlm.test.mjs */
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
mem.set("terminus_gm_mode_v1", "scripted"); // importより前に置く

const llmCalls = [];
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.startsWith("/data/")) {
    const file = path.join(PUBLIC_DIR, u);
    if (!fs.existsSync(file)) return { ok: false, status: 404, json: async () => null };
    return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(file, "utf8")) };
  }
  if (u.startsWith("/api/gm")) {
    llmCalls.push(String(JSON.parse(init?.body || "{}").system || "").slice(0, 60));
    return { ok: false, status: 503, json: async () => ({}) };
  }
  return { ok: false, status: 503, json: async () => ({}) }; // /api/model-info 等
};

let seed = 20260820 % 0x7fffffff;
Math.random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, _ms, ...rest) => realSetTimeout(fn, 0, ...rest);
const tick = () => new Promise(r => realSetTimeout(r, 0));

const eng = await import("./index.js");
const { getSnapshot } = await import("./store.js");

let fail = 0;
function check(label, cond) {
  console.log((cond ? "  ok  " : "  NG  ") + label);
  if (!cond) fail++;
}

await eng.boot();
await tick();
check("gmMode が scripted で起動する", getSnapshot().gmMode === "scripted");

async function say(text) {
  let settled = false;
  const p = eng.sendAction(text).then(v => { settled = true; return v; }, () => { settled = true; });
  for (let i = 0; i < 2000 && !settled; i++) {
    await tick();
    if (getSnapshot().pendingRoll) eng.performRoll();
    if (getSnapshot().popups.length) eng.dismissPopup();
  }
  await p;
  for (let i = 0; i < 40; i++) await tick(); // 非同期の一言が届く余地を与える
}

/* 照合語から外れた宣言を並べる。導入ノード(マイラの部屋)は exits の照合語が
   「引き受け」「受ける」等なので、下の宣言はすべて外れる */
for (const text of ["相手を調べる", "マイラに話しかける", "見取り図", "金属音", "空を見る", "帰る"]) {
  await say(text);
  check(`「${text}」でLLMを呼ばない（累計 ${llmCalls.length}件）`, llmCalls.length === 0);
}

// 黙って何も返さないのは「壊れて見える」ため、必ず何か出ていること
const gmLines = getSnapshot().chat.filter(e => e.kind === "msg" && e.cls === "gm");
check(`受け皿が応答している（GMの語り ${gmLines.length}件）`, gmLines.length > 0);

if (llmCalls.length) llmCalls.forEach(s => console.log("      呼んだ: " + s));
console.log(fail ? `\n${fail}件 失敗` : "\n全て通過");
process.exit(fail ? 1 : 0);
