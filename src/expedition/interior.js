// 探索の地図から戦闘盤を組む場所。大部屋の内装、三叉路の枝、通路の形をここで決める。
// 探索側の当たり判定(hallBlocked)と戦闘盤面(hallBattleBoard)が同じ壁集合を読むので、
// 迷路の壁と戦闘の壁が食い違わない。三叉路も同じ理由で、固定の形ではなく地図から組む。
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
    kind: "hall",
    width: room.w, height: room.h, rows,
    partySlots: [{ x: WALL_X - 2, y: GAP_Y[0] }, { x: WALL_X - 2, y: GAP_Y[1] }],
    enemyStart: { x: HALL_ENEMY_LOCAL.x, y: HALL_ENEMY_LOCAL.y },
  };
}

// 通路戦の盤。探索の部屋寸法をそのまま使い、入ってきた辺と反対側で向かい合う。
export function corridorBattleBoard(room, entryCell) {
  const edge = [
    ["north", entryCell.y], ["south", room.h - 1 - entryCell.y],
    ["west", entryCell.x], ["east", room.w - 1 - entryCell.x],
  ].reduce((nearest, candidate) => candidate[1] < nearest[1] ? candidate : nearest)[0];
  const oppositeEdge = { north: "south", south: "north", west: "east", east: "west" }[edge];
  const cellsOn = side => {
    const horizontal = side === "north" || side === "south";
    const length = horizontal ? room.w : room.h;
    const positions = [-1, 1].map(offset => Math.max(0, Math.min(length - 1, Math.floor(length / 2) + offset)));
    return positions.map(position => horizontal
      ? { x: position, y: side === "north" ? 0 : room.h - 1 }
      : { x: side === "west" ? 0 : room.w - 1, y: position });
  };
  const partySlots = cellsOn(edge), enemySlots = cellsOn(oppositeEdge);
  return {
    kind: "corridor",
    width: room.w, height: room.h, rows: Array.from({ length: room.h }, () => ".".repeat(room.w)),
    partySlots,
    enemyStart: enemySlots[0], enemyStart2: enemySlots[1],
  };
}

/* 三叉路の戦闘盤。地図でその交差点が開いている向きだけに枝を生やす。

   2026-08-31まではbattleConfig.jsの固定文字列だった。北・西・南に枝を生やす形が
   焼き込まれていて、地図と方角が合っていなかった(実測: seed 1453439713の三叉路は
   東・西・北に開いているのに、戦闘盤には無いはずの南の枝が出て、東の枝が消えていた)。

   枝の長さは2タイル。3タイル(=探索の1マスぶん)にすると盤が9×9へ広がり、
   歩数と密度が変わってしまう。方角の食い違いだけを直し、盤の大きさは据え置く。
   北・西・南に開いている三叉路では、以前の固定盤と1文字も違わない形が出る。 */
const JUNCTION_ARM = 2;                            // 枝の長さ。単位: 戦闘タイル
const JUNCTION_SPAN = 3;                           // 枝と交差点の幅。通路と同じ3タイル
const JUNCTION_SIZE = JUNCTION_ARM * 2 + JUNCTION_SPAN;
// 枝が占めるタイル。dx/dyは交差点から外を向く向き(探索のFACING_AHEADと同じ取り方)。
const JUNCTION_DIR = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };
// 枝の外端の中央マス。ここが盤の出入口になる。
function junctionArmEnd(dir) {
  const [dx, dy] = JUNCTION_DIR[dir], mid = JUNCTION_ARM + 1, edge = dx || dy;
  const end = edge < 0 ? 0 : JUNCTION_SIZE - 1;
  return dx ? { x: end, y: mid } : { x: mid, y: end };
}

export function junctionBattleBoard(openDirs, entryDir) {
  const dirs = openDirs.filter(d => JUNCTION_DIR[d]);
  const rows = [];
  for (let y = 0; y < JUNCTION_SIZE; y += 1) {
    let row = "";
    for (let x = 0; x < JUNCTION_SIZE; x += 1) {
      const inX = x >= JUNCTION_ARM && x < JUNCTION_ARM + JUNCTION_SPAN;
      const inY = y >= JUNCTION_ARM && y < JUNCTION_ARM + JUNCTION_SPAN;
      const arm = dirs.some(d => {
        const [dx, dy] = JUNCTION_DIR[d];
        if (dx) return inY && (dx < 0 ? x < JUNCTION_ARM : x >= JUNCTION_ARM + JUNCTION_SPAN);
        return inX && (dy < 0 ? y < JUNCTION_ARM : y >= JUNCTION_ARM + JUNCTION_SPAN);
      });
      row += (inX && inY) || arm ? "." : "#";
    }
    rows.push(row);
  }
  // 味方は入ってきた枝の外端に、通路の幅いっぱいへ左右に離して置く。
  const entry = dirs.includes(entryDir) ? entryDir : dirs[0];
  const end = junctionArmEnd(entry), across = JUNCTION_DIR[entry][0] ? "y" : "x";
  const partySlots = [-1, 1].map(offset => ({ ...end, [across]: end[across] + offset }));
  // 敵は別の枝の外端。無ければ(行き止まり)交差点の中央。
  const foe = dirs.find(d => d !== entry);
  return {
    kind: "junction",
    width: JUNCTION_SIZE, height: JUNCTION_SIZE, rows,
    partySlots,
    enemyStart: foe ? junctionArmEnd(foe) : { x: JUNCTION_ARM + 1, y: JUNCTION_ARM + 1 },
  };
}
