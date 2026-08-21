import assert from "node:assert/strict";
import { cellAt } from "../battle/core.js";
import { createJunctionStage } from "./junction.js";
import { createLightChamberStage } from "./lightChamber.js";

const stage = createJunctionStage();
assert.equal(stage.grid.stage.id, "mine-junction");
assert.equal(stage.units.length, 4);
/* 全ユニットの開始マスが歩ける床であること。units.lengthだけを見ていたため、
   錆喰い(2)が壁(6,2)の中に立っていたのを素通りしていた(2026-08-20実測)。
   anchorsも同じ規則で見る——立ち位置として使う座標が壁だと、駒か演出のどちらかが必ず崩れる */
for (const unit of stage.units) {
  const cell = cellAt(stage.grid, unit.x, unit.y);
  assert.ok(cell && cell.walkable && !cell.obstacle,
    `${unit.name}(${unit.id}) の開始マス (${unit.x},${unit.y}) が歩ける床でない`);
}
for (const [name, at] of Object.entries(stage.grid.stage.anchors)) {
  const cell = cellAt(stage.grid, at.x, at.y);
  assert.ok(cell, `anchor ${name} (${at.x},${at.y}) が盤面の外を指している`);
  // collapse/barrierは障害物そのものを指すanchorなので、床であることは求めない
  if (name === "collapse" || name === "barrier") continue;
  assert.ok(cell.walkable && !cell.obstacle,
    `anchor ${name} (${at.x},${at.y}) が歩ける床でない`);
}
// 同じマスに2体以上が重なっていないこと
{
  const seen = new Set(stage.units.map(u => `${u.x},${u.y}`));
  assert.equal(seen.size, stage.units.length, "開始マスが重なっているユニットがある");
}
assert.equal(cellAt(stage.grid, 3, 1).obstacle.kind, "collapse");
assert.equal(cellAt(stage.grid, 5, 1).obstacle.kind, "barrier");
assert.equal(cellAt(stage.grid, 3, 1).walkable, false);
assert.equal(cellAt(stage.grid, 5, 1).walkable, false);
assert.deepEqual(stage.grid.stage.investigations.map(i => i.secretId), ["s2a", "s2b", "s2c"]);
assert.deepEqual(stage.grid.stage.investigations.map(i => i.speakerId), ["lydia", "lydia", "gareth"]);
assert.equal(stage.units.find(unit => unit.id === "gareth")?.facing, Math.PI, "既存ステージの向き指定は維持する");

const second = createJunctionStage();
second.units[0].x = 0;
assert.equal(stage.units[0].x, 4);
console.log("stage/junction: fixed map and actors are isolated");

const chamber = createLightChamberStage(createJunctionStage().units.filter(unit => unit.side === "party"));
assert.equal(chamber.grid.stage.id, "light-chamber");
assert.equal(chamber.grid.stage.scenarioSceneId, 3);
assert.equal(chamber.units.find(unit => unit.id === "guardian")?.modelId, "guardian");
assert.equal(chamber.units.find(unit => unit.id === "guardian")?.facing, 0, "既存守護者の向き指定は維持する");
// 灯りの部屋にも同じ規則を当てる(片方だけ守っても再発する)
for (const unit of chamber.units) {
  const cell = cellAt(chamber.grid, unit.x, unit.y);
  assert.ok(cell && cell.walkable && !cell.obstacle,
    `灯りの部屋: ${unit.name}(${unit.id}) の開始マス (${unit.x},${unit.y}) が歩ける床でない`);
}
{
  const seen = new Set(chamber.units.map(u => `${u.x},${u.y}`));
  assert.equal(seen.size, chamber.units.length, "灯りの部屋: 開始マスが重なっているユニットがある");
}
console.log("stage/light-chamber: fixed room and guardian are present");
