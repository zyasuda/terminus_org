import { chromium } from "playwright";
import { createFloor, newVillage, route } from "./core.js";

const URL = process.env.SMOKE_URL || "https://127.0.0.1:5174/expedition";
const browser = await chromium.launch();
process.on("uncaughtException", async error => { console.error(error); await browser.close(); process.exit(1); });
const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1100, height: 800 } });
const errors = [];
page.on("pageerror", e => errors.push(e.message));
const text = () => page.locator("body").innerText();
const fast = () => page.evaluate(() => { Math.random = () => .95; const real = window.setTimeout; window.setTimeout = (fn, ms = 0, ...args) => real(fn, Math.min(ms, 1), ...args); });
const walkTo = async (floor, from, to) => { for (const step of route(floor, from, to)) await page.keyboard.press(step.dx === 1 ? "ArrowRight" : step.dx === -1 ? "ArrowLeft" : step.dy === 1 ? "ArrowDown" : "ArrowUp"); };
const win = async () => {
  for (let i = 0; i < 10; i++) {
    const hit = page.getByRole("button", { name: "接近／攻撃" });
    if (await hit.count()) await hit.click();
    await page.waitForTimeout(80);
    if ((await page.locator("canvas").count()) === 0) return;
    if ((await text()).includes("敗北")) throw new Error("勝利側の守護者戦で敗北した");
  }
  throw new Error("戦闘が勝利で終わらない");
};

await page.goto(URL, { waitUntil: "networkidle" });
await fast();
await page.evaluate(() => localStorage.removeItem("ai_companion_expedition_b1"));
await page.reload({ waitUntil: "networkidle" });
await fast();
await page.getByRole("button", { name: "坑道の剣 12G" }).click();
await page.getByRole("button", { name: "地下1階へ遠征" }).click();
const seed = Number((await text()).match(/seed (\d+)/)[1]), floor = createFloor(seed);
let at = floor.entrance, carriedHp = null;
for (const [index, event] of floor.events.entries()) {
  console.log(`fight ${event.id}`); await walkTo(floor, at, event); await page.waitForTimeout(80);
  if (carriedHp !== null && !(await text()).includes(`あなた ${carriedHp}/16`)) throw new Error("前戦のHPが次戦へ引き継がれない");
  if (index === 0) {
    await page.getByRole("button", { name: "退却", exact: true }).click();
    for (let i = 0; i < 4; i++) { const end = page.getByRole("button", { name: "ターン終了" }); if (await end.count()) await end.click(); await page.waitForTimeout(80); }
    await page.getByRole("button", { name: "攻撃", exact: true }).click();
  }
  await win(); at = event;
  if (index === 0) { carriedHp = (await page.evaluate(() => JSON.parse(localStorage.getItem("ai_companion_expedition_b1")).floor.party.hero)); if (carriedHp >= 16) throw new Error("検査戦でダメージを受けなかった"); }
}
await walkTo(floor, at, floor.chest); await page.getByRole("button", { name: "宝箱を開ける" }).click();
await walkTo(floor, floor.chest, floor.entrance); await page.getByRole("button", { name: "入口から帰還" }).click();
if (!(await text()).includes("無事に村へ帰還")) throw new Error("宝箱から徒歩帰還できない");

const defeatFloor = createFloor(77);
await page.evaluate(({ village, floor }) => localStorage.setItem("ai_companion_expedition_b1", JSON.stringify({ village, floor, haul: ["sword","mail","charm","tonic","tonic"], command: "retreat", message: "検査", battleId: "guardian" })), { village: newVillage({ stash: [] }), floor: defeatFloor });
await page.reload({ waitUntil: "networkidle" });
await fast();
if ((await page.locator("canvas").count()) !== 1) throw new Error("保存済みの戦闘を復元できない: " + await text());
for (let i = 0; i < 40; i++) { const end = page.getByRole("button", { name: "ターン終了" }); if (await end.count()) await end.click(); await page.waitForTimeout(80); if ((await page.locator("canvas").count()) === 0) break; }
await page.waitForTimeout(900);
if ((await page.locator("canvas").count()) !== 0) throw new Error("敗北戦闘が完了しない: " + await text());
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("ai_companion_expedition_b1")));
const kept = saved.village.stash.length;
if (kept < 2 || kept > 4) throw new Error(`敗北保持が2〜4個ではない: ${kept}`);
if (errors.length) throw new Error(errors.join("\n"));
console.log("expedition/smoke: 村→通常戦2→守護者→宝箱→徒歩帰還、全滅保持を確認");
await browser.close();
