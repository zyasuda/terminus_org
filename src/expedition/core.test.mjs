import assert from "node:assert/strict";
import { ITEMS, canOpenChest, createFloor, equipFromStash, equipInField, eventAt, isEntrance, mapForFloor, newVillage, partyMaxHp, route, useFieldTonic, walk } from "./core.js";
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
console.log("expedition core: ok");
