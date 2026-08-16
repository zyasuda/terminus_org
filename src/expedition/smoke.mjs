import assert from "node:assert/strict";
import { chromium } from "playwright";
import * as THREE from "three";
import { isAdjacent } from "../battle/core.js";
import { createFloor, newVillage, route } from "./core.js";
import { EXPEDITION_BATTLE_CONFIG } from "./battleConfig.js";
import { createExpeditionBattleLayout } from "./battleState.js";

const URL = process.env.SMOKE_URL || "https://127.0.0.1:5174/expedition";
const browser = await chromium.launch();
const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1100, height: 800 } });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const text = () => page.locator("body").innerText();
const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem("ai_companion_expedition_b1")));
const keyFor = dir => ({ north: "ArrowUp", east: "ArrowRight", south: "ArrowDown", west: "ArrowLeft" })[dir];
const waitForHero = () => page.waitForFunction(() => {
  if (!document.querySelector("canvas")) return true;
  const battle = document.querySelector('[data-active-unit="hero"]');
  const button = [...(battle?.querySelectorAll("button") || [])].find(item => item.textContent === "待機");
  return !!button && !button.disabled;
}, null, { timeout: 8000 });
const heroButton = name => {
  const buttons = page.locator('[data-active-unit="hero"] button', { hasText: name });
  return name === "攻撃" ? buttons.last() : buttons;
};
const positions = () => page.locator("[data-unit-positions]").getAttribute("data-unit-positions").then(JSON.parse);
const reachCells = () => page.locator("[data-reach-cells]").getAttribute("data-reach-cells").then(JSON.parse);

// 現行の正射影カメラと同じ計算で、実際のcanvas上のマス/ユニットをクリックする。
// UIの状態だけを直接書き換えず、プレイヤーと同じpointerdown経路を検証する。
function projectGridPoint(rect, grid, x, y, height = 0) {
  const viewSize = Math.max(grid.w, grid.h) + 4;
  const camera = new THREE.OrthographicCamera(-(viewSize * rect.width / rect.height) / 2, (viewSize * rect.width / rect.height) / 2, viewSize / 2, -viewSize / 2, 0.1, 200);
  const r = 20, angle = Math.PI / 4, cameraY = r * Math.tan(Math.atan(1 / Math.SQRT2));
  camera.position.set(Math.cos(angle) * r, cameraY, Math.sin(angle) * r);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const point = new THREE.Vector3(x - (grid.w - 1) / 2, height, y - (grid.h - 1) / 2).project(camera);
  return { x: rect.x + (point.x + 1) * rect.width / 2, y: rect.y + (1 - point.y) * rect.height / 2 };
}
async function clickGridPoint(grid, x, y, height = 0) {
  const rect = await page.locator("canvas").boundingBox();
  assert.ok(rect, "戦闘canvasを取得できる");
  const point = projectGridPoint(rect, grid, x, y, height);
  assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y), `canvas上のクリック座標を計算できる: ${JSON.stringify({ rect, grid: { w: grid.w, h: grid.h }, x, y, height, point })}`);
  await page.mouse.click(point.x, point.y);
}
const battleSeed = async () => {
  const game = await saved();
  if (!game?.floor || !game.battleId) return null;
  return (game.floor.seed + [...game.battleId].reduce((n, char) => n + char.charCodeAt(0), 0)) >>> 0;
};
const battleLayout = async layout => {
  const seed = await battleSeed();
  return seed === null ? null : createExpeditionBattleLayout(layout, seed).grid;
};
async function selectMove(grid, to) {
  await heroButton("移動").click();
  await page.locator('[data-hero-action="move"]').waitFor();
  await page.waitForTimeout(100); // Reactの描画後にThree.jsの選択ハンドラも更新される
  await clickGridPoint(grid, to.x, to.y);
  await page.locator('[data-hero-action="moved"]').waitFor();
}
async function selectAttack(grid, target, height) {
  await heroButton("攻撃").click();
  await page.locator('[data-hero-action="attack"]').waitFor();
  await page.waitForTimeout(100); // Reactの描画後にThree.jsの選択ハンドラも更新される
  await clickGridPoint(grid, target.x, target.y, height * 0.45);
  await page.waitForFunction(() => !document.querySelector('[data-hero-action="attack"]'), null, { timeout: 1500 });
}
async function finishBattle(layout) {
  const grid = await battleLayout(layout);
  // 直前の攻撃で戦闘が終わった場合、古いbattleIdで盤面を再計算しない。
  if (!grid) { await page.locator("canvas").waitFor({ state: "detached" }); return; }
  const enemyHeight = (layout === true || layout === "guardian" ? EXPEDITION_BATTLE_CONFIG.units.guardian : EXPEDITION_BATTLE_CONFIG.units.enemy).height;
  for (let i = 0; i < 24; i += 1) {
    if ((await page.locator("canvas").count()) === 0) return;
    await waitForHero();
    if ((await page.locator("canvas").count()) === 0) return;
    const now = await positions();
    const hero = { id: "hero", ...now.hero, hp: 1 };
    const enemy = { id: "enemy", ...now.enemy, hp: 1 };
    if (isAdjacent(hero, enemy)) {
      await selectAttack(grid, enemy, enemyHeight);
    } else {
      const cells = await reachCells();
      const to = cells.sort((a, b) => Math.max(Math.abs(a.x - enemy.x), Math.abs(a.y - enemy.y)) - Math.max(Math.abs(b.x - enemy.x), Math.abs(b.y - enemy.y)))[0];
      assert.ok(to, "敵へ近づける移動先がある");
      await selectMove(grid, to);
      if (isAdjacent(to, enemy)) await selectAttack(grid, enemy, enemyHeight);
      else await heroButton("待機").click();
    }
  }
  throw new Error("戦闘が勝利で終わらない");
}

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

await page.goto(URL, { waitUntil: "networkidle" });
await checkOccluderFade();
await page.evaluate(() => { localStorage.removeItem("ai_companion_expedition_b1"); Math.random = () => .9; Date.now = () => 777; });
await page.reload({ waitUntil: "networkidle" });
await page.evaluate(() => { Math.random = () => .9; Date.now = () => 777; });
await page.getByRole("button", { name: "坑道の剣 12G" }).click();
await page.getByRole("button", { name: "地下1階へ遠征" }).click();
await page.locator("svg[aria-label='探索地図']").waitFor();
// 旧地図版の途中セーブは、探索位置だけ入口へ戻し、同じseedで安全に再開する。
await page.evaluate(() => {
  const game = JSON.parse(localStorage.getItem("ai_companion_expedition_b1"));
  delete game.floor.mapVersion;
  game.floor.at = "fight-0";
  game.floor.pos = { x: 999, y: 999 };
  localStorage.setItem("ai_companion_expedition_b1", JSON.stringify(game));
});
await page.reload({ waitUntil: "networkidle" });
await page.locator("svg[aria-label='探索地図']").waitFor();
assert.equal((await saved()).floor.mapVersion, 2, "旧地図版のセーブを現行版へ移行する");
assert.equal((await saved()).floor.at, "entrance", "旧地図版の不整合な位置は入口へ戻す");
await page.screenshot({ path: "/tmp/expedition-rogue-map.png" });
assert.equal(await page.locator(".rogue-floor rect").count() >= 1, true, "部屋をSVGの面として描画する");
assert.equal(await page.locator(".rogue-floor polyline").count() >= 1, true, "通路をSVGの線として描画する");

// 戦闘外でも、実際のボタン操作で所持品を使い、スタッシュの装備を付け替える。
await page.evaluate(() => {
  const game = JSON.parse(localStorage.getItem("ai_companion_expedition_b1"));
  game.floor.party.hero = 10;
  localStorage.setItem("ai_companion_expedition_b1", JSON.stringify(game));
});
await page.reload({ waitUntil: "networkidle" });
await page.evaluate(() => { Math.random = () => .9; });
await page.locator("svg[aria-label='探索地図']").waitFor();
await page.getByRole("button", { name: "回復薬 (1)" }).first().click();
assert.ok((await text()).includes("あなたは回復薬を使った。HP 10 → 16/16。"), "地図移動中に回復薬を使い、HPを上限まで回復できる");
assert.equal((await saved()).village.stash.includes("tonic"), false, "地図中の回復薬使用はスタッシュの個数も減らす");
await page.getByRole("button", { name: "装備", exact: true }).click();
assert.equal((await saved()).village.equipment.hero.weapon, "sword", "地図移動中にスタッシュの装備を付け替えられる");

await travelTo("junction-0");
await page.locator("[data-battle-layout='junction-7x7']").waitFor();
assert.equal(await page.locator("[data-battle-layout='junction-7x7']").count(), 1, "三叉路の固定遭遇はT字の専用盤面で始まる");
const junction = page.locator("[data-battle-layout='junction-7x7']");
assert.ok(Number(await junction.getAttribute("data-obstacle-count")) >= EXPEDITION_BATTLE_CONFIG.board.obstacles.min, "三叉路にも少数のランダム障害物を置く");
assert.equal(Number(await junction.locator("[data-camera]").getAttribute("data-void-boundary-wall-count")), 15, "三叉路は内側の盤外境界だけに壁面を置き、三つの出口は塞がない");
await page.screenshot({ path: "/tmp/expedition-junction-battle.png" });
await finishBattle("junction");
await page.locator("svg[aria-label='探索地図']").waitFor();
await page.screenshot({ path: "/tmp/expedition-t-junction-map.png" });
// 以降は既存の通し検査なので、追加遭遇によるHP消費を持ち込まない。
await page.evaluate(() => {
  const game = JSON.parse(localStorage.getItem("ai_companion_expedition_b1"));
  game.floor.party = { hero: 16, mage: 12 };
  localStorage.setItem("ai_companion_expedition_b1", JSON.stringify(game));
});
await page.reload({ waitUntil: "networkidle" });
await page.locator("svg[aria-label='探索地図']").waitFor();

await travelTo("fight-0");
await page.locator("[data-battle-layout='corridor-3x7']").waitFor();
assert.equal(await page.locator("[data-battle-layout='corridor-3x7']").count(), 1, "通常遭遇は3x7通路盤面");
const corridor = page.locator("[data-battle-layout='corridor-3x7']");
const blockCount = Number(await corridor.getAttribute("data-obstacle-count"));
assert.ok(blockCount >= EXPEDITION_BATTLE_CONFIG.board.obstacles.min && blockCount <= EXPEDITION_BATTLE_CONFIG.board.obstacles.max, `通路のブロック数がConfig範囲ではない: ${blockCount}`);
const view = corridor.locator("[data-camera]");
const near = (actual, expected) => Math.abs(actual - expected) < 0.001;
const facings = () => view.getAttribute("data-unit-facings").then(JSON.parse);
assert.equal(await view.getAttribute("data-view-direction"), "0", "初期視点は0方向");
assert.deepEqual(JSON.parse(await view.getAttribute("data-model-facing-offsets")), {
  hero: EXPEDITION_BATTLE_CONFIG.presentation.modelFacingOffset.party,
  mage: EXPEDITION_BATTLE_CONFIG.presentation.modelFacingOffset.party,
  enemy: EXPEDITION_BATTLE_CONFIG.presentation.modelFacingOffset.enemy,
}, "GLBの向きはConfigのroot offsetだけで決める");
const initialPositions = await positions();
const initialFacing = await facings();
assert.ok(
  near(initialFacing.hero, Math.atan2(initialPositions.enemy.x - initialPositions.hero.x, initialPositions.enemy.y - initialPositions.hero.y)) &&
  near(initialFacing.mage, Math.atan2(initialPositions.enemy.x - initialPositions.mage.x, initialPositions.enemy.y - initialPositions.mage.y)) &&
  near(initialFacing.enemy, Math.atan2(initialPositions.hero.x - initialPositions.enemy.x, initialPositions.hero.y - initialPositions.enemy.y)),
  "通路端で横並びの味方と敵が正面から対峙する"
);
for (const direction of ["1", "2", "3", "0"]) {
  await page.getByRole("button", { name: "視点を回す" }).click();
  await page.waitForTimeout(400);
  assert.equal(await view.getAttribute("data-view-direction"), direction, `視点を${direction}方向へ回転できる`);
}
await page.screenshot({ path: "/tmp/expedition-corridor-open.png" });
await page.screenshot({ path: "/tmp/expedition-facing-start.png" });

const corridorGrid = await battleLayout(false);
assert.equal(await page.getByRole("button", { name: "接近／攻撃" }).count(), 0, "曖昧な自動行動ボタンを表示しない");
assert.ok((await text()).includes("隣接する敵がいないため、移動または待機"), "隣接敵なしをHUDで表示する");
await waitForHero();
await heroButton("待機").click();
await page.getByText("リディアの手番").waitFor({ timeout: 3000 });
await page.getByText("リディアは魔法の射程へ移動した。").waitFor({ timeout: 3000 });
const magePosition = (await positions()).mage;
assert.ok(near((await facings()).mage, Math.atan2(magePosition.x - initialPositions.mage.x, magePosition.y - initialPositions.mage.y)), "リディアは移動先の方向を向く");
await waitForHero();
const enemyPosition = (await positions()).enemy;
assert.notDeepEqual(enemyPosition, initialPositions.enemy, "敵は主人公手番までに接近する");
assert.ok(near((await facings()).enemy, Math.atan2(enemyPosition.x - 6, enemyPosition.y - 1)), "敵は移動先の方向を向く");

// 移動→攻撃: 青マスを実クリックしてから、隣接した敵を実クリックする。
let beforeMove, moveToAttack;
for (let i = 0; i < 3 && !moveToAttack; i += 1) {
  beforeMove = await positions();
  const reachable = await reachCells();
  moveToAttack = reachable.find(cell => isAdjacent(cell, beforeMove.enemy));
  if (!moveToAttack) { await heroButton("待機").click(); await waitForHero(); }
}
assert.ok(moveToAttack, "移動後に攻撃できる青マスがある");
await selectMove(corridorGrid, moveToAttack);
assert.equal(await corridor.getAttribute("data-hero-action"), "moved", "青マスを1回選ぶと移動済みになる");
assert.ok((await text()).includes("移動済み：攻撃できます"), "移動済みをHUDで表示する");
await selectAttack(corridorGrid, (await positions()).enemy, EXPEDITION_BATTLE_CONFIG.units.enemy.height);
await page.locator("[data-camera='combat']").waitFor({ timeout: 1200 });
await page.screenshot({ path: "/tmp/expedition-combat-camera.png" });
await page.locator("[data-camera='iso']").waitFor({ timeout: 3500 });
assert.equal(await page.locator("[data-camera='iso']").count(), 1, "移動後の攻撃演出はアイソメトリックへ戻る");

// 隣接中でも移動を選べることは、青マスの表示まで確認する。
await waitForHero();
const beforeAdjacentMove = await positions();
assert.ok(isAdjacent(beforeAdjacentMove.hero, beforeAdjacentMove.enemy), "敵に隣接した主人公手番になる");
const sideStep = (await reachCells())[0];
assert.ok(sideStep, "隣接中にも移動先が残る");
await heroButton("移動").click();
await page.locator('[data-hero-action="move"]').waitFor();
assert.ok((await reachCells()).some(cell => cell.x === sideStep.x && cell.y === sideStep.y), "隣接中でも青い移動先を表示する");
assert.ok((await text()).includes("移動先を選択中"), "隣接中の移動選択状態をHUDで表示する");
await heroButton("待機").click();
await finishBattle(false);

await travelTo("fight-1");
await page.locator("[data-battle-layout='corridor-3x7']").waitFor();
await waitForHero();
const secondGrid = await battleLayout(false);
let secondMove;
for (let i = 0; i < 3 && !secondMove; i += 1) {
  const now = await positions();
  secondMove = (await reachCells()).find(cell => isAdjacent(cell, now.enemy));
  if (!secondMove) { await heroButton("待機").click(); await waitForHero(); }
}
assert.ok(secondMove, "攻撃のみの確認前に敵へ近づける");
await selectMove(secondGrid, secondMove);
await selectAttack(secondGrid, (await positions()).enemy, EXPEDITION_BATTLE_CONFIG.units.enemy.height);
await waitForHero();
const attackOnly = await positions();
assert.ok(isAdjacent(attackOnly.hero, attackOnly.enemy), "攻撃だけを選べる距離にいる");
await selectAttack(secondGrid, attackOnly.enemy, EXPEDITION_BATTLE_CONFIG.units.enemy.height);
assert.equal(((await text()).match(/リディアの攻撃/g) || []).length, 1, "リディアの自動手番が重複しない");
await finishBattle(false);
await travelTo("guardian");
await page.locator("[data-battle-layout='arena-8x8']").waitFor();
// 守護者盤面の表示はここで確認済み。以降は宝箱・徒歩帰還の状態遷移検査なので、
// GLBのRaycasterを何十回も使う長期戦は通さず、勝利済みの保存状態へ同期する。
await page.evaluate(() => {
  const game = JSON.parse(localStorage.getItem("ai_companion_expedition_b1"));
  game.floor.events = game.floor.events.map(event => event.id === "guardian" ? { ...event, done: true } : event);
  game.battleId = null;
  localStorage.setItem("ai_companion_expedition_b1", JSON.stringify(game));
});
await page.reload({ waitUntil: "networkidle" });
await page.locator("svg[aria-label='探索地図']").waitFor();
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
  const end = page.getByRole("button", { name: "待機" });
  if (await end.count() && await end.isEnabled()) await end.click();
  await page.waitForTimeout(900);
}
assert.equal(await page.locator("canvas").count(), 0, "敗北戦闘が完了する");
const kept = (await saved()).village.stash.length;
assert.ok(kept >= 2 && kept <= 4, `敗北保持が2〜4個ではない: ${kept}`);
assert.deepEqual(errors, [], `ブラウザJSエラー: ${errors.join(" / ")}`);
console.log("expedition/smoke: SVG地図→通路戦→リディア1手番→対面カメラ→守護者→帰還、全滅保持を確認");
await browser.close();
