const keyName = "gamebook:geminiKey";
const modelName = "gamebook:geminiModel";
const defaultModel = "gemini-3.5-flash-lite";
const storage = () => globalThis.localStorage;

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
  return (data.models || []).filter(model => model.supportedGenerationMethods?.includes("generateContent"))
    .map(model => ({ id:model.name.replace(/^models\//, ""), label:model.displayName || model.name }));
}

const systemInstruction = `あなたはTRPGゲームブックの作者を取材する編集者です。場面の「調べられるもの」だけを一度に最大3件提案してください。質問は一度に1つだけです。作者に内部ID、trigger、条件式を書かせないでください。aliases は作者が呼びそうな言い方にしてください。返答の末尾に、提案があれば次のJSONブロックだけを置いてください。\n\`\`\`json\n{"proposals":[{"entity":"名称","aliases":["呼び名"],"text":"調べると分かること","surface":"見た目","dc":8}]}\n\`\`\``;
const inputFor = ({ chapter, scene, history, userText }) => `章題: ${chapter.title}\n依頼: ${chapter.quest || ""}\n場面: ${scene.name || ""}\n導入: ${scene.brief || ""}\n演出の方向: ${scene.direction || ""}\n既存の調べられるもの: ${(scene.secrets || []).map(s => `${s.entity}: ${s.text}`).join(" / ") || "なし"}\n会話履歴:\n${(history || []).map(x => `${x.role === "user" ? "作者" : "AI"}: ${x.text}`).join("\n")}\n作者: ${userText}`;
const textFrom = data => (data?.steps || []).filter(step => step.type === "model_output").flatMap(step => step.content || []).map(part => part.text || "").join("");

export function parseReply(raw) {
  let source = "";
  try { source = String(raw ?? ""); } catch { return { reply:"", proposals:[] }; }
  try {
    const match = source.match(/```json\s*([\s\S]*?)\s*```/i);
    if (!match) return { reply:source, proposals:[] };
    const parsed = JSON.parse(match[1]);
    const proposals = Array.isArray(parsed.proposals) ? parsed.proposals.filter(item => item && typeof item.entity === "string" && typeof item.text === "string").slice(0, 3).map(item => ({ entity:item.entity, aliases:Array.isArray(item.aliases) ? item.aliases.filter(x => typeof x === "string") : [], text:item.text, surface:typeof item.surface === "string" ? item.surface : "", dc:Number.isFinite(Number(item.dc)) ? Number(item.dc) : 8 })) : [];
    return { reply:source.slice(0, match.index).trimEnd(), proposals };
  } catch {
    return { reply:source.replace(/```json[\s\S]*$/i, "").trimEnd(), proposals:[] };
  }
}

export async function ask({ chapter, scene, history = [], userText, onChunk = () => {}, onThought = () => {}, transport = fetch }) {
  const key = getKey();
  if (!key) throw new Error("Geminiのキーがありません");
  const response = await checked(await transport("https://generativelanguage.googleapis.com/v1/interactions", { method:"POST", headers:{ "content-type":"application/json", "x-goog-api-key":key }, body:JSON.stringify({ model:getModel(), input:inputFor({ chapter, scene, history, userText }), stream:true, store:false, system_instruction:systemInstruction }) }));
  let raw = "", sent = 0;
  const send = () => { const boundary = raw.search(/```json\b/i), end = boundary < 0 ? raw.length : boundary; if (end > sent) { onChunk(raw.slice(sent, end)); sent = end; } };
  if (response.body) {
    const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = "";
    for (;;) { const { value, done } = await reader.read(); buffer += decoder.decode(value || new Uint8Array(), { stream:!done }); const lines = buffer.split("\n"); buffer = lines.pop(); for (const line of lines) if (line.startsWith("data:")) try { const event = JSON.parse(line.slice(5).trim()); if (event.step?.type === "thought") onThought(); if (event.delta?.type === "text") { raw += event.delta.text || ""; send(); } } catch {} if (done) break; }
  } else raw = textFrom(await response.json());
  send();
  return { ...parseReply(raw), raw };
}
