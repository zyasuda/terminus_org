/* 秘密の開示テキストが台詞(「…」)の時、GMではなくNPCが喋ることの検査。

   2026-08-19: 導入(マイラの部屋)で「金属音」を調べると、GMペットが
   「坑道の奥から微かに響いているわ。……わたしには分からない」と女性語で語っていた。
   原因はデータではなく表示経路。作者は導入の秘密を「マイラに尋ねた答え」として
   台詞で書いており(章1 intro_sound / intro_map / intro_mine)、それを
   addGm(地の文)へ流していた。campaign.jsonのstyle.narrationは「である調」を
   指示しているので、LLMの語り口ではなくこの経路が原因だと切り分けられる。

   ブラウザAPIの代役・タイマー即時化・判定の代打ちは playthrough.test.mjs と同じ作りにする。

   使い方: node src/engine/revealVoice.test.mjs */
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
mem.set("terminus_gm_mode_v1", "scripted"); // LLM呼び出しゼロで回す(importより前に置く)
globalThis.fetch = async url => {
  const u = String(url);
  if (u.startsWith("/data/")) {
    const file = path.join(PUBLIC_DIR, u);
    if (!fs.existsSync(file)) return { ok: false, status: 404, json: async () => null };
    return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(file, "utf8")) };
  }
  if (u.startsWith("/api/gm")) throw new Error("scriptedモードなのにLLMを呼んだ");
  return { ok: false, status: 503, json: async () => ({}) }; // /api/model-info 等
};

let seed = 20260819 % 0x7fffffff;
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

function drainPopups() {
  let guard = 0;
  while (getSnapshot().popups.length && guard++ < 50) eng.dismissPopup();
}
// 1手番。判定要求はプレイヤーのクリック待ちなので代わりに振る(ブラウザの「ダイスを振る!」と同じ)
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
  await tick();
}

const ch = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, "data/campaigns/lanternhill/chapter_01.json"), "utf8"));
const sec = (ch.intro.secrets || []).find(x => x.id === "intro_sound");
check("前提: 章データの intro_sound が台詞のまま書かれている",
  Boolean(sec) && /^「[\s\S]*」$/.test(String(sec.text).trim()));
const quoted = String(sec.text).replace(/^「|」$/g, "").slice(0, 12);

const gmBefore = getSnapshot().gmBubble.text;
await say("金属音を調べる");

const s = getSnapshot();
check(`NPC(マイラ)の吹き出しが台詞を喋る (実際: 「${s.npcBubble.text}」)`, s.npcBubble.text.includes(quoted));
check("鉤括弧は外して出す(吹き出しの中で二重にしない)", !s.npcBubble.text.startsWith("「"));
check(`GMの吹き出しが台詞を語らない (実際: 「${s.gmBubble.text}」)`, !String(s.gmBubble.text).includes(quoted));
check("GMの吹き出しは更新されない(語る内容が無いので黙る)", s.gmBubble.text === gmBefore);
check("吹き出しは1つだけ見えている",
  [s.gmBubble, s.npcBubble, ...Object.values(s.companionBubbles)]
    .filter(b => b && b.text && !b.hidden).length === 1);

// 開示済みをもう一度確かめた時も、地の文の前置きを付けてGMに喋らせない
await say("金属音を調べる");
const s2 = getSnapshot();
check(`再確認でもNPCが言い直す (実際: GM「${s2.gmBubble.text}」/ マイラ「${s2.npcBubble.text}」)`,
  !String(s2.gmBubble.text).includes("改めて確かめる。「"));

console.log(fail ? `\n${fail}件 失敗` : "\n全て通過");
process.exit(fail ? 1 : 0);
