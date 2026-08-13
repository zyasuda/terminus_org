import assert from "node:assert/strict";
import chapter from "../data/chapter_01.json" with { type:"json" };
import { inspect } from "../src/validate.js";
import { ask, backupModel, parseReply, applyProposal } from "../src/ai.js";

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

  const categoryReplies = {
    encounters: "危険の気配を追います。\n```json\n{\"proposals\":[{\"triggerTerms\":[\"奥へ進む\"],\"requiredElements\":[\"封鎖の木柵\"],\"onsetText\":\"気配がした\",\"enemyName\":\"影\",\"enemyHp\":6,\"revealOnDefeatLabel\":\"抜け道\"}]}\n```",
    decision: "安全と急ぎのどちらを選ぶかです。\n```json\n{\"proposals\":[{\"prompt\":\"安全を確かめますか。\",\"choices\":[{\"label\":\"札を見る\",\"input\":\"木の札を調べる\"},{\"label\":\"奥へ進む\",\"input\":\"奥へ進む\"}]}]}\n```"
  };
  const categoryRequests = [];
  for (const [category, raw] of Object.entries(categoryReplies)) {
    const result = await ask({ chapter, scene:chapter.scenes[0], category, context:category === "encounters" ? { secrets:[{ id:"s2a", entity:"封鎖の木柵" }] } : { suggestionGroups:[["調べる",["木の札を調べる"]],["遭遇",["奥へ進む"]]] }, userText:"危険と選択を整理する", transport:async (url, options) => {
      const body = JSON.parse(options.body); categoryRequests.push({ category, body });
      return new Response(`data: ${JSON.stringify({ delta:{ type:"text", text:raw } })}\n\n`);
    } });
    assert.equal(result.proposals.length, 1);
    if (category === "encounters") assert.equal(result.proposals[0].enemyName, "影");
    else assert.equal(result.proposals[0].choices[1].input, "奥へ進む");
  }
  assert.equal(categoryRequests.length, 2);
  for (const { category, body } of categoryRequests) {
    assert.doesNotMatch(body.input, /最大3件|評価語や感想|JSONブロック|提案は \{"proposals"/);
    assert.match(body.system_instruction, /```json/);
    assert.match(body.input, category === "encounters" ? /封鎖の木柵/ : /木の札を調べる/);
    assert.match(body.system_instruction, category === "encounters" ? /triggerTerms.*requiredElements/s : /prompt.*choices/s);
  }
}
console.log("ok 4 - バックアップと遭遇・決断のSSEを解釈し、カードを拾える");

{
  const copy = structuredClone(chapter), scene = copy.scenes[0];
  const exit = applyProposal("exits", { toLabel:"存在しない場面", match:["秘密の道"], text:"", blockedText:"" }, scene, { destinations:[{ label:copy.scenes[1].name, id:copy.scenes[1].id }] });
  assert.equal(scene.exits.length, chapter.scenes[0].exits.length + 1);
  assert.equal("to" in exit, false);
}
console.log("ok 5 - 未知の行き先は採用してもtoを書き込まない");

{
  const copy = structuredClone(chapter), scene = copy.scenes[1];
  const encounter = applyProposal("encounters", { triggerTerms:["奥へ進む"], requiredElements:["封鎖の木柵", "存在しない要素"], onsetText:"気配がした", enemyName:"影", enemyHp:6, revealOnDefeatLabel:"存在しない秘密" }, scene, { secrets:scene.secrets.map(({ id, entity }) => ({ id, entity })) });
  assert.deepEqual(encounter.requiredElements, ["封鎖の木柵"]);
}
console.log("ok 6 - 遭遇の未知の必要要素を除いて採用する");

{
  const copy = structuredClone(chapter), scene = copy.scenes[0];
  const before = structuredClone(scene);
  const result = applyProposal("decision", { prompt:"選ぶ", choices:[{ label:"未知", input:"存在しない行動" }, { label:"進む", input:"奥へ進む" }] }, scene, { decisions:[] });
  assert.equal(result, null);
  assert.deepEqual(scene, before);
}
console.log("ok 7 - 解決不能な決断は章データへ書き込まない");

{
  const copy = structuredClone(chapter), scene = copy.scenes[0];
  const result = applyProposal("decision", { prompt:"どちらを選ぶか", choices:[{ label:"札を見る", input:"木の札を調べる" }, { label:"奥へ進む", input:"奥へ進む" }] }, scene, { decisions:copy.scenes.map(item => item.decision).filter(Boolean) });
  assert.ok(result);
  const inspected = inspect(copy);
  assert.equal(inspected.structure.filter(({ level }) => level === "error").length, 0);
  assert.ok(inspected.play.cleared > 0);
}
console.log("ok 8 - 解決可能な決断を採用するとinspectを通る");

{
  const copy = structuredClone(chapter), scene = copy.scenes[1]; let body;
  await ask({ chapter:copy, scene, userText:"別の場面の名前も確認する", transport:async (url, options) => { body = JSON.parse(options.body); return new Response(""); } });
  assert.match(body.input, /章に既に出ている名前（同じものには同じ綴りを使うこと）:[\s\S]*木の札/);
}
console.log("ok 9 - 他の場面の秘密のentityを入力へ渡せる");

{
  const copy = structuredClone(chapter), scene = copy.scenes[1]; let body;
  await ask({ chapter:copy, scene, userText:"現在の場面を確認する", transport:async (url, options) => { body = JSON.parse(options.body); return new Response(""); } });
  const section = body.input.match(/章に既に出ている名前（同じものには同じ綴りを使うこと）:\n([\s\S]*?)\n参照一覧:/)?.[1] || "";
  assert.doesNotMatch(section, /分かれ道/);
}
console.log("ok 10 - 編集中の場面名を既存名一覧へ重複させない");

{
  const copy = structuredClone(chapter), scene = copy.scenes[1]; let body;
  await ask({ chapter:copy, scene, userText:"説明文ではなく名前を確認する", transport:async (url, options) => { body = JSON.parse(options.body); return new Response(""); } });
  const section = body.input.match(/章に既に出ている名前（同じものには同じ綴りを使うこと）:\n([\s\S]*?)\n参照一覧:/)?.[1] || "";
  assert.equal(section.includes(copy.scenes[0].secrets[0].text), false);
}
console.log("ok 11 - 秘密のtextを既存名一覧へ渡さない");
