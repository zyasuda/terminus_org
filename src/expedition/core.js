import { makeRng } from "../battle/core.js";

const K = (x, y) => `${x},${y}`;
export const ITEMS = {
  sword: { id: "sword", name: "坑道の剣", slot: "weapon", stat: "atk", price: 12, power: 1 },
  mail: { id: "mail", name: "革鎧", slot: "armor", stat: "hp", price: 12, power: 3 },
  charm: { id: "charm", name: "月の護符", slot: "charm", stat: "atk", price: 12, power: 1 },
  tonic: { id: "tonic", name: "回復薬", slot: "consumable", stat: "heal", price: 5, power: 6 },
};

export function newVillage(saved = {}) {
  const slots = { weapon: null, armor: null, charm: null };
  const old = saved.equipment?.weapon !== undefined ? saved.equipment : null;
  return { gold: saved.gold ?? 20, stash: saved.stash ?? ["tonic"], equipment: {
    hero: { ...slots, ...(old || saved.equipment?.hero) }, mage: { ...slots, ...(saved.equipment?.mage) }
  } };
}

function room(rng, rooms) {
  for (let tries = 0; tries < 80; tries++) {
    const w = 4 + Math.floor(rng() * 3), h = 3 + Math.floor(rng() * 3);
    const x = 1 + Math.floor(rng() * (29 - w)), y = 1 + Math.floor(rng() * (17 - h));
    const next = { x, y, w, h, cx: x + Math.floor(w / 2), cy: y + Math.floor(h / 2) };
    if (rooms.every(r => next.x + next.w + 1 < r.x || r.x + r.w + 1 < next.x || next.y + next.h + 1 < r.y || r.y + r.h + 1 < next.y)) return next;
  }
  return null;
}

export function createFloor(seed = Date.now()) {
  const rng = makeRng(seed); const w = 31, h = 19;
  const tiles = Array.from({ length: h }, () => Array(w).fill("#"));
  const rooms = [];
  while (rooms.length < 5 + Math.floor(rng() * 3)) { const r = room(rng, rooms); if (!r) break; rooms.push(r); }
  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) tiles[y][x] = ".";
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1], b = rooms[i];
    for (let x = Math.min(a.cx, b.cx); x <= Math.max(a.cx, b.cx); x++) tiles[a.cy][x] = ".";
    for (let y = Math.min(a.cy, b.cy); y <= Math.max(a.cy, b.cy); y++) tiles[y][b.cx] = ".";
  }
  const entrance = { x: rooms[0].cx, y: rooms[0].cy };
  const targets = rooms.slice(1);
  const normal = targets.slice(0, 2).map((r, i) => ({ id: `fight-${i}`, x: r.cx, y: r.cy, kind: "fight", done: false }));
  const last = targets[targets.length - 1] || rooms[0];
  const guardian = { id: "guardian", x: last.cx, y: last.cy, kind: "guardian", done: false };
  return { seed, w, h, tiles, rooms, entrance, player: { ...entrance }, party: { hero: 16, mage: 12 }, events: [...normal, guardian], chest: { ...last, opened: false }, explored: [K(entrance.x, entrance.y)], log: ["地下1階へ降りた。出口まで歩いて帰還できる。"] };
}

export function walk(floor, dx, dy) {
  const x = floor.player.x + dx, y = floor.player.y + dy;
  if (floor.tiles[y]?.[x] !== ".") return floor;
  const explored = new Set(floor.explored); explored.add(K(x, y));
  return { ...floor, player: { x, y }, explored: [...explored] };
}

export function eventAt(floor) { return floor.events.find(e => !e.done && e.x === floor.player.x && e.y === floor.player.y) || null; }
export function canOpenChest(floor) { return floor.chest.x === floor.player.x && floor.chest.y === floor.player.y && !floor.chest.opened && floor.events.every(e => e.done); }
export function isEntrance(floor) { return floor.player.x === floor.entrance.x && floor.player.y === floor.entrance.y; }

export function rewardFor(floor) {
  const ids = ["sword", "mail", "charm", "tonic"];
  return ids[Math.floor(makeRng(floor.seed + 91)() * ids.length)];
}

export function keepAfterDefeat(items, seed) {
  const rng = makeRng(seed + 441); const count = Math.min(items.length, 2 + Math.floor(rng() * 3));
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, count);
}

export function route(floor, from, to) {
  const queue = [{ ...from, path: [] }], seen = new Set([K(from.x, from.y)]);
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i]; if (node.x === to.x && node.y === to.y) return node.path;
    for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
      const x = node.x + dx, y = node.y + dy, k = K(x, y);
      if (!seen.has(k) && floor.tiles[y]?.[x] === ".") { seen.add(k); queue.push({ x, y, path: [...node.path, { dx, dy }] }); }
    }
  }
  return null;
}
