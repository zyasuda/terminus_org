// trpg-rogue-map/src/expedition.js から移植。判定だけを持ち、SVG描画には依存しない。
import { hallBlocked } from "./interior.js";
const corridorKey = (a, b) => (String(a) < String(b) ? `${a}-${b}` : `${b}-${a}`);
const roomCenter = room => ({ x: room.x + Math.floor(room.w / 2), y: room.y + Math.floor(room.h / 2) });
const pathFrom = (corridor, id) => corridor.a === id ? corridor.path : [...corridor.path].reverse();
const keyOf = ({ x, y }) => `${x},${y}`;
const directions = [
  { name: "north", x: 0, y: -1 }, { name: "east", x: 1, y: 0 },
  { name: "south", x: 0, y: 1 }, { name: "west", x: -1, y: 0 },
];
export const LIGHT_RADIUS = 4;
const DIRECTION_ORDER = directions.map(d => d.name);
// 一人称視点の左右旋回。位置(pos/at)は変えず、向きだけを時計回りに1つ進める/戻す。
export function turnRight(dir) { return DIRECTION_ORDER[(DIRECTION_ORDER.indexOf(dir) + 1) % 4]; }
export function turnLeft(dir) { return DIRECTION_ORDER[(DIRECTION_ORDER.indexOf(dir) + 3) % 4]; }

// 一人称の後退。位置だけ動かし向きは変えないので、facingの逆向きを求めるのに使う。
export function opposite(dir) { return turnRight(turnRight(dir)); }

// そのマスが通れるか。地図の外(=壁)と大部屋の間仕切りをまとめて閉じ扱いにする。
export function isOpen(map, x, y) { return map.cells.has(keyOf({ x, y })) && !hallBlocked(map, x, y); }

// 地図の方角と、3Dカメラの回転角(Y軸)の対応。
// three.jsのカメラは rotation.y = 0 で -Z を向く。地図の北を -Z に取ったので north が 0。
// ここを間違えると地図と一人称が90度ずれる(実際に一度ずらした)。描画に依存しないのでNodeで検査できる。
export const FACING_YAW = { north: 0, east: -Math.PI / 2, south: Math.PI, west: Math.PI / 2 };
// その向きの前方1マス(地図座標)。FACING_YAWと必ず一致していること。
export const FACING_AHEAD = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] };

// 地図全体を「通れるマス」と「壁として立てるマス」に分ける。
// 壁は空きマスに隣り合うものだけ。地図の外を無限に作らないための刈り込み。
// 3Dのシーン組み立てが読む唯一の入口(描画には依存しないのでNodeで検査できる)。
export function levelCells(map) {
  const open = new Set();
  for (const key of map.cells.keys()) {
    const [x, y] = key.split(",").map(Number);
    if (isOpen(map, x, y)) open.add(key);
  }
  const solid = new Set();
  for (const key of open) {
    const [x, y] = key.split(",").map(Number);
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      const k = `${x + dx},${y + dy}`;
      if (!open.has(k)) solid.add(k);
    }
  }
  return { open, solid };
}

export function start(map) {
  const at = map.entrance;
  const state = { at, visited: new Set([at]), walked: new Set(), pos: roomCenter(map.rooms.get(at)), seen: new Set() };
  reveal(state, map);
  return state;
}
export function step(state, map, dir) {
  const direction = directions.find(item => item.name === dir);
  if (!direction) return false;
  const next = { x: state.pos.x + direction.x, y: state.pos.y + direction.y };
  const cell = map.cells.get(keyOf(next));
  if (!cell || hallBlocked(map, next.x, next.y)) return false;
  state.pos = next;
  // 交差点も部屋と同じく停止・訪問の対象にする。通路だけを自動通過する。
  state.at = cell.kind === "corridor" ? null : cell.id;
  if (cell.kind !== "corridor") state.visited.add(cell.id);
  else {
    const corridor = map.corridors.find(item => item.path.some(part => part.x === next.x && part.y === next.y));
    if (corridor) state.walked.add(corridorKey(corridor.a, corridor.b));
  }
  reveal(state, map);
  return true;
}
// 通路に踏み出した時だけ次の部屋まで進む。部屋内の位置取りは1マス単位のまま残す。
export function run(state, map, dir) {
  if (!step(state, map, dir)) return false;
  while (map.cells.get(keyOf(state.pos))?.kind === "corridor") {
    if (!step(state, map, dir)) break;
  }
  return true;
}
export function lit(state, map) {
  const visible = new Set([keyOf(state.pos)]), distance = new Map([[keyOf(state.pos), 0]]), queue = [state.pos];
  for (let index = 0; index < queue.length; index += 1) {
    const cell = queue[index], depth = distance.get(keyOf(cell));
    if (depth === LIGHT_RADIUS) continue;
    for (const direction of directions) {
      const next = { x: cell.x + direction.x, y: cell.y + direction.y }, key = keyOf(next);
      if (map.cells.has(key) && !distance.has(key)) { distance.set(key, depth + 1); visible.add(key); queue.push(next); }
    }
  }
  if (state.at !== null) for (const corridor of map.corridors) if (corridor.a === state.at || corridor.b === state.at) {
    for (const cell of pathFrom(corridor, state.at).slice(0, 2)) visible.add(keyOf(cell));
  }
  return visible;
}
function reveal(state, map) { for (const key of lit(state, map)) state.seen.add(key); }
