import assert from "node:assert/strict";
import { ITEMS, back, canOpenChest, createFloor, retreatToEntrance, equipFromStash, equipInField, eventAt, hallContact, hallLayoutFor, hallRoom, isEntrance, mapForFloor, newVillage, partyMaxHp, route, useFieldTonic, walk } from "./core.js";
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
assert.equal(EXPEDITION_BATTLE_CONFIG.board.corridor.height, 3, "戦闘の通路幅が3マスであることが一人称の床の刻みの根拠");
console.log("expedition core: ok");
