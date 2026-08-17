import assert from "node:assert/strict";
import { generateWithRetry, rerouteCorridorsWithRetry } from "./mapgen.js";

const chapter = { scenes: [
  { id: "entrance", name: "入口", exits: [{ to: "junction-0" }] },
  { id: "junction-0", name: "三叉路", kind: "junction", size: { w: 1, h: 1 }, exits: [{ to: "entrance" }, { to: "fight-0" }, { to: "store" }] },
  { id: "fight-0", name: "崩落跡", exits: [{ to: "junction-0" }, { to: "fight-1" }] },
  { id: "fight-1", name: "古い通路", exits: [{ to: "fight-0" }, { to: "guardian" }] },
  { id: "store", name: "空の貯蔵室", exits: [{ to: "junction-0" }] },
  { id: "guardian", name: "封印庫", exits: [{ to: "fight-1" }] },
] };

const keyOf = ({ x, y }) => `${x},${y}`;
const linkKey = ({ a, b }) => `${a}-${b}`;
const pathKey = path => path.map(keyOf).join("/");
const portal = (room, direction, slot = 1) => {
  const position = length => Math.floor((slot + .5) * length / 3);
  if (direction === "north") return { x: room.x + position(room.w), y: room.y - 1 };
  if (direction === "east") return { x: room.x + room.w, y: room.y + position(room.h) };
  if (direction === "south") return { x: room.x + position(room.w), y: room.y + room.h };
  return { x: room.x - 1, y: room.y + position(room.h) };
};
const opposite = direction => ({ north: "south", east: "west", south: "north", west: "east" })[direction];
const touchingRooms = (cell, rooms) => [...rooms.values()].filter(room => (
  ((cell.x === room.x - 1 || cell.x === room.x + room.w) && cell.y >= room.y && cell.y < room.y + room.h) ||
  ((cell.y === room.y - 1 || cell.y === room.y + room.h) && cell.x >= room.x && cell.x < room.x + room.w)
));
const corridorAdjacencies = map => {
  const owner = new Map();
  map.corridors.forEach((corridor, index) => corridor.path.forEach(cell => owner.set(keyOf(cell), index)));
  return [...owner].reduce((count, [key, index]) => {
    const [x, y] = key.split(",").map(Number);
    return count + [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => owner.get(`${x + dx},${y + dy}`) !== undefined && owner.get(`${x + dx},${y + dy}`) !== index).length;
  }, 0);
};

let changedMaps = 0;
let checkedReroutes = 0;
let maxRerouteRetries = 0;
for (let sourceSeed = 0; sourceSeed < 20; sourceSeed += 1) {
  const { map, seed: generatedSeed } = generateWithRetry(chapter, sourceSeed);
  const original = new Map(map.corridors.map(corridor => [linkKey(corridor), corridor]));
  let changed = false;
  for (const rerouteSeed of [1000, 2000, 3000]) {
    const { map: rerouted, seed } = rerouteCorridorsWithRetry(map, rerouteSeed);
    checkedReroutes += 1;
    maxRerouteRetries = Math.max(maxRerouteRetries, seed - rerouteSeed);
    assert.strictEqual(rerouted.rooms, map.rooms, `seed ${generatedSeed}/${seed}: 部屋を共有する`);
    assert.deepEqual(rerouted.bounds, map.bounds, `seed ${generatedSeed}/${seed}: boundsを維持する`);
    assert.equal(rerouted.entrance, map.entrance, `seed ${generatedSeed}/${seed}: 入口を維持する`);
    assert.equal(rerouted.corridors.length, map.corridors.length, `seed ${generatedSeed}/${seed}: 通路本数を維持する`);
    assert.equal(corridorAdjacencies(rerouted), 0, `seed ${generatedSeed}/${seed}: 通路同士が隣接しない`);
    for (const corridor of rerouted.corridors) {
      // 遠回り(routeWithDetour)は中継点を経由する2区間に分けて経路を探すため、
      // 後半区間が前半区間と交差する不具合があった(実測: 200本中114本で発生)。
      // 作者の実プレイで「曲がり角に見えたが右へ進めない」不具合として発覚した。
      const cellKeys = corridor.path.map(keyOf);
      assert.equal(new Set(cellKeys).size, cellKeys.length,
        `seed ${generatedSeed}/${seed}: 通路${corridor.a}-${corridor.b}が自分自身と交差しない`);
      // 交差はしなくても、すぐ隣を並走してしまう不具合が別にあった(実測: 150本中102本で発生)。
      // 経路の並びで連続する2マス(=本来隣接すべき)以外に、隣接するマスの組が無いかを見る。
      const indexOf = new Map(corridor.path.map((cell, i) => [keyOf(cell), i]));
      const selfAdjacent = corridor.path.some((cell, i) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const j = indexOf.get(keyOf({ x: cell.x + dx, y: cell.y + dy }));
        return j !== undefined && Math.abs(j - i) > 1;
      }));
      assert.ok(!selfAdjacent, `seed ${generatedSeed}/${seed}: 通路${corridor.a}-${corridor.b}が自分自身とすぐ隣を並走しない`);
      const before = original.get(linkKey(corridor));
      const start = portal(rerouted.rooms.get(corridor.a), corridor.door.direction, corridor.door.slot);
      const end = portal(rerouted.rooms.get(corridor.b), opposite(corridor.door.direction));
      assert.deepEqual(corridor.path[0], start, `seed ${generatedSeed}/${seed}: 始点ドアを維持する`);
      assert.deepEqual(corridor.path.at(-1), end, `seed ${generatedSeed}/${seed}: 終点ドアを維持する`);
      assert.deepEqual(corridor.path[0], before.path[0], `seed ${generatedSeed}/${seed}: 始点座標を維持する`);
      assert.deepEqual(corridor.path.at(-1), before.path.at(-1), `seed ${generatedSeed}/${seed}: 終点座標を維持する`);
      const touches = new Map([...rerouted.rooms.keys()].map(id => [id, 0]));
      for (const cell of corridor.path) for (const room of touchingRooms(cell, rerouted.rooms)) touches.set(room.id, touches.get(room.id) + 1);
      for (const [id, count] of touches) assert.equal(count, id === corridor.a || id === corridor.b ? 1 : 0,
        `seed ${generatedSeed}/${seed}: 無関係な部屋(${id})に接触しない`);
      if (pathKey(corridor.path) !== pathKey(before.path)) changed = true;
    }
  }
  if (changed) changedMaps += 1;
}
assert.equal(changedMaps, 20, "全地図で少なくとも1本の通路形状が変わる");
console.log(`通路引き直し: 20地図 × 3乱数列 = ${checkedReroutes}件、形状変化 ${changedMaps}/20地図、最大再試行 ${maxRerouteRetries}回`);
