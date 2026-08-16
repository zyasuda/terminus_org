import { createGrid, makeRng, scatterObstacles } from "../battle/core.js";
import { EXPEDITION_BATTLE_CONFIG } from "./battleConfig.js";

const openRows = ({ width, height }) => Array.from({ length: height }, () => ".".repeat(width));
const layoutName = layout => layout === true ? "guardian" : layout === "junction" ? "junction" : "corridor";
const gridFor = board => {
  const grid = createGrid(board.rows || openRows(board));
  // 三叉路の'#'は壁ではなく、床が存在しない盤外として描画する。
  for (const cell of grid.cells) if (!cell.walkable) cell.void = true;
  return grid;
};

// Three.jsのY回転は+Zを向く角度なので、グリッドのy方向をZへ対応させる。
// 同じマスを指定された時だけは、現在の向きを保つ。
export function facingToward(from, to, fallback = 0) {
  const dx = to.x - from.x, dy = to.y - from.y;
  return dx || dy ? Math.atan2(dx, dy) : fallback;
}

export function createExpeditionBattleLayout(layout, seed = 0) {
  const rng = makeRng(seed);
  const board = EXPEDITION_BATTLE_CONFIG.board[layoutName(layout)];
  const partySlots = board.partySlots.map(slot => ({ ...slot }));
  const swap = Math.floor(rng() * partySlots.length); // Fisher-Yatesの2要素版
  [partySlots[partySlots.length - 1], partySlots[swap]] = [partySlots[swap], partySlots[partySlots.length - 1]];
  const starts = {
    hero: partySlots[0], mage: partySlots[1],
    enemy: { ...board.enemyStart },
  };
  const grid = gridFor(board);
  const { min, max } = EXPEDITION_BATTLE_CONFIG.board.obstacles;
  scatterObstacles(grid, rng, {
    count: min + Math.floor(rng() * (max - min + 1)),
    keepClear: Object.values(starts),
  });
  return { grid, starts };
}
