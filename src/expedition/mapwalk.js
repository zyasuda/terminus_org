// trpg-rogue-map/src/expedition.js から移植。判定だけを持ち、SVG描画には依存しない。
const corridorKey = (a, b) => (String(a) < String(b) ? `${a}-${b}` : `${b}-${a}`);
const roomCenter = room => ({ x: room.x + Math.floor(room.w / 2), y: room.y + Math.floor(room.h / 2) });
const pathFrom = (corridor, id) => corridor.a === id ? corridor.path : [...corridor.path].reverse();
const keyOf = ({ x, y }) => `${x},${y}`;
const directions = [
  { name: "north", x: 0, y: -1 }, { name: "east", x: 1, y: 0 },
  { name: "south", x: 0, y: 1 }, { name: "west", x: -1, y: 0 },
];
export const LIGHT_RADIUS = 4;

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
  if (!cell) return false;
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
