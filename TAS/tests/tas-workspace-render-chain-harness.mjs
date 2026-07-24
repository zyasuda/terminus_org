#!/usr/bin/env node
/*
 * TAS workspaceDraft/applyWorkspaceDraft/renderTab/renderAll 統合ハーネス。
 *
 * これら4関数は改修のたびに再定義が積み重なり(各6〜8重)、mockCampaignPayloadと同じ
 * モンキーパッチ連鎖になっていた。統合前の挙動を基準として固定し、統合後も
 * 同じ下書き内容・同じ画面出力になることを確認する。
 *
 * 初回の基準更新（意図した仕様変更時だけ）:
 *   node tests/tas-workspace-render-chain-harness.mjs --update
 *
 * 通常の回帰確認:
 *   node tests/tas-workspace-render-chain-harness.mjs
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const requireFromMock2 = createRequire("/Users/yasuda_k/Desktop/Terminus/trpg-gm-mock2/package.json");
const { chromium } = requireFromMock2("playwright");
const tasDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = path.join(tasDir, "tests/fixtures/tas-workspace-render-baseline.json");
const port = 8894;
const baseUrl = "http://127.0.0.1:" + port;

// "entities"は独立タブではなく、renderScenesにより"world"へリダイレクトされる内部状態のため対象外
const ALL_TABS = ["world", "cast", "monsters", "items", "rules", "export", "structure", "state", "expression", "playtest", "draft", "concepts"];

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("TASテストサーバーの起動がタイムアウトしました")), 10_000);
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.stdout.on("data", text => {
      if (String(text).includes("http://localhost:" + port)) { clearTimeout(timer); resolve(); }
    });
    child.stderr.on("data", text => {
      if (String(text).includes("Error")) { clearTimeout(timer); reject(new Error(String(text))); }
    });
  });
}

const server = spawn(process.execPath, ["server.cjs"], {
  cwd: tasDir, env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"]
});

let browser;
try {
  await waitForServer(server);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

  // 状態を厚くする: 同行者・モンスター・アイテムを追加し、各タブのensure*初期化を一通り走らせる。
  // campaign.jsonの既存データ(錆喰い等)からmonsters/itemsが自動で先読みされるため、
  // 「追加前の件数」を見てから新規行のインデックスを決める(0番目とは限らない)。
  await page.locator('[data-global="cast"]').click();
  await page.locator("#btnAddCompanion").click();
  await page.locator('[data-cast-name-id="member_2"]').fill("リディア");

  await page.locator('[data-global="monsters"]').click();
  const monsterIndex = await page.evaluate(() => monsters.length);
  await page.locator("#btnAddMonster").click();
  await page.locator(`.monster-name[data-monster-index="${monsterIndex}"]`).fill("硫黄トカゲ");

  await page.locator('[data-global="items"]').click();
  const itemIndex = await page.evaluate(() => items.length);
  await page.locator("#btnAddItem").click();
  await page.locator(`.item-name[data-item-index="${itemIndex}"]`).fill("試験用の道具");

  await page.locator('[data-global="concepts"]').click();
  await page.locator('[data-global="world"]').click();

  /* 新規作成直後の下書き(draftA)は、entityLedgerのaliases等が未確定(キー自体が無い)ことがある。
     保存・復元(apply→get)を1回経た後の状態(draftB)を「安定状態」とし、そこからもう一度
     保存・復元しても変化しない(draftB===draftC)ことを冪等性の基準とする */
  const draftA = await page.evaluate(() => workspaceDraft());
  const draftB = await page.evaluate(source => { applyWorkspaceDraft(source); return workspaceDraft(); }, draftA);
  const draftC = await page.evaluate(source => { applyWorkspaceDraft(source); return workspaceDraft(); }, draftB);
  assert.deepEqual(draftC, draftB, "workspaceDraft→applyWorkspaceDraft→workspaceDraftが安定しません(冪等性が壊れています)");
  const draft = draftB;

  const tabSnapshots = {};
  for (const tab of ALL_TABS) {
    const snapshot = await page.evaluate(tabName => {
      activeTab = tabName;
      renderAll();
      return {
        tabContent: document.querySelector("#tabContent")?.innerHTML || "",
        layerTabs: document.querySelector("#layerTabs")?.innerHTML || "",
        rightBody: document.querySelector("#rightBody")?.innerHTML || ""
      };
    }, tab);
    tabSnapshots[tab] = snapshot;
  }

  const result = { draft, tabSnapshots };

  if (process.argv.includes("--update")) {
    fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
    fs.writeFileSync(baselinePath, JSON.stringify(result, null, 2) + "\n", "utf8");
    console.log("UPDATED: " + path.relative(tasDir, baselinePath));
  } else {
    assert.ok(fs.existsSync(baselinePath), "基準出力がありません。--updateで意図的に基準を作成してください");
    const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
    assert.deepEqual(result, baseline, "workspaceDraft/renderTab連鎖の統合前後で出力が変わっています。差分を確認してください");
    console.log("PASS: TAS workspace/render chain compatibility");
  }
  assert.deepEqual(pageErrors, [], "画面実行エラー: " + pageErrors.join(" / "));
} finally {
  await browser?.close();
  server.kill();
}
