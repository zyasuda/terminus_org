#!/usr/bin/env node
/*
 * TAS 同行者出力の回帰テスト。
 *
 * 実際の画面操作で member_2 を入力し、mock2向け出力プレビューを検査する。
 * 実データやmock2のファイルは書き換えない（「mock側へ出力」は押さない）。
 *
 * 実行: node tests/tas-companion-output-contract.mjs
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const requireFromMock2 = createRequire("/Users/yasuda_k/Desktop/Terminus/trpg-gm-mock2/package.json");
const { chromium } = requireFromMock2("playwright");
const tasDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = 8899;
const baseUrl = `http://127.0.0.1:${port}`;

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("TASテストサーバーの起動がタイムアウトしました")), 10_000);
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.stdout.on("data", text => {
      if (String(text).includes(`http://localhost:${port}`)) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr.on("data", text => {
      if (String(text).includes("Error")) {
        clearTimeout(timer);
        reject(new Error(String(text)));
      }
    });
  });
}

const server = spawn(process.execPath, ["server.cjs"], {
  cwd: tasDir,
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});

let browser;
try {
  await waitForServer(server);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  assert.equal(await page.evaluate(() => playtestTextMatch("心石を調べる", "心石・石")), true);
  assert.equal(await page.evaluate(() => playtestTextMatch("光を調べる", "光")), true);
  await page.locator('[data-global="cast"]').click();
  await page.locator("#btnAddCompanion").click();

  await page.locator('[data-cast-name-id="member_2"]').fill("リディア");
  await page.locator('[data-cast-profile-id="member_2"]').fill("機械や仕掛けに強い。器用で良く気が利く女性。");
  await page.locator('.cast-gender-input[data-cast-attribute-id="member_2"]').selectOption("female");
  await page.locator('.cast-first-person-input[data-cast-attribute-id="member_2"]').fill("私は");
  await page.locator('.cast-addressing-input[data-cast-attribute-id="member_2"]').fill("あなた");

  await page.locator("#btnBuild").click();
  assert.equal(await page.locator(".export-diagnostics").count(), 1, "出力前チェックが表示されていません");
  const payload = JSON.parse(await page.locator("#exportPreview").inputValue());
  const roundTrip = await page.evaluate(value => gamePayloadToWorkspaceDraft(value), payload);
  const companions = payload.campaign.companions;
  const entities = payload.campaign.entities.filter(entry => entry.kind === "character");
  const lydia = companions.find(entry => entry.id === "member_2");
  const lydiaEntity = entities.find(entry => entry.id === "member_2");
  const assetRefs = Object.values(payload.assets).flatMap(asset => asset.usedBy || []);
  assert.ok(Object.entries(payload.assets).every(([id, asset]) => id && asset.file && Array.isArray(asset.usedBy) && asset.usedBy.length), "assetsの参照情報が不完全です");
  assert.ok(assetRefs.every(ref => typeof ref === "string" && ref.length > 0), "assets.usedByに空の参照があります");

  assert.deepEqual(companions.map(entry => entry.id), ["member_1", "member_2"]);
  assert.ok(entities.some(entry => entry.id === "member_1" && entry.ja === "ガレス"));
  assert.ok(!entities.some(entry => entry.id === "gareth"), "旧同行者ID gareth がエンティティ台帳に残っています");
  assert.equal(lydia?.name, "リディア");
  assert.equal(lydia?.gender, "female");
  assert.equal(lydia?.firstPerson, "私は");
  assert.equal(lydia?.addressTerm, "あなた");
  assert.equal(lydiaEntity?.ja, "リディア");
  assert.equal(roundTrip?.castNames?.member_1, "ガレス");
  assert.equal(roundTrip?.castNames?.member_2, "リディア");
  assert.ok(Array.isArray(roundTrip?.customChapterScenes?.ch1), "ゲーム出力JSONをシーン下書きへ戻せません");
  assert.ok(!assetRefs.some(ref => /campaign\.companions\.(gareth|lydia)\.sprite/.test(ref)), "assets.usedBy に旧同行者IDが残っています");
  assert.deepEqual(pageErrors, [], `画面実行エラー: ${pageErrors.join(" / ")}`);

  console.log("PASS: TAS companion output contract");
} finally {
  await browser?.close();
  server.kill();
}
