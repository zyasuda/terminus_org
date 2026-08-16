import assert from "node:assert/strict";
import { createGrid, isAdjacent, isWalkable, movePointsFor, occupiedBy, reachableCells } from "../battle/core.js";
import { EXPEDITION_BATTLE_CONFIG } from "./battleConfig.js";
import { createExpeditionBattleLayout, facingToward } from "./battleState.js";

const HEIGHTS = new Set([0.25, 0.5, 0.75, 1]);
const signature = layout => layout.grid.cells.map((cell, i) => cell.obstacle ? `${i}:${cell.obstacle.height}` : "").filter(Boolean);
for (const guardian of [false, true]) {
  const blockCounts = new Set();
  for (let seed = 1; seed <= 80; seed++) {
    const { grid, starts } = createExpeditionBattleLayout(guardian, seed);
    const blocks = grid.cells.filter(cell => cell.obstacle);
    blockCounts.add(blocks.length);
    assert.ok(blocks.length >= EXPEDITION_BATTLE_CONFIG.board.obstacles.min && blocks.length <= EXPEDITION_BATTLE_CONFIG.board.obstacles.max, `${guardian ? "守護者" : "通路"} ${seed}: Configのブロック数`);
    assert.ok(blocks.every(cell => HEIGHTS.has(cell.obstacle.height)), `${guardian ? "守護者" : "通路"} ${seed}: 高さは4段階`);
    assert.ok(grid.cells.every(cell => cell.walkable || !!cell.obstacle), `${guardian ? "守護者" : "通路"} ${seed}: 外周壁を置かない`);
    for (const start of Object.values(starts)) assert.ok(isWalkable(grid, start.x, start.y), `${guardian ? "守護者" : "通路"} ${seed}: 開始位置を空ける`);
    const reached = reachableCells(grid, starts.hero, 99, [], { maxObstacleHeight: EXPEDITION_BATTLE_CONFIG.movement.maxObstacleHeight });
    assert.ok(reached.some(cell => cell.x === starts.enemy.x && cell.y === starts.enemy.y), `${guardian ? "守護者" : "通路"} ${seed}: 両陣営が到達可能`);
  }
  assert.ok(blockCounts.has(EXPEDITION_BATTLE_CONFIG.board.obstacles.max), `${guardian ? "守護者" : "通路"}: Configの障害物上限まで生成できる`);
}
const normal = createExpeditionBattleLayout(false, 1).starts;
const normalBoard = EXPEDITION_BATTLE_CONFIG.board.corridor;
const normalGrid = createExpeditionBattleLayout(false, 1).grid;
assert.equal(normalGrid.w, normalBoard.width, "通路盤面の幅はConfigから読む");
assert.equal(normalGrid.h, normalBoard.height, "通路盤面の高さはConfigから読む");
assert.equal(normal.hero.x, normalBoard.partySlots[0].x, "通路端で味方を横並びにする");
assert.equal(normal.mage.x, normalBoard.partySlots[0].x, "通路端で味方を横並びにする");
assert.deepEqual(new Set([normal.hero.y, normal.mage.y]), new Set(normalBoard.partySlots.map(slot => slot.y)), "味方開始位置はConfigから読む");
assert.deepEqual(normal.enemy, normalBoard.enemyStart, "敵開始位置はConfigから読む");
const normalOrders = new Set(), guardianOrders = new Set();
for (let seed = 1; seed <= 80; seed++) {
  const corridor = createExpeditionBattleLayout(false, seed).starts;
  const guardian = createExpeditionBattleLayout(true, seed).starts;
  normalOrders.add(`${corridor.hero.y},${corridor.mage.y}`);
  guardianOrders.add(`${guardian.hero.y},${guardian.mage.y}`);
}
assert.deepEqual(normalOrders, new Set(["0,2", "2,0"]), "通常通路ではseedごとに味方の上下を入れ替える");
assert.deepEqual(guardianOrders, new Set(["3,4", "4,3"]), "守護者戦でも味方の上下を入れ替える");
assert.deepEqual(EXPEDITION_BATTLE_CONFIG.presentation.modelFacingOffset, { party: 0, enemy: 0 }, "対峙方向はrootのfacingだけで決める");
assert.deepEqual(signature(createExpeditionBattleLayout(false, 42)), signature(createExpeditionBattleLayout(false, 42)), "同じseedは同じブロック配置になる");
const junction = createExpeditionBattleLayout("junction", 42);
assert.equal(junction.grid.w, 7, "三叉路盤面の横幅は定義した形状から読む");
assert.equal(junction.grid.h, 7, "三叉路盤面の縦幅は定義した形状から読む");
assert.ok(junction.grid.cells.filter(cell => !cell.walkable && !cell.obstacle).every(cell => cell.void), "三叉路の枝以外は壁ブロックでなく盤外として描画する");
assert.ok(junction.grid.cells.filter(cell => cell.obstacle).every(cell => !cell.void), "ランダム障害物は三叉路の床だけに置く");
assert.deepEqual(junction.starts.enemy, EXPEDITION_BATTLE_CONFIG.board.junction.enemyStart, "三叉路の敵位置はConfigから読む");
assert.equal(junction.grid.cells.filter(cell => !cell.void).length, 27, "三叉路は各枝が3マス幅のT字の床だけを持つ");
assert.ok(reachableCells(junction.grid, junction.starts.hero, 99, [], { maxObstacleHeight: EXPEDITION_BATTLE_CONFIG.movement.maxObstacleHeight }).some(cell => cell.x === junction.starts.enemy.x && cell.y === junction.starts.enemy.y), "三叉路でも通常キャラが両陣営へ到達可能");
const voidBoundaryEdges = junction.grid.cells.reduce((count, cell, index) => {
  if (!cell.walkable) return count;
  const x = index % junction.grid.w, y = Math.floor(index / junction.grid.w);
  return count + [[0, -1], [1, 0], [0, 1], [-1, 0]].filter(([dx, dy]) => x + dx >= 0 && y + dy >= 0 && x + dx < junction.grid.w && y + dy < junction.grid.h && junction.grid.cells[(y + dy) * junction.grid.w + x + dx]?.void).length;
}, 0);
assert.equal(voidBoundaryEdges, 14, "三叉路の背景壁候補は盤外との境界だけで、高い障害物の周囲は含めない");
assert.equal(facingToward({ x: 0, y: 0 }, { x: 1, y: 0 }), Math.PI / 2, "東へ移動する時は右を向く");
assert.equal(facingToward({ x: 1, y: 1 }, { x: 1, y: 0 }), Math.PI, "北の敵へ対峙する時は奥を向く");
assert.equal(facingToward({ x: 1, y: 1 }, { x: 1, y: 1 }, 0.7), 0.7, "目標が無ければ最後の向きを維持する");
const adjacentHero = { id: "hero", x: 1, y: 1, hp: 10, agility: EXPEDITION_BATTLE_CONFIG.units.hero.agility };
const adjacentEnemy = { id: "enemy", x: 2, y: 1, hp: 10 };
const adjacentMoves = reachableCells(createGrid(["...", "...", "..."]), adjacentHero, movePointsFor(adjacentHero.agility), occupiedBy([adjacentHero, adjacentEnemy], adjacentHero.id));
assert.ok(isAdjacent(adjacentHero, adjacentEnemy), "攻撃可能な距離を確認する");
assert.ok(adjacentMoves.some(cell => cell.x === 0 && cell.y === 1), "敵に隣接していても別の空きマスへ移動できる");
console.log("expedition battle state: open boards, seeded blocks, reachable starts");
