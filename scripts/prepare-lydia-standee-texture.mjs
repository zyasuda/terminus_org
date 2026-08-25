import sharp from "sharp";

const input = "assets/standee/lydia-standee-v03-front.png";
const output = "assets/standee/lydia-standee-v06-front-cutout.png";
const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

for (let i = 3; i < data.length; i += 4) {
  // 元絵の茶色い背景は低いアルファを持っている。人物の半透明縁だけを残す。
  data[i] = Math.max(0, Math.min(255, Math.round((data[i] - 190) * 255 / 64)));
}

await sharp(data, { raw: info }).png().toFile(output);
console.log(output);
