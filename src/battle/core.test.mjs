/* 戦闘グリッド中核ロジックの自己チェック。
   実行: npm run test:battle
   フレームワークは入れない(node標準のassertだけ)。この層は決定論なので、
   d20を固定値で注入すれば結果は毎回同じになる。 */

import assert from "node:assert/strict";
import {
  createGrid, isWalkable, inBounds, cellAt,
  isAdjacent, movePointsFor, reachableCells,
  surroundMultiplier, adjacentAllies, turnOrder, resolveMelee,
  chooseEnemyAction, chooseMoveToward, makeRng, scatterObstacles, occupiedBy, pathTo,
  elevationAt, heightSteps, scatterWater, moveCostAt, findDodgeCell, resolveSweep, resolveShove,
  carveShape, resolveRanged
} from "./core.js";

const near = (a, b) => Math.abs(a - b) < 1e-9;

{
  const g = createGrid([".....", "..#..", "....."]);
  const mage = { x: 0, y: 0, hp: 8, atk: 2 }, enemy = { x: 4, y: 0, hp: 8, defenseDc: 10 };
  assert.equal(resolveRanged({ attacker: mage, target: enemy, grid: g, roll: () => 12 }).damage, 2, "遠隔攻撃は射程内なら命中する");
  assert.equal(resolveRanged({ attacker: mage, target: { ...enemy, x: 4, y: 2 }, grid: g, roll: () => 20 }).reason, "blocked", "壁は射線を遮る");
}

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

/* --- 水溜り(移動コスト2倍) --- */
{
  const g = createGrid(Array(5).fill("....."));
  assert.equal(moveCostAt(g, 0, 0), 1, "既定は1");

  cellAt(g, 2, 1).terrain = { type: "water", moveCost: 2 };
  assert.equal(moveCostAt(g, 2, 1), 2);

  // 水溜りは進入自体は妨げない
  assert.ok(isWalkable(g, 2, 1), "水溜りでも通行可能");

  // 移動力2なら、水溜りのマス自体には届くが、コストは2倍かかる
  const cells = reachableCells(g, { x: 2, y: 0 }, 2);
  const water = cells.find(c => c.x === 2 && c.y === 1);
  assert.ok(water, "水溜りのマス自体には届く");
  assert.equal(water.cost, 2, "水溜りへ入るのに移動力2ぶん消費する");

  // 水溜りだけを通路にした回廊では、それより先に進めるかどうかで
  // コストが実際に効いていることを確かめる(迂回できないようにする)
  const corridor = createGrid([
    "#####",
    "#...#",
    "#####"
  ]);
  cellAt(corridor, 2, 1).terrain = { type: "water", moveCost: 2 };
  const short = reachableCells(corridor, { x: 1, y: 1 }, 2);
  assert.ok(short.some(c => c.x === 2 && c.y === 1), "水溜りのマスまでは移動力2で届く");
  assert.ok(!short.some(c => c.x === 3 && c.y === 1), "水溜りを踏むとその先へは移動力2では進めない");

  const longer = reachableCells(corridor, { x: 1, y: 1 }, 3);
  assert.ok(longer.some(c => c.x === 3 && c.y === 1), "移動力3なら水溜りを越えて先へ進める");

  // scatterWaterはkeepClearを避け、障害物の上には置かない
  const rng = makeRng(5);
  const clear = [{ x: 0, y: 0 }, { x: 4, y: 4 }];
  const obstructed = createGrid(Array(5).fill("....."));
  cellAt(obstructed, 1, 1).obstacle = { height: 1 };
  cellAt(obstructed, 1, 1).walkable = false;
  const watered = scatterWater(obstructed, rng, { count: 6, keepClear: clear });
  const waterCells = watered.cells.filter(c => c.terrain?.type === "water");
  assert.ok(waterCells.length > 0, "水溜りが配置される");
  for (const p of clear) assert.equal(cellAt(watered, p.x, p.y).terrain, null, "keepClearには置かない");
  assert.equal(cellAt(watered, 1, 1).terrain, null, "障害物の上には置かない");
}

/* --- 経路の復元 --- */
{
  const g = createGrid([
    ".....",
    ".....",
    "....."
  ]);
  const start = { x: 0, y: 1 };
  const cells = reachableCells(g, start, 4);
  const dest = { x: 3, y: 1 };
  const path = pathTo(cells, dest);

  assert.ok(path.length >= 1, "経路が取れる");
  assert.deepEqual(path[path.length - 1], dest, "末尾は目的地");
  assert.ok(!path.some(p => p.x === start.x && p.y === start.y), "起点は含めない");
  // 隣り合うマスが連続していること
  let prev = start;
  for (const p of path) {
    assert.ok(isAdjacent(prev, p), `経路が飛んでいる: ${JSON.stringify(prev)} → ${JSON.stringify(p)}`);
    prev = p;
  }
  assert.deepEqual(pathTo(cells, { x: 99, y: 99 }), [], "届かない先は空の経路");
}

/* --- 立っているユニットだけがマスを塞ぐ --- */
{
  const units = [
    { id: "self", hp: 10, x: 0, y: 0 },
    { id: "alive", hp: 5, x: 1, y: 0 },
    { id: "downed", hp: 0, x: 2, y: 0 }   // 倒れた駒はコインになるので塞がない
  ];
  assert.deepEqual(occupiedBy(units, "self"), [{ x: 1, y: 0 }]);
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

  // 回帰テスト: keepClearが3体以上の時、「先頭と末尾さえ繋がっていればよい」という
  // 判定だと、間の1体だけが孤立していても見逃してしまう不具合があった。
  // a・b(先頭・末尾)は共に1行目(row0)にいて直結しており、そこを塞いでも
  // (斜め移動があるので)互いに繋がったまま。midだけが枝分かれの合流点(2,1)を
  // 経由しないと到達できない盤面を作る
  {
    const g = createGrid(Array(3).fill("....."));
    for (const cell of g.cells) cell.walkable = false;   // 一旦すべて壁にする
    // 開けるマス: a・bのいる1行目(row0)全体、枝分かれの合流点(2,1)、midのいる(2,2)
    for (let x = 0; x < 5; x++) cellAt(g, x, 0).walkable = true;
    cellAt(g, 2, 1).walkable = true;
    cellAt(g, 2, 2).walkable = true;

    const a = { x: 0, y: 0 }, mid = { x: 2, y: 2 }, b = { x: 4, y: 0 };
    // pillarsをopenの数以上にして、候補セルすべてに柱を試させる
    // (row0の途中のマスは斜め移動で迂回できるので置いても無害、(2,1)だけがmidの唯一の道)
    scatterObstacles(g, makeRng(1), { pillars: 10, rubble: 0, keepClear: [a, mid, b] });
    assert.equal(cellAt(g, 2, 1).obstacle, null, "midへの唯一の道には柱を置かない");
    assert.ok(pathReaches(g, a, mid), "先頭・末尾は繋がっていても、間のmidへも到達できる");
    assert.ok(pathReaches(g, a, b), "a-bどうしも引き続き到達できる");
  }
}

// 2点が行き来できるか(テスト内だけで使う簡易BFS。core.js内部のpathExistsとは別実装)
function pathReaches(grid, from, to) {
  return reachableCells(grid, from, 999).some(c => c.x === to.x && c.y === to.y);
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

/* --- 防御の構え(パリィ/いなす/カウンター/ドッジ) --- */
{
  const atk = { id: "gareth", side: "party", hp: 10, x: 1, y: 1, atk: 3, defenseDc: 12 };
  const foe = { id: "rust", side: "enemy", hp: 8, x: 2, y: 1, atk: 2, defenseDc: 12 };

  /* ドッジ: 攻撃者の間合いの外まで跳び退ける先を探す(単なる空きマスでは足りない) */
  {
    // target(1,1)・attacker(2,1)の3x3盤面では、attackerから見て奥側(x=0の列)の
    // 3マスだけが「隣接しなくなる」有効な逃げ先になる
    const g = createGrid(Array(3).fill("..."));
    const target = { id: "u", x: 1, y: 1 };
    const attacker = { id: "a", x: 2, y: 1 };
    const cell = findDodgeCell(g, attacker, target, []);
    assert.ok(cell, "開けた場所なら逃げ先がある");
    assert.ok(!isAdjacent(cell, attacker), "逃げ先はattackerと隣接しない");

    // 周囲すべてに高さ0.5以上の障害物を置くと、attackerから離れていても逃げ場が無い
    const boxed = createGrid(Array(3).fill("..."));
    for (const [dx, dy] of [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]]) {
      cellAt(boxed, 1 + dx, 1 + dy).obstacle = { height: 0.75 };
    }
    assert.equal(findDodgeCell(boxed, attacker, target, []), null, "高さ0.5以上に囲まれると不成立");

    // 高さ0.25(0.5未満)は逃げ先として使える
    const low = createGrid(Array(3).fill("..."));
    for (const [dx, dy] of [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]]) {
      cellAt(low, 1 + dx, 1 + dy).obstacle = { height: 0.25 };
    }
    assert.ok(findDodgeCell(low, attacker, target, []), "高さ0.25未満(0.5未満)は逃げ先になる");

    // 西側の列(attackerと隣接しなくなる唯一の逃げ先)を塞ぐと、残る開いたマスは
    // どれもattackerと隣接したままなので、空きマスはあっても不成立になる
    const stillNear = createGrid(Array(3).fill("..."));
    for (const y of [0, 1, 2]) cellAt(stillNear, 0, y).obstacle = { height: 0.75 };
    assert.equal(
      findDodgeCell(stillNear, attacker, target, []), null,
      "空きマスはあっても、どれもattackerと隣接したままなら不成立"
    );

    // 唯一の逃げ先が他ユニットに塞がれていれば不成立
    const onlyOneOpen = createGrid(Array(3).fill("..."));
    for (const [x, y] of [[0, 0], [0, 2]]) cellAt(onlyOneOpen, x, y).obstacle = { height: 0.75 };
    assert.ok(findDodgeCell(onlyOneOpen, attacker, target, []), "空きマスが1つあれば成立");
    const around = { id: "block", x: 0, y: 1, hp: 5 };
    assert.equal(
      findDodgeCell(onlyOneOpen, attacker, target, [around]), null,
      "唯一の逃げ先も他ユニットが占めていれば不成立"
    );
  }

  /* ドッジ: 攻撃そのものを無かったことにし、targetを間合いの外へ移す */
  {
    // 3x3だとfoe(2,1)は盤の端で逃げ場がない(attacker側と反対の列が無い)ので、
    // 逃げ先を確保できる広さの盤面で確認する
    const g = createGrid(Array(5).fill("....."));
    const r = resolveMelee({ attacker: atk, target: foe, units: [atk, foe], roll: () => 20, grid: g, guard: { type: "dodge" } });
    assert.equal(r.hit, false);
    assert.equal(r.damage, 0);
    assert.equal(r.reaction, "dodge", "逃げ先があれば出目20でも回避");
    assert.ok(r.dodgeTo, "移動先の座標が返る");
    assert.ok(!isAdjacent(r.dodgeTo, atk), "移動先はattackerと隣接しない");
  }

  /* いなす: 何度でも使え、ダメージを1点軽減するだけ */
  {
    const guard = { type: "deflect", used: false };
    const r1 = resolveMelee({ attacker: atk, target: foe, units: [atk, foe], roll: () => 12, guard });
    assert.equal(r1.hit, true);
    assert.equal(r1.damage, 2, "3-1に軽減されるだけで無効化はしない");
    assert.equal(r1.reaction, "deflect");
    // 2回目も同じguard(used未更新)でそのまま使える
    const r2 = resolveMelee({ attacker: atk, target: foe, units: [atk, foe], roll: () => 12, guard });
    assert.equal(r2.reaction, "deflect", "いなすは使い切らない");
  }

  /* パリィ: guard中1回だけ。成否にかかわらず使い切る */
  {
    const guard = { type: "parry", used: false };
    // 防御ロールも同じroll関数から取るので、命中判定(12)→防御判定(12)の順で2回呼ばれる
    const rolls = [12, 20];
    let i = 0;
    const roll = () => rolls[i++];
    const r = resolveMelee({ attacker: atk, target: foe, units: [atk, foe], roll, guard });
    assert.equal(r.reaction, "parry");
    assert.equal(r.hit, false, "防御ロールが成功すれば無効化");
    assert.equal(r.damage, 0);

    // 一度使ったら(呼び出し側でused=trueにした後は)発動しない
    guard.used = true;
    const after = resolveMelee({ attacker: atk, target: foe, units: [atk, foe], roll: () => 12, guard });
    assert.equal(after.reaction, null, "使い切った後は通常どおり命中する");
    assert.equal(after.hit, true);
  }

  /* カウンター: 防御ロール成功時だけ発動し、その時だけ使い切る */
  {
    const guard = { type: "counter", used: false };
    // 命中判定(12)→防御判定(11、失敗=defenseDc12未満)
    const failRolls = [12, 11];
    let fi = 0;
    const failed = resolveMelee({ attacker: atk, target: foe, units: [atk, foe], roll: () => failRolls[fi++], guard });
    assert.equal(failed.reaction, null, "防御ロール失敗時は発動しない");
    assert.equal(failed.hit, true, "発動しなければ通常どおり命中");
    assert.equal(guard.used, false, "失敗時は消費されない(呼び出し側もfalseのまま)");

    // 防御ロール成功(12)→反撃の出目(15)
    const okRolls = [12, 12, 15];
    let oi = 0;
    const ok = resolveMelee({ attacker: atk, target: foe, units: [atk, foe], roll: () => okRolls[oi++], guard });
    assert.equal(ok.reaction, "counter");
    assert.equal(ok.hit, false, "反撃成功時は元の攻撃を無効化");
    assert.ok(ok.counterRoll, "反撃の結果が返る");
    assert.equal(ok.counterRoll.hit, true, "出目15はdefenseDc12以上なので反撃命中");
    assert.equal(ok.counterRoll.damage, 2, "targetのatk(foe.atk=2)がそのまま反撃威力");
  }
}

/* --- 薙ぎ払い: 隣接する敵全員に、同じ1回分の出目で攻撃する --- */
{
  const attacker = { id: "gareth", side: "party", hp: 10, x: 1, y: 1, atk: 5, defenseDc: 12 };
  const near1 = { id: "e1", side: "enemy", hp: 8, x: 2, y: 1, defenseDc: 12 };
  const near2 = { id: "e2", side: "enemy", hp: 8, x: 0, y: 1, defenseDc: 12 };
  const far = { id: "e3", side: "enemy", hp: 8, x: 5, y: 5, defenseDc: 12 };

  assert.equal(resolveSweep({ attacker: { ...attacker, hp: 0 }, targets: [near1], roll: () => 20 }).reason, "attacker_down");
  assert.equal(resolveSweep({ attacker, targets: [far], roll: () => 20 }).reason, "no_targets", "隣接する敵がいなければ不成立");

  // 隣接する2体だけが対象になり、離れた相手は含まれない。全員が同じ出目で判定される
  const r = resolveSweep({ attacker, targets: [near1, near2, far], units: [attacker, near1, near2, far], roll: () => 15 });
  assert.equal(r.ok, true);
  assert.equal(r.results.length, 2, "隣接する2体だけが対象");
  assert.ok(r.results.every(x => x.d20 === r.d20), "全員が同じ出目で判定される");
  assert.ok(r.results.every(x => x.hit), "出目15は全員に命中(DC12)");
  assert.ok(r.results.every(x => x.damage === 3), "atk5の通常ダメージ5を0.6倍→3(集中攻撃より弱くする)");

  // 防御の構えは相手ごとに個別に効く。パリィの追加ロールは対象ごとに独立して消費される
  const guardedNear1 = { ...near1, guard: { type: "parry", used: false } };
  const rolls = [12, 20];   // 0: 共有の命中判定(出目12) / 1: near1のパリィ防御ロール(出目20で成功)
  let i = 0;
  const roll2 = () => rolls[i++];
  const guarded = resolveSweep({ attacker, targets: [guardedNear1, near2], units: [attacker, guardedNear1, near2], roll: roll2 });
  const r1 = guarded.results.find(x => x.target.id === "e1");
  const r2 = guarded.results.find(x => x.target.id === "e2");
  assert.equal(r1.reaction, "parry");
  assert.equal(r1.hit, false, "パリィが成功した相手は無効化される");
  assert.equal(r2.hit, true, "パリィを持たない相手は通常どおり被弾");
  assert.equal(r2.damage, 3, "他人のパリィとは無関係に、通常どおり0.6倍のダメージが入る");
}

/* --- 盤面の外形変形(角を削る/辺に切れ込み。丸かったり尖ったりする不定形) --- */
{
  // rngの出目を手で並べて、狙った分岐(角/切れ込み/変形なし)を強制する。
  // 境界の具体的な形は波の合成(waves/amp/phase/freq)で決まるため、
  // 1マス単位の厳密な位置までは断定せず、頑健に成り立つ性質だけを確認する
  const seq = vals => { let i = 0; return () => (i < vals.length ? vals[i++] : 0.5); };

  // 角(左上)を削る: kind→corner(0.1), corner→tl(0.1)。距離0の起点は
  // wobble(振幅は必ず1未満)より必ず小さいので、角そのものは必ず削られる
  {
    const g = createGrid(Array(10).fill(".".repeat(10)));
    carveShape(g, seq([0.1, 0.1]));
    assert.equal(cellAt(g, 0, 0).void, true, "角の起点は必ず削られる");
    assert.ok(g.cells.some(c => !c.void), "盤面全部が削られることはない");
  }

  // 上辺に切れ込み: kind→notch(0.4), edge→top(0.1)。切れ込みの中心は上辺の上に
  // 置かれるので、上辺(y=0)のどこかは必ず削られる
  {
    const g = createGrid(Array(10).fill(".".repeat(10)));
    carveShape(g, seq([0.4, 0.1]));
    assert.ok(g.cells.some((c, i) => c.void && Math.floor(i / g.w) === 0), "上辺のどこかが削られる");
  }

  // 変形なし: kind→none(0.9)
  {
    const g = createGrid(Array(8).fill("........"));
    carveShape(g, seq([0.9]));
    assert.ok(g.cells.every(c => !c.void), "変形なしを選べば何も削られない");
  }

  // keepClear(開始位置)は削らない
  {
    const g = createGrid(Array(10).fill(".".repeat(10)));
    carveShape(g, seq([0.1, 0.1]), { keepClear: [{ x: 0, y: 0 }] });
    assert.equal(cellAt(g, 0, 0).void, false, "keepClearのマスは削らない");
  }

  // 不定形であること(正確な長方形にはならない)を確認する。もし単純な矩形なら
  // 「削れたマスの外接矩形」＝「削れたマス自身」になるはずだが、波でゆらした境界は
  // 外接矩形の一部(角など)を必ず埋め残すので、外接矩形の面積より削れた数が少なくなる
  let shapedSeeds = 0;
  for (let seed = 1; seed <= 40 && shapedSeeds < 5; seed++) {
    const g = createGrid(Array(12).fill(".".repeat(12)));
    carveShape(g, makeRng(seed + 5050));
    const voids = [];
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (cellAt(g, x, y).void) voids.push({ x, y });
    if (voids.length < 4) continue;   // 変形なし、または小さすぎるものは形状判定をスキップ
    shapedSeeds++;
    const minX = Math.min(...voids.map(p => p.x)), maxX = Math.max(...voids.map(p => p.x));
    const minY = Math.min(...voids.map(p => p.y)), maxY = Math.max(...voids.map(p => p.y));
    const bboxArea = (maxX - minX + 1) * (maxY - minY + 1);
    assert.ok(voids.length < bboxArea, `seed${seed}: 不定形なので外接矩形を隙間なく埋めない`);
  }
  assert.ok(shapedSeeds >= 3, "十分な数のseedで実際に変形が発生している(形状判定できている)");

  // 多数のseedで不変条件を確認: keepClearは常に無傷で、両端は必ず行き来できる
  for (const seed of [1, 2, 3, 7, 42, 999, 12345]) {
    const g = createGrid(Array(8).fill("........"));
    const corners = [{ x: 0, y: 0 }, { x: 7, y: 7 }];
    carveShape(g, makeRng(seed), { keepClear: corners });
    for (const p of corners) assert.ok(isWalkable(g, p.x, p.y), `seed${seed}: keepClearは無傷`);
    const reach = reachableCells(g, corners[0], 999);
    assert.ok(
      reach.some(c => c.x === corners[1].x && c.y === corners[1].y),
      `seed${seed}: 変形後も両端が行き来できる`
    );
  }
}

/* --- 体当たり: 命中すれば押し出す。押し出せなければダメージ1点だけ --- */
{
  const atk = { id: "gareth", side: "party", hp: 10, x: 1, y: 1, atk: 3, defenseDc: 12 };
  const foe = { id: "rust", side: "enemy", hp: 8, x: 2, y: 1, defenseDc: 12 };

  // 外れれば何も起きない(通常の攻撃と同じ)
  const miss = resolveShove({ attacker: atk, target: foe, units: [atk, foe], roll: () => 11 });
  assert.equal(miss.hit, false);
  assert.equal(miss.pushedTo, null);

  // 命中・押し出し先が空いていれば、attacker→targetの延長線上へ押し出す
  const open = createGrid(Array(4).fill("...."));
  const pushed = resolveShove({ attacker: atk, target: foe, units: [atk, foe], roll: () => 15, grid: open });
  assert.equal(pushed.hit, true);
  assert.deepEqual(pushed.pushedTo, { x: 3, y: 1 });
  assert.equal(pushed.damage, 0, "押し出し成功時はダメージ無し");

  // 押し出し先が障害物(柱)で塞がっていれば、押し出せずダメージ1点だけ入る
  const walled = createGrid(Array(4).fill("...."));
  cellAt(walled, 3, 1).obstacle = { height: 1 };
  cellAt(walled, 3, 1).walkable = false;
  const blockedByWall = resolveShove({ attacker: atk, target: foe, units: [atk, foe], roll: () => 15, grid: walled });
  assert.equal(blockedByWall.pushedTo, null);
  assert.equal(blockedByWall.damage, 1, "押し出せない時はダメージ1点");

  // 押し出し先が他ユニットで塞がっていても同様
  const blocker = { id: "b", side: "enemy", hp: 5, x: 3, y: 1 };
  const blockedByUnit = resolveShove({ attacker: atk, target: foe, units: [atk, foe, blocker], roll: () => 15, grid: open });
  assert.equal(blockedByUnit.pushedTo, null);
  assert.equal(blockedByUnit.damage, 1);

  // 盤の端(押し出し先が盤外)でも同様に押し出せない
  const edgeFoe = { ...foe, x: 3, y: 1 };
  const atEdge = resolveShove({ attacker: { ...atk, x: 2, y: 1 }, target: edgeFoe, units: [atk, edgeFoe], roll: () => 15, grid: open });
  assert.equal(atEdge.pushedTo, null, "盤外へは押し出せない");

  // ドッジが成立していれば、体当たりも他の近接攻撃と同じくresolveMelee側で無効化される。
  // 3x3だとfoeが盤の端で逃げ場がないため、逃げ先を確保できる広さの盤面で確認する
  const dodgeGrid = createGrid(Array(5).fill("....."));
  const dodging = resolveShove({
    attacker: atk, target: foe, units: [atk, foe], roll: () => 20, grid: dodgeGrid, guard: { type: "dodge" }
  });
  assert.equal(dodging.hit, false);
  assert.equal(dodging.reaction, "dodge");
  assert.ok(dodging.dodgeTo, "ドッジ自体の移動先はそのまま返る");
  assert.equal(dodging.pushedTo, null, "ドッジで無効化された体当たりに押し出しは発生しない");
}

/* --- クリティカル狙い: crit/fumbleの範囲を広げて命中判定できる --- */
{
  const atk = { id: "gareth", side: "party", hp: 10, x: 1, y: 1, atk: 3, defenseDc: 12 };
  const foe = { id: "rust", side: "enemy", hp: 8, x: 2, y: 1, defenseDc: 12 };

  // 既定(critMin=20, fumbleMax=1)では出目18はただの命中判定(DC12は超えるので命中、クリティカルではない)
  const normal18 = resolveMelee({ attacker: atk, target: foe, units: [atk, foe], roll: () => 18 });
  assert.ok(normal18.hit && !normal18.crit, "既定では出目18はクリティカルにならない");

  // クリティカル狙い(critMin:18, fumbleMax:3)では出目18からクリティカル
  const aimed18 = resolveMelee({ attacker: atk, target: foe, units: [atk, foe], roll: () => 18, critMin: 18, fumbleMax: 3 });
  assert.ok(aimed18.hit && aimed18.crit, "クリティカル狙いなら出目18でクリティカル");
  assert.equal(aimed18.damage, 6, "クリティカルなのでatkの2倍");

  // 出目3は既定ならDC12を満たさない普通の外れだが、クリティカル狙いではファンブル扱いになる
  const normal3 = resolveMelee({ attacker: atk, target: foe, units: [atk, foe], roll: () => 3 });
  assert.ok(!normal3.hit && !normal3.fumble, "既定では出目3はただの外れ");
  const aimed3 = resolveMelee({ attacker: atk, target: foe, units: [atk, foe], roll: () => 3, critMin: 18, fumbleMax: 3 });
  assert.ok(!aimed3.hit && aimed3.fumble, "クリティカル狙いでは出目3もファンブル扱い");

  // 中間の出目(4〜17)は従来どおりDC判定のまま
  const mid = resolveMelee({ attacker: atk, target: foe, units: [atk, foe], roll: () => 12, critMin: 18, fumbleMax: 3 });
  assert.ok(mid.hit && !mid.crit && !mid.fumble, "範囲外の出目は通常どおりのDC判定");
}

/* --- 高低差 --- */
{
  // 平らな盤面に高さの違う瓦礫を手で置く。近接は8方向隣接でしか成立しないので、
  // 比較したい高さはすべて (0,0) の隣に並べる
  const g = createGrid(Array(4).fill("...."));
  const put = (x, y, h) => { cellAt(g, x, y).obstacle = { height: h }; };
  put(1, 0, 0.25);   // (0,0)から見て1段
  put(0, 1, 0.5);    // 2段
  put(1, 1, 0.75);   // 3段(斜め隣)

  assert.equal(elevationAt(g, 0, 0), 0, "何も無ければ0");
  assert.equal(elevationAt(g, 0, 1), 0.5, "瓦礫の上に立つ");
  assert.equal(elevationAt(g, 9, 9), 0, "盤外は0");

  // 柱(1.0)は進入できないので立ち位置の高さにはならない
  cellAt(g, 3, 3).obstacle = { height: 1 };
  cellAt(g, 3, 3).walkable = false;
  assert.equal(elevationAt(g, 3, 3), 0);

  const at = (x, y) => ({ x, y });
  assert.equal(heightSteps(g, at(1, 1), at(0, 0)), 3, "0.75の差は3段");
  assert.equal(heightSteps(g, at(0, 0), at(1, 1)), -3, "下から見上げれば-3段");
  assert.equal(heightSteps(g, at(1, 0), at(0, 0)), 1, "0.25の差は1段");
  assert.equal(heightSteps(g, at(0, 1), at(0, 1)), 0, "同じ高さなら0");

  /* --- 高低差が命中とダメージに効く --- */
  const mk = (id, side, x, y) => ({ id, side, x, y, hp: 10, atk: 3, defenseDc: 12 });

  // 同じ高さ: 出目11なら外れ、12なら命中
  const flat = { attacker: mk("a", "party", 0, 3), target: mk("b", "enemy", 1, 3), grid: g };
  assert.equal(resolveMelee({ ...flat, roll: () => 11 }).hit, false);
  assert.equal(resolveMelee({ ...flat, roll: () => 12 }).hit, true);

  // 1段高い所から: 出目11でも届く(補正+1)。威力は変わらない
  const high1 = { attacker: mk("a", "party", 1, 0), target: mk("b", "enemy", 0, 0), grid: g };
  const h1 = resolveMelee({ ...high1, roll: () => 11 });
  assert.equal(h1.steps, 1);
  assert.equal(h1.hit, true, "1段高いと出目11でも当たる");
  assert.equal(h1.heightDamage, 0, "1段程度では威力は変わらない");
  assert.equal(h1.damage, 3);

  // 2段高い所から: 命中補正に加えて威力も+1
  const high2 = { attacker: mk("a", "party", 0, 1), target: mk("b", "enemy", 0, 0), grid: g };
  const h2 = resolveMelee({ ...high2, roll: () => 12 });
  assert.equal(h2.steps, 2);
  assert.equal(h2.heightDamage, 1);
  assert.equal(h2.damage, 4, "3 + 1");

  // 2段低い所から: 当てにくく、威力も-1
  const low2 = { attacker: mk("a", "party", 0, 0), target: mk("b", "enemy", 0, 1), grid: g };
  assert.equal(resolveMelee({ ...low2, roll: () => 12 }).hit, false, "下からだと出目12では届かない");
  const l2 = resolveMelee({ ...low2, roll: () => 14 });
  assert.equal(l2.steps, -2);
  assert.equal(l2.heightDamage, -1);
  assert.equal(l2.damage, 2, "3 - 1");

  // 補正で下がってもダメージは1未満にならない
  const weak = { attacker: { ...mk("a", "party", 0, 0), atk: 1 }, target: mk("b", "enemy", 1, 1), grid: g };
  assert.ok(resolveMelee({ ...weak, roll: () => 20 }).damage >= 1, "命中したら最低1");

  // クリティカル・ファンブルは補正込みの値ではなく素の出目で決まる
  const critLow = resolveMelee({ ...low2, roll: () => 20 });
  assert.ok(critLow.crit, "下からでも出目20はクリティカル");
  const fumbleHigh = resolveMelee({ ...high2, roll: () => 1 });
  assert.ok(fumbleHigh.fumble && !fumbleHigh.hit, "上からでも出目1はファンブル");

  // gridを渡さなければ高低差は効かない(既存の呼び出しを壊さない)
  assert.equal(resolveMelee({ attacker: mk("a", "party", 0, 1), target: mk("b", "enemy", 0, 0), roll: () => 12 }).steps, 0);
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
  assert.equal(act.targetId, "gareth", "移動時も接近する目標を返す");
  const nearerMage = { id: "lydia", side: "party", hp: 10, agility: 5, x: 3, y: 1 };
  assert.equal(chooseEnemyAction(g, foe, [foe, farHero, nearerMage]).targetId, "lydia", "最も近い相手のIDを移動ログへ渡す");
  assert.equal(chooseMoveToward(g, hero, farHero, [hero, farHero]).type, "move", "相棒も指定した目標へ移動できる");

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

/* --- 通し戦闘: 誰も同じマスに重ならない --- */
{
  // 両陣営をAIで動かして最後まで戦わせ、全ターンを通じて
  // 「立っている2体が同じマスに居る」瞬間が一度も無いことを確かめる。
  // 倒れた駒は盤面から退く(その場のコインは塞がない)ので、生存者だけを見る
  for (const seed of [1, 77, 2026]) {
    const rng = makeRng(seed);
    const grid = scatterObstacles(
      createGrid(Array(8).fill("........")),
      makeRng(seed + 1),
      { pillars: 5, rubble: 6, keepClear: [{ x: 0, y: 3 }, { x: 7, y: 4 }] }
    );
    const units = [
      { id: "g", name: "g", side: "party", x: 0, y: 3, hp: 16, maxHp: 16, atk: 3, agility: 7, defenseDc: 12 },
      { id: "l", name: "l", side: "party", x: 0, y: 4, hp: 14, maxHp: 14, atk: 2, agility: 4, defenseDc: 12 },
      { id: "r1", name: "r1", side: "enemy", x: 7, y: 3, hp: 10, maxHp: 10, atk: 2, agility: 5, defenseDc: 12 },
      { id: "r2", name: "r2", side: "enemy", x: 7, y: 4, hp: 10, maxHp: 10, atk: 2, agility: 5, defenseDc: 12 }
    ];
    const roll = () => 1 + Math.floor(rng() * 20);

    const assertNoOverlap = where => {
      const seen = new Set();
      for (const u of units.filter(x => x.hp > 0)) {
        const k = u.x + "," + u.y;
        assert.ok(!seen.has(k), `seed${seed} ${where}: ${k} に複数のユニットが重なった`);
        seen.add(k);
        assert.ok(isWalkable(grid, u.x, u.y), `seed${seed} ${where}: 進入不可のマスに乗った`);
      }
    };

    assertNoOverlap("開始時");

    const order = turnOrder(units).map(u => u.id);
    for (let t = 0; t < 400; t++) {
      const alive = s => units.some(u => u.side === s && u.hp > 0);
      if (!alive("party") || !alive("enemy")) break;

      const self = units.find(u => u.id === order[t % order.length]);
      if (!self || self.hp <= 0) continue;

      const act = chooseEnemyAction(grid, self, units);   // 両陣営とも同じAIで動かす
      if (act.type === "move") {
        self.x = act.to.x;
        self.y = act.to.y;
      } else if (act.type === "attack") {
        const target = units.find(u => u.id === act.targetId);
        const r = resolveMelee({ attacker: self, target, units, roll });
        if (r.ok && r.hit) target.hp = Math.max(0, target.hp - r.damage);
      }
      assertNoOverlap(`ターン${t}`);
    }
  }
}

console.log("battle/core: 全チェック通過");
