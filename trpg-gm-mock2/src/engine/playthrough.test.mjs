/* =========================================================
   手番のハーネス。progression.test.mjs が「データの整合と到達可能性」を見るのに対し、
   こちらは実物の sendAction を1手番ずつ回して「本当に章が終わるか」を見る。

   なぜ必要か: 2026-08-04の実プレイで、データは progression の検査5〜7を全て通過して
   いたのに、作者のtriggerが別の秘密の1文字の別名に負けて開かず、章を完了できなかった。
   データが正しいことと、エンジンがそのデータで進めることは別の問題である。

   進め方:
   - gmMode="scripted" で走らせる。この経路はLLMを一切呼ばないので、出目以外は決定論になる。
     LLMを呼んだら fetch のスタブが例外を投げ、検査として落ちる(「LLMゼロ」の保証も兼ねる)。
   - 台本は手書きしない。章データから「そのシーンの秘密を全部開き、置かれた品を全部拾い、
     出口へ進む」を機械的に導く。台本を書くと、データが変わったとき台本が腐る。
   - 出目は種付き乱数で固定する。失敗しても examineDifficulty が難易度を下げるので、
     粘れば必ず開く(その性質自体が progression の検査13で保証されている)。

   使い方:
     node src/engine/playthrough.test.mjs
     CAMPAIGN=lanternhill CHAPTER_ID=chapter_01 node src/engine/playthrough.test.mjs
     SEED=999 node src/engine/playthrough.test.mjs      # 別の出目で通るかを見る
   ========================================================= */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(HERE, "..", "..", "public");

/* ---------------- ブラウザAPIの最小の代役 ----------------
   engine/index.js が触るブラウザAPIは localStorage・location・fetch の3つだけ
   (grepで確認済み)。DOMには一切触らない(store.js経由のsnapshot更新に置き換え済み)ため、
   Nodeでそのまま動かせる。 */
const mem = new Map();
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k)
};

const campaignId = process.env.CAMPAIGN || "";
const chapterId = process.env.CHAPTER_ID || "";
const qs = [campaignId && `campaign=${campaignId}`, chapterId && `chapter=${chapterId}`].filter(Boolean).join("&");
globalThis.location = { search: qs ? `?${qs}` : "" };

// scriptedモードで起動する(index.jsはモジュール読み込み時にこのキーを読む。importより前に置く)
mem.set("terminus_gm_mode_v1", "scripted");

let llmCalls = 0;
globalThis.fetch = async url => {
  const u = String(url);
  if (u.startsWith("/data/")) {
    const file = path.join(PUBLIC_DIR, u);
    if (!fs.existsSync(file)) return { ok: false, status: 404, json: async () => null };
    const text = fs.readFileSync(file, "utf8");
    return { ok: true, status: 200, json: async () => JSON.parse(text) };
  }
  // scripted経路はLLMを呼ばないはず。呼んだら黙って通さず、検査として落とす
  if (u.startsWith("/api/gm")) { llmCalls++; throw new Error("scriptedモードなのにLLMを呼んだ"); }
  return { ok: false, status: 503, json: async () => ({}) }; // /api/model-info 等
};

/* 出目を再現可能にする。素の Math.random では同じデータ・同じ宣言でも結果が変わり、
   落ちたときに「データが悪いのか運が悪いのか」を切り分けられない */
let seed = Number(process.env.SEED || 20260804) % 0x7fffffff;
Math.random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

/* タイマーは全て演出の間合い(フェードイン・出目の見せ場)。実時間を待つ意味がないので即時化する。
   入れ子のsetTimeoutは入れ子のまま順序が保たれるので、開幕シーケンスの順番は壊れない */
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, _ms, ...rest) => realSetTimeout(fn, 0, ...rest);
const tick = () => new Promise(r => realSetTimeout(r, 0));

/* ---------------- 検査の記録 ---------------- */
let passed = 0;
const failures = [];
function check(ok, label, detail) {
  if (ok) { passed++; console.log(`  ok  ${label}`); return true; }
  failures.push({ label, detail });
  console.log(`  NG  ${label}`);
  if (detail) console.log(`        ${detail}`);
  return false;
}
function section(title) { console.log(`\n── ${title}`); }

/* ---------------- 起動 ---------------- */
const eng = await import("./index.js");
const scenarioMod = await import("../scenario.js");
const { getSnapshot } = await import("./store.js");

await eng.boot();
await tick();

const SCENARIO = scenarioMod.SCENARIO;
if (!SCENARIO) {
  console.error("シナリオデータを読み込めなかった。public/data/ を確認すること。");
  process.exit(1);
}
console.log(`章: ${SCENARIO.title || "(無題)"} / シーン${SCENARIO.scenes.length}件 / seed=${process.env.SEED || 20260804}`);

/* 保存データから内部状態を読む。index.js は状態が変わるたびに localStorage へ
   全状態(state・revealed)を自動保存しているので、検査用のexportを足す必要がない。
   キー名の形式には依存しない(saveKeyの実装に結びつけない) */
function readSaved() {
  for (const raw of mem.values()) {
    try {
      const v = JSON.parse(raw);
      if (v && v.state && Array.isArray(v.revealed)) return { state: v.state, revealed: new Set(v.revealed) };
    } catch (e) { /* 動詞頻度など別のキー */ }
  }
  return null;
}

function drainPopups() {
  let guard = 0;
  while (getSnapshot().popups.length && guard++ < 50) eng.dismissPopup();
}

/* 1手番進める。判定要求(pendingRoll)はプレイヤーのクリック待ちなので、ここで代わりに振る。
   ブラウザで「ダイスを振る!」を押すのと同じ操作である */
let turns = 0;
async function say(text) {
  turns++;
  drainPopups();
  let settled = false;
  const p = eng.sendAction(text).then(v => { settled = true; return v; }, e => { settled = true; throw e; });
  for (let i = 0; i < 3000 && !settled; i++) {
    await tick();
    if (getSnapshot().pendingRoll) eng.performRoll();
  }
  await p;
  await tick();
  drainPopups();
  await tick();
}

/* ---------------- 現在いるノード ----------------
   intro / ending は scenes 配列の外にあり、それぞれ独自の exits を持つ(null運用)。
   sendAction も通常シーンより先にこの2つを解決するので、ハーネスも同じ順で見る */
function currentNode() {
  const { state } = readSaved();
  if (state.chapterEnded) return { kind: "ended", label: "章の終わり", node: null, state };
  if (state.pendingIntro) return { kind: "intro", label: "イントロ", node: SCENARIO.intro, state };
  if (state.pendingEnding) return { kind: "ending", label: "アウトロ", node: SCENARIO.ending, state };
  const sc = SCENARIO.scenes[state.sceneIndex];
  return { kind: "scene", label: `シーン${sc.id}`, node: sc, state };
}

function nodeSignature() {
  const c = currentNode();
  return `${c.kind}:${c.kind === "scene" ? c.state.sceneIndex : ""}`;
}

/* 秘密を開く宣言の候補。作者が書いた trigger を第一候補にする(実プレイで開かなかったのは
   まさにここ)。通らなければ entity を使った素直な言い回しへ落とす */
function examineAttempts(secret) {
  const out = [];
  if (secret.trigger) {
    String(secret.trigger).split(/[,、]/).map(t => t.trim().replace(/[。.]$/, "")).filter(t => t.length >= 2)
      .forEach(t => out.push(t));
  }
  out.push(`${secret.entity}を調べる`);
  (secret.aliases || []).forEach(a => a && out.push(`${a}を調べる`));
  return out;
}

function availableLootNames(sc, revealed) {
  return (sc.loot || [])
    .map(i => (typeof i === "string" ? { name: i } : i))
    .filter(i => !i.requires || revealed.has(i.requires))
    .map(i => i.name);
}

function heldItems() {
  return (getSnapshot().inventoryByOwner || []).flatMap(o => o.items || []);
}

/* 出口の選び方: 前へ進むものを優先する。同じ場所を行き来して手番を使い切るのを防ぐ。
   requiresは既に「そのノードの秘密と品を全部揃える」方針で満たしているので、条件では絞らない */
function pickExit(node, state) {
  const exits = (node.exits || []).filter(e => e && e.to !== null && e.to !== undefined && (e.match || []).length);
  if (!exits.length) return null;
  const here = state.sceneIndex;
  const idxOf = e => SCENARIO.scenes.findIndex(s => String(s.id) === String(e.to).replace(/^scene:/, ""));
  const forward = exits.filter(e => idxOf(e) > here);
  return (forward.length ? forward : exits)[0];
}

/* ---------------- 自動プレイ ---------------- */
section("1. 章を通しでプレイできる（実物のsendActionを1手番ずつ回す）");

const MAX_TURNS = 400;
const EXAMINE_TRIES = 8; // examineDifficultyは失敗ごとにDCを2下げ、下限2で止まる
const visited = [];
const revealLog = [];
let stalled = null;

while (turns < MAX_TURNS) {
  const cur = currentNode();
  if (cur.kind === "ended") break;
  visited.push(cur.label);

  // (1) このノードの秘密を全部開く
  for (const secret of cur.node.secrets || []) {
    let done = readSaved().revealed.has(secret.id);
    for (const attempt of examineAttempts(secret)) {
      if (done) break;
      for (let i = 0; i < EXAMINE_TRIES && !done; i++) {
        await say(attempt);
        done = readSaved().revealed.has(secret.id);
      }
    }
    check(done, `${cur.label} 秘密「${secret.entity}」(${secret.id})を開示できた`,
      done ? null
        : `作者の開示方法「${secret.trigger || "(未記入)"}」でも「${secret.entity}を調べる」でも開かない。`
          + `${EXAMINE_TRIES}回×${examineAttempts(secret).length}通りを試した`);
    if (done) revealLog.push(secret.id);
  }

  // (2) 置かれた品を全部拾う（出口や後のノードが要求する）
  const rev = readSaved().revealed;
  for (const name of availableLootNames(cur.node, rev)) {
    if (heldItems().includes(name)) continue;
    await say(`${name}を拾う`);
    check(heldItems().includes(name), `${cur.label} 品物「${name}」を入手できた`,
      `開示条件は満たしているのに、拾う宣言で手に入らない`);
  }

  // (3) 出口へ進む
  const before = nodeSignature();
  const exit = pickExit(cur.node, cur.state);
  if (!exit) {
    // 出口が無いノードは completeRequires での完了を待つ。1手番だけ促してみる
    await say("先へ進む");
    if (nodeSignature() === before) { stalled = { at: cur.label, why: "出口が無く、完了もしない" }; break; }
    check(true, `${cur.label} 出口を持たないノードから完了で先へ進めた`);
    continue;
  }
  /* 照合語は「奥」のような名詞だけのこともある。exits[].matchは部分一致なので出口自体は
     選べるが、移動の宣言だと認識されない(scriptedの辞書は述語を見る)。まず作者が書いた
     語をそのまま言い、動かなければ移動の述語を足して言い直す。どちらで通ったかは記録する */
  let used = exit.match[0];
  await say(used);
  if (nodeSignature() === before) {
    used = /[へにをのと]$/.test(exit.match[0]) ? `${exit.match[0]}進む` : `${exit.match[0]}へ進む`;
    await say(used);
  }
  if (nodeSignature() === before) {
    stalled = {
      at: cur.label,
      why: `出口「${exit.match[0]}」→ ${exit.to} で動かない（述語を足しても不可）。`
        + `拒否文言: ${JSON.stringify(getSnapshot().gmBubble.text).slice(0, 120)}`
    };
    break;
  }
  check(true, `${cur.label} 「${used}」で ${exit.to} へ進めた`);
}

if (stalled) check(false, `${stalled.at} で進行が止まった`, stalled.why);

section("2. 章が最後まで終わる");
const final = readSaved();
check(final.state.chapterEnded === true, "章が完了した（chapterEnded）",
  `${turns}手番使って終わらなかった。通ったノード: ${[...new Set(visited)].join(" → ")}`);
check(turns < MAX_TURNS, `手番が上限(${MAX_TURNS})に達していない`, `${turns}手番`);

section("3. 章の中身を取りこぼしていない");
const allSecrets = [
  ...(SCENARIO.intro && typeof SCENARIO.intro === "object" ? SCENARIO.intro.secrets || [] : []),
  ...SCENARIO.scenes.flatMap(s => s.secrets || []),
  ...(SCENARIO.ending && typeof SCENARIO.ending === "object" ? SCENARIO.ending.secrets || [] : [])
];
const missed = allSecrets.filter(s => !final.revealed.has(s.id));
check(missed.length === 0, "章内の全ての秘密を開示できた",
  `未開示: ${missed.map(s => `${s.id}(${s.entity})`).join(", ")}`);
check(allSecrets.length > 0, "秘密が1件以上ある（検査が空振りしていない）");

section("4. scriptedモードはLLMを呼ばない");
check(llmCalls === 0, "LLMの呼び出しが0件", `${llmCalls}件呼んだ`);

console.log(`\n通ったノード: ${visited.join(" → ")}`);
console.log(`開示順: ${revealLog.join(" → ")}`);
console.log(`所持品: ${heldItems().join(", ") || "(なし)"}`);
console.log(`\n${failures.length ? `FAIL: ${failures.length}/${passed + failures.length} 件失敗` : `PASS: ${passed}/${passed} 件`}（${turns}手番）`);
process.exit(failures.length ? 1 : 0);
