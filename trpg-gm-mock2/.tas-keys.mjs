import { chromium } from "playwright";
import fs from "node:fs";
const data = (JSON.parse(fs.readFileSync("/Users/yasuda_k/Downloads/tas_campaign_data (2).json", "utf8"))).data;
const b = await chromium.launch();
const p = await b.newPage();
await p.goto("http://localhost:8801", { waitUntil: "domcontentloaded" });
await p.waitForFunction(() => { try { return context !== null && typeof mockCampaignPayload === "function" } catch { return false } }, null, { timeout: 20000 });
await p.evaluate(v => localStorage.setItem("tas_campaign_draft_v1", JSON.stringify(v)), data);
await p.reload({ waitUntil: "domcontentloaded" });
await p.waitForFunction(() => { try { return context !== null && typeof mockCampaignPayload === "function" } catch { return false } }, null, { timeout: 20000 });
await p.waitForTimeout(800);
console.log(await p.evaluate(() => {
  const nodes = chapterNodes().filter(n => n.type === "scene");
  const keys = Object.keys(sceneOverrides);
  const rows = nodes.map((n, i) => {
    const k = nodeKey(n);
    const ov = sceneOverrides[k];
    return `  [i=${i}] node.id=${JSON.stringify(n.id)} node.index=${JSON.stringify(n.index)} name=${n.name}
        nodeKey => ${k}
        上書きが当たったか: ${ov ? "はい" : "いいえ"} / 要素: ${JSON.stringify((ov?.discoveries || []).map(d => d.label))}`;
  });
  return `sceneOverridesのキー: ${JSON.stringify(keys)}\ncurrentScenes().length = ${currentScenes().length}\n` + rows.join("\n");
}));
await b.close();
