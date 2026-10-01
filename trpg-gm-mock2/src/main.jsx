import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import AssetCheck from "./AssetCheck.jsx";
import BattleView from "./battle/BattleView.jsx";
import LlmOnDeviceTest from "./LlmOnDeviceTest.jsx";
import Tuner from "./Tuner.jsx";
import "./styles.css";

// 戦闘グリッドは物語シーンとは完全に別画面(/battle)。データ受け渡しはPhase 4で繋ぐ。
// /llm-ondevice-testはGemma 4のブラウザ内オンデバイス推論の検証用で、
// 本編(src/engine)・Ollama中継(server.cjs)とは完全に独立している
const ROUTES = { "/asset-check": AssetCheck, "/battle": BattleView, "/llm-ondevice-test": LlmOnDeviceTest };
const Page = ROUTES[window.location.pathname] || App;
// ?tune の時だけ、文字やタブの大きさを動かすチューナーを重ねる(作者が実機で数値を決める用)
const tuning = new URLSearchParams(window.location.search).has("tune");

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Page />
    {tuning && <Tuner />}
  </React.StrictMode>
);
