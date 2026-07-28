import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import AssetCheck from "./AssetCheck.jsx";
import BattleView from "./battle/BattleView.jsx";
import "./styles.css";

// 戦闘グリッドは物語シーンとは完全に別画面(/battle)。データ受け渡しはPhase 4で繋ぐ
const ROUTES = { "/asset-check": AssetCheck, "/battle": BattleView };
const Page = ROUTES[window.location.pathname] || App;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Page />
  </React.StrictMode>
);
