/* =========================================================
   戦闘グリッド 検証画面(Phase 1)  /battle で開く

   物語シーンとは完全に別画面。ここでは手触りの確認だけを行う。
   盤面の確定は core.js、描画は view3d.js、この層は「入力」と「表示」を繋ぐだけ。

   語りについて:
     決定どおり、結果はGMが語ってログに残す形にする。ただしPhase 1では
     LLMを繋がず、確定結果から組み立てた定型文をログへ流す。
     Phase 4でmock2本体に接続する際、この文言生成をGMの語りへ差し替える。
   ========================================================= */

import React, { useEffect, useRef, useState } from "react";
import { createBattleScene } from "./view3d.js";
import {
  createGrid, isAdjacent, movePointsFor, reachableCells,
  turnOrder, resolveMelee, chooseEnemyAction
} from "./core.js";

/* --- 検証用の固定盤面(deterministic fixture) ---
   8x8では移動力が盤面のほぼ全域に届いて位置取りの意味が薄れたため、12x10へ広げ、
   遮蔽になる壁を左右対称に置いた。移動力3〜5で一辺のおよそ1/3を進める見当 */
const GRID = createGrid([
  "............",
  "..#......#..",
  "..#..##..#..",
  ".....##.....",
  "............",
  "............",
  ".....##.....",
  "..#..##..#..",
  "..#......#..",
  "............"
]);

// 開始位置。?fixture=melee で「すでに隣接している」状態から始められる
// (交戦中の挙動を毎回同じ手順で確認するため)
const START = {
  default: { gareth: [1, 4], lydia: [1, 5], rust1: [10, 4], rust2: [10, 5] },
  melee: { gareth: [5, 4], lydia: [4, 4], rust1: [6, 4], rust2: [6, 5] }
};

const makeUnits = () => {
  const name = new URLSearchParams(location.search).get("fixture");
  const p = START[name] || START.default;
  return [
    { id: "gareth", name: "ガレス", side: "party", x: p.gareth[0], y: p.gareth[1], hp: 16, maxHp: 16, atk: 3, agility: 7, defenseDc: 12, height: 2 },
    { id: "lydia", name: "リディア", side: "party", x: p.lydia[0], y: p.lydia[1], hp: 14, maxHp: 14, atk: 2, agility: 4, defenseDc: 12, height: 1.9 },
    { id: "rust1", name: "錆喰い", side: "enemy", x: p.rust1[0], y: p.rust1[1], hp: 10, maxHp: 10, atk: 2, agility: 5, defenseDc: 12, height: 0.8 },
    { id: "rust2", name: "錆喰い(2)", side: "enemy", x: p.rust2[0], y: p.rust2[1], hp: 10, maxHp: 10, atk: 2, agility: 5, defenseDc: 12, height: 0.8 }
  ];
};

const rollD20 = () => 1 + Math.floor(Math.random() * 20);

const initialState = () => {
  const units = makeUnits();
  return { units, order: turnOrder(units).map(u => u.id), turn: 0, hasMoved: false, log: ["戦闘開始。"] };
};

const alive = (units, side) => units.some(u => u.side === side && u.hp > 0);

export default function BattleView() {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const [state, setState] = useState(initialState);

  const { units, order, turn, hasMoved } = state;
  const active = units.find(u => u.id === order[turn] && u.hp > 0) || null;
  const partyAlive = alive(units, "party");
  const enemyAlive = alive(units, "enemy");
  const over = !partyAlive || !enemyAlive;

  /* --- シーンの生成と破棄 --- */
  useEffect(() => {
    const s = createBattleScene(mountRef.current, GRID);
    sceneRef.current = s;
    return () => { s.dispose(); sceneRef.current = null; };
  }, []);

  /* --- 手番の解決 --- */
  const endTurn = () => setState(s => {
    // 生存している次のユニットへ送る。1周しても居なければそのまま
    for (let i = 1; i <= s.order.length; i++) {
      const next = (s.turn + i) % s.order.length;
      const u = s.units.find(x => x.id === s.order[next]);
      if (u && u.hp > 0) return { ...s, turn: next, hasMoved: false };
    }
    return s;
  });

  // 結果を先に確定させてから、演出と状態更新をそれぞれ行う。
  // 演出は見た目だけで、確定した結果を変えない
  const attack = (attacker, target) => {
    const r = resolveMelee({ attacker, target, units, roll: rollD20 });
    if (!r.ok) return;
    const view = sceneRef.current;
    if (r.hit) view?.playHit(target.x, target.y, { crit: r.crit, damage: r.damage, unitId: target.id });
    else view?.playMiss(target.x, target.y);

    setState(s => {
      const lines = [];
      if (!r.hit) {
        lines.push(`${attacker.name}の攻撃は${r.fumble ? "大きく外れ、体勢を崩した" : "外れた"}(d20=${r.d20})。`);
        return { ...s, log: [...s.log, ...lines] };
      }
      const cur = s.units.find(u => u.id === target.id);
      const hp = Math.max(0, cur.hp - r.damage);
      lines.push(
        `${attacker.name}の攻撃が${r.crit ? "深々と" : ""}命中(d20=${r.d20})。` +
        `${target.name}に${r.damage}ダメージ(残りHP ${hp}/${cur.maxHp})。` +
        (r.surround >= 2 ? `${r.surround}人で囲んでいる(×${r.multiplier.toFixed(2)})。` : "")
      );
      if (hp <= 0) lines.push(`${target.name}は倒れた。`);
      return {
        ...s,
        units: s.units.map(u => (u.id === target.id ? { ...u, hp } : u)),
        log: [...s.log, ...lines]
      };
    });
  };

  const moveTo = (unit, x, y) => setState(s => ({
    ...s,
    units: s.units.map(u => (u.id === unit.id ? { ...u, x, y } : u)),
    hasMoved: true
  }));

  /* --- 敵の手番は自動で進める --- */
  useEffect(() => {
    if (over || !active || active.side !== "enemy") return;
    const t = setTimeout(() => {
      const act = chooseEnemyAction(GRID, active, units);
      if (act.type === "attack") {
        const target = units.find(u => u.id === act.targetId);
        if (target) attack(active, target);
      } else if (act.type === "move") {
        moveTo(active, act.to.x, act.to.y);
      }
      setTimeout(endTurn, 350);
    }, 500);
    return () => clearTimeout(t);
  }, [active?.id, turn, over]);

  /* --- ハイライトと入力 --- */
  const playerTurn = !!active && active.side === "party" && !over;
  const reach = playerTurn && !hasMoved
    ? reachableCells(GRID, active, movePointsFor(active.agility), units.filter(u => u.hp > 0 && u.id !== active.id))
    : [];
  const targets = playerTurn
    ? units.filter(u => u.side === "enemy" && u.hp > 0 && isAdjacent(active, u))
    : [];

  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    const highlights = [
      ...reach.map(c => ({ x: c.x, y: c.y, kind: "reach" })),
      ...targets.map(t => ({ x: t.x, y: t.y, kind: "target" }))
    ];
    s.sync(units, highlights, active?.id ?? null, targets.map(t => t.id));
    s.setPickHandler(data => {
      if (!playerTurn) return;
      if (data.kind === "unit") {
        const t = units.find(u => u.id === data.id);
        if (t && targets.some(x => x.id === t.id)) { attack(active, t); endTurn(); }
        return;
      }
      if (data.kind === "cell" && !hasMoved && reach.some(c => c.x === data.x && c.y === data.y)) {
        moveTo(active, data.x, data.y);
      }
    });
  });

  const status = !partyAlive ? "敗北" : !enemyAlive ? "勝利" : null;

  return (
    <div style={S.page}>
      <div ref={mountRef} style={S.canvas} />

      <div style={S.hud}>
        <div style={S.row}>
          <strong style={{ color: "#f2df7e" }}>
            {status ? `—— ${status} ——` : active ? `${active.name} の手番` : "—"}
          </strong>
          <span style={S.dim}>
            {playerTurn && (hasMoved ? "移動済み" : `移動力 ${movePointsFor(active.agility)}`)}
          </span>
        </div>

        <div style={S.row}>
          {units.map(u => (
            <span key={u.id} style={{ ...S.chip, opacity: u.hp > 0 ? 1 : 0.35,
              borderColor: u.side === "party" ? "#6f9ad3" : "#c4634a" }}>
              {u.name} {u.hp}/{u.maxHp}
            </span>
          ))}
        </div>

        <div style={S.row}>
          <button style={S.btn} onClick={() => sceneRef.current?.rotate(-1)}>◀ 視点</button>
          <button style={S.btn} onClick={() => sceneRef.current?.rotate(1)}>視点 ▶</button>
          <button style={S.btn} disabled={!playerTurn} onClick={endTurn}>ターン終了</button>
          <button style={S.btn} onClick={() => setState(initialState())}>最初から</button>
        </div>

        <div style={S.hint}>
          青いマス=移動先 / 赤いマス=攻撃できる相手。攻撃するとターンが終わる。
        </div>

        {/* GMの語りはログに残す(Phase 1は定型文。Phase 4でGMの語りへ差し替える) */}
        <div style={S.log}>
          {state.log.slice(-8).map((l, i) => <div key={i}>{l}</div>)}
        </div>
      </div>
    </div>
  );
}

const S = {
  page: { position: "fixed", inset: 0, background: "#161a22", color: "#e6e8ee",
    font: "13px/1.6 system-ui, sans-serif", display: "flex", flexDirection: "column" },
  canvas: { flex: 1, minHeight: 0 },
  hud: { padding: "10px 14px calc(10px + env(safe-area-inset-bottom))",
    background: "rgba(20,24,32,.92)", borderTop: "1px solid #2b303c" },
  row: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 },
  dim: { color: "#8b93a7" },
  chip: { border: "1px solid", borderRadius: 999, padding: "1px 9px", fontSize: 12 },
  btn: { background: "#2b303c", color: "#e6e8ee", border: "1px solid #3c4354",
    borderRadius: 6, padding: "5px 11px", cursor: "pointer", font: "inherit" },
  hint: { color: "#8b93a7", fontSize: 12, marginBottom: 6 },
  log: { maxHeight: 116, overflowY: "auto", background: "#11141b",
    border: "1px solid #2b303c", borderRadius: 6, padding: "6px 9px" }
};
