import assert from "node:assert/strict";
import chapter from "../data/chapter_01.json" with { type:"json" };
import { inspect } from "../src/validate.js";
import { ask, backupModel, parseReply } from "../src/ai.js";

const good = "木柵の違和感が効いています。\n```json\n{\"proposals\":[{\"entity\":\"油の染み\",\"aliases\":[\"染み\"],\"text\":\"最近、誰かが油を使った。\",\"surface\":\"黒い染み\",\"dc\":8}]}\n```";
{
  const result = parseReply(good);
  assert.equal(result.reply, "木柵の違和感が効いています。"); assert.equal(result.proposals[0].entity, "油の染み");
}
console.log("ok 1 - 整った応答から提案を取り出せる");
{
  assert.deepEqual(parseReply("もう少し音について聞かせてください。"), { reply:"もう少し音について聞かせてください。", proposals:[] });
}
console.log("ok 2 - JSONブロックなしでも返事が残る");
{
  const result = parseReply("返事です。\n```json\n{壊れている\n```"); assert.equal(result.reply, "返事です。"); assert.deepEqual(result.proposals, []);
}
console.log("ok 3 - 壊れたJSONでも返事を失わない");
{
  globalThis.localStorage = new Map(); globalThis.localStorage.getItem = globalThis.localStorage.get.bind(globalThis.localStorage); globalThis.localStorage.setItem = globalThis.localStorage.set.bind(globalThis.localStorage);
  localStorage.setItem("gamebook:geminiKey", "test"); localStorage.setItem("gamebook:geminiModel", "gemini-3.1-flash-lite");
  const events = [{ step:{ type:"thought" } }, { delta:{ type:"text", text:good.slice(0, 12) } }, { delta:{ type:"text", text:good.slice(12) } }];
  const response = new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""));
  const chunks = [], thoughts = [], statuses = [], models = [];
  const proposal = (await ask({ chapter, scene:chapter.scenes[0], userText:"油の匂いがある", onChunk:chunk => chunks.push(chunk), onThought:() => thoughts.push(true), onStatus:status => statuses.push(status), transport:async (url, options) => { assert.equal(url, "https://generativelanguage.googleapis.com/v1/interactions"); const body = JSON.parse(options.body); models.push(body.model); assert.equal(body.stream, true); assert.equal(body.store, false); assert.equal(options.headers["x-goog-api-key"], "test"); return models.length === 1 ? new Response("", { status:404 }) : response; } })).proposals[0];
  assert.deepEqual(models, ["gemini-3.1-flash-lite", backupModel]); assert.deepEqual(statuses, ["別のモデルで応答しています"]); assert.equal(thoughts.length, 1); assert.equal(chunks.join(""), "木柵の違和感が効いています。\n");
  const copy = structuredClone(chapter), scene = copy.scenes[0]; scene.secrets.push({ id:"sc1_1", ...proposal, trigger:"" });
  const result = inspect(copy); assert.equal(result.structure.filter(x => x.level === "error").length, 0); assert.ok(result.play.cleared > 0);
}
console.log("ok 4 - バックアップのSSEを解釈し、採用後も完走できる");
