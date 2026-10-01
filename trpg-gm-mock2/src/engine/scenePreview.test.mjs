/* TASの「mock2で確認」(?scene=<id>)の検査。TAS/js/39-admin-ux.js が選択中のシーンidを
   ?scene= で渡すが、mock2側の受け取りは 2026-08-12 の codex/mock2-candidate-spike にしか無く、
   main では黙って無視されて常に導入から始まっていた(2026-10-01に移植)。

   使い方: node src/engine/scenePreview.test.mjs
   ========================================================= */
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
const { getSnapshot } = await import("./store.js");

let passed = 0;
const failures = [];
function check(ok, label, detail) {
  if (ok) { passed++; console.log(`  ok  ${label}`); return; }
  failures.push(label);
  console.log(`  NG  ${label}`);
  if (detail) console.log(`        ${detail}`);
}

const SAVE_KEY = "terminus_save_v2_mock2_lanternhill_chapter_01";
// boot→resetGame→語りのタイマーまで流し切り、保存された状態と画面の状態を返す
async function bootAt(search) {
  mem.clear();
  mem.set("terminus_gm_mode_v1", "scripted");
  globalThis.location = { search };
  await eng.boot();
  for (let i = 0; i < 20; i++) await tick();
  const raw = mem.get(SAVE_KEY);
  return { saved: raw ? JSON.parse(raw).state : null, ui: getSnapshot() };
}

// 導入中は setDialogueNodeInfo が場面説明(brief)を空にする。場面にいれば brief と場面名が入る
const INTRO_NAME = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, "data/campaigns/lanternhill/chapter_01.json"), "utf8")).intro.name;
for (const [label, search] of [
  ["scene未指定", "?campaign=lanternhill&chapter=chapter_01"],
  ["存在しないid", "?campaign=lanternhill&chapter=chapter_01&scene=99"]
]) {
  console.log(`── ${label}: 導入から始まる`);
  const { ui } = await bootAt(search);
  check(ui.sceneInfo?.name === INTRO_NAME && ui.sceneInfo?.brief === "", "導入の会話にいる",
    `sceneInfo=${JSON.stringify(ui.sceneInfo)}`);
}

console.log("── scene=3: 場面3から始まり、導入を飛ばす");
{
  const { saved, ui } = await bootAt("?campaign=lanternhill&chapter=chapter_01&scene=3");
  check(saved?.sceneIndex === 2, "場面3(index 2)にいる", `sceneIndex=${saved?.sceneIndex}`);
  check(saved?.pendingIntro === false, "導入待ちになっていない", `pendingIntro=${saved?.pendingIntro}`);
  check(JSON.stringify(saved?.visited) === "[2]", "訪問済みは場面3だけ", `visited=${JSON.stringify(saved?.visited)}`);
  check(ui.popups.length === 0, "導入のポップアップが出ていない", JSON.stringify(ui.popups.map(p => p.kind)));
  check(ui.curtain === false, "幕が上がっている", `curtain=${ui.curtain}`);
  check(ui.sceneInfo?.num === 3 && Boolean(ui.sceneInfo?.brief), "画面の場面表示も場面3", `sceneInfo=${JSON.stringify(ui.sceneInfo)}`);
}

console.log(`\nPASS: ${passed}/${passed + failures.length} 件`);
if (failures.length) { console.log(`FAIL: ${failures.join(" / ")}`); process.exit(1); }
