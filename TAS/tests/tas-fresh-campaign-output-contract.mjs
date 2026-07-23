#!/usr/bin/env node
/*
 * TAS 新規キャンペーン出力の回帰テスト。
 *
 * 「＋ キャンペーン」で新規下書きを開始したあと、キャラクター・アイテム・
 * フラグを入力し、出力プレビューへ残ることを実際の画面操作で確認する。
 * 実データやmock2のファイルは書き換えない。
 *
 * 実行: node tests/tas-fresh-campaign-output-contract.mjs
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const requireFromMock2 = createRequire("/Users/yasuda_k/Desktop/Terminus/trpg-gm-mock2/package.json");
const { chromium } = requireFromMock2("playwright");
const tasDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = 8898;
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
  await page.evaluate(async () => {
    const campaign = new File([JSON.stringify({
      meta: { title: "再読込テスト" },
      style: { world: "再読込用の世界" },
      companions: [{ id: "member_1", name: "ガレス", persona: "戦士" }]
    })], "campaign.json", { type: "application/json" });
    const chapter = new File([JSON.stringify({
      title: "再読込章",
      scenes: [{ id: 1, name: "再読込シーン", brief: "再読込された開始説明" }]
    })], "chapter_01.json", { type: "application/json" });
    await loadCampaignFiles([campaign, chapter]);
  });
  assert.match(await page.locator("[data-toggle-campaign]").textContent(), /再読込テスト/);
  assert.match((await page.locator(".scene-item").allTextContents()).join(" "), /再読込シーン/);
  await page.locator("#btnBuild").click();
  const roundTripPayload = JSON.parse(await page.locator("#exportPreview").inputValue());
  assert.equal(roundTripPayload.campaign?.meta?.title, "再読込テスト");
  assert.equal(roundTripPayload.chapter?.title, "再読込章");
  assert.equal(roundTripPayload.chapter?.scenes?.[0]?.name, "再読込シーン");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "＋ キャンペーン", exact: true }).click();

  // 新規キャンペーンで追加メンバーを入力する。
  await page.locator('[data-global="cast"]').click();
  await page.locator("#btnAddCompanion").click();
  await page.locator('[data-cast-name-id="member_2"]').fill("リディア");
  await page.locator('[data-cast-profile-id="member_2"]').fill("機械や仕掛けに強い女性。");
  await page.locator('.cast-gender-input[data-cast-attribute-id="member_2"]').selectOption("female");
  await page.locator('.cast-first-person-input[data-cast-attribute-id="member_2"]').fill("私は");
  await page.locator('.cast-addressing-input[data-cast-attribute-id="member_2"]').fill("あなた");

  // 新規アイテムを入力する。出力側では item と initialInventory の両方を確認する。
  await page.locator('[data-global="items"]').click();
  await page.locator("#btnAddItem").click();
  await page.locator(".item-name").first().fill("試験用ランタン");
  await page.locator(".item-acquisition").first().selectOption("starting_inventory");
  await page.locator(".item-notes").first().fill("新規キャンペーンの回帰テスト用アイテム。");

  // 世界状態の宣言も新規キャンペーン出力へ残ることを確認する。
  await page.locator('[data-global="world"]').click();
  await page.locator("#flagDeclarationsField").fill('{"test_state":["未確認","確認済み"]}');

  await page.locator("#btnBuild").click();
  const payload = JSON.parse(await page.locator("#exportPreview").inputValue());
  const companions = payload.campaign?.companions || [];
  const items = payload.campaign?.items || [];
  const entities = payload.campaign?.entities || [];
  const initialInventory = payload.campaign?.initialInventory || payload.chapter?.initialInventory || [];
  const failures = [];
  if (companions.map(entry => entry.id).join(",") !== "member_1,member_2") {
    failures.push(`companions.id=${JSON.stringify(companions.map(entry => entry.id))}`);
  }
  const lydia = companions.find(entry => entry.id === "member_2");
  if (lydia?.name !== "リディア") failures.push(`member_2.name=${JSON.stringify(lydia?.name)}`);
  if (lydia?.gender !== "female") failures.push(`member_2.gender=${JSON.stringify(lydia?.gender)}`);
  if (lydia?.firstPerson !== "私は") failures.push(`member_2.firstPerson=${JSON.stringify(lydia?.firstPerson)}`);
  if (lydia?.addressTerm !== "あなた") failures.push(`member_2.addressTerm=${JSON.stringify(lydia?.addressTerm)}`);
  if (!entities.some(entry => entry.id === "member_2" && entry.ja === "リディア")) {
    failures.push(`member_2 entity=${JSON.stringify(entities.filter(entry => entry.kind === "character"))}`);
  }
  if (!items.some(entry => entry.name === "試験用ランタン" || entry.ja === "試験用ランタン")) {
    failures.push(`items=${JSON.stringify(items)}`);
  }
  if (!initialInventory.length) failures.push("initialInventory が空です");
  if (JSON.stringify(payload.campaign?.flags || {}) !== JSON.stringify({ test_state: ["未確認", "確認済み"] })) {
    failures.push(`campaign.flags=${JSON.stringify(payload.campaign?.flags)}`);
  }
  assert.deepEqual(failures, [], `新規キャンペーン出力の欠落:\n${failures.join("\n")}`);
  assert.deepEqual(pageErrors, [], `画面実行エラー: ${pageErrors.join(" / ")}`);

  console.log("PASS: TAS fresh campaign output contract");
} finally {
  await browser?.close();
  server.kill();
}
