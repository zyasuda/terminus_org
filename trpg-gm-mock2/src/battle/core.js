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

/* ---------------- 障害物の配置 ---------------- */

// 決定論の簡易PRNG(mulberry32)。同じseedなら必ず同じ盤面になるので、
// 遊ぶときは毎回違う盤面、検証するときは ?seed= で固定、という使い分けができる
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LOW_HEIGHTS = [0.25, 0.5, 0.75];

// 2点が行き来できるか(移動力を無視した到達性の確認)
function pathExists(grid, from, to) {
  const seen = new Set([key(from.x, from.y)]);
  let frontier = [from];
  while (frontier.length) {
    const next = [];
    for (const p of frontier) {
      if (p.x === to.x && p.y === to.y) return true;
      for (const [dx, dy] of DIRS8) {
        const x = p.x + dx, y = p.y + dy, k = key(x, y);
        if (seen.has(k) || !isWalkable(grid, x, y)) continue;
        seen.add(k);
        next.push({ x, y });
      }
    }
    frontier = next;
  }
  return false;
}

// 障害物をランダムに散らす(左右対称に置くと展開が読めてしまうため)。
//   高さ1.0 = 柱。そのマスへは入れない
//   高さ0.25〜0.75 = 瓦礫。乗り越えられるので進入でき、視線も遮らないが、
//                    Phase 2で飛び道具の通過率(1−高さ)に効く
// keepClear(開始位置)には置かない。置いた結果どちらの陣営からも行き来できなく
// なる柱は取り消すので、通り抜けられない盤面にはならない
export function scatterObstacles(grid, rng, { pillars = 5, rubble = 6, keepClear = [] } = {}) {
  const clear = new Set(keepClear.map(p => key(p.x, p.y)));
  const open = [];
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      if (isWalkable(grid, x, y) && !clear.has(key(x, y))) open.push({ x, y });
    }
  }
  for (let i = open.length - 1; i > 0; i--) {          // フィッシャー・イェーツ
    const j = Math.floor(rng() * (i + 1));
    [open[i], open[j]] = [open[j], open[i]];
  }

  const a = keepClear[0], b = keepClear[keepClear.length - 1];
  let idx = 0, count = 0;
  while (idx < open.length && count < pillars) {
    const p = open[idx++];
    const c = cellAt(grid, p.x, p.y);
    c.obstacle = { height: 1 };
    c.walkable = false;
    if (a && b && !pathExists(grid, a, b)) {
      c.obstacle = null;                                // 行き来を断つ柱は置かない
      c.walkable = true;
    } else {
      count++;
    }
  }
  count = 0;
  while (idx < open.length && count < rubble) {
    const p = open[idx++];
    const c = cellAt(grid, p.x, p.y);
    if (c.obstacle) continue;
    c.obstacle = { height: LOW_HEIGHTS[Math.floor(rng() * LOW_HEIGHTS.length)] };
    count++;
  }
  return grid;
}

/* ---------------- 隣接・距離 ---------------- */

// 近接攻撃の射程は8方向隣接のみ(リーチ武器は保留)。自分自身は隣接に含めない
export function isAdjacent(a, b) {
  const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
  return (dx !== 0 || dy !== 0) && dx <= 1 && dy <= 1;
}

/* ---------------- 移動 ---------------- */

// 移動力 = 基本1 + agility補正(+1〜+2)。現行データのagilityは概ね4〜7の範囲。
// 当初は基本3(合計4〜6)だったが8x8盤面のほぼ全域へ届いてしまい、位置取りの意味が
// 薄れた。8x8を基本として作り込む方針に決まったため、さらに半分へ落として合計2〜3とした。
// 一手で盤面の1/4ほどしか動けないので、どこへ寄るかの判断が効くようになる。
// ponytail: 8x8では2段階で十分。盤面が広がったら段を増やす
export function movePointsFor(agility = 5) {
  return 1 + (agility >= 7 ? 2 : 1);
}

// 移動する本人以外の「立っている」ユニットが塞いでいるマス。
// 生存ユニットのマスは通過も着地もできない(誰も同じマスに立てない)。
// 戦闘不能になった駒は盤面から退き、その場にコインが残るだけなので塞がない
export function occupiedBy(units, moverId) {
  return units.filter(u => u.hp > 0 && u.id !== moverId).map(u => ({ x: u.x, y: u.y }));
}

// 到達可能マスをBFSで列挙する。8方向・1マスあたりコスト1(チェビシェフ距離)。
// 近接射程が8方向隣接なので移動も8方向で揃える。斜めを1.5にしたくなったらここを直す。
// 他ユニットのいるマスは通過も着地も不可として扱う(すり抜けを許すならblockedの作り方を変える)。
// 各マスに from(直前のマス)を持たせるので、pathTo()で経路を復元できる
export function reachableCells(grid, start, movePoints, occupied = []) {
  const blocked = new Set(occupied.map(p => key(p.x, p.y)));
  const seen = new Set([key(start.x, start.y)]);
  let frontier = [{ x: start.x, y: start.y }];
  const out = [];
  for (let step = 1; step <= movePoints; step++) {
    const next = [];
    for (const p of frontier) {
      for (const [dx, dy] of DIRS8) {
        const x = p.x + dx, y = p.y + dy, k = key(x, y);
        if (seen.has(k) || !isWalkable(grid, x, y) || blocked.has(k)) continue;
        seen.add(k);
        next.push({ x, y });
        out.push({ x, y, cost: step, from: { x: p.x, y: p.y } });
      }
    }
    frontier = next;
  }
  return out;
}

// reachableCells()の結果から目的地までの経路を復元する(起点は含まず、到達順)。
// 通り道にあるものを拾う判定に使う
export function pathTo(cells, dest) {
  const byKey = new Map(cells.map(c => [key(c.x, c.y), c]));
  const path = [];
  let cur = byKey.get(key(dest.x, dest.y));
  while (cur) {
    path.unshift({ x: cur.x, y: cur.y });
    cur = cur.from ? byKey.get(key(cur.from.x, cur.from.y)) : null;
  }
  return path;
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
  // 基礎ダメージはユニットのatk(既定3)。当初は1固定だったが、包囲倍率1.33を掛けても
  // 四捨五入で1のまま消えてしまい、囲んでいる実感が出なかった。3を基準にすると
  // 1人3 / 2人4 / 3人5 / 4人6 と一段ずつ増えて手応えが分かる
  const base = attacker.atk ?? 3;
  const damage = hit ? Math.round((crit ? base * 2 : base) * multiplier) : 0;

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
  const cells = reachableCells(grid, unit, movePointsFor(unit.agility), occupiedBy(units, unit.id));

  let bestCell = null, bestDist = dist(unit, nearest);
  for (const c of cells) {
    const d = dist(c, nearest);
    if (d < bestDist) { bestDist = d; bestCell = c; }
  }
  if (!bestCell) return { type: "wait" };
  return { type: "move", to: { x: bestCell.x, y: bestCell.y }, path: pathTo(cells, bestCell) };
}
