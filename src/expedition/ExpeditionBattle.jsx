import React, { useEffect, useRef, useState } from "react";
import { createBattleScene } from "../battle/view3d.js";
import { chooseEnemyAction, isAdjacent, makeRng, movePointsFor, occupiedBy, reachableCells, resolveMelee, resolveRanged, turnOrder } from "../battle/core.js";
import { ITEMS, partyMaxHp } from "./core.js";
import { EXPEDITION_BATTLE_CONFIG } from "./battleConfig.js";
import { chooseCompanionAction, createExpeditionBattleLayout, facingToward } from "./battleState.js";

const atkOf = (baseAtk, gear = {}) => baseAtk + [gear.weapon, gear.charm].reduce((n, id) => n + (id && ITEMS[id]?.stat === "atk" ? ITEMS[id].power : 0), 0);
// 味方も敵も同じ形で組む。歩ける高さや見た目のような共通属性を、3か所へ書き分けないため。
// combat(hp/maxHp/atk)だけは、装備と遠征中の残HPで決まるので呼ぶ側から渡す。
const unitFrom = (id, side, config, start, faceTo, combat) => ({
  id, name: config.name, side, ...start,
  facing: facingToward(start, faceTo),
  modelFacingOffset: EXPEDITION_BATTLE_CONFIG.presentation.modelFacingOffset[side],
  ...combat,
  agility: config.agility,
  height: config.height,
  canClimb: config.canClimb,
  maxObstacleHeight: EXPEDITION_BATTLE_CONFIG.movement.maxObstacleHeight,
  modelId: config.modelId,
});

const makeState = (guardian, layout, equipment = {}, party = {}, seed = 0) => {
  const { hero: heroConfig, mage: mageConfig, enemy: enemyConfig, guardian: guardianConfig } = EXPEDITION_BATTLE_CONFIG.units;
  const foeConfig = guardian ? guardianConfig : enemyConfig;
  // 最大HPは core.partyMaxHp が正本。地図画面と戦闘画面で違う値を出さないよう式を複製しない。
  const hero = { atk: atkOf(heroConfig.atk, equipment.hero), hp: partyMaxHp("hero", equipment) };
  const mage = { atk: atkOf(mageConfig.atk, equipment.mage), hp: partyMaxHp("mage", equipment) };
  const battleLayout = guardian ? "guardian" : layout;
  const { grid, starts } = createExpeditionBattleLayout(battleLayout, seed);
  const units = [
    unitFrom("hero", "party", heroConfig, starts.hero, starts.enemy, { hp: Math.min(hero.hp, party.hero ?? hero.hp), maxHp: hero.hp, atk: hero.atk }),
    unitFrom("mage", "party", mageConfig, starts.mage, starts.enemy, { hp: Math.min(mage.hp, party.mage ?? mage.hp), maxHp: mage.hp, atk: mage.atk }),
    unitFrom("enemy", "enemy", foeConfig, starts.enemy, starts.hero, { hp: foeConfig.hp, maxHp: foeConfig.hp, atk: foeConfig.atk }),
  ];
  return { grid, units, order: turnOrder(units).map(u => u.id), turn: 0, log: [guardian ? "守護者が宝箱を守っている。" : layout === "junction" ? "坑道の獣が三叉路を塞いだ。" : "坑道の獣が狭い通路を塞いだ。"] };
};
const alive = (units, side) => units.some(u => u.side === side && u.hp > 0);
export default function ExpeditionBattle({ guardian, layout = "corridor", order, equipment = {}, party = {}, seed = 0, tonics = 0, onUseTonic, onFinish }) {
  const battleLayout = guardian ? "guardian" : layout;
  const mount = useRef(null), scene = useRef(null), [state, setState] = useState(() => makeState(guardian, battleLayout, equipment, party, seed));
  const turnTimer = useRef(null);
  // seedからダイス目を再現する。+777で盤面配置のrng(同じseedをそのまま使う)とは別系列にする。
  const rng = useRef(null);
  if (!rng.current) rng.current = makeRng(seed + 777);
  const roll = () => 1 + Math.floor(rng.current() * 20);
  const [command, setCommand] = useState(order), [moved, setMoved] = useState(false), [heroAction, setHeroAction] = useState(null), [busy, setBusy] = useState(false), [combatShot, setCombatShot] = useState(false), [viewDirection, setViewDirection] = useState(0);
  // カメラの見下ろし角を見た目を見ながら調整するスライダー。正本はConfig側で、ここでは動かして確認するだけ。
  const [cameraElevationDeg, setCameraElevationDeg] = useState(EXPEDITION_BATTLE_CONFIG.presentation.cameraElevationDeg);
  const active = state.units.find(u => u.id === state.order[state.turn] && u.hp > 0);
  const partyAlive = alive(state.units, "party"), enemyAlive = alive(state.units, "enemy");
  const playerTurn = active?.id === "hero" && partyAlive && enemyAlive;
  const adjacentTargets = playerTurn ? state.units.filter(u => u.side === "enemy" && u.hp > 0 && isAdjacent(active, u)) : [];
  const heroReach = playerTurn && !moved ? reachableCells(state.grid, active, movePointsFor(active.agility), occupiedBy(state.units, active.id), active) : [];
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
    const grid = state.grid; const s = createBattleScene(mount.current, grid, { voidBoundaryWalls: battleLayout === "junction", cameraElevationDeg: EXPEDITION_BATTLE_CONFIG.presentation.cameraElevationDeg }); scene.current = s; s.setWallsEnabled(EXPEDITION_BATTLE_CONFIG.presentation.showBackdropWalls); s.setEnemiesVisible(true);
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
    }, { preferCells: heroAction === "move" });
  }, [state, active?.id, playerTurn, moved, heroAction, busy]);
  useEffect(() => {
    if (!partyAlive || !enemyAlive) { onFinish(enemyAlive ? "defeat" : "victory", Object.fromEntries(state.units.filter(u => u.side === "party").map(u => [u.id, u.hp]))); return; }
    if (!active || active.id === "hero") return;
    const expectedTurn = state.turn;
    setBusy(true);
    const t = setTimeout(() => {
      if (active.id === "mage") {
        // 判定は chooseCompanionAction が返し、ここは演出と状態更新だけを行う。
        const act = chooseCompanionAction({ grid: state.grid, units: state.units, mage: active, command });
        if (act.type === "cast") damage(active, state.units.find(u => u.id === act.targetId), true);
        if (act.type === "move") moveUnit(active, act.to, act.line);
        if (act.type === "wait") setState(s => ({ ...s, log: [...s.log, act.line] }));
        scheduleNextTurn(expectedTurn, act.type === "cast" ? EXPEDITION_BATTLE_CONFIG.timing.attackSettleMs : EXPEDITION_BATTLE_CONFIG.timing.moveSettleMs);
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
  // 手番中に何を求められているかを1文で示す。上ほど限定的な状況で、先に一致した方を採る。
  const heroStatus =
    !playerTurn ? ""
    : busy ? "行動を処理中です。"
    : heroAction === "move" ? "移動先を選択中：青いマスを1つ選びます。"
    : heroAction === "attack" ? "攻撃対象を選択中：隣接した赤い敵を選びます。"
    : moved ? (adjacentTargets.length ? "移動済み：攻撃できます。" : "移動済み：隣接する敵がいないため攻撃できません。")
    : adjacentTargets.length ? "行動を選んでください：移動または攻撃。"
    : "行動を選んでください：隣接する敵がいないため、移動または待機。";
  const layoutLabel = battleLayout === "guardian" ? "arena-8x8" : battleLayout === "junction" ? "junction-7x7" : "corridor-3x7";
  // data-* はスモークテストが盤面と手番を外から読むための足がかり。表示には使わない。
  return <div style={S.page}
    data-battle-layout={layoutLabel}
    data-obstacle-count={obstacleCount}
    data-active-unit={active?.id || ""}
    data-hero-action={playerTurn ? (heroAction || (moved ? "moved" : "choose")) : ""}
    data-adjacent-enemies={adjacentTargets.length}
    data-reach-cells={JSON.stringify(heroReach.map(({ x, y }) => ({ x, y })))}>
    <div ref={mount} style={S.canvas} data-camera={combatShot ? "combat" : "iso"} data-view-direction={viewDirection}/>
    <div style={S.hud}>
      <b>{!partyAlive ? "敗北" : !enemyAlive ? "勝利" : `${active?.name}の手番`}</b>
      <div style={S.row}>{state.units.map(u => <span key={u.id} style={S.chip}>{u.name} {u.hp}/{u.maxHp}</span>)}</div>
      <div style={S.row}>
        <span>相棒指示:</span>
        {[["attack", "攻撃"], ["guard", "護衛"], ["retreat", "退却"]].map(([id, label]) =>
          <button key={id} disabled={busy} style={{ ...S.btn, ...(command === id ? S.active : {}) }} onClick={() => setCommand(id)}>{label}</button>)}
        <button style={S.btn} onClick={() => { scene.current?.rotate(1); setViewDirection(direction => (direction + 1) % 4); }}>視点を回す</button>
        {playerTurn && <button disabled={busy || moved} style={{ ...S.btn, ...(heroAction === "move" ? S.active : {}) }}
          onClick={() => { setHeroAction("move"); setState(s => ({ ...s, log: [...s.log, "移動先の青いマスを選ぶ。"] })); }}>移動</button>}
        {playerTurn && <button disabled={busy || !adjacentTargets.length} style={{ ...S.btn, ...(heroAction === "attack" ? S.active : {}) }}
          onClick={() => { setHeroAction("attack"); setState(s => ({ ...s, log: [...s.log, "隣接する敵を選んで攻撃する。"] })); }}>攻撃</button>}
        {playerTurn && <button disabled={busy} style={S.btn}
          onClick={() => { setHeroAction(null); scheduleNextTurn(state.turn, 0); }}>待機</button>}
        {playerTurn && <button disabled={!tonics || busy} style={S.btn}
          onClick={() => { if (onUseTonic?.()) setState(s => ({ ...s, units: s.units.map(u => u.id === "hero" ? { ...u, hp: Math.min(u.maxHp, u.hp + ITEMS.tonic.power) } : u), log: [...s.log, "回復薬を使った。"] })); }}>回復薬 ({tonics})</button>}
        {busy && <span>行動中…</span>}
      </div>
      <div style={S.hint}>{heroStatus || "攻撃時は対面カメラになります。"}</div>
      <div style={S.log}>{state.log.slice(-4).map((x, i) => <div key={i}>{x}</div>)}</div>
      <div style={S.row}>
        <span>カメラの高さ:</span>
        <input type="range" min="20" max="80" step="1" value={cameraElevationDeg}
          onChange={e => { const deg = Number(e.target.value); setCameraElevationDeg(deg); scene.current?.setCameraElevationDeg(deg); }}/>
        <span>{cameraElevationDeg}度</span>
      </div>
    </div>
  </div>;
}
// 画面の見た目。1トークン1行にして、色や余白を1つ変えた時にdiffがその1行だけになるようにする。
const S = {
  page: { position: "fixed", inset: 0, background: "#161a22", color: "#e6e8ee", font: "13px/1.6 system-ui", display: "flex", flexDirection: "column" },
  canvas: { flex: 1, minHeight: 0 },
  hud: { padding: "10px 14px", background: "rgba(20,24,32,.94)", borderTop: "1px solid #2b303c" },
  row: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 6 },
  chip: { border: "1px solid #59647a", borderRadius: 999, padding: "1px 8px" },
  btn: { background: "#2b303c", color: "#e6e8ee", border: "1px solid #3c4354", borderRadius: 6, padding: "5px 11px" },
  active: { background: "#3d7fb5" },
  hint: { color: "#9ca8bd", marginTop: 5 },
  log: { marginTop: 5, color: "#d8c98c" },
};
