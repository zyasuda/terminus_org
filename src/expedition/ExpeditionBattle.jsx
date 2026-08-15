import React, { useEffect, useRef, useState } from "react";
import { createBattleScene } from "../battle/view3d.js";
import { createGrid, chooseEnemyAction, isAdjacent, isWalkable, movePointsFor, occupiedBy, reachableCells, resolveMelee, resolveRanged, turnOrder } from "../battle/core.js";
import { ITEMS } from "./core.js";

const roll = () => 1 + Math.floor(Math.random() * 20);
const GUARDIAN_ROWS = ["########", "#......#", "#......#", "#......#", "#......#", "#......#", "#......#", "########"];
// 通路遭遇は横7×縦3の一車線。前衛が通路を塞ぎ、リディアは後方から援護する。
const CORRIDOR_ROWS = ["#######", "#.....#", "#######"];
const stats = (baseAtk, baseHp, gear = {}) => ({ atk: baseAtk + [gear.weapon, gear.charm].reduce((n, id) => n + (id && ITEMS[id]?.stat === "atk" ? ITEMS[id].power : 0), 0), hp: baseHp + (gear.armor && ITEMS[gear.armor]?.stat === "hp" ? ITEMS[gear.armor].power : 0) });
const makeState = (guardian, equipment = {}, party = {}) => {
  const hero = stats(3, 16, equipment.hero), mage = stats(2, 12, equipment.mage);
  const grid = createGrid(guardian ? GUARDIAN_ROWS : CORRIDOR_ROWS);
  const units = [
    { id: "hero", name: "あなた", side: "party", x: guardian ? 1 : 2, y: guardian ? 3 : 1, hp: Math.min(hero.hp, party.hero ?? hero.hp), maxHp: hero.hp, atk: hero.atk, agility: 7, height: 1.6, modelId: "gareth" },
    { id: "mage", name: "リディア", side: "party", x: 1, y: guardian ? 4 : 1, hp: Math.min(mage.hp, party.mage ?? mage.hp), maxHp: mage.hp, atk: mage.atk, agility: 5, height: 1.6, modelId: "lydia" },
    { id: "enemy", name: guardian ? "宝箱守護者" : "坑道の獣", side: "enemy", x: guardian ? 6 : 5, y: guardian ? 3 : 1, hp: guardian ? 18 : 8, maxHp: guardian ? 18 : 8, atk: guardian ? 3 : 2, agility: 4, height: .9, modelId: "rust-eater" }
  ];
  return { grid, units, order: turnOrder(units).map(u => u.id), turn: 0, log: [guardian ? "守護者が宝箱を守っている。" : "坑道の獣が狭い通路を塞いだ。"] };
};
const alive = (units, side) => units.some(u => u.side === side && u.hp > 0);

const freeCell = (grid, units, id, wanted) => {
  const taken = new Set(units.filter(u => u.id !== id && u.hp > 0).map(u => `${u.x},${u.y}`));
  for (const p of wanted) if (isWalkable(grid, p.x, p.y) && !taken.has(`${p.x},${p.y}`)) return p;
  return null;
};
export default function ExpeditionBattle({ guardian, order, equipment = {}, party = {}, tonics = 0, onUseTonic, onFinish }) {
  const mount = useRef(null), scene = useRef(null), [state, setState] = useState(() => makeState(guardian, equipment, party));
  const turnTimer = useRef(null);
  const [command, setCommand] = useState(order), [moved, setMoved] = useState(false), [busy, setBusy] = useState(false), [combatShot, setCombatShot] = useState(false);
  const active = state.units.find(u => u.id === state.order[state.turn] && u.hp > 0);
  const partyAlive = alive(state.units, "party"), enemyAlive = alive(state.units, "enemy");
  const playerTurn = active?.id === "hero" && partyAlive && enemyAlive;
  const scheduleNextTurn = (expectedTurn, delay = 350) => {
    clearTimeout(turnTimer.current);
    setBusy(true);
    turnTimer.current = setTimeout(() => {
      setMoved(false);
      setState(s => {
        if (s.turn !== expectedTurn) return s;
        for (let i = 1; i <= s.order.length; i++) {
          const turn = (s.turn + i) % s.order.length;
          if (s.units.find(u => u.id === s.order[turn])?.hp > 0) return { ...s, turn };
        }
        return s;
      });
      setBusy(false);
    }, delay);
  };
  useEffect(() => () => clearTimeout(turnTimer.current), []);
  const damage = (attacker, target, ranged = false) => {
    const result = ranged ? resolveRanged({ attacker, target, units: state.units, grid: state.grid, roll }) : resolveMelee({ attacker, target, units: state.units, grid: state.grid, roll });
    if (!result.ok) return;
    scene.current?.setCombatCamera(attacker, target); setCombatShot(true);
    setTimeout(() => { scene.current?.setCameraFocus(null); setCombatShot(false); }, 420);
    scene.current?.[result.hit ? "playHit" : "playMiss"](target.x, target.y, { damage: result.damage, unitId: target.id });
    setState(s => ({ ...s, units: s.units.map(u => u.id === target.id ? { ...u, hp: Math.max(0, u.hp - (result.hit ? result.damage : 0)) } : u), log: [...s.log, result.hit ? `${attacker.name}の攻撃。${result.damage}ダメージ。` : `${attacker.name}の攻撃は外れた。`] }));
  };
  const heroAdvance = () => {
    if (!playerTurn) return;
    const act = chooseEnemyAction(state.grid, active, state.units);
    if (act.type === "attack") damage(active, state.units.find(u => u.id === act.targetId));
    else if (act.type === "move") setState(s => ({ ...s, units: s.units.map(u => u.id === active.id ? { ...u, x: act.to.x, y: act.to.y } : u), log: [...s.log, "あなたは敵へ接近した。"] }));
    scheduleNextTurn(state.turn, 350);
  };
  useEffect(() => {
    const grid = state.grid; const s = createBattleScene(mount.current, grid); scene.current = s; s.setWallsEnabled(true); s.setEnemiesVisible(true);
    return () => s.dispose();
  }, []);
  useEffect(() => {
    const s = scene.current; if (!s) return;
    const targets = playerTurn ? state.units.filter(u => u.side === "enemy" && u.hp > 0 && isAdjacent(active, u)) : [];
    const reach = playerTurn && !moved ? reachableCells(state.grid, active, movePointsFor(active.agility), occupiedBy(state.units, active.id)) : [];
    s.sync({ units: state.units, activeId: active?.id, targetIds: targets.map(t => t.id), highlights: [...reach.map(p => ({ ...p, kind: "reach" })), ...targets.map(t => ({ x: t.x, y: t.y, kind: "target" }))] });
    s.setPickHandler(data => {
      if (!playerTurn) return;
      const t = state.units.find(u => u.id === data.id);
      if (t && targets.some(x => x.id === t.id) && !busy) { damage(active, t); scheduleNextTurn(state.turn, 500); }
      else if (data.kind === "cell" && !moved && reach.some(p => p.x === data.x && p.y === data.y)) { setState(q => ({ ...q, units: q.units.map(u => u.id === active.id ? { ...u, x: data.x, y: data.y } : u) })); setMoved(true); }
    });
  }, [state, active?.id, playerTurn, moved, busy]);
  useEffect(() => {
    if (!partyAlive || !enemyAlive) { onFinish(enemyAlive ? "defeat" : "victory", Object.fromEntries(state.units.filter(u => u.side === "party").map(u => [u.id, u.hp]))); return; }
    if (!active || active.id === "hero") return;
    const expectedTurn = state.turn;
    setBusy(true);
    const t = setTimeout(() => {
      if (active.id === "mage") {
        const enemy = state.units.find(u => u.side === "enemy" && u.hp > 0);
        if (command === "retreat") {
          const to = freeCell(state.grid, state.units, "mage", [{ x: active.x - 1, y: active.y }, { x: active.x, y: active.y - 1 }, { x: active.x, y: active.y + 1 }]);
          setState(s => ({ ...s, units: to ? s.units.map(u => u.id === "mage" ? { ...u, ...to } : u) : s.units, log: [...s.log, to ? "リディアは入口側へ退却した。" : "リディアは退却路を探している。"] }));
        } else if (command === "guard") {
          const hero = state.units.find(u => u.id === "hero");
          const to = freeCell(state.grid, state.units, "mage", [{ x: hero.x - 1, y: hero.y }, { x: hero.x, y: hero.y + 1 }, { x: hero.x, y: hero.y - 1 }]);
          setState(s => ({ ...s, units: to ? s.units.map(u => u.id === "mage" ? { ...u, ...to } : u) : s.units, log: [...s.log, "リディアは前衛の背後を守った。"] }));
        } else if (enemy) damage(active, enemy, true);
      } else {
        const act = chooseEnemyAction(state.grid, active, state.units);
        if (act.type === "attack") { const t = state.units.find(u => u.id === act.targetId); if (t) damage(active, t); }
        if (act.type === "move") setState(s => ({ ...s, units: s.units.map(u => u.id === active.id ? { ...u, x: act.to.x, y: act.to.y } : u) }));
      }
      scheduleNextTurn(expectedTurn, 350);
    }, 450); return () => clearTimeout(t);
  }, [active?.id, state.turn, partyAlive, enemyAlive]);
  return <div style={S.page} data-battle-layout={guardian ? "arena-8x8" : "corridor-3x7"}><div ref={mount} style={S.canvas} data-camera={combatShot ? "combat" : "iso"}/><div style={S.hud}>
    <b>{!partyAlive ? "敗北" : !enemyAlive ? "勝利" : `${active?.name}の手番`}</b>
    <div style={S.row}>{state.units.map(u => <span key={u.id} style={S.chip}>{u.name} {u.hp}/{u.maxHp}</span>)}</div>
    <div style={S.row}><span>相棒指示:</span>{[["attack","攻撃"],["guard","護衛"],["retreat","退却"]].map(([id,label]) => <button key={id} disabled={busy} style={{...S.btn, ...(command === id ? S.active : {})}} onClick={() => setCommand(id)}>{label}</button>)}<button style={S.btn} onClick={() => scene.current?.rotate(1)}>視点</button>{playerTurn && <button disabled={busy} style={S.btn} onClick={heroAdvance}>接近／攻撃</button>}{playerTurn && <button disabled={busy} style={S.btn} onClick={() => scheduleNextTurn(state.turn, 0)}>ターン終了</button>}{playerTurn && <button disabled={!tonics || busy} style={S.btn} onClick={() => { if (onUseTonic?.()) setState(s => ({ ...s, units: s.units.map(u => u.id === "hero" ? { ...u, hp: Math.min(u.maxHp, u.hp + ITEMS.tonic.power) } : u), log: [...s.log, "回復薬を使った。"] })); }}>回復薬 ({tonics})</button>}{busy && <span>行動中…</span>}</div>
    <div style={S.hint}>青いマスへ移動、赤い敵を選んで攻撃します。攻撃時は対面カメラになります。</div><div style={S.log}>{state.log.slice(-3).map((x,i) => <div key={i}>{x}</div>)}</div>
  </div></div>;
}
const S = { page:{position:"fixed",inset:0,background:"#161a22",color:"#e6e8ee",font:"13px/1.6 system-ui",display:"flex",flexDirection:"column"},canvas:{flex:1,minHeight:0},hud:{padding:"10px 14px",background:"rgba(20,24,32,.94)",borderTop:"1px solid #2b303c"},row:{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginTop:6},chip:{border:"1px solid #59647a",borderRadius:999,padding:"1px 8px"},btn:{background:"#2b303c",color:"#e6e8ee",border:"1px solid #3c4354",borderRadius:6,padding:"5px 11px"},active:{background:"#3d7fb5"},hint:{color:"#9ca8bd",marginTop:5},log:{marginTop:5,color:"#d8c98c"} };
