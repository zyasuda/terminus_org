import { chromium } from "playwright";
import fs from "node:fs";
const data = (JSON.parse(fs.readFileSync("/Users/yasuda_k/Downloads/tas_campaign_data (2).json", "utf8"))).data;
const labels = o => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, (v?.discoveries || []).map(d => d.label)]));
console.log("① 保存ファイル:", JSON.stringify(labels(data.sceneOverrides), null, 1));
const b = await chromium.launch();
const p = await b.newPage();
await p.goto("http://localhost:8801", { waitUntil: "domcontentloaded" });
await p.waitForFunction(() => { try { return context !== null } catch { return false } }, null, { timeout: 20000 });
await p.evaluate(v => localStorage.setItem("tas_campaign_draft_v1", JSON.stringify(v)), data);
console.log("② localStorageへ書いた直後:", await p.evaluate(() => {
  const d = JSON.parse(localStorage.getItem("tas_campaign_draft_v1"));
  return JSON.stringify(Object.fromEntries(Object.entries(d.sceneOverrides).map(([k, v]) => [k, (v?.discoveries || []).map(x => x.label)])), null, 1);
}));
await p.reload({ waitUntil: "domcontentloaded" });
await p.waitForFunction(() => { try { return context !== null && typeof mockCampaignPayload === "function" } catch { return false } }, null, { timeout: 20000 });
await p.waitForTimeout(900);
console.log("③ reload後のメモリ上 sceneOverrides:", await p.evaluate(() =>
  JSON.stringify(Object.fromEntries(Object.entries(sceneOverrides).map(([k, v]) => [k, (v?.discoveries || []).map(x => x.label)])), null, 1)));
console.log("④ reload後のlocalStorage:", await p.evaluate(() => {
  const d = JSON.parse(localStorage.getItem("tas_campaign_draft_v1"));
  return JSON.stringify(Object.fromEntries(Object.entries(d.sceneOverrides).map(([k, v]) => [k, (v?.discoveries || []).map(x => x.label)])), null, 1);
}));
await b.close();
