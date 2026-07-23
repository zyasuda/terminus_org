#!/usr/bin/env node
/*
 * TAS シーン完了条件の回帰テスト。
 * secretsAny(OR) / secretsAll(AND) が出力時に入れ替わらないことを確認する。
 * 実データやmock2のファイルは書き換えない。
 *
 * 実行: node tests/tas-complete-requires-contract.mjs
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
// mock2が実際に読むネスト側の章データを比較対象にする。
const source = JSON.parse(fs.readFileSync(path.join(tasDir, "../trpg-gm-mock2/public/data/campaigns/campaign/chapter_01.json"), "utf8"));
const port = 8897;
const baseUrl = `http://127.0.0.1:${port}`;

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("TASテストサーバーの起動がタイムアウトしました")), 10_000);
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.stdout.on("data", text => {
      if (String(text).includes(`http://localhost:${port}`)) { clearTimeout(timer); resolve(); }
    });
    child.stderr.on("data", text => {
      if (String(text).includes("Error")) { clearTimeout(timer); reject(new Error(String(text))); }
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
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

  const payload = await page.evaluate(() => mockCampaignPayload());
  const outputScenes = payload.chapter?.scenes || [];
  const failures = [];
  for (const [index, sourceScene] of (source.scenes || []).entries()) {
    const expected = sourceScene.completeRequires || {};
    if (!Object.keys(expected).length) continue;
    const actual = outputScenes[index]?.completeRequires || {};
    for (const key of ["secretsAny", "secretsAll"]) {
      const expectedValues = expected[key] || [];
      const actualValues = actual[key] || [];
      if (JSON.stringify(expectedValues) !== JSON.stringify(actualValues)) {
        failures.push(`scene ${sourceScene.id} ${key}: expected=${JSON.stringify(expectedValues)} actual=${JSON.stringify(actualValues)}`);
      }
    }
  }
  const runtimeChecks = await page.evaluate(() => ({
    andIncomplete: playtestExitRequiresMatches({ secretsAll: ["a", "b"] }, { discovered: { a: true }, flags: {}, items: {}, npcs: {}, unlocked: {}, battles: {} }),
    andComplete: playtestExitRequiresMatches({ secretsAll: ["a", "b"] }, { discovered: { a: true, b: true }, flags: {}, items: {}, npcs: {}, unlocked: {}, battles: {} }),
    orComplete: playtestExitRequiresMatches({ secretsAny: ["a", "b"] }, { discovered: { b: true }, flags: {}, items: {}, npcs: {}, unlocked: {}, battles: {} })
  }));
  assert.equal(runtimeChecks.andIncomplete, false, "secretsAllが未完了でも通過しています");
  assert.equal(runtimeChecks.andComplete, true, "secretsAllが完了しても通過できません");
  assert.equal(runtimeChecks.orComplete, true, "secretsAnyのOR判定が通過しません");
  assert.deepEqual(failures, [], `シーン完了条件の出力不一致:\n${failures.join("\n")}`);
  assert.deepEqual(pageErrors, [], `画面実行エラー: ${pageErrors.join(" / ")}`);
  console.log("PASS: TAS completeRequires contract");
} finally {
  await browser?.close();
  server.kill();
}
