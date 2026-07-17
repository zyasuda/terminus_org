import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import AssetCheck from "./AssetCheck.jsx";
import "./styles.css";

const Page = window.location.pathname === "/asset-check" ? AssetCheck : App;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Page />
  </React.StrictMode>
);
