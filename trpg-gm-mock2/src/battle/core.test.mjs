/* 戦闘グリッド中核ロジックの自己チェック。
   実行: npm run test:battle
   フレームワークは入れない(node標準のassertだけ)。この層は決定論なので、
   d20を固定値で注入すれば結果は毎回同じになる。 */

import assert from "node:assert/strict";
import {
  createGrid, isWalkable, inBounds, cellAt,
  isAdjacent, movePointsFor, reachableCells,
  surroundMultiplier, adjacentAllies, turnOrder, resolveMelee,
  chooseEnemyAction, makeRng, scatterObstacles
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
  assert.equal(movePointsFor(4), 2, "agility4 → 1+1");
  assert.equal(movePointsFor(5), 2);
  assert.equal(movePointsFor(6), 2);
  assert.equal(movePointsFor(7), 3, "agility7 → 1+2");
  assert.equal(movePointsFor(), 2, "未指定はagility5扱い");
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

/* --- 障害物のランダム配置 --- */
{
  const base = () => createGrid(Array(8).fill("........"));
  const corners = [{ x: 0, y: 3 }, { x: 7, y: 4 }];
  const opts = { pillars: 5, rubble: 6, keepClear: corners };

  const snapshot = g => g.cells.map(c => (c.obstacle ? c.obstacle.height : 0)).join(",");

  // 同じseedなら同じ盤面(検証を再現できる)
  assert.equal(
    snapshot(scatterObstacles(base(), makeRng(42), opts)),
    snapshot(scatterObstacles(base(), makeRng(42), opts)),
    "同一seedは同一配置"
  );
  assert.notEqual(
    snapshot(scatterObstacles(base(), makeRng(42), opts)),
    snapshot(scatterObstacles(base(), makeRng(7), opts)),
    "違うseedなら配置も変わる"
  );

  // 複数のseedで不変条件を確かめる
  for (const seed of [1, 2, 3, 42, 999, 12345]) {
    const g = scatterObstacles(base(), makeRng(seed), opts);

    for (const c of corners) {
      assert.ok(isWalkable(g, c.x, c.y), `seed${seed}: 開始位置は空けたまま`);
      assert.equal(cellAt(g, c.x, c.y).obstacle, null);
    }

    // 開始位置どうしが必ず行き来できる(通り抜けられない盤面を作らない)
    const far = reachableCells(g, corners[0], 999);
    assert.ok(
      far.some(p => p.x === corners[1].x && p.y === corners[1].y),
      `seed${seed}: 相手側まで到達できる`
    );

    // 高さ1.0は進入不可、0.25〜0.75は進入できる
    for (let i = 0; i < g.cells.length; i++) {
      const c = g.cells[i];
      if (!c.obstacle) continue;
      const h = c.obstacle.height;
      assert.ok([0.25, 0.5, 0.75, 1].includes(h), `seed${seed}: 想定内の高さ (${h})`);
      assert.equal(c.walkable, h < 1, `seed${seed}: 高さ${h}の通行可否`);
    }
  }
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
  const atk = { id: "gareth", side: "party", hp: 10, x: 1, y: 1, atk: 3 };
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
  assert.equal(hit.damage, 3, "単独ならatkそのまま");

  // atk未指定は既定3
  assert.equal(
    resolveMelee({ attacker: { ...atk, atk: undefined }, target: foe, units: [], roll: () => 12 }).damage,
    3
  );

  // 出目20はクリティカル(自動成功)、出目1はファンブル(自動失敗)
  const crit = resolveMelee({ attacker: atk, target: { ...foe, defenseDc: 30 }, units: [atk, foe], roll: () => 20 });
  assert.ok(crit.hit && crit.crit, "20はDCを超えていても命中");
  assert.equal(crit.damage, 6, "クリティカルはatkの2倍");

  const fumble = resolveMelee({ attacker: atk, target: { ...foe, defenseDc: 2 }, units: [atk, foe], roll: () => 1 });
  assert.ok(!fumble.hit && fumble.fumble, "1はDCを満たしていても失敗");

  // 包囲: 隣接する味方が増えるごとに1ずつ増える(3 / 4 / 5 / 6)
  const ally2 = { id: "lydia", side: "party", hp: 10, x: 2, y: 2 };
  const ally3 = { id: "c", side: "party", hp: 10, x: 3, y: 1 };
  const ally4 = { id: "d", side: "party", hp: 10, x: 3, y: 2 };

  const two = resolveMelee({ attacker: atk, target: foe, units: [atk, ally2, foe], roll: () => 12 });
  assert.equal(two.surround, 2);
  assert.ok(near(two.multiplier, 1 + 1 / 3));
  assert.equal(two.damage, 4, "3 × 1.33 → 4");

  assert.equal(
    resolveMelee({ attacker: atk, target: foe, units: [atk, ally2, ally3, foe], roll: () => 12 }).damage,
    5, "3人で囲むと5"
  );
  assert.equal(
    resolveMelee({ attacker: atk, target: foe, units: [atk, ally2, ally3, ally4, foe], roll: () => 12 }).damage,
    6, "4人で囲むと6"
  );
}

/* --- 敵の行動選択(仮置きAI) --- */
{
  const g = createGrid([
    "........",
    "........",
    "........"
  ]);
  const foe = { id: "rust", side: "enemy", hp: 8, agility: 5, x: 0, y: 1 };

  // 隣接していれば攻撃
  const hero = { id: "gareth", side: "party", hp: 10, agility: 7, x: 1, y: 1 };
  assert.deepEqual(
    chooseEnemyAction(g, foe, [foe, hero]),
    { type: "attack", targetId: "gareth" }
  );

  // 離れていれば近づく(移動後は必ず今より近くなる)
  const farHero = { id: "gareth", side: "party", hp: 10, agility: 7, x: 7, y: 1 };
  const act = chooseEnemyAction(g, foe, [foe, farHero]);
  assert.equal(act.type, "move");
  assert.ok(act.to.x > foe.x, "相手の方向へ寄る");

  // 相手が全滅していれば待機
  assert.deepEqual(
    chooseEnemyAction(g, foe, [foe, { ...farHero, hp: 0 }]),
    { type: "wait" }
  );

  // 壁で完全に囲まれていれば待機
  const boxed = createGrid([
    "###",
    "#.#",
    "###"
  ]);
  const trapped = { id: "t", side: "enemy", hp: 8, agility: 5, x: 1, y: 1 };
  const outside = { id: "p", side: "party", hp: 10, agility: 5, x: 9, y: 9 };
  assert.deepEqual(chooseEnemyAction(boxed, trapped, [trapped, outside]), { type: "wait" });
}

console.log("battle/core: 全チェック通過");
