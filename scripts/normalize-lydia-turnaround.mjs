import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const sourceDir = path.join(root, "assets/standee");
const outputDir = path.join(root, "output");
const frontSource = path.join(sourceDir, "lydia-standee-v12-front.png");
const backSource = path.join(sourceDir, "lydia-standee-v12-back.png");
const frontOutput = path.join(sourceDir, "lydia-standee-v26-front.png");
const backOutput = path.join(sourceDir, "lydia-standee-v26-back.png");
const layoutOutput = path.join(sourceDir, "lydia-standee-v26.json");
const proofOutput = path.join(outputDir, "lydia-standee-v26-turnaround.png");

const alphaBounds = async file => {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = -1, bottom = -1;
  for (let y = 0; y < info.height; y += 1) for (let x = 0; x < info.width; x += 1) {
    if (data[(y * info.width + x) * 4 + 3] <= 128) continue;
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  assert.ok(right >= left && bottom >= top, `${path.basename(file)} に不透明な人物領域がない`);
  return { left, top, right, bottom, width: right - left + 1, height: bottom - top + 1, canvasWidth: info.width, canvasHeight: info.height };
};

const normalizeTo = async (source, destination, target) => {
  const sourceBounds = await alphaBounds(source);
  assert.equal(sourceBounds.canvasWidth, target.canvasWidth, "前後画像のキャンバス幅を揃える");
  assert.equal(sourceBounds.canvasHeight, target.canvasHeight, "前後画像のキャンバス高さを揃える");
  const figure = await sharp(source)
    .extract({ left: sourceBounds.left, top: sourceBounds.top, width: sourceBounds.width, height: sourceBounds.height })
    .resize(target.width, target.height, { fit: "fill", kernel: "lanczos3" })
    .png()
    .toBuffer();
  await sharp({ create: { width: target.canvasWidth, height: target.canvasHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: figure, left: target.left, top: target.top }])
    .png()
    .toFile(destination);
  const actual = await alphaBounds(destination);
  assert.deepEqual(
    { left: actual.left, top: actual.top, width: actual.width, height: actual.height },
    { left: target.left, top: target.top, width: target.width, height: target.height },
    `${path.basename(destination)} の人物基準線を統一する`,
  );
  return { source: sourceBounds, actual };
};

await fs.mkdir(outputDir, { recursive: true });
const frontBounds = await alphaBounds(frontSource);
const canonical = { ...frontBounds };
const front = await normalizeTo(frontSource, frontOutput, canonical);
const back = await normalizeTo(backSource, backOutput, canonical);

const gap = 72, margin = 48, header = 76;
const proofWidth = canonical.canvasWidth * 2 + gap + margin * 2;
const proofHeight = canonical.canvasHeight + header + margin;
const frontX = margin, backX = margin + canonical.canvasWidth + gap, imageY = header;
const guide = `
<svg width="${proofWidth}" height="${proofHeight}" xmlns="http://www.w3.org/2000/svg">
  <g fill="#eef4ff" font-family="sans-serif" font-size="26"><text x="${frontX}" y="42">Lydia front — normalized</text><text x="${backX}" y="42">Lydia back — normalized</text></g>
  <g stroke="#e9b84b" stroke-width="2" stroke-dasharray="12 10" opacity=".9">
    <line x1="${frontX + canonical.canvasWidth / 2}" y1="${imageY}" x2="${frontX + canonical.canvasWidth / 2}" y2="${imageY + canonical.canvasHeight}"/>
    <line x1="${backX + canonical.canvasWidth / 2}" y1="${imageY}" x2="${backX + canonical.canvasWidth / 2}" y2="${imageY + canonical.canvasHeight}"/>
    <line x1="${frontX}" y1="${imageY + canonical.bottom}" x2="${frontX + canonical.canvasWidth}" y2="${imageY + canonical.bottom}"/>
    <line x1="${backX}" y1="${imageY + canonical.bottom}" x2="${backX + canonical.canvasWidth}" y2="${imageY + canonical.bottom}"/>
  </g>
  <g fill="#e9b84b" font-family="sans-serif" font-size="20"><text x="${frontX + 8}" y="${imageY + canonical.bottom - 10}">foot baseline</text><text x="${backX + 8}" y="${imageY + canonical.bottom - 10}">foot baseline</text></g>
</svg>`;
await sharp({ create: { width: proofWidth, height: proofHeight, channels: 4, background: { r: 21, g: 25, b: 34, alpha: 1 } } })
  .composite([{ input: frontOutput, left: frontX, top: imageY }, { input: backOutput, left: backX, top: imageY }, { input: Buffer.from(guide), top: 0, left: 0 }])
  .png()
  .toFile(proofOutput);

await fs.writeFile(layoutOutput, `${JSON.stringify({
  version: "v26",
  source: { front: path.basename(frontSource), back: path.basename(backSource) },
  canvas: { width: canonical.canvasWidth, height: canonical.canvasHeight },
  figure: [canonical.left, canonical.top, canonical.right, canonical.bottom],
  anchors: { centerX: canonical.left + canonical.width / 2, footY: canonical.bottom, headY: canonical.top },
  normalization: { front: front.source, back: back.source },
}, null, 2)}\n`);

console.log(JSON.stringify({ frontOutput, backOutput, layoutOutput, proofOutput, figure: canonical }, null, 2));
