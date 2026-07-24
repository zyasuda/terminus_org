#!/usr/bin/env node
/*
 * TAS AI下書き生成(採用フロー)の回帰テスト。
 *
 * 「複数の項目を一括同期するよう修正した。以前は項目ごとに更新イベントを発火し、
 *  最初の再描画で後続項目が取りこぼされる場合があった」(TAS_エンティティ入力補助_AI下書き生成_仕様提案)
 * という既知の不具合が再発しないことを固定する。LLM呼び出しは行わず、entityDraftPendingへ
 * 合成結果を直接注入して採用フローだけを検証する。
 *
 * 実行: node tests/tas-entity-draft-adopt-contract.mjs
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const requireFromMock2 = createRequire("/Users/yasuda_k/Desktop/Terminus/trpg-gm-mock2/package.json");
const { chromium } = requireFromMock2("playwright");
const tasDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = 8895;
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
  const context = await browser.newContext();
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.locator('[data-global="items"]').click();
  await page.locator("#btnAddItem").click();
  await page.locator('.item-name[data-item-index="0"]').fill("古い鍵");

  // LLM呼び出しを経ずにentityDraftPendingへ合成結果を注入し、採用フローだけを検証する
  await page.evaluate(() => {
    const card = document.querySelector(".item-editor");
    const descriptor = entityDraftDescriptor(card);
    entityDraftPending.set(descriptor.key, {
      descriptorKey: descriptor.key,
      createdAt: Date.now(),
      fields: [
        { key: "notes", label: "説明・メモ", selector: ".item-notes", value: "第三坑道の錠に合う古い鍵。", checked: true },
        { key: "aliases", label: "別名・照合語", selector: ".item-aliases", value: "鍵, 古い鍵, カギ", checked: true }
      ]
    });
    decorateEntityDraftCards();
  });

  assert.equal(await page.locator(".entity-draft-preview").count(), 1, "AI下書きプレビューが表示されていません");
  assert.equal(await page.locator('[data-entity-draft-check="0"]').isChecked(), true);
  assert.equal(await page.locator('[data-entity-draft-check="1"]').isChecked(), true);

  await page.locator("[data-apply-entity-draft]").click();

  const adopted = await page.evaluate(() => items[0]);
  assert.equal(adopted.notes, "第三坑道の錠に合う古い鍵。", "notesフィールドが採用されていません(複数項目採用の取りこぼし回帰)");
  assert.deepEqual(adopted.aliases, ["鍵", "古い鍵", "カギ"], "aliasesフィールドが採用されていません(複数項目採用の取りこぼし回帰)");
  assert.equal(await page.locator(".entity-draft-preview").count(), 0, "採用後にAI下書きプレビューが残っています");

  // 未選択の項目は既存値を保持し、上書きされないことを確認する
  await page.evaluate(() => {
    const card = document.querySelector(".item-editor");
    const descriptor = entityDraftDescriptor(card);
    entityDraftPending.set(descriptor.key, {
      descriptorKey: descriptor.key,
      createdAt: Date.now(),
      fields: [
        { key: "notes", label: "説明・メモ", selector: ".item-notes", value: "採用してはいけない上書き案。", checked: false },
        { key: "aliases", label: "別名・照合語", selector: ".item-aliases", value: "採用しない別名", checked: true }
      ]
    });
    decorateEntityDraftCards();
  });
  await page.locator("[data-apply-entity-draft]").click();
  const afterPartial = await page.evaluate(() => items[0]);
  assert.equal(afterPartial.notes, "第三坑道の錠に合う古い鍵。", "未選択のnotesが上書きされています");
  assert.equal(afterPartial.aliases.join(","), "採用しない別名", "選択したaliasesだけが更新されていません");

  assert.deepEqual(pageErrors, [], `画面実行エラー: ${pageErrors.join(" / ")}`);
  console.log("PASS: TAS entity draft adopt contract");
} finally {
  await browser?.close();
  server.kill();
}
