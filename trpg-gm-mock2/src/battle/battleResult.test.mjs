/* battleResult.jsの特性テスト(characterization test)。

   BattleView.jsxにあったapplyDamage/applyMeleeResultを機械的に移しただけの
   段階で、現状の挙動を固定する。resolveMelee/resolveSweep/resolveShoveが
   実際に返す形の結果オブジェクト(r)を手で組み立てて、状態への反映(units/coins)と
   ログ文言が現状どおりであることを確認する。resolveMelee自体の判定ロジックは
   core.test.mjsで別途検証済みなので、ここでは「結果オブジェクトを受け取った後」
   だけを見る。

   実行: node src/battle/battleResult.test.mjs */

import assert from "node:assert/strict";
import {
  GUARD_LABEL, applyDamage, applyMeleeResult, snapshotOf, advanceTurn, applyMoveResult, applySweepResult
} from "./battleResult.js";
import { createGrid, cellAt } from "./core.js";

const mkUnit = (id, over = {}) => ({
  id, name: id, side: "party", x: 0, y: 0, hp: 10, maxHp: 10, atk: 3, defenseDc: 12, ...over
});

/* --- GUARD_LABEL --- */
{
  assert.equal(GUARD_LABEL.parry, "パリィ");
  assert.equal(GUARD_LABEL.deflect, "いなす");
  assert.equal(GUARD_LABEL.counter, "カウンター");
  assert.equal(GUARD_LABEL.dodge, "ドッジ");
}

/* --- applyDamage --- */
{
  const units = [mkUnit("a", { hp: 10 })];
  const r1 = applyDamage(units, [], "a", 3);
  assert.equal(r1.hp, 7);
  assert.equal(r1.downed, false);
  assert.equal(r1.coins.length, 0, "生存していればコインは増えない");
  assert.equal(r1.units.find(u => u.id === "a").hp, 7);

  const r2 = applyDamage(units, [], "a", 15);
  assert.equal(r2.hp, 0, "0未満にはならない");
  assert.equal(r2.downed, true);
  assert.equal(r2.coins.length, 1, "倒れたらコインが1つ増える");
  assert.equal(r2.coins[0].id, "coin_a");
  assert.deepEqual({ x: r2.coins[0].x, y: r2.coins[0].y }, { x: units[0].x, y: units[0].y });
}

/* --- applyMeleeResult: 通常の命中/外れ --- */
{
  const attacker = mkUnit("atk", { name: "ガレス" });
  const target = mkUnit("tgt", { name: "錆喰い", side: "enemy" });

  const hit = { ok: true, hit: true, crit: false, fumble: false, d20: 15, damage: 3, steps: 0, surround: 1, multiplier: 1, reaction: null };
  const res = applyMeleeResult([attacker, target], [], attacker, target, hit);
  assert.equal(res.lines.length, 1);
  assert.equal(res.lines[0], "ガレスの攻撃が命中(d20=15)。錆喰いに3ダメージ(残りHP 7/10)。");
  assert.equal(res.units.find(u => u.id === "tgt").hp, 7);

  const crit = { ...hit, crit: true, damage: 6 };
  const critRes = applyMeleeResult([attacker, target], [], attacker, target, crit);
  assert.ok(critRes.lines[0].startsWith("ガレスの攻撃が深々と命中"), "クリティカルは「深々と」が付く");

  const miss = { ok: true, hit: false, crit: false, fumble: false, d20: 8, damage: 0, steps: 0, surround: 0, multiplier: 1, reaction: null };
  const missRes = applyMeleeResult([attacker, target], [], attacker, target, miss);
  assert.equal(missRes.lines[0], "ガレスの攻撃は外れた(d20=8)。");

  const fumble = { ...miss, fumble: true, d20: 1 };
  const fumbleRes = applyMeleeResult([attacker, target], [], attacker, target, fumble);
  assert.equal(fumbleRes.lines[0], "ガレスの攻撃は大きく外れ、体勢を崩した(d20=1)。");
}

/* --- 高低差・包囲の言い添え --- */
{
  const attacker = mkUnit("atk", { name: "ガレス" });
  const target = mkUnit("tgt", { name: "錆喰い", side: "enemy" });
  const base = { ok: true, hit: true, crit: false, fumble: false, d20: 12, damage: 3, reaction: null };

  const highRes = applyMeleeResult([attacker, target], [], attacker, target, { ...base, steps: 2, surround: 1, multiplier: 1 });
  assert.ok(highRes.lines[0].endsWith("高い所から打ち下ろす。"), "高い位置からの攻撃には言い添えが付く");

  const lowRes = applyMeleeResult([attacker, target], [], attacker, target, { ...base, steps: -2, surround: 1, multiplier: 1 });
  assert.ok(lowRes.lines[0].endsWith("見上げる形で分が悪い。"), "低い位置からの攻撃には言い添えが付く");

  const surroundRes = applyMeleeResult([attacker, target], [], attacker, target, { ...base, steps: 0, surround: 2, multiplier: 1.33 });
  assert.ok(surroundRes.lines[0].includes("2人で囲んでいる(×1.33)。"), "2人以上の包囲だけ言い添えが付く");

  const soloRes = applyMeleeResult([attacker, target], [], attacker, target, { ...base, steps: 0, surround: 1, multiplier: 1 });
  assert.ok(!soloRes.lines[0].includes("囲んでいる"), "1人だけなら包囲の言い添えは付かない");
}

/* --- いなす(deflect): ダメージ行に「いなす、成功。」が付く --- */
{
  const attacker = mkUnit("atk", { name: "ガレス" });
  const target = mkUnit("tgt", { name: "リディア", guard: { type: "deflect", used: false } });
  const r = { ok: true, hit: true, crit: false, fumble: false, d20: 12, damage: 2, steps: 0, surround: 1, multiplier: 1, reaction: "deflect" };
  const res = applyMeleeResult([attacker, target], [], attacker, target, r);
  assert.ok(res.lines[0].includes("いなす、成功。"));
  // いなすは使い切らない(used更新なし、guardはそのまま残る)
  const updatedTarget = res.units.find(u => u.id === "tgt");
  assert.deepEqual(updatedTarget.guard, { type: "deflect", used: false }, "いなすはguardを消費しない");
}

/* --- パリィ成功: 専用行になり、guardが使い切られる --- */
{
  const attacker = mkUnit("atk", { name: "ガレス" });
  const target = mkUnit("tgt", { name: "リディア", guard: { type: "parry", used: false } });
  const r = { ok: true, hit: false, crit: false, fumble: false, d20: 18, reaction: "parry" };
  const res = applyMeleeResult([attacker, target], [], attacker, target, r);
  assert.equal(res.lines.length, 1);
  assert.equal(res.lines[0], "パリィ、成功。リディアが受け止めた!ガレスの攻撃は届かなかった(d20=18)。");
  assert.equal(res.units.find(u => u.id === "tgt").guard.used, true, "パリィは発動した時点で使い切る");
}

/* --- パリィ失敗(試みたが防御ロールに失敗、通常命中のまま): guardは使い切るがタグは出ない --- */
{
  const attacker = mkUnit("atk", { name: "ガレス" });
  const target = mkUnit("tgt", { name: "リディア", guard: { type: "parry", used: false } });
  const r = { ok: true, hit: true, crit: false, fumble: false, d20: 12, damage: 3, steps: 0, surround: 1, multiplier: 1, reaction: "parry" };
  const res = applyMeleeResult([attacker, target], [], attacker, target, r);
  assert.ok(!res.lines[0].includes("パリィ"), "パリィ失敗時は通常のダメージ行のまま(タグなし)");
  assert.equal(res.units.find(u => u.id === "tgt").guard.used, true, "試みた時点で成否にかかわらず使い切る");
}

/* --- カウンター成功: 専用行+反撃のダメージ行 --- */
{
  const attacker = mkUnit("atk", { name: "ガレス", hp: 10, maxHp: 10 });
  const target = mkUnit("tgt", { name: "リディア", guard: { type: "counter", used: false }, atk: 2 });
  const r = {
    ok: true, hit: false, crit: false, fumble: false, d20: 18, reaction: "counter",
    counterRoll: { hit: true, crit: false, damage: 2 }
  };
  const res = applyMeleeResult([attacker, target], [], attacker, target, r);
  assert.equal(res.lines[0], "カウンター、成功。リディアが防御と同時に反撃に転じた。");
  assert.equal(res.lines[1], "ガレスに2ダメージ(残りHP 8/10)。");
  assert.equal(res.units.find(u => u.id === "atk").hp, 8);
  assert.equal(res.units.find(u => u.id === "tgt").guard.used, true);
}

/* --- カウンター成功だが反撃自体は外れる --- */
{
  const attacker = mkUnit("atk", { name: "ガレス" });
  const target = mkUnit("tgt", { name: "リディア", guard: { type: "counter", used: false } });
  const r = {
    ok: true, hit: false, crit: false, fumble: false, d20: 18, reaction: "counter",
    counterRoll: { hit: false, crit: false, damage: 0 }
  };
  const res = applyMeleeResult([attacker, target], [], attacker, target, r);
  assert.equal(res.lines[1], "反撃は外れた。");
  assert.equal(res.units.find(u => u.id === "atk").hp, 10, "反撃が外れればダメージは入らない");
}

/* --- カウンターで攻撃側が倒れる --- */
{
  const attacker = mkUnit("atk", { name: "ガレス", hp: 2, maxHp: 10 });
  const target = mkUnit("tgt", { name: "リディア", guard: { type: "counter", used: false } });
  const r = {
    ok: true, hit: false, crit: false, fumble: false, d20: 18, reaction: "counter",
    counterRoll: { hit: true, crit: false, damage: 5 }
  };
  const res = applyMeleeResult([attacker, target], [], attacker, target, r);
  assert.ok(res.lines.some(l => l === "ガレスは倒れた。落とした物がその場に残っている。"));
  assert.equal(res.coins.length, 1);
  assert.equal(res.coins[0].id, "coin_atk");
}

/* --- ドッジ成功: 対象を実際に移動させる --- */
{
  const attacker = mkUnit("atk", { name: "ガレス" });
  const target = mkUnit("tgt", { name: "錆喰い", side: "enemy", x: 3, y: 3, guard: { type: "dodge", used: false } });
  const r = { ok: true, hit: false, reaction: "dodge", dodgeTo: { x: 5, y: 3 } };
  const res = applyMeleeResult([attacker, target], [], attacker, target, r);
  assert.equal(res.lines[0], "ドッジ、成功。錆喰いはガレスの間合いの外へ跳び退いた。");
  const moved = res.units.find(u => u.id === "tgt");
  assert.deepEqual({ x: moved.x, y: moved.y }, { x: 5, y: 3 });
}

/* --- 体当たり: 押し出し成功 --- */
{
  const attacker = mkUnit("atk", { name: "ガレス" });
  const target = mkUnit("tgt", { name: "錆喰い", side: "enemy", x: 4, y: 3 });
  const r = { ok: true, hit: true, crit: false, fumble: false, d20: 15, damage: 0, pushedTo: { x: 5, y: 3 } };
  const res = applyMeleeResult([attacker, target], [], attacker, target, r);
  assert.equal(res.lines[0], "ガレスの体当たりが決まり、錆喰いを弾き飛ばした(d20=15)。");
  const moved = res.units.find(u => u.id === "tgt");
  assert.deepEqual({ x: moved.x, y: moved.y }, { x: 5, y: 3 }, "押し出し成功時は座標が更新される");
}

/* --- 体当たり: 押し出せず、ダメージ1点だけ --- */
{
  const attacker = mkUnit("atk", { name: "ガレス" });
  const target = mkUnit("tgt", { name: "錆喰い", side: "enemy", hp: 10, maxHp: 10 });
  const r = { ok: true, hit: true, crit: false, fumble: false, d20: 15, damage: 1, pushedTo: null };
  const res = applyMeleeResult([attacker, target], [], attacker, target, r);
  assert.equal(res.lines[0], "ガレスの体当たりは押し出せず、錆喰いに1ダメージ(残りHP 9/10)。");
  assert.equal(res.units.find(u => u.id === "tgt").hp, 9);
}

/* --- 倒れた相手はコインを落とし、専用の一文が付く(通常攻撃) --- */
{
  const attacker = mkUnit("atk", { name: "ガレス" });
  const target = mkUnit("tgt", { name: "錆喰い", side: "enemy", hp: 3, maxHp: 10, x: 2, y: 2 });
  const r = { ok: true, hit: true, crit: false, fumble: false, d20: 15, damage: 5, steps: 0, surround: 1, multiplier: 1, reaction: null };
  const res = applyMeleeResult([attacker, target], [], attacker, target, r);
  assert.ok(res.lines.some(l => l === "錆喰いは倒れた。落とした物がその場に残っている。"));
  assert.equal(res.coins.length, 1);
  assert.deepEqual({ x: res.coins[0].x, y: res.coins[0].y }, { x: 2, y: 2 });
}

/* --- 行動した側(攻撃側)の古い構えは、反応の種類にかかわらず解ける --- */
{
  const attacker = mkUnit("atk", { name: "ガレス", guard: { type: "dodge", used: false } });
  const target = mkUnit("tgt", { name: "錆喰い", side: "enemy" });
  const r = { ok: true, hit: true, crit: false, fumble: false, d20: 15, damage: 3, steps: 0, surround: 1, multiplier: 1, reaction: null };
  const res = applyMeleeResult([attacker, target], [], attacker, target, r);
  assert.equal(res.units.find(u => u.id === "atk").guard, null, "攻撃した側の古い構えは解ける");
}

/* --- advanceTurn: 手番を次の生存ユニットへ進める --- */
{
  const units = [
    mkUnit("a", { hp: 10 }), mkUnit("b", { hp: 0 }), mkUnit("c", { hp: 10 })
  ];
  const s = { order: ["a", "b", "c"], turn: 0, units, coins: [], purse: 0, log: ["戦闘開始。"] };
  const next = advanceTurn(s);
  assert.equal(next.turn, 2, "戦闘不能のbを飛ばしてcへ進む");
  assert.equal(next.hasMoved, false);
  assert.deepEqual(next.snapshot, snapshotOf(s), "手番開始時点のスナップショットが控えられる");

  // 誰も生きていなければ現状維持
  const allDown = { order: ["a", "b"], turn: 0, units: [mkUnit("a", { hp: 0 }), mkUnit("b", { hp: 0 })], coins: [], purse: 0, log: [] };
  assert.equal(advanceTurn(allDown), allDown, "生存者がいなければ状態はそのまま");

  // 1周して自分自身に戻ってくる場合もそのまま進める(1人だけ生存のケース)
  const soloAlive = { order: ["a", "b"], turn: 0, units: [mkUnit("a", { hp: 10 }), mkUnit("b", { hp: 0 })], coins: [], purse: 0, log: [] };
  assert.equal(advanceTurn(soloAlive).turn, 0, "生存者が自分しかいなければ自分の番のまま");
}

/* --- applyMoveResult: コイン回収・水溜り検知・guard解除・hasMoved --- */
{
  const grid = createGrid(Array(3).fill("....."));
  cellAt(grid, 2, 0).terrain = { type: "water", moveCost: 2 };
  const unit = mkUnit("gareth", { name: "ガレス", x: 0, y: 0, guard: { type: "dodge", used: false } });
  const other = mkUnit("lydia", { name: "リディア", x: 4, y: 4 });
  const coinOnPath = { id: "coin_1", x: 1, y: 0 };
  const coinElsewhere = { id: "coin_2", x: 4, y: 4 };
  const s = { grid, units: [unit, other], coins: [coinOnPath, coinElsewhere], purse: 0, log: ["戦闘開始。"] };

  const path = [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }];
  const res = applyMoveResult(s, unit, 3, 0, path);

  const moved = res.units.find(u => u.id === "gareth");
  assert.deepEqual({ x: moved.x, y: moved.y }, { x: 3, y: 0 }, "目的地へ移動する");
  assert.equal(moved.guard, null, "移動したら古い構えは解ける");
  assert.equal(res.hasMoved, true);
  assert.equal(res.purse, 1, "通り道のコインを拾う");
  assert.deepEqual(res.coins, [coinElsewhere], "拾ったコインは盤面から消える");
  assert.ok(res.log.some(l => l.includes("水溜りに足を取られながら進んだ")), "水溜りを通ると一言添える");
  assert.ok(res.log.some(l => l.includes("落ちていた物を1つ拾った")));

  // コインが無く、水溜りも通らない移動はログが増えない
  const plainPath = [{ x: 0, y: 1 }];
  const plainRes = applyMoveResult({ ...s, coins: [] }, unit, 0, 1, plainPath);
  assert.equal(plainRes.log.length, s.log.length, "何も起きなければログは増えない");
}

/* --- applySweepResult: 複数対象をまとめて適用し、先頭に薙ぎ払いの一文を足す --- */
{
  const attacker = mkUnit("atk", { name: "ガレス" });
  const t1 = mkUnit("t1", { name: "錆喰い", side: "enemy" });
  const t2 = mkUnit("t2", { name: "錆喰い(2)", side: "enemy" });
  const sr = {
    d20: 15,
    results: [
      { target: t1, ok: true, hit: true, crit: false, fumble: false, d20: 15, damage: 2, steps: 0, surround: 1, multiplier: 1, reaction: null },
      { target: t2, ok: true, hit: false, crit: false, fumble: false, d20: 15, damage: 0, steps: 0, surround: 1, multiplier: 1, reaction: null }
    ]
  };
  const res = applySweepResult([attacker, t1, t2], [], attacker, sr);
  assert.equal(res.lines[0], "ガレスが薙ぎ払った(d20=15)。");
  assert.equal(res.lines[1], "ガレスの攻撃が命中(d20=15)。錆喰いに2ダメージ(残りHP 8/10)。");
  assert.equal(res.lines[2], "ガレスの攻撃は外れた(d20=15)。");
  assert.equal(res.units.find(u => u.id === "t1").hp, 8);
  assert.equal(res.units.find(u => u.id === "t2").hp, 10, "外れた相手のHPは変わらない");
}

console.log("battle/battleResult: 全チェック通過");
