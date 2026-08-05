import assert from "node:assert/strict";
import { applyCampaignEntityAliases } from "./scenario.js";

const chapter = {
  scenes: [{ secrets: [
    { entity: "心石", aliases: ["青い石"] },
    { entity: "坑道の地図" }
  ] }]
};
const result = applyCampaignEntityAliases(chapter, [
  { ja: "心石", aliases: ["心の石", "青い石"] },
  { ja: "坑道の地図", aliases: ["見取り図"] }
]);

assert.deepEqual(result.scenes[0].secrets[0].aliases, ["青い石", "心の石"]);
assert.deepEqual(result.scenes[0].secrets[1].aliases, ["見取り図"]);
assert.deepEqual(chapter.scenes[0].secrets[0].aliases, ["青い石"]);
console.log("scenario entity ledger aliases: ok");
