import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { depthOf, generate, generateWithRetry, linksOf } from "../src/mapgen.js";
import { exitsFrom, lit, start, step } from "../src/expedition.js";

const chapter = JSON.parse(await readFile(new URL("../data/lanternhill_ch1.json", import.meta.url)));
const generated = Array.from({ length: 100 }, (_, seed) => ({ start: seed, ...generateWithRetry(chapter, seed) }));
const maps = generated.map(({ map }) => map);
const linkKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const touchingRooms = (cell, rooms) => [...rooms.values()].filter((room) => (
  ((cell.x === room.x - 1 || cell.x === room.x + room.w) && cell.y >= room.y && cell.y < room.y + room.h) ||
  ((cell.y === room.y - 1 || cell.y === room.y + room.h) && cell.x >= room.x && cell.x < room.x + room.w)
));

function distances(map) {
  const result = { [map.entrance]: 0 };
  const queue = [map.entrance];
  for (let i = 0; i < queue.length; i += 1) for (const corridor of map.corridors) {
    const next = corridor.a === queue[i] ? corridor.b : corridor.b === queue[i] ? corridor.a : null;
    if (next !== null && result[next] === undefined) {
      result[next] = result[queue[i]] + 1;
      queue.push(next);
    }
  }
  return result;
}

assert.deepEqual(linksOf(chapter), [
  { a: 1, b: 2 }, { a: 2, b: 5 }, { a: 2, b: 6 }, { a: 3, b: 4 },
  { a: 3, b: 6 }, { a: 3, b: 7 }, { a: 4, b: 7 },
]);
assert.deepEqual(linksOf({ scenes: [
  { id: 1, exits: [{ to: 2 }, { to: "ending" }] }, { id: 2, exits: [{ to: 1 }] },
] }), [{ a: 1, b: 2 }], "linksOfはendingを捨て、双方向を1本にする");

for (const map of maps) {
  assert.equal(map.rooms.size, chapter.scenes.length, "1. 全部屋を配置する");
  for (const room of map.rooms.values()) {
    assert.ok(room.w >= 4 && room.h >= 3, "v2: 部屋は壁際まで歩ける大きさ");
  }
  for (const [id, room] of map.rooms) for (const [otherId, other] of map.rooms) if (id < otherId) {
    assert.ok(room.x + room.w < other.x || other.x + other.w < room.x || room.y + room.h < other.y || other.y + other.h < room.y,
      "2. 部屋の間に1マス以上の隙間がある");
  }
  for (const corridor of map.corridors) {
    const touches = new Map([...map.rooms.keys()].map((id) => [id, 0]));
    for (const cell of corridor.path) {
      for (const room of touchingRooms(cell, map.rooms)) touches.set(room.id, touches.get(room.id) + 1);
      for (const room of map.rooms.values()) assert.ok(cell.x < room.x || cell.x >= room.x + room.w || cell.y < room.y || cell.y >= room.y + room.h,
        "3. 通路は部屋を貫通しない");
    }
    for (const [id, count] of touches) assert.equal(count, id === corridor.a || id === corridor.b ? 1 : 0,
      "8. 通路は端点の出入口だけで部屋に接する");
    assert.ok(touchingRooms(corridor.path[0], map.rooms).some((room) => room.id === corridor.a), "8. 通路の始点はaの出入口に接する");
    assert.ok(touchingRooms(corridor.path.at(-1), map.rooms).some((room) => room.id === corridor.b), "8. 通路の終点はbの出入口に接する");
  }
  assert.deepEqual(new Set(map.corridors.map(({ a, b }) => linkKey(a, b))), new Set(linksOf(chapter).map(({ a, b }) => linkKey(a, b)), "4. 全接続を通路にする"));
  assert.equal(Object.keys(distances(map)).length, chapter.scenes.length, "5. 入口から全部屋へ到達できる");
  const actualDepths = distances(map);
  for (const [id, depth] of Object.entries(depthOf(chapter))) assert.equal(actualDepths[id], depth, "7. 深い部屋ほど通路数が少なくならない");
}

const first = generateWithRetry(chapter, 42).map;
const second = generateWithRetry(chapter, 42).map;
assert.deepEqual([...first.rooms.entries(), ...first.cells.entries(), ...first.corridors], [...second.rooms.entries(), ...second.cells.entries(), ...second.corridors],
  "6. 同じseedは同じ地図を作る");

const wallState = start(first);
const entrance = first.rooms.get(first.entrance);
wallState.pos = { x: entrance.x, y: entrance.y };
const wallBefore = { at: wallState.at, visited: new Set(wallState.visited), walked: new Set(wallState.walked), seen: new Set(wallState.seen), pos: { ...wallState.pos } };
assert.equal(step(wallState, first, "north"), false, "v2: 壁へstepしても進まない");
assert.deepEqual(wallState, wallBefore, "v2: 壁へのstepは状態を変えない");
const state = start(first);
const before = { ...state.pos };
const seenAtStart = `${state.pos.x},${state.pos.y}`;
assert.ok(step(state, first, "west") && step(state, first, "west"), "v2: 部屋の中を横に2マス歩ける");
assert.equal(state.pos.x, before.x - 2, "v2: stepは1マスずつ位置を更新する");
assert.ok(state.seen.has(seenAtStart), "v2: 一度見えたマスは離れても残る");
const crossing = start(first);
const exit = exitsFrom(crossing, first)[0];
const routeTo = (from, target) => {
  const key = (cell) => `${cell.x},${cell.y}`;
  const queue = [from];
  const previous = new Map([[key(from), null]]);
  const deltas = [["north", 0, -1], ["east", 1, 0], ["south", 0, 1], ["west", -1, 0]];
  for (let index = 0; index < queue.length; index += 1) {
    for (const [dir, x, y] of deltas) {
      const next = { x: queue[index].x + x, y: queue[index].y + y };
      if (!first.cells.has(key(next)) || previous.has(key(next))) continue;
      previous.set(key(next), { cell: queue[index], dir });
      queue.push(next);
    }
  }
  const result = [];
  for (let item = previous.get(key(target)); item; item = previous.get(key(item.cell))) result.push(item.dir);
  return result.reverse();
};
for (const dir of routeTo(crossing.pos, exit.corridor.path[0])) assert.ok(step(crossing, first, dir), "v2: 出入口まで歩ける");
for (const target of exit.corridor.path.slice(1)) {
  const dir = target.x > crossing.pos.x ? "east" : target.x < crossing.pos.x ? "west" : target.y > crossing.pos.y ? "south" : "north";
  assert.ok(step(crossing, first, dir), "v2: 通路を端から端までstepで通れる");
}
assert.ok(crossing.walked.has(linkKey(exit.corridor.a, exit.corridor.b)), "v2: 通路へ入ると歩いた通路を記録する");
for (const id of first.rooms.keys()) for (const item of exitsFrom({ at: id }, first)) {
  const room = first.rooms.get(id);
  const cell = item.corridor.a === id ? item.corridor.path[0] : item.corridor.path.at(-1);
  assert.equal(item.dir, cell.y === room.y - 1 ? "north" : cell.x === room.x + room.w ? "east" : cell.y === room.y + room.h ? "south" : "west",
    "出口方向は通路の最初のマスと一致する");
}
const visible = lit(start(first), first);
for (const item of exitsFrom(start(first), first)) for (const cell of item.corridor.path.slice(0, 2)) {
  assert.ok(visible.has(`${cell.x},${cell.y}`), "v2: 未踏通路は入口2マスを見せる");
}

const direct = Array.from({ length: 100 }, (_, seed) => generate(chapter, seed)).filter(Boolean).length;
const maxRetry = Math.max(...generated.map(({ start: initial, seed }) => seed - initial));
assert.ok(maxRetry < 30, "生成は数十seed以内の再試行で成功する");
console.log(`緑: ${maps.length} seed × 生成器8条件、step、方向、距離の霧`);
console.log(`生成成功率: 直接 ${direct}/100、100開始seedの最大再試行 ${maxRetry} 回`);

// 縦持ち制約は残すが、既定では適用しない。
const portrait = Array.from({ length: 120 }, (_, seed) => generate(chapter, seed, { aspect: [0.35, 1.0] })).filter(Boolean);
assert.ok(portrait.length > 0, "aspect指定で地図が1つも生成できない");
assert.ok(portrait.every((map) => {
  const ratio = (map.bounds.maxX - map.bounds.minX + 1) / (map.bounds.maxY - map.bounds.minY + 1);
  return ratio >= 0.35 && ratio <= 1.0;
}), "aspectを明示した地図に画面に合わない比が混ざっている");
const free = Array.from({ length: 200 }, (_, seed) => generate(chapter, seed)).filter(Boolean);
assert.ok(free.some((map) => {
  const ratio = (map.bounds.maxX - map.bounds.minX + 1) / (map.bounds.maxY - map.bounds.minY + 1);
  return ratio < 0.35 || ratio > 1.0;
}), "既定でaspect制限が残っている");
console.log(`縦持ち: aspect明示 ${portrait.length}/120 件、既定で範囲外 ${free.filter((map) => {
  const ratio = (map.bounds.maxX - map.bounds.minX + 1) / (map.bounds.maxY - map.bounds.minY + 1);
  return ratio < 0.35 || ratio > 1.0;
}).length}/${free.length} 件`);
