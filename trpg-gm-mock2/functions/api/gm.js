/* プレゼン版(Cloudflare Pages)の LLM 中継。server.cjs の Gemini 経路だけを移したもの。
   APIキーと合言葉は Cloudflare の秘密変数に置く(GEMINI_API_KEY / MOCK2_PASS)。
   合言葉が違えば Gemini を呼ばない(URLが漏れても無料枠を使われないため)。
   ponytail: Gemini 以外のバックエンドは移していない。手元の server.cjs では従来どおり全部使える */
const DEFAULT_MODEL = "gemini-3.5-flash-lite";

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" }
});

async function callGemini(env, payload) {
  // Gemini は同一ロールの連続に弱いため、連続する同ロールは1つに結合する(server.cjs と同じ)
  const contents = [];
  for (const m of payload.messages || []) {
    const role = m.role === "assistant" ? "model" : "user";
    const text = String(m.content);
    const last = contents[contents.length - 1];
    if (last && last.role === role) last.parts[0].text += "\n\n" + text;
    else contents.push({ role, parts: [{ text }] });
  }
  const model = env.LLM_MODEL || DEFAULT_MODEL;
  const apiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: payload.system || "" }] },
        contents,
        generationConfig: {
          maxOutputTokens: Math.max((payload.max_tokens || 1000) * 4, 4000),
          thinkingConfig: { thinkingLevel: "low" },
          responseMimeType: "application/json"
        }
      })
    }
  );
  const raw = await apiRes.text();
  if (!apiRes.ok) {
    let msg = raw;
    try { msg = JSON.parse(raw).error?.message || raw; } catch (e) {}
    return { status: apiRes.status, body: { error: { type: "gemini_error", message: msg } } };
  }
  const data = JSON.parse(raw);
  const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
  const um = data.usageMetadata || {};
  return { status: 200, body: { content: [{ type: "text", text }],
    usage: { input_tokens: um.promptTokenCount || 0, output_tokens: um.candidatesTokenCount || 0 } } };
}

export async function onRequestPost({ request, env }) {
  // 合言葉が未設定なら誰も通さない(設定忘れで全公開にならないように)
  if (!env.MOCK2_PASS || !env.GEMINI_API_KEY) {
    return json(500, { error: { type: "config_error", message: "MOCK2_PASS または GEMINI_API_KEY が未設定です" } });
  }
  if (request.headers.get("x-mock2-pass") !== env.MOCK2_PASS) {
    return json(401, { error: { type: "auth_error", message: "合言葉が違います" } });
  }
  let payload;
  try { payload = await request.json(); } catch (e) {
    return json(400, { error: { type: "proxy_error", message: "JSONを読めません" } });
  }
  let result = await callGemini(env, payload);
  // 無料枠のレート制限(429)は、指示された待ち時間だけ待って1回だけ自動リトライする(server.cjs と同じ)
  if (result.status === 429) {
    const m = /retry in ([\d.]+)/i.exec(result.body.error?.message || "");
    const waitMs = Math.min((m ? parseFloat(m[1]) : 30) * 1000 + 1500, 65000);
    await new Promise(r => setTimeout(r, waitMs));
    result = await callGemini(env, payload);
  }
  return json(result.status, result.body);
}
