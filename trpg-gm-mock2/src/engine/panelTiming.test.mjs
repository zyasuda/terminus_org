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
/* 待ち時間を1/20にして走らせる。0msへ潰すと、入れ子の深さが違うタイマー同士の
   前後が実際と入れ替わる。2026-08-21に実際に起きた: 暗転の「止め」を入れて明転が
   fadeThroughBlack内の入れ子タイマーになった途端、advanceScene直下の語り出しの方が
   先に発火し、「到着の語りは幕が上がった後」が誤って落ちた(実時間では
   暗転600ms→止め800ms→語り1400msで順番は正しい)。
   20分の1なら相対的な前後は本番と同じで、通しでも2秒弱で終わる */
const TIME_SCALE = 20;
globalThis.setTimeout = (fn, ms = 0, ...rest) =>
  realSetTimeout(fn, Math.ceil((Number(ms) || 0) / TIME_SCALE), ...rest);
const tick = () => new Promise(r => realSetTimeout(r, 0));
const sleep = ms => new Promise(r => realSetTimeout(r, ms));
// 実時間で待つ(1/20した待ちが全部片付くまで)。tickの回数では足りない
const settle = async (ms = 1500) => { await sleep(ms); };

const eng = await import("./index.js");
const { getSnapshot, subscribe } = await import("./store.js");

/* 暗転の順番を記録する(2026-08-21)。setTimeoutを0msへ潰しているので長さは測れないが、
   「幕が降りる → 背景が入れ替わる → 幕が上がる → 語り始める」という順番は保たれる。
   背景が幕の外で入れ替わったら、プレイヤーには切り替えが素見えする——それが回帰 */
const fadeLog = [];
// 初期値は現在のsnapshotから取る(nullで始めると、最初の通知が幕の動きに見えてしまう)
let seenBg = "", seenCurtain = getSnapshot().curtain, seenGm = "";
subscribe(() => {
  const s = getSnapshot();
  const bg = (String(s.sceneBg).match(/images\/([^"]+)/) || [, "(無地)"])[1];
  if (s.curtain !== seenCurtain) fadeLog.push({ ev: s.curtain ? "幕降りる" : "幕上がる", curtain: s.curtain, fade: s.curtainFade });
  if (bg !== seenBg) fadeLog.push({ ev: "背景", bg, curtain: s.curtain, fade: s.curtainFade });
  if (s.gmBubble.text && s.gmBubble.text !== seenGm) fadeLog.push({ ev: "GM", text: s.gmBubble.text.slice(0, 16), curtain: s.curtain });
  seenCurtain = s.curtain; seenBg = bg; seenGm = s.gmBubble.text;
});

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
  for (let i = 0; i < 600; i++) {
    await sleep(5); // 1/20した待ちが進むよう実時間で回す
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

console.log("\n── 暗転の順番: 背景が入れ替わるのは幕が降りている間だけ");
{
  const bgSwaps = fadeLog.filter(e => e.ev === "背景" && e.bg !== "(無地)");
  const mine = bgSwaps.find(e => /mine_entrance/.test(e.bg));
  check("場面1の背景へ入れ替わっている", Boolean(mine),
    bgSwaps.map(e => e.bg).join(" / "));
  check("その入れ替えは幕が降りている間に起きている", Boolean(mine && mine.curtain === true),
    `curtain=${mine && mine.curtain}`);
  const i = fadeLog.indexOf(mine);
  const lift = fadeLog.findIndex((e, k) => k > i && e.ev === "幕上がる");
  check("入れ替えの後に幕が上がる", lift > i, `幕上がるの位置=${lift} 入れ替え=${i}`);
  const arrival = fadeLog.findIndex((e, k) => k > i && e.ev === "GM" && /第1話/.test(e.text || ""));
  check("到着の語りは幕が上がった後", arrival > lift && lift !== -1,
    fadeLog.slice(i, i + 6).map(e => e.ev + (e.text ? `「${e.text}」` : "")).join(" → "));
  /* イントロも同じ扱い。最初の幕の動きが「降りる」で、イントロの語りより前にあること。
     以前はポップアップの無い章で幕を張らず、イントロが黒を経ずに現れていた */
  /* 「最初から」の不具合(2026-08-21 作者の指摘「マイラの部屋が表示されてから
     フェードインが始まる」)。resetGameが幕より先に背景を差し替えていたため、
     暗転の0.6秒で暗くなっていくのは「これから見せる場面」だった。
     イントロの背景が現れるスナップショットで、幕が既に降りていることを見る */
  const introBg = fadeLog.find(e => e.ev === "背景" && /myra_room/.test(e.bg || ""));
  check("イントロの背景はもう幕が降りてから差し替わる", Boolean(introBg && introBg.curtain === true),
    introBg ? `curtain=${introBg.curtain} fade="${introBg.fade}"` : "イントロの背景が記録されていない");
  check("「最初から」の暗転は遷移なし(instant)", Boolean(introBg && introBg.fade === "instant"),
    introBg ? `fade="${introBg.fade}"` : "(記録なし)");
  const firstCurtain = fadeLog.findIndex(e => e.ev === "幕降りる" || e.ev === "幕上がる");
  const firstGm = fadeLog.findIndex(e => e.ev === "GM");
  check("イントロは幕が降りるところから始まる",
    firstCurtain !== -1 && fadeLog[firstCurtain].ev === "幕降りる" && firstCurtain < firstGm,
    fadeLog.slice(0, 5).map(e => e.ev).join(" → "));
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
  check("アウトロも暗転してから入る(fadeThroughBlackを通る)",
    engineSrc.includes("fadeThroughBlack(() => showDialogueNode(chapterEnding))"));
  /* 幕のCSS。2026-08-21に一度壊した箇所なので、状態ごとに分けて固定する。
     暗転する側(.liftedなし)に visibility の遷移を書くと、delay 0.6s のあいだ
     visibility:hidden が残り、黒が一度も描画されない=暗転が見えない。
     このときの実測値は transition-delay="0s, 0.6s"。作者の環境で
     「最初からを押してもフェードインしない」として発覚した。
     opacityの有無しか見ていなかったため、前の検査はこれを通してしまった */
  const cssLines = fs.readFileSync(path.join(HERE, "..", "styles.css"), "utf8").split("\n");
  const ruleLine = sel => cssLines.find(l => l.trim().startsWith(sel + " {")) || "";
  check("暗転の長さはengineのSCENE_FADE_MSと同じ0.6s",
    /const SCENE_FADE_MS = 600;/.test(engineSrc) && /opacity \.6s/.test(ruleLine("#curtain.quick")));
  check("暗転する側(#curtain.quick)にvisibilityの遷移を書かない",
    ruleLine("#curtain.quick") !== "" && !/visibility/.test(ruleLine("#curtain.quick")),
    ruleLine("#curtain.quick").trim());
  check("明転する側(#curtain.quick.lifted)はvisibilityを0.6s遅らせて隠す",
    /visibility 0s \.6s/.test(ruleLine("#curtain.quick.lifted")),
    ruleLine("#curtain.quick.lifted").trim());
  /* 色。クラス無しの幕は var(--frame-bg)=#24283a(枠の色)で、場面の暗転に使うと
     作者から「フェード中が灰色」という指摘になった(2026-08-21)。真っ黒を固定する */
  check("場面の暗転は真っ黒(#000)",
    /#curtain\.quick,\s*#curtain\.instant\s*\{[^}]*background:\s*#000/.test(cssLines.join("\n")),
    ruleLine("#curtain.quick, #curtain.instant").trim());
  /* instant: 降りる側に遷移を付けると、resetGameが差し替えた次の場面が0.6秒かけて
     暗くなる様子が見える。降りるのは即時、上がるのだけ0.6s */
  check("instantは降りる側が遷移なし",
    /transition:\s*none/.test(ruleLine("#curtain.instant")), ruleLine("#curtain.instant").trim());
  check("instantも明転は0.6s",
    /opacity \.6s/.test(ruleLine("#curtain.instant.lifted")), ruleLine("#curtain.instant.lifted").trim());
}

console.log(fail ? `\n${fail}件 失敗` : "\n全て通過");
process.exit(fail ? 1 : 0);
