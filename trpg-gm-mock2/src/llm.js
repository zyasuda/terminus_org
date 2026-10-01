// オンデバイス(ブラウザ内蔵)LLMへの切り替え。?llm=ondevice を付けた時だけ有効にし、
// 既定の挙動(server.cjs経由のクラウド/Ollama中継)は一切変えない。
// エンジンはモデル読み込みに数秒〜掛かるため、一度作ったら使い回す(セッション内で1回だけ初期化)
const ON_DEVICE_MODEL_PATH = "/models/gemma-4-E2B-it-web.litertlm";
let onDeviceEnginePromise = null;

function onDeviceModeEnabled() {
  return new URLSearchParams(location.search).get("llm") === "ondevice";
}

async function getOnDeviceEngine() {
  if (!onDeviceEnginePromise) {
    onDeviceEnginePromise = import("@litert-lm/core").then(({ Engine, Backend }) =>
      Engine.create({ model: ON_DEVICE_MODEL_PATH, backend: Backend.GPU_ARTISAN })
    );
  }
  return onDeviceEnginePromise;
}

// callGmApiと同じ入出力契約({content:[{text}], usage})に合わせるアダプタ。
// messagesの末尾(最新のユーザー発言)だけをsendMessageへ渡し、それより前は
// system+履歴としてpreface(会話の前提)に積む
async function callOnDeviceGm({ system, messages }) {
  const engine = await getOnDeviceEngine();
  const last = messages[messages.length - 1];
  const preface = messages.slice(0, -1);
  const conversation = await engine.createConversation({
    preface: { messages: [{ role: "system", content: system }, ...preface] }
  });
  let text;
  try {
    const result = await conversation.sendMessage(last.content);
    text = typeof result.content === "string"
      ? result.content
      : (result.content || []).filter(p => p.type === "text").map(p => p.text).join("");
  } finally {
    await conversation.delete();
  }
  return { content: [{ text }], usage: null };
}

/* プレゼン版(functions/api/gm.js)は合言葉が違うと 401 を返す。手元の server.cjs はこのヘッダを見ない。
   401 の時だけ聞き、端末に覚えさせる。同時に来た複数の 401 で何度も聞かないよう、聞いている間は1つの約束を共有する */
const PASS_KEY = "mock2_pass_v1";
let passAsking = null;
function storedPass() {
  try { return localStorage.getItem(PASS_KEY) || ""; } catch (e) { return ""; }
}
function askPass() {
  if (!passAsking) {
    passAsking = Promise.resolve().then(() => {
      const pass = window.prompt("合言葉を入れてください") || "";
      try { localStorage.setItem(PASS_KEY, pass); } catch (e) { /* no-op */ }
      return pass;
    }).finally(() => { passAsking = null; });
  }
  return passAsking;
}

export async function callGmApi({ system, messages, maxTokens = 1000 }, retried = false) {
  if (onDeviceModeEnabled()) return callOnDeviceGm({ system, messages, maxTokens });

  let res;
  try {
    res = await fetch("/api/gm", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-mock2-pass": storedPass() },
      body: JSON.stringify({
        max_tokens: maxTokens,
        system,
        messages
      }),
      signal: AbortSignal.timeout(90000) // GMが黙り込んだまま固まって見えるのを防ぐ(ローカルSLMは初回ロード・長プロンプトで30秒を超えるため90秒)
    });
  } catch (e) {
    if (e.name === "TimeoutError") throw new Error("GMの応答が90秒以上ありません。もう一度送信してください");
    throw e;
  }
  if (res.status === 401 && !retried) {
    await askPass();
    return callGmApi({ system, messages, maxTokens }, true);
  }
  let data;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok) {
    const detail = data && data.error ? `${data.error.type}: ${data.error.message}` : "(本文なし)";
    throw new Error(`HTTP ${res.status} — ${detail}`);
  }
  return data;
}
