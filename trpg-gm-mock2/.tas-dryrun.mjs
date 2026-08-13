import { chromium } from "playwright";
import fs from "node:fs";
const draft = JSON.parse(fs.readFileSync("/Users/yasuda_k/Downloads/tas_campaign_data (2).json", "utf8"));
const data = draft.data || draft;
const b = await chromium.launch();
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(e.message));
await p.goto("http://localhost:8801", { waitUntil: "domcontentloaded" });
await p.waitForFunction(() => { try { return context !== null && typeof mockCampaignPayload === "function" } catch { return false } }, null, { timeout: 20000 });
// 作者の保存ファイルを「読込」と同じ経路で復元する(workspace draft なので直接復元)
await p.evaluate(v => localStorage.setItem("tas_campaign_draft_v1", JSON.stringify(v)), data);
await p.reload({ waitUntil: "domcontentloaded" });
await p.waitForFunction(() => { try { return context !== null && typeof mockCampaignPayload === "function" } catch { return false } }, null, { timeout: 20000 });
await p.waitForTimeout(900);
const out = await p.evaluate(() => JSON.stringify(mockCampaignPayload()));
fs.writeFileSync("/tmp/dryrun-payload.json", out);
const pay = JSON.parse(out);
console.log("=== 出力される章データ ===");
(pay.chapter.scenes || []).forEach((s, i) => {
  console.log(`シーン${i + 1} (id=${s.id}) ${s.name || ""}`);
  (s.secrets || []).forEach(x => console.log(`   ${x.entity}  trigger=${JSON.stringify(x.trigger)} aliases=${JSON.stringify(x.aliases)}`));
  (s.exits || []).forEach(e => console.log(`   [出口] id=${e.id} to=${JSON.stringify(e.to)} match=${JSON.stringify(e.match)} requires=${JSON.stringify(e.requires)}`));
});
console.log("\n=== campaign の主要項目 ===");
["cast", "gmSprite", "player"].forEach(k => console.log(`  ${k}: ${JSON.stringify(pay.campaign?.[k])?.slice(0, 90)}`));
console.log(`  entities: ${(pay.campaign?.entities || []).length}件`);
console.log(`  style.extra: ${(pay.campaign?.style?.extra || []).length}件`);
console.log("\nJSエラー:", errs.length ? errs : "なし");
await b.close();
