/*
 * TAS ローカルサーバー
 * - TAS/data を正本としてブラウザへ渡す
 * - 選択画像を mock2/images へ保存する
 * - mock2 のキャンペーン出力先へ書き出す
 * - LLM のAPIキーをブラウザへ出さない
 */
const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const PORT = Number(process.env.PORT || 8799);

function loadEnv() {
  const envFile = path.join(ROOT, '.env');
  if (!fs.existsSync(envFile)) return;
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const text = line.trim();
    if (!text || text.startsWith('#')) continue;
    const separator = text.indexOf('=');
    if (separator < 1) continue;
    const key = text.slice(0, separator).trim();
    const value = text.slice(separator + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnv();

const MOCK2_DIR = process.env.MOCK2_DIR || '/Users/yasuda_k/Desktop/Terminus/trpg-gm-mock2';
const MOCK2_IMAGES_DIR = path.join(MOCK2_DIR, 'images');
const MOCK2_CAMPAIGNS_DIR = path.join(MOCK2_DIR, 'public', 'data', 'campaigns');
const MOCK2_ASSETS_FILE = path.join(MOCK2_DIR, 'public', 'data', 'assets.json');
/* ゲーム側はこの索引を読んでからキャンペーン本体を読む。ここを更新しないと、
   キャンペーンIDが変わった時にゲームは古いディレクトリを読み続ける。
   2026-08-04に実測: TASのIDが lanternhill に変わっていたのに索引は campaign を指しており、
   出力しても一切届いていなかった(文体レバーが無い・出口が1つしかない等の原因) */
const MOCK2_CAMPAIGNS_INDEX_FILE = path.join(MOCK2_DIR, 'public', 'data', 'campaigns.json');
const MOCKDOCS_DIR = process.env.MOCKDOCS_DIR || '';

const KEYS = {
  anthropic: process.env.ANTHROPIC_API_KEY,
  gemini: process.env.GEMINI_API_KEY,
  openai: process.env.OPENAI_API_KEY,
  groq: process.env.GROQ_API_KEY,
  openrouter: process.env.OPENROUTER_API_KEY
};
let BACKEND = process.env.LLM_BACKEND || '';
if (process.env.LLM_API_KEY) {
  BACKEND = process.env.LLM_API_KEY.startsWith('AIza') ? 'gemini'
    : process.env.LLM_API_KEY.startsWith('sk-ant') ? 'anthropic'
    : process.env.LLM_API_KEY.startsWith('gsk_') ? 'groq'
    : process.env.LLM_API_KEY.startsWith('sk-or-') ? 'openrouter'
    : 'openai';
  KEYS[BACKEND] = process.env.LLM_API_KEY;
}
if (!BACKEND) BACKEND = KEYS.anthropic ? 'anthropic' : KEYS.gemini ? 'gemini' : KEYS.openai ? 'openai' : KEYS.groq ? 'groq' : KEYS.openrouter ? 'openrouter' : 'ollama';
const API_KEY = KEYS[BACKEND];
const DEFAULT_MODELS = {
  anthropic: 'claude-haiku-4-5', gemini: 'gemini-flash-latest', openai: 'gpt-5.4-mini',
  groq: 'llama-3.3-70b-versatile', openrouter: 'google/gemini-flash-latest', ollama: 'gemma4:e4b'
};
const MODEL = process.env.LLM_MODEL || DEFAULT_MODELS[BACKEND] || DEFAULT_MODELS.ollama;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif'
};

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
function error(res, status, message) { json(res, status, { error: { message } }); }
function safeFileName(value, fallback) {
  const name = path.basename(String(value || '')).replace(/[^A-Za-z0-9._-]/g, '_');
  return name && name !== '.' && name !== '..' ? name : fallback;
}
function safeSegment(value, fallback) {
  const name = path.basename(String(value || '')).replace(/[^A-Za-z0-9_-]/g, '_');
  return name && name !== '.' && name !== '..' ? name : fallback;
}
function readBody(req, limit = 40 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', chunk => { size += chunk.length; if (size > limit) { reject(new Error('リクエストが大きすぎます')); req.destroy(); } else chunks.push(chunk); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
async function readJsonBody(req) { return JSON.parse(await readBody(req)); }
async function listDataFiles() {
  const files = {};
  for (const name of await fsp.readdir(DATA_DIR)) {
    if (!/^campaign\.json$|^chapter_.*\.json$/i.test(name)) continue;
    files[name.toLowerCase()] = await fsp.readFile(path.join(DATA_DIR, name), 'utf8');
  }
  return files;
}
async function contextResponse() {
  const files = {};
  if (MOCKDOCS_DIR && fs.existsSync(MOCKDOCS_DIR)) {
    for (const name of ['CAMPAIGN_01.md', 'AI_DESIGN.md']) {
      const source = path.join(MOCKDOCS_DIR, name);
      if (fs.existsSync(source)) files[name] = await fsp.readFile(source, 'utf8');
    }
  }
  return { backend: BACKEND, model: MODEL, files, dataFiles: await listDataFiles() };
}
function dataUrlBuffer(dataUrl) {
  const match = /^data:image\/[a-z0-9.+-]+;base64,([\s\S]+)$/i.exec(String(dataUrl || ''));
  if (!match) throw new Error('画像データの形式が不正です');
  return Buffer.from(match[1], 'base64');
}
function mergeAssetsLedger(ledger, exportedAssets) {
  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger) || !ledger.assets || typeof ledger.assets !== 'object' || Array.isArray(ledger.assets)) throw new Error('素材台帳の形式が不正です');
  const assets = ledger.assets;
  const exportedByFile = new Map();
  for (const asset of Object.values(exportedAssets)) {
    if (!asset || typeof asset !== 'object' || !asset.file) continue;
    const file = safeFileName(asset.file, '');
    if (!file) continue;
    const usedBy = Array.isArray(asset.usedBy) ? [...new Set(asset.usedBy.filter(value => typeof value === 'string'))].sort() : [];
    exportedByFile.set(file, { ...asset, file, usedBy });
  }
  const existingByFile = new Map();
  for (const [id, asset] of Object.entries(assets)) if (asset && typeof asset === 'object' && asset.file) existingByFile.set(asset.file, { id, asset });
  // "ui." で始まるusedByは、mock2のコードからの直参照を人間が手で登録したもの。
  // TASの出力には現れないため、上書きせず残す(残さないとgm_mascotの"ui.stage.gmPet"が消える)。
  const keepManualUsedBy = usedBy => (Array.isArray(usedBy) ? usedBy : []).filter(value => typeof value === 'string' && value.startsWith('ui.'));
  const added = [];
  for (const [file, exported] of exportedByFile) {
    const existing = existingByFile.get(file);
    if (existing) assets[existing.id] = { ...existing.asset, usedBy: [...new Set([...keepManualUsedBy(existing.asset.usedBy), ...exported.usedBy])].sort() };
    else {
      const baseId = safeSegment(path.parse(file).name, 'asset'); let id = baseId; let suffix = 2;
      while (assets[id]) id = `${baseId}_${suffix++}`;
      assets[id] = { file, kind: exported.kind, status: 'candidate', usedBy: exported.usedBy }; added.push(file);
    }
  }
  for (const { id, asset } of existingByFile.values()) if (!exportedByFile.has(asset.file)) assets[id] = { ...asset, usedBy: keepManualUsedBy(asset.usedBy) };
  return { ledger: { ...ledger, updated: new Date().toISOString().slice(0, 10), assets }, added };
}
/* campaigns.json(ゲーム側の索引)へ、今回出力したキャンペーンを反映する。
   他のキャンペーン・他の章の登録は決して壊さない。同じidの要素だけを更新し、無ければ追加する。
   title/version/defaultChapter は新しい値が無ければ既存を維持する(空で上書きして消さない)。
   defaultCampaign は作者が選んだものなので、未設定のときだけ埋める。 */
function mergeCampaignsIndex(index, { campaignId, chapterId, chapterFile, campaign, chapter }) {
  const list = Array.isArray(index.campaigns) ? index.campaigns : [];
  const at = list.findIndex(entry => entry && entry.id === campaignId);
  const prev = at >= 0 ? list[at] : {};
  const meta = (campaign && campaign.meta) || {};
  const prevChapters = Array.isArray(prev.chapters) ? prev.chapters : [];
  const chapterAt = prevChapters.findIndex(entry => entry && entry.id === chapterId);
  const prevChapter = chapterAt >= 0 ? prevChapters[chapterAt] : {};
  const nextChapter = {
    ...prevChapter,
    id: chapterId,
    title: (chapter && chapter.title) || prevChapter.title || chapterId,
    file: `campaigns/${campaignId}/${chapterFile}`
  };
  const chapters = chapterAt >= 0
    ? prevChapters.map((entry, i) => (i === chapterAt ? nextChapter : entry))
    : [...prevChapters, nextChapter];
  const entry = {
    ...prev,
    id: campaignId,
    title: meta.title || prev.title || campaignId,
    version: meta.version || prev.version || '0.1',
    campaign: `campaigns/${campaignId}/campaign.json`,
    defaultChapter: chapterId || prev.defaultChapter || (chapters[0] && chapters[0].id) || '',
    chapters
  };
  const campaigns = at >= 0 ? list.map((x, i) => (i === at ? entry : x)) : [...list, entry];
  return { ...index, campaigns, defaultCampaign: index.defaultCampaign || campaignId };
}
async function serveFile(res, file, cache = 'no-store') {
  try {
    const body = await fsp.readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': cache });
    res.end(body);
  } catch { res.writeHead(404); res.end('Not Found'); }
}

function llmMessages(payload) {
  return (payload.messages || []).map(message => ({ role: message.role === 'assistant' ? 'assistant' : 'user', content: String(message.content || '') }));
}
async function llmCall(payload) {
  if (!API_KEY && BACKEND !== 'ollama') throw new Error(`バックエンド「${BACKEND}」のAPIキーが設定されていません`);
  let response;
  if (BACKEND === 'anthropic') {
    response = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: MODEL, max_tokens: payload.max_tokens || 1000, system: payload.system || '', messages: llmMessages(payload) }) });
    const body = await response.json();
    if (!response.ok) throw Object.assign(new Error(body.error?.message || `HTTP ${response.status}`), { status: response.status });
    return { text: (body.content || []).map(item => item.text || '').join(''), usage: { input_tokens: body.usage?.input_tokens || 0, output_tokens: body.usage?.output_tokens || 0 } };
  }
  if (BACKEND === 'gemini') {
    const contents = [];
    for (const message of llmMessages(payload)) {
      const role = message.role === 'assistant' ? 'model' : 'user'; const previous = contents.at(-1);
      if (previous?.role === role) previous.parts[0].text += `\n\n${message.content}`; else contents.push({ role, parts: [{ text: message.content }] });
    }
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': API_KEY }, body: JSON.stringify({ system_instruction: { parts: [{ text: payload.system || '' }] }, contents, generationConfig: { maxOutputTokens: payload.max_tokens || 1000, thinkingConfig: { thinkingLevel: 'minimal' } } }) });
    const body = await response.json();
    if (!response.ok) throw Object.assign(new Error(body.error?.message || `HTTP ${response.status}`), { status: response.status });
    return { text: (body.candidates?.[0]?.content?.parts || []).map(item => item.text || '').join(''), usage: { input_tokens: body.usageMetadata?.promptTokenCount || 0, output_tokens: body.usageMetadata?.candidatesTokenCount || 0 } };
  }
  if (BACKEND === 'openai') {
    response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` }, body: JSON.stringify({ model: MODEL, instructions: payload.system || '', input: llmMessages(payload), max_output_tokens: payload.max_tokens || 1000 }) });
    const body = await response.json();
    if (!response.ok) throw Object.assign(new Error(body.error?.message || `HTTP ${response.status}`), { status: response.status });
    return { text: body.output_text || (body.output || []).flatMap(item => item.content || []).map(item => item.text || '').join(''), usage: { input_tokens: body.usage?.input_tokens || 0, output_tokens: body.usage?.output_tokens || 0 } };
  }
  if (BACKEND === 'ollama') {
    response = await fetch(`${process.env.OLLAMA_HOST || 'http://localhost:11434'}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: payload.system || '' }, ...llmMessages(payload)], stream: false, think: false, options: { num_predict: payload.max_tokens || 1000, num_ctx: Number(process.env.OLLAMA_NUM_CTX) || 16384 } }) });
    const body = await response.json();
    if (!response.ok) throw Object.assign(new Error(body.error || `HTTP ${response.status}`), { status: response.status });
    return { text: body.message?.content || '', usage: { input_tokens: body.prompt_eval_count || 0, output_tokens: body.eval_count || 0 } };
  }
  const endpoint = BACKEND === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` };
  if (BACKEND === 'openrouter') { headers['HTTP-Referer'] = process.env.OPENROUTER_SITE_URL || `http://localhost:${PORT}`; headers['X-Title'] = process.env.OPENROUTER_APP_NAME || 'TAS'; }
  response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: payload.system || '' }, ...llmMessages(payload)], max_tokens: payload.max_tokens || 1000, temperature: 0.2 }) });
  const body = await response.json();
  if (!response.ok) throw Object.assign(new Error(body.error?.message || `HTTP ${response.status}`), { status: response.status });
  return { text: body.choices?.[0]?.message?.content || '', usage: { input_tokens: body.usage?.prompt_tokens || 0, output_tokens: body.usage?.completion_tokens || 0 } };
}
async function callLlmOnceWithRetry(payload) {
  try { return await llmCall(payload); }
  catch (error) {
    if (error.status !== 429) throw error;
    await new Promise(resolve => setTimeout(resolve, 1500));
    return llmCall(payload);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method === 'GET' && url.pathname === '/api/context') return json(res, 200, await contextResponse());
    if (req.method === 'POST' && url.pathname === '/api/upload-image') {
      const payload = await readJsonBody(req); const filename = safeFileName(payload.filename, 'image.png');
      await fsp.mkdir(MOCK2_IMAGES_DIR, { recursive: true }); await fsp.writeFile(path.join(MOCK2_IMAGES_DIR, filename), dataUrlBuffer(payload.dataUrl));
      return json(res, 200, { url: `/images/${filename}` });
    }
    if (req.method === 'POST' && url.pathname === '/api/export-campaign') {
      const payload = await readJsonBody(req); const campaignId = safeSegment(payload.campaignId, 'campaign');
      const chapterFile = safeFileName(payload.chapterFile, 'chapter_01.json'); const targetDir = path.join(MOCK2_CAMPAIGNS_DIR, campaignId);
      await fsp.mkdir(targetDir, { recursive: true });
      const entries = [{ path: `${campaignId}/campaign.json`, absolute: path.join(targetDir, 'campaign.json'), value: payload.campaign || {} }, { path: `${campaignId}/${chapterFile}`, absolute: path.join(targetDir, chapterFile), value: payload.chapter || {} }];
      let assetsAdded = [];
      if (payload.assets && typeof payload.assets === 'object' && !Array.isArray(payload.assets) && Object.keys(payload.assets).length) {
        let ledger;
        try { ledger = JSON.parse(await fsp.readFile(MOCK2_ASSETS_FILE, 'utf8')); }
        catch (cause) { throw new Error(`素材台帳を読み込めません: ${cause.message}`); }
        const merged = mergeAssetsLedger(ledger, payload.assets);
        entries.push({ path: 'assets.json', absolute: MOCK2_ASSETS_FILE, value: merged.ledger });
        assetsAdded = merged.added;
      }
      /* 索引(campaigns.json)を追随させる。ここを飛ばすと、キャンペーンIDが変わった瞬間に
         ゲームは古いディレクトリを読み続け、出力が一切届かなくなる。
         読めない場合は中断する——作り直すと他のキャンペーンの登録が消えるため */
      {
        let index;
        try { index = JSON.parse(await fsp.readFile(MOCK2_CAMPAIGNS_INDEX_FILE, 'utf8')); }
        catch (cause) { throw new Error(`キャンペーン索引(campaigns.json)を読み込めません: ${cause.message}`); }
        const chapterId = safeSegment(payload.chapterId, chapterFile.replace(/\.json$/, ''));
        entries.push({
          path: 'campaigns.json', absolute: MOCK2_CAMPAIGNS_INDEX_FILE,
          value: mergeCampaignsIndex(index, { campaignId, chapterId, chapterFile, campaign: payload.campaign, chapter: payload.chapter })
        });
      }
      const files = [];
      for (const entry of entries) { const content = `${JSON.stringify(entry.value, null, 2)}\n`; await fsp.writeFile(entry.absolute, content, 'utf8'); files.push({ path: entry.path, content }); }
      return json(res, 200, { saved: files.map(file => file.path), files, assetsAdded });
    }
    if (req.method === 'POST' && url.pathname === '/api/llm') {
      const result = await callLlmOnceWithRetry(await readJsonBody(req)); return json(res, 200, result);
    }
    if (req.method === 'GET' && url.pathname.startsWith('/images/')) return serveFile(res, path.join(MOCK2_IMAGES_DIR, safeFileName(url.pathname, '')),'no-store');
    if (req.method === 'GET') {
      const requested = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
      const target = path.resolve(ROOT, requested);
      if (!target.startsWith(`${ROOT}${path.sep}`) && target !== path.join(ROOT, 'index.html')) return error(res, 403, '許可されていないパスです');
      return serveFile(res, target, 'no-store');
    }
    error(res, 404, 'Not Found');
  } catch (cause) { error(res, 500, cause.message || 'サーバーエラー'); }
});

/* HOST を指定できるようにする。既定は従来どおり全インターフェース。
   ループバックへの bind しか許さない実行環境（サンドボックス）では HOST=127.0.0.1 を渡す。 */
const HOST = process.env.HOST || undefined;
/* listen が失敗したときの理由を標準エラーへ出す。出さないと呼び出し側が code 1 しか受け取れない */
server.on('error', cause => { console.error(`TASサーバーを起動できません (${HOST || '0.0.0.0'}:${PORT}): ${cause.code || ''} ${cause.message}`); process.exit(1) });
server.listen(PORT, HOST, () => console.log(`TASサーバー起動: http://localhost:${PORT} (LLM: ${BACKEND} / ${MODEL})`));
