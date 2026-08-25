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
import { D20Overlay } from "@terminus/d20-overlay";
import { createBattleScene } from "./view3d.js";
import {
  isAdjacent, movePointsFor, reachableCells,
  turnOrder, resolveMelee, resolveSweep, resolveShove, chooseEnemyAction,
  occupiedBy, pathTo
} from "./core.js";
import {
  GUARD_LABEL, applyMeleeResult, snapshotOf, advanceTurn, applyMoveResult, applySweepResult
} from "./battleResult.js";
import { createJunctionStage } from "../stage/junction.js";
import { createLightChamberStage } from "../stage/lightChamber.js";

const rollD20 = () => 1 + Math.floor(Math.random() * 20);
const DIALOGUE_VIEW = { background: "#6f8fa5", light: "day" };

const initialJunctionState = () => {
  const { grid, units } = createJunctionStage();
  const base = {
    grid,
    units,
    order: turnOrder(units).map(u => u.id),
    turn: 0,
    hasMoved: false,
    coins: [],
    purse: 0,
    log: ["分かれ道で錆喰いが姿を現した。"]
  };
  return { ...base, snapshot: snapshotOf(base) };
};

const alive = (units, side) => units.some(u => u.side === side && u.hp > 0);

export default function BattleView() {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const [state, setState] = useState(initialJunctionState);
  // 演出の見た目調整用。ゲームの状態ではないので「やり直す」「最初から」の対象外
  const [fogOn, setFogOn] = useState(false);
  const [fogLevel, setFogLevel] = useState(1);
  const [fogColor, setFogColor] = useState("#161a22");
  const [dustOn, setDustOn] = useState(false);
  const [rainOn, setRainOn] = useState(false);
  const [wallsOn, setWallsOn] = useState(false);
  const [bgColor, setBgColor] = useState("#161a22");
  const [lightPreset, setLightPreset] = useState("night");
  // ランタンはガレス・リディアそれぞれ個別に点灯/消灯したいとのことなので、
  // ユニットIDごとの状態にしてある(以前は全員一括のbooleanだった)
  const [lanternOn, setLanternOn] = useState({ gareth: false, lydia: false });
  const [obstaclesOn, setObstaclesOn] = useState(false);
  const [waterOn, setWaterOn] = useState(false);
  const [holesOn, setHolesOn] = useState(false);
  const [d20DemoResult, setD20DemoResult] = useState(null);
  const [mode, setMode] = useState("dialogue");
  const [closeCamera, setCloseCamera] = useState(false);
  const [dialogueFocusId, setDialogueFocusId] = useState("gareth");
  const [investigations, setInvestigations] = useState([]);
  const [encounters, setEncounters] = useState([]);
  const [exits, setExits] = useState([]);
  const [revealedSecretIds, setRevealedSecretIds] = useState([]);
  const [selectedInvestigation, setSelectedInvestigation] = useState(null);
  const [encounterCue, setEncounterCue] = useState(null);
  const [activeEncounterId, setActiveEncounterId] = useState(null);
  const [completedEncounterIds, setCompletedEncounterIds] = useState([]);
  const triggeredEncounters = useRef(new Set());
  // 攻撃の種類。"通常"以外は1回選んだら使ったら"通常"へ戻す(構えのように持ち越さない)
  const [attackMode, setAttackMode] = useState("normal");

  const { grid, units, order, turn, hasMoved, coins } = state;
  const active = units.find(u => u.id === order[turn] && u.hp > 0) || null;
  const dialogueFocus = units.find(u => u.id === dialogueFocusId);
  const dialogueSubject = units.find(u => u.id === "guardian") || null;
  const partyAlive = alive(units, "party");
  const enemyAlive = alive(units, "enemy");
  const battleMode = mode === "battle";
  const sceneView = battleMode
    ? { background: bgColor, light: lightPreset, walls: wallsOn, fog: fogOn, dust: dustOn, rain: rainOn }
    : { ...DIALOGUE_VIEW, walls: true, fog: false, dust: false, rain: false };
  const over = !partyAlive || !enemyAlive;
  const openInvestigation = investigation => {
    setRevealedSecretIds(ids => ids.includes(investigation.secretId) ? ids : [...ids, investigation.secretId]);
    setSelectedInvestigation(investigation);
    if (investigation.speakerId) {
      setDialogueFocusId(investigation.speakerId);
      setCloseCamera(true);
    }
    const encounter = encounters.find(item => item.requiredElements?.includes(investigation.entity));
    if (encounter && !triggeredEncounters.current.has(encounter.id) && !completedEncounterIds.includes(encounter.id)) {
      triggeredEncounters.current.add(encounter.id);
      setEncounterCue(encounter);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const stageInvestigations = grid.stage?.investigations || [];
    fetch("/data/campaigns/lanternhill/chapter_01.json")
      .then(r => r.ok ? r.json() : Promise.reject(new Error("campaign load failed")))
      .then(chapter => {
        const scene = chapter.scenes.find(s => s.id === grid.stage?.scenarioSceneId);
        const resolved = stageInvestigations.map(placement => {
          const secret = scene?.secrets.find(s => s.id === placement.secretId);
          return secret && { ...placement, ...secret };
        }).filter(Boolean);
        if (!cancelled) {
          setInvestigations(resolved);
          setEncounters(scene?.encounters || []);
          setExits(scene?.exits || []);
        }
      })
      .catch(() => { if (!cancelled) { setInvestigations([]); setEncounters([]); setExits([]); } });
    return () => { cancelled = true; };
  }, [grid]);

  useEffect(() => {
    if (!encounterCue) return;
    const timer = setTimeout(() => {
      setState(s => {
        let enemyIndex = 0;
        const units = s.units.map(unit => {
          if (unit.side !== "enemy") return unit;
          const suffix = enemyIndex++ ? "(2)" : "";
          return {
            ...unit,
            modelId: encounterCue.monsterName === "坑道蝙蝠" ? "mine-bat" : "rust-eater",
            name: `${encounterCue.enemy.name}${suffix}`,
            hp: encounterCue.enemy.hp,
            maxHp: encounterCue.enemy.maxHp,
            atk: encounterCue.enemy.atk,
            agility: encounterCue.enemy.agility,
            defenseDc: encounterCue.enemy.defenseDc,
            height: encounterCue.monsterName === "坑道蝙蝠" ? 0.9 : 0.8
          };
        });
        const next = {
          ...s,
          units,
          order: turnOrder(units).map(unit => unit.id),
          turn: 0,
          hasMoved: false,
          log: [...s.log, encounterCue.onsetText]
        };
        return { ...next, snapshot: snapshotOf(next) };
      });
      setSelectedInvestigation(null);
      setCloseCamera(false);
      setActiveEncounterId(encounterCue.id);
      setMode("battle");
      setEncounterCue(null);
    }, 1200);
    return () => clearTimeout(timer);
  }, [encounterCue]);

  useEffect(() => {
    if (!battleMode || enemyAlive || !activeEncounterId) return;
    const timer = setTimeout(() => {
      setCompletedEncounterIds(ids => [...ids, activeEncounterId]);
      setActiveEncounterId(null);
      setCloseCamera(false);
      setMode("dialogue");
    }, 900);
    return () => clearTimeout(timer);
  }, [battleMode, enemyAlive, activeEncounterId]);

  /* --- シーンの生成と破棄。盤面が変わったら作り直す(「最初から」で新しい配置になる) --- */
  useEffect(() => {
    const s = createBattleScene(mountRef.current, grid);
    sceneRef.current = s;
    // 新しい盤面を作った直後は既定値に戻るので、現在のパネルの設定を反映し直す
    s.setFogEnabled(sceneView.fog);
    s.setFogIntensity(fogLevel);
    s.setFogColor(fogColor);
    s.setDustEnabled(sceneView.dust);
    s.setRainEnabled(sceneView.rain);
    s.setWallsEnabled(sceneView.walls);
    s.setBackgroundColor(sceneView.background);
    s.setLightPreset(sceneView.light);
    for (const [id, on] of Object.entries(lanternOn)) s.setLanternEnabled(id, on);
    s.setObstaclesEnabled(obstaclesOn);
    s.setWaterEnabled(waterOn);
    s.setHolesEnabled(holesOn);
    s.setEnemiesVisible(battleMode);
    s.setCameraFocus(closeCamera ? dialogueFocus : null, dialogueSubject);
    return () => { s.dispose(); sceneRef.current = null; };
  }, [grid]);

  /* --- 演出パネルの設定を反映(盤面を作り直さず、既存シーンへその場で効かせる) --- */
  useEffect(() => { sceneRef.current?.setFogEnabled(sceneView.fog); }, [sceneView.fog, grid]);
  useEffect(() => { sceneRef.current?.setFogIntensity(fogLevel); }, [fogLevel, grid]);
  useEffect(() => { sceneRef.current?.setFogColor(fogColor); }, [fogColor, grid]);
  useEffect(() => { sceneRef.current?.setDustEnabled(sceneView.dust); }, [sceneView.dust, grid]);
  useEffect(() => { sceneRef.current?.setRainEnabled(sceneView.rain); }, [sceneView.rain, grid]);
  useEffect(() => { sceneRef.current?.setWallsEnabled(sceneView.walls); }, [sceneView.walls, grid]);
  useEffect(() => { sceneRef.current?.setBackgroundColor(sceneView.background); }, [sceneView.background, grid]);
  useEffect(() => { sceneRef.current?.setLightPreset(sceneView.light); }, [sceneView.light, grid]);
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    for (const [id, on] of Object.entries(lanternOn)) s.setLanternEnabled(id, on);
  }, [lanternOn, grid]);
  useEffect(() => { sceneRef.current?.setObstaclesEnabled(obstaclesOn); }, [obstaclesOn, grid]);
  useEffect(() => { sceneRef.current?.setWaterEnabled(waterOn); }, [waterOn, grid]);
  useEffect(() => { sceneRef.current?.setHolesEnabled(holesOn); }, [holesOn, grid]);
  useEffect(() => { sceneRef.current?.setEnemiesVisible(battleMode); }, [battleMode, grid]);
  useEffect(() => { sceneRef.current?.setCameraFocus(closeCamera ? dialogueFocus : null, dialogueSubject); }, [closeCamera, dialogueFocusId, dialogueSubject?.id, grid]);

  /* --- 手番の解決 --- */
  const endTurn = () => setState(advanceTurn);

  // 手番の開始時点へ戻す。移動した位置も、途中で拾ったコインも元通りになる
  const undoTurn = () => setState(s => ({ ...s, ...s.snapshot }));

  const restartJunctionStage = () => {
    triggeredEncounters.current.clear();
    setEncounterCue(null);
    setSelectedInvestigation(null);
    setActiveEncounterId(null);
    setCompletedEncounterIds([]);
    setRevealedSecretIds([]);
    setState(initialJunctionState());
  };

  const exitAllowed = exit => {
    const requiredSecrets = exit.requires?.secretsAll || [];
    const requiredEntities = investigations
      .filter(item => requiredSecrets.includes(item.secretId))
      .map(item => item.entity);
    const requiredEncounters = encounters.filter(encounter =>
      encounter.requiredElements?.some(element => requiredEntities.includes(element))
    );
    return requiredSecrets.every(id => revealedSecretIds.includes(id)) &&
      requiredEncounters.every(encounter => completedEncounterIds.includes(encounter.id));
  };
  const enterExit = exit => {
    if (!exitAllowed(exit) || exit.to !== 3) return;
    setState(current => {
      const next = createLightChamberStage(current.units.filter(unit => unit.side === "party"));
      const base = { grid: next.grid, units: next.units, order: turnOrder(next.units).map(unit => unit.id), turn: 0, hasMoved: false, coins: [], purse: current.purse, log: [exit.text] };
      return { ...base, snapshot: snapshotOf(base) };
    });
    setCloseCamera(false);
    setSelectedInvestigation(null);
    setInvestigations([]);
    setEncounters([]);
    setExits([]);
    setRevealedSecretIds([]);
    setMode("dialogue");
  };

  // 演出(命中/外れの視覚効果)は見た目だけで、確定した結果は変えない。
  // 防御の構えごと・体当たりの成否ごとに、それぞれ違う演出を鳴らし分ける
  const playHitEffects = (attacker, target, r) => {
    const view = sceneRef.current;

    if (r.reaction === "dodge") {
      view?.playDodge(target.x, target.y);
      return;
    }
    if (r.reaction === "parry" && !r.hit) {
      view?.playParry(target.x, target.y, target.id);
      return;
    }
    if (r.reaction === "counter") {
      view?.playCounter(target.x, target.y, attacker.x, attacker.y);
      if (r.counterRoll?.hit) view?.playHit(attacker.x, attacker.y, { crit: r.counterRoll.crit, damage: r.counterRoll.damage, unitId: attacker.id });
      else view?.playMiss(attacker.x, attacker.y);
      return;
    }
    if ("pushedTo" in r) {   // 体当たり(resolveShove)の結果
      if (r.pushedTo) view?.playShove(target.x, target.y, r.pushedTo.x, r.pushedTo.y);
      else if (r.hit) view?.playHit(target.x, target.y, { crit: r.crit, damage: r.damage, unitId: target.id });
      else view?.playMiss(target.x, target.y);
      return;
    }
    if (r.hit) {
      view?.playHit(target.x, target.y, {
        crit: r.crit, damage: r.damage, unitId: target.id,
        tint: r.reaction === "deflect" ? 0x7fd9e0 : null   // いなす: 水色で「軽減された」印象に
      });
    } else {
      view?.playMiss(target.x, target.y);
    }
  };

  // 結果を先に確定させてから、演出と状態更新をそれぞれ行う。
  // targetが防御の構え(guard)を持っていれば、resolveMelee側で自動的に反映される。
  // meleeOptsはクリティカル狙い(critMin/fumbleMax)などresolveMeleeへの追加オプション
  const attack = (attacker, target, meleeOpts = {}) => {
    const r = resolveMelee({ attacker, target, units, roll: rollD20, grid, guard: target.guard || null, ...meleeOpts });
    if (!r.ok) return;
    playHitEffects(attacker, target, r);
    setState(s => {
      const applied = applyMeleeResult(s.units, s.coins, attacker, target, r);
      return { ...s, units: applied.units, coins: applied.coins, log: [...s.log, ...applied.lines] };
    });
  };

  // 体当たり: 攻撃の代わりに選ぶ行動。命中すればtargetを押し出し、押し出せなければ
  // ダメージ1点だけ入る(resolveShove側の仕様)。防御の構えへの反応は通常攻撃と同じ
  const shove = (attacker, target) => {
    const r = resolveShove({ attacker, target, units, roll: rollD20, grid, guard: target.guard || null });
    if (!r.ok) return;
    playHitEffects(attacker, target, r);
    setState(s => {
      const applied = applyMeleeResult(s.units, s.coins, attacker, target, r);
      return { ...s, units: applied.units, coins: applied.coins, log: [...s.log, ...applied.lines] };
    });
  };

  // 薙ぎ払い: 隣接する敵全員に、同じ1回分の出目で攻撃する(攻撃の代わりに選ぶ行動)。
  // 対象ごとの処理はapplyMeleeResultをそのまま使い回す(通常攻撃と同じ防御反応が個別に効く)
  const sweep = (attacker, targets) => {
    const sr = resolveSweep({ attacker, targets, units, roll: rollD20, grid });
    if (!sr.ok) return;
    sceneRef.current?.playSweep(attacker.x, attacker.y);   // 振り回した範囲を示す演出を1回だけ
    for (const res of sr.results) playHitEffects(attacker, res.target, res);
    setState(s => {
      const applied = applySweepResult(s.units, s.coins, attacker, sr);
      return { ...s, units: applied.units, coins: applied.coins, log: [...s.log, ...applied.lines] };
    });
  };

  // 防御の構えを選ぶ(移動・攻撃と同じく、選ぶとターンが終わる)。
  // 選んだ内容は本人が次に自分の手番で行動する(移動/攻撃する)まで有効
  const chooseGuard = type => {
    setState(s => ({
      ...s,
      units: s.units.map(u => (u.id === active.id ? { ...u, guard: { type, used: false } } : u)),
      log: [...s.log, `${active.name}は${GUARD_LABEL[type]}の構えを取った。`]
    }));
    endTurn();
  };

  // path は起点を除いた通り道。通りかかったコインはすべて拾う
  const moveTo = (unit, x, y, path = [{ x, y }]) => setState(s => applyMoveResult(s, unit, x, y, path));

  /* --- 敵の手番は自動で進める --- */
  useEffect(() => {
    if (!battleMode || over || !active || active.side !== "enemy") return;
    // 行動から手番送りまでの待ちも cleanup で回収する。
    // 以前は内側のタイマーIDを誰も持っていなかったため、この350msの間に「最初から」を
    // 押すと、古いendTurn(=setState(advanceTurn))が作り直した新しい盤面の手番を進めて
    // いた。関数更新なので新しい状態に効いてしまい、新規戦闘が味方ではなく敵の行動から
    // 始まった(2026-08-25、ターン終了から550ms・700msで再現。初手が錆喰い(2)になる)。
    let settle = null;
    const t = setTimeout(() => {
      const act = chooseEnemyAction(grid, active, units);
      if (act.type === "attack") {
        const target = units.find(u => u.id === act.targetId);
        if (target) attack(active, target);
      } else if (act.type === "move") {
        moveTo(active, act.to.x, act.to.y, act.path);
      }
      settle = setTimeout(endTurn, 350);
    }, 500);
    return () => { clearTimeout(t); clearTimeout(settle); };
  }, [active?.id, turn, over, battleMode]);

  /* --- ハイライトと入力 --- */
  const playerTurn = battleMode && !!active && active.side === "party" && !over;
  const reach = playerTurn && !hasMoved
    ? reachableCells(grid, active, movePointsFor(active.agility), occupiedBy(units, active.id))
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
    s.sync({ units, highlights, activeId: battleMode ? active?.id ?? null : null, targetIds: targets.map(t => t.id), coins });
    s.setPickHandler(data => {
      if (!battleMode && data.kind === "stage-prop") {
        const investigation = investigations.find(i => i.anchor === data.role);
        if (investigation) openInvestigation(investigation);
        return;
      }
      if (!playerTurn) return;
      if (data.kind === "unit") {
        const t = units.find(u => u.id === data.id);
        if (t && targets.some(x => x.id === t.id)) {
          if (attackMode === "shove") shove(active, t);
          else if (attackMode === "aimCrit") attack(active, t, { critMin: 18, fumbleMax: 3 });
          else attack(active, t);
          setAttackMode("normal");   // 構えと違い、1回使ったら通常へ戻す
          endTurn();
        }
        return;
      }
      if (data.kind === "cell" && !hasMoved && reach.some(c => c.x === data.x && c.y === data.y)) {
        moveTo(active, data.x, data.y, pathTo(reach, data));
      }
    });
  });

  const status = !partyAlive ? "敗北" : !enemyAlive ? "勝利" : null;
  // 手番開始時から何も変わっていなければ、やり直すものが無い(参照が同じかで判る)
  const canUndo = playerTurn &&
    (state.units !== state.snapshot.units || state.coins !== state.snapshot.coins);

  return (
    <div style={{ ...S.page, background: battleMode ? S.page.background : DIALOGUE_VIEW.background }}>
      <div ref={mountRef} style={S.canvas} />

      <div style={{ ...S.hud, background: battleMode ? S.hud.background : "rgba(38,60,79,.94)" }}>
        {battleMode && <div style={S.row}>
          <strong style={{ color: "#f2df7e" }}>
            {status ? `—— ${status} ——` : active ? `${active.name} の手番` : "—"}
          </strong>
          <span style={S.dim}>
            {playerTurn && (hasMoved ? "移動済み" : `移動力 ${movePointsFor(active.agility)}`)}
          </span>
          {(state.purse > 0 || coins.length > 0) && (
            <span style={S.dim}>拾った物 {state.purse}{coins.length ? ` / 落ちている ${coins.length}` : ""}</span>
          )}
        </div>}

        {battleMode && <div style={S.row}>
          {units.map(u => (
            <span key={u.id} style={{ ...S.chip, opacity: u.hp > 0 ? 1 : 0.35,
              borderColor: u.side === "party" ? "#6f9ad3" : "#c4634a" }}>
              {u.name} {u.hp}/{u.maxHp}
              {u.guard ? ` [${GUARD_LABEL[u.guard.type]}${u.guard.used ? "済" : ""}]` : ""}
            </span>
          ))}
        </div>}

        <div style={S.row}>
          <button style={S.btn} onClick={() => sceneRef.current?.rotate(-1)}>◀ 視点</button>
          <button style={S.btn} onClick={() => sceneRef.current?.rotate(1)}>視点 ▶</button>
          {battleMode ? <>
            <button style={S.btn} disabled={!canUndo} onClick={undoTurn}>やり直す</button>
            <button style={S.btn} disabled={!playerTurn} onClick={endTurn}>ターン終了</button>
            <button style={{ ...S.btn, marginLeft: 20 }} onClick={restartJunctionStage}>最初から</button>
            <button style={S.btn} onClick={() => { setCloseCamera(false); setMode("dialogue"); }}>会話モードへ</button>
          </> : <>
            <strong style={{ color: "#f2df7e" }}>会話モード</strong>
            <span style={S.dim}>{closeCamera ? `${dialogueFocus?.name}視点：${dialogueSubject?.name || "坑道の奥"}を見ている。` : `${grid.stage?.name}を調べ、相手と話す。`}</span>
            {units.filter(u => u.side === "party").map(u => (
              <button key={u.id} style={S.btn} onClick={() => { setDialogueFocusId(u.id); setCloseCamera(true); }}>{u.name}視点</button>
            ))}
            {closeCamera && <button style={S.btn} onClick={() => setCloseCamera(false)}>広域表示</button>}
            {encounters.length > 0 && <button style={S.btn} onClick={() => { setCloseCamera(false); setSelectedInvestigation(null); setMode("battle"); }}>戦闘開始</button>}
          </>}
        </div>

        {battleMode && <>
        {/* 攻撃モード: 選んでから相手をクリックすると発動する。1回使うと通常へ戻る。
            薙ぎ払いだけは相手を選ばず即発動するボタン(単一対象への「モード」ではないため) */}
        <div style={S.row}>
          <span style={S.dim}>攻撃:</span>
          {[["normal", "通常"], ["shove", "体当たり"], ["aimCrit", "クリティカル狙い"]].map(([key, label]) => (
            <button
              key={key}
              style={{ ...S.btn, ...(attackMode === key ? S.btnActive : {}) }}
              disabled={!playerTurn}
              onClick={() => setAttackMode(key)}
            >
              {label}
            </button>
          ))}
          {/* 隣接する敵が2体以上いる時だけ意味がある(1体なら通常攻撃の方が強い) */}
          <button style={S.btn} disabled={!playerTurn || targets.length < 2}
            onClick={() => { sweep(active, targets); endTurn(); }}>
            薙ぎ払い({targets.length})
          </button>
        </div>

        <div style={S.row}>
          <span style={S.dim}>防御:</span>
          {["parry", "deflect", "counter", "dodge"].map(type => (
            <button key={type} style={S.btn} disabled={!playerTurn} onClick={() => chooseGuard(type)}>
              {GUARD_LABEL[type]}
            </button>
          ))}
          {/* ランタンはガレス・リディアそれぞれ個別に点灯/消灯したいとのことなので、
              ユニットごとのチェックボックスにしてある。防御の操作から間隔を空けて置く */}
          <span style={{ ...S.dim, marginLeft: 20 }}>ランタン:</span>
          {units.filter(u => u.side === "party").map(u => (
            <label key={u.id} style={S.toggle}>
              <input
                type="checkbox"
                checked={lanternOn[u.id] ?? false}
                onChange={e => setLanternOn(prev => ({ ...prev, [u.id]: e.target.checked }))}
              />
              {u.name}
            </label>
          ))}
        </div>

        <div style={S.hint}>青いマス=移動先 / 赤いマス=攻撃できる相手。攻撃するとターンが終わる。</div>
        </>}

        {!battleMode && investigations.length > 0 && <div style={S.row}>
          <span style={S.dim}>調べる:</span>
          {investigations.map(item => (
            <button key={item.secretId} style={S.btn} onClick={() => openInvestigation(item)}>
              {item.entity}{encounters.some(e => e.requiredElements?.includes(item.entity) && completedEncounterIds.includes(e.id)) ? "（撃退済み）" : ""}
            </button>
          ))}
        </div>}
        {!battleMode && selectedInvestigation && <div style={S.inspect}>
          <strong>{selectedInvestigation.entity}</strong>
          <div>{selectedInvestigation.surface}</div>
          <div style={{ marginTop: 4, color: "#f2df7e" }}>{selectedInvestigation.text}</div>
          {selectedInvestigation.companionLine && <div style={S.companionLine}>
            {selectedInvestigation.companionLine.speaker}「{selectedInvestigation.companionLine.text}」
          </div>}
          {encounterCue ? <div style={{ marginTop: 6, color: "#ffcb6b" }}>{encounterCue.onsetText}</div> :
            <button style={{ ...S.btn, marginTop: 6 }} onClick={() => setSelectedInvestigation(null)}>閉じる</button>}
        </div>}

        {!battleMode && exits.length > 0 && <div style={S.row}>
          <span style={S.dim}>進む:</span>
          {exits.map(exit => <button key={exit.id} style={S.btn} disabled={!exitAllowed(exit)} onClick={() => enterExit(exit)}>
            {exit.match[0]}へ {exitAllowed(exit) ? "進む" : "（まだ進めない）"}
          </button>)}
        </div>}

        <div style={S.row}>
          <button style={S.btn} onClick={() => setD20DemoResult(1 + Math.floor(Math.random() * 20))}>D20演出を試す</button>
        </div>

        {/* 演出の見た目調整(検証用)。盤面のルールには影響しない */}
        {battleMode && <div style={S.row}>
          <label style={S.toggle}>
            <input type="checkbox" checked={fogOn} onChange={e => setFogOn(e.target.checked)} />
            霧
          </label>
          <input
            type="range" min={0} max={1} step={0.05} value={fogLevel} disabled={!fogOn}
            onChange={e => setFogLevel(Number(e.target.value))}
            style={{ width: 90 }}
          />
          <input
            type="color" value={fogColor} disabled={!fogOn}
            onChange={e => setFogColor(e.target.value)}
            style={{ width: 28, height: 20, padding: 0, border: "none", background: "none" }}
          />
          <label style={S.toggle}>
            <input type="checkbox" checked={dustOn} onChange={e => setDustOn(e.target.checked)} />
            塵
          </label>
          <label style={S.toggle}>
            <input type="checkbox" checked={rainOn} onChange={e => setRainOn(e.target.checked)} />
            雨
          </label>
          <label style={S.toggle}>
            <input type="checkbox" checked={wallsOn} onChange={e => setWallsOn(e.target.checked)} />
            壁
          </label>
          <label style={S.toggle}>
            背景
            <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} style={{ width: 28, height: 20, padding: 0, border: "none", background: "none" }} />
          </label>
          <label style={S.toggle}>
            光
            <select value={lightPreset} onChange={e => setLightPreset(e.target.value)} style={S.select}>
              <option value="night">夜</option>
              <option value="day">昼</option>
            </select>
          </label>
          <label style={S.toggle}>
            <input type="checkbox" checked={obstaclesOn} onChange={e => setObstaclesOn(e.target.checked)} />
            障害物
          </label>
          <label style={S.toggle}>
            <input type="checkbox" checked={waterOn} onChange={e => setWaterOn(e.target.checked)} />
            水溜り
          </label>
          <label style={S.toggle}>
            <input type="checkbox" checked={holesOn} onChange={e => setHolesOn(e.target.checked)} />
            穴
          </label>
        </div>}

        {/* GMの語りはログに残す(Phase 1は定型文。Phase 4でGMの語りへ差し替える) */}
        {battleMode && <div style={S.log}>
          {state.log.slice(-8).map((l, i) => <div key={i}>{l}</div>)}
        </div>}
      </div>
      <D20Overlay
        open={d20DemoResult !== null}
        result={d20DemoResult ?? 20}
        title="D20 演出テスト"
        onComplete={() => setD20DemoResult(null)}
      />
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
  btnActive: { background: "#3d7fb5", borderColor: "#3d7fb5" },
  hint: { color: "#8b93a7", fontSize: 12, marginBottom: 6 },
  toggle: { display: "flex", alignItems: "center", gap: 4, color: "#8b93a7", fontSize: 12, cursor: "pointer" },
  select: { background: "#2b303c", color: "#e6e8ee", border: "1px solid #3c4354", borderRadius: 4, font: "inherit" },
  log: { maxHeight: 116, overflowY: "auto", background: "#11141b",
    border: "1px solid #2b303c", borderRadius: 6, padding: "6px 9px" },
  inspect: { background: "#20242e", border: "1px solid #8a7648", borderRadius: 6, padding: "7px 9px", marginBottom: 6 },
  companionLine: { marginTop: 7, color: "#d98cc9", fontWeight: 600 }
};
