#!/usr/bin/env node
/*
 * TAS 出力チェーン互換性ハーネス。
 * 現行のmockCampaignPayloadチェーンを正規化した基準出力と比較し、
 * 将来のチェーン統合でゲーム側契約が変わっていないことを確認する。
 *
 * 初回の基準更新（意図した仕様変更時だけ）:
 *   node tests/tas-chain-compatibility-harness.mjs --update
 *
 * 通常の回帰確認:
 *   node tests/tas-chain-compatibility-harness.mjs
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
const baselinePath = path.join(tasDir, "tests/fixtures/tas-output-baseline.json");
const port = 8896;
const baseUrl = "http://127.0.0.1:" + port;

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

function normalizePayload(payload) {
  const campaign = payload?.campaign || {};
  const chapter = payload?.chapter || {};
  return {
    campaign: {
      meta: { id: campaign.meta?.id || "", title: campaign.meta?.title || "" },
      style: { world: campaign.style?.world || "", terms: campaign.style?.terms || "" },
      companions: (campaign.companions || []).map(entry => ({
        id: entry.id || "", name: entry.name || "", gender: entry.gender || "",
        firstPerson: entry.firstPerson || "", addressTerm: entry.addressTerm || ""
      })),
      items: (campaign.items || []).map(entry => ({
        id: entry.id || "", ja: entry.ja || entry.name || "",
        acquisition: entry.acquisition || "", persistent: Boolean(entry.persistent),
        capabilities: entry.capabilities || []
      })),
      initialInventory: campaign.initialInventory || [],
      initialInventoryIds: campaign.initialInventoryIds || [],
      flags: campaign.flags || {},
      entities: (campaign.entities || []).map(entry => ({
        id: entry.id || "", ja: entry.ja || entry.name || "",
        kind: entry.kind || "", importance: entry.importance || ""
      }))
    },
    chapter: {
      id: chapter.id ?? null,
      title: chapter.title || "",
      intro: chapter.intro ?? null,
      flagsOut: chapter.flagsOut || [],
      scenes: (chapter.scenes || []).map(scene => ({
        id: scene.id ?? null, name: scene.name || "", brief: scene.brief || "",
        completeRequires: scene.completeRequires || {},
        enemy: scene.enemy ? { name: scene.enemy.name || "", hp: scene.enemy.hp ?? null, maxHp: scene.enemy.maxHp ?? null } : null,
        exits: (scene.exits || []).map(exit => ({
          id: exit.id || "", match: exit.match || [], to: exit.to ?? null, requires: exit.requires || {}
        })),
        loot: scene.loot || [],
        secrets: (scene.secrets || []).map(secret => ({
          id: secret.id || "", entity: secret.entity || "", aliases: secret.aliases || []
        }))
      }))
    },
    assets: Object.values(payload?.assets || {})
      .map(asset => ({ file: asset.file || "", usedBy: asset.usedBy || [] }))
      .sort((a, b) => a.file.localeCompare(b.file))
  };
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
  const outputs = await page.evaluate(() => ({
    legacy: window.__tasOutputPipelines.legacy(),
    unified: window.__tasOutputPipelines.unified()
  }));
  const normalizedLegacy = normalizePayload(outputs.legacy);
  const normalized = normalizePayload(outputs.unified);
  assert.deepEqual(normalized, normalizedLegacy, "統合版と現行版の出力が一致しません");

  // チャプターイントロを入力した場合も、旧チェーンと統合層で同じ出力になることを確認する。
  const introOutputs = await page.evaluate(() => {
    const key = nodeKey({ type: "opening", id: "opening" });
    const before = sceneOverrides[key];
    sceneOverrides[key] = { ...(before || {}), brief: "統合テスト用イントロ" };
    const result = {
      legacy: window.__tasOutputPipelines.legacy().chapter?.intro,
      unified: window.__tasOutputPipelines.unified().chapter?.intro
    };
    if (before === undefined) delete sceneOverrides[key];
    else sceneOverrides[key] = before;
    return result;
  });
  assert.deepEqual(introOutputs, { legacy: "統合テスト用イントロ", unified: "統合テスト用イントロ" }, "チャプターイントロの統合出力が一致しません");

  if (process.argv.includes("--update")) {
    fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
    fs.writeFileSync(baselinePath, JSON.stringify(normalized, null, 2) + "\n", "utf8");
    console.log("UPDATED: " + path.relative(tasDir, baselinePath));
  } else {
    assert.ok(fs.existsSync(baselinePath), "基準出力がありません。--updateで意図的に基準を作成してください");
    const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
    assert.deepEqual(normalized, baseline, "出力チェーンの互換性が壊れています。差分を確認してください");
    console.log("PASS: TAS chain compatibility");
  }
  assert.deepEqual(pageErrors, [], "画面実行エラー: " + pageErrors.join(" / "));
} finally {
  await browser?.close();
  server.kill();
}
