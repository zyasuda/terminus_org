/* 戦闘グリッド中核ロジックの自己チェック。
   実行: npm run test:battle
   フレームワークは入れない(node標準のassertだけ)。この層は決定論なので、
   d20を固定値で注入すれば結果は毎回同じになる。 */

import assert from "node:assert/strict";
import {
  createGrid, isWalkable, inBounds,
  isAdjacent, movePointsFor, reachableCells,
  surroundMultiplier, adjacentAllies, turnOrder, resolveMelee
} from "./core.js";

const near = (a, b) => Math.abs(a - b) < 1e-9;

/* --- グリッド --- */
{
  const g = createGrid([
    ".....",
    ".###.",
    "....."
  ]);
  assert.equal(g.w, 5);
  assert.equal(g.h, 3);
  assert.ok(isWalkable(g, 0, 0), "床は通行可");
  assert.ok(!isWalkable(g, 1, 1), "'#'は壁");
  assert.ok(!isWalkable(g, -1, 0), "範囲外は通行不可");
  assert.ok(!inBounds(g, 5, 0));

  // 行が短い場合、足りない分は壁扱い(可変形状マップ)
  const ragged = createGrid(["...", "."]);
  assert.ok(isWalkable(ragged, 0, 1));
  assert.ok(!isWalkable(ragged, 2, 1), "短い行の欠けは壁");
}

/* --- 隣接(8方向) --- */
{
  const o = { x: 2, y: 2 };
  assert.ok(isAdjacent(o, { x: 3, y: 3 }), "斜めも隣接");
  assert.ok(isAdjacent(o, { x: 2, y: 1 }));
  assert.ok(!isAdjacent(o, { x: 4, y: 2 }), "2マス先は隣接でない");
  assert.ok(!isAdjacent(o, { x: 2, y: 2 }), "自分自身は隣接でない");
}

/* --- 移動力 --- */
{
  assert.equal(movePointsFor(4), 4, "agility4 → 3+1");
  assert.equal(movePointsFor(5), 5, "agility5 → 3+2");
  assert.equal(movePointsFor(6), 5);
  assert.equal(movePointsFor(7), 6, "agility7 → 3+3");
  assert.equal(movePointsFor(), 5, "未指定は5扱い");
}

/* --- 到達範囲 --- */
{
  const g = createGrid([
    ".....",
    ".....",
    "....."
  ]);
  const one = reachableCells(g, { x: 2, y: 1 }, 1);
  assert.equal(one.length, 8, "開けた場所で移動力1なら8方向すべて");
  assert.ok(one.every(c => c.cost === 1));

  // 壁で仕切ると向こう側へは回り込めない
  const walled = createGrid([
    ".#.",
    ".#.",
    ".#."
  ]);
  const blockedByWall = reachableCells(walled, { x: 0, y: 1 }, 5);
  assert.ok(!blockedByWall.some(c => c.x === 2), "壁の向こうへは到達しない");

  // 他ユニットのマスは通過も着地もできない
  const occupied = [{ x: 3, y: 1 }];
  const around = reachableCells(g, { x: 2, y: 1 }, 1, occupied);
  assert.ok(!around.some(c => c.x === 3 && c.y === 1), "他ユニットのマスは除外");

  // 起点は結果に含めない
  assert.ok(!one.some(c => c.x === 2 && c.y === 1), "起点は含めない");
}

/* --- 包囲ボーナス --- */
{
  assert.ok(near(surroundMultiplier(0), 1), "隣接0でも倍率1(下限)");
  assert.ok(near(surroundMultiplier(1), 1));
  assert.ok(near(surroundMultiplier(2), 1 + 1 / 3));
  assert.ok(near(surroundMultiplier(3), 1 + 2 / 3));
  assert.ok(near(surroundMultiplier(4), 2));

  const target = { x: 2, y: 2, hp: 8, side: "enemy" };
  const units = [
    { id: "a", side: "party", hp: 10, x: 1, y: 2 },
    { id: "b", side: "party", hp: 10, x: 3, y: 3 },
    { id: "dead", side: "party", hp: 0, x: 2, y: 1 },   // 戦闘不能は数えない
    { id: "far", side: "party", hp: 10, x: 0, y: 0 },   // 離れている
    target
  ];
  assert.equal(adjacentAllies(units, target, "party").length, 2);
}

/* --- 行動順 --- */
{
  const order = turnOrder([
    { id: "slow", agility: 4, hp: 10 },
    { id: "fast", agility: 7, hp: 10 },
    { id: "down", agility: 9, hp: 0 },
    { id: "mid", hp: 10 }                                // agility未指定=5
  ]);
  assert.deepEqual(order.map(u => u.id), ["fast", "mid", "slow"], "agility降順・戦闘不能は除外");
}

/* --- 近接攻撃の解決 --- */
{
  const atk = { id: "gareth", side: "party", hp: 10, x: 1, y: 1 };
  const foe = { id: "rust", side: "enemy", hp: 8, x: 2, y: 1, defenseDc: 12 };

  // 隣接していなければ成立しない
  const far = resolveMelee({ attacker: atk, target: { ...foe, x: 5 }, roll: () => 20 });
  assert.equal(far.ok, false);
  assert.equal(far.reason, "not_adjacent");

  // 戦闘不能なユニットは攻撃も被弾もしない
  assert.equal(resolveMelee({ attacker: { ...atk, hp: 0 }, target: foe, roll: () => 20 }).reason, "attacker_down");
  assert.equal(resolveMelee({ attacker: atk, target: { ...foe, hp: 0 }, roll: () => 20 }).reason, "target_down");

  // 命中/外れはDC基準
  const miss = resolveMelee({ attacker: atk, target: foe, units: [atk, foe], roll: () => 11 });
  assert.equal(miss.hit, false);
  assert.equal(miss.damage, 0);

  const hit = resolveMelee({ attacker: atk, target: foe, units: [atk, foe], roll: () => 12 });
  assert.equal(hit.hit, true);
  assert.equal(hit.damage, 1, "単独ならダメージ1");

  // 出目20はクリティカル(自動成功)、出目1はファンブル(自動失敗)
  const crit = resolveMelee({ attacker: atk, target: { ...foe, defenseDc: 30 }, units: [atk, foe], roll: () => 20 });
  assert.ok(crit.hit && crit.crit, "20はDCを超えていても命中");
  assert.equal(crit.damage, 2);

  const fumble = resolveMelee({ attacker: atk, target: { ...foe, defenseDc: 2 }, units: [atk, foe], roll: () => 1 });
  assert.ok(!fumble.hit && fumble.fumble, "1はDCを満たしていても失敗");

  // 包囲: 味方2人で隣接するとダメージが上がる
  const ally = { id: "lydia", side: "party", hp: 10, x: 2, y: 2 };
  const surrounded = resolveMelee({ attacker: atk, target: foe, units: [atk, ally, foe], roll: () => 12 });
  assert.equal(surrounded.surround, 2);
  assert.ok(near(surrounded.multiplier, 1 + 1 / 3));
  assert.equal(surrounded.damage, 1, "1 × 1.33 → 四捨五入で1");

  const surroundedCrit = resolveMelee({ attacker: atk, target: foe, units: [atk, ally, foe], roll: () => 20 });
  assert.equal(surroundedCrit.damage, 3, "2 × 1.33 → 四捨五入で3");
}

console.log("battle/core: 全チェック通過");
