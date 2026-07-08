export async function callGmApi({ system, messages, maxTokens = 1000 }) {
  let res;
  try {
    res = await fetch("/api/gm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        max_tokens: maxTokens,
        system,
        messages
      }),
      signal: AbortSignal.timeout(30000) // GMが黙り込んだまま固まって見えるのを防ぐ
    });
  } catch (e) {
    if (e.name === "TimeoutError") throw new Error("GMの応答が30秒以上ありません。もう一度送信してください");
    throw e;
  }
  let data;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok) {
    const detail = data && data.error ? `${data.error.type}: ${data.error.message}` : "(本文なし)";
    throw new Error(`HTTP ${res.status} — ${detail}`);
  }
  return data;
}
