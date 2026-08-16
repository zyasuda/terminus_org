import { makeRng } from "../battle/core.js";
import { EXPEDITION_BATTLE_CONFIG } from "./battleConfig.js";
import { generateWithRetry } from "./mapgen.js";
import { run, start } from "./mapwalk.js";

const EXPEDITION_CHAPTER = { scenes: [
  { id: "entrance", name: "入口", exits: [{ to: "junction-0" }] },
  { id: "junction-0", name: "三叉路", kind: "junction", size: { w: 1, h: 1 }, exits: [{ to: "entrance" }, { to: "fight-0" }, { to: "store" }] },
  { id: "fight-0", name: "崩落跡", exits: [{ to: "junction-0" }, { to: "fight-1" }] },
  { id: "fight-1", name: "古い通路", exits: [{ to: "fight-0" }, { to: "guardian" }] },
  { id: "store", name: "空の貯蔵室", exits: [{ to: "junction-0" }] },
  { id: "guardian", name: "封印庫", exits: [{ to: "fight-1" }] },
] };

export const mapForFloor = floor => generateWithRetry(EXPEDITION_CHAPTER, floor.seed).map;
const restoreMapState = (floor, map) => {
  const initial = start(map);
  return {
    ...initial,
    pos: floor.pos || initial.pos,
    at: floor.at === undefined ? initial.at : floor.at,
    visited: new Set(floor.visited || initial.visited),
    walked: new Set(floor.walked || initial.walked),
    seen: new Set(floor.seen || initial.seen),
  };
};
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

// 装備中の鎧を含めた遠征中の最大HP。戦闘側も同じ unit HP を正本としている。
export function partyMaxHp(owner, equipment = {}) {
  const unit = EXPEDITION_BATTLE_CONFIG.units[owner];
  if (!unit) return 0;
  const armor = ITEMS[equipment[owner]?.armor];
  return unit.hp + (armor?.stat === "hp" ? armor.power : 0);
}

// スタッシュから指定キャラクターへ装備する。外した装備は同じスタッシュへ戻す。
export function equipFromStash(village, owner, index) {
  const id = village.stash[index], item = ITEMS[id];
  if (!item || item.slot === "consumable" || !village.equipment[owner]) return village;
  const old = village.equipment[owner][item.slot];
  return {
    ...village,
    stash: [...village.stash.filter((_, i) => i !== index), ...(old ? [old] : [])],
    equipment: { ...village.equipment, [owner]: { ...village.equipment[owner], [item.slot]: id } },
  };
}

// 遠征中の装備変更。最大HPが下がる装備へ替えた場合も、現在HPを新しい上限へ収める。
export function equipInField(village, floor, owner, index) {
  const nextVillage = equipFromStash(village, owner, index);
  if (nextVillage === village || !floor?.party) return { village: nextVillage, floor };
  const maxHp = partyMaxHp(owner, nextVillage.equipment);
  return {
    village: nextVillage,
    floor: { ...floor, party: { ...floor.party, [owner]: Math.min(floor.party[owner] ?? maxHp, maxHp) } },
  };
}

// 遠征中の回復薬使用。所持品とHPの正本をそれぞれ village.stash / floor.party のまま更新する。
export function useFieldTonic(village, floor, owner) {
  const index = village.stash.indexOf("tonic");
  if (index < 0 || !floor?.party || !partyMaxHp(owner, village.equipment)) return null;
  const maxHp = partyMaxHp(owner, village.equipment);
  const before = floor.party[owner] ?? maxHp;
  const hp = Math.min(maxHp, before + ITEMS.tonic.power);
  return {
    village: { ...village, stash: village.stash.filter((_, i) => i !== index) },
    floor: { ...floor, party: { ...floor.party, [owner]: hp } },
    before, hp, maxHp,
  };
}

export function createFloor(seed = Date.now()) {
  const generated = generateWithRetry(EXPEDITION_CHAPTER, seed);
  const state = start(generated.map);
  return {
    mapVersion: 2,
    seed: generated.seed,
    pos: state.pos,
    at: state.at,
    visited: [...state.visited], walked: [...state.walked], seen: [...state.seen],
    party: { hero: 16, mage: 12 },
    events: [
      { id: "junction-0", roomId: "junction-0", kind: "junction", done: false },
      { id: "fight-0", roomId: "fight-0", kind: "fight", done: false },
      { id: "fight-1", roomId: "fight-1", kind: "fight", done: false },
      { id: "guardian", roomId: "guardian", kind: "guardian", done: false },
    ],
    chest: { roomId: "guardian", opened: false },
    log: ["地下1階へ降りた。灯りを頼りに、入口まで歩いて帰還できる。"],
  };
}

export function walk(floor, direction) {
  const map = mapForFloor(floor);
  const state = restoreMapState(floor, map);
  if (!run(state, map, direction)) return floor;
  return { ...floor, pos: state.pos, at: state.at, visited: [...state.visited], walked: [...state.walked], seen: [...state.seen] };
}

export function eventAt(floor) { return floor.events.find(event => !event.done && event.roomId === floor.at) || null; }
export function canOpenChest(floor) { return floor.chest.roomId === floor.at && !floor.chest.opened && floor.events.every(event => event.done); }
export function isEntrance(floor) { return floor.at === "entrance"; }

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
  const map = mapForFloor(floor);
  const targetRoom = to.roomId || to.id || to;
  const room = map.rooms.get(targetRoom);
  if (!room) return null;
  const target = { x: room.x + Math.floor(room.w / 2), y: room.y + Math.floor(room.h / 2) };
  const origin = from.pos || floor.pos;
  const queue = [{ ...origin, path: [] }], seen = new Set([`${origin.x},${origin.y}`]);
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i]; if (node.x === target.x && node.y === target.y) return node.path;
    for (const [dir, dx, dy] of [["north",0,-1],["south",0,1],["west",-1,0],["east",1,0]]) {
      const x = node.x + dx, y = node.y + dy, k = `${x},${y}`;
      if (!seen.has(k) && map.cells.has(k)) { seen.add(k); queue.push({ x, y, path: [...node.path, { dir, dx, dy }] }); }
    }
  }
  return null;
}
