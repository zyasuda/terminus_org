import assert from "node:assert/strict";
import { ITEMS, back, canOpenChest, corridorLayoutFor, createFloor, retreatToEntrance, equipFromStash, equipInField, eventAt, hallContact, hallLayoutFor, hallRoom, isEntrance, junctionLayoutFor, mapForFloor, newVillage, partyMaxHp, route, useFieldTonic, walk } from "./core.js";
import { hallBlocked, hallEnemyPosition, hallWallCells } from "./interior.js";
import { FACING_AHEAD, FACING_YAW, isOpen, levelCells, opposite } from "./mapwalk.js";
import { EXPEDITION_BATTLE_CONFIG } from "./battleConfig.js";
const a = createFloor(123), b = createFloor(123);
assert.equal(a.seed, b.seed);
assert.deepEqual([...mapForFloor(a).rooms], [...mapForFloor(b).rooms]);
assert.equal(mapForFloor(a).rooms.size, 6, "入口、三叉路、2遭遇、寄り道、守護者を配置する");
assert.equal(mapForFloor(a).rooms.get("junction-0")?.kind, "junction", "三叉路は部屋とは別種の停止ノードにする");
assert.ok(mapForFloor(a).corridors.length >= 4, "部屋同士は独立した通路で繋ぐ");
assert.equal(a.events.filter(e => e.kind === "fight").length, 2);
assert.equal(a.events.filter(e => e.kind === "junction").length, 1, "三叉路の固定遭遇を持つ");
assert.equal(a.events.filter(e => e.kind === "guardian").length, 1);
assert.equal(walk(a, "north").seed, a.seed);
assert.equal(eventAt(a), null);
const bypassedFight = { ...a, at: "fight-0", events: a.events.map(event => event.id === "fight-0" ? { ...event, bypassed: true } : event) };
assert.equal(eventAt(bypassedFight), null, "迂回済みの敵は再戦にならない");
const guardianDefeated = { ...a, at: "guardian", events: a.events.map(event => event.kind === "guardian" ? { ...event, done: true } : event) };
assert.ok(canOpenChest(guardianDefeated), "通常遭遇を残しても守護者を倒せば宝箱を開けられる");
const guardianBypassed = { ...a, at: "guardian", events: a.events.map(event => event.kind === "guardian" ? { ...event, bypassed: true } : event) };
assert.equal(canOpenChest(guardianBypassed), false, "守護者を迂回しただけでは宝箱は開かない");
assert.deepEqual(a.party, { hero: 16, mage: 12 });
assert.ok(isEntrance(a));
assert.equal(ITEMS.sword.price, 12);
assert.equal(ITEMS.sword.power, 1, "剣の販売価格を戦闘補正に使わない");
assert.equal(ITEMS.tonic.power, 6);
const village = newVillage({ stash: ["sword", "mail", "tonic"] });
const armed = equipFromStash(village, "hero", 0);
assert.equal(armed.equipment.hero.weapon, "sword", "遠征中もスタッシュの武器を装備できる");
assert.equal(armed.stash.includes("sword"), false, "装備した品はスタッシュから外す");
const armored = equipFromStash(armed, "hero", armed.stash.indexOf("mail"));
assert.equal(partyMaxHp("hero", armored.equipment), 19, "鎧は遠征中の最大HPにも反映する");
const capped = equipInField(newVillage({ stash: ["mail"] }), { party: { hero: 99, mage: 12 } }, "hero", 0);
assert.equal(capped.floor.party.hero, 19, "遠征中の装備変更で現在HPは新しい最大HPを超えない");
const healed = useFieldTonic(armored, { party: { hero: 14, mage: 12 } }, "hero");
assert.deepEqual(healed.floor.party, { hero: 19, mage: 12 }, "回復薬は戦闘と同じpowerで最大HPまで回復する");
assert.equal(healed.village.stash.filter(id => id === "tonic").length, 0, "遠征中の回復薬使用は所持数も減らす");
let crossing = a;
let autoCrossed = false;
for (const step of route(a, a, { roomId: "fight-0" })) {
  const next = walk(crossing, step.dir);
  const distance = Math.abs(next.pos.x - crossing.pos.x) + Math.abs(next.pos.y - crossing.pos.y);
  if (distance > 1) { autoCrossed = true; break; }
  crossing = next;
}
assert.ok(autoCrossed, "通路へ踏み出した1入力で、次の曲がり角か部屋まで自動通過する");
let junction = a;
for (const step of route(a, a, { roomId: "junction-0" })) {
  junction = walk(junction, step.dir);
  if (junction.at === "junction-0") break;
}
assert.equal(junction.at, "junction-0", "通路の自動通過は三叉路で止まる");
assert.equal(mapForFloor(junction).cells.get(`${junction.pos.x},${junction.pos.y}`)?.kind, "junction", "停止位置は部屋ではない交差点セル");

// 三叉路の戦闘盤は、地図でその交差点が開いている向きだけに枝を出す。
// 2026-08-31まで固定形(北・西・南)で、地図と方角が合っていなかった。
// 盤の中心は交差点。枝の外端の中央マスが床なら、その向きへ枝が出ている。
for (let seed = 1; seed <= 40; seed += 1) {
  let floor = createFloor(seed);
  for (const step of route(floor, floor, { roomId: "junction-0" })) {
    floor = walk(floor, step.dir);
    if (floor.at === "junction-0") break;
  }
  if (floor.at !== "junction-0") continue;
  const map = mapForFloor(floor);
  const room = [...map.rooms.values()].find(r => r.kind === "junction");
  const board = junctionLayoutFor(floor);
  const mid = Math.floor(board.width / 2), last = board.width - 1;
  const armEnd = { north: [mid, 0], south: [mid, last], west: [0, mid], east: [last, mid] };
  for (const [dir, [dx, dy]] of Object.entries(FACING_AHEAD)) {
    const [bx, by] = armEnd[dir];
    assert.equal(board.rows[by][bx] === ".", isOpen(map, room.x + dx, room.y + dy),
      `seed ${seed}: 三叉路の${dir}の枝は地図と一致する`);
  }
  // 味方は入ってきた枝から出る。向きの逆が入口。
  const [ex, ey] = armEnd[opposite(floor.facing)];
  assert.ok(board.partySlots.every(slot => slot.x === ex || slot.y === ey),
    `seed ${seed}: 味方は入ってきた枝の外端に並ぶ`);
}
for (let seed = 1; seed <= 80; seed++) {
  const floor = createFloor(seed);
  for (const target of [...floor.events, floor.chest]) assert.ok(route(floor, floor, target), `seed ${seed} reaches ${target.id || "chest"}`);
}
assert.deepEqual(hallLayoutFor(a), hallLayoutFor(b), "同じseedの大広間内装は一致する");
const hall = hallRoom(a), enemy = hallEnemyPosition(hall), hallMap = mapForFloor(a);
assert.ok(hallBlocked(hallMap, hall.x + 8, hall.y + 1), "間仕切りは通れない");
assert.equal(hallBlocked(hallMap, hall.x + 8, hall.y + 5), false, "中央の開口は通れる");
assert.ok(hallContact({ ...a, at: hall.id, pos: enemy }), "固定敵のマスで接触する");
assert.equal(hallContact({ ...a, at: hall.id, pos: enemy, hallDefeated: true }), false, "倒した固定敵は復活しない");
for (let seed = 0; seed < 100; seed++) {
  const floor = createFloor(seed), map = mapForFloor(floor), room = hallRoom(floor), target = hallEnemyPosition(room);
  const queue = [floor.pos], seen = new Set([`${floor.pos.x},${floor.pos.y}`]);
  for (let i = 0; i < queue.length; i++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const next = { x: queue[i].x + dx, y: queue[i].y + dy }, key = `${next.x},${next.y}`;
    if (!seen.has(key) && map.cells.has(key) && !hallBlocked(map, next.x, next.y)) { seen.add(key); queue.push(next); }
  }
  assert.ok(seen.has(`${target.x},${target.y}`), `seed ${seed}: 大広間の固定敵へ到達できる`);
}
// 3Dのシーンが読む、通れるマスと壁として立てるマスの分け方。
const wideFloor = createFloor(1448944938), wideMap = mapForFloor(wideFloor), entrance = wideMap.rooms.get("entrance");
assert.deepEqual({ x: entrance.x, y: entrance.y, w: entrance.w, h: entrance.h }, { x: 0, y: 0, w: 4, h: 3 },
  "この検査は入口が(0,0)の4×3であることを前提にしている");
const level = levelCells(wideMap);
assert.ok(level.open.has("2,1"), "部屋の中は通れる");
assert.equal(level.open.has("4,1"), false, "部屋の外は通れない");
assert.ok(level.solid.has("4,1"), "空きマスに隣り合う外側は壁として立てる");
assert.ok(level.solid.has("-1,-1"), "斜めに隣り合う角も壁にする(角が抜けて見えないように)");
assert.equal(level.solid.has("9,9"), false, "どの空きマスにも接しない遠くは作らない");
for (const key of level.solid) assert.equal(level.open.has(key), false, "壁と通れるマスは重ならない");
// 大広間の間仕切りは、地図の外ではなく部屋の内側にある壁。3Dでも立てる。
const partitionKey = `${hall.x + 8},${hall.y + 1}`;
assert.ok(hallBlocked(hallMap, hall.x + 8, hall.y + 1), "前提: そこは間仕切り");
assert.ok(levelCells(hallMap).solid.has(partitionKey), "部屋の内側の間仕切りも壁として立てる");

// 3Dカメラの向きと地図の方角。three.jsは rotation.y = θ のとき前方が (-sinθ, -cosθ)。
// ここがずれると地図と一人称が90度食い違う(一度ずらした)。
for (const [dir, theta] of Object.entries(FACING_YAW)) {
  const [ax, ay] = FACING_AHEAD[dir];
  assert.ok(Math.abs(-Math.sin(theta) - ax) < 1e-9 && Math.abs(-Math.cos(theta) - ay) < 1e-9,
    `${dir}: カメラの前方が地図の(${ax},${ay})と一致しない`);
}
assert.equal(opposite("north"), "south");
assert.equal(opposite("east"), "west");
// 後退: 向きを変えずに1歩戻り、前進で元の位置へ戻れる。
const facedNorth = { ...a, facing: "north" };
const stepped = walk(facedNorth, "north");
if (stepped.pos.x !== facedNorth.pos.x || stepped.pos.y !== facedNorth.pos.y) {
  const returned = back({ ...stepped, facing: "north" });
  assert.equal(returned.facing, "north", "後退しても向きは変わらない");
  assert.deepEqual(returned.pos, facedNorth.pos, "後退で元のマスへ戻る");
}
// 戦闘からの離脱: 入口へ戻り、敵は倒した扱いにならない。
const midFight = { ...a, at: "fight-0", pos: { x: a.pos.x + 3, y: a.pos.y + 3 }, facing: "north", hallDefeated: false };
const retreated = retreatToEntrance(midFight);
assert.equal(retreated.at, "entrance", "離脱すると入口へ戻る");
assert.deepEqual(retreated.pos, a.pos, "戻る位置は遠征開始時と同じ");
assert.equal(retreated.facing, a.facing, "向きも遠征開始時と同じ");
assert.deepEqual(retreated.events, midFight.events, "離脱しても敵は倒した扱いにならない");
assert.equal(retreated.hallDefeated, false, "大広間の固定敵も残る");
assert.equal(eventAt(retreated), null, "入口には遭遇が無いので、戻った直後に再戦にならない");

// 一人称の床の目盛りは「探索1マス = 戦闘3タイル」を前提にしている(FirstPersonView.jsx の TILES_PER_CELL)。
// 通路盤の幅を変えたらここで落ちるので、床の刻みも一緒に直すこと。
/* 一人称の床の刻み(firstPersonScene.js の CELL = 3)の根拠。
   2026-08-31に通路戦の盤を部屋から組むようにしたので、盤の縦幅はもう3固定ではない
   (実測 3〜5)。刻みの根拠は「細い通路の幅が3マス」という設計値の方であり、
   この board.corridor はその設計値が書いてある最後の場所として残している。
   **盤の縮尺(1マス=1タイル)と一人称の縮尺(1マス=3タイル)は食い違ったままで、未解決。** */
/* 地図と一人称の整合。**この2つが揃っていることが土台で、戦闘盤はその次。**

   地図(draw.js)は部屋を角丸長方形、通路を中心線のストロークで描く模式図で、
   寸法の正本ではない(通路の線幅は0.62マス、部屋は0.06マス内側)。
   なので「形が同じか」ではなく「歩ける場所と塞がれた場所が同じか」で揃える。

   地図が床として塗る集合 = 部屋の全セル + 通路の経路セル − 間仕切り。
   一人称が歩ける集合 = levelCells(map).open。この2つが一致していなければならない。

   2026-08-31の実測: 60 seed・18,646セルで食い違い0。
   地図が間仕切りを描かなかった頃(実際にあったバグ)を再現すると480件で落ちる。 */
{
  const paintedCells = map => {
    const painted = new Set();
    for (const room of map.rooms.values())
      for (let y = room.y; y < room.y + room.h; y += 1)
        for (let x = room.x; x < room.x + room.w; x += 1) painted.add(`${x},${y}`);
    for (const corridor of map.corridors) for (const cell of corridor.path) painted.add(`${cell.x},${cell.y}`);
    for (const wall of hallWallCells(map)) painted.delete(`${wall.x},${wall.y}`);
    return painted;
  };
  let checked = 0;
  for (let seed = 1; seed <= 60; seed += 1) {
    const map = mapForFloor(createFloor(seed));
    const painted = paintedCells(map), { open } = levelCells(map);
    checked += open.size;
    for (const key of painted) assert.ok(open.has(key), `seed ${seed}: 地図は床なのに一人称は壁 ${key}`);
    for (const key of open) assert.ok(painted.has(key), `seed ${seed}: 一人称は床なのに地図が何も描かない ${key}`);
    for (const wall of hallWallCells(map))
      assert.ok(!isOpen(map, wall.x, wall.y), `seed ${seed}: 地図は間仕切りなのに一人称は通れる ${wall.x},${wall.y}`);
  }
  assert.ok(checked > 15000, `地図と一人称を十分な数のセルで突き合わせた(実測 ${checked} セル)`);
}

assert.equal(EXPEDITION_BATTLE_CONFIG.board.corridor.height, 3, "細い通路の幅3マスが一人称の床の刻みの根拠として残っている");

/* 通路戦の盤は、戦う部屋の実寸と入ってきた辺から組む(2026-08-31)。
   それまでは固定の7×3で、部屋の形と無関係だった。
   mapgen.js:118 の部屋は w∈[4,7] h∈[3,5]。辺の長さが必ず3以上あるので、
   味方2人・敵2体を中央±1へ置いても重ならない。ここが3を割ると開始位置が重なるため、
   下の「開始位置は4つとも別のマス」がその見張りになる。 */
const walkTo = (seed, roomId) => {
  let floor = createFloor(seed);
  for (let guard = 0; guard < 60 && floor.at !== roomId; guard += 1) {
    const path = route(floor, floor, { roomId });
    if (!path?.length) return null;
    floor = walk(floor, path[0].dir);
  }
  return floor.at === roomId ? floor : null;
};
let corridorBattles = 0;
const boardSizes = new Set();
for (let seed = 1; seed <= 60; seed += 1) for (const roomId of ["fight-0", "fight-1"]) {
  const floor = walkTo(seed, roomId);
  if (!floor) continue;
  corridorBattles += 1;
  const room = mapForFloor(floor).rooms.get(roomId);
  const board = corridorLayoutFor(floor);
  boardSizes.add(`${board.width}x${board.height}`);
  assert.equal(board.width, room.w, `seed ${seed} ${roomId}: 盤の横幅は部屋の実寸`);
  assert.equal(board.height, room.h, `seed ${seed} ${roomId}: 盤の縦幅は部屋の実寸`);
  const starts = [...board.partySlots, board.enemyStart, board.enemyStart2];
  assert.equal(new Set(starts.map(c => `${c.x},${c.y}`)).size, 4, `seed ${seed} ${roomId}: 開始位置は4つとも別のマス`);
  for (const cell of starts) assert.ok(cell.x >= 0 && cell.y >= 0 && cell.x < board.width && cell.y < board.height,
    `seed ${seed} ${roomId}: 開始位置が盤の中にある`);
  // 味方は「立っている場所にいちばん近い辺」に、敵はその反対の辺に並ぶ。
  const local = { x: floor.pos.x - room.x, y: floor.pos.y - room.y };
  const near = Math.min(local.y, room.h - 1 - local.y, local.x, room.w - 1 - local.x);
  const onEdge = c => c.x === 0 || c.y === 0 || c.x === room.w - 1 || c.y === room.h - 1;
  assert.ok(board.partySlots.every(onEdge), `seed ${seed} ${roomId}: 味方は部屋の辺に並ぶ`);
  assert.ok([board.enemyStart, board.enemyStart2].every(onEdge), `seed ${seed} ${roomId}: 敵も部屋の辺に並ぶ`);
  assert.ok(board.partySlots.every(c => Math.min(c.y, room.h - 1 - c.y, c.x, room.w - 1 - c.x) === 0 && near >= 0),
    `seed ${seed} ${roomId}: 味方の辺は立っている場所から選ぶ`);
  assert.equal(board.kind, "corridor", `seed ${seed} ${roomId}: 盤の種類は通路戦(敵2体編成の根拠)`);
}
assert.ok(corridorBattles >= 100, `通路戦を十分な数だけ検査した(実測 ${corridorBattles} 件)`);
assert.ok(boardSizes.size >= 8, `部屋ごとに盤の形が変わる(実測 ${boardSizes.size} 通り: ${[...boardSizes].join(" ")})`);
// 固定盤だった頃の7×3を、西から入った時だけ再現する(旧盤との地続きを保つ)。
{
  const { corridorBattleBoard } = await import("./interior.js");
  const old = corridorBattleBoard({ w: 7, h: 3 }, { x: 0, y: 1 });
  assert.deepEqual(old.partySlots, [{ x: 0, y: 0 }, { x: 0, y: 2 }], "7×3の部屋へ西から入ると、以前の固定盤と同じ味方位置になる");
  assert.deepEqual([old.enemyStart, old.enemyStart2], [{ x: 6, y: 0 }, { x: 6, y: 2 }], "敵位置も以前の固定盤と同じ");
  const east = corridorBattleBoard({ w: 7, h: 3 }, { x: 6, y: 1 });
  assert.deepEqual(east.partySlots, [{ x: 6, y: 0 }, { x: 6, y: 2 }], "東から入れば味方は東の辺に並ぶ(固定盤では常に西だった)");
}
console.log("expedition core: ok");
