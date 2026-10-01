import React, { useEffect, useState } from "react";

/* 見た目の数値を作者が実機で決めるためのチューナー。URLに ?tune を付けた時だけ出る。
   動かした値は :root のCSS変数(styles.css 冒頭)へ即座に反映し、この端末に覚えさせる。
   決まった値は styles.css の既定値へ書き戻す。ここで覚えた値は ?tune の時しか使わない */
const KNOBS = [
  { key: "--font-scale", label: "文字の大きさ", min: 0.8, max: 1.8, step: 0.05 },
  { key: "--tab-scale", label: "開閉タブの大きさ", min: 1, max: 3, step: 0.1 },
];
const STORE = "mock2_tune_v1";

function load() {
  try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; }
}

export default function Tuner() {
  const [vals, setVals] = useState(() => {
    const saved = load();
    return Object.fromEntries(KNOBS.map(k => [k.key, saved[k.key] ?? 1]));
  });
  const [open, setOpen] = useState(true);

  useEffect(() => {
    for (const [key, v] of Object.entries(vals)) document.documentElement.style.setProperty(key, String(v));
    try { localStorage.setItem(STORE, JSON.stringify(vals)); } catch (e) { /* no-op */ }
  }, [vals]);

  return (
    <div id="tuner" className={open ? "" : "closed"}>
      <button onClick={() => setOpen(o => !o)}>{open ? "チューナーを畳む" : "調整"}</button>
      {open && KNOBS.map(k => (
        <label key={k.key}>
          <span>{k.label} <b>×{vals[k.key].toFixed(2)}</b></span>
          <input type="range" min={k.min} max={k.max} step={k.step} value={vals[k.key]}
            onChange={e => setVals(v => ({ ...v, [k.key]: Number(e.target.value) }))} />
        </label>
      ))}
      {open && <button onClick={() => setVals(Object.fromEntries(KNOBS.map(k => [k.key, 1])))}>元に戻す</button>}
    </div>
  );
}
