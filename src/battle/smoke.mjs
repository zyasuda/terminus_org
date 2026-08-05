/* 戦闘画面のブラウザ確認。ロジックはcore.test.mjsが見るので、
   ここは「実際に描画され、操作でき、エラーが出ない」ことだけを確かめる。
   使い方: npm run dev を起動した状態で npm run smoke:battle
   スクリーンショットは /tmp/battle_smoke.png に出る。 */

import { chromium } from "playwright";

// 分かれ道は会話モードで始まり、同じ舞台で戦闘へ入る。
const URL = process.env.SMOKE_URL || "https://localhost:5173/battle";

const browser = await chromium.launch();
const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1000, height: 800 } });
const errors = [];
const loadedModels = new Set();
page.on("pageerror", e => errors.push("pageerror: " + e));
page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
page.on("response", r => {
  const match = r.url().match(/\/models\/(gareth|lydia|rust-eater|mine-bat)-v02\.glb$/);
  if (match && r.ok()) loadedModels.add(match[1]);
});

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

const canvas = page.locator("canvas");
if (await canvas.count() !== 1) throw new Error("canvasが描画されていない");

// 初期状態は会話モード。戦闘用の手番・HPは出さない。
const hud = await page.locator("body").innerText();
if (!hud.includes("会話モード") || hud.includes("の手番") || hud.includes("錆喰い 10/10")) {
  throw new Error("会話モードのUIが戦闘UIと混ざっている:\n" + hud);
}
if (!loadedModels.has("gareth") || !loadedModels.has("lydia")) throw new Error("味方GLBが読み込まれていない");
await page.screenshot({ path: "/tmp/dialogue_smoke.png" });
await page.locator('button:has-text("リディア視点")').click();
if (!(await page.locator("body").innerText()).includes("リディア視点：坑道の奥を見ている。")) {
  throw new Error("会話相手のカメラ切替ができない");
}
await page.screenshot({ path: "/tmp/dialogue_close_smoke.png" });
await page.locator('button:has-text("広域表示")').click();

const inspectButton = page.locator('button:has-text("封鎖の木柵")');
await inspectButton.click();
if (!(await page.locator("body").innerText()).includes("外部からの侵入を防ぐための目印")) {
  throw new Error("調査カードがシナリオ本文を表示していない");
}
if (!(await page.locator("body").innerText()).includes("中から補修されている")) {
  throw new Error("調査カードに同行者の反応が表示されていない");
}
if (!(await page.locator("body").innerText()).includes("リディア視点：坑道の奥を見ている。")) {
  throw new Error("木柵の調査でリディアへ会話カメラが切り替わらない");
}
if (!(await page.locator("body").innerText()).includes("得体の知れない影が近づく")) {
  throw new Error("木柵の調査で遭遇の導入文が表示されない");
}
await page.waitForTimeout(1400);
if (!(await page.locator("body").innerText()).includes("の手番")) {
  throw new Error("木柵の調査から戦闘モードへ自動遷移していない");
}
if (!loadedModels.has("rust-eater")) throw new Error("錆喰いGLBが読み込まれていない");

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

await page.locator('button:has-text("最初から")').click();
await page.locator('button:has-text("会話モードへ")').click();
await page.locator('button:has-text("崩れた坑道")').click();
if (!(await page.locator("body").innerText()).includes("頭上で羽ばたきが響く")) {
  throw new Error("崩れた坑道の遭遇導入文が表示されない");
}
await page.waitForTimeout(1400);
if (!loadedModels.has("mine-bat")) throw new Error("坑道蝙蝠GLBが読み込まれていない");
if (!(await page.locator("body").innerText()).includes("坑道蝙蝠 6/6")) {
  throw new Error("坑道蝙蝠の戦闘ステータスへ差し替わっていない");
}
await page.screenshot({ path: "/tmp/mine_bat_smoke.png" });

if (errors.length) {
  console.error("--- ERRORS ---\n" + errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log("\nbattle/smoke: エラーなし(/tmp/battle_smoke.png)");
}
await browser.close();
