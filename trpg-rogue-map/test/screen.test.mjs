/* 実ブラウザの検査。npm testでは回らない（npm run test:screen）。 */
import assert from "node:assert/strict";
import { chromium } from "/Users/yasuda_k/.nvm/versions/node/v20.14.0/lib/node_modules/playwright/index.mjs";

const SIZES = [
  [390, 844, "iPhone縦"], [430, 932, "大きめの縦"], [768, 1024, "タブレット"],
  [1440, 900, "デスクトップ"], [1280, 720, "ノート"], [1024, 600, "低い画面"],
];

const browser = await chromium.launch();
let checked = 0;
const viewBox = (text) => text.split(" ").map(Number);
const player = async (page) => ({
  x: Number(await page.locator(".player").getAttribute("cx")),
  y: Number(await page.locator(".player").getAttribute("cy")),
});
for (const [width, height, name] of SIZES) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto("http://localhost:8123/", { waitUntil: "networkidle" });

  const controls = await page.locator("#controls").boundingBox();
  assert.ok(controls, `${name}: #controls が無い`);
  assert.ok(controls.y + controls.height <= height + 1,
    `${name} (${width}x${height}): 移動ボタンが画面の外にある（下端 ${Math.round(controls.y + controls.height)} > ${height}）`);
  const scroll = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  assert.ok(scroll <= 1, `${name}: ページが縦に ${scroll}px はみ出している`);
  assert.equal(await page.locator("#controls button").count(), 4, `${name}: 4方向の移動ボタンが無い`);
  assert.ok(await page.locator(".room-name").count() >= 1, `${name}: 部屋名が地図の上に無い`);
  const svg = page.locator("#map svg");
  const floorShapes = await svg.locator(".floor rect, .floor polyline").count();
  const floorCount = Number(await svg.getAttribute("data-floor-count"));
  const cellCount = Number(await svg.getAttribute("data-cell-count"));
  assert.ok(floorShapes <= floorCount * 2, `${name}: 床が部屋数＋通路数より細かく描かれている (${floorShapes})`);
  assert.ok(floorShapes * 3 < cellCount, `${name}: 床がマス単位の図形になっている (${floorShapes}/${cellCount})`);

  const start = await player(page);
  await page.locator("button[data-dir='west']").hover();
  await page.mouse.down();
  await page.waitForTimeout(510);
  await page.mouse.up();
  await page.waitForTimeout(320);
  const afterHold = await player(page);
  assert.ok(afterHold.x <= start.x - 1.5, `${name}: 方向ボタンの長押しで歩き続けない`);
  const beforeClick = await player(page);
  const beforeFollow = await svg.getAttribute("viewBox");
  await page.locator("button[data-dir='south']").click();
  const afterClick = await player(page);
  assert.notDeepEqual(afterClick, beforeClick, `${name}: 移動ボタンを押しても動かない`);
  assert.notEqual(await svg.getAttribute("viewBox"), beforeFollow, `${name}: 現在地へ視点が追従しない`);
  const map = page.locator("#map");
  const box = await map.boundingBox();
  assert.ok(box, `${name}: 地図領域が無い`);
  const beforeDrag = await svg.getAttribute("viewBox");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 70, box.y + box.height / 2 + 20, { steps: 4 });
  await page.mouse.up();
  const dragged = await svg.getAttribute("viewBox");
  assert.notEqual(dragged, beforeDrag, `${name}: ドラッグで視点が動かない`);
  await page.locator("button[data-dir='north']").click();
  assert.equal(await svg.getAttribute("viewBox"), dragged, `${name}: ドラッグ後に視点が勝手に戻る`);
  await page.locator("#reset-view").click();
  const reset = await svg.getAttribute("viewBox");
  assert.notEqual(reset, dragged, `${name}: 戻すで現在地へ復帰しない`);
  const [left, top, vbWidth, vbHeight] = viewBox(reset);
  const current = await player(page);
  assert.ok(Math.abs(left + vbWidth / 2 - current.x) < .01 && Math.abs(top + vbHeight / 2 - current.y) < .01,
    `${name}: 戻す後の視点中心が現在地と一致しない`);
  assert.equal(errors.length, 0, `${name}: JSエラー ${errors.join(" / ")}`);
  await page.close();
  checked += 1;
}
const reduced = await browser.newPage({ viewport: { width: 390, height: 844 } });
await reduced.emulateMedia({ reducedMotion: "reduce" });
await reduced.goto("http://localhost:8123/", { waitUntil: "networkidle" });
assert.equal(await reduced.locator(".torch-mask").evaluate((node) => getComputedStyle(node).animationName), "none",
  "prefers-reduced-motionで灯りの揺らぎが止まらない");
assert.equal(await reduced.locator(".floor-light").evaluate((node) => getComputedStyle(node).animationName), "none",
  "prefers-reduced-motionで灯りの明るさの揺らぎが止まらない");
await reduced.close();
await browser.close();
console.log(`緑: ${checked}種類の画面で、移動、長押し、追従、ドラッグ、戻す、床の図形数、JSエラー無しを確認`);
