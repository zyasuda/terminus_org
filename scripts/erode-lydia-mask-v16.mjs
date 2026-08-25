import sharp from "sharp";

const radius = 2;
const pairs = [
  ["assets/standee/lydia-standee-v13-front.png", "assets/standee/lydia-standee-v16-front.png"],
  ["assets/standee/lydia-standee-v13-back.png", "assets/standee/lydia-standee-v16-back.png"],
];

for (const [input, output] of pairs) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alpha = new Uint8Array(info.width * info.height);
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) alpha[y * info.width + x] = data[(y * info.width + x) * 4 + 3];
  }
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      let keep = true;
      for (let dy = -radius; dy <= radius && keep; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= info.width || ny < 0 || ny >= info.height || alpha[ny * info.width + nx] === 0) {
            keep = false;
            break;
          }
        }
      }
      data[(y * info.width + x) * 4 + 3] = keep ? 255 : 0;
    }
  }
  await sharp(data, { raw: info }).png().toFile(output);
  console.log(output);
}
