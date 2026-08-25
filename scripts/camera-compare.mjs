// カメラの構図案を、同じ盤面・同じ駒で並べて撮る。数値では決められないので画像で比べる。
//
// 検証したいこと: 「手前の駒が奥の駒を隠す」対処が3重(方位角オフセット/隣接時の見下ろし
// 角上げ/遮蔽フェード)になっている。フェードだけで足りるなら、絵を歪める前2つを外せる。
//
//   node scripts/camera-compare.mjs            (要: npm run dev)
//   出力: output/camera-compare.png
import { chromium } from "playwright";
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const URL = process.env.DEV_URL || "https://127.0.0.1:5173/expedition";
const W = 560, H = 420;

// heroが奥の敵と画面上で重なる最悪の配置。方位角45度でheroが敵の真ん前に来る。
const CASES = [
  { key: "a-current",   label: "現行 方位角25度(オフセット20) / 見下ろし60度",   azim: 25, elev: 60, fade: true },
  { key: "b-offset0",   label: "オフセット0 方位角45度 / 見下ろし60度",          azim: 45, elev: 60, fade: true },
  { key: "c-candidate", label: "候補 方位角45度 / 見下ろし20度",                 azim: 45, elev: 20, fade: true },
  { key: "d-offsetonly",label: "オフセット20のみ 方位角25度 / 見下ろし20度",      azim: 25, elev: 20, fade: true },
  { key: "e-nofade",    label: "参考 フェード無し 方位角45度 / 見下ろし20度",     azim: 45, elev: 20, fade: false },
];

const browser = await chromium.launch();
const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: W, height: H } });
const errors = [];
page.on("pageerror", e => errors.push(e.message));
await page.goto(URL, { waitUntil: "networkidle" });

await page.evaluate(async ([w, h]) => {
  const { createBattleScene } = await import("/src/battle/view3d.js");
  const { createGrid } = await import("/src/battle/core.js");
  const mount = document.createElement("div");
  mount.id = "cam-compare";
  mount.style.cssText = `position:fixed;left:0;top:0;width:${w}px;height:${h}px;z-index:9999;background:#161a22`;
  document.body.append(mount);
  window.__cam = createBattleScene(mount, createGrid(Array(7).fill(".......")), { cameraZoom: 2.0 });
}, [W, H]);

// スタンディGLBの読込を待つ。読込前に撮ると板が出ず、比較にならない。
await page.evaluate(() => {
  window.__units = [
    { id: "hero",  side: "party", x: 4, y: 4, hp: 10, maxHp: 10, height: 1.84, modelId: "gareth-standee", facing: Math.PI * 1.25 },
    { id: "mage",  side: "party", x: 5, y: 5, hp: 10, maxHp: 10, height: 1.72, modelId: "lydia-standee",  facing: Math.PI * 1.25 },
    { id: "enemy", side: "enemy", x: 3, y: 3, hp: 10, maxHp: 10, height: 0.8,  modelId: "rust-eater" },
  ];
  window.__cam.sync({ units: window.__units, targetIds: ["enemy"] });
});
await page.waitForFunction(() => {
  const m = document.querySelector("#cam-compare")?.dataset.loadedModels || "";
  return m.includes("gareth-standee") && m.includes("lydia-standee") && m.includes("rust-eater");
}, null, { timeout: 20000 });
await page.waitForTimeout(400);

const shots = [];
for (const c of CASES) {
  const state = await page.evaluate(([azim, elev, fade]) => {
    const s = window.__cam;
    s.setCameraAzimuthDeg(azim);
    s.setCameraElevationDeg(elev);
    s.sync({ units: window.__units, targetIds: fade ? ["enemy"] : [] });
    return new Promise(r => setTimeout(() => r({
      occluding: document.querySelector("#cam-compare").dataset.occludingUnits,
      opacity: document.querySelector("#cam-compare").dataset.occlusionOpacity,
    }), 250));
  }, [c.azim, c.elev, c.fade]);
  shots.push({ ...c, png: await page.screenshot(), ...state });
  console.log(`${c.key.padEnd(12)} ${c.label}\n             遮る駒=${state.occluding || "(なし)"} 不透明度=${state.opacity || "-"}`);
}

// 錆喰いのアクリル化を依頼するための参考図(既存GLBの正面・背面)。
await page.evaluate(() => {
  window.__cam.setCameraElevationDeg(8);
  window.__cam.setCameraZoom(3);
  window.__cam.sync({ units: [{ id: "enemy", side: "enemy", x: 3, y: 3, hp: 10, maxHp: 10, height: 0.8, modelId: "rust-eater" }] });
});
const refs = [];
for (const [name, azim] of [["front", 45], ["side", 135], ["back", 225]]) {
  await page.evaluate(a => window.__cam.setCameraAzimuthDeg(a), azim);
  await page.waitForTimeout(200);
  refs.push({ name, png: await page.screenshot() });
}

await browser.close();
if (errors.length) console.log(`\n警告 ブラウザJSエラー: ${errors.join(" / ")}`);

await mkdir("output", { recursive: true });
const LABEL_H = 30;
const label = text => sharp({
  create: { width: W, height: LABEL_H, channels: 4, background: "#0d1016" },
}).composite([{
  input: Buffer.from(`<svg width="${W}" height="${LABEL_H}"><text x="8" y="20" font-family="Hiragino Sans, sans-serif" font-size="15" fill="#cfd8e3">${text}</text></svg>`),
}]).png().toBuffer();

const tile = async s => sharp({ create: { width: W, height: H + LABEL_H, channels: 4, background: "#0d1016" } })
  .composite([{ input: await label(s.label ?? s.name), top: 0, left: 0 }, { input: s.png, top: LABEL_H, left: 0 }])
  .png().toBuffer();

const sheet = async (items, cols, out) => {
  const rows = Math.ceil(items.length / cols);
  const tiles = await Promise.all(items.map(tile));
  await sharp({ create: { width: W * cols, height: (H + LABEL_H) * rows, channels: 4, background: "#0d1016" } })
    .composite(tiles.map((input, i) => ({ input, left: (i % cols) * W, top: Math.floor(i / cols) * (H + LABEL_H) })))
    .png().toFile(out);
  console.log(`  ${out}`);
};
console.log("\n出力:");
await sheet(shots, 2, "output/camera-compare.png");
await sheet(refs, 3, "output/rust-eater-reference.png");
