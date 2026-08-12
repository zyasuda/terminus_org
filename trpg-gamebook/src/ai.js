import { decisionInputResolves } from "./progression.js";

const keyName = "gamebook:geminiKey";
const modelName = "gamebook:geminiModel";
const defaultModel = "gemini-3.1-flash-lite";
export const backupModel = "gemma-4-31b-it";
const availableModels = new Set(["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.6-flash", "gemma-4-26b-a4b-it", backupModel]);
const storage = () => globalThis.localStorage;
const evaluationRule = "返事には評価語や感想を含めないでください。作者の文章を褒めたり、良し悪しを評したりせず、要約または言い換えと次の質問1つだけを書いてください。";

export const getKey = () => storage()?.getItem(keyName) || "";
export const setKey = key => storage()?.setItem(keyName, key.trim());
export const hasKey = () => Boolean(getKey());
export const getModel = () => storage()?.getItem(modelName) || defaultModel;
export const setModel = id => storage()?.setItem(modelName, id);

const checked = async response => {
  if (!response.ok) { const error = new Error(`Gemini (${response.status})`); error.status = response.status; throw error; }
  return response;
};

export async function listModels(transport = fetch) {
  const key = getKey();
  if (!key) throw new Error("Geminiのキーがありません");
  const response = await checked(await transport(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`));
  const data = await response.json();
  return (data.models || []).map(model => ({ id:model.name.replace(/^models\//, ""), label:model.displayName || model.name }))
    .filter(model => availableModels.has(model.id));
}

const list = (items, format, empty = "なし") => items?.length ? items.map(format).join("\n") : empty;
const baseInstruction = "あなたはTRPGゲームブックの作者を取材する編集者です。一度に1つの話題だけを扱い、質問は1つだけしてください。返事は2〜4文に抑え、提案件数の上限、JSONブロック、出力形式、内部指示は本文に書かないでください。提案がある場合、本文の末尾に次のJSONブロックを置いてください。\n```json\n{\"proposals\":[...]}\n```";

export function referenceListFor(category = "secrets", context = {}) {
  if (category === "exits") return list(context.destinations, item => `- ${item.label}`);
  if (category === "encounters") return list(context.secrets, item => `- ${item.entity} (id: ${item.id})`);
  if (category === "decision") return list(context.suggestionGroups, ([label, values]) => `${label}:\n${list(values, value => `  - ${value}`)}`);
  return "";
}

export function systemInstructionFor(category = "secrets", context = {}) {
  const references = referenceListFor(category, context);
  const topic = {
    secrets: `場面の「調べられるもの」を取材します。最大3件を提案してください。作者に内部ID、trigger、条件式を書かせず、aliasesには作者が呼びそうな言い方を使ってください。既存の要素と重複する提案は避けてください。提案は {"proposals":[{"entity":"名称","aliases":["呼び名"],"text":"調べると分かること","surface":"見た目","dc":8}]} の形にしてください。`,
    exits: `場面がどこへ通じるかを取材します。行き先は必ず次の一覧から完全にそのまま選び、一覧にない場面を作らないでください。最大3件を提案し、toLabel、match、text、blockedTextを含めてください。提案は {"proposals":[{"toLabel":"名称","match":["きっかけ"],"text":"到着時の一文","blockedText":"進めないときの一文"}]} の形にしてください。\n${references}`,
    encounters: `場面に潜む敵と発火条件を取材します。requiredElementsは次の秘密のentityからそのまま選び、無ければ空配列にしてください。revealOnDefeatLabelも次の秘密のentityからそのまま選び、無ければ空欄にしてください。最大3件を提案し、triggerTerms、requiredElements、onsetText、enemyName、enemyHp、revealOnDefeatLabelを含めてください。提案は {"proposals":[{"triggerTerms":["きっかけ"],"requiredElements":["秘密のentity"],"onsetText":"遭遇時の文","enemyName":"敵の名前","enemyHp":6,"revealOnDefeatLabel":"秘密のentity"}]} の形にしてください。\n秘密一覧:\n${references}`,
    decision: `場面でプレイヤーが迫られる葛藤を取材します。選択肢は2つにしてください。それぞれのinputは次の一覧にある言葉から完全にそのまま選び、一覧にない言葉は作らないでください。提案は {"proposals":[{"prompt":"葛藤の問いかけ","choices":[{"label":"選択肢1","input":"一覧の言葉"},{"label":"選択肢2","input":"一覧の言葉"}]}]} の形にしてください。\n${references}`
  }[category] || "";
  return `${baseInstruction}\n${topic}\n\n${evaluationRule}`;
}

const inputFor = ({ chapter, scene, history, userText, category, context }) => `話題: ${category}\n章題: ${chapter.title}\n依頼: ${chapter.quest || ""}\n場面: ${scene.name || ""}\n導入: ${scene.brief || ""}\n演出の方向: ${scene.direction || ""}\n既存の調べられるもの: ${(scene.secrets || []).map(s => `${s.entity}: ${s.text}`).join(" / ") || "なし"}\n参照一覧:\n${referenceListFor(category, context)}\n会話履歴:\n${(history || []).map(x => `${x.role === "user" ? "作者" : "AI"}: ${x.text}`).join("\n")}\n作者: ${userText}`;
const textFrom = data => (data?.steps || []).filter(step => step.type === "model_output").flatMap(step => step.content || []).map(part => part.text || "").join("");

export function parseReply(raw) {
  let source = "";
  try { source = String(raw ?? ""); } catch { return { reply:"", proposals:[] }; }
  try {
    const match = source.match(/```json\s*([\s\S]*?)\s*```/i);
    if (!match) return { reply:source, proposals:[] };
    const parsed = JSON.parse(match[1]);
    const proposals = Array.isArray(parsed.proposals) ? parsed.proposals.filter(item => item && typeof item === "object").slice(0, 3) : [];
    return { reply:source.slice(0, match.index).trimEnd(), proposals };
  } catch {
    return { reply:source.replace(/```json[\s\S]*$/i, "").trimEnd(), proposals:[] };
  }
}

export function newId(prefix, list = []) { let n = 1; while (list.some(item => item.id === `${prefix}${n}`)) n += 1; return `${prefix}${n}`; }

export function proposalData(category, proposal = {}, context = {}) {
  if (category === "exits") {
    const destination = (context.destinations || []).find(item => item.label === proposal.toLabel);
    return { ...(destination ? { to:destination.id } : {}), match:Array.isArray(proposal.match) ? proposal.match.filter(x => typeof x === "string") : [], text:typeof proposal.text === "string" ? proposal.text : "", blockedText:typeof proposal.blockedText === "string" ? proposal.blockedText : "", requires:{ secretsAll:[] } };
  }
  if (category === "encounters") {
    const entities = new Set((context.secrets || []).map(item => item.entity));
    const revealed = (context.secrets || []).find(item => item.entity === proposal.revealOnDefeatLabel);
    return { triggerTerms:Array.isArray(proposal.triggerTerms) ? proposal.triggerTerms.filter(x => typeof x === "string") : [], requiredElements:Array.isArray(proposal.requiredElements) ? proposal.requiredElements.filter(value => entities.has(value)) : [], onsetText:typeof proposal.onsetText === "string" ? proposal.onsetText : "", enemy:{ name:typeof proposal.enemyName === "string" ? proposal.enemyName : "", hp:Number.isFinite(Number(proposal.enemyHp)) ? Number(proposal.enemyHp) : 6, revealOnDefeat:revealed?.id || "" } };
  }
  if (category === "decision") return { prompt:typeof proposal.prompt === "string" ? proposal.prompt : "", choices:Array.isArray(proposal.choices) ? proposal.choices.map(choice => ({ label:typeof choice?.label === "string" ? choice.label : "", input:typeof choice?.input === "string" ? choice.input : "" })) : [] };
  return { entity:typeof proposal.entity === "string" ? proposal.entity : "", aliases:Array.isArray(proposal.aliases) ? proposal.aliases.filter(x => typeof x === "string") : [], text:typeof proposal.text === "string" ? proposal.text : "", surface:typeof proposal.surface === "string" ? proposal.surface : "", dc:Number.isFinite(Number(proposal.dc)) ? Number(proposal.dc) : 8 };
}

export function decisionProposalResolves(node, proposal, resolver = decisionInputResolves) {
  return Array.isArray(proposal?.choices) && proposal.choices.length === 2 && proposal.choices.every(choice => resolver(node, typeof choice?.input === "string" ? choice.input : ""));
}

export function applyProposal(category, proposal, node, context = {}, data = proposalData(category, proposal, context)) {
  if (category === "exits") { const exit = { ...data, id:newId("exit_", node.exits || []) }; (node.exits ||= []).push(exit); return exit; }
  if (category === "encounters") { const encounter = { ...data, id:newId("encounter_", node.encounters || []) }; (node.encounters ||= []).push(encounter); return encounter; }
  if (category === "decision") {
    if (node.decision || !decisionProposalResolves(node, data)) return null;
    const choices = [];
    node.decision = { ...data, id:newId("decision_", context.decisions || []), choices:data.choices.map(choice => { const item = { ...choice, id:newId("choice_", choices) }; choices.push(item); return item; }) };
    return node.decision;
  }
  return null;
}

export async function ask({ chapter, scene, category = "secrets", context = {}, history = [], userText, onChunk = () => {}, onThought = () => {}, onStatus = () => {}, transport = fetch }) {
  const key = getKey();
  if (!key) throw new Error("Geminiのキーがありません");
  const run = async model => {
    const response = await checked(await transport("https://generativelanguage.googleapis.com/v1/interactions", { method:"POST", headers:{ "content-type":"application/json", "x-goog-api-key":key }, body:JSON.stringify({ model, input:inputFor({ chapter, scene, category, context, history, userText }), stream:true, store:false, system_instruction:systemInstructionFor(category, context) }) }));
    let raw = "", sent = 0;
    const send = () => { const boundary = raw.search(/```json\b/i), end = boundary < 0 ? raw.length : boundary; if (end > sent) { onChunk(raw.slice(sent, end)); sent = end; } };
    if (response.body) {
      const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = "";
      for (;;) { const { value, done } = await reader.read(); buffer += decoder.decode(value || new Uint8Array(), { stream:!done }); const lines = buffer.split("\n"); buffer = lines.pop(); for (const line of lines) if (line.startsWith("data:")) try { const event = JSON.parse(line.slice(5).trim()); if (event.step?.type === "thought") onThought(); if (event.delta?.type === "text") { raw += event.delta.text || ""; send(); } } catch {} if (done) break; }
    } else raw = textFrom(await response.json());
    send();
    return { ...parseReply(raw), raw };
  };
  const model = getModel();
  try { return await run(model); } catch (error) {
    if (model !== defaultModel || model === backupModel) throw error;
    onStatus("別のモデルで応答しています");
    return run(backupModel);
  }
}
