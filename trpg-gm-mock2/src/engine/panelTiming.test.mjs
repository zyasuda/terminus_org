/* 下パネル(会話ペイン)は「語りが終わってから」開く、の検査。
 *
 * 2026-08-21 作者の要望: 場面が切り替わった直後、GM・NPC・同行者の吹き出しを読んでいる
 * 途中で下パネルが上がってきて主画面が狭くなる。語り終わるまで閉じたままにしてほしい。
 * 以前は showSceneOverlay / openUnderPanelAfterOverlay が「1秒後に開く」固定タイマーで、
 * 語りの長さと無関係に開いていた。
 *
 * ここで確かめること:
 *   - イントロ(会話ノード)に入った瞬間は閉じている / 語り終わったら開く
 *   - 場面遷移でも同じ
 *   - アウトロも同じ経路(showDialogueNode)を通る
 * setTimeoutを0msへ潰して測るので、待ち時間の長さではなく「順番」を見ている。
 *
 * 使い方: node src/engine/panelTiming.test.mjs
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
globalThis.fetch = async url => {
  const u = String(url);
  if (u.startsWith("/data/")) {
    const file = path.join(PUBLIC_DIR, u);
    if (!fs.existsSync(file)) return { ok: false, status: 404, json: async () => null };
    return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(file, "utf8")) };
  }
  return { ok: false, status: 503, json: async () => ({}) };
};
let seed = 20260821 % 0x7fffffff;
Math.random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, _ms, ...rest) => realSetTimeout(fn, 0, ...rest);
const tick = () => new Promise(r => realSetTimeout(r, 0));
const settle = async (n = 200) => { for (let i = 0; i < n; i++) await tick(); };

const eng = await import("./index.js");
const { getSnapshot } = await import("./store.js");

let fail = 0;
const check = (label, cond, detail) => {
  console.log((cond ? "  ok  " : "  NG  ") + label);
  if (!cond) { fail++; if (detail) console.log("        " + detail); }
};
const open = () => getSnapshot().underPanelOpen;

await eng.boot();
await tick();

console.log("── イントロ: 語っている間は閉じ、語り終わったら開く");
check("イントロに入った直後は閉じている", open() === false, `underPanelOpen=${open()}`);
await settle();
check("語り終わったら開く", open() === true, `underPanelOpen=${open()}`);

console.log("\n── 場面遷移: 同じ扱い");
{
  // 受諾 → 同行者の同意 → 場面へ。sendActionの解決だけを待ち、語りは待たない
  const p = eng.sendAction("受ける");
  for (let i = 0; i < 400; i++) {
    await tick();
    if (getSnapshot().pendingRoll) eng.performRoll();
    if (getSnapshot().popups.length) eng.dismissPopup();
    if (getSnapshot().sceneInfo.num === 1 && open() === false) break;
  }
  check("場面へ入った時点で閉じている", open() === false, `underPanelOpen=${open()}`);
  await p;
  await settle();
  check("到着の語りが終わったら開く", open() === true, `underPanelOpen=${open()}`);
  check(`場面説明が語られている（左パネルのGMの語り）`,
    getSnapshot().chat.some(e => e.cls === "gm" && (e.text || "").includes("古いレールと薄汚れた木の札")),
    getSnapshot().chat.filter(e => e.cls === "gm").map(e => (e.text || "").slice(0, 24)).join(" / "));
}

/* アウトロは章を完走しないと出ないので、ここでは通しプレイをやり直さない。
   代わりに「イントロと同じ関数(showDialogueNode)で表示している」ことと、
   「時間で開ける経路が残っていない」ことを固定する。イントロの振る舞いは上で
   実際に動かして確かめてあるので、同じ関数を通るならアウトロも同じになる。
   時間で開ける経路が復活したら、その瞬間にこの検査が落ちる——それが本当の歯止め */
console.log("\n── アウトロがイントロと同じ経路を通る");
{
  const engineSrc = fs.readFileSync(path.join(HERE, "index.js"), "utf8");
  const sceneUiSrc = fs.readFileSync(path.join(HERE, "scene-ui.js"), "utf8");
  check("イントロは showDialogueNode で表示する",
    engineSrc.includes("showDialogueNode(SCENARIO.intro)"));
  check("アウトロも showDialogueNode で表示する",
    engineSrc.includes("showDialogueNode(chapterEnding)"));
  check("時間で開ける経路(showSceneOverlay / openUnderPanelAfterOverlay)が残っていない",
    !/showSceneOverlay|openUnderPanelAfterOverlay/.test(engineSrc)
    && !/export function (showSceneOverlay|openUnderPanelAfterOverlay)/.test(sceneUiSrc));
  check("下パネルを開けるのは openUnderPanel だけ(setStoreで直接開けていない)",
    (sceneUiSrc.match(/underPanelOpen:\s*true/g) || []).length === 1);
}

console.log(fail ? `\n${fail}件 失敗` : "\n全て通過");
process.exit(fail ? 1 : 0);
