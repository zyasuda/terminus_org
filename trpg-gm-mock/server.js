/* =========================================================
   ソロTRPG GMモック用 中継サーバー(要件定義 R2/R3)
   - ブラウザから API キーを隠すためだけの薄いプロキシ
   - 依存パッケージなし(Node.js 標準機能のみ、Node 18+ の組み込み fetch を利用)
   - 認証・マルチユーザー対応は行わない(localhost 前提)

   2026-07-03改修: Anthropic / Gemini の両対応。
   2026-07-07改修: OpenAI backendを追加。
   キーの形式で自動判別する(sk-ant…→Anthropic、AIza…→Gemini、sk-…→OpenAI)。
   フロントエンド(index.html)は常に Anthropic Messages API 形式で送ってくる。
   ========================================================= */
const http = require("http");
const fs = require("fs");
const path = require("path");

// .env ファイルを読み込む
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const [key, ...valueParts] = trimmed.split("=");
      const envKey = key.trim();
      if (!process.env[envKey]) process.env[envKey] = valueParts.join("=").trim();
    }
  });
}

const PORT = process.env.PORT || 8787;

// 複数のキーを併存させ、LLM_BACKEND(anthropic|gemini|openai)で使う方を選ぶ。
// LLM_API_KEY(単一キー)が渡された場合はキーの形式で自動判別する。
const KEYS = {
  anthropic: process.env.ANTHROPIC_API_KEY,
  gemini: process.env.GEMINI_API_KEY,
  openai: process.env.OPENAI_API_KEY
};
let BACKEND = process.env.LLM_BACKEND;
if (process.env.LLM_API_KEY) {
  BACKEND = process.env.LLM_API_KEY.startsWith("AIza") ? "gemini" :
    process.env.LLM_API_KEY.startsWith("sk-ant") ? "anthropic" : "openai";
  KEYS[BACKEND] = process.env.LLM_API_KEY;
}
if (!BACKEND) BACKEND = KEYS.anthropic ? "anthropic" : KEYS.gemini ? "gemini" : "openai"; // 既定は既存互換でAnthropic優先
const API_KEY = KEYS[BACKEND];

if (!API_KEY) {
  console.error(`バックエンド "${BACKEND}" のAPIキーが見つかりません。` +
    ".env の ANTHROPIC_API_KEY / GEMINI_API_KEY / OPENAI_API_KEY と LLM_BACKEND を確認してください。");
  process.exit(1);
}
// LLM_MODELがバックエンドと食い違う場合(例: anthropicなのにgemini-*)は無視して既定値を使う
const envModel = process.env.LLM_MODEL;
function normalizeModel(backend, model) {
  if (!model) return null;
  if (backend === "anthropic") {
    const aliases = {
      "haiku-4.5": "claude-haiku-4-5",
      "sonnet-4.6": "claude-sonnet-4-6"
    };
    return aliases[model] || model;
  }
  return model;
}
const normalizedEnvModel = normalizeModel(BACKEND, envModel);
const modelMatchesBackend = normalizedEnvModel &&
  (BACKEND === "gemini" ? normalizedEnvModel.startsWith("gemini") :
    BACKEND === "openai" ? (normalizedEnvModel.startsWith("gpt-") || normalizedEnvModel.startsWith("o")) :
    normalizedEnvModel.startsWith("claude"));
const MODEL = modelMatchesBackend ? normalizedEnvModel :
  (BACKEND === "gemini" ? "gemini-2.5-flash" :
    BACKEND === "openai" ? "gpt-5.4-mini" :
    "claude-haiku-4-5");
if (envModel && !modelMatchesBackend) {
  console.warn(`LLM_MODEL="${envModel}" はバックエンド"${BACKEND}"と不一致のため無視し、既定値 ${MODEL} を使います。`);
}
const MODEL_INFO = {
  backend: BACKEND,
  model: MODEL,
  configuredModel: envModel || null,
  normalizedConfiguredModel: normalizedEnvModel || null,
  configuredModelAccepted: Boolean(modelMatchesBackend),
  source: envModel && modelMatchesBackend ? "LLM_MODEL" : "backend default"
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8"
};

/* ---- Anthropic: フロントの形式をほぼそのまま転送 ---- */
async function callAnthropic(payload) {
  const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: payload.max_tokens || 1000,
      system: payload.system,
      messages: payload.messages
    })
  });
  const raw = await apiRes.text();
  if (!apiRes.ok) {
    let msg = raw;
    try { msg = JSON.parse(raw).error?.message || raw; } catch (e) {}
    return { status: apiRes.status, body: { error: { type: "anthropic_error", message: msg } } };
  }
  const data = JSON.parse(raw);
  const text = (data.content || []).map(b => b.text || "").join("");
  // usage(トークン消費)を素通しする。フロント側で通算表示・コスト概算に使う
  const u = data.usage || {};
  return { status: 200, body: { content: [{ type: "text", text }],
    usage: { input_tokens: u.input_tokens || 0, output_tokens: u.output_tokens || 0 } } };
}

/* ---- Gemini: Anthropic形式 → generateContent 形式に変換 ---- */
async function callGemini(payload) {
  // Gemini は同一ロールの連続に弱いため、連続する同ロールは1つに結合する
  const contents = [];
  for (const m of payload.messages || []) {
    const role = m.role === "assistant" ? "model" : "user";
    const text = String(m.content);
    const last = contents[contents.length - 1];
    if (last && last.role === role) last.parts[0].text += "\n\n" + text;
    else contents.push({ role, parts: [{ text }] });
  }
  const apiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": API_KEY },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: payload.system || "" }] },
        contents,
        generationConfig: {
          // 思考モデル対策: 思考トークンがmaxOutputTokensを消費するため上限を大きめに取り、思考は最小化する
          maxOutputTokens: Math.max((payload.max_tokens || 1000) * 4, 4000),
          thinkingConfig: { thinkingBudget: 0 },
          // GMの応答は常にJSONを要求している(R4-9)ため、JSON出力を強制する
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
  // GeminiのusageMetadataをAnthropic形式に合わせて素通しする
  const um = data.usageMetadata || {};
  return { status: 200, body: { content: [{ type: "text", text }],
    usage: { input_tokens: um.promptTokenCount || 0, output_tokens: um.candidatesTokenCount || 0 } } };
}

/* ---- OpenAI: Responses APIへ変換 ---- */
async function callOpenAI(payload) {
  const input = (payload.messages || []).map(m => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content || "")
  }));
  if (!input.some(m => /json/i.test(m.content))) {
    input.unshift({ role: "user", content: "Return JSON only." });
  }
  const apiRes = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      instructions: payload.system || "",
      input,
      max_output_tokens: payload.max_tokens || 1000,
      text: { format: { type: "json_object" } },
      reasoning: { effort: process.env.OPENAI_REASONING_EFFORT || "none" }
    })
  });
  const raw = await apiRes.text();
  if (!apiRes.ok) {
    let msg = raw;
    try { msg = JSON.parse(raw).error?.message || raw; } catch (e) {}
    return { status: apiRes.status, body: { error: { type: "openai_error", message: msg } } };
  }
  const data = JSON.parse(raw);
  const text = data.output_text || (data.output || [])
    .flatMap(o => o.content || [])
    .map(c => c.text || "")
    .join("");
  const u = data.usage || {};
  return { status: 200, body: { content: [{ type: "text", text }],
    usage: { input_tokens: u.input_tokens || 0, output_tokens: u.output_tokens || 0 } } };
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/api/model-info") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(MODEL_INFO));
    return;
  }

  if (req.method === "POST" && req.url === "/api/gm") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body);
        const call = () => BACKEND === "gemini" ? callGemini(payload) :
          BACKEND === "openai" ? callOpenAI(payload) :
          callAnthropic(payload);
        let result = await call();
        // 無料枠のレート制限(429)は、指示された待ち時間だけ待って1回だけ自動リトライする。
        // プレイヤーには「エラー」ではなく「少し長い待ち」として見せる
        if (result.status === 429) {
          const m = /retry in ([\d.]+)/i.exec(result.body.error?.message || "");
          const waitMs = Math.min((m ? parseFloat(m[1]) : 30) * 1000 + 1500, 65000);
          console.log(`429検知: ${Math.round(waitMs / 1000)}秒待って自動リトライ`);
          await new Promise(r => setTimeout(r, waitMs));
          result = await call();
        }
        res.writeHead(result.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result.body));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { type: "proxy_error", message: e.message } }));
      }
    });
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/images/")) {
    const name = path.basename(decodeURIComponent(req.url)); // basename でパストラバーサルを防ぐ
    fs.readFile(path.join(__dirname, "images", name), (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      const type = name.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
      res.writeHead(200, { "Content-Type": type, "Cache-Control": "max-age=3600" });
      res.end(data);
    });
    return;
  }

  if (req.method === "GET" && ["/", "/index.html", "/app.js", "/scenario.js", "/state.js", "/chronicle.js", "/llm.js", "/styles.css"].includes(req.url)) {
    const name = req.url === "/" ? "index.html" : path.basename(req.url);
    const filePath = path.join(__dirname, name);
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end(`${name} が見つかりません`); return; }
      res.writeHead(200, { "Content-Type": MIME[path.extname(name)] || "text/plain; charset=utf-8" });
      res.end(data);
    });
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

server.listen(PORT, () => {
  console.log(`中継サーバー起動: http://localhost:${PORT} (バックエンド: ${BACKEND} / モデル: ${MODEL})`);
});

// プレイセッション中の不意のプロセス死を防ぐ(原因はログに残して生存を優先)
process.on("uncaughtException", e => console.error("uncaughtException:", e));
process.on("unhandledRejection", e => console.error("unhandledRejection:", e));
