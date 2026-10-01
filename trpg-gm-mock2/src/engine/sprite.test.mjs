/* 立ち絵スロット(#enemySprite)の表示規則の検査。
 *
 * このスロットは敵とシーンNPC(依頼人マイラ等)で共用している。共用しているせいで、
 * 敵のために入れた演出がNPCにも当たる。2026-08-21に作者が指摘した不具合:
 * 「マイラの立ち絵がGMペットと同じように上下にゆらゆらする。不要な処理」
 * 原因は styles.css の `#enemySprite.identified` に付いた `idleSway 3.6s infinite`。
 * これは2026-08-19に戦闘の手触りとして敵へ入れたもので、立って話しているだけの
 * 依頼人が常時揺れるのは演出として誤り。敵は残し、NPCだけ止める。
 *
 * ここで確かめること:
 *   - NPC表示が本当に identified 経路を通る(だから上のCSSが当たっていた)
 *   - App.jsxが sceneNpcName から .npc を付ける
 *   - idleSway が .npc を除外する / 敵(.identified)には残っている
 *
 * 使い方: node src/engine/sprite.test.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, "..");
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

const eng = await import("./index.js");
const { getSnapshot } = await import("./store.js");

let fail = 0;
const check = (label, cond, detail) => {
  console.log((cond ? "  ok  " : "  NG  ") + label);
  if (!cond) { fail++; if (detail) console.log("        " + detail); }
};

await eng.boot();
for (let i = 0; i < 200; i++) await tick();

console.log("── NPC表示は identified 経路を通る(だから敵向けの演出が当たっていた)");
{
  const s = getSnapshot();
  check("イントロの立ち絵が出ている", Boolean(s.enemySprite), JSON.stringify(s.enemySprite));
  check("NPCとして表示している(sceneNpcNameに名前が入る)", Boolean(s.sceneNpcName), `sceneNpcName=${s.sceneNpcName}`);
  check("その立ち絵は identified=true(敵の正体判明と同じ扱い)",
    Boolean(s.enemySprite && s.enemySprite.identified === true), JSON.stringify(s.enemySprite));
}

console.log("\n── 揺れは敵だけ。NPCには効かせない");
{
  const appSrc = fs.readFileSync(path.join(SRC, "App.jsx"), "utf8");
  const cssLines = fs.readFileSync(path.join(SRC, "styles.css"), "utf8").split("\n");
  const swayLine = cssLines.find(l => l.includes("#enemySprite.identified") && l.includes(":not(")) || "";
  const swayBody = cssLines[cssLines.indexOf(swayLine) + 1] || "";

  check("App.jsxが sceneNpcName から npc クラスを付ける",
    /className=\{[^}]*sceneNpcName[^}]*"npc"/.test(appSrc) || /"npc"[^}]*sceneNpcName/.test(appSrc),
    (appSrc.split("\n").find(l => l.includes("id=\"enemySprite\"")) || "(見つからない)").trim());
  check("idleSway の対象から .npc を除いている", /:not\(\.npc\)/.test(swayLine), swayLine.trim());
  /* 敵の揺れは残す。これは2026-08-19に「当たった/避けたが画面で見えない」という
     指摘に応えて入れた演出で、NPCの都合で消してはいけない */
  check("敵(.identified)の揺れは残っている",
    /idleSway/.test(swayBody) && /#enemySprite\.identified/.test(swayLine),
    `${swayLine.trim()} / ${swayBody.trim()}`);
  check("被弾中は揺れを止める指定が残っている",
    [".fx-hit", ".fx-crit", ".fx-miss", ".fx-lunge"].every(c => swayLine.includes(`:not(${c})`)),
    swayLine.trim());
}

console.log(fail ? `\n${fail}件 失敗` : "\n全て通過");
process.exit(fail ? 1 : 0);
