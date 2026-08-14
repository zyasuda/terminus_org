const DIRECTIONS = [
  { name: "north", x: 0, y: -1 },
  { name: "east", x: 1, y: 0 },
  { name: "south", x: 0, y: 1 },
  { name: "west", x: -1, y: 0 },
];

const keyOf = (x, y) => `${x},${y}`;
const linkKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const opposite = (dir) => DIRECTIONS[(DIRECTIONS.findIndex((item) => item.name === dir) + 2) % 4].name;

export function makeRng(seed) {
  let value = Number(seed) >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export function linksOf(chapter) {
  const ids = new Set(chapter.scenes.map((scene) => scene.id));
  const links = new Map();
  for (const scene of chapter.scenes) for (const exit of scene.exits || []) {
    if (exit.to !== "ending" && ids.has(exit.to) && exit.to !== scene.id) {
      const key = linkKey(scene.id, exit.to);
      if (!links.has(key)) links.set(key, scene.id < exit.to ? { a: scene.id, b: exit.to } : { a: exit.to, b: scene.id });
    }
  }
  return [...links.values()].sort((left, right) => left.a - right.a || left.b - right.b);
}

export function depthOf(chapter) {
  const entrance = chapter.scenes[0]?.id;
  if (entrance === undefined) return {};
  const adjacent = new Map(chapter.scenes.map((scene) => [scene.id, []]));
  for (const { a, b } of linksOf(chapter)) {
    adjacent.get(a).push(b);
    adjacent.get(b).push(a);
  }
  const depths = { [entrance]: 0 };
  const queue = [entrance];
  for (let index = 0; index < queue.length; index += 1) for (const next of adjacent.get(queue[index])) {
    if (depths[next] === undefined) {
      depths[next] = depths[queue[index]] + 1;
      queue.push(next);
    }
  }
  return depths;
}

const randomInt = (rng, [min, max]) => min + Math.floor(rng() * (max - min + 1));
const shuffled = (items, rng) => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};
const roomCells = (room) => {
  const cells = [];
  for (let y = room.y; y < room.y + room.h; y += 1) for (let x = room.x; x < room.x + room.w; x += 1) cells.push({ x, y });
  return cells;
};
const tooClose = (a, b) =>
  a.x - 1 <= b.x + b.w - 1 && a.x + a.w >= b.x && a.y - 1 <= b.y + b.h - 1 && a.y + a.h >= b.y;
const centerOf = (room) => ({ x: room.x + (room.w - 1) / 2, y: room.y + (room.h - 1) / 2 });

function treeCandidate(parent, childSize, direction, gap, rng) {
  const d = DIRECTIONS.find((item) => item.name === direction);
  const child = { ...childSize };
  if (d.x) {
    child.x = d.x > 0 ? parent.x + parent.w + gap : parent.x - gap - child.w;
    child.y = parent.y + randomInt(rng, [-child.h + 1, parent.h - 1]);
  } else {
    child.y = d.y > 0 ? parent.y + parent.h + gap : parent.y - gap - child.h;
    child.x = parent.x + randomInt(rng, [-child.w + 1, parent.w - 1]);
  }
  return child;
}

const portal = (room, direction) => {
  if (direction === "north") return { x: room.x + Math.floor(room.w / 2), y: room.y - 1 };
  if (direction === "east") return { x: room.x + room.w, y: room.y + Math.floor(room.h / 2) };
  if (direction === "south") return { x: room.x + Math.floor(room.w / 2), y: room.y + room.h };
  return { x: room.x - 1, y: room.y + Math.floor(room.h / 2) };
};

const touchingRooms = (cell, rooms) => [...rooms.values()].filter((room) => (
  ((cell.x === room.x - 1 || cell.x === room.x + room.w) && cell.y >= room.y && cell.y < room.y + room.h) ||
  ((cell.y === room.y - 1 || cell.y === room.y + room.h) && cell.x >= room.x && cell.x < room.x + room.w)
));

const hasOnlyDoors = (path, rooms, a, b) => {
  const touches = new Map([...rooms.keys()].map((id) => [id, 0]));
  for (const cell of path) for (const room of touchingRooms(cell, rooms)) touches.set(room.id, touches.get(room.id) + 1);
  return [...touches].every(([id, count]) => (id === a || id === b ? count === 1 : count === 0));
};

function routeBetween(start, end, rooms, corridors, rng) {
  const allRooms = [...rooms.values()];
  const minX = Math.min(start.x, end.x, ...allRooms.map((room) => room.x)) - 10;
  const maxX = Math.max(start.x, end.x, ...allRooms.map((room) => room.x + room.w - 1)) + 10;
  const minY = Math.min(start.y, end.y, ...allRooms.map((room) => room.y)) - 10;
  const maxY = Math.max(start.y, end.y, ...allRooms.map((room) => room.y + room.h - 1)) + 10;
  const blocked = new Set(allRooms.flatMap(roomCells).map(({ x, y }) => keyOf(x, y)));
  for (const corridor of corridors) for (const cell of corridor.path) {
    blocked.add(keyOf(cell.x, cell.y));
    for (const direction of DIRECTIONS) blocked.add(keyOf(cell.x + direction.x, cell.y + direction.y));
  }
  const doors = new Set([keyOf(start.x, start.y), keyOf(end.x, end.y)]);
  const directions = shuffled(DIRECTIONS, rng);
  const from = new Map([[keyOf(start.x, start.y), null]]);
  const queue = [start];

  for (let index = 0; index < queue.length; index += 1) {
    const cell = queue[index];
    if (cell.x === end.x && cell.y === end.y) break;
    for (const direction of directions) {
      const next = { x: cell.x + direction.x, y: cell.y + direction.y };
      const key = keyOf(next.x, next.y);
      if (next.x < minX || next.x > maxX || next.y < minY || next.y > maxY || blocked.has(key) || from.has(key)) continue;
      if (!doors.has(key) && touchingRooms(next, rooms).length) continue;
      from.set(key, cell);
      queue.push(next);
    }
  }

  if (!from.has(keyOf(end.x, end.y))) return null;
  const path = [];
  for (let cell = end; cell; cell = from.get(keyOf(cell.x, cell.y))) path.push(cell);
  return path.reverse();
}

export function generate(chapter, seed, options = {}) {
  const settings = { roomW: [4, 7], roomH: [3, 5], gap: [5, 8], aspect: [null, null], ...options };
  const scenes = chapter.scenes || [];
  if (!scenes.length) return null;
  const rng = makeRng(seed);
  const links = linksOf(chapter);
  const depths = depthOf(chapter);
  if (Object.keys(depths).length !== scenes.length) return null;

  const sizes = new Map(scenes.map((scene) => [scene.id, {
    id: scene.id, name: scene.name, w: randomInt(rng, settings.roomW), h: randomInt(rng, settings.roomH),
  }]));
  const entrance = scenes[0].id;
  const rooms = new Map([[entrance, { ...sizes.get(entrance), x: 0, y: 0 }]]);
  const corridors = [];
  const usedPorts = new Map(scenes.map((scene) => [scene.id, new Set()]));

  while (rooms.size < scenes.length) {
    const candidates = shuffled(links.filter(({ a, b }) => rooms.has(a) !== rooms.has(b)), rng);
    let placed = false;
    for (const link of candidates) {
      const parentId = rooms.has(link.a) ? link.a : link.b;
      const childId = parentId === link.a ? link.b : link.a;
      const parent = rooms.get(parentId);
      const root = rooms.get(entrance);
      const parentCenter = centerOf(parent);
      const rootCenter = centerOf(root);
      const directions = shuffled(DIRECTIONS, rng)
        .filter(({ name }) => !usedPorts.get(parentId).has(name))
        .sort((left, right) => Math.sign(right.x * (parentCenter.x - rootCenter.x) + right.y * (parentCenter.y - rootCenter.y)) - Math.sign(left.x * (parentCenter.x - rootCenter.x) + left.y * (parentCenter.y - rootCenter.y)));

      for (const direction of directions) {
        const child = treeCandidate(parent, sizes.get(childId), direction.name, randomInt(rng, settings.gap), rng);
        if ([...rooms.values()].some((room) => tooClose(child, room))) continue;
        const candidateRooms = new Map(rooms).set(childId, child);
        const path = routeBetween(portal(parent, direction.name), portal(child, opposite(direction.name)), candidateRooms, corridors, rng);
        if (!path || !hasOnlyDoors(path, candidateRooms, parentId, childId)) continue;
        rooms.set(childId, child);
        corridors.push({ a: parentId, b: childId, path });
        usedPorts.get(parentId).add(direction.name);
        usedPorts.get(childId).add(opposite(direction.name));
        placed = true;
        break;
      }
      if (placed) break;
    }
    if (!placed) return null;
  }

  const present = new Set(corridors.map(({ a, b }) => linkKey(a, b)));
  for (const link of links) {
    if (present.has(linkKey(link.a, link.b))) continue;
    const pairs = shuffled(DIRECTIONS.flatMap((from) => DIRECTIONS.map((to) => ({ from: from.name, to: to.name }))), rng);
    let connected = false;
    for (const pair of pairs) {
      if (usedPorts.get(link.a).has(pair.from) || usedPorts.get(link.b).has(pair.to)) continue;
      const path = routeBetween(portal(rooms.get(link.a), pair.from), portal(rooms.get(link.b), pair.to), rooms, corridors, rng);
      if (!path || !hasOnlyDoors(path, rooms, link.a, link.b)) continue;
      corridors.push({ ...link, path });
      usedPorts.get(link.a).add(pair.from);
      usedPorts.get(link.b).add(pair.to);
      connected = true;
      break;
    }
    if (!connected) return null;
  }

  const cells = new Map();
  for (const room of rooms.values()) for (const cell of roomCells(room)) cells.set(keyOf(cell.x, cell.y), { kind: "room", id: room.id });
  for (const corridor of corridors) for (const cell of corridor.path) {
    if (cells.has(keyOf(cell.x, cell.y))) return null;
    cells.set(keyOf(cell.x, cell.y), { kind: "corridor" });
  }
  const coordinates = [...cells.keys()].map((key) => key.split(",").map(Number));
  const bounds = {
    minX: Math.min(...coordinates.map(([x]) => x)), minY: Math.min(...coordinates.map(([, y]) => y)),
    maxX: Math.max(...coordinates.map(([x]) => x)), maxY: Math.max(...coordinates.map(([, y]) => y)),
  };
  const [lo, hi] = settings.aspect;
  const ratio = (bounds.maxX - bounds.minX + 1) / (bounds.maxY - bounds.minY + 1);
  if (lo !== null && (ratio < lo || ratio > hi)) return null;
  return { rooms, corridors, cells, bounds, entrance };
}

export function generateWithRetry(chapter, seed, maxTries = 200) {
  for (let offset = 0; offset < maxTries; offset += 1) {
    const candidateSeed = Number(seed) + offset;
    const map = generate(chapter, candidateSeed);
    if (map) return { map, seed: candidateSeed };
  }
  throw new Error(`地図を${maxTries}回生成できませんでした`);
}
