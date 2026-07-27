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
  turnOrder, resolveMelee, chooseEnemyAction,
  makeRng, scatterObstacles, scatterWater, occupiedBy, pathTo, cellAt
} from "./core.js";

// 防御の構え。仕様: docs/BATTLE_GRID_STATUS.md「防御・リアクション」節。
// deflect(内部の識別子)の表示名は「いなす」。「パリィ」と紛らわしいとの指摘で
// 「受け流し」から改名したが、type自体は変えていない(表示名だけの変更)
const GUARD_LABEL = { parry: "パリィ", deflect: "いなす", counter: "カウンター", dodge: "ドッジ" };

/* --- 盤面 ---
   8x8を基本として作り込む。素の盤面は全面が床で、遮蔽はランダムに散らす
   (左右対称に置くと展開が読めてしまうため)。柱(高さ1.0)は進入不可、
   瓦礫(0.25〜0.75)は乗り越えられる */
const BASE_MAP = Array(8).fill("........");

// 開始位置。?fixture=melee で「すでに隣接している」状態から始められる
// (交戦中の挙動を毎回同じ手順で確認するため)
const START = {
  default: { gareth: [0, 3], lydia: [0, 4], rust1: [7, 3], rust2: [7, 4] },
  melee: { gareth: [3, 3], lydia: [2, 3], rust1: [4, 3], rust2: [4, 4] }
};

const params = () => new URLSearchParams(location.search);

const makeUnits = () => {
  const p = START[params().get("fixture")] || START.default;
  return [
    { id: "gareth", name: "ガレス", side: "party", x: p.gareth[0], y: p.gareth[1], hp: 16, maxHp: 16, atk: 3, agility: 7, defenseDc: 12, height: 2 },
    { id: "lydia", name: "リディア", side: "party", x: p.lydia[0], y: p.lydia[1], hp: 14, maxHp: 14, atk: 2, agility: 4, defenseDc: 12, height: 1.9 },
    { id: "rust1", name: "錆喰い", side: "enemy", x: p.rust1[0], y: p.rust1[1], hp: 10, maxHp: 10, atk: 2, agility: 5, defenseDc: 12, height: 0.8 },
    { id: "rust2", name: "錆喰い(2)", side: "enemy", x: p.rust2[0], y: p.rust2[1], hp: 10, maxHp: 10, atk: 2, agility: 5, defenseDc: 12, height: 0.8 }
  ];
};

// ?seed=123 を付けると同じ盤面を再現できる(検証用)。無指定なら毎回変わる
const makeGrid = seed => {
  const units = makeUnits();
  const clear = units.map(u => ({ x: u.x, y: u.y }));
  const grid = scatterObstacles(createGrid(BASE_MAP), makeRng(seed), {
    pillars: 5, rubble: 6, keepClear: clear
  });
  // 水溜り(足元を取られる地形)は障害物とは別のrngで散らす。同じrngを使い回すと
  // 障害物の個数を変えた時に水溜りの配置まで連動して変わってしまうため
  return scatterWater(grid, makeRng(seed + 9973), { count: 4, keepClear: clear });
};

const rollD20 = () => 1 + Math.floor(Math.random() * 20);

// 手番の開始時点を控えておき、「やり直す」で丸ごと戻せるようにする。
// 状態はすべて作り直して差し替えているので、参照を持っておくだけで十分
const snapshotOf = s => ({ units: s.units, coins: s.coins, purse: s.purse, hasMoved: false, log: s.log });

const initialState = (seed = Number(params().get("seed")) || (Date.now() & 0xffff)) => {
  const units = makeUnits();
  const base = {
    seed,
    grid: makeGrid(seed),
    units,
    order: turnOrder(units).map(u => u.id),
    turn: 0,
    hasMoved: false,
    coins: [],        // 倒れた駒の跡。通りかかると拾える
    purse: 0,         // 拾ったコインの数
    log: ["戦闘開始。"]
  };
  return { ...base, snapshot: snapshotOf(base) };
};

const alive = (units, side) => units.some(u => u.side === side && u.hp > 0);

// ダメージ適用の共通処理(通常の攻撃とカウンターの反撃で使い回す)。
// 倒れた場合はその場にコインを残す(既存の「戦闘不能はコインになる」仕様と同じ)
const applyDamage = (units, coins, id, damage) => {
  const cur = units.find(u => u.id === id);
  const hp = Math.max(0, cur.hp - damage);
  const downed = hp <= 0;
  return {
    units: units.map(u => (u.id === id ? { ...u, hp } : u)),
    coins: downed ? [...coins, { id: "coin_" + id, x: cur.x, y: cur.y }] : coins,
    hp, cur, downed
  };
};

export default function BattleView() {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const [state, setState] = useState(initialState);
  // 演出の見た目調整用。ゲームの状態ではないので「やり直す」「最初から」の対象外
  const [fogOn, setFogOn] = useState(false);
  const [fogLevel, setFogLevel] = useState(1);
  const [fogColor, setFogColor] = useState("#161a22");
  const [dustOn, setDustOn] = useState(false);
  const [rainOn, setRainOn] = useState(false);
  const [wallsOn, setWallsOn] = useState(false);
  const [bgColor, setBgColor] = useState("#161a22");
  const [lightPreset, setLightPreset] = useState("night");
  const [lanternsOn, setLanternsOn] = useState(false);
  const [obstaclesOn, setObstaclesOn] = useState(false);
  const [waterOn, setWaterOn] = useState(false);
  const [holesOn, setHolesOn] = useState(false);

  const { grid, units, order, turn, hasMoved, coins } = state;
  const active = units.find(u => u.id === order[turn] && u.hp > 0) || null;
  const partyAlive = alive(units, "party");
  const enemyAlive = alive(units, "enemy");
  const over = !partyAlive || !enemyAlive;

  /* --- シーンの生成と破棄。盤面が変わったら作り直す(「最初から」で新しい配置になる) --- */
  useEffect(() => {
    const s = createBattleScene(mountRef.current, grid);
    sceneRef.current = s;
    // 新しい盤面を作った直後は既定値に戻るので、現在のパネルの設定を反映し直す
    s.setFogEnabled(fogOn);
    s.setFogIntensity(fogLevel);
    s.setFogColor(fogColor);
    s.setDustEnabled(dustOn);
    s.setRainEnabled(rainOn);
    s.setWallsEnabled(wallsOn);
    s.setBackgroundColor(bgColor);
    s.setLightPreset(lightPreset);
    s.setLanternsEnabled(lanternsOn);
    s.setObstaclesEnabled(obstaclesOn);
    s.setWaterEnabled(waterOn);
    s.setHolesEnabled(holesOn);
    return () => { s.dispose(); sceneRef.current = null; };
  }, [grid]);

  /* --- 演出パネルの設定を反映(盤面を作り直さず、既存シーンへその場で効かせる) --- */
  useEffect(() => { sceneRef.current?.setFogEnabled(fogOn); }, [fogOn, grid]);
  useEffect(() => { sceneRef.current?.setFogIntensity(fogLevel); }, [fogLevel, grid]);
  useEffect(() => { sceneRef.current?.setFogColor(fogColor); }, [fogColor, grid]);
  useEffect(() => { sceneRef.current?.setDustEnabled(dustOn); }, [dustOn, grid]);
  useEffect(() => { sceneRef.current?.setRainEnabled(rainOn); }, [rainOn, grid]);
  useEffect(() => { sceneRef.current?.setWallsEnabled(wallsOn); }, [wallsOn, grid]);
  useEffect(() => { sceneRef.current?.setBackgroundColor(bgColor); }, [bgColor, grid]);
  useEffect(() => { sceneRef.current?.setLightPreset(lightPreset); }, [lightPreset, grid]);
  useEffect(() => { sceneRef.current?.setLanternsEnabled(lanternsOn); }, [lanternsOn, grid]);
  useEffect(() => { sceneRef.current?.setObstaclesEnabled(obstaclesOn); }, [obstaclesOn, grid]);
  useEffect(() => { sceneRef.current?.setWaterEnabled(waterOn); }, [waterOn, grid]);
  useEffect(() => { sceneRef.current?.setHolesEnabled(holesOn); }, [holesOn, grid]);

  /* --- 手番の解決 --- */
  const endTurn = () => setState(s => {
    // 生存している次のユニットへ送る。1周しても居なければそのまま
    for (let i = 1; i <= s.order.length; i++) {
      const next = (s.turn + i) % s.order.length;
      const u = s.units.find(x => x.id === s.order[next]);
      if (u && u.hp > 0) return { ...s, turn: next, hasMoved: false, snapshot: snapshotOf(s) };
    }
    return s;
  });

  // 手番の開始時点へ戻す。移動した位置も、途中で拾ったコインも元通りになる
  const undoTurn = () => setState(s => ({ ...s, ...s.snapshot }));

  // 結果を先に確定させてから、演出と状態更新をそれぞれ行う。
  // 演出は見た目だけで、確定した結果を変えない。
  // targetが防御の構え(guard)を持っていれば、resolveMelee側で自動的に反映される
  const attack = (attacker, target) => {
    const r = resolveMelee({ attacker, target, units, roll: rollD20, grid, guard: target.guard || null });
    if (!r.ok) return;
    const view = sceneRef.current;

    if (r.reaction === "dodge") view?.playMiss(target.x, target.y);
    else if (r.hit) view?.playHit(target.x, target.y, { crit: r.crit, damage: r.damage, unitId: target.id });
    else view?.playMiss(target.x, target.y);

    // カウンター成功時は、元の攻撃側へ反撃が飛ぶ演出も出す
    if (r.reaction === "counter" && r.counterRoll) {
      if (r.counterRoll.hit) view?.playHit(attacker.x, attacker.y, { crit: r.counterRoll.crit, damage: r.counterRoll.damage, unitId: attacker.id });
      else view?.playMiss(attacker.x, attacker.y);
    }

    // 高低差は「上を取っている/見上げている」と言い添える(数値そのものは出さない)
    const highNote = r.steps > 0 ? "高い所から打ち下ろす。" : r.steps < 0 ? "見上げる形で分が悪い。" : "";
    // パリィ・カウンターはguard中1回だけ。成否にかかわらず(パリィ)/成功時のみ(カウンター)
    // resolveMelee側がreactionを返した時点で使い切ったということなので、ここでusedを立てる
    const guardSpent = r.reaction === "parry" || r.reaction === "counter";

    // 防御が成功した(=攻撃を防いだ/軽減した)場合だけ「◯◯、成功。」と明示する。
    // 失敗時はダメージが入ること自体で失敗と分かるので、あえて「失敗」とは書かない。
    // dodge/deflect/counterは発動した時点で必ず成功(resolveMelee側の仕様)、
    // parryだけ「試みたが外れた(=通常命中のまま)」場合があるので!hitで判定する
    const tag = label => `${GUARD_LABEL[label]}、成功。`;

    setState(s => {
      // 自分が行動した(攻撃した)ので、攻撃側が持っていた古い構えはここで解ける
      let units = s.units.map(u => {
        if (u.id === attacker.id && u.guard) return { ...u, guard: null };
        if (guardSpent && u.id === target.id) return { ...u, guard: { ...u.guard, used: true } };
        return u;
      });
      let coins = s.coins;
      const lines = [];

      if (r.reaction === "dodge") {
        lines.push(`${tag("dodge")}${target.name}は身をかわした。`);
        return { ...s, units, coins, log: [...s.log, ...lines] };
      }

      if (r.reaction === "parry" && !r.hit) {
        lines.push(`${tag("parry")}${target.name}が受け止めた!${attacker.name}の攻撃は届かなかった(d20=${r.d20})。`);
        return { ...s, units, coins, log: [...s.log, ...lines] };
      }

      if (r.reaction === "counter") {
        lines.push(`${tag("counter")}${target.name}が防御と同時に反撃に転じた。`);
        const before = units.find(u => u.id === attacker.id);
        if (r.counterRoll.hit) {
          const applied = applyDamage(units, coins, attacker.id, r.counterRoll.damage);
          units = applied.units; coins = applied.coins;
          lines.push(`${attacker.name}に${r.counterRoll.damage}ダメージ(残りHP ${applied.hp}/${before.maxHp})。`);
          if (applied.downed) lines.push(`${attacker.name}は倒れた。落とした物がその場に残っている。`);
        } else {
          lines.push("反撃は外れた。");
        }
        return { ...s, units, coins, log: [...s.log, ...lines] };
      }

      if (!r.hit) {
        // ここに来るのは通常の外れ、またはパリィを試みたが防御ロールに失敗した場合
        lines.push(`${attacker.name}の攻撃は${r.fumble ? "大きく外れ、体勢を崩した" : "外れた"}(d20=${r.d20})。${highNote}`);
        return { ...s, units, coins, log: [...s.log, ...lines] };
      }

      const applied = applyDamage(units, coins, target.id, r.damage);
      units = applied.units; coins = applied.coins;
      lines.push(
        `${attacker.name}の攻撃が${r.crit ? "深々と" : ""}命中(d20=${r.d20})。` +
        `${target.name}に${r.damage}ダメージ(残りHP ${applied.hp}/${applied.cur.maxHp})。` +
        (r.reaction === "deflect" ? tag("deflect") : "") +
        (r.surround >= 2 ? `${r.surround}人で囲んでいる(×${r.multiplier.toFixed(2)})。` : "") +
        highNote
      );
      if (applied.downed) lines.push(`${target.name}は倒れた。落とした物がその場に残っている。`);
      return { ...s, units, coins, log: [...s.log, ...lines] };
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
  const moveTo = (unit, x, y, path = [{ x, y }]) => setState(s => {
    const walked = new Set(path.map(p => p.x + "," + p.y));
    const picked = s.coins.filter(c => walked.has(c.x + "," + c.y));
    // 水溜りを踏んだかどうかは演出上の一言だけ。移動力の消費自体はreachableCellsが
    // 既に織り込んでいるので、ここで何かを差し引く必要はない
    const splashed = path.some(p => cellAt(s.grid, p.x, p.y)?.terrain?.type === "water");
    const lines = [];
    if (splashed) lines.push(`${unit.name}は水溜りに足を取られながら進んだ。`);
    if (picked.length) lines.push(`${unit.name}が落ちていた物を${picked.length}つ拾った。`);
    return {
      ...s,
      // 移動したので、持っていた古い構えはここで解ける(guardは選び直さない限り引き継がない)
      units: s.units.map(u => (u.id === unit.id ? { ...u, x, y, guard: null } : u)),
      coins: s.coins.filter(c => !picked.includes(c)),
      purse: s.purse + picked.length,
      hasMoved: true,
      log: lines.length ? [...s.log, ...lines] : s.log
    };
  });

  /* --- 敵の手番は自動で進める --- */
  useEffect(() => {
    if (over || !active || active.side !== "enemy") return;
    const t = setTimeout(() => {
      const act = chooseEnemyAction(grid, active, units);
      if (act.type === "attack") {
        const target = units.find(u => u.id === act.targetId);
        if (target) attack(active, target);
      } else if (act.type === "move") {
        moveTo(active, act.to.x, act.to.y, act.path);
      }
      setTimeout(endTurn, 350);
    }, 500);
    return () => clearTimeout(t);
  }, [active?.id, turn, over]);

  /* --- ハイライトと入力 --- */
  const playerTurn = !!active && active.side === "party" && !over;
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
    s.sync({ units, highlights, activeId: active?.id ?? null, targetIds: targets.map(t => t.id), coins });
    s.setPickHandler(data => {
      if (!playerTurn) return;
      if (data.kind === "unit") {
        const t = units.find(u => u.id === data.id);
        if (t && targets.some(x => x.id === t.id)) { attack(active, t); endTurn(); }
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
          {(state.purse > 0 || coins.length > 0) && (
            <span style={S.dim}>拾った物 {state.purse}{coins.length ? ` / 落ちている ${coins.length}` : ""}</span>
          )}
        </div>

        <div style={S.row}>
          {units.map(u => (
            <span key={u.id} style={{ ...S.chip, opacity: u.hp > 0 ? 1 : 0.35,
              borderColor: u.side === "party" ? "#6f9ad3" : "#c4634a" }}>
              {u.name} {u.hp}/{u.maxHp}
              {u.guard ? ` [${GUARD_LABEL[u.guard.type]}${u.guard.used ? "済" : ""}]` : ""}
            </span>
          ))}
        </div>

        <div style={S.row}>
          <button style={S.btn} onClick={() => sceneRef.current?.rotate(-1)}>◀ 視点</button>
          <button style={S.btn} onClick={() => sceneRef.current?.rotate(1)}>視点 ▶</button>
          <button style={S.btn} disabled={!canUndo} onClick={undoTurn}>やり直す</button>
          <button style={S.btn} disabled={!playerTurn} onClick={endTurn}>ターン終了</button>
          {/* 押し間違えないよう他のボタンとは少し間隔を空けるが、遠すぎない位置に置く */}
          <button style={{ ...S.btn, marginLeft: 20 }} onClick={() => setState(initialState())}>最初から</button>
        </div>

        <div style={S.row}>
          <span style={S.dim}>防御:</span>
          {["parry", "deflect", "counter", "dodge"].map(type => (
            <button key={type} style={S.btn} disabled={!playerTurn} onClick={() => chooseGuard(type)}>
              {GUARD_LABEL[type]}
            </button>
          ))}
        </div>

        <div style={S.hint}>
          青いマス=移動先 / 赤いマス=攻撃できる相手。攻撃するとターンが終わる。
        </div>

        {/* 演出の見た目調整(検証用)。盤面のルールには影響しない */}
        <div style={S.row}>
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
            <input type="checkbox" checked={lanternsOn} onChange={e => setLanternsOn(e.target.checked)} />
            ランタン
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
  toggle: { display: "flex", alignItems: "center", gap: 4, color: "#8b93a7", fontSize: 12, cursor: "pointer" },
  select: { background: "#2b303c", color: "#e6e8ee", border: "1px solid #3c4354", borderRadius: 4, font: "inherit" },
  log: { maxHeight: 116, overflowY: "auto", background: "#11141b",
    border: "1px solid #2b303c", borderRadius: 6, padding: "6px 9px" }
};
