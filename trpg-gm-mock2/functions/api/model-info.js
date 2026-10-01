// デバッグ欄のモデル表示用。server.cjs の /api/model-info と同じ形を返す
export function onRequestGet({ env }) {
  const model = env.LLM_MODEL || "gemini-3.5-flash-lite";
  return Response.json({
    backend: "gemini", model,
    configuredModel: env.LLM_MODEL || null, normalizedConfiguredModel: env.LLM_MODEL || null,
    configuredModelAccepted: true, source: env.LLM_MODEL ? "LLM_MODEL" : "backend default"
  });
}
