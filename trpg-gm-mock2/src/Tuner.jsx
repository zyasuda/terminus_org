import React, { useEffect, useState } from "react";

/* 見た目の数値を作者が実機で決めるためのチューナー。URLに ?tune を付けた時だけ出る。
   動かした値は :root のCSS変数(styles.css 冒頭)へ即座に反映し、この端末に覚えさせる。
   決まった値は styles.css の既定値へ書き戻す。ここで覚えた値は ?tune の時しか使わない */
// def は styles.css の :root と同じ値にする(「元に戻す」で戻る先)。unit は CSS 変数の単位
const KNOBS = [
  { key: "--font-scale", label: "文字の大きさ", min: 0.8, max: 1.8, step: 0.05, def: 1.3, unit: "", fmt: v => "×" + v.toFixed(2) },
  { key: "--tab-scale", label: "開閉タブの大きさ", min: 1, max: 3, step: 0.1, def: 1.4, unit: "", fmt: v => "×" + v.toFixed(2) },
  { key: "--tab-top", label: "開閉タブの縦位置", min: 0, max: 30, step: 1, def: 8, unit: "%", fmt: v => v + "%" },
  { key: "--portrait-scale", label: "同行者の立ち絵", min: 1, max: 2, step: 0.05, def: 1.1, unit: "", fmt: v => "×" + v.toFixed(2) },
  { key: "--npc-scale", label: "マイラ等の立ち絵", min: 1, max: 2, step: 0.05, def: 1.5, unit: "", fmt: v => "×" + v.toFixed(2) },
];
// 既定値を変えたら番号を上げる(古い既定を基準に覚えた値を読まないため)
const STORE = "mock2_tune_v4";

function load() {
  try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; }
}

export default function Tuner() {
  const [vals, setVals] = useState(() => {
    const saved = load();
    return Object.fromEntries(KNOBS.map(k => [k.key, saved[k.key] ?? k.def]));
  });
  const [open, setOpen] = useState(true);

  useEffect(() => {
    for (const k of KNOBS) document.documentElement.style.setProperty(k.key, vals[k.key] + k.unit);
    try { localStorage.setItem(STORE, JSON.stringify(vals)); } catch (e) { /* no-op */ }
  }, [vals]);

  return (
    <div id="tuner" className={open ? "" : "closed"}>
      <button onClick={() => setOpen(o => !o)}>{open ? "チューナーを畳む" : "調整"}</button>
      {open && KNOBS.map(k => (
        <label key={k.key}>
          <span>{k.label} <b>{k.fmt(vals[k.key])}</b></span>
          <input type="range" min={k.min} max={k.max} step={k.step} value={vals[k.key]}
            onChange={e => setVals(v => ({ ...v, [k.key]: Number(e.target.value) }))} />
        </label>
      ))}
      {open && <button onClick={() => setVals(Object.fromEntries(KNOBS.map(k => [k.key, k.def])))}>元に戻す</button>}
    </div>
  );
}
