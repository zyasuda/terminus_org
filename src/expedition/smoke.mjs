import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createFloor, newVillage, route } from "./core.js";

const URL = process.env.SMOKE_URL || "https://127.0.0.1:5174/expedition";
const browser = await chromium.launch();
const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1100, height: 800 } });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const text = () => page.locator("body").innerText();
const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem("ai_companion_expedition_b1")));
const keyFor = dir => ({ north: "ArrowUp", east: "ArrowRight", south: "ArrowDown", west: "ArrowLeft" })[dir];
const waitForHero = () => page.getByRole("button", { name: "接近／攻撃" }).waitFor({ state: "visible", timeout: 5000 });

// 実際のThree.jsメッシュで、アイソメトリックの対象選択と攻撃カメラの両方を確認する。
// data属性はレンダラー内部の材質をDOMから検査するための読み取り専用観測点。
async function checkOccluderFade() {
  const result = await page.evaluate(async () => {
    const { createBattleScene } = await import("/src/battle/view3d.js");
    const { createGrid } = await import("/src/battle/core.js");
    const mount = document.createElement("div");
    mount.style.cssText = "position:fixed;left:0;top:0;width:600px;height:400px";
    document.body.append(mount);
    const scene = createBattleScene(mount, createGrid(Array(7).fill(".......")));
    const enemy = { id: "enemy", side: "enemy", x: 3, y: 3, hp: 10, height: .9, modelId: "rust-eater" };
    const isoHero = { id: "hero", side: "party", x: 4, y: 4, hp: 10, height: 1.6, modelId: "gareth" };
    scene.sync({ units: [isoHero, enemy], targetIds: ["enemy"] });
    await new Promise(resolve => setTimeout(resolve, 250));
    const iso = [mount.dataset.occlusionTarget, mount.dataset.occludingUnits, mount.dataset.occlusionOpacity];

    const hero = { ...isoHero, x: 1, y: 1 };
    const mage = { id: "mage", side: "party", x: 2, y: 2, hp: 10, height: 1.6, modelId: "lydia" };
    scene.sync({ units: [hero, mage, enemy] });
    scene.setCombatCamera(hero, enemy);
    await new Promise(resolve => setTimeout(resolve, 80));
    const combat = [mount.dataset.occlusionTarget, mount.dataset.occludingUnits, mount.dataset.occlusionOpacity];

    scene.sync({ units: [hero, enemy] });
    await new Promise(resolve => setTimeout(resolve, 30));
    const removed = mount.dataset.occludingUnits;
    scene.setCameraFocus(null);
    await new Promise(resolve => setTimeout(resolve, 30));
    const restored = [mount.dataset.occlusionTarget, mount.dataset.occludingUnits, mount.dataset.occlusionOpacity];
    scene.dispose();
    mount.remove();
    return { iso, combat, removed, restored };
  });
  assert.deepEqual(result, { iso: ["enemy", "hero", "0.35"], combat: ["enemy", "mage", "0.35"], removed: "", restored: ["", "", ""] }, "遮る味方だけを透過し、対象解除・削除・カメラ復帰で戻す");
}

async function travelTo(roomId) {
  for (let steps = 0; steps < 100; steps += 1) {
    const game = await saved();
    if (game.floor.at === roomId) return;
    const path = route(game.floor, game.floor, { roomId });
    assert.ok(path?.length, `${roomId} への経路が無い`);
    await page.keyboard.press(keyFor(path[0].dir));
    await page.waitForTimeout(35);
    if (await page.locator("canvas").count()) return;
  }
  throw new Error(`${roomId} へ到達しない`);
}

async function win() {
  for (let i = 0; i < 12; i += 1) {
    if ((await page.locator("canvas").count()) === 0) return;
    await page.waitForFunction(() => !document.querySelector("canvas") || [...document.querySelectorAll("button")].some(button => button.textContent === "接近／攻撃"), null, { timeout: 5000 });
    if ((await page.locator("canvas").count()) === 0) return;
    await page.getByRole("button", { name: "接近／攻撃" }).click();
    await page.waitForTimeout(1050);
  }
  throw new Error("戦闘が勝利で終わらない");
}

await page.goto(URL, { waitUntil: "networkidle" });
await checkOccluderFade();
await page.evaluate(() => { localStorage.removeItem("ai_companion_expedition_b1"); Math.random = () => .9; });
await page.reload({ waitUntil: "networkidle" });
await page.evaluate(() => { Math.random = () => .9; });
await page.getByRole("button", { name: "坑道の剣 12G" }).click();
await page.getByRole("button", { name: "装備" }).nth(1).click();
await page.getByRole("button", { name: "地下1階へ遠征" }).click();
await page.locator("svg[aria-label='探索地図']").waitFor();
await page.screenshot({ path: "/tmp/expedition-rogue-map.png" });
assert.equal(await page.locator(".rogue-floor rect").count() >= 1, true, "部屋をSVGの面として描画する");
assert.equal(await page.locator(".rogue-floor polyline").count() >= 1, true, "通路をSVGの線として描画する");

await travelTo("fight-0");
await page.locator("[data-battle-layout='corridor-3x7']").waitFor();
assert.equal(await page.locator("[data-battle-layout='corridor-3x7']").count(), 1, "通常遭遇は3x7通路盤面");

// 初手の前衛移動の後、リディアは一度だけ遠隔攻撃して敵手番へ渡す。
await page.getByRole("button", { name: "接近／攻撃" }).click();
await page.getByText("リディアの手番").waitFor({ timeout: 3000 });
await page.waitForTimeout(1150);
assert.equal(((await text()).match(/リディアの攻撃/g) || []).length, 1, "リディアの自動手番が重複しない");
await waitForHero();
await page.getByRole("button", { name: "接近／攻撃" }).click();
await page.locator("[data-camera='combat']").waitFor({ timeout: 1200 });
await page.screenshot({ path: "/tmp/expedition-combat-camera.png" });
await page.waitForTimeout(500);
assert.equal(await page.locator("[data-camera='iso']").count(), 1, "攻撃演出後はアイソメトリックへ戻る");
await win();

await travelTo("fight-1");
await page.locator("[data-battle-layout='corridor-3x7']").waitFor();
await win();
await travelTo("guardian");
await page.locator("[data-battle-layout='arena-8x8']").waitFor();
await win();
await page.getByRole("button", { name: "宝箱を開ける" }).click();
await travelTo("entrance");
await page.getByRole("button", { name: "入口から帰還" }).click();
assert.ok((await text()).includes("無事に村へ帰還"), "宝箱から徒歩で帰還できる");

const defeatFloor = createFloor(77);
await page.evaluate(({ village, floor }) => localStorage.setItem("ai_companion_expedition_b1", JSON.stringify({ village, floor, haul: ["sword", "mail", "charm", "tonic", "tonic"], command: "retreat", message: "検査", battleId: "guardian" })), { village: newVillage({ stash: [] }), floor: { ...defeatFloor, party: { hero: 1, mage: 1 } } });
await page.reload({ waitUntil: "networkidle" });
await page.evaluate(() => { Math.random = () => .9; });
await page.locator("canvas").waitFor();
for (let i = 0; i < 20 && await page.locator("canvas").count(); i += 1) {
  const end = page.getByRole("button", { name: "ターン終了" });
  if (await end.count() && await end.isEnabled()) await end.click();
  await page.waitForTimeout(900);
}
assert.equal(await page.locator("canvas").count(), 0, "敗北戦闘が完了する");
const kept = (await saved()).village.stash.length;
assert.ok(kept >= 2 && kept <= 4, `敗北保持が2〜4個ではない: ${kept}`);
assert.deepEqual(errors, [], `ブラウザJSエラー: ${errors.join(" / ")}`);
console.log("expedition/smoke: SVG地図→通路戦→リディア1手番→対面カメラ→守護者→帰還、全滅保持を確認");
await browser.close();
