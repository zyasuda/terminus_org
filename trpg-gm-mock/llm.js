export async function callGmApi({ system, messages, maxTokens = 1000 }) {
  const res = await fetch("/api/gm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      max_tokens: maxTokens,
      system,
      messages
    })
  });
  let data;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok) {
    const detail = data && data.error ? `${data.error.type}: ${data.error.message}` : "(本文なし)";
    throw new Error(`HTTP ${res.status} — ${detail}`);
  }
  return data;
}
