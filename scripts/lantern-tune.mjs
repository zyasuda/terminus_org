// 夜のランタンの色と強さを、床の色の偏りを実測して決める。
//
// 石畳のテクスチャはモノトーンだが、ランタンが濃い橙(元は0xffa848)なので
// 床が橙に染まってグレーに見えなかった。目で見て決めると照明と床の
// どちらが原因か切り分けられないので、数値で見る。
//
// 偏り = (最大チャンネル - 最小チャンネル) / 平均。0%が完全な無彩色。
//
//   node scripts/lantern-tune.mjs      (要: npm run dev)
import { chromium } from "playwright";
import sharp from "sharp";
import { STANDEE_VERSION as SV } from "../src/battle/standeeVersion.js";

const URL = process.env.DEV_URL || "https://127.0.0.1:5173/expedition";
const W = 520, H = 400;
// 夜のkey光(0xdfe6ff、青み)も床を染めるかを疑って測ったが、これを中立寄りに
// 変えても偏りは改善しなかった(2026-08-25、1.9%→3.0%でむしろ悪化)。
// 床の色を決めているのはランタンなので、動かすのはここだけでよい。
//
// ランタンは炎のゆらぎで明滅するので、同じ設定でも測定値は±1〜2%動く。
// 3%と4%の差は意味がないが、26%と3%の差は意味がある。
const CASES = [
  { label: "元の値 0xffa848", color: 0xffa848 },
  { label: "0xffbe7a",        color: 0xffbe7a },
  { label: "0xffc98f",        color: 0xffc98f },
  { label: "0xffd9a8",        color: 0xffd9a8 },
  { label: "0xffe3bd (採用)",  color: 0xffe3bd },
  { label: "0xfff0dc",        color: 0xfff0dc },
];

const browser = await chromium.launch();
const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: W, height: H } });
await page.goto(URL, { waitUntil: "networkidle" });
await page.evaluate(async ([w, h, v]) => {
  const { createBattleScene } = await import("/src/battle/view3d.js");
  const { createGrid } = await import("/src/battle/core.js");
  const mount = document.createElement("div");
  mount.style.cssText = `position:fixed;left:0;top:0;width:${w}px;height:${h}px;z-index:9999;background:#161a22`;
  document.body.append(mount);
  const s = createBattleScene(mount, createGrid(Array(7).fill(".......")), { cameraZoom: 2.0, cameraElevationDeg: 20 });
  s.setWallsEnabled(false);
  s.setLightPreset("night");
  s.sync({ units: [{ id: "hero", side: "party", x: 2, y: 2, hp: 10, maxHp: 10, height: 1.84, modelId: "gareth-standee", facing: Math.PI }] });
  window.__s = s;
  for (let i = 0; i < 60; i += 1) {
    await new Promise(r => setTimeout(r, 100));
    if (mount.dataset.loadedModels?.includes(`gareth-standee-${v}.glb`)) break;
  }
}, [W, H, SV]);
await page.waitForTimeout(700);

// 床の画素だけを拾う。決め打ちの帯で測ると盤外の背景を測ってしまう
// (実際にやって、背景色#161a22をそのまま「床は青い」と読み違えた)。
// 背景色に近い画素と、駒・接地影のある明るい画素を除いて平均する。
const BG = [0x16, 0x1a, 0x22];
const measureFloor = async png => {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const buckets = { 全体: [0, 0, 0, 0], 明るい側: [0, 0, 0, 0], 暗い側: [0, 0, 0, 0] };
  const lums = [];
  const px = [];
  for (let i = 0; i < info.width * info.height; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    // 背景(盤外)を除く
    if (Math.abs(r - BG[0]) < 7 && Math.abs(g - BG[1]) < 7 && Math.abs(b - BG[2]) < 7) continue;
    const lum = (r + g + b) / 3;
    if (lum > 110) continue;   // 駒(人物の絵)は床よりずっと明るい
    px.push([r, g, b, lum]);
    lums.push(lum);
  }
  lums.sort((a, b) => a - b);
  const mid = lums[Math.floor(lums.length / 2)];
  for (const [r, g, b, lum] of px) {
    const add = k => { buckets[k][0] += r; buckets[k][1] += g; buckets[k][2] += b; buckets[k][3] += 1; };
    add("全体");
    add(lum >= mid ? "明るい側" : "暗い側");
  }
  const out = {};
  for (const [name, [r, g, b, n]] of Object.entries(buckets)) {
    const mean = (r + g + b) / (3 * n);
    out[name] = { r: r / n, g: g / n, b: b / n, mean,
      spread: (Math.max(r, g, b) - Math.min(r, g, b)) / n / mean * 100, n };
  }
  return out;
};
const rows = [];
const shots = [];
for (const c of CASES) {
  await page.evaluate(color => window.__s.setLanternColor(color), c.color);
  await page.waitForTimeout(220);
  const png = await page.screenshot();
  shots.push({ label: c.label, png });
  rows.push({ ...c, per: await measureFloor(png) });
}
await browser.close();

console.log("\n床の色と無彩色からの偏り。明るい側=ランタンの近く、暗い側=離れた所\n");
for (const x of rows) {
  console.log(`  ${x.label}`);
  for (const [name, v] of Object.entries(x.per)) {
    console.log(`      ${name}  R${v.r.toFixed(1)} G${v.g.toFixed(1)} B${v.b.toFixed(1)}  明度${v.mean.toFixed(1)}  偏り ${v.spread.toFixed(1)}%`);
  }
  const worst = Math.max(...Object.values(x.per).map(v => v.spread));
  console.log(`      最大の偏り ${worst.toFixed(1)}%`);
}
const L = 28;
const tiles = await Promise.all(shots.map(async s => sharp({ create: { width: W, height: H + L, channels: 4, background: "#0d1016" } })
  .composite([{ input: Buffer.from(`<svg width="${W}" height="${L}"><text x="8" y="19" font-family="Hiragino Sans" font-size="14" fill="#cfd8e3">${s.label}</text></svg>`), top: 0, left: 0 }, { input: s.png, top: L, left: 0 }]).png().toBuffer()));
await sharp({ create: { width: W * 2, height: (H + L) * 3, channels: 4, background: "#0d1016" } })
  .composite(tiles.map((input, i) => ({ input, left: (i % 2) * W, top: Math.floor(i / 2) * (H + L) }))).png()
  .toFile("output/lantern-tune.png");
console.log("\n  output/lantern-tune.png");
