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
      // void: 「盤面の外」扱いのマス(外形を変形した時に生まれる)。obstacle(柱・瓦礫)
      // とは違い、そもそもマップの一部ではないので描画側は何も出さない(完全な空白)
      cells.push({ walkable: ch !== WALL, height: 0, obstacle: null, terrain: null, void: false });
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

// points全員が互いに行き来できるか(先頭から他の全員へpathExistsが通るかで判定)。
// 「両端(最初と最後)さえ繋がっていればよい」だと、間の1体だけが孤立していても
// 見逃してしまう(実際に指摘を受けた不具合)。開始位置(keepClear)全員の保護には
// これが要る
function allConnected(grid, points) {
  if (points.length < 2) return true;
  const [first, ...rest] = points;
  return rest.every(p => pathExists(grid, first, p));
}

/* ---------------- 盤面の外形(長方形の角・辺を削る) ---------------- */

// 中心点(cx,cy)から見た角度ごとに半径をゆらした不定形の範囲を作る
// (view3d.jsの水たまりの輪郭と同じ「角度ごとに半径を揺らす」考え方をグリッド座標でやる)。
// rx/ryで楕円のように縦横比を変え、波の数・振幅をランダムにすることで
// 丸っこい形から尖った/ギザギザした形まで色々な見た目になる。
// 中心点自体は盤面の角・辺の上に置くので、盤外にはみ出す分は自然に切り捨てられる
function blobCells(grid, cx, cy, rx, ry, rng) {
  const waves = 2 + Math.floor(rng() * 3);       // 2〜4波の合成。多いほどギザギザ・尖った印象になる
  const amp = 0.25 + rng() * 0.4;                // 振幅(基準半径に対する割合)
  const phases = Array.from({ length: waves }, () => rng() * Math.PI * 2);
  const freqs = Array.from({ length: waves }, () => 1 + Math.floor(rng() * 4));
  const wobble = angle => {
    let w = 1;
    for (let i = 0; i < waves; i++) w += (amp * Math.sin(angle * freqs[i] + phases[i])) / waves;
    return w;
  };

  const maxR = Math.max(rx, ry) * (1 + amp);
  const x0 = Math.max(0, Math.floor(cx - maxR)), x1 = Math.min(grid.w - 1, Math.ceil(cx + maxR));
  const y0 = Math.max(0, Math.floor(cy - maxR)), y1 = Math.min(grid.h - 1, Math.ceil(cy + maxR));
  const cells = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;   // 楕円換算
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= wobble(Math.atan2(dy, dx))) cells.push({ x, y });
    }
  }
  return cells;
}

// 盤面の外形を変形する: 角を大きく削る/辺の中央に切れ込みを入れる/何もしない、を
// ランダムに1つ選ぶ。どちらもblobCellsで不定形に削るので、正確な長方形にはならない。
// 削ったマスはwalkable=false・void=trueにする(obstacleとは違い「そもそも盤面の外」
// という扱いなので、描画側は何も出さず完全な空白にする)。
// keepClear(開始位置)は削らない。既存のscatterObstaclesと同じ考え方で、
// 削った結果keepClear全員が互いに行き来できなくなる(誰か1人だけ孤立する
// 場合も含む)なら変形を取り消す
export function carveShape(grid, rng, { keepClear = [] } = {}) {
  const clear = new Set(keepClear.map(p => key(p.x, p.y)));
  const kind = ["corner", "notch", "none"][Math.floor(rng() * 3)];
  if (kind === "none") return grid;

  let cx, cy, rx, ry;
  if (kind === "corner") {
    const corner = ["tl", "tr", "bl", "br"][Math.floor(rng() * 4)];
    cx = corner.includes("r") ? grid.w - 1 : 0;
    cy = corner.includes("b") ? grid.h - 1 : 0;
    rx = grid.w * (0.3 + rng() * 0.2);
    ry = grid.h * (0.3 + rng() * 0.2);
  } else {
    const edge = ["top", "bottom", "left", "right"][Math.floor(rng() * 4)];
    const horizontal = edge === "top" || edge === "bottom";
    const spanFrac = 0.2 + rng() * 0.15;    // 辺方向(切れ込みの横幅)
    const depthFrac = 0.25 + rng() * 0.2;   // 奥行き方向(盤面へどれだけ食い込むか)
    cx = horizontal ? grid.w * (0.3 + rng() * 0.4) : (edge === "left" ? 0 : grid.w - 1);
    cy = horizontal ? (edge === "top" ? 0 : grid.h - 1) : grid.h * (0.3 + rng() * 0.4);
    rx = horizontal ? grid.w * spanFrac : grid.w * depthFrac;
    ry = horizontal ? grid.h * depthFrac : grid.h * spanFrac;
  }

  const cells = blobCells(grid, cx, cy, rx, ry, rng)
    .filter(p => inBounds(grid, p.x, p.y) && !clear.has(key(p.x, p.y)));
  if (!cells.length) return grid;

  for (const { x, y } of cells) {
    const c = cellAt(grid, x, y);
    c.walkable = false;
    c.void = true;
  }

  if (!allConnected(grid, keepClear)) {
    for (const { x, y } of cells) {
      const c = cellAt(grid, x, y);
      c.walkable = true;
      c.void = false;
    }
  }
  return grid;
}

// 障害物をランダムに散らす(左右対称に置くと展開が読めてしまうため)。
//   高さ1.0 = 柱。そのマスへは入れない
//   高さ0.25〜0.75 = 瓦礫。乗り越えられるので進入でき、視線も遮らないが、
//                    Phase 2で飛び道具の通過率(1−高さ)に効く
// keepClear(開始位置)には置かない。置いた結果keepClear全員が互いに行き来
// できなくなる(誰か1人だけ孤立する場合も含む)柱は取り消すので、
// 通り抜けられない盤面や、出られない孤島にはならない
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

  let idx = 0, count = 0;
  while (idx < open.length && count < pillars) {
    const p = open[idx++];
    const c = cellAt(grid, p.x, p.y);
    c.obstacle = { height: 1 };
    c.walkable = false;
    if (!allConnected(grid, keepClear)) {
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

/* ---------------- 地形(足元だけに効く。障害物とは別レイヤー) ---------------- */

// 水溜り: 通行は塞がない(walkableのまま)が、そのマスへ入る移動コストが2倍になる。
// 障害物(柱・瓦礫)の上には置かない。keepClear(開始位置)も避ける
export function scatterWater(grid, rng, { count = 5, keepClear = [] } = {}) {
  const clear = new Set(keepClear.map(p => key(p.x, p.y)));
  const open = [];
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const c = cellAt(grid, x, y);
      if (c.walkable && !c.obstacle && !clear.has(key(x, y))) open.push({ x, y });
    }
  }
  for (let i = open.length - 1; i > 0; i--) {          // フィッシャー・イェーツ
    const j = Math.floor(rng() * (i + 1));
    [open[i], open[j]] = [open[j], open[i]];
  }
  for (const p of open.slice(0, count)) {
    cellAt(grid, p.x, p.y).terrain = { type: "water", moveCost: 2 };
  }
  return grid;
}

// そのマスへ入るときの移動コスト(既定1)。柱は進入不可なのでここには来ない
export function moveCostAt(grid, x, y) {
  const c = cellAt(grid, x, y);
  return c && c.terrain ? c.terrain.moveCost : 1;
}

/* ---------------- 立ち位置の高さ ---------------- */

// そのマスに立ったときの足元の高さ。乗り越えられる瓦礫(0.25〜0.75)の上に立つ。
// 柱(1.0)は進入できないので、ユニットの立ち位置として現れることはない。
// cell.height(地形の高さ)は未使用だが、使い始めたらここへ足せばよい
export function elevationAt(grid, x, y) {
  const c = cellAt(grid, x, y);
  return c && c.obstacle && c.obstacle.height < 1 ? c.obstacle.height : 0;
}

// 攻撃側から見た高低差の段数。0.25を1段と数え、-3〜+3に収める。
// 上を取っていれば正、下から攻めていれば負になる
export function heightSteps(grid, attacker, target) {
  const d = elevationAt(grid, attacker.x, attacker.y) - elevationAt(grid, target.x, target.y);
  return Math.max(-3, Math.min(3, Math.round(d * 4)));
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

// 到達可能マスを列挙する。8方向・そのマスへ入るコストはmoveCostAt()(既定1、
// 水溜りは2)。コストが均一でなくなったのでBFSではなくダイクストラ法で解く。
// 盤面は最大64マスなので、優先度付きキューを使わない素朴なO(V^2)で十分。
// 他ユニットのいるマスは通過も着地も不可として扱う(すり抜けを許すならblockedの作り方を変える)。
// 各マスに from(直前のマス)を持たせるので、pathTo()で経路を復元できる
export function reachableCells(grid, start, movePoints, occupied = []) {
  const blocked = new Set(occupied.map(p => key(p.x, p.y)));
  const startKey = key(start.x, start.y);
  const dist = new Map([[startKey, 0]]);
  const from = new Map();
  const settled = new Set();

  while (true) {
    let curKey = null, curCost = Infinity;
    for (const [k, d] of dist) {
      if (!settled.has(k) && d < curCost) { curCost = d; curKey = k; }
    }
    if (curKey === null) break;
    settled.add(curKey);
    const [cx, cy] = curKey.split(",").map(Number);

    for (const [dx, dy] of DIRS8) {
      const x = cx + dx, y = cy + dy, k = key(x, y);
      if (settled.has(k) || !isWalkable(grid, x, y) || blocked.has(k)) continue;
      const nd = curCost + moveCostAt(grid, x, y);
      if (nd > movePoints) continue;
      if (!dist.has(k) || nd < dist.get(k)) {
        dist.set(k, nd);
        from.set(k, { x: cx, y: cy });
      }
    }
  }

  const out = [];
  for (const [k, d] of dist) {
    if (k === startKey) continue;
    const [x, y] = k.split(",").map(Number);
    out.push({ x, y, cost: d, from: from.get(k) });
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

/* ---------------- 防御の構え(パリィ/いなす/カウンター/ドッジ) ---------------- */
// 仕様: docs/BATTLE_GRID_STATUS.md「防御・リアクション」節。
// 自分の手番で構えを決め、以降の被弾時に自動で適用する「事前コミット」方式。
// 敵の自動ターンを止める必要がないので、決定論的なターン進行を変えずに済む。

export const GUARD_TYPES = ["parry", "deflect", "counter", "dodge"];

// ドッジの成立条件: targetの隣接8マスのうち「歩行可能・誰も立っていない・
// 障害物の高さが0.5未満・かつattackerとも隣接しなくなる」マスを探す。
// 単に空きマスへ避けるだけでは同じ攻撃者にまた狙われ続けてしまうため、
// 「間合いの外まで跳び退く」ことをドッジの成立条件にしている。
// 見つかればその座標を返す(呼び出し側がtargetをそこへ移す)。使用回数の制限は
// なく、地形と位置関係さえ許せば毎回成立する
export function findDodgeCell(grid, attacker, target, units) {
  const blocked = new Set(occupiedBy(units, target.id).map(p => key(p.x, p.y)));
  blocked.add(key(attacker.x, attacker.y));   // attacker自身のマスへは逃げられない
  for (const [dx, dy] of DIRS8) {
    const x = target.x + dx, y = target.y + dy;
    if (!isWalkable(grid, x, y) || blocked.has(key(x, y))) continue;
    const c = cellAt(grid, x, y);
    if ((c.obstacle ? c.obstacle.height : 0) >= 0.5) continue;
    if (isAdjacent({ x, y }, attacker)) continue;
    return { x, y };
  }
  return null;
}

/* ---------------- 近接攻撃の解決 ---------------- */

// 命中・ダメージ・包囲倍率をここで確定し、「何が起きたか」だけを返す。
// roll は d20 を返す関数(テストでは固定値を注入する)。
// guard は target が事前に選んだ構え({ type, used })。未使用時はnullでよい。
// critMin/fumbleMaxは既定20/1(=出目20だけクリティカル、1だけファンブル)。
// 「クリティカル狙い」のような、範囲を広げて命中/ファンブルの賭けを大きくする
// 行動から呼び出す時だけ変える(通常攻撃は既定のままなので挙動は変わらない)
// 返り値はそのままGMの語り・画面演出・ログの入力になる(この層は文言を持たない)。
export function resolveMelee({
  attacker, target, units = [], roll, grid = null, guard = null, critMin = 20, fumbleMax = 1
}) {
  if (attacker.hp <= 0) return { ok: false, reason: "attacker_down" };
  if (target.hp <= 0) return { ok: false, reason: "target_down" };
  if (!isAdjacent(attacker, target)) return { ok: false, reason: "not_adjacent" };

  const dc = target.defenseDc ?? 12;

  // ドッジ: attackerの間合いの外まで跳び退ける先があれば、この攻撃自体を
  // 無かったことにし、targetをその座標へ移す(dodgeTo)
  if (guard?.type === "dodge" && grid) {
    const dodgeTo = findDodgeCell(grid, attacker, target, units);
    if (dodgeTo) {
      return {
        ok: true, d20: null, dc, hit: false, crit: false, fumble: false,
        surround: 0, multiplier: 1, damage: 0, steps: 0, heightDamage: 0,
        reaction: "dodge", counterRoll: null, dodgeTo
      };
    }
  }

  // 高低差。上を取れば当てやすく、下から攻めれば当てにくい。
  // 補正はDCではなく出目に足す。こうしないと「出目20はクリティカル、1はファンブル」
  // という取り決めが崩れる(補正で20を超えてもクリティカルにはしない)
  const steps = grid ? heightSteps(grid, attacker, target) : 0;

  const d20 = roll();
  const crit = d20 >= critMin, fumble = !crit && d20 <= fumbleMax;
  let hit = crit || (!fumble && d20 + steps >= dc);

  const surround = adjacentAllies(units, target, attacker.side).length;
  const multiplier = surroundMultiplier(surround);
  // 基礎ダメージはユニットのatk(既定3)。当初は1固定だったが、包囲倍率1.33を掛けても
  // 四捨五入で1のまま消えてしまい、囲んでいる実感が出なかった。3を基準にすると
  // 1人3 / 2人4 / 3人5 / 4人6 と一段ずつ増えて手応えが分かる
  const base = attacker.atk ?? 3;
  // 2段(0.5)以上の高低差は威力にも効く。1段程度の段差は当てやすさだけに留める
  const heightDamage = steps >= 2 ? 1 : steps <= -2 ? -1 : 0;
  let damage = hit
    ? Math.max(1, Math.round((crit ? base * 2 : base) * multiplier) + heightDamage)
    : 0;

  let reaction = null;      // 実際に発動したリアクション("deflect"|"parry"|"counter")。何も無ければnull
  let counterRoll = null;   // カウンター成功時の反撃結果

  if (hit && guard?.type === "deflect") {
    damage = Math.max(0, damage - 1);
    reaction = "deflect";
  } else if (hit && guard?.type === "parry" && !guard.used) {
    // 成否にかかわらずその場で使い切る(呼び出し側でguard.used=trueにする)
    reaction = "parry";
    if (roll() >= dc) { hit = false; damage = 0; }
  } else if (hit && guard?.type === "counter" && !guard.used) {
    // 防御ロールに成功した時だけ発動し、成功時のみ使い切る
    if (roll() >= dc) {
      hit = false; damage = 0; reaction = "counter";
      const cd20 = roll();
      const cCrit = cd20 === 20, cFumble = cd20 === 1;
      const cHit = cCrit || (!cFumble && cd20 >= (attacker.defenseDc ?? 12));
      const cBase = target.atk ?? 3;
      counterRoll = { d20: cd20, hit: cHit, crit: cCrit, damage: cHit ? Math.max(1, Math.round(cCrit ? cBase * 2 : cBase)) : 0 };
    }
  }

  return { ok: true, d20, dc, hit, crit, fumble, surround, multiplier, damage, steps, heightDamage, reaction, counterRoll };
}

// 薙ぎ払い: 隣接する敵全員に、同じ1回分の出目で攻撃する。
// resolveMeleeを1体ずつ呼び出すだけの薄い層(命中判定・高低差・防御の構えは
// resolveMelee側の仕様がそのまま個別に効く)。集中攻撃より弱くするため、
// 命中した相手のダメージを一律0.6倍にする(数値は仮置き、遊びながら調整する)。
// 各相手ごとの防御ロール(パリィ・カウンターの追加ロール)は共有せず、
// 出目の共有は「最初の命中判定」1回分だけにとどめる
const SWEEP_DAMAGE_MULTIPLIER = 0.6;

export function resolveSweep({ attacker, targets, units = [], roll, grid = null }) {
  if (attacker.hp <= 0) return { ok: false, reason: "attacker_down" };
  const hits = targets.filter(t => t.hp > 0 && isAdjacent(attacker, t));
  if (!hits.length) return { ok: false, reason: "no_targets" };

  const sharedD20 = roll();
  const results = hits.map(target => {
    let sharedUsed = false;
    const rollForThis = () => (sharedUsed ? roll() : ((sharedUsed = true), sharedD20));
    const r = resolveMelee({ attacker, target, units, roll: rollForThis, grid, guard: target.guard || null });
    if (r.hit) r.damage = Math.round(r.damage * SWEEP_DAMAGE_MULTIPLIER);
    return { target, ...r };
  });

  return { ok: true, d20: sharedD20, results };
}

// 体当たり: 攻撃の代わりに選ぶ行動。命中判定・防御の構えの扱いはresolveMeleeと同じ
// (ドッジ・パリィ・カウンターが成立すればresolveMelee側でhit=falseになり、そのまま
// 素通りする)。ダメージの代わりに、命中すればattacker→targetの延長線上の隣接マスへ
// targetを押し出す。押し出し先が壁・障害物・他ユニットで塞がっていれば押し出せず、
// その場合はダメージ1点だけ入る(数値は仮置き)。
// 返り値には常にpushedTo(成功時は座標、失敗/不成立時はnull)を含める。これを
// 呼び出し側が「これは体当たりの結果だ」と判別する目印にも使う
export function resolveShove({ attacker, target, units = [], roll, grid = null, guard = null }) {
  const r = resolveMelee({ attacker, target, units, roll, grid, guard });
  if (!r.ok) return r;
  if (!r.hit) return { ...r, pushedTo: null };

  const dx = Math.sign(target.x - attacker.x), dy = Math.sign(target.y - attacker.y);
  const px = target.x + dx, py = target.y + dy;
  const occupied = occupiedBy(units, target.id).some(p => p.x === px && p.y === py);
  const blockedByTerrain = grid ? (!isWalkable(grid, px, py) || (cellAt(grid, px, py).obstacle?.height ?? 0) >= 1) : false;

  if (!occupied && !blockedByTerrain) {
    return { ...r, damage: 0, pushedTo: { x: px, y: py } };
  }
  return { ...r, damage: 1, pushedTo: null };
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
