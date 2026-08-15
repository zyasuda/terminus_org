import { createGrid, makeRng, scatterObstacles } from "../battle/core.js";

export const CORRIDOR_ROWS = Array.from({ length: 3 }, () => ".".repeat(7));
export const GUARDIAN_ROWS = Array.from({ length: 8 }, () => ".".repeat(8));
export const EXPEDITION_MODEL_FACING_OFFSET = { party: 0, enemy: 0 };

// Three.jsのY回転は+Zを向く角度なので、グリッドのy方向をZへ対応させる。
// 同じマスを指定された時だけは、現在の向きを保つ。
export function facingToward(from, to, fallback = 0) {
  const dx = to.x - from.x, dy = to.y - from.y;
  return dx || dy ? Math.atan2(dx, dy) : fallback;
}

export function createExpeditionBattleLayout(guardian, seed = 0) {
  const rng = makeRng(seed);
  const partySlots = guardian ? [{ x: 1, y: 3 }, { x: 1, y: 4 }] : [{ x: 0, y: 0 }, { x: 0, y: 2 }];
  const swap = Math.floor(rng() * partySlots.length); // Fisher-Yatesの2要素版
  [partySlots[partySlots.length - 1], partySlots[swap]] = [partySlots[swap], partySlots[partySlots.length - 1]];
  const starts = {
    hero: partySlots[0], mage: partySlots[1],
    enemy: guardian ? { x: 6, y: 3 } : { x: 6, y: 1 },
  };
  const grid = createGrid(guardian ? GUARDIAN_ROWS : CORRIDOR_ROWS);
  scatterObstacles(grid, rng, {
    count: 1 + Math.floor(rng() * 6),
    keepClear: Object.values(starts),
  });
  return { grid, starts };
}
