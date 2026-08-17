import assert from "node:assert/strict";
import { CHIP_TEMPLATES, validateChipTemplate } from "./chipTemplates.js";
import { generateWithRetry } from "./mapgen.js";

for (const [name, template] of Object.entries(CHIP_TEMPLATES)) {
  assert.deepEqual(validateChipTemplate(template), { ok: true }, `${name} は有効なテンプレートのはず`);
}
console.log(`テンプレート検査: ${Object.keys(CHIP_TEMPLATES).length}/${Object.keys(CHIP_TEMPLATES).length}件が有効`);

const tooNarrow = { w: [5, 5], h: [6, 6], ports: { east: [true, true, true] } };
const invalid = validateChipTemplate(tooNarrow);
assert.equal(invalid.ok, false, "間隔不足を検出するはず");
assert.match(invalid.reason, /east面のslot 0 と 1 の間隔が2マス/);

const branchChapter = template => ({ scenes: [
  { id: "hub", name: "ハブ", size: { w: template.w[0], h: template.h[0] }, ports: {
    north: [false, false, false], south: [false, false, false], west: [false, false, false], ...template.ports,
  },
    exits: [{ to: "c0" }, { to: "c1" }, { to: "c2" }] },
  { id: "c0", name: "枝0", exits: [{ to: "hub" }] },
  { id: "c1", name: "枝1", exits: [{ to: "hub" }] },
  { id: "c2", name: "枝2", exits: [{ to: "hub" }] },
] });

assert.throws(
  () => generateWithRetry(branchChapter(tooNarrow), 0, 50),
  /地図を50回生成できませんでした/,
);
console.log(`間隔不足: validate=false、生成は50回中0回（${invalid.reason}）`);

const chapter = branchChapter(CHIP_TEMPLATES.tripleBranchEast);
let maxRetry = 0;
const corridorAdjacencies = map => {
  const owner = new Map();
  map.corridors.forEach((corridor, index) => corridor.path.forEach(cell => owner.set(`${cell.x},${cell.y}`, index)));
  return [...owner].reduce((count, [key, index]) => {
    const [x, y] = key.split(",").map(Number);
    return count + [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => owner.get(`${x + dx},${y + dy}`) !== undefined && owner.get(`${x + dx},${y + dy}`) !== index).length;
  }, 0);
};
for (let start = 0; start < 100; start += 1) {
  const { map, seed } = generateWithRetry(chapter, start, 500);
  maxRetry = Math.max(maxRetry, seed - start);
  const hub = map.rooms.get("hub");
  const doors = new Set(map.corridors
    .map(corridor => corridor.path.find(cell => cell.x === hub.x + hub.w && cell.y >= hub.y && cell.y < hub.y + hub.h))
    .filter(Boolean)
    .map(cell => cell.y));
  assert.equal(map.corridors.length, 3, `seed ${seed}: 3本の通路が必要`);
  assert.equal(doors.size, 3, `seed ${seed}: 3本とも別々のドアが必要`);
  assert.equal(corridorAdjacencies(map), 0, `seed ${seed}: 3本の通路は独立している必要がある`);
}
console.log(`3スロット分岐: 100/100 seed成功、最大再試行 ${maxRetry}回、各seedで別ドア3本`);
