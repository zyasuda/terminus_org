/* Geminiのモデル候補を、mock2のGMと同じ形の要求(system+JSON強制+thinkingLevel)で叩き、
   通るか・思考トークンをどれだけ食うか・応答が何秒かかるかを実測する。
   使い方: node --env-file=.env tools/probe-gemini.mjs [モデル名...] */
const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error(".env の GEMINI_API_KEY が読めていません"); process.exit(1); }

const MODELS = process.argv.slice(2).length ? process.argv.slice(2) : [
  "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-flash-lite-latest",
  "gemini-2.5-flash-lite", "gemini-3.5-flash", "gemini-flash-latest",
];

const body = {
  system_instruction: { parts: [{ text: "あなたはTRPGのGM。必ずJSONだけで返す。" }] },
  contents: [{ role: "user", parts: [{ text: '{"narration":"..."} の形式で、洞窟に入った描写を1文だけ返せ' }] }],
  generationConfig: {
    maxOutputTokens: 4000,
    thinkingConfig: { thinkingLevel: "low" },
    responseMimeType: "application/json",
  },
};

for (const model of MODELS) {
  const t0 = Date.now();
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
        body: JSON.stringify(body) });
    const ms = Date.now() - t0;
    const data = await res.json();
    if (!res.ok) {
      console.log(`${model.padEnd(26)} NG  HTTP ${res.status}  ${String(data.error?.message).slice(0, 120)}`);
      continue;
    }
    const u = data.usageMetadata || {};
    const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
    console.log(`${model.padEnd(26)} OK  ${String(ms).padStart(5)}ms  ` +
      `in=${u.promptTokenCount} out=${u.candidatesTokenCount} think=${u.thoughtsTokenCount ?? 0}  ` +
      `${text.replace(/\s+/g, " ").slice(0, 70)}`);
  } catch (e) {
    console.log(`${model.padEnd(26)} NG  ${e.message}`);
  }
}
