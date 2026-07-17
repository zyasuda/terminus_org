/* =========================================================
   TAS MVP用 中継サーバー(D-023: 第2章叩き台の生成レビュー専用)
   - trpg-gm-mock2/server.cjs のLLMプロキシを流用
   - 追加: /api/context (BORGのMarkdown読み込み)
           /api/save    (承認済みドラフトの保存)
   - 依存パッケージなし(Node 18+)
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

const PORT = process.env.PORT || 8799;

// コンテキストの取得元。別環境ではその環境のBORGパスを.envで指定する
const MOCKDOCS_DIR = process.env.MOCKDOCS_DIR ||
  "/Users/yasuda_k/Downloads/BORG/TRPG/MockDocs";
// MVP.md 3章: 入力 = CAMPAIGN_01.md + GDD/AI_DESIGNのコンテキスト
const CONTEXT_FILES = ["CAMPAIGN_01.md", "AI_DESIGN.md"];
const OUTPUT_DIR = path.join(__dirname, "output");
const CAMPAIGN_OUTPUT_DIR = process.env.CAMPAIGN_OUTPUT_DIR ||
  "/Users/yasuda_k/Desktop/Terminus/trpg-gm-mock2/public/data";
// 画像の集約先はmock2のimagesフォルダ。下書きには /images/ファイル名 のパスだけを保持する
const IMAGES_DIR = process.env.MOCK_IMAGES_DIR ||
  "/Users/yasuda_k/Desktop/Terminus/trpg-gm-mock2/images";

const KEYS = {
  anthropic: process.env.ANTHROPIC_API_KEY,
  gemini: process.env.GEMINI_API_KEY,
  openai: process.env.OPENAI_API_KEY,
  groq: process.env.GROQ_API_KEY,
  openrouter: process.env.OPENROUTER_API_KEY
};
let BACKEND = process.env.LLM_BACKEND;
if (process.env.LLM_API_KEY) {
  BACKEND = process.env.LLM_API_KEY.startsWith("AIza") ? "gemini" :
    process.env.LLM_API_KEY.startsWith("sk-ant") ? "anthropic" :
    process.env.LLM_API_KEY.startsWith("gsk_") ? "groq" :
    process.env.LLM_API_KEY.startsWith("sk-or-") ? "openrouter" : "openai";
  KEYS[BACKEND] = process.env.LLM_API_KEY;
}
if (!BACKEND) BACKEND = KEYS.anthropic ? "anthropic" : KEYS.gemini ? "gemini" :
  KEYS.groq ? "groq" : KEYS.openrouter ? "openrouter" : "openai";
const API_KEY = KEYS[BACKEND];

if (!API_KEY) {
  console.error(`バックエンド "${BACKEND}" のAPIキーが見つかりません。` +
    "trpg-gm-mock2/.env をこのフォルダへコピーするか、.env を作成してください。" +
    "対応キー: ANTHROPIC_API_KEY / GEMINI_API_KEY / OPENAI_API_KEY / GROQ_API_KEY / OPENROUTER_API_KEY");
  process.exit(1);
}
// mock2の.envで使われる別名を実モデルIDへ変換する
const MODEL_ALIASES = { "haiku-4.5": "claude-haiku-4-5", "sonnet-4.6": "claude-sonnet-4-6" };
// 生成は長文Markdown出力のため、既定モデルは各社の標準クラスにする
const configuredModel = MODEL_ALIASES[process.env.LLM_MODEL] || process.env.LLM_MODEL;
const modelMatchesBackend = configuredModel && (
  BACKEND === "anthropic" ? configuredModel.startsWith("claude") :
  BACKEND === "gemini" ? configuredModel.startsWith("gemini") :
  BACKEND === "openai" ? (configuredModel.startsWith("gpt-") || configuredModel.startsWith("o")) :
  BACKEND === "groq" ? (configuredModel.startsWith("llama") || configuredModel.startsWith("mixtral") || configuredModel.startsWith("gemma")) :
  BACKEND === "openrouter" ? configuredModel.includes("/") : false
);
const MODEL = modelMatchesBackend ? configuredModel :
  (BACKEND === "gemini" ? "gemini-2.5-flash" :
    BACKEND === "openai" ? "gpt-5.4-mini" :
    BACKEND === "groq" ? "llama-3.3-70b-versatile" :
    BACKEND === "openrouter" ? "google/gemini-2.5-flash" :
    "claude-sonnet-4-6");

/* ---- Anthropic ---- */
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
      max_tokens: payload.max_tokens || 8000,
      system: payload.system,
      messages: payload.messages
    })
  });
  const raw = await apiRes.text();
  if (!apiRes.ok) {
    let msg = raw;
    try { msg = JSON.parse(raw).error?.message || raw; } catch (e) {}
    return { status: apiRes.status, body: { error: { message: msg } } };
  }
  const data = JSON.parse(raw);
  const text = (data.content || []).map(b => b.text || "").join("");
  const u = data.usage || {};
  return { status: 200, body: { text,
    usage: { input_tokens: u.input_tokens || 0, output_tokens: u.output_tokens || 0 } } };
}

/* ---- Gemini(mock2から流用。出力はMarkdownなのでJSON強制は外す) ---- */
async function callGemini(payload) {
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
        generationConfig: { maxOutputTokens: Math.max((payload.max_tokens || 8000) * 2, 16000) }
      })
    }
  );
  const raw = await apiRes.text();
  if (!apiRes.ok) {
    let msg = raw;
    try { msg = JSON.parse(raw).error?.message || raw; } catch (e) {}
    return { status: apiRes.status, body: { error: { message: msg } } };
  }
  const data = JSON.parse(raw);
  const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
  const um = data.usageMetadata || {};
  return { status: 200, body: { text,
    usage: { input_tokens: um.promptTokenCount || 0, output_tokens: um.candidatesTokenCount || 0 } } };
}

/* ---- OpenAI(mock2から流用。JSON強制は外す) ---- */
async function callOpenAI(payload) {
  const input = (payload.messages || []).map(m => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content || "")
  }));
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
      max_output_tokens: payload.max_tokens || 8000
    })
  });
  const raw = await apiRes.text();
  if (!apiRes.ok) {
    let msg = raw;
    try { msg = JSON.parse(raw).error?.message || raw; } catch (e) {}
    return { status: apiRes.status, body: { error: { message: msg } } };
  }
  const data = JSON.parse(raw);
  const text = data.output_text || (data.output || [])
    .flatMap(o => o.content || [])
    .map(c => c.text || "")
    .join("");
  const u = data.usage || {};
  return { status: 200, body: { text,
    usage: { input_tokens: u.input_tokens || 0, output_tokens: u.output_tokens || 0 } } };
}

/* ---- Groq / OpenRouter: OpenAI互換 Chat Completions APIへ変換 ---- */
async function callOpenAICompatible(payload) {
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${API_KEY}`
  };
  const endpoint = BACKEND === "groq"
    ? "https://api.groq.com/openai/v1/chat/completions"
    : "https://openrouter.ai/api/v1/chat/completions";
  if (BACKEND === "openrouter") {
    headers["HTTP-Referer"] = process.env.OPENROUTER_SITE_URL || "http://localhost:8799";
    headers["X-Title"] = process.env.OPENROUTER_APP_NAME || "TAS";
  }
  const messages = [
    ...(payload.system ? [{ role: "system", content: String(payload.system) }] : []),
    ...(payload.messages || []).map(m => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content || "")
    }))
  ];
  const apiRes = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: MODEL,
      messages,
      max_tokens: payload.max_tokens || 8000,
      temperature: 0.7
    })
  });
  const raw = await apiRes.text();
  if (!apiRes.ok) {
    let msg = raw;
    try { msg = JSON.parse(raw).error?.message || raw; } catch (e) {}
    return { status: apiRes.status, body: { error: { message: msg } } };
  }
  const data = JSON.parse(raw);
  const text = data.choices?.[0]?.message?.content || "";
  const u = data.usage || {};
  return { status: 200, body: { text,
    usage: { input_tokens: u.prompt_tokens || 0, output_tokens: u.completion_tokens || 0 } } };
}

/* mock2の読み込み時検証(trpg-gm-mock2/src/scenario.js validate)と同一ルール。
   ここでNGを返せば、mock2側で起動時エラーになるデータを書き込まない */
function validateCampaignData(campaign, chapter) {
  const errs = [];
  const st = campaign.style || {};
  if (!st.narration || !st.readingLevel || !st.world) errs.push("campaign.style に narration/readingLevel/world が必要");
  if (!Array.isArray(campaign.companions) || campaign.companions.length === 0) {
    errs.push("campaign.companions が空");
  } else {
    campaign.companions.forEach((c, i) => {
      if (!c.id || !c.name || !c.persona) errs.push(`companions[${i}] に id/name/persona が必要`);
    });
  }
  if (!chapter.quest) errs.push("chapter.quest がない");
  if (!chapter.intro) errs.push("chapter.intro がない");
  if (!Array.isArray(chapter.scenes) || chapter.scenes.length === 0) {
    errs.push("chapter.scenes が空");
  } else {
    const ids = new Set();
    chapter.scenes.forEach((sc, i) => {
      const label = `scene ${sc.id ?? i + 1}`;
      if (!sc.brief || !sc.goal) errs.push(`${label}: brief/goal が必要`);
      if (!Array.isArray(sc.secrets)) errs.push(`${label}: secrets は配列(空でも可)が必要`);
      (sc.secrets || []).forEach(s => {
        if (!s.id || !s.entity || !s.text) errs.push(`${label}: secret に id/entity/text が必要`);
        if (ids.has(s.id)) errs.push(`secret id が重複: ${s.id}`);
        ids.add(s.id);
      });
      if (sc.enemy && (!sc.enemy.name || typeof sc.enemy.hp !== "number" || typeof sc.enemy.maxHp !== "number")) {
        errs.push(`${label}: enemy に name/hp/maxHp が必要`);
      }
      // TAS追加分: 進行ゲートが実在するsecretを指すか(scenario.jsにはない事前チェック)
      const own = new Set((sc.secrets || []).map(s => s.id));
      (sc.completeRequires?.secretsAny || []).forEach(id => {
        if (!own.has(id)) errs.push(`${label}: completeRequires.secretsAny "${id}" がこのシーンのsecretsにない`);
      });
      if (Array.isArray(sc.exits)) {
        const exitIds = new Set();
        sc.exits.forEach((exit, exitIndex) => {
          if (!exit || !Array.isArray(exit.match)) errs.push(`${label}: exits[${exitIndex}] に match 配列が必要`);
          if (!exit?.id) errs.push(`${label}: exits[${exitIndex}] に id が必要`);
          if (exit?.id && exitIds.has(exit.id)) errs.push(`${label}: exit id が重複: ${exit.id}`);
          if (exit?.id) exitIds.add(exit.id);
          if (exit && exit.to !== null && exit.to !== "end" && !Number.isFinite(Number(exit.to))) {
            errs.push(`${label}: exits[${exitIndex}].to は数値/null/end が必要`);
          }
          const req = exit?.requires || {};
          [...(req.secretsAny || []), ...(req.secretsAll || [])].forEach(id => {
            if (!own.has(id)) errs.push(`${label}: exits[${exitIndex}] の条件 "${id}" がこのシーンのsecretsにない`);
          });
        });
      }
    });
  }
  return errs;
}

function readBody(req) {
  return new Promise(resolve => {
    let body = "";
    req.on("data", c => { body += c; });
    req.on("end", () => resolve(body));
  });
}

const server = http.createServer(async (req, res) => {
  const json = (status, obj) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(obj));
  };

  // コンテキスト読み込み: BORGのMarkdown(プロンプト注入用) + data/のJSON(表示専用)を返す
  if (req.method === "GET" && req.url === "/api/context") {
    const files = {};
    for (const name of CONTEXT_FILES) {
      try {
        files[name] = fs.readFileSync(path.join(MOCKDOCS_DIR, name), "utf-8");
      } catch (e) {
        return json(500, { error: { message: `${name} を読めません: ${e.message}` } });
      }
    }
    // dataFilesはプロンプトへ注入しない(③真相を含む構造化データのため表示のみ)
    // ベースデータはmock2のpublic/data(エクスポート先)を正とする。二重管理による巻き戻り防止。
    // mock2側が無い環境ではTAS/data/のスナップショットへフォールバックする
    const dataFiles = {};
    const dataDir = fs.existsSync(CAMPAIGN_OUTPUT_DIR) ? CAMPAIGN_OUTPUT_DIR : path.join(__dirname, "data");
    if (fs.existsSync(dataDir)) {
      for (const name of fs.readdirSync(dataDir).filter(n => n.endsWith(".json"))) {
        try { dataFiles[name] = fs.readFileSync(path.join(dataDir, name), "utf-8"); } catch (e) {}
      }
    }
    return json(200, { dir: MOCKDOCS_DIR, files, dataFiles, backend: BACKEND, model: MODEL });
  }

  // LLM呼び出し
  if (req.method === "POST" && req.url === "/api/llm") {
    try {
      const payload = JSON.parse(await readBody(req));
      const call = () => BACKEND === "gemini" ? callGemini(payload) :
        BACKEND === "openai" ? callOpenAI(payload) :
        ["groq", "openrouter"].includes(BACKEND) ? callOpenAICompatible(payload) :
        callAnthropic(payload);
      let result = await call();
      if (result.status === 429) {
        const m = /retry in ([\d.]+)/i.exec(result.body.error?.message || "");
        const waitMs = Math.min((m ? parseFloat(m[1]) : 30) * 1000 + 1500, 65000);
        console.log(`429検知: ${Math.round(waitMs / 1000)}秒待って自動リトライ`);
        await new Promise(r => setTimeout(r, waitMs));
        result = await call();
      }
      return json(result.status, result.body);
    } catch (e) {
      return json(500, { error: { message: e.message } });
    }
  }

  // 承認済みドラフトの保存(output/へ。BORGへの反映は人間が行う)
  if (req.method === "POST" && req.url === "/api/save") {
    try {
      const { filename, content } = JSON.parse(await readBody(req));
      if (!content) return json(400, { error: { message: "contentが空です" } });
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      const name = path.basename(filename || "CHAPTER_02_draft.md");
      const filePath = path.join(OUTPUT_DIR, name);
      fs.writeFileSync(filePath, content, "utf-8");
      return json(200, { saved: filePath });
    } catch (e) {
      return json(500, { error: { message: e.message } });
    }
  }

  // TASで確認したキャンペーンデータをゲームmockのpublic/dataへ反映する
  if (req.method === "POST" && req.url === "/api/export-campaign") {
    try {
      const payload = JSON.parse(await readBody(req));
      if (!payload.campaign || !payload.chapter || !payload.chapterFile) {
        return json(400, { error: { message: "campaign / chapter / chapterFile が必要です" } });
      }
      const errs = validateCampaignData(payload.campaign, payload.chapter);
      if (errs.length) {
        return json(400, { error: { message: "検証エラー(mock2読み込み仕様):\n・" + errs.join("\n・") } });
      }
      const chapterFile = path.basename(payload.chapterFile);
      if (!/^chapter_\d+\.json$/.test(chapterFile)) {
        return json(400, { error: { message: "chapterFile は chapter_XX.json 形式にしてください" } });
      }
      fs.mkdirSync(CAMPAIGN_OUTPUT_DIR, { recursive: true });
      const campaignPath = path.join(CAMPAIGN_OUTPUT_DIR, "campaign.json");
      const chapterPath = path.join(CAMPAIGN_OUTPUT_DIR, chapterFile);
      fs.writeFileSync(campaignPath, JSON.stringify(payload.campaign, null, 2) + "\n", "utf-8");
      fs.writeFileSync(chapterPath, JSON.stringify(payload.chapter, null, 2) + "\n", "utf-8");
      return json(200, { saved: [campaignPath, chapterPath], dir: CAMPAIGN_OUTPUT_DIR });
    } catch (e) {
      return json(500, { error: { message: e.message } });
    }
  }

  // 画像アップロード: mock2のimagesフォルダへ保存し、参照パスを返す
  if (req.method === "POST" && req.url === "/api/upload-image") {
    try {
      const { filename, dataUrl } = JSON.parse(await readBody(req));
      const m = /^data:image\/(\w+);base64,(.+)$/s.exec(dataUrl || "");
      if (!m) return json(400, { error: { message: "dataUrlが不正です(image/*のbase64のみ)" } });
      const safe = path.basename(String(filename || "image")).replace(/[^\w.-]+/g, "_");
      const name = /\.(png|jpe?g|gif|webp)$/i.test(safe) ? safe : `${safe}.${m[1] === "jpeg" ? "jpg" : m[1]}`;
      fs.mkdirSync(IMAGES_DIR, { recursive: true });
      fs.writeFileSync(path.join(IMAGES_DIR, name), Buffer.from(m[2], "base64"));
      return json(200, { url: `/images/${name}` });
    } catch (e) {
      return json(500, { error: { message: e.message } });
    }
  }

  // 画像配信: mock2のimagesフォルダから返す
  if (req.method === "GET" && req.url.startsWith("/images/")) {
    const name = path.basename(decodeURIComponent(req.url.slice("/images/".length).split("?")[0]));
    fs.readFile(path.join(IMAGES_DIR, name), (err, data) => {
      if (err) { res.writeHead(404); res.end("image not found"); return; }
      const type = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp" }[path.extname(name).toLowerCase()] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": type });
      res.end(data);
    });
    return;
  }

  if (req.method === "GET" && ["/", "/index.html", "/marked.min.js"].includes(req.url)) {
    const name = req.url === "/" ? "index.html" : path.basename(req.url);
    fs.readFile(path.join(__dirname, name), (err, data) => {
      if (err) { res.writeHead(404); res.end(`${name} が見つかりません`); return; }
      const type = name.endsWith(".js") ? "text/javascript; charset=utf-8" : "text/html; charset=utf-8";
      res.writeHead(200, { "Content-Type": type });
      res.end(data);
    });
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`TASサーバー起動: http://localhost:${PORT} (バックエンド: ${BACKEND} / モデル: ${MODEL})`);
  console.log(`コンテキスト取得元: ${MOCKDOCS_DIR}`);
});

process.on("uncaughtException", e => console.error("uncaughtException:", e));
process.on("unhandledRejection", e => console.error("unhandledRejection:", e));
