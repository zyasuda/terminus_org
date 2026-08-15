import assert from "node:assert/strict";
import { cellAt } from "../battle/core.js";
import { createJunctionStage } from "./junction.js";
import { createLightChamberStage } from "./lightChamber.js";

const stage = createJunctionStage();
assert.equal(stage.grid.stage.id, "mine-junction");
assert.equal(stage.units.length, 4);
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
console.log("stage/light-chamber: fixed room and guardian are present");
