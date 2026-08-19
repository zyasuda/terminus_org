/* クロニクル出力の自己チェック。実行: npm run test:chronicle

   2026-08-19に実プレイのクロニクル2本を読んで見つけた食い違いを、二度と出さないための検査。
   最大の問題は「sceneIndexを進捗として使っていた」こと。この章は分岐し、順路は
   1→2→5→2→6→3→7→4 で最後が配列4番目なので、7場面すべてを歩いて結末に達しても
   「シーン4/7」と出ていた。Story Referenceのシーン一覧も1〜4しか載らず、
   「実際に体験した範囲だけ」という自己申告が破れていた。

   DOMに依存しないよう buildChronicleMarkdown() を直接呼ぶ。 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = process.env.MOCK2_PUBLIC_DIR || path.join(HERE, "..", "public");

globalThis.location = { search: "" };
const mem = new Map();
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k)
};
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.startsWith("/data/")) {
    const file = path.join(PUBLIC_DIR, u);
    if (!fs.existsSync(file)) return { ok: false, status: 404, json: async () => null };
    return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(file, "utf8")) };
  }
  return { ok: false, status: 503, json: async () => ({}) };
};

const { loadScenarioData, SCENARIO, CAST, CAMPAIGN } = await import("./scenario.js");
await loadScenarioData();
const scenario = (await import("./scenario.js")).SCENARIO;
const cast = (await import("./scenario.js")).CAST;
const campaign = (await import("./scenario.js")).CAMPAIGN;
const { bindChronicle, buildChronicleMarkdown } = await import("./chronicle.js");
const { initialState } = await import("./state.js");

let passed = 0;
const failures = [];
function check(ok, label, detail) {
  if (ok) { passed++; console.log(`  ok  ${label}`); return; }
  failures.push(label);
  console.log(`  NG  ${label}`);
  if (detail) console.log(`        ${detail}`);
}

const idxOf = id => scenario.scenes.findIndex(s => String(s.id) === String(id));

// 実プレイの順路をそのまま再現する(2026-08-19の録画テイクと同じ)
const ROUTE = ["1", "2", "5", "2", "6", "3", "7", "4"].map(idxOf);

function buildFor({ visited, finished, hp = 5, revealedIds = [], defeated = [], inventory = null }) {
  const state = {
    ...initialState(),
    hp, maxHp: 10,
    visited: [...new Set(visited)],
    sceneIndex: visited[visited.length - 1],
    defeated
  };
  if (inventory) state.inventory = inventory;
  const chron = [
    { t: 0, kind: "npc", name: "マイラ", text: "依頼を受けてくれる?", ts: 1000 },
    { t: 1, kind: "dice", reason: "木の札を調べる", roll: 20, diff: 4, ok: true, crit: true, ts: 2000 },
    { t: 2, kind: "dice", reason: "柵の内側を調べる", roll: 1, diff: 8, ok: false, fumble: true, ts: 3000 },
    { t: 3, kind: "dice", reason: "錆喰いへの攻撃", roll: 1, diff: 10, ok: false, fumble: true, ts: 4000 },
    { t: 4, kind: "companion", who: "member_1", text: "急がないで。", ts: 5000 }
  ];
  if (finished) chron.push({ t: 5, kind: "sys", text: "—— 物語は決着した。おつかれさま。 ——", ts: 6000 });
  bindChronicle({ SCENARIO: scenario, CAST: cast, CAMPAIGN: campaign, state, chron, revealed: new Set(revealedIds) });
  return buildChronicleMarkdown().md;
}

console.log("── 完走したなら「未完」と書かない(分岐で最後が配列末尾でなくても)");
{
  const md = buildFor({ visited: ROUTE, finished: true, revealedIds: ["s3a"] });
  check(/progress: 完走/.test(md), "progress が「完走」になる",
    `実際は「${(md.match(/progress: .*/) || [])[0]}」`);
  check(!/シーン4\/7/.test(md), "「シーン4/7」のような場面番号の進捗を書かない");
  check(/依頼を果たし、村へ帰還した/.test(md), "足跡に「依頼を果たし、村へ帰還した」が出る");
  check(!/場面を歩いた\)。?[\s\S]*まで進んだ/.test(md), "あらすじが「途中まで進んだ」にならない");
}

console.log("── 訪問した場面だけを、訪問順で載せる");
{
  const md = buildFor({ visited: ROUTE, finished: true, revealedIds: ["s3a"] });
  const block = md.split("### シーン")[1].split("###")[0];
  ["5", "6", "7"].forEach(id => {
    check(new RegExp(`^- ${id}\\. `, "m").test(block), `訪問した場面${id}が一覧に載る`, block.trim());
  });
  const md2 = buildFor({ visited: [idxOf("1"), idxOf("2")], finished: false });
  const block2 = md2.split("### シーン")[1].split("###")[0];
  check(!/^- 5\. /m.test(block2), "訪問していない場面5を載せない", block2.trim());
  check(!/^- 7\. /m.test(block2), "訪問していない場面7を載せない", block2.trim());
}

console.log("── 番人の扱い: 呼び名は章データ、silentなので「対話」と書かない");
{
  const keeper = scenario.scenes.find(s => String(s.id) === "3")?.npc?.name;
  check(Boolean(keeper), "前提条件: 章データに場面3のNPC名がある");
  const md = buildFor({ visited: ROUTE, finished: true, revealedIds: ["s3a"] });
  check(md.includes(keeper), `呼び名が章データどおり(${keeper})`);
  check(!/灯の番人/.test(md.replace(/灯りの番人/g, "")), "「灯の番人」という別表記を出さない");
  check(!/対話/.test(md), "「対話で切り抜けた」と書かない(silentなNPCなので会話は起こりえない)");
  // 正体を見ていなければ、対峙したことにしない
  const md2 = buildFor({ visited: [idxOf("1"), idxOf("2")], finished: false });
  check(!md2.includes(`${keeper}(対峙した存在)`), "正体未開示なら登場人物に加えない");
}

console.log("── 依頼人は実際に喋ったかで判断する");
{
  const md = buildFor({ visited: ROUTE, finished: true, revealedIds: ["s3a"] });
  check(/マイラ.*\(依頼人\)/.test(md), "喋った依頼人が main_characters に入る",
    (md.match(/main_characters: .*/) || [])[0]);
}

console.log("── ファンブルの結末を種類で書き分ける");
{
  const md = buildFor({ visited: ROUTE, finished: true, revealedIds: ["s3a"] });
  const hi = md.split("## 名場面")[1].split("##")[0];
  check(/錆喰いへの攻撃.*手痛い代償/.test(hi), "攻撃のファンブルは「手痛い代償」", hi.trim());
  check(/柵の内側を調べる.*次の糸口/.test(hi), "調べる判定のファンブルは代償扱いにしない(難易度が下がるため)", hi.trim());
}

console.log("── 旧セーブ(visitedなし)でも壊れない");
{
  const state = { ...initialState(), hp: 5, maxHp: 10, sceneIndex: 2, defeated: [] };
  delete state.visited;
  bindChronicle({ SCENARIO: scenario, CAST: cast, CAMPAIGN: campaign, state, chron: [], revealed: new Set() });
  const md = buildChronicleMarkdown().md;
  check(/3場面を訪問/.test(md), "0..sceneIndex を訪問済みとみなす(3場面)",
    (md.match(/progress: .*/) || [])[0]);
}

console.log("── 同行者の戦闘中の一言が、探索用の台詞になっていない");
{
  const lyd = (campaign.companions || []).find(c => c.id === "member_1");
  check(Boolean(lyd), "前提条件: リディアの定義がある");
  const mutters = lyd.battleMutters || [];
  check(mutters.length >= 3, `戦闘用の一言が3つ以上ある(2つだと直前回避で必ず交互になる。実際は${mutters.length})`);
  check(!mutters.some(l => /足元|仕掛け|罠/.test(l)),
    "探索用の台詞(足元・仕掛け・罠)を戦闘用に混ぜない", JSON.stringify(mutters));
  (campaign.companions || []).forEach(c => {
    const ms = c.battleMutters || [];
    check(ms.length >= 3, `${c.name}: 戦闘用の一言が3つ以上(実際は${ms.length})`);
  });
  // TASが書くcastAttributesはmock2が読まない側の複製。片方だけ直すと次の出力で戻る
  const attrs = campaign.castAttributes || {};
  (campaign.companions || []).forEach(c => {
    const mirror = attrs[c.id];
    if (!mirror || !mirror.battleMutters) return;
    check(JSON.stringify(mirror.battleMutters) === JSON.stringify(c.battleMutters),
      `${c.name}: companions と castAttributes の戦闘用一言が一致する`,
      `${JSON.stringify(c.battleMutters)} vs ${JSON.stringify(mirror.battleMutters)}`);
  });
}

console.log(`\nPASS: ${passed}/${passed + failures.length} 件`);
if (failures.length) { console.log("\n失敗:"); failures.forEach(f => console.log(`  - ${f}`)); process.exit(1); }
