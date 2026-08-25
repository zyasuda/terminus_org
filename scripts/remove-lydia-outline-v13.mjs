import sharp from "sharp";

const pairs = [
  ["assets/standee/lydia-standee-v12-front.png", "assets/standee/lydia-standee-v13-front.png"],
  ["assets/standee/lydia-standee-v12-back.png", "assets/standee/lydia-standee-v13-back.png"],
];

for (const [input, output] of pairs) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += 4) data[i] = data[i] >= 128 ? 255 : 0;
  await sharp(data, { raw: info }).png().toFile(output);
  console.log(output);
}
