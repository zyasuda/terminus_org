// 唯一の大部屋内装テンプレート。間仕切りで2つの小区画に分け、中央に幅2の開口を残す。
// 探索側の当たり判定(hallBlocked)と戦闘盤面(hallBattleBoard)が同じ壁集合を読むので、
// 迷路の壁と戦闘の壁が食い違わない。
export const HALL_SIZE = { w: 16, h: 12 };
const WALL_X = Math.floor(HALL_SIZE.w / 2);
const GAP_Y = [Math.floor(HALL_SIZE.h / 2) - 1, Math.floor(HALL_SIZE.h / 2)];
// 固定敵(ランダム配置ではない)。右の小区画、開口のすぐ奥に置く。
export const HALL_ENEMY_LOCAL = { x: WALL_X + 4, y: GAP_Y[0] };

export function isHallRoom(room) { return room?.kind === "hall"; }

// 間仕切りの壁マス(部屋ローカル座標)。
function hallWalls() {
  const walls = new Set();
  for (let y = 0; y < HALL_SIZE.h; y += 1) {
    // 南北の中央扉も WALL_X 上に来るため、外周の入口1マスは塞がない。
    if (y === 0 || y === HALL_SIZE.h - 1 || GAP_Y.includes(y)) continue;
    walls.add(`${WALL_X},${y}`);
  }
  return walls;
}

// グローバル座標(x,y)が大部屋の間仕切りに当たるか。部屋の外(通路・他の部屋)は常にfalse。
export function hallBlocked(map, x, y) {
  const cell = map.cells.get(`${x},${y}`);
  if (!cell || cell.kind === "corridor") return false;
  const room = map.rooms.get(cell.id);
  if (!isHallRoom(room)) return false;
  return hallWalls().has(`${x - room.x},${y - room.y}`);
}

// 間仕切りのマス(グローバル座標)。地図もこれを読む。
// 探索の当たり判定・戦闘盤面・地図が同じ壁集合を見るための唯一の出口。
export function hallWallCells(map) {
  const room = hallRoomOf(map);
  if (!room) return [];
  return [...hallWalls()].map(key => {
    const [x, y] = key.split(",").map(Number);
    return { x: room.x + x, y: room.y + y };
  });
}

export function hallRoomOf(map) { return [...map.rooms.values()].find(isHallRoom) || null; }

// 固定敵のグローバル座標。地図には出さず、視界内でだけ描く/接触判定に使う。
export function hallEnemyPosition(room) {
  return { x: room.x + HALL_ENEMY_LOCAL.x, y: room.y + HALL_ENEMY_LOCAL.y };
}

// 戦闘盤面へ渡す行データと初期配置。間仕切りは戦闘側では背景壁(void)として描く
// (三叉路の枝以外と同じ扱い。voidBoundaryWallsで壁として見える)。
export function hallBattleBoard(room) {
  const walls = hallWalls();
  const rows = [];
  for (let y = 0; y < room.h; y += 1) {
    let row = "";
    for (let x = 0; x < room.w; x += 1) row += walls.has(`${x},${y}`) ? "#" : ".";
    rows.push(row);
  }
  return {
    width: room.w, height: room.h, rows,
    partySlots: [{ x: WALL_X - 2, y: GAP_Y[0] }, { x: WALL_X - 2, y: GAP_Y[1] }],
    enemyStart: { x: HALL_ENEMY_LOCAL.x, y: HALL_ENEMY_LOCAL.y },
  };
}
