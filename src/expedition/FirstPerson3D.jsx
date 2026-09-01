import React, { useEffect, useMemo, useRef, useState } from "react";
import Compass from "./Compass.jsx";
import { hallRoom, mapForFloor, pendingBattleObstaclesFor } from "./core.js";
import { hallEnemyPosition } from "./interior.js";
import { FACING_AHEAD, isOpen } from "./mapwalk.js";
import { CAM_BACK_DEFAULT, CAM_BACK_MAX, CEIL, createFirstPersonScene } from "./firstPersonScene.js";

// 一人称。壁の判断は探索・戦闘・地図と同じ isOpen / hallBlocked で、ここは入力とHUDだけを持つ。
// 3Dの組み立てと描画は firstPersonScene.js。
// 障害物の先読み表示を一時的に止める(2026-09-01、作者の指示)。pendingBattleObstaclesFor
// 自体とその検査(core.test.mjs)は残したまま、表示だけ止める。戻す時はtrueにするだけでよい。
const OBSTACLES_ON = false;

export default function FirstPerson3D({ floor, onForward, onBack, onTurn, onOpenMap, lanternOn, onToggleLantern }) {
  const mount = useRef(null), sceneRef = useRef(null);
  // 調整はその場限り。保存すると、既定値を変えても古い値が勝って何が効いているか分からなくなる。
  const [camBack, setCamBack] = useState(CAM_BACK_DEFAULT);
  // 天井の高さ。壁が低く見えるかを実物で決めるための調整。単位は一人称の内部単位。
  const [ceilTiles, setCeilTiles] = useState(CEIL);
  // 3D画面の縦の高さ。操作ボタンをどれだけ下げるかを実物で決める(2026-09-01、作者の指示)。
  const [canvasHeight, setCanvasHeight] = useState(400);
  const map = useMemo(() => mapForFloor(floor), [floor.seed, floor.corridorSeed]);
  const room = useMemo(() => hallRoom(floor), [floor.seed, floor.corridorSeed]);
  // 通路戦・大部屋戦の障害物。入っている部屋(floor.at)とその戦闘の決着(events/hallDefeated)が
  // 変わった時だけ組み直せばよい。1歩ごとに作り直すと歩くたびに乱数を引き直すことになる。
  const obstacles = useMemo(() => OBSTACLES_ON ? pendingBattleObstaclesFor(floor) : [],
    [floor.seed, floor.at, floor.events, floor.hallDefeated]);

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
  useEffect(() => { sceneRef.current?.setLanternOn(lanternOn); }, [lanternOn, map, ceilTiles]);
  // 高さを変えた分をレンダラーへ反映する(画面のresizeイベントは飛ばないため)。
  useEffect(() => { sceneRef.current?.resize(); }, [canvasHeight]);
  // 障害物だけの差し替え。壁・床・カメラの組み直し(上のeffect)にぶら下げると、
  // 部屋⇄通路の境目をまたぐたびにシーン全体が作り直され、歩行アニメが毎回リセットされる
  // (2026-09-01、実際にこの不具合を作って踏んだ)。
  useEffect(() => { sceneRef.current?.setObstacles(obstacles); }, [obstacles, map, ceilTiles]);

  const enemy = room && !floor.hallDefeated ? hallEnemyPosition(room) : null;
  useEffect(() => {
    sceneRef.current?.render(floor.pos, floor.facing, enemy);
  }, [floor.pos.x, floor.pos.y, floor.facing, enemy?.x, enemy?.y, map, ceilTiles]);

  const [ax, ay] = FACING_AHEAD[floor.facing] || FACING_AHEAD.north;
  const canForward = isOpen(map, floor.pos.x + ax, floor.pos.y + ay);
  // 「地下1階」は今のところ唯一のフロアなので固定値。フロアが増えたらfloor側から読む形にする。
  const placeName = room && floor.at === room.id ? room.name : map.rooms.get(floor.at)?.name || "通路";
  return <section style={S.shell} aria-label="一人称視点">
    <div style={S.hud}>
      <b>地下 1F : {placeName}</b>
    </div>
    <div style={S.stage}>
      <div ref={mount} style={{ ...S.canvas, height: canvasHeight }} data-facing={floor.facing} data-pos={`${floor.pos.x},${floor.pos.y}`}/>
      {/* バトルと同じ位置・大きさのコンパス(2026-09-01、作者の指示)。 */}
      {/* 一人称は常に前を向いているので、常に進行方向上(headingUp)で表示する
          (2026-09-01、作者の指示。南を向いているならSが真上に来るのが正しい)。 */}
      <div style={S.compassSlot}><Compass facing={floor.facing} headingUp/></div>
    </div>
    <div style={S.controls}>
      <button style={S.turnBtn} onClick={() => onTurn("left")} aria-label="左へ旋回">↺</button>
      <div style={S.moveCol}>
        <button style={S.forwardBtn} onClick={onForward} disabled={!canForward} aria-label="前進">
          {canForward ? "前進" : "壁"}
        </button>
        <button style={S.backBtn} onClick={onBack} aria-label="後退">後退</button>
      </div>
      <button style={S.turnBtn} onClick={() => onTurn("right")} aria-label="右へ旋回">↻</button>
      {/* 角の三角ボタン(2026-09-01、作者の指示・下絵どおりの試作)。左は仮置き(灯りは
          まだ何も繋がっていない)、右は元々あった地図ボタンをここへ移しただけ。 */}
      <button style={{ ...S.cornerBtnLeft, opacity: lanternOn ? 1 : .55 }} onClick={onToggleLantern} aria-label="灯り">
        <span style={S.cornerLabelLeft}>灯り</span>
      </button>
      <button style={S.cornerBtnRight} onClick={onOpenMap} aria-label="地図">
        <span style={S.cornerLabelRight}>Map</span>
      </button>
    </div>
    {/* 見え方を決めるための調整。値が決まったら firstPersonScene.js の CAM_BACK_DEFAULT に
        固定して、この欄ごと消す(game-debug-tools)。 */}
    <details style={S.tuner}>
      <summary style={S.tunerSummary}>見え方（開発用）</summary>
      <label style={S.tunerRow}>
        後ろへ引く
        <input type="range" min="0" max={CAM_BACK_MAX} step="0.05" value={camBack}
          onChange={e => setCamBack(Number(e.target.value))} style={{ flex: 1 }}/>
        <b style={{ fontVariantNumeric: "tabular-nums" }}>{camBack.toFixed(2)}</b>
      </label>
      <label style={S.tunerRow}>
        天井の高さ
        <input type="range" min="1.4" max="5" step="0.1" value={ceilTiles}
          onChange={e => setCeilTiles(Number(e.target.value))} style={{ flex: 1 }}/>
        <b style={{ fontVariantNumeric: "tabular-nums" }}>{ceilTiles.toFixed(1)}</b>
      </label>
      <label style={S.tunerRow}>
        画面の高さ
        <input type="range" min="200" max="600" step="10" value={canvasHeight}
          onChange={e => setCanvasHeight(Number(e.target.value))} style={{ flex: 1 }}/>
        <b style={{ fontVariantNumeric: "tabular-nums" }}>{canvasHeight}</b>
      </label>
      <div style={{ ...S.tunerRow, opacity: .65 }}>
        物差し: 1マス=3.0 / 天井=1マス / 入口アーチ2.0 / リディア1.21 / 目の高さ1.15
      </div>
    </details>
  </section>;
}
const S = {
  shell: { position: "relative", width: "100%", background: "#0a0d14", borderRadius: 8, overflow: "hidden", border: "1px solid #3c4354" },
  hud: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 10px", color: "#c3ccdd", fontSize: 12, background: "rgba(20,24,32,.9)" },
  stage: { position: "relative" },
  canvas: { width: "100%", height: 250 },
  compassSlot: { position: "absolute", top: -22, right: 4 },
  controls: { position: "relative", display: "flex", justifyContent: "center", alignItems: "center", gap: 10, padding: 10, background: "rgba(20,24,32,.9)" },
  turnBtn: { background: "#2b303c", color: "#e6e8ee", border: "1px solid #4a5366", borderRadius: 8, width: 44, height: 44, fontSize: 18 },
  moveCol: { display: "flex", flexDirection: "column", gap: 6 },
  forwardBtn: { background: "#3d7fb5", color: "#fff", border: 0, borderRadius: 8, padding: "0 22px", height: 40, fontSize: 14 },
  backBtn: { background: "#2b303c", color: "#c3ccdd", border: "1px solid #4a5366", borderRadius: 8, padding: "0 22px", height: 32, fontSize: 12 },
  tuner: { borderTop: "1px solid #2b303c", background: "rgba(20,24,32,.9)", color: "#c3ccdd", fontSize: 11 },
  tunerSummary: { padding: "5px 10px", cursor: "pointer", opacity: .7 },
  tunerRow: { display: "flex", alignItems: "center", gap: 8, padding: "0 10px 8px" },
  // 角の三角ボタン(2026-09-01、作者の指示で下絵どおり左上・右上へ)。controls帯の
  // 左上・右上を斜めに切り取る。上に置くのは技術的な制約ではなく、最初に左右下へ
  // 置いてしまっただけ(2026-09-01)。
  cornerBtnLeft: { position: "absolute", left: 0, top: 0, width: 56, height: 56, clipPath: "polygon(0 0, 100% 0, 0 100%)", background: "#2b303c", border: 0, display: "flex", alignItems: "flex-start", justifyContent: "flex-start", padding: "6px 0 0 6px" },
  cornerBtnRight: { position: "absolute", right: 0, top: 0, width: 56, height: 56, clipPath: "polygon(0 0, 100% 0, 100% 100%)", background: "#2b303c", border: 0, display: "flex", alignItems: "flex-start", justifyContent: "flex-end", padding: "6px 6px 0 0" },
  cornerLabelLeft: { color: "#e6e8ee", fontSize: 11 },
  cornerLabelRight: { color: "#e6e8ee", fontSize: 11 },
};
