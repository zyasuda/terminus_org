import assert from "node:assert/strict";
import { isWalkable, reachableCells } from "../battle/core.js";
import { createExpeditionBattleLayout, EXPEDITION_MODEL_FACING_OFFSET, facingToward } from "./battleState.js";

const HEIGHTS = new Set([0.25, 0.5, 0.75, 1]);
const signature = layout => layout.grid.cells.map((cell, i) => cell.obstacle ? `${i}:${cell.obstacle.height}` : "").filter(Boolean);
for (const guardian of [false, true]) {
  for (let seed = 1; seed <= 80; seed++) {
    const { grid, starts } = createExpeditionBattleLayout(guardian, seed);
    const blocks = grid.cells.filter(cell => cell.obstacle);
    assert.ok(blocks.length >= 1 && blocks.length <= 6, `${guardian ? "守護者" : "通路"} ${seed}: ブロック数`);
    assert.ok(blocks.every(cell => HEIGHTS.has(cell.obstacle.height)), `${guardian ? "守護者" : "通路"} ${seed}: 高さは4段階`);
    assert.ok(grid.cells.every(cell => cell.walkable || !!cell.obstacle), `${guardian ? "守護者" : "通路"} ${seed}: 外周壁を置かない`);
    for (const start of Object.values(starts)) assert.ok(isWalkable(grid, start.x, start.y), `${guardian ? "守護者" : "通路"} ${seed}: 開始位置を空ける`);
    const reached = reachableCells(grid, starts.hero, 99);
    assert.ok(reached.some(cell => cell.x === starts.enemy.x && cell.y === starts.enemy.y), `${guardian ? "守護者" : "通路"} ${seed}: 両陣営が到達可能`);
  }
}
const normal = createExpeditionBattleLayout(false, 1).starts;
assert.equal(normal.hero.x, 0, "通路端で味方を横並びにする");
assert.equal(normal.mage.x, 0, "通路端で味方を横並びにする");
assert.deepEqual(new Set([normal.hero.y, normal.mage.y]), new Set([0, 2]), "通路の上下2列を使う");
assert.deepEqual(normal.enemy, { x: 6, y: 1 }, "敵は通路の反対端に置く");
const normalOrders = new Set(), guardianOrders = new Set();
for (let seed = 1; seed <= 80; seed++) {
  const corridor = createExpeditionBattleLayout(false, seed).starts;
  const guardian = createExpeditionBattleLayout(true, seed).starts;
  normalOrders.add(`${corridor.hero.y},${corridor.mage.y}`);
  guardianOrders.add(`${guardian.hero.y},${guardian.mage.y}`);
}
assert.deepEqual(normalOrders, new Set(["0,2", "2,0"]), "通常通路ではseedごとに味方の上下を入れ替える");
assert.deepEqual(guardianOrders, new Set(["3,4", "4,3"]), "守護者戦でも味方の上下を入れ替える");
assert.deepEqual(EXPEDITION_MODEL_FACING_OFFSET, { party: 0, enemy: 0 }, "対峙方向はrootのfacingだけで決める");
assert.deepEqual(signature(createExpeditionBattleLayout(false, 42)), signature(createExpeditionBattleLayout(false, 42)), "同じseedは同じブロック配置になる");
assert.equal(facingToward({ x: 0, y: 0 }, { x: 1, y: 0 }), Math.PI / 2, "東へ移動する時は右を向く");
assert.equal(facingToward({ x: 1, y: 1 }, { x: 1, y: 0 }), Math.PI, "北の敵へ対峙する時は奥を向く");
assert.equal(facingToward({ x: 1, y: 1 }, { x: 1, y: 1 }, 0.7), 0.7, "目標が無ければ最後の向きを維持する");
console.log("expedition battle state: open boards, seeded blocks, reachable starts");
