/* =========================================================
   Gemma 4 オンデバイス推論 検証画面   /llm-ondevice-test で開く

   本編(src/engine)・Ollama中継(server.cjs)とは完全に独立。
   ブラウザ内で.litertlmモデルを直接読み込み、WebGPU経由で推論する
   (@litert-lm/core、旧MediaPipe LLM Inference APIの後継)。

   システムプロンプトの3プリセット(文体ガイドのみ/フル日本語指示/フル英語指示)を
   切り替えて、初トークンまでの時間・生成完了までの時間・出力内容を見比べるための
   検証専用ページ。プリセットの中身はサンプルなので、実際に比較したい
   依頼・シーン・秘密の文面に書き換えて使う想定。
   ========================================================= */

import { useRef, useState } from "react";

// モデルファイルは巨大(2GB前後)なのでリポジトリには含めない(.gitignore済み)。
// public/models/ に配置すればこのパスでそのまま読み込める
const MODEL_PATH = "/models/gemma-4-E2B-it-web.litertlm";

const PRESETS = {
  style: {
    label: "(1) 文体ガイドのみ",
    prompt:
      "あなたはTRPGのゲームマスターです。常に日本語で、簡潔で臨場感のある地の文で応答してください。" +
      "プレイヤーへの問いかけで締めくくり、説明口調やメタ的な発言はしないでください。"
  },
  jaFull: {
    label: "(2) フル・日本語指示",
    prompt:
      "あなたはTRPGのゲームマスターです。常に日本語で、簡潔で臨場感のある地の文で応答してください。\n\n" +
      "# 依頼\n廃坑の奥で行方不明になった調査隊を探してほしいと、村長から依頼された。\n\n" +
      "# シーン\n一行は今、崩れかけた坑道の分岐点に立っている。左は水音がし、右からは微かな灯りが漏れている。\n\n" +
      "# 秘密(プレイヤーには明かさない)\n右の灯りの先には、坑道を封鎖した張本人である密輸業者たちが潜んでいる。" +
      "この事実は、プレイヤーが確たる証拠を掴むか、直接問い詰めるまで明かしてはならない。"
  },
  enFull: {
    label: "(3) フル・英語指示(出力は日本語)",
    prompt:
      "You are the Game Master for a tabletop RPG. Always respond in Japanese, with concise, atmospheric narration. " +
      "End each response with a prompt for the player's next action. Do not explain rules or break character.\n\n" +
      "# Request\nThe village chief has asked the party to find a missing survey team last seen in an old mine.\n\n" +
      "# Scene\nThe party stands at a fork in a collapsing mine shaft. Water drips from the left passage; " +
      "a faint light flickers from the right.\n\n" +
      "# Secret (never reveal to the player directly)\nSmugglers who sealed off the mine are hiding down the right " +
      "passage. Do not reveal this fact until the player finds solid evidence or directly confronts them about it."
  }
};

const fmtMs = ms => (ms == null ? "—" : `${Math.round(ms)}ms`);

export default function LlmOnDeviceTest() {
  const engineRef = useRef(null);
  const [modelPath, setModelPath] = useState(MODEL_PATH);
  const [presetKey, setPresetKey] = useState("style");
  const [systemPrompt, setSystemPrompt] = useState(PRESETS.style.prompt);
  const [userInput, setUserInput] = useState("坑道の奥を調べる。");
  const [status, setStatus] = useState("idle"); // idle | loading | ready | generating | error
  const [error, setError] = useState("");
  const [timings, setTimings] = useState({ loadMs: null, firstTokenMs: null, totalMs: null });
  const [output, setOutput] = useState("");
  // gemma-4-*-web.litertlmはモデルファイル自体にsection_backend_constraint: gpu_artisan
  // が埋め込まれており(CPUを選ぶと対応するデコードモデルが見つからず読み込みに失敗する
  // ことを実機ログで確認済み)、GPU_ARTISAN以外では動かない。切り分け用にCPU/GPUも
  // 選べるようにはしてあるが、既定はモデルが要求するGPU_ARTISANにする
  const [backendKey, setBackendKey] = useState("GPU_ARTISAN");

  const applyPreset = key => {
    setPresetKey(key);
    setSystemPrompt(PRESETS[key].prompt);
  };

  const loadModel = async () => {
    setStatus("loading");
    setError("");
    const t0 = performance.now();
    try {
      // 動的importにしてあるのは、モデル未配置でもこのページ自体は開けるようにするため
      const { Engine, Backend } = await import("@litert-lm/core");
      if (engineRef.current) await engineRef.current.delete();
      engineRef.current = await Engine.create({ model: modelPath, backend: Backend[backendKey] });
      setTimings(t => ({ ...t, loadMs: performance.now() - t0 }));
      setStatus("ready");
    } catch (e) {
      setError(String(e?.message || e));
      setStatus("error");
    }
  };

  const send = async () => {
    if (!engineRef.current) return;
    setStatus("generating");
    setError("");
    setOutput("");
    setTimings(t => ({ ...t, firstTokenMs: null, totalMs: null }));

    const t0 = performance.now();
    try {
      const conversation = await engineRef.current.createConversation({
        preface: { messages: [{ role: "system", content: systemPrompt }] }
      });
      const stream = conversation.sendMessageStreaming(userInput);
      const reader = stream.getReader();
      let firstTokenMs = null;
      let text = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = typeof value.content === "string"
          ? value.content
          : (value.content || []).filter(p => p.type === "text").map(p => p.text).join("");
        if (chunk) {
          if (firstTokenMs == null) {
            firstTokenMs = performance.now() - t0;
            setTimings(t => ({ ...t, firstTokenMs }));
          }
          text += chunk;
          setOutput(text);
        }
      }

      setTimings(t => ({ ...t, totalMs: performance.now() - t0 }));
      await conversation.delete();
      setStatus("ready");
    } catch (e) {
      setError(String(e?.message || e));
      setStatus("error");
    }
  };

  return (
    <div style={S.page}>
      <h1 style={S.h1}>Gemma 4 オンデバイス推論 検証</h1>
      <p style={S.hint}>
        本編・Ollama中継とは無関係の検証ページ。モデルは<code>public/models/</code>に置いた
        <code>.litertlm</code>ファイルをブラウザ内(WebGPU)でそのまま実行する。
      </p>

      <div style={S.row}>
        <label style={S.label}>モデルパス</label>
        <input style={S.input} value={modelPath} onChange={e => setModelPath(e.target.value)} />
      </div>

      <div style={S.row}>
        <label style={S.label}>バックエンド</label>
        <select style={S.input} value={backendKey} onChange={e => setBackendKey(e.target.value)}>
          <option value="GPU_ARTISAN">GPU_ARTISAN(このモデルが要求するバックエンド)</option>
          <option value="GPU">GPU</option>
          <option value="CPU">CPU(このモデルでは動かない見込み)</option>
        </select>
        <button style={S.btn} onClick={loadModel} disabled={status === "loading" || status === "generating"}>
          {status === "loading" ? "読み込み中…" : "モデルを読み込む"}
        </button>
        <span style={S.dim}>状態: {status} / 読み込み {fmtMs(timings.loadMs)}</span>
      </div>

      <div style={S.row}>
        <label style={S.label}>プリセット</label>
        {Object.entries(PRESETS).map(([key, p]) => (
          <button
            key={key}
            style={{ ...S.btn, ...(presetKey === key ? S.btnActive : {}) }}
            onClick={() => applyPreset(key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div style={S.col}>
        <label style={S.label}>システムプロンプト(編集可)</label>
        <textarea style={S.textareaLarge} value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} />
      </div>

      <div style={S.col}>
        <label style={S.label}>プレイヤーの発言</label>
        <textarea style={S.textarea} value={userInput} onChange={e => setUserInput(e.target.value)} />
        <button style={S.btn} onClick={send} disabled={status !== "ready" && status !== "generating"}>
          {status === "generating" ? "生成中…" : "生成"}
        </button>
      </div>

      <div style={S.row}>
        <span style={S.dim}>初トークン {fmtMs(timings.firstTokenMs)}</span>
        <span style={S.dim}>生成完了 {fmtMs(timings.totalMs)}</span>
      </div>

      {error && <div style={S.error}>{error}</div>}

      <div style={S.col}>
        <label style={S.label}>出力</label>
        <div style={S.output}>{output || "（まだ生成していません）"}</div>
      </div>
    </div>
  );
}

const S = {
  page: { maxWidth: 820, margin: "0 auto", padding: "20px 16px 60px", font: "14px/1.7 system-ui, sans-serif", color: "#1c1f26" },
  h1: { fontSize: 20, marginBottom: 4 },
  hint: { color: "#666", fontSize: 13, marginBottom: 18 },
  row: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 },
  col: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 },
  label: { fontWeight: 600, fontSize: 13, minWidth: 110 },
  input: { flex: 1, minWidth: 200, padding: "6px 8px", font: "inherit", border: "1px solid #ccc", borderRadius: 4 },
  textarea: { width: "100%", minHeight: 60, padding: "8px 10px", font: "inherit", border: "1px solid #ccc", borderRadius: 4 },
  textareaLarge: { width: "100%", minHeight: 180, padding: "8px 10px", font: "inherit", border: "1px solid #ccc", borderRadius: 4 },
  btn: { background: "#2b303c", color: "#fff", border: "1px solid #3c4354", borderRadius: 6, padding: "6px 12px", cursor: "pointer", font: "inherit" },
  btnActive: { background: "#3d7fb5", borderColor: "#3d7fb5" },
  dim: { color: "#666", fontSize: 13 },
  error: { color: "#b23a3a", background: "#fdeeee", border: "1px solid #f2c2c2", borderRadius: 6, padding: "8px 10px", marginBottom: 16, whiteSpace: "pre-wrap" },
  output: { whiteSpace: "pre-wrap", background: "#f7f7f9", border: "1px solid #ddd", borderRadius: 6, padding: "12px 14px", minHeight: 120 }
};
