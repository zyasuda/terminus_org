/* 「続きから / 最初から」を選んだ後、UIが操作可能な状態に戻ることの回帰テスト。
   実行: npm run test:resume

   busyはモジュール変数(エンジンの再入防止)とstore(UIの活殺)の2箇所にある。
   2026-08-10、resetGame/restoreGameがモジュール変数しか戻しておらず、
   セーブがある状態でリロードして選択肢を押すと、行動ボタンが永久に無効のままだった。
   handleSendがeng.busyで弾くため入力欄の文字も消えず、「押しても何も起きない」に見える。

   このテストは「セーブが存在する起動」を作る。それ以外の起動では再現しない
   (だからブラウザの自動テストでは見つからなかった——毎回まっさらな状態で起動していた)。 */
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

let passed = 0;
const failures = [];
function check(ok, label, detail) {
  if (ok) { passed++; console.log(`  ok  ${label}`); return; }
  failures.push(label);
  console.log(`  NG  ${label}`);
  if (detail) console.log(`        ${detail}`);
}

// 「前回の続き」があるセーブを仕込む。boot()はこれを見て選択待ちに入る。
// キーはキャンペーン・章ごとに分かれている(saveKey())ので、既定の章に合わせる
const SAVE_KEY = "terminus_save_v2_mock2_lanternhill_chapter_01";
function seedSave(raw) {
  mem.set(SAVE_KEY, raw !== undefined ? raw : JSON.stringify({
    state: { ...initialState(), sceneIndex: 1, turn: 5 },
    chron: [], history: [], revealed: []
  }));
}

async function bootWithSave() {
  seedSave();
  await eng.boot();
  await tick();
}

console.log("── 起動時: セーブがあれば選択待ちで入力を塞ぐ");
{
  await bootWithSave();
  const s = getSnapshot();
  check(s.popups.length === 1 && s.popups[0].kind === "resume", "続きから/最初から の選択が出る",
    `実際は ${JSON.stringify(s.popups.map(p => p.kind))}`);
  check(s.busy === true, "選択中は入力を塞いでいる", `実際は busy=${s.busy}`);
}

console.log("── 「続きから」を選んだ後、操作可能に戻る");
{
  await bootWithSave();
  eng.resumeSavedGame();
  await tick();
  const s = getSnapshot();
  check(s.busy === false, "busyがUIへ戻っている(行動ボタンが押せる)", `実際は busy=${s.busy}`);
  check(s.popups.length === 0, "選択のポップアップが閉じている");
}

console.log("── 「最初から」を選んだ後、操作可能に戻る");
{
  await bootWithSave();
  eng.startNewGame();
  await tick();
  const s = getSnapshot();
  check(s.busy === false, "busyがUIへ戻っている(行動ボタンが押せる)", `実際は busy=${s.busy}`);
}

console.log("── 保存データが壊れていても、操作可能な状態で開始する");
{
  seedSave("{壊れたJSON");
  await eng.boot();
  await tick();
  if (getSnapshot().popups.some(p => p.kind === "resume")) eng.resumeSavedGame();
  await tick();
  check(getSnapshot().busy === false, "busyがUIへ戻っている", `実際は busy=${getSnapshot().busy}`);
}

console.log(`\nPASS: ${passed}/${passed + failures.length} 件`);
if (failures.length) { console.log("\n失敗:"); failures.forEach(f => console.log(`  - ${f}`)); process.exit(1); }
