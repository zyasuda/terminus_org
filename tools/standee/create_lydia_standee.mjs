import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.env.STANDEE_ROOT
  ? path.resolve(process.env.STANDEE_ROOT)
  : path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const OUT_DIR = path.join(ROOT, "public/models/standee");
const CHARACTER = process.env.STANDEE_CHARACTER ?? "lydia";
const sourcePath = file => path.resolve(ROOT, file);
const FRONT = sourcePath(process.env.STANDEE_FRONT ?? `public/models/standee/${CHARACTER}-front.png`);
const BACK = sourcePath(process.env.STANDEE_BACK ?? `public/models/standee/${CHARACTER}-back.png`);
const OUT = sourcePath(process.env.STANDEE_OUT ?? `public/models/standee/${CHARACTER}-standee-v01.glb`);
const frontName = path.basename(FRONT);
const backName = path.basename(BACK);
const frontNormalName = `${CHARACTER}-front-normal.png`;
const backNormalName = `${CHARACTER}-back-normal.png`;

const align4 = (n) => (n + 3) & ~3;
const chunks = [];
let byteLength = 0;
function pushBytes(bytes, alignment = 4) {
  const start = align4(byteLength);
  if (start > byteLength) chunks.push(Buffer.alloc(start - byteLength));
  chunks.push(bytes);
  byteLength = start + bytes.length;
  return { byteOffset: start, byteLength: bytes.length };
}

function pushTyped(values, Type) {
  const data = Buffer.from(new Uint8Array(new Type(values).buffer));
  return pushBytes(data);
}

function pushIndices(values) {
  return pushTyped(values, Uint16Array);
}

function pngSize(file) {
  const data = fs.readFileSync(file);
  if (data.readUInt32BE(0) !== 0x89504e47) throw new Error(`${file} is not PNG`);
  return { data, width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

// 元画像の明暗から簡易ノーマルマップを作る。立体モデル化ではなく、
// 印刷面にだけ微細な凹凸の反応を足すための軽い表現。
async function normalMap(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const output = Buffer.alloc(data.length, 255);
  const luminance = (x, y) => {
    const index = (Math.max(0, Math.min(info.height - 1, y)) * info.width + Math.max(0, Math.min(info.width - 1, x))) * 4;
    return (data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114) / 255;
  };
  for (let y = 0; y < info.height; y += 1) for (let x = 0; x < info.width; x += 1) {
    const dx = (luminance(x + 1, y) - luminance(x - 1, y)) * 1.8;
    const dy = (luminance(x, y + 1) - luminance(x, y - 1)) * 1.8;
    const nx = -dx, ny = -dy, nz = 1;
    const length = Math.hypot(nx, ny, nz) || 1;
    const index = (y * info.width + x) * 4;
    output[index] = Math.round((nx / length * 0.5 + 0.5) * 255);
    output[index + 1] = Math.round((ny / length * 0.5 + 0.5) * 255);
    output[index + 2] = Math.round((nz / length * 0.5 + 0.5) * 255);
    output[index + 3] = data[index + 3];
  }
  return sharp(output, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

function accessor(bufferView, componentType, count, type, min, max) {
  const itemSize = { SCALAR: 1, VEC2: 2, VEC3: 3 }[type];
  return {
    bufferView,
    componentType,
    count,
    type,
    ...(min ? { min } : {}),
    ...(max ? { max } : {}),
    ...(itemSize ? {} : { normalized: false }),
  };
}

function addMeshGeometry(gltf, positions, normals, uvs, indices, material) {
  const positionView = pushTyped(positions, Float32Array);
  const normalView = normals ? pushTyped(normals, Float32Array) : null;
  const uvView = uvs ? pushTyped(uvs, Float32Array) : null;
  const indexView = pushIndices(indices);
  const positionIndex = gltf.accessors.push(accessor(gltf.bufferViews.push({ ...positionView, target: 34962 }) - 1, 5126, positions.length / 3, "VEC3")) - 1;
  const normalIndex = normals
    ? gltf.accessors.push(accessor(gltf.bufferViews.push({ ...normalView, target: 34962 }) - 1, 5126, normals.length / 3, "VEC3")) - 1
    : null;
  const uvIndex = uvs
    ? gltf.accessors.push(accessor(gltf.bufferViews.push({ ...uvView, target: 34962 }) - 1, 5126, uvs.length / 2, "VEC2")) - 1
    : null;
  const indexIndex = gltf.accessors.push(accessor(gltf.bufferViews.push({ ...indexView, target: 34963 }) - 1, 5123, indices.length, "SCALAR")) - 1;
  return {
    attributes: { POSITION: positionIndex, ...(normalIndex === null ? {} : { NORMAL: normalIndex }), ...(uvIndex === null ? {} : { TEXCOORD_0: uvIndex }) },
    indices: indexIndex,
    material,
  };
}

// 画像のアルファ輪郭から、スタンディーの側面だけを作る。
// 前後の印刷面は従来の透明PNG平面を使い、側面だけを体型に合わせることで、
// 前後のテクスチャ用UVを複雑なポリゴンへ再割り当てせずに済ませる。
function addSilhouetteEdge(gltf, points, y0, height, width, depth, bevel, material) {
  const rings = [
    { z: -depth / 2, scale: 0.95 },
    { z: -depth / 2 + bevel, scale: 1 },
    { z: depth / 2 - bevel, scale: 1 },
    { z: depth / 2, scale: 0.95 },
  ];
  const positions = [], normals = [], ringSize = points.length;
  for (const ring of rings) for (let i = 0; i < ringSize; i += 1) {
    const point = points[i];
    positions.push(point.x * ring.scale, y0 + point.y * ring.scale, ring.z);
    const next = points[(i + 1) % ringSize];
    const dx = next.x - point.x, dy = next.y - point.y, length = Math.hypot(dx, dy) || 1;
    const sideX = dy / length, sideY = -dx / length;
    const bevelNormal = ring.z > depth * 0.25 ? Math.SQRT1_2 : ring.z < -depth * 0.25 ? -Math.SQRT1_2 : 0;
    const sideScale = Math.sqrt(1 - bevelNormal * bevelNormal);
    normals.push(sideX * sideScale, sideY * sideScale, bevelNormal);
  }
  const indices = [];
  for (let ring = 0; ring < rings.length - 1; ring += 1) for (let i = 0; i < ringSize; i += 1) {
    const next = (i + 1) % ringSize;
    const a = ring * ringSize + i, b = ring * ringSize + next;
    const c = (ring + 1) * ringSize + next, d = (ring + 1) * ringSize + i;
    indices.push(a, b, c, a, c, d);
  }
  return addMeshGeometry(gltf, positions, normals, null, indices, material);
}

function addCylinder(gltf, radius, y0, y1, segments, material) {
  const positions = [], normals = [], indices = [];
  for (const y of [y0, y1]) for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    positions.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    normals.push(0, y === y1 ? 1 : -1, 0);
  }
  for (let i = 0; i < segments; i += 1) {
    const next = (i + 1) % segments;
    indices.push(i, next, segments + next, i, segments + next, segments + i);
  }
  const topCenter = positions.length / 3;
  positions.push(0, y1, 0); normals.push(0, 1, 0);
  const bottomCenter = positions.length / 3;
  positions.push(0, y0, 0); normals.push(0, -1, 0);
  for (let i = 0; i < segments; i += 1) {
    const next = (i + 1) % segments;
    indices.push(topCenter, segments + i, segments + next, bottomCenter, next, i);
  }
  return addMeshGeometry(gltf, positions, normals, null, indices, material);
}

const front = pngSize(FRONT);
const back = pngSize(BACK);
const alpha = await sharp(FRONT).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const frontNormal = await normalMap(FRONT);
const backNormal = await normalMap(BACK);
const frontImage = pushBytes(front.data);
const backImage = pushBytes(back.data);
const frontNormalImage = pushBytes(frontNormal);
const backNormalImage = pushBytes(backNormal);

const gltf = {
  asset: { version: "2.0", generator: `Terminus ${CHARACTER} standee prototype` },
  scene: 0,
  scenes: [{ nodes: [0, 1] }],
  nodes: [
    { name: `${CHARACTER}StandeePanel`, mesh: 0 },
    { name: "TransparentAcrylicBase", mesh: 1 },
  ],
  meshes: [],
  materials: [
    {
      name: `${CHARACTER}FrontPrint`,
      doubleSided: true,
      alphaMode: "MASK",
      alphaCutoff: 0.02,
      pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], roughnessFactor: 0.82, baseColorTexture: { index: 0 } },
      normalTexture: { index: 2, scale: 0.35 },
    },
    {
      name: `${CHARACTER}BackPrint`,
      doubleSided: true,
      alphaMode: "MASK",
      alphaCutoff: 0.02,
      pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], roughnessFactor: 0.82, baseColorTexture: { index: 1 } },
      normalTexture: { index: 3, scale: 0.35 },
    },
    {
      name: "ClearAcrylicEdge",
      doubleSided: true,
      alphaMode: "BLEND",
      pbrMetallicRoughness: { baseColorFactor: [0.72, 0.9, 1, 0.78], metallicFactor: 0.08, roughnessFactor: 0.22 },
    },
  ],
  textures: [
    { sampler: 0, source: 0 },
    { sampler: 0, source: 1 },
    { sampler: 0, source: 2 },
    { sampler: 0, source: 3 },
  ],
  samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }],
  images: [
    { bufferView: 0, mimeType: "image/png", name: frontName },
    { bufferView: 0, mimeType: "image/png", name: backName },
    { bufferView: 0, mimeType: "image/png", name: frontNormalName },
    { bufferView: 0, mimeType: "image/png", name: backNormalName },
  ],
  bufferViews: [],
  accessors: [],
  buffers: [],
  extras: { type: "die-cut-standee", thicknessMeters: 0.12, base: "transparent-acrylic", sourceTextures: [frontName, backName], normalMaps: [frontNormalName, backNormalName] },
};

// Images are appended first; all later bufferView indices are shifted after geometry is built.
// Keep the source bufferView indices explicit so the resulting GLB remains easy to inspect.
gltf.bufferViews.push({ ...frontImage });
gltf.bufferViews.push({ ...backImage });
gltf.bufferViews.push({ ...frontNormalImage });
gltf.bufferViews.push({ ...backNormalImage });
gltf.images[0].bufferView = 0;
gltf.images[1].bufferView = 1;
gltf.images[2].bufferView = 2;
gltf.images[3].bufferView = 3;

const panel = [];
// 盤面上で小さく見えないよう、従来サイズから約1.2倍へ拡大する。
// ガレスは画像の透明余白ぶんを補正し、リディアより大きく見せる。
const sizeScale = 1.2 * (CHARACTER === "gareth" ? 1.3 : 1);
const width = 1.02 * sizeScale;
const height = 1.8 * sizeScale;
// 台座に立てたときに足元が安定して見える、適度な厚み。
const depth = 0.12;
const baseHeight = 0.1;
// 画像下端の透明余白を台座の下へ逃がし、実際の足裏を台座上面へ合わせる。
let bottom = -1;
for (let y = alpha.info.height - 1; y >= 0 && bottom < 0; y -= 1) {
  for (let x = 0; x < alpha.info.width; x += 1) {
    if (alpha.data[(y * alpha.info.width + x) * 4 + 3] >= 24) { bottom = y; break; }
  }
}
const bottomPad = bottom >= 0 ? (1 - bottom / (alpha.info.height - 1)) * height : 0;
const y0 = baseHeight - bottomPad;
const y1 = y0 + height;
const z = depth / 2;
// glTFのV=0は画像の下端。PNGの上端をモデルの上端へ合わせるためVを反転する。
const uv = [0, 1, 1, 1, 1, 0, 0, 0];
panel.push(addMeshGeometry(gltf, [-width / 2, y0, z, width / 2, y0, z, width / 2, y1, z, -width / 2, y1, z], [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], uv, [0, 1, 2, 0, 2, 3], 0));
panel.push(addMeshGeometry(gltf, [width / 2, y0, -z, -width / 2, y0, -z, -width / 2, y1, -z, width / 2, y1, -z], [0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1], uv, [0, 1, 2, 0, 2, 3], 1));
// アルファの外周を列ごとに拾い、上下の輪郭をつないで体型の側面にする。
// 4px刻みなのでGLBが過剰に重くならず、輪郭は十分滑らかに見える。
const silhouette = [];
const step = 4;
for (let x = 0; x < alpha.info.width; x += step) {
  let top = alpha.info.height, bottom = -1;
  for (let y = 0; y < alpha.info.height; y += 2) {
    if (alpha.data[(y * alpha.info.width + x) * 4 + 3] < 24) continue;
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (bottom < 0) continue;
  silhouette.push({ x: (x / (alpha.info.width - 1) - 0.5) * width, y: (1 - top / (alpha.info.height - 1)) * height });
}
const lower = [];
for (let i = silhouette.length - 1; i >= 0; i -= 1) {
  const x = Math.round(((silhouette[i].x / width) + 0.5) * (alpha.info.width - 1));
  let bottom = -1;
  for (let y = alpha.info.height - 1; y >= 0; y -= 2) if (alpha.data[(y * alpha.info.width + Math.max(0, Math.min(alpha.info.width - 1, x))) * 4 + 3] >= 24) { bottom = y; break; }
  if (bottom >= 0) lower.push({ x: silhouette[i].x, y: (1 - bottom / (alpha.info.height - 1)) * height });
}
const outline = [...silhouette, ...lower];
if (outline.length >= 8) panel.push(addSilhouetteEdge(gltf, outline, y0, height, width, depth, 0.03, 2));
gltf.meshes.push({ name: `${CHARACTER}StandeePanel`, primitives: panel });
// 台座は円形のまま、直径だけを1タイル内に収める。
const baseDiameter = 0.76;
gltf.meshes.push({ name: "TransparentAcrylicBase", primitives: [addCylinder(gltf, baseDiameter / 2, 0, baseHeight, 32, 2)] });

// glTFのbufferViewは、参照するバッファ番号を必ず持つ。省略すると
// GLTFLoaderが画像を辿れず、Three.js側で代替フィギュアに落ちる。
gltf.bufferViews = gltf.bufferViews.map(view => ({ buffer: 0, ...view }));
gltf.bufferViews[0] = { buffer: 0, ...frontImage };
gltf.bufferViews[1] = { buffer: 0, ...backImage };
gltf.images[0].bufferView = 0;
gltf.images[1].bufferView = 1;
gltf.images[2].bufferView = 2;
gltf.images[3].bufferView = 3;
gltf.buffers.push({ byteLength });

function jsonChunk(value) {
  const raw = Buffer.from(JSON.stringify(value));
  return Buffer.concat([raw, Buffer.alloc(align4(raw.length) - raw.length, 0x20)]);
}

const json = jsonChunk(gltf);
const bin = Buffer.concat(chunks.concat([Buffer.alloc(align4(byteLength) - byteLength)]));
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
const jsonHeader = Buffer.alloc(8);
jsonHeader.writeUInt32LE(json.length, 0);
jsonHeader.writeUInt32LE(0x4e4f534a, 4);
const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(bin.length, 0);
binHeader.writeUInt32LE(0x004e4942, 4);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, Buffer.concat([header, jsonHeader, json, binHeader, bin]));
console.log(`wrote ${OUT}`);
console.log(`textures ${front.width}x${front.height}, ${back.width}x${back.height}`);
