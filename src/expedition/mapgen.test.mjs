import assert from "node:assert/strict";
import { generate, generateWithRetry } from "./mapgen.js";

// 「1つの壁に最大3本の通路を独立して生やせる」機構の検査。
// チップ配列構想(BORG 2026-08-16)への布石として mapgen.js に port/slot を足した分。
// 既定(全部屋1方向1スロット)は変えていないことを、この後の core.test.mjs 側の
// 既存挙動が緑のままであることで担保する。ここでは新機構だけを測る。

const linkKey = (a, b) => (String(a) < String(b) ? `${a}-${b}` : `${b}-${a}`);
const touchingRooms = (cell, rooms) => [...rooms.values()].filter(room => (
  ((cell.x === room.x - 1 || cell.x === room.x + room.w) && cell.y >= room.y && cell.y < room.y + room.h) ||
  ((cell.y === room.y - 1 || cell.y === room.y + room.h) && cell.x >= room.x && cell.x < room.x + room.w)
));
const corridorAdjacencies = map => {
  const owner = new Map();
  map.corridors.forEach((c, i) => { for (const cell of c.path) owner.set(`${cell.x},${cell.y}`, i); });
  let count = 0;
  for (const [key, idx] of owner) {
    const [x, y] = key.split(",").map(Number);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const other = owner.get(`${x + dx},${y + dy}`);
      if (other !== undefined && other !== idx) count += 1;
    }
  }
  return count;
};

// ハブ部屋の東壁だけを3スロットとも開放し、3本の子部屋を独立に生やす。
// h=18(スロット間隔6)は実測で決めた値。h=6(間隔2)は子部屋(高さ3〜5)が
// 収まりきらず500回中0回成功だった(壁の長さが足りないと詰む、という実測結果)。
const HUB_HEIGHT = 18;
const chapter = { scenes: [
  { id: "hub", name: "ハブ", size: { w: 5, h: HUB_HEIGHT },
    ports: { north: [false, false, false], south: [false, false, false], west: [false, false, false], east: [true, true, true] },
    exits: [{ to: "c0" }, { to: "c1" }, { to: "c2" }] },
  { id: "c0", name: "枝0", exits: [{ to: "hub" }] },
  { id: "c1", name: "枝1", exits: [{ to: "hub" }] },
  { id: "c2", name: "枝2", exits: [{ to: "hub" }] },
] };

let maxRetry = 0;
for (let start = 0; start < 100; start += 1) {
  const { map, seed } = generateWithRetry(chapter, start, 500);
  maxRetry = Math.max(maxRetry, seed - start);

  // 1. ハブは3本とも繋がり、東壁上で別々のマスに出入口を持つ(=同じ壁の別スロット)
  const hub = map.rooms.get("hub");
  const eastWallX = hub.x + hub.w;
  const doorY = new Set();
  for (const corridor of map.corridors) {
    if (corridor.a !== "hub" && corridor.b !== "hub") continue;
    const door = corridor.path.find(cell => cell.x === eastWallX && cell.y >= hub.y && cell.y < hub.y + hub.h);
    if (door) doorY.add(door.y);
  }
  assert.equal(doorY.size, 3, `seed ${seed}: 3本とも東壁の別スロットに出入口を持つはず`);

  // 2. 独立した3本の通路同士が、1マスも隣接しない(v6の観点をそのまま流用)
  assert.equal(corridorAdjacencies(map), 0, `seed ${seed}: 同じ壁から出た通路同士が隣接している`);

  // 3. 通路は自分の両端の部屋以外に接触しない(v3由来の条件)
  for (const corridor of map.corridors) {
    const touches = new Map([...map.rooms.keys()].map(id => [id, 0]));
    for (const cell of corridor.path) for (const room of touchingRooms(cell, map.rooms)) touches.set(room.id, touches.get(room.id) + 1);
    for (const [id, count] of touches) assert.equal(count, id === corridor.a || id === corridor.b ? 1 : 0,
      `seed ${seed}: 通路が無関係な部屋(${id})に接触している`);
  }

  // 4. 全部屋(ハブ+3枝)へ到達できる
  assert.deepEqual(new Set(map.corridors.map(({ a, b }) => linkKey(a, b))),
    new Set([["hub", "c0"], ["hub", "c1"], ["hub", "c2"]].map(([a, b]) => linkKey(a, b))));
}
assert.ok(maxRetry < 30, `再試行が多すぎる(${maxRetry}回)。壁の長さかスロット間隔を見直す`);
console.log(`複数スロット: 100 seed × 3条件(別ドア/通路間隔/部屋接触) 最大再試行 ${maxRetry} 回`);

// 検査が効くことの確認: スロット間隔が足りない壁(h=6)では、実測どおり生成できないこと。
// generateWithRetryの例外そのものが「検査が赤くなる」に相当する。
assert.throws(
  () => generateWithRetry({ ...chapter, scenes: chapter.scenes.map(s => s.id === "hub" ? { ...s, size: { w: 5, h: 6 } } : s) }, 0, 50),
  /地図を50回生成できませんでした/,
  "壁が短すぎる場合に生成できることを検査が見逃している",
);
console.log("検査が効くことを確認: 壁が短い(h=6)と50回の再試行でも生成できない(実測どおり)");

// 既定(portsを指定しない、全部屋1方向1スロット)の生成成功率が壊れていないこと。
const direct = Array.from({ length: 100 }, (_, seed) => generate({ scenes: [
  { id: "entrance", name: "入口", exits: [{ to: "junction-0" }] },
  { id: "junction-0", name: "三叉路", kind: "junction", size: { w: 1, h: 1 }, exits: [{ to: "entrance" }, { to: "fight-0" }, { to: "store" }] },
  { id: "fight-0", name: "崩落跡", exits: [{ to: "junction-0" }, { to: "fight-1" }] },
  { id: "fight-1", name: "古い通路", exits: [{ to: "fight-0" }, { to: "guardian" }] },
  { id: "store", name: "空の貯蔵室", exits: [{ to: "junction-0" }] },
  { id: "guardian", name: "封印庫", exits: [{ to: "fight-1" }] },
] }, seed)).filter(Boolean).length;
assert.equal(direct, 100, "既定(単一スロット)の生成成功率が回帰した");
console.log(`既定chapter: 100 seed中 ${direct}/100 が1発で生成できる(回帰なし)`);
