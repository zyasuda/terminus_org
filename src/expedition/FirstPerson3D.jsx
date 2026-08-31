import React, { useEffect, useMemo, useRef, useState } from "react";
import { hallRoom, mapForFloor } from "./core.js";
import { hallEnemyPosition } from "./interior.js";
import { FACING_AHEAD, isOpen } from "./mapwalk.js";
import { CAM_BACK_DEFAULT, CAM_BACK_MAX, CEIL, createFirstPersonScene } from "./firstPersonScene.js";

// 一人称。壁の判断は探索・戦闘・地図と同じ isOpen / hallBlocked で、ここは入力とHUDだけを持つ。
// 3Dの組み立てと描画は firstPersonScene.js。
const COMPASS = { north: { label: "北", angle: 0 }, east: { label: "東", angle: 90 }, south: { label: "南", angle: 180 }, west: { label: "西", angle: 270 } };

export default function FirstPerson3D({ floor, onForward, onBack, onTurn, onOpenMap }) {
  const mount = useRef(null), sceneRef = useRef(null);
  // 調整はその場限り。保存すると、既定値を変えても古い値が勝って何が効いているか分からなくなる。
  const [camBack, setCamBack] = useState(CAM_BACK_DEFAULT);
  // 天井の高さ。壁が低く見えるかを実物で決めるための調整。単位: 戦闘のタイル。
  const [ceilTiles, setCeilTiles] = useState(CEIL);
  const map = useMemo(() => mapForFloor(floor), [floor.seed, floor.corridorSeed]);
  const room = useMemo(() => hallRoom(floor), [floor.seed, floor.corridorSeed]);

  // 地図が変わった時だけ組み直す。1歩ごとに作り直さない。
  // 天井を変えると壁も床も作り直しになるので、地図が変わった時と同じ扱いで組み直す。
  useEffect(() => {
    const scene = createFirstPersonScene(mount.current, map, { ceilTiles });
    sceneRef.current = scene;
    const onResize = () => scene.resize();
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); scene.dispose(); sceneRef.current = null; };
  }, [map, ceilTiles]);

  useEffect(() => { sceneRef.current?.setBack(camBack); }, [camBack, map, ceilTiles]);

  const enemy = room && !floor.hallDefeated ? hallEnemyPosition(room) : null;
  useEffect(() => {
    sceneRef.current?.render(floor.pos, floor.facing, enemy);
  }, [floor.pos.x, floor.pos.y, floor.facing, enemy?.x, enemy?.y, map, ceilTiles]);

  const [ax, ay] = FACING_AHEAD[floor.facing] || FACING_AHEAD.north;
  const canForward = isOpen(map, floor.pos.x + ax, floor.pos.y + ay);
  const compass = COMPASS[floor.facing];
  return <section style={S.shell} aria-label="一人称視点">
    <div style={S.hud}>
      <b>{room && floor.at === room.id ? room.name : map.rooms.get(floor.at)?.name || "通路"}</b>
      <span style={S.compass}>
        <svg viewBox="-12 -12 24 24" width="22" height="22" aria-hidden="true">
          <circle r="11" fill="#171b24" stroke="#4a5366"/>
          <polygon points="0,-8 4,5 0,2 -4,5" fill="#e4b064" transform={`rotate(${compass.angle})`}/>
        </svg>
        <span>{compass.label}を向いている</span>
      </span>
    </div>
    <div ref={mount} style={S.canvas} data-facing={floor.facing} data-pos={`${floor.pos.x},${floor.pos.y}`}/>
    <div style={S.controls}>
      <button style={S.turnBtn} onClick={() => onTurn("left")} aria-label="左へ旋回">↺</button>
      <div style={S.moveCol}>
        <button style={S.forwardBtn} onClick={onForward} disabled={!canForward} aria-label="前進">
          {canForward ? "前進" : "壁"}
        </button>
        <button style={S.backBtn} onClick={onBack} aria-label="後退">後退</button>
      </div>
      <button style={S.turnBtn} onClick={() => onTurn("right")} aria-label="右へ旋回">↻</button>
    </div>
    <button style={S.mapBtn} onClick={onOpenMap}>地図</button>
    {/* 見え方を決めるための調整。値が決まったら firstPersonScene.js の CAM_BACK_DEFAULT に
        固定して、この欄ごと消す(game-debug-tools)。 */}
    <details style={S.tuner}>
      <summary style={S.tunerSummary}>見え方（開発用）</summary>
      <label style={S.tunerRow}>
        後ろへ引く
        <input type="range" min="0" max={CAM_BACK_MAX} step="0.05" value={camBack}
          onChange={e => setCamBack(Number(e.target.value))} style={{ flex: 1 }}/>
        <b style={{ fontVariantNumeric: "tabular-nums" }}>{camBack.toFixed(2)}</b>タイル
      </label>
      <label style={S.tunerRow}>
        天井の高さ
        <input type="range" min="1.4" max="5" step="0.1" value={ceilTiles}
          onChange={e => setCeilTiles(Number(e.target.value))} style={{ flex: 1 }}/>
        <b style={{ fontVariantNumeric: "tabular-nums" }}>{ceilTiles.toFixed(1)}</b>タイル
      </label>
      <div style={{ ...S.tunerRow, opacity: .65 }}>
        物差し: 入口アーチ2.0 / リディア1.21 / 目の高さ1.15タイル（1タイル=1.5m）
      </div>
    </details>
  </section>;
}
const S = {
  shell: { position: "relative", width: 300, background: "#0a0d14", borderRadius: 8, overflow: "hidden", border: "1px solid #3c4354" },
  hud: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 10px", color: "#c3ccdd", fontSize: 12, background: "rgba(20,24,32,.9)" },
  compass: { display: "flex", alignItems: "center", gap: 6 },
  canvas: { width: "100%", height: 250 },
  controls: { display: "flex", justifyContent: "center", alignItems: "center", gap: 10, padding: 10, background: "rgba(20,24,32,.9)" },
  turnBtn: { background: "#2b303c", color: "#e6e8ee", border: "1px solid #4a5366", borderRadius: 8, width: 44, height: 44, fontSize: 18 },
  moveCol: { display: "flex", flexDirection: "column", gap: 6 },
  forwardBtn: { background: "#3d7fb5", color: "#fff", border: 0, borderRadius: 8, padding: "0 22px", height: 40, fontSize: 14 },
  backBtn: { background: "#2b303c", color: "#c3ccdd", border: "1px solid #4a5366", borderRadius: 8, padding: "0 22px", height: 32, fontSize: 12 },
  tuner: { borderTop: "1px solid #2b303c", background: "rgba(20,24,32,.9)", color: "#c3ccdd", fontSize: 11 },
  tunerSummary: { padding: "5px 10px", cursor: "pointer", opacity: .7 },
  tunerRow: { display: "flex", alignItems: "center", gap: 8, padding: "0 10px 8px" },
  mapBtn: { position: "absolute", top: 4, right: 6, background: "rgba(43,48,60,.9)", color: "#e6e8ee", border: "1px solid #4a5366", borderRadius: 6, padding: "5px 10px", fontSize: 12 },
};
