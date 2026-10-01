/* 吹き出しは常に1つだけ、という不変条件の検査。
   2026-08-19: 立ち絵を続けて叩くと、GM・マイラ・同行者の古い発言が同時に並んでいた
   (replay*Bubbleが前の吹き出しを消さずhidden=falseにするだけだった)。
   前の話者を消す責任を呼び出し側に置く設計は破れるため、出す側(addGm/addNpc/addCompanion/
   replay*)で一本化した。ここではその出す側だけを直接叩いて確認する。

   使い方: node src/engine/bubble.test.mjs */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(HERE, "..", "..", "public");

const mem = new Map();
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k)
};
globalThis.location = { search: "" };
mem.set("terminus_gm_mode_v1", "scripted");
globalThis.fetch = async url => {
  const rel = String(url).replace(/^https?:\/\/[^/]+/, "").replace(/^\//, "");
  const file = path.join(PUBLIC_DIR, rel);
  if (!fs.existsSync(file)) throw new Error(`未対応のfetch: ${url}`);
  return { ok: true, json: async () => JSON.parse(fs.readFileSync(file, "utf8")) };
};

const { getSnapshot, setStore } = await import("./store.js");
const eng = await import("./index.js");

let fail = 0;
function check(label, cond) {
  console.log((cond ? "OK   " : "FAIL ") + label);
  if (!cond) fail++;
}
// 表示されている吹き出しの話者一覧。App.jsxの描画条件(text があり hidden でない)と同じ
function visible() {
  const s = getSnapshot();
  const out = [];
  if (s.gmBubble.text && !s.gmBubble.hidden) out.push("gm");
  if (s.npcBubble.text && !s.npcBubble.hidden) out.push("npc");
  Object.entries(s.companionBubbles).forEach(([who, b]) => {
    if (b && b.text && !b.hidden) out.push(who);
  });
  return out;
}

// 3者ぶんの過去発言を仕込む(セーブからの復元と同じ状態)
setStore({
  gmBubble: { text: "坑道の奥から音が響いている。", emotion: "Neutral", hidden: true, seq: 1 },
  npcBubble: { text: "確かめてくれるなら『受ける』って言ってよ。", hidden: true, seq: 1 },
  companionBubbles: {
    member_1: { text: "無茶をしないで、ガレス。", hidden: true, seq: 1 },
    member_2: { text: "俺が前に出る。", hidden: true, seq: 1 }
  }
});
check("仕込み直後は誰も出ていない", visible().length === 0);

// 立ち絵を続けて叩く(画面の再現: リディア→ガレス→リディア→マイラ→GM)
const taps = [
  () => eng.replayCompanionBubble("member_1"),
  () => eng.replayCompanionBubble("member_2"),
  () => eng.replayCompanionBubble("member_1"),
  () => eng.replayNpcBubble(),
  () => eng.replayGmBubble()
];
taps.forEach((tap, i) => {
  tap();
  const v = visible();
  check(`${i + 1}回目のタップ後も吹き出しは1つ (実際: ${v.length}件 ${v.join(",")})`, v.length === 1);
});
check("最後に叩いたGMが出ている", visible()[0] === "gm");

/* 未発言の同行者(CAST[who].idleLineで受け答えする経路)はここでは叩かない。
   章データを読み込んでいないためCASTがnullで、replayCompanionBubbleの外で落ちる。
   その経路も同じhiddenBubblesを通るので、不変条件は上の5回で押さえられている */

console.log(fail ? `\n${fail}件 失敗` : "\n全て通過");
process.exit(fail ? 1 : 0);
