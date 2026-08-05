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

const second = createJunctionStage();
second.units[0].x = 0;
assert.equal(stage.units[0].x, 4);
console.log("stage/junction: fixed map and actors are isolated");

const chamber = createLightChamberStage(createJunctionStage().units.filter(unit => unit.side === "party"));
assert.equal(chamber.grid.stage.id, "light-chamber");
assert.equal(chamber.grid.stage.scenarioSceneId, 3);
assert.equal(chamber.units.find(unit => unit.id === "guardian")?.modelId, "guardian");
console.log("stage/light-chamber: fixed room and guardian are present");
