/* =========================================================
   ソロTRPG GMモック用 中継サーバー(要件定義 R2/R3)
   - ブラウザから API キーを隠すためだけの薄いプロキシ
   - 依存パッケージなし(Node.js 標準機能のみ、Node 18+ の組み込み fetch を利用)
   - 認証・マルチユーザー対応は行わない(localhost 前提)
   ========================================================= */
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 8787;
const API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

if (!API_KEY) {
  console.error("環境変数 ANTHROPIC_API_KEY が設定されていません。設定してから起動してください。");
  process.exit(1);
}

const MIME = { ".html": "text/html; charset=utf-8" };

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/gm") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body);
        const apiRes = await fetch(ANTHROPIC_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": API_KEY,
            "anthropic-version": ANTHROPIC_VERSION
          },
          body: JSON.stringify(payload)
        });
        const text = await apiRes.text();
        res.writeHead(apiRes.status, { "Content-Type": "application/json" });
        res.end(text);
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { type: "proxy_error", message: e.message } }));
      }
    });
    return;
  }

  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    const filePath = path.join(__dirname, "index.html");
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end("index.html が見つかりません"); return; }
      res.writeHead(200, { "Content-Type": MIME[".html"] });
      res.end(data);
    });
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

server.listen(PORT, () => {
  console.log(`中継サーバー起動: http://localhost:${PORT}`);
});
