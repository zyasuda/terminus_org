import React, { useEffect, useRef, useState } from "react";
import { createBattleScene } from "../battle/view3d.js";
import { chooseEnemyAction, chooseMoveToward, isAdjacent, movePointsFor, occupiedBy, reachableCells, resolveMelee, resolveRanged, turnOrder } from "../battle/core.js";
import { ITEMS } from "./core.js";
import { EXPEDITION_BATTLE_CONFIG } from "./battleConfig.js";
import { createExpeditionBattleLayout, facingToward } from "./battleState.js";

const roll = () => 1 + Math.floor(Math.random() * 20);
const stats = (baseAtk, baseHp, gear = {}) => ({ atk: baseAtk + [gear.weapon, gear.charm].reduce((n, id) => n + (id && ITEMS[id]?.stat === "atk" ? ITEMS[id].power : 0), 0), hp: baseHp + (gear.armor && ITEMS[gear.armor]?.stat === "hp" ? ITEMS[gear.armor].power : 0) });
const makeState = (guardian, layout, equipment = {}, party = {}, seed = 0) => {
  const { hero: heroConfig, mage: mageConfig, enemy: enemyConfig, guardian: guardianConfig } = EXPEDITION_BATTLE_CONFIG.units;
  const foeConfig = guardian ? guardianConfig : enemyConfig;
  const { modelFacingOffset } = EXPEDITION_BATTLE_CONFIG.presentation;
  const hero = stats(heroConfig.atk, heroConfig.hp, equipment.hero), mage = stats(mageConfig.atk, mageConfig.hp, equipment.mage);
  const battleLayout = guardian ? "guardian" : layout;
  const { grid, starts } = createExpeditionBattleLayout(battleLayout, seed);
  const units = [
    { id: "hero", name: heroConfig.name, side: "party", ...starts.hero, facing: facingToward(starts.hero, starts.enemy), modelFacingOffset: modelFacingOffset.party, hp: Math.min(hero.hp, party.hero ?? hero.hp), maxHp: hero.hp, atk: hero.atk, agility: heroConfig.agility, height: heroConfig.height, modelId: heroConfig.modelId },
    { id: "mage", name: mageConfig.name, side: "party", ...starts.mage, facing: facingToward(starts.mage, starts.enemy), modelFacingOffset: modelFacingOffset.party, hp: Math.min(mage.hp, party.mage ?? mage.hp), maxHp: mage.hp, atk: mage.atk, agility: mageConfig.agility, height: mageConfig.height, modelId: mageConfig.modelId },
    { id: "enemy", name: foeConfig.name, side: "enemy", ...starts.enemy, facing: facingToward(starts.enemy, starts.hero), modelFacingOffset: modelFacingOffset.enemy, hp: foeConfig.hp, maxHp: foeConfig.hp, atk: foeConfig.atk, agility: foeConfig.agility, height: foeConfig.height, modelId: foeConfig.modelId }
  ];
  return { grid, units, order: turnOrder(units).map(u => u.id), turn: 0, log: [guardian ? "守護者が宝箱を守っている。" : layout === "junction" ? "坑道の獣が三叉路を塞いだ。" : "坑道の獣が狭い通路を塞いだ。"] };
};
const alive = (units, side) => units.some(u => u.side === side && u.hp > 0);
const nearest = (unit, units) => units.filter(u => u.hp > 0).reduce((best, u) => !best || Math.max(Math.abs(u.x - unit.x), Math.abs(u.y - unit.y)) < Math.max(Math.abs(best.x - unit.x), Math.abs(best.y - unit.y)) ? u : best, null);
export default function ExpeditionBattle({ guardian, layout = "corridor", order, equipment = {}, party = {}, seed = 0, tonics = 0, onUseTonic, onFinish }) {
  const battleLayout = guardian ? "guardian" : layout;
  const mount = useRef(null), scene = useRef(null), [state, setState] = useState(() => makeState(guardian, battleLayout, equipment, party, seed));
  const turnTimer = useRef(null);
  const [command, setCommand] = useState(order), [moved, setMoved] = useState(false), [heroAction, setHeroAction] = useState(null), [busy, setBusy] = useState(false), [combatShot, setCombatShot] = useState(false), [viewDirection, setViewDirection] = useState(0);
  const active = state.units.find(u => u.id === state.order[state.turn] && u.hp > 0);
  const partyAlive = alive(state.units, "party"), enemyAlive = alive(state.units, "enemy");
  const playerTurn = active?.id === "hero" && partyAlive && enemyAlive;
  const adjacentTargets = playerTurn ? state.units.filter(u => u.side === "enemy" && u.hp > 0 && isAdjacent(active, u)) : [];
  const heroReach = playerTurn && !moved ? reachableCells(state.grid, active, movePointsFor(active.agility), occupiedBy(state.units, active.id)) : [];
  const scheduleNextTurn = (expectedTurn, delay = EXPEDITION_BATTLE_CONFIG.timing.turnTransitionMs) => {
    clearTimeout(turnTimer.current);
    setBusy(true);
    turnTimer.current = setTimeout(() => {
      setMoved(false); setHeroAction(null);
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
    if (!result.ok) return false;
    if (ranged) scene.current?.playRanged(attacker.x, attacker.y, target.x, target.y);
    scene.current?.setCombatCamera(attacker, target); setCombatShot(true);
    setTimeout(() => { scene.current?.setCameraFocus(null); setCombatShot(false); }, EXPEDITION_BATTLE_CONFIG.timing.attackCameraMs);
    scene.current?.[result.hit ? "playHit" : "playMiss"](target.x, target.y, { damage: result.damage, unitId: target.id });
    setState(s => ({ ...s, units: s.units.map(u => u.id === target.id ? { ...u, hp: Math.max(0, u.hp - (result.hit ? result.damage : 0)) } : u.id === attacker.id ? { ...u, facing: facingToward(attacker, target, u.facing) } : u), log: [...s.log, ...(ranged ? [`${attacker.name}は魔法を放った。`] : []), result.hit ? `${attacker.name}の攻撃。${result.damage}ダメージ。` : `${attacker.name}の攻撃は外れた。`] }));
    return true;
  };
  const moveUnit = (unit, to, line) => {
    scene.current?.playMove(unit.x, unit.y, to.x, to.y);
    setState(s => ({ ...s, units: s.units.map(u => u.id === unit.id ? { ...u, ...to, facing: facingToward(unit, to, u.facing) } : u), log: [...s.log, line] }));
  };
  useEffect(() => {
    const grid = state.grid; const s = createBattleScene(mount.current, grid, { voidBoundaryWalls: battleLayout === "junction" }); scene.current = s; s.setWallsEnabled(EXPEDITION_BATTLE_CONFIG.presentation.showBackdropWalls); s.setEnemiesVisible(true);
    return () => s.dispose();
  }, []);
  useEffect(() => {
    const s = scene.current; if (!s) return;
    const targets = heroAction === "attack" ? adjacentTargets : [];
    const highlights = heroAction === "move" ? heroReach.map(p => ({ ...p, kind: "reach" })) : targets.map(t => ({ x: t.x, y: t.y, kind: "target" }));
    s.sync({ units: state.units, activeId: active?.id, targetIds: targets.map(t => t.id), highlights });
    s.setPickHandler(data => {
      if (!playerTurn) return;
      const t = state.units.find(u => u.id === data.id);
      if (t && heroAction === "attack" && targets.some(x => x.id === t.id) && !busy) { setHeroAction(null); damage(active, t); scheduleNextTurn(state.turn, EXPEDITION_BATTLE_CONFIG.timing.attackSettleMs); }
      else if (data.kind === "cell" && heroAction === "move" && !moved && heroReach.some(p => p.x === data.x && p.y === data.y)) { moveUnit(active, data, "あなたは移動した。"); setMoved(true); setHeroAction(null); }
    });
  }, [state, active?.id, playerTurn, moved, heroAction, busy]);
  useEffect(() => {
    if (!partyAlive || !enemyAlive) { onFinish(enemyAlive ? "defeat" : "victory", Object.fromEntries(state.units.filter(u => u.side === "party").map(u => [u.id, u.hp]))); return; }
    if (!active || active.id === "hero") return;
    const expectedTurn = state.turn;
    setBusy(true);
    const t = setTimeout(() => {
      if (active.id === "mage") {
        const enemy = nearest(active, state.units.filter(u => u.side === "enemy"));
        const canCast = enemy && resolveRanged({ attacker: active, target: enemy, units: state.units, grid: state.grid, roll: () => 20 }).ok;
        let actionDelay = EXPEDITION_BATTLE_CONFIG.timing.moveSettleMs;
        if (command === "retreat") {
          const to = chooseMoveToward(state.grid, active, { x: 0, y: active.y }, state.units);
          if (to.type === "move") moveUnit(active, to.to, "リディアは入口側へ退却した。");
          else setState(s => ({ ...s, log: [...s.log, "リディアは退却路を探している。"] }));
        } else if (command === "guard") {
          const hero = state.units.find(u => u.id === "hero");
          if (canCast) { damage(active, enemy, true); actionDelay = EXPEDITION_BATTLE_CONFIG.timing.attackSettleMs; }
          else {
            const to = chooseMoveToward(state.grid, active, hero, state.units);
            if (to.type === "move") moveUnit(active, to.to, "リディアは前衛を護衛する位置へ移動した。");
            else setState(s => ({ ...s, log: [...s.log, "リディアは前衛のそばで護衛している。"] }));
          }
        } else if (canCast) { damage(active, enemy, true); actionDelay = EXPEDITION_BATTLE_CONFIG.timing.attackSettleMs; }
        else if (enemy) {
          const to = chooseMoveToward(state.grid, active, enemy, state.units);
          if (to.type === "move") moveUnit(active, to.to, "リディアは魔法の射程へ移動した。");
          else setState(s => ({ ...s, log: [...s.log, "リディアは魔法の射程を探している。"] }));
        }
        scheduleNextTurn(expectedTurn, actionDelay);
      } else {
        const act = chooseEnemyAction(state.grid, active, state.units);
        if (act.type === "attack") { const t = state.units.find(u => u.id === act.targetId); if (t) damage(active, t); }
        if (act.type === "move") moveUnit(active, act.to, `${active.name}は${state.units.find(u => u.id === act.targetId)?.name || "あなた"}へ接近した。`);
        if (act.type === "wait") setState(s => ({ ...s, log: [...s.log, `${active.name}は進路を探している。`] }));
        scheduleNextTurn(expectedTurn, act.type === "move" ? EXPEDITION_BATTLE_CONFIG.timing.moveSettleMs : EXPEDITION_BATTLE_CONFIG.timing.attackSettleMs);
      }
    }, EXPEDITION_BATTLE_CONFIG.timing.aiThinkMs); return () => clearTimeout(t);
  }, [active?.id, state.turn, partyAlive, enemyAlive]);
  const obstacleCount = state.grid.cells.filter(cell => cell.obstacle).length;
  const heroStatus = !playerTurn ? "" : busy ? "行動を処理中です。" : heroAction === "move" ? "移動先を選択中：青いマスを1つ選びます。" : heroAction === "attack" ? "攻撃対象を選択中：隣接した赤い敵を選びます。" : moved ? adjacentTargets.length ? "移動済み：攻撃できます。" : "移動済み：隣接する敵がいないため攻撃できません。" : adjacentTargets.length ? "行動を選んでください：移動または攻撃。" : "行動を選んでください：隣接する敵がいないため、移動または待機。";
  const layoutLabel = battleLayout === "guardian" ? "arena-8x8" : battleLayout === "junction" ? "junction-7x7" : "corridor-3x7";
  return <div style={S.page} data-battle-layout={layoutLabel} data-obstacle-count={obstacleCount} data-active-unit={active?.id || ""} data-hero-action={playerTurn ? (heroAction || (moved ? "moved" : "choose")) : ""} data-adjacent-enemies={adjacentTargets.length} data-reach-cells={JSON.stringify(heroReach.map(({ x, y }) => ({ x, y })))}><div ref={mount} style={S.canvas} data-camera={combatShot ? "combat" : "iso"} data-view-direction={viewDirection}/><div style={S.hud}>
    <b>{!partyAlive ? "敗北" : !enemyAlive ? "勝利" : `${active?.name}の手番`}</b>
    <div style={S.row}>{state.units.map(u => <span key={u.id} style={S.chip}>{u.name} {u.hp}/{u.maxHp}</span>)}</div>
    <div style={S.row}><span>相棒指示:</span>{[["attack","攻撃"],["guard","護衛"],["retreat","退却"]].map(([id,label]) => <button key={id} disabled={busy} style={{...S.btn, ...(command === id ? S.active : {})}} onClick={() => setCommand(id)}>{label}</button>)}<button style={S.btn} onClick={() => { scene.current?.rotate(1); setViewDirection(direction => (direction + 1) % 4); }}>視点を回す</button>{playerTurn && <button disabled={busy || moved} style={{...S.btn, ...(heroAction === "move" ? S.active : {})}} onClick={() => { setHeroAction("move"); setState(s => ({ ...s, log: [...s.log, "移動先の青いマスを選ぶ。"] })); }}>移動</button>}{playerTurn && <button disabled={busy || !adjacentTargets.length} style={{...S.btn, ...(heroAction === "attack" ? S.active : {})}} onClick={() => { setHeroAction("attack"); setState(s => ({ ...s, log: [...s.log, "隣接する敵を選んで攻撃する。"] })); }}>攻撃</button>}{playerTurn && <button disabled={busy} style={S.btn} onClick={() => { setHeroAction(null); scheduleNextTurn(state.turn, 0); }}>待機</button>}{playerTurn && <button disabled={!tonics || busy} style={S.btn} onClick={() => { if (onUseTonic?.()) setState(s => ({ ...s, units: s.units.map(u => u.id === "hero" ? { ...u, hp: Math.min(u.maxHp, u.hp + ITEMS.tonic.power) } : u), log: [...s.log, "回復薬を使った。"] })); }}>回復薬 ({tonics})</button>}{busy && <span>行動中…</span>}</div>
    <div style={S.hint}>{heroStatus || "攻撃時は対面カメラになります。"}</div><div style={S.log}>{state.log.slice(-4).map((x,i) => <div key={i}>{x}</div>)}</div>
  </div></div>;
}
const S = { page:{position:"fixed",inset:0,background:"#161a22",color:"#e6e8ee",font:"13px/1.6 system-ui",display:"flex",flexDirection:"column"},canvas:{flex:1,minHeight:0},hud:{padding:"10px 14px",background:"rgba(20,24,32,.94)",borderTop:"1px solid #2b303c"},row:{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginTop:6},chip:{border:"1px solid #59647a",borderRadius:999,padding:"1px 8px"},btn:{background:"#2b303c",color:"#e6e8ee",border:"1px solid #3c4354",borderRadius:6,padding:"5px 11px"},active:{background:"#3d7fb5"},hint:{color:"#9ca8bd",marginTop:5},log:{marginTop:5,color:"#d8c98c"} };
