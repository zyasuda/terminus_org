import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

// LAN上のiPhone実機からHTTPSでアクセスして確認するための設定。
// /api, /images は既存の server.js (LLM中継・画像配信、ポート8788) にプロキシする。
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    host: true,
    proxy: {
      "/api": "http://localhost:8788",
      "/images": "http://localhost:8788"
    }
  }
});
