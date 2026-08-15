import assert from "node:assert/strict";
import { ITEMS, createFloor, equipFromStash, equipInField, eventAt, isEntrance, keepAfterDefeat, mapForFloor, newVillage, partyMaxHp, route, useFieldTonic, walk } from "./core.js";
const a = createFloor(123), b = createFloor(123);
assert.equal(a.seed, b.seed);
assert.deepEqual([...mapForFloor(a).rooms], [...mapForFloor(b).rooms]);
assert.equal(mapForFloor(a).rooms.size, 5, "入口、2遭遇、寄り道、守護者を部屋へ配置する");
assert.ok(mapForFloor(a).corridors.length >= 4, "部屋同士は独立した通路で繋ぐ");
assert.equal(a.events.filter(e => e.kind === "fight").length, 2);
assert.equal(a.events.filter(e => e.kind === "guardian").length, 1);
assert.deepEqual(keepAfterDefeat(["a", "b", "c", "d", "e"], 8), keepAfterDefeat(["a", "b", "c", "d", "e"], 8));
assert.equal(walk(a, "north").seed, a.seed);
assert.equal(eventAt(a), null);
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
for (let seed = 1; seed <= 80; seed++) {
  const floor = createFloor(seed);
  for (const target of [...floor.events, floor.chest]) assert.ok(route(floor, floor, target), `seed ${seed} reaches ${target.id || "chest"}`);
}
for (let seed = 1; seed <= 20; seed++) {
  const kept = keepAfterDefeat(["a","b","c","d","e"], seed);
  assert.ok(kept.length >= 2 && kept.length <= 4);
}
console.log("expedition core: ok");
