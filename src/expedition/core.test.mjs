import assert from "node:assert/strict";
import { ITEMS, createFloor, eventAt, keepAfterDefeat, route, walk } from "./core.js";
const a = createFloor(123), b = createFloor(123);
assert.deepEqual(a.tiles, b.tiles);
assert.ok(a.rooms.length >= 5 && a.rooms.length <= 7);
assert.equal(a.events.filter(e => e.kind === "fight").length, 2);
assert.equal(a.events.filter(e => e.kind === "guardian").length, 1);
assert.deepEqual(keepAfterDefeat(["a", "b", "c", "d", "e"], 8), keepAfterDefeat(["a", "b", "c", "d", "e"], 8));
assert.equal(walk(a, 0, 0).player.x, a.player.x);
assert.equal(eventAt(a), null);
assert.deepEqual(a.party, { hero: 16, mage: 12 });
assert.equal(ITEMS.sword.price, 12);
assert.equal(ITEMS.sword.power, 1, "剣の販売価格を戦闘補正に使わない");
assert.equal(ITEMS.tonic.power, 6);
for (let seed = 1; seed <= 80; seed++) {
  const floor = createFloor(seed);
  for (const target of [...floor.events, floor.chest]) assert.ok(route(floor, floor.entrance, target), `seed ${seed} reaches ${target.id || "chest"}`);
}
for (let seed = 1; seed <= 20; seed++) {
  const kept = keepAfterDefeat(["a","b","c","d","e"], seed);
  assert.ok(kept.length >= 2 && kept.length <= 4);
}
console.log("expedition core: ok");
