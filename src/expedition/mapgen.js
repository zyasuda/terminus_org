// trpg-rogue-map/src/mapgen.js から移植した、部屋と通路を分離して置く生成器。
// 遠征側は「イベント=部屋」にした最小の chapter を渡すだけにする。
const DIRECTIONS = [
  { name: "north", x: 0, y: -1 }, { name: "east", x: 1, y: 0 },
  { name: "south", x: 0, y: 1 }, { name: "west", x: -1, y: 0 },
];
const keyOf = (x, y) => `${x},${y}`;
const linkKey = (a, b) => (String(a) < String(b) ? `${a}-${b}` : `${b}-${a}`);
const opposite = dir => DIRECTIONS[(DIRECTIONS.findIndex(item => item.name === dir) + 2) % 4].name;

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
  const ids = new Set(chapter.scenes.map(scene => scene.id));
  const links = new Map();
  for (const scene of chapter.scenes) for (const exit of scene.exits || []) {
    if (ids.has(exit.to) && exit.to !== scene.id) {
      const key = linkKey(scene.id, exit.to);
      if (!links.has(key)) links.set(key, String(scene.id) < String(exit.to) ? { a: scene.id, b: exit.to } : { a: exit.to, b: scene.id });
    }
  }
  return [...links.values()];
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
const roomCells = room => {
  const cells = [];
  for (let y = room.y; y < room.y + room.h; y += 1) for (let x = room.x; x < room.x + room.w; x += 1) cells.push({ x, y });
  return cells;
};
const tooClose = (a, b) => a.x - 1 <= b.x + b.w - 1 && a.x + a.w >= b.x && a.y - 1 <= b.y + b.h - 1 && a.y + a.h >= b.y;
const centerOf = room => ({ x: room.x + (room.w - 1) / 2, y: room.y + (room.h - 1) / 2 });

// 1つの壁に最大3本の通路を独立して生やせるようにする(BORG「AI相棒ローグ遠征」2026-08-16の
// チップ配列構想への布石)。壁をSLOT_COUNT等分し、slotの中央(=1)は今までのportal()と
// 完全に同じ座標になる(floor((1+.5)*w/3) === floor(w/2))。既定は各面ともslot 1だけ開放で、
// これは今までの「1部屋1方向1本」と同じ挙動になる。
const SLOT_COUNT = 3;
const defaultPorts = () => ({
  north: [false, true, false], east: [false, true, false],
  south: [false, true, false], west: [false, true, false],
});
export const slotPosition = (length, slot) => Math.floor((slot + .5) * length / SLOT_COUNT);
const portal = (room, direction, slot = 1) => {
  if (direction === "north") return { x: room.x + slotPosition(room.w, slot), y: room.y - 1 };
  if (direction === "east") return { x: room.x + room.w, y: room.y + slotPosition(room.h, slot) };
  if (direction === "south") return { x: room.x + slotPosition(room.w, slot), y: room.y + room.h };
  return { x: room.x - 1, y: room.y + slotPosition(room.h, slot) };
};
export const openSlots = (size, direction) => [0, 1, 2].filter(slot => (size.ports?.[direction] ?? defaultPorts()[direction])[slot]);
const touchingRooms = (cell, rooms) => [...rooms.values()].filter(room => (
  ((cell.x === room.x - 1 || cell.x === room.x + room.w) && cell.y >= room.y && cell.y < room.y + room.h) ||
  ((cell.y === room.y - 1 || cell.y === room.y + room.h) && cell.x >= room.x && cell.x < room.x + room.w)
));
const hasOnlyDoors = (path, rooms, a, b) => {
  const touches = new Map([...rooms.keys()].map(id => [id, 0]));
  for (const cell of path) for (const room of touchingRooms(cell, rooms)) touches.set(room.id, touches.get(room.id) + 1);
  return [...touches].every(([id, count]) => (id === a || id === b ? count === 1 : count === 0));
};

function routeBetween(start, end, rooms, corridors, rng) {
  const allRooms = [...rooms.values()];
  const minX = Math.min(start.x, end.x, ...allRooms.map(room => room.x)) - 10;
  const maxX = Math.max(start.x, end.x, ...allRooms.map(room => room.x + room.w - 1)) + 10;
  const minY = Math.min(start.y, end.y, ...allRooms.map(room => room.y)) - 10;
  const maxY = Math.max(start.y, end.y, ...allRooms.map(room => room.y + room.h - 1)) + 10;
  const blocked = new Set(allRooms.flatMap(roomCells).map(({ x, y }) => keyOf(x, y)));
  for (const corridor of corridors) for (const cell of corridor.path) {
    blocked.add(keyOf(cell.x, cell.y));
    for (const direction of DIRECTIONS) blocked.add(keyOf(cell.x + direction.x, cell.y + direction.y));
  }
  const doors = new Set([keyOf(start.x, start.y), keyOf(end.x, end.y)]);
  const from = new Map([[keyOf(start.x, start.y), null]]);
  const queue = [start];
  for (let index = 0; index < queue.length; index += 1) {
    const cell = queue[index];
    if (cell.x === end.x && cell.y === end.y) break;
    for (const direction of shuffled(DIRECTIONS, rng)) {
      const next = { x: cell.x + direction.x, y: cell.y + direction.y };
      const key = keyOf(next.x, next.y);
      if (next.x < minX || next.x > maxX || next.y < minY || next.y > maxY || blocked.has(key) || from.has(key)) continue;
      if (!doors.has(key) && touchingRooms(next, rooms).length) continue;
      from.set(key, cell); queue.push(next);
    }
  }
  if (!from.has(keyOf(end.x, end.y))) return null;
  const path = [];
  for (let cell = end; cell; cell = from.get(keyOf(cell.x, cell.y))) path.push(cell);
  return path.reverse();
}

export function generate(chapter, seed) {
  const scenes = chapter.scenes || [];
  if (!scenes.length) return null;
  const rng = makeRng(seed), links = linksOf(chapter);
  const sizes = new Map(scenes.map(scene => {
    const ports = { ...defaultPorts() };
    for (const dir of DIRECTIONS.map(d => d.name)) if (scene.ports?.[dir]) ports[dir] = scene.ports[dir];
    return [scene.id, {
      id: scene.id, name: scene.name, kind: scene.kind || "room",
      w: scene.size?.w ?? randomInt(rng, [4, 7]), h: scene.size?.h ?? randomInt(rng, [3, 5]),
      ports,
    }];
  }));
  const entrance = scenes[0].id;
  const rooms = new Map([[entrance, { ...sizes.get(entrance), x: 0, y: 0 }]]);
  const corridors = [];
  // "direction:slot" で使用済みの壁面を記録する。既定はslot 1だけなので、今までと同じ
  // 「1部屋1方向1本」のままだが、portsで複数slotを開放した部屋だけ複数本を生やせる。
  const usedPorts = new Map(scenes.map(scene => [scene.id, new Set()]));
  while (rooms.size < scenes.length) {
    const candidates = shuffled(links.filter(({ a, b }) => rooms.has(a) !== rooms.has(b)), rng);
    let placed = false;
    for (const link of candidates) {
      const parentId = rooms.has(link.a) ? link.a : link.b;
      const childId = parentId === link.a ? link.b : link.a;
      const parent = rooms.get(parentId);
      const root = rooms.get(entrance);
      const parentCenter = centerOf(parent), rootCenter = centerOf(root);
      const portOptions = shuffled(
        DIRECTIONS.flatMap(d => openSlots(sizes.get(parentId), d.name).map(slot => ({ ...d, slot }))),
        rng,
      )
        .filter(option => !usedPorts.get(parentId).has(`${option.name}:${option.slot}`))
        .sort((left, right) => Math.sign(right.x * (parentCenter.x - rootCenter.x) + right.y * (parentCenter.y - rootCenter.y)) - Math.sign(left.x * (parentCenter.x - rootCenter.x) + left.y * (parentCenter.y - rootCenter.y)));
      for (const option of portOptions) {
        const d = option;
        const child = { ...sizes.get(childId) };
        const gap = randomInt(rng, [5, 8]);
        // 親の同じ壁に2本以上の通路が出る場合だけ、子部屋をそのスロットの高さへ寄せて置く。
        // 寄せないと、どのスロットから出た通路の子部屋も同じ自由乱数域に散らばり、
        // 複数の子が高確率で重なって置けなくなる(実測: 500回中0回成功)。
        // 既定(壁1本だけ)はいままでの完全な自由乱数のままにして、検証済みの生成結果を変えない。
        const multiSlot = openSlots(sizes.get(parentId), d.name).length > 1;
        const anchor = multiSlot ? portal(parent, d.name, d.slot) : null;
        if (d.x) {
          child.x = d.x > 0 ? parent.x + parent.w + gap : parent.x - gap - child.w;
          child.y = anchor ? anchor.y - Math.floor(child.h / 2) + randomInt(rng, [-1, 1]) : parent.y + randomInt(rng, [-child.h + 1, parent.h - 1]);
        } else {
          child.y = d.y > 0 ? parent.y + parent.h + gap : parent.y - gap - child.h;
          child.x = anchor ? anchor.x - Math.floor(child.w / 2) + randomInt(rng, [-1, 1]) : parent.x + randomInt(rng, [-child.w + 1, parent.w - 1]);
        }
        if ([...rooms.values()].some(room => tooClose(child, room))) continue;
        const candidateRooms = new Map(rooms).set(childId, child);
        // 子側は初めての接続なので中央(slot 1)で受ける。複数本が要るのは既存の部屋(親)側だけ。
        const path = routeBetween(portal(parent, d.name, d.slot), portal(child, opposite(d.name), 1), candidateRooms, corridors, rng);
        if (!path || !hasOnlyDoors(path, candidateRooms, parentId, childId)) continue;
        rooms.set(childId, child);
        corridors.push({ a: parentId, b: childId, path, door: { direction: d.name, slot: d.slot } });
        usedPorts.get(parentId).add(`${d.name}:${d.slot}`); usedPorts.get(childId).add(`${opposite(d.name)}:1`);
        placed = true; break;
      }
      if (placed) break;
    }
    if (!placed) return null;
  }
  const cells = new Map();
  for (const room of rooms.values()) for (const cell of roomCells(room)) cells.set(keyOf(cell.x, cell.y), { kind: room.kind, id: room.id });
  for (const corridor of corridors) for (const cell of corridor.path) cells.set(keyOf(cell.x, cell.y), { kind: "corridor" });
  const coordinates = [...cells.keys()].map(key => key.split(",").map(Number));
  const bounds = { minX: Math.min(...coordinates.map(([x]) => x)), minY: Math.min(...coordinates.map(([, y]) => y)), maxX: Math.max(...coordinates.map(([x]) => x)), maxY: Math.max(...coordinates.map(([, y]) => y)) };
  return { rooms, corridors, cells, bounds, entrance };
}

export function generateWithRetry(chapter, seed, maxTries = 200) {
  for (let offset = 0; offset < maxTries; offset += 1) {
    const map = generate(chapter, Number(seed) + offset);
    if (map) return { map, seed: Number(seed) + offset };
  }
  throw new Error(`地図を${maxTries}回生成できませんでした`);
}

// 素のrouteBetweenは常に最短経路を返す。それだけを引き直しても、
// 曲がる場所が1〜2マスずれるだけで、プレイして分かるほどの変化にならない
// (作者の実プレイで確認済み)。そこで、直線上ではなく進行方向に対して
// 垂直にずらした中継点を経由させ、明らかに遠回りする通路を作る。
// 中継点までの最短経路→中継点から先の最短経路、と2回routeBetweenを呼ぶだけで、
// 既存の当たり判定(部屋への非接触・通路同士の非隣接)をそのまま満たせる。
const MEANDER_OFFSET = [4, 9]; // 直線からずらすマス数の範囲。実測して決めた値
function detourWaypoint(start, end, rng) {
  const dx = end.x - start.x, dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const perpX = -dy / length, perpY = dx / length;
  const side = rng() < .5 ? -1 : 1;
  const offset = side * randomInt(rng, MEANDER_OFFSET);
  return {
    x: Math.round((start.x + end.x) / 2 + perpX * offset),
    y: Math.round((start.y + end.y) / 2 + perpY * offset),
  };
}
function routeWithDetour(start, end, rooms, corridors, rng) {
  const waypoint = detourWaypoint(start, end, rng);
  const leg1 = routeBetween(start, waypoint, rooms, corridors, rng);
  if (!leg1) return null;
  // leg2は、他の通路と同じ「1マスの余白」込みでleg1を避けないと、すぐ隣を並走してしまう
  // (実測: 150本中102本で自己隣接。プレイ側で「上に行くと突き抜ける」不具合として発覚)。
  // ただし中継点(leg1の最後のマス=leg2の出発点)自身をパディングの発生源に含めると、
  // その4方向すべてが塞がり、leg2が一歩も動けなくなる(実測: 30地図中0回成功)。
  // 中継点だけをパディングの発生源から外せば、両方を防げる。
  const leg1WithoutWaypoint = { a: null, b: null, path: leg1.slice(0, -1) };
  const leg2 = routeBetween(waypoint, end, rooms, [...corridors, leg1WithoutWaypoint], rng);
  if (!leg2) return null;
  return [...leg1, ...leg2.slice(1)]; // 中継点セルが両脚に重複するので1回だけ数える
}

export function rerouteCorridors(map, seed) {
  const rng = makeRng(seed);
  const corridors = [];
  for (const original of shuffled(map.corridors, rng)) {
    const parent = map.rooms.get(original.a);
    const child = map.rooms.get(original.b);
    const start = portal(parent, original.door.direction, original.door.slot);
    const end = portal(child, opposite(original.door.direction), 1);
    const path = routeWithDetour(start, end, map.rooms, corridors, rng);
    if (!path || !hasOnlyDoors(path, map.rooms, original.a, original.b)) return null;
    const occupied = new Set(corridors.flatMap(corridor => corridor.path.map(cell => keyOf(cell.x, cell.y))));
    if (path.some(cell => occupied.has(keyOf(cell.x, cell.y)) || DIRECTIONS.some(direction => occupied.has(keyOf(cell.x + direction.x, cell.y + direction.y))))) return null;
    corridors.push({ a: original.a, b: original.b, path, door: original.door });
  }
  const cells = new Map();
  for (const room of map.rooms.values()) for (const cell of roomCells(room)) cells.set(keyOf(cell.x, cell.y), { kind: room.kind, id: room.id });
  for (const corridor of corridors) for (const cell of corridor.path) cells.set(keyOf(cell.x, cell.y), { kind: "corridor" });
  return { rooms: map.rooms, corridors, cells, bounds: map.bounds, entrance: map.entrance };
}

// 遠回り(routeWithDetour)は普通の生成より1回あたりの成功率が低いため、
// generateWithRetryの既定(200)より多めに持たせる(実測: 40地図中2件が200回では
// 足りず、226回・299回で成功した)。
export function rerouteCorridorsWithRetry(map, seed, maxTries = 500) {
  for (let offset = 0; offset < maxTries; offset += 1) {
    const rerouted = rerouteCorridors(map, Number(seed) + offset);
    if (rerouted) return { map: rerouted, seed: Number(seed) + offset };
  }
  throw new Error(`通路を${maxTries}回引き直せませんでした`);
}
