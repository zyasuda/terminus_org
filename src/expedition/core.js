import { makeRng } from "../battle/core.js";
import { EXPEDITION_BATTLE_CONFIG } from "./battleConfig.js";
import { HALL_SIZE, hallBattleBoard, hallEnemyPosition, hallRoomOf, junctionBattleBoard } from "./interior.js";
import { generateWithRetry, rerouteCorridorsWithRetry } from "./mapgen.js";
import { FACING_AHEAD, isOpen, opposite, run, start, turnLeft, turnRight } from "./mapwalk.js";

const EXPEDITION_CHAPTER = { scenes: [
  { id: "entrance", name: "入口", exits: [{ to: "junction-0" }] },
  { id: "junction-0", name: "三叉路", kind: "junction", size: { w: 1, h: 1 }, exits: [{ to: "entrance" }, { to: "fight-0" }, { to: "store" }] },
  { id: "fight-0", name: "崩落跡", exits: [{ to: "junction-0" }, { to: "fight-1" }] },
  { id: "fight-1", name: "古い通路", exits: [{ to: "fight-0" }, { to: "guardian" }] },
  // 唯一の大部屋。間仕切りで2つの小区画に分かれ、固定敵は地図に出さず視界内でだけ見える(interior.js)。
  { id: "store", name: "静かな大広間", kind: "hall", size: HALL_SIZE, exits: [{ to: "junction-0" }] },
  { id: "guardian", name: "封印庫", exits: [{ to: "fight-1" }] },
] };
// 入口から最初に出る通路の向き。一人称視点の初期の向きに使う。
const initialFacing = map => map.corridors.find(c => c.a === map.entrance)?.door.direction || "south";

// 部屋は floor.seed だけで決まる(記憶が効く)。floor.corridorSeed が付いていたら、
// 部屋とドアの位置は変えずに通路の曲がり方だけ引き直す(守護者撃破時に付与する)。
export const mapForFloor = floor => {
  const { map } = generateWithRetry(EXPEDITION_CHAPTER, floor.seed);
  if (!floor.corridorSeed) return map;
  // 引き直せない corridorSeed が保存されていても地図は出す(旧セーブの保険)。
  // 引き直しは演出なので、失敗したら元の通路のままにする
  const rerouted = rerouteCorridorsWithRetry(map, floor.corridorSeed);
  return rerouted ? rerouted.map : map;
};
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
    facing: initialFacing(generated.map),
    hallDefeated: false,
    visited: [...state.visited], walked: [...state.walked], seen: [...state.seen],
    party: { hero: 16, mage: 12 },
    events: [
      { id: "junction-0", roomId: "junction-0", kind: "junction", done: false, bypassed: false },
      { id: "fight-0", roomId: "fight-0", kind: "fight", done: false, bypassed: false },
      { id: "fight-1", roomId: "fight-1", kind: "fight", done: false, bypassed: false },
      { id: "guardian", roomId: "guardian", kind: "guardian", done: false, bypassed: false },
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

// 一人称視点の左右旋回。位置・地図は変えず向きだけを更新する。
export function turn(floor, way) { return { ...floor, facing: (way === "left" ? turnLeft : turnRight)(floor.facing) }; }
// 戦闘中の離脱。入口まで退き、向きは遠征開始時と同じにする。
// 敵は倒したことにしないので、戻ればまた戦える(hallDefeatedもeventsも触らない)。
export function retreatToEntrance(floor) {
  const map = mapForFloor(floor);
  const { pos, at } = start(map);
  return { ...floor, pos, at, facing: initialFacing(map) };
}
// 後退。向きは変えずにfacingの逆へ1歩下がる。通路の自動通過はwalkと同じ扱い。
export function back(floor) { return walk(floor, opposite(floor.facing)); }
// 大部屋(唯一の内装テンプレート)の部屋情報。無ければnull。
export function hallRoom(floor) { return hallRoomOf(mapForFloor(floor)); }
// 固定敵と同じマスに立っていて、まだ倒していなければ接触している。
export function hallContact(floor) {
  if (floor.hallDefeated) return false;
  const room = hallRoom(floor);
  if (!room || floor.at !== room.id) return false;
  const enemy = hallEnemyPosition(room);
  return floor.pos.x === enemy.x && floor.pos.y === enemy.y;
}
// 探索と同じ壁(間仕切り)・座標を使う戦闘盤面。
export function hallLayoutFor(floor) { const room = hallRoom(floor); return room ? hallBattleBoard(room) : null; }
// 三叉路の戦闘盤。地図でその交差点が実際に開いている向きだけに枝を生やす。
// 味方は入ってきた枝から出るので、向き(floor.facing)の逆が入口の枝になる。
export function junctionLayoutFor(floor) {
  const map = mapForFloor(floor);
  const room = [...map.rooms.values()].find(r => r.kind === "junction");
  if (!room) return null;
  const open = Object.entries(FACING_AHEAD)
    .filter(([, [dx, dy]]) => isOpen(map, room.x + dx, room.y + dy))
    .map(([dir]) => dir);
  return junctionBattleBoard(open, opposite(floor.facing));
}
export function eventAt(floor) { return floor.events.find(event => !event.done && !event.bypassed && event.roomId === floor.at) || null; }
export function canOpenChest(floor) { return floor.chest.roomId === floor.at && !floor.chest.opened && floor.events.some(event => event.kind === "guardian" && event.done); }
export function isEntrance(floor) { return floor.at === "entrance"; }

export function rewardFor(floor) {
  const ids = ["sword", "mail", "charm", "tonic"];
  return ids[Math.floor(makeRng(floor.seed + 91)() * ids.length)];
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
