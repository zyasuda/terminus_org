/* =========================================================
   戦闘結果の状態反映ロジック(BattleView.jsxから機械的に切り出し)

   resolveMelee/resolveSweep/resolveShoveが確定させた「何が起きたか」を、
   実際のunits/coins/logへ反映する層。Reactに一切依存しない純粋関数なので、
   素のnodeでテストできる(core.test.mjsと同じ流儀)。

   ロジックはBattleView.jsxにあった時のままで、置き場所を変えただけ
   (挙動は変えていない)。
   ========================================================= */

import { cellAt } from "./core.js";

// 防御の構え。仕様: docs/BATTLE_GRID_STATUS.md「防御・リアクション」節。
// deflect(内部の識別子)の表示名は「いなす」。「パリィ」と紛らわしいとの指摘で
// 「受け流し」から改名したが、type自体は変えていない(表示名だけの変更)
export const GUARD_LABEL = { parry: "パリィ", deflect: "いなす", counter: "カウンター", dodge: "ドッジ" };

// ダメージ適用の共通処理(通常の攻撃とカウンターの反撃で使い回す)。
// 倒れた場合はその場にコインを残す(既存の「戦闘不能はコインになる」仕様と同じ)
export const applyDamage = (units, coins, id, damage) => {
  const cur = units.find(u => u.id === id);
  const hp = Math.max(0, cur.hp - damage);
  const downed = hp <= 0;
  return {
    units: units.map(u => (u.id === id ? { ...u, hp } : u)),
    coins: downed ? [...coins, { id: "coin_" + id, x: cur.x, y: cur.y }] : coins,
    hp, cur, downed
  };
};

// 防御が成功した(=攻撃を防いだ/軽減した)場合だけ「◯◯、成功。」と明示する。
// 失敗はダメージが入ること自体で分かるので、あえて「失敗」とは書かない
const tag = label => `${GUARD_LABEL[label]}、成功。`;

// resolveMelee/resolveSweepの1体ぶんの結果を状態へ適用する共通処理。
// 通常攻撃(1対1)でも薙ぎ払い(1対多)でも、相手ごとにこの処理をそのまま使い回す
export const applyMeleeResult = (units, coins, attacker, target, r) => {
  // dodge/deflect/counterは発動した時点で必ず成功、parryだけ「試みたが外れた
  // (=通常命中のまま)」場合があるので!hitで判定する
  const highNote = r.steps > 0 ? "高い所から打ち下ろす。" : r.steps < 0 ? "見上げる形で分が悪い。" : "";
  // パリィ・カウンターはguard中1回だけ。成否にかかわらず(パリィ)/成功時のみ(カウンター)
  // resolveMelee側がreactionを返した時点で使い切ったということなので、ここでusedを立てる
  const guardSpent = r.reaction === "parry" || r.reaction === "counter";

  // 自分が行動した(攻撃した)ので、攻撃側が持っていた古い構えはここで解ける
  units = units.map(u => {
    if (u.id === attacker.id && u.guard) return { ...u, guard: null };
    if (guardSpent && u.id === target.id) return { ...u, guard: { ...u.guard, used: true } };
    return u;
  });
  const lines = [];

  if (r.reaction === "dodge") {
    // 避けるだけでなく、攻撃側の間合いの外まで実際に移動する(resolveMelee側で
    // 「隣接しなくなる先」を探した上で成立させているので、必ず有効な座標が入っている)
    units = units.map(u => (u.id === target.id ? { ...u, x: r.dodgeTo.x, y: r.dodgeTo.y } : u));
    lines.push(`${tag("dodge")}${target.name}は${attacker.name}の間合いの外へ跳び退いた。`);
    return { units, coins, lines };
  }

  if (r.reaction === "parry" && !r.hit) {
    lines.push(`${tag("parry")}${target.name}が受け止めた!${attacker.name}の攻撃は届かなかった(d20=${r.d20})。`);
    return { units, coins, lines };
  }

  if (r.reaction === "counter") {
    lines.push(`${tag("counter")}${target.name}が防御と同時に反撃に転じた。`);
    const before = units.find(u => u.id === attacker.id);
    if (r.counterRoll.hit) {
      const applied = applyDamage(units, coins, attacker.id, r.counterRoll.damage);
      units = applied.units; coins = applied.coins;
      lines.push(`${attacker.name}に${r.counterRoll.damage}ダメージ(残りHP ${applied.hp}/${before.maxHp})。`);
      if (applied.downed) lines.push(`${attacker.name}は倒れた。落とした物がその場に残っている。`);
    } else {
      lines.push("反撃は外れた。");
    }
    return { units, coins, lines };
  }

  if (!r.hit) {
    // ここに来るのは通常の外れ、またはパリィを試みたが防御ロールに失敗した場合
    lines.push(`${attacker.name}の攻撃は${r.fumble ? "大きく外れ、体勢を崩した" : "外れた"}(d20=${r.d20})。${highNote}`);
    return { units, coins, lines };
  }

  // 体当たり(resolveShove)の結果。pushedToキーの有無で判別する(通常のresolveMeleeは
  // このキーを持たない)。命中した場合のみここへ来る(外れ・防御成功は上のreturnで抜けている)
  if ("pushedTo" in r) {
    if (r.pushedTo) {
      units = units.map(u => (u.id === target.id ? { ...u, x: r.pushedTo.x, y: r.pushedTo.y } : u));
      lines.push(`${attacker.name}の体当たりが決まり、${target.name}を弾き飛ばした(d20=${r.d20})。`);
      return { units, coins, lines };
    }
    const applied = applyDamage(units, coins, target.id, r.damage);
    units = applied.units; coins = applied.coins;
    lines.push(`${attacker.name}の体当たりは押し出せず、${target.name}に${r.damage}ダメージ(残りHP ${applied.hp}/${applied.cur.maxHp})。`);
    if (applied.downed) lines.push(`${target.name}は倒れた。落とした物がその場に残っている。`);
    return { units, coins, lines };
  }

  const applied = applyDamage(units, coins, target.id, r.damage);
  units = applied.units; coins = applied.coins;
  lines.push(
    `${attacker.name}の攻撃が${r.crit ? "深々と" : ""}命中(d20=${r.d20})。` +
    `${target.name}に${r.damage}ダメージ(残りHP ${applied.hp}/${applied.cur.maxHp})。` +
    (r.reaction === "deflect" ? tag("deflect") : "") +
    (r.surround >= 2 ? `${r.surround}人で囲んでいる(×${r.multiplier.toFixed(2)})。` : "") +
    highNote
  );
  if (applied.downed) lines.push(`${target.name}は倒れた。落とした物がその場に残っている。`);
  return { units, coins, lines };
};

// 手番の開始時点を控えておき、「やり直す」で丸ごと戻せるようにする。
// 状態はすべて作り直して差し替えているので、参照を持っておくだけで十分
export const snapshotOf = s => ({ units: s.units, coins: s.coins, purse: s.purse, hasMoved: false, log: s.log });

// 手番を次の生存ユニットへ進める。1周しても誰も生きていなければ現状維持
export const advanceTurn = s => {
  for (let i = 1; i <= s.order.length; i++) {
    const next = (s.turn + i) % s.order.length;
    const u = s.units.find(x => x.id === s.order[next]);
    if (u && u.hp > 0) return { ...s, turn: next, hasMoved: false, snapshot: snapshotOf(s) };
  }
  return s;
};

// 移動を状態へ反映する。通り道のコイン回収・水溜り検知・guard解除・hasMovedを含む。
// pathは起点を除いた通り道(既定は目的地のみの1マス)
export const applyMoveResult = (s, unit, x, y, path = [{ x, y }]) => {
  const walked = new Set(path.map(p => p.x + "," + p.y));
  const picked = s.coins.filter(c => walked.has(c.x + "," + c.y));
  // 水溜りを踏んだかどうかは演出上の一言だけ。移動力の消費自体はreachableCellsが
  // 既に織り込んでいるので、ここで何かを差し引く必要はない
  const splashed = path.some(p => cellAt(s.grid, p.x, p.y)?.terrain?.type === "water");
  const lines = [];
  if (splashed) lines.push(`${unit.name}は水溜りに足を取られながら進んだ。`);
  if (picked.length) lines.push(`${unit.name}が落ちていた物を${picked.length}つ拾った。`);
  return {
    ...s,
    // 移動したので、持っていた古い構えはここで解ける(guardは選び直さない限り引き継がない)
    units: s.units.map(u => (u.id === unit.id ? { ...u, x, y, guard: null } : u)),
    coins: s.coins.filter(c => !picked.includes(c)),
    purse: s.purse + picked.length,
    hasMoved: true,
    log: lines.length ? [...s.log, ...lines] : s.log
  };
};

// 薙ぎ払い(resolveSweep、1回の出目で複数対象)の結果をまとめて状態へ適用する。
// 先頭に「◯◯が薙ぎ払った」の一文を足し、対象ごとの結果はapplyMeleeResultで積む
export const applySweepResult = (units, coins, attacker, sr) => {
  let curUnits = units, curCoins = coins;
  const lines = [`${attacker.name}が薙ぎ払った(d20=${sr.d20})。`];
  for (const res of sr.results) {
    const applied = applyMeleeResult(curUnits, curCoins, attacker, res.target, res);
    curUnits = applied.units; curCoins = applied.coins;
    lines.push(...applied.lines);
  }
  return { units: curUnits, coins: curCoins, lines };
};
