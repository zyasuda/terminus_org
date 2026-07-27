/* =========================================================
   戦闘グリッド 中核ロジック(Phase 1)
   仕様: docs/BATTLE_GRID_DESIGN.md

   この層は「盤面の事実」だけを確定する純粋関数群である。
   Three.js・React・LLM・localStorageに一切依存しない(nodeだけでテストできる)。

   現行の物語シーンと同じ大原則を引き継ぐ:
     - 移動可否・命中・ダメージ・包囲倍率を確定するのはシステム(この層)だけ
     - GMの語りと画面描画は、ここが返した結果を「表現する」だけで、結果を変えない
   このため、乱数(d20)は roll() として外から注入し、この層自体は決定論に保つ。
   ========================================================= */

export const WALL = "#";

const DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const key = (x, y) => x + "," + y;

/* ---------------- グリッド ---------------- */

// ASCIIマップからグリッドを作る。'#'=壁(進入不可)、それ以外=床。
// 行の長さが揃っていない場合、足りない分は壁として扱う(可変形状マップを配列で表現する)。
// height(地形の高さ)と obstacle(障害物レイヤー)は器だけ用意する。
// 地形高さは足場・演出用で射線に影響させない仕様のため、Phase 1では読み書きしない。
// 障害物を使った射線・通過率判定はPhase 2で追加する。
export function createGrid(rows) {
  const h = rows.length;
  const w = Math.max(...rows.map(r => r.length));
  const cells = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x] ?? WALL;
      cells.push({ walkable: ch !== WALL, height: 0, obstacle: null });
    }
  }
  return { w, h, cells };
}

export function inBounds(grid, x, y) {
  return x >= 0 && y >= 0 && x < grid.w && y < grid.h;
}

export function cellAt(grid, x, y) {
  return inBounds(grid, x, y) ? grid.cells[y * grid.w + x] : null;
}

export function isWalkable(grid, x, y) {
  const c = cellAt(grid, x, y);
  return !!c && c.walkable;
}

/* ---------------- 隣接・距離 ---------------- */

// 近接攻撃の射程は8方向隣接のみ(リーチ武器は保留)。自分自身は隣接に含めない
export function isAdjacent(a, b) {
  const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
  return (dx !== 0 || dy !== 0) && dx <= 1 && dy <= 1;
}

/* ---------------- 移動 ---------------- */

// 移動力 = 基本3 + agility補正(+1〜+3)。現行データのagilityは概ね4〜7の範囲。
// ponytail: 3段階の素朴な区切り。細かい曲線が要るならここだけ差し替える
export function movePointsFor(agility = 5) {
  const bonus = agility >= 7 ? 3 : agility >= 5 ? 2 : 1;
  return 3 + bonus;
}

// 到達可能マスをBFSで列挙する。8方向・1マスあたりコスト1(チェビシェフ距離)。
// 近接射程が8方向隣接なので移動も8方向で揃える。斜めを1.5にしたくなったらここを直す。
// 他ユニットのいるマスは通過も着地も不可として扱う(すり抜けを許すならblockedの作り方を変える)。
export function reachableCells(grid, start, movePoints, occupied = []) {
  const blocked = new Set(occupied.map(p => key(p.x, p.y)));
  const seen = new Set([key(start.x, start.y)]);
  let frontier = [start];
  const out = [];
  for (let step = 1; step <= movePoints; step++) {
    const next = [];
    for (const p of frontier) {
      for (const [dx, dy] of DIRS8) {
        const x = p.x + dx, y = p.y + dy, k = key(x, y);
        if (seen.has(k) || !isWalkable(grid, x, y) || blocked.has(k)) continue;
        seen.add(k);
        next.push({ x, y });
        out.push({ x, y, cost: step });
      }
    }
    frontier = next;
  }
  return out;
}

/* ---------------- 包囲ボーナス ---------------- */

// 隣接している味方の人数に応じてダメージ倍率が上がる(8方向を埋め切る必要はない)。
// 倍率 = 1 + (人数-1)/3 → 1人 1.00 / 2人 1.33 / 3人 1.67 / 4人 2.00。数値は仮置き
export function surroundMultiplier(allyCount) {
  return allyCount < 1 ? 1 : 1 + (allyCount - 1) / 3;
}

// targetに隣接している、side陣営の生存ユニット
export function adjacentAllies(units, target, side) {
  return units.filter(u => u.side === side && u.hp > 0 && isAdjacent(u, target));
}

/* ---------------- 行動順 ---------------- */

// agility降順。同値は定義順を保つ(sortの安定性に依存)
export function turnOrder(units) {
  return units.filter(u => u.hp > 0).slice().sort((a, b) => (b.agility ?? 5) - (a.agility ?? 5));
}

/* ---------------- 近接攻撃の解決 ---------------- */

// 命中・ダメージ・包囲倍率をここで確定し、「何が起きたか」だけを返す。
// roll は d20 を返す関数(テストでは固定値を注入する)。
// 返り値はそのままGMの語り・画面演出・ログの入力になる(この層は文言を持たない)。
export function resolveMelee({ attacker, target, units = [], roll }) {
  if (attacker.hp <= 0) return { ok: false, reason: "attacker_down" };
  if (target.hp <= 0) return { ok: false, reason: "target_down" };
  if (!isAdjacent(attacker, target)) return { ok: false, reason: "not_adjacent" };

  const d20 = roll();
  const crit = d20 === 20, fumble = d20 === 1;
  const dc = target.defenseDc ?? 12;
  const hit = crit || (!fumble && d20 >= dc);

  const surround = adjacentAllies(units, target, attacker.side).length;
  const multiplier = surroundMultiplier(surround);
  const damage = hit ? Math.round((crit ? 2 : 1) * multiplier) : 0;

  return { ok: true, d20, dc, hit, crit, fumble, surround, multiplier, damage };
}

/* ---------------- 敵の行動選択(Phase 1の仮置き) ---------------- */

// チェビシェフ距離(8方向1コストの移動と一致する)
const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

// ponytail: 最も近い相手へ寄り、隣接していれば殴るだけの素朴なAI。
// 遮蔽・退避・狙い分け・包囲の意図は持たない。手触り確認用の仮置きで、
// Phase 4で tune-enemy-ai を使って本設計に置き換える
export function chooseEnemyAction(grid, unit, units) {
  const foes = units.filter(u => u.side !== unit.side && u.hp > 0);
  if (!foes.length) return { type: "wait" };

  const inReach = foes.find(f => isAdjacent(unit, f));
  if (inReach) return { type: "attack", targetId: inReach.id };

  const nearest = foes.reduce((best, f) => (dist(unit, f) < dist(unit, best) ? f : best));
  const occupied = units.filter(u => u.hp > 0 && u.id !== unit.id);
  const cells = reachableCells(grid, unit, movePointsFor(unit.agility), occupied);

  let bestCell = null, bestDist = dist(unit, nearest);
  for (const c of cells) {
    const d = dist(c, nearest);
    if (d < bestDist) { bestDist = d; bestCell = c; }
  }
  return bestCell ? { type: "move", to: { x: bestCell.x, y: bestCell.y } } : { type: "wait" };
}
