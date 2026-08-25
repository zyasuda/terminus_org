import sharp from "sharp";
import { fileURLToPath } from "node:url";

const assets = new URL("../assets/standee/", import.meta.url);
const targets = [
  ["gareth-standee-v11-front.png", "gareth-standee-v12-front.png", { exposure: 0.28, shadowLift: 0.028 }],
  ["gareth-standee-v11-back.png", "gareth-standee-v12-back.png", { exposure: 0.28, shadowLift: 0.028 }],
  ["lydia-standee-v06-front-cutout.png", "lydia-standee-v12-front.png", { exposure: -0.04, shadowLift: 0.012 }],
  ["lydia-standee-v04-back.png", "lydia-standee-v12-back.png", { exposure: -0.04, shadowLift: 0.012 }],
];

const clamp = value => Math.max(0, Math.min(1, value));
const smoothstep = (a, b, value) => { const t = clamp((value - a) / (b - a)); return t * t * (3 - 2 * t); };
const toLinear = value => (value / 255) ** 2.2;
const toSrgb = value => Math.round(clamp(value) ** (1 / 2.2) * 255);

for (const [source, output, grade] of targets) {
  const input = sharp(fileURLToPath(new URL(source, assets)));
  const { data, info } = await input.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const gain = 2 ** grade.exposure;
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    let r = toLinear(data[i]) * gain, g = toLinear(data[i + 1]) * gain, b = toLinear(data[i + 2]) * gain;
    const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
    const shadow = 1 - smoothstep(0.04, 0.42, luma);
    r += grade.shadowLift * shadow * 0.85;
    g += grade.shadowLift * shadow;
    b += grade.shadowLift * shadow * 1.15;
    const grey = r * 0.2126 + g * 0.7152 + b * 0.0722;
    r = grey + (r - grey) * 0.86;
    g = grey + (g - grey) * 0.86;
    b = grey + (b - grey) * 0.86;
    const highlight = smoothstep(0.28, 0.78, grey);
    r *= 1 + highlight * 0.035;
    b *= 1 - highlight * 0.025;
    data[i] = toSrgb(r); data[i + 1] = toSrgb(g); data[i + 2] = toSrgb(b);
  }
  await sharp(data, { raw: info }).png().toFile(fileURLToPath(new URL(output, assets)));
  console.log(output);
}
