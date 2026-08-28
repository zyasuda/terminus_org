import { assignObstacleShapes, canOccupyCell, chooseMoveToward, createGrid, makeRng, resolveRanged, scatterObstacles } from "../battle/core.js";
import { EXPEDITION_BATTLE_CONFIG } from "./battleConfig.js";

const openRows = ({ width, height }) => Array.from({ length: height }, () => ".".repeat(width));
// guardianはboolean(true/false)とレイアウト名文字列("guardian"/"junction"/"corridor")の
// 両方の呼び出し規約が混在しているため、両方を受け付ける。
const layoutName = layout => layout === true || layout === "guardian" ? "guardian" : layout === "junction" ? "junction" : "corridor";
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

// チェビシェフ距離で最も近い生存者。射程判定と同じ距離の測り方に合わせる。
export const nearestAlive = (unit, units) => units.filter(u => u.hp > 0).reduce(
  (best, u) => !best || Math.max(Math.abs(u.x - unit.x), Math.abs(u.y - unit.y)) < Math.max(Math.abs(best.x - unit.x), Math.abs(best.y - unit.y)) ? u : best,
  null,
);

// 相棒(リディア)の戦術判断。敵AIの chooseEnemyAction と同じく、判定だけを返して演出はしない。
//
// 2026-08-25、リディアはプレイヤーが直接操作するようになったので、ここは誰からも呼ばれていない。
// 消していないのは、オートバトルを選べるようにする案が残っているため。判定と下のテストは
// そのまま生きているので、ExpeditionBattle.jsxから呼び直せば元の挙動に戻る。
// 戻さないと決めたら、この関数と battleState.test.mjs の「相棒の戦術判断」節、
// battleConfig.js の companion.lowHpRetreatRatio をまとめて消すこと。
// roll:()=>20 は「当たれば必ず命中する目」で撃てるかどうかだけを試す射線・射程の検査であり、
// 実際のダメージ判定には使わない。
export function chooseCompanionAction({ grid, units, mage, command }) {
  const enemy = nearestAlive(mage, units.filter(u => u.side === "enemy"));
  const canCast = !!enemy && resolveRanged({ attacker: mage, target: enemy, units, grid, roll: () => 20 }).ok;
  const approach = (target, moveLine, waitLine) => {
    const to = chooseMoveToward(grid, mage, target, units);
    return to.type === "move" ? { type: "move", to: to.to, line: moveLine } : { type: "wait", line: waitLine };
  };
  // 入口側は盤面の西端。敵の位置に関係なく退がる。
  const retreat = (moveLine, waitLine) => approach({ x: 0, y: mage.y }, moveLine, waitLine);

  // HPが閾値を割ったら、相棒指示に関わらず自ら後退する(自律判断)。
  // 既に"retreat"を指示中なら、下の通常の退却分岐と同じ動きになるのでそちらへ委ねる。
  const lowHp = mage.hp <= (mage.maxHp ?? mage.hp) * EXPEDITION_BATTLE_CONFIG.companion.lowHpRetreatRatio;
  if (lowHp && command !== "retreat") {
    return retreat("リディアは傷を負い、自ら後退した。", "リディアは傷を負い、退路を探している。");
  }

  if (command === "retreat") {
    return retreat("リディアは入口側へ退却した。", "リディアは退却路を探している。");
  }
  if (command === "guard") {
    if (canCast) return { type: "cast", targetId: enemy.id };
    return approach(units.find(u => u.id === "hero"), "リディアは前衛を護衛する位置へ移動した。", "リディアは前衛のそばで護衛している。");
  }
  if (canCast) return { type: "cast", targetId: enemy.id };
  if (enemy) return approach(enemy, "リディアは魔法の射程へ移動した。", "リディアは魔法の射程を探している。");
  return { type: "none" };
}

export function createExpeditionBattleLayout(layout, seed = 0) {
  const rng = makeRng(seed);
  const board = EXPEDITION_BATTLE_CONFIG.board[layoutName(layout)];
  const partySlots = board.partySlots.map(slot => ({ ...slot }));
  const swap = Math.floor(rng() * partySlots.length); // Fisher-Yatesの2要素版
  [partySlots[partySlots.length - 1], partySlots[swap]] = [partySlots[swap], partySlots[partySlots.length - 1]];
  // 敵は1体が既定。board.enemyStart2があれば(通路戦)2体目もそこから出す。
  const enemyStarts = board.enemyStart2 ? [board.enemyStart, board.enemyStart2] : [board.enemyStart];
  const starts = {
    hero: partySlots[0], mage: partySlots[1],
    enemy: { ...board.enemyStart },   // 後方互換: 1体目の座標(junction/guardianはこれだけを使う)
    enemies: enemyStarts.map(pos => ({ ...pos })),
  };
  const grid = gridFor(board);
  const { min, max, rampHeight, rampChance } = EXPEDITION_BATTLE_CONFIG.board.obstacles;
  const partyMovement = { maxStep: EXPEDITION_BATTLE_CONFIG.movement.maxStep };
  scatterObstacles(grid, rng, {
    count: min + Math.floor(rng() * (max - min + 1)),
    keepClear: [starts.hero, starts.mage, ...starts.enemies],
    rampHeight,
    rampChance,
    // 味方が高いブロックで分断されないよう、通常キャラの経路で生成時に接続を確認する。
    canTraverse: (x, y, from) => canOccupyCell(grid, x, y, partyMovement, from),
  });
  const keepClear = [starts.hero, starts.mage, ...starts.enemies];
  const traverse = (x, y, from) => canOccupyCell(grid, x, y, partyMovement, from);
  // 形は最後に決める。法面は隣に0.5があるかを見るので、全部置き終わってからでないと決まらない
  assignObstacleShapes(grid, rng, { keepClear, canTraverse: traverse });
  return { grid, starts };
}
