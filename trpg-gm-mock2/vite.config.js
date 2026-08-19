import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

// LAN上のiPhone実機からHTTPSでアクセスして確認するための設定。
// /api, /images は既存の server.js (LLM中継・画像配信、ポート8788) にプロキシする。
// 自己署名証明書は自動操作のブラウザに拒否されるため、PCで確認するだけのときは
// NO_SSL=1 でHTTPSを外す(iPhone実機確認では付けない。HTTPSでないとマイクが使えない)
export default defineConfig({
  plugins: [react(), ...(process.env.NO_SSL ? [] : [basicSsl()])],
  server: {
    host: true,
    proxy: {
      "/api": "http://localhost:8788",
      "/images": "http://localhost:8788"
    }
  }
});
