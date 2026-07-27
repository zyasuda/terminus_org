/* 戦闘画面のブラウザ確認。ロジックはcore.test.mjsが見るので、
   ここは「実際に描画され、操作でき、エラーが出ない」ことだけを確かめる。
   使い方: npm run dev を起動した状態で npm run smoke:battle
   スクリーンショットは /tmp/battle_smoke.png に出る。 */

import { chromium } from "playwright";

// fixture=melee は開始時点で敵と隣接している盤面。ターンを送るだけで必ず交戦する。
// seedを固定して障害物の配置も毎回同じにする(遊ぶときは無指定で毎回変わる)
const URL = process.env.SMOKE_URL || "https://localhost:5173/battle?fixture=melee&seed=42";

const browser = await chromium.launch();
const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1000, height: 800 } });
const errors = [];
page.on("pageerror", e => errors.push("pageerror: " + e));
page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

const canvas = page.locator("canvas");
if (await canvas.count() !== 1) throw new Error("canvasが描画されていない");

// 手番表示が出ているか(初期状態はガレスの手番)
const hud = await page.locator("body").innerText();
if (!hud.includes("の手番")) throw new Error("手番の表示がない:\n" + hud);

// ターンを送り、敵の自動行動で実際に交戦するところまで回す
for (let i = 0; i < 8; i++) {
  const btn = page.locator('button:has-text("ターン終了")');
  if (await btn.isEnabled().catch(() => false)) await btn.click();
  await page.waitForTimeout(900);
  if ((await page.locator("body").innerText()).includes("攻撃")) break;
}

await page.screenshot({ path: "/tmp/battle_smoke.png" });
const finalText = await page.locator("body").innerText();
console.log(finalText);
if (!finalText.includes("攻撃")) throw new Error("交戦まで到達しなかった");

if (errors.length) {
  console.error("--- ERRORS ---\n" + errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log("\nbattle/smoke: エラーなし(/tmp/battle_smoke.png)");
}
await browser.close();
