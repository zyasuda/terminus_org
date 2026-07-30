#!/usr/bin/env node
/*
 * TAS 回帰ハーネス
 *
 * 出力パイプラインを触る前後で、ゲーム側へ渡るJSONが変わっていないことを機械的に確かめる。
 * 「空の値・解決できない値で既存データを黙って潰す」不具合が繰り返し起きているため、
 * 人が目で見て気づく前に落ちる網を先に用意する。
 *
 * 使い方:
 *   npm test                            全部
 *   node tests/run.mjs --only=structure  分割構造の静的検査だけ
 *   node tests/run.mjs --only=snapshot   出力JSONの基準比較だけ
 *   node tests/run.mjs --only=export     出力APIの不変条件だけ
 *   node tests/run.mjs --update          基準出力を作り直す（意図した仕様変更のときだけ）
 *   node tests/run.mjs --make-fixtures   下書きフィクスチャを作り直す
 *
 * 前提:
 *   - ブラウザは trpg-gm-mock2 の node_modules の playwright を借りる（TAS側に入れない）
 *   - サーバーは MOCK2_DIR を一時ディレクトリへ向けて起動する。実データは書き換えない
 *   - 基準出力は TAS/data/*.json に依存する。あちらを変えたら --update が必要
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tasDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = path.join(tasDir, "tests/fixtures");
const draftsDir = path.join(fixturesDir, "drafts");
const goldenDir = path.join(fixturesDir, "golden");
const mock2FixtureDir = path.join(fixturesDir, "mock2");
const PORT = Number(process.env.TAS_TEST_PORT || 8897);
const baseUrl = `http://127.0.0.1:${PORT}`;
const DRAFT_KEY = "tas_campaign_draft_v1";

const argv = process.argv.slice(2);
const flag = name => argv.includes(`--${name}`);
const only = (argv.find(a => a.startsWith("--only=")) || "").slice("--only=".length);
const wants = section => !only || only === section;

/* 下書きなしと、作者が書き込んだ状態の両方を通す。
   下書きなしは TAS/data だけが入力になるので、基準が固定されて壊れにくい。 */
const FIXTURES = [
  { name: "base", draft: null, note: "下書きなし。TAS/data だけから組み立てる" },
  { name: "authored", draft: "authored.json", note: "イントロ・アウトロを画面で書いた状態" },
  { name: "fresh", draft: "fresh.json", note: "新規キャンペーンを作った直後" }
];

let failures = 0;
let checks = 0;
const results = [];
const sections = [];
const verbose = process.argv.includes("--verbose");
function ok(condition, message, detail) {
  checks++;
  if (sections.length) sections[sections.length - 1].total++;
  if (condition) {
    if (verbose) results.push(`  ok  ${message}`);
    return true;
  }
  failures++;
  if (sections.length) sections[sections.length - 1].failed++;
  results.push(`  NG  ${message}${detail ? `\n      ${detail}` : ""}`);
  return false;
}
function section(title) {
  sections.push({ title, total: 0, failed: 0 });
  results.push({ sectionIndex: sections.length - 1 });
}

/* ---------------------------------------------------------------- 静的検査 */
// index.html と js/ の対応を確かめる。1対1の切り出しを崩すと、読み込み順が変わって
// 出力内容が変わる（ラッパーが先行ファイルの関数を包む作りのため）。
function runStructureCheck() {
  section("分割構造の静的検査");
  // HTMLコメントには説明のために <script> の文字列が入っている。実際の markup だけを見る。
  const html = fs.readFileSync(path.join(tasDir, "index.html"), "utf8").replace(/<!--[\s\S]*?-->/g, "");
  const jsDir = path.join(tasDir, "js");
  const files = fs.readdirSync(jsDir).filter(n => n.endsWith(".js")).sort();
  const srcs = [...html.matchAll(/<script\s+src="\/js\/([^"]+)"><\/script>/g)].map(m => m[1]);

  ok(srcs.length === files.length, "index.html の script src の数と js/ のファイル数が一致する",
    `src ${srcs.length}件 / ファイル ${files.length}件`);
  ok(JSON.stringify(srcs) === JSON.stringify(files),
    "script src の並びがファイル名の昇順（＝番号順＝読み込み順）と一致する",
    srcs.find((s, i) => s !== files[i]) ? `最初のずれ: ${srcs.find((s, i) => s !== files[i])}` : "");
  for (const src of srcs) {
    ok(fs.existsSync(path.join(jsDir, src)), `${src} が存在する`);
  }
  // srcなしのインライン<script>が復活していないか。復活すると分割の意味が薄れる。
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)].length;
  ok(inline === 0, "index.html にインラインの script が無い", `${inline}件見つかった`);
  // js/ の中身をそのままHTMLへ戻せる状態を保つ（文字列中の </script> はHTMLを壊す）。
  for (const file of files) {
    const body = fs.readFileSync(path.join(jsDir, file), "utf8");
    ok(!body.includes("</script>"), `${file} に </script> が含まれない`);
  }

  /* ラッパー段数の上限。減るのは1本化の方向なので通す。増えるのは「どの段が正か」が
     さらに分からなくなる方向なので落とす。1本化したらこの数値を下げる。 */
  const WRAPPER_CEILING = 11;
  const wrappers = files.reduce((sum, file) =>
    sum + (fs.readFileSync(path.join(jsDir, file), "utf8").match(/mockCampaignPayload=function/g) || []).length, 0);
  ok(wrappers <= WRAPPER_CEILING,
    `mockCampaignPayload のラッパー段数が ${WRAPPER_CEILING} 段を超えない`,
    `現在 ${wrappers} 段。増やすのではなく1本化する`);
  if (wrappers < WRAPPER_CEILING) {
    results.push(`  --  ラッパーが ${wrappers} 段に減っている。tests/run.mjs の WRAPPER_CEILING も下げること`);
  }
}

/* ------------------------------------------------------------ サーバ・画面 */
function loadChromium() {
  try {
    const requireFromMock2 = createRequire(path.join(tasDir, "..", "trpg-gm-mock2", "package.json"));
    return requireFromMock2("playwright").chromium;
  } catch (cause) {
    throw new Error(
      "playwright を読み込めません。trpg-gm-mock2 で npm install を実行してください。\n  " + cause.message
    );
  }
}

function startServer(mock2Dir) {
  const child = spawn(process.execPath, ["server.cjs"], {
    cwd: tasDir,
    env: { ...process.env, PORT: String(PORT), MOCK2_DIR: mock2Dir },
    stdio: ["ignore", "pipe", "pipe"]
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`テストサーバーの起動がタイムアウトしました (port ${PORT})`)), 15000);
    const done = error => { clearTimeout(timer); error ? reject(error) : resolve(child); };
    child.once("error", done);
    child.once("exit", code => done(new Error(`テストサーバーが終了しました (code ${code})。ポート ${PORT} が使用中かもしれません`)));
    child.stdout.on("data", text => { if (String(text).includes(`http://localhost:${PORT}`)) done(); });
  });
}

// 下書きは localStorage に「そのまま」入る（{version,data} で包まない）。
// 各 js ファイルが読み込み時にも localStorage を読むため、投入してから再読み込みする。
async function openPage(browser, draft) {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("dialog", dialog => dialog.accept());
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.evaluate(([key, value]) => {
    value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value);
  }, [DRAFT_KEY, draft === null ? null : JSON.stringify(draft)]);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    try { return context !== null && typeof mockCampaignPayload === "function"; } catch { return false; }
  }, null, { timeout: 15000 });
  const dataFiles = await page.evaluate(() => Object.keys(context.dataFiles || {}));
  if (!dataFiles.length) {
    throw new Error("/api/context が章データを返していません。TAS/data の中身を確認してください");
  }
  return { page, pageErrors };
}

/* 描画は非同期で走る箇所があるため、同じ結果が2回続いたところを出力とみなす。 */
async function capturePayload(page) {
  let previous = null;
  for (let attempt = 0; attempt < 12; attempt++) {
    const current = await page.evaluate(() => JSON.stringify(mockCampaignPayload()));
    if (previous === current) return JSON.parse(current);
    previous = current;
    await page.waitForTimeout(250);
  }
  throw new Error("出力が安定しません（呼ぶたびに内容が変わっています）");
}

/* -------------------------------------------------------- 出力JSONの基準比較 */
function firstDifference(a, b, at = "") {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return `${at || "(根)"}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`;
  }
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const found = firstDifference(a[key], b[key], at ? `${at}.${key}` : key);
    if (found) return found;
  }
  return `${at || "(根)"}: キーの並びが違う`;
}

async function runSnapshot(browser, update) {
  section(update ? "出力JSONの基準を作り直す" : "出力JSONの基準比較");
  fs.mkdirSync(goldenDir, { recursive: true });
  for (const fixture of FIXTURES) {
    const draftPath = fixture.draft && path.join(draftsDir, fixture.draft);
    if (draftPath && !fs.existsSync(draftPath)) {
      ok(false, `下書き ${fixture.draft} がある`, "--make-fixtures で作成してください");
      continue;
    }
    const draft = draftPath ? JSON.parse(fs.readFileSync(draftPath, "utf8")) : null;
    const { page, pageErrors } = await openPage(browser, draft);
    let payload;
    try {
      payload = await capturePayload(page);
    } finally {
      await page.close();
    }
    ok(pageErrors.length === 0, `${fixture.name}: 画面実行エラーが出ない`, pageErrors.join(" / "));

    const goldenPath = path.join(goldenDir, `${fixture.name}.json`);
    const text = JSON.stringify(payload, null, 2) + "\n";
    if (update) {
      fs.writeFileSync(goldenPath, text, "utf8");
      results.push(`  --  ${fixture.name}.json を書き出した（${text.length}字） ${fixture.note}`);
      continue;
    }
    if (!fs.existsSync(goldenPath)) {
      ok(false, `${fixture.name}: 基準出力がある`, "--update で意図的に作成してください");
      continue;
    }
    const golden = JSON.parse(fs.readFileSync(goldenPath, "utf8"));
    ok(text === JSON.stringify(golden, null, 2) + "\n",
      `${fixture.name}: 出力JSONが基準と完全一致する（${fixture.note}）`,
      firstDifference(golden, payload) || "");
  }
}

/* ------------------------------------------------------- 出力APIの不変条件 */
const ledgerPathIn = dir => path.join(dir, "public", "data", "assets.json");
const readLedger = dir => JSON.parse(fs.readFileSync(ledgerPathIn(dir), "utf8"));

async function exportOnce(page, overrides = {}) {
  return page.evaluate(async patch => {
    const payload = { ...mockCampaignPayload(), ...patch };
    if (patch && Object.hasOwn(patch, "assets") && patch.assets === "__omit__") delete payload.assets;
    const response = await fetch("/api/export-campaign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    return { status: response.status, saved: data.saved || [], assetsAdded: data.assetsAdded || [], error: data.error || null, chapter: payload.chapter, campaignId: payload.campaignId, chapterFile: payload.chapterFile };
  }, overrides);
}

async function runExport(browser, mock2Dir) {
  section("出力APIの不変条件（素材台帳のマージ）");
  const { page, pageErrors } = await openPage(browser, null);
  try {
    const before = readLedger(mock2Dir);

    // 1回目
    const first = await exportOnce(page);
    ok(first.status === 200, "出力が成功する", JSON.stringify(first.error));
    ok(first.saved.includes("assets.json"), "書き出したファイルに assets.json が含まれる", JSON.stringify(first.saved));
    const after1 = readLedger(mock2Dir);

    // 人間が書いた項目を触らない
    const preserved = ["file", "kind", "status", "size", "notes", "target", "alpha", "source", "promptVersion"];
    const changed = [];
    for (const [id, entry] of Object.entries(before.assets)) {
      if (!after1.assets[id]) { changed.push(`${id} が消えた`); continue; }
      for (const key of preserved) {
        if (JSON.stringify(entry[key]) !== JSON.stringify(after1.assets[id][key])) {
          changed.push(`${id}.${key}: ${JSON.stringify(entry[key])} → ${JSON.stringify(after1.assets[id][key])}`);
        }
      }
    }
    ok(changed.length === 0, "既存エントリの status / notes / size / kind 等が変わらない", changed.join(" / "));

    // "ui." で始まる usedBy はコードからの直参照。TASの出力に現れないが消してはいけない。
    ok(JSON.stringify(after1.assets.keep_manual_usedby.usedBy) === JSON.stringify(["ui.stage.gmPet"]),
      "ui. で始まる usedBy が残る",
      JSON.stringify(after1.assets.keep_manual_usedby.usedBy));

    ok(after1.assets.keep_archived.status === "archived", "archived のエントリが archived のまま");
    ok(after1.assets.renamed_id.status === "rejected",
      "IDとファイル名が一致しない登録も file で突き合わせられ、status が保たれる");

    // 既存キーの並びを保ち、新規は末尾へ足す
    const beforeKeys = Object.keys(before.assets);
    const afterKeys = Object.keys(after1.assets);
    ok(JSON.stringify(afterKeys.slice(0, beforeKeys.length)) === JSON.stringify(beforeKeys),
      "既存エントリの並び順が保たれ、新規は末尾に足される");
    const added = afterKeys.slice(beforeKeys.length);
    ok(added.length > 0, "参照されている未登録の画像が新規登録される", `追加 ${added.length}件`);
    ok(added.every(id => after1.assets[id].status === "candidate"),
      "新規登録の status が candidate になる",
      added.map(id => `${id}=${after1.assets[id].status}`).join(" / "));
    ok(added.every(id => !/\.(png|jpe?g|webp)$/i.test(id)),
      "新規登録のIDから拡張子が除かれている", added.join(" / "));
    ok(JSON.stringify(first.assetsAdded.slice().sort()) === JSON.stringify(added.map(id => after1.assets[id].file).sort()),
      "応答の assetsAdded が実際に追加したファイルと一致する",
      `${JSON.stringify(first.assetsAdded)} / ${JSON.stringify(added.map(id => after1.assets[id].file))}`);

    // イントロ・アウトロも収集対象であること
    const usages = Object.values(after1.assets).flatMap(a => a.usedBy || []);
    ok(usages.some(u => /\.ending\./.test(u)), "アウトロの画像が usedBy に載る", JSON.stringify(usages));

    // 2回目 = べき等
    const ledgerText1 = fs.readFileSync(ledgerPathIn(mock2Dir), "utf8");
    const chapterFile = path.join(mock2Dir, "public", "data", "campaigns", first.campaignId, first.chapterFile);
    const chapterText1 = fs.readFileSync(chapterFile, "utf8");
    await exportOnce(page);
    ok(fs.readFileSync(ledgerPathIn(mock2Dir), "utf8") === ledgerText1, "2回続けて出力しても素材台帳に差分が出ない");
    ok(fs.readFileSync(chapterFile, "utf8") === chapterText1, "2回続けて出力しても章JSONに差分が出ない");
    ok(chapterText1 === JSON.stringify(first.chapter, null, 2) + "\n",
      "書き出された章JSONが payload.chapter と一致する（サーバー側で加工していない）");

    // assets が空 / 未定義なら台帳を書かない
    for (const [label, patch] of [["空オブジェクト", { assets: {} }], ["未定義", { assets: "__omit__" }]]) {
      const response = await exportOnce(page, patch);
      ok(!response.saved.includes("assets.json"), `assets が${label}のとき assets.json を書かない`, JSON.stringify(response.saved));
      ok(fs.readFileSync(ledgerPathIn(mock2Dir), "utf8") === ledgerText1, `assets が${label}のとき台帳が変わらない`);
    }

    // 台帳が壊れている場合は中止し、何も上書きしない
    fs.writeFileSync(ledgerPathIn(mock2Dir), "{ broken", "utf8");
    fs.writeFileSync(chapterFile, "SENTINEL", "utf8");
    const broken = await exportOnce(page);
    ok(broken.status >= 400, "台帳が壊れていると出力が失敗する", `HTTP ${broken.status}`);
    ok(fs.readFileSync(ledgerPathIn(mock2Dir), "utf8") === "{ broken", "壊れた台帳を空の台帳で上書きしない");
    ok(fs.readFileSync(chapterFile, "utf8") === "SENTINEL", "台帳の読み込みに失敗したら章JSONも書かない");
    fs.writeFileSync(ledgerPathIn(mock2Dir), ledgerText1, "utf8");

    ok(pageErrors.length === 0, "画面実行エラーが出ない", pageErrors.join(" / "));
  } finally {
    await page.close();
  }
}

/* ------------------------------------------------------------ フィクスチャ */
// 下書きの形は app 側の workspaceDraft() が正。手で書くと項目が抜けるので、
// 画面の状態を作ってから workspaceDraft() に出力させる。
async function makeFixtures(browser) {
  section("下書きフィクスチャの作り直し");
  fs.mkdirSync(draftsDir, { recursive: true });

  const authored = await (async () => {
    const { page } = await openPage(browser, null);
    try {
      return await page.evaluate(() => {
        const openingKey = nodeKey({ type: "opening", id: "opening" });
        const endingKey = nodeKey({ type: "ending", id: "ending" });
        castNames.npc_1 = "マイラ";
        castImages.npc_1 = "s4_myra_full_transparent.png";
        sceneBackgrounds[openingKey] = "s4_myra_room.jpg";
        sceneBackgrounds[endingKey] = "s4_myra_room.jpg";
        sceneOverrides[openingKey] = {
          ...(sceneOverrides[openingKey] || {}),
          brief: "夕暮れの村。マイラは机に坑道の古い見取り図を広げ、消えた作業員について語り始める。",
          npcs: ["npc_1"],
          exits: [{ id: "to_scene01", match: "引き受け, 承知, わかった, 任せ", to: "1" }]
        };
        sceneOverrides[endingKey] = {
          ...(sceneOverrides[endingKey] || {}),
          brief: "君と仲間は、無事マイラの部屋に帰還した。マイラは何か言いたげな様子でこっちを見ている。",
          npcs: ["npc_1"],
          blockedText: "まだ渡していないものがある。",
          exits: [{
            id: "hand_over", match: "渡す, 手渡す, 心石, 差し出す", to: "end",
            requires: { text: "心石の欠片" },
            removeItems: "心石の欠片", addItems: "30ゴールド",
            npcSay: "よくやってくれた。これは謝礼だ。"
          }]
        };
        return workspaceDraft();
      });
    } finally { await page.close(); }
  })();
  fs.writeFileSync(path.join(draftsDir, "authored.json"), JSON.stringify(authored, null, 2) + "\n", "utf8");
  results.push("  --  drafts/authored.json を書き出した");

  const fresh = await (async () => {
    const { page } = await openPage(browser, null);
    try {
      return await page.evaluate(() => { createNewCampaign(true); return workspaceDraft(); });
    } finally { await page.close(); }
  })();
  fs.writeFileSync(path.join(draftsDir, "fresh.json"), JSON.stringify(fresh, null, 2) + "\n", "utf8");
  results.push("  --  drafts/fresh.json を書き出した");
  results.push("  --  作り直したら --update で基準出力も更新すること");
}

/* ------------------------------------------------------------------ 実行 */
let server = null;
let browser = null;
let tempMock2 = null;
try {
  if (wants("structure")) runStructureCheck();

  const needsBrowser = flag("make-fixtures") || wants("snapshot") || wants("export");
  if (needsBrowser) {
    const chromium = loadChromium();
    tempMock2 = fs.mkdtempSync(path.join(os.tmpdir(), "tas-test-mock2-"));
    fs.cpSync(mock2FixtureDir, tempMock2, { recursive: true });
    server = await startServer(tempMock2);
    browser = await chromium.launch({ headless: true });

    if (flag("make-fixtures")) await makeFixtures(browser);
    else {
      if (wants("snapshot")) await runSnapshot(browser, flag("update"));
      if (wants("export")) await runExport(browser, tempMock2);
    }
  }
} catch (cause) {
  failures++;
  results.push(`\n  NG  ハーネス自体が失敗しました\n      ${cause.stack || cause.message}`);
} finally {
  await browser?.close();
  server?.kill();
  if (tempMock2) fs.rmSync(tempMock2, { recursive: true, force: true });
}

console.log(results.map(line => {
  if (typeof line !== "object") return line;
  const { title, total, failed } = sections[line.sectionIndex];
  return `\n── ${title} ── ${failed ? `${total - failed}/${total} 件（NG ${failed}件）` : `${total}件すべて通過`}`;
}).join("\n"));
console.log(`\n${failures ? "FAIL" : "PASS"}: ${checks - failures}/${checks} 件`);
if (failures) {
  console.log("出力JSONの差分が意図した仕様変更なら、node tests/run.mjs --update で基準を更新してください。");
  process.exit(1);
}
