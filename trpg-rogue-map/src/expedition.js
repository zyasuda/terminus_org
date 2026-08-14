const corridorKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const roomCenter = (room) => ({ x: room.x + Math.floor(room.w / 2), y: room.y + Math.floor(room.h / 2) });
const pathFrom = (corridor, id) => corridor.a === id ? corridor.path : [...corridor.path].reverse();
const keyOf = ({ x, y }) => `${x},${y}`;
const directions = [
  { name: "north", x: 0, y: -1 }, { name: "east", x: 1, y: 0 },
  { name: "south", x: 0, y: 1 }, { name: "west", x: -1, y: 0 },
];

// 灯りの届く距離は、描画ではなく探索済みマスを決める判定側にまとめる。
export const LIGHT_RADIUS = 4;

function directionFrom(room, cell) {
  if (cell.y === room.y - 1) return "north";
  if (cell.x === room.x + room.w) return "east";
  if (cell.y === room.y + room.h) return "south";
  if (cell.x === room.x - 1) return "west";
  return null;
}

export function start(map) {
  const at = map.entrance ?? map.rooms.keys().next().value;
  const state = { at, visited: new Set([at]), walked: new Set(), pos: roomCenter(map.rooms.get(at)), seen: new Set() };
  reveal(state, map);
  return state;
}

export function exitsFrom(state, map) {
  const room = map.rooms.get(state.at);
  if (!room) return [];
  return map.corridors.flatMap((corridor) => {
    if (corridor.a !== state.at && corridor.b !== state.at) return [];
    const path = pathFrom(corridor, state.at);
    const dir = directionFrom(room, path[0]);
    return dir ? [{ dir, to: corridor.a === state.at ? corridor.b : corridor.a, corridor }] : [];
  });
}

export function step(state, map, dir) {
  const direction = directions.find((item) => item.name === dir);
  if (!direction) return false;
  const next = { x: state.pos.x + direction.x, y: state.pos.y + direction.y };
  const cell = map.cells.get(keyOf(next));
  if (!cell) return false;
  state.pos = next;
  state.at = cell.kind === "room" ? cell.id : null;
  if (cell.kind === "room") state.visited.add(cell.id);
  else {
    const corridor = map.corridors.find((item) => item.path.some((part) => part.x === next.x && part.y === next.y));
    if (corridor) state.walked.add(corridorKey(corridor.a, corridor.b));
  }
  reveal(state, map);
  return true;
}

export function lit(state, map) {
  const visible = new Set([keyOf(state.pos)]);
  const distance = new Map([[keyOf(state.pos), 0]]);
  const queue = [state.pos];
  for (let index = 0; index < queue.length; index += 1) {
    const cell = queue[index];
    const depth = distance.get(keyOf(cell));
    if (depth === LIGHT_RADIUS) continue;
    for (const direction of directions) {
      const next = { x: cell.x + direction.x, y: cell.y + direction.y };
      const key = keyOf(next);
      if (map.cells.has(key) && !distance.has(key)) {
        distance.set(key, depth + 1);
        visible.add(key);
        queue.push(next);
      }
    }
  }
  if (state.at !== null) for (const corridor of map.corridors) {
    if (corridor.a === state.at || corridor.b === state.at) {
      for (const cell of pathFrom(corridor, state.at).slice(0, 2)) visible.add(keyOf(cell));
    }
  }
  return visible;
}

function reveal(state, map) {
  for (const key of lit(state, map)) state.seen.add(key);
}
