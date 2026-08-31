import React, { useEffect, useRef, useState } from "react";
import { createBattleScene } from "../battle/view3d.js";
import { chooseEnemyAction, isAdjacent, makeRng, movePointsFor, occupiedBy, reachableCells, resolveMelee, resolveRanged, turnOrder } from "../battle/core.js";
import { ITEMS, partyMaxHp } from "./core.js";
import { EXPEDITION_BATTLE_CONFIG } from "./battleConfig.js";
import { createExpeditionBattleLayout, facingToward, nearestAlive } from "./battleState.js";

// ズームの可動域。view3d.js側の上下限と同じ値にする(片方だけ動かすと、
// スライダーの端まで動かしてもカメラが追従しない)。
const ZOOM_MIN = 0.5, ZOOM_MAX = 5.0;
// コンパスの記号と、北から時計回りに何度ずれているか。
const COMPASS_POINTS = [["N", 0], ["E", 90], ["S", 180], ["W", 270]];
const atkOf = (baseAtk, gear = {}) => baseAtk + [gear.weapon, gear.charm].reduce((n, id) => n + (id && ITEMS[id]?.stat === "atk" ? ITEMS[id].power : 0), 0);
// 味方も敵も同じ形で組む。歩ける高さや見た目のような共通属性を、3か所へ書き分けないため。
// combat(hp/maxHp/atk)だけは、装備と遠征中の残HPで決まるので呼ぶ側から渡す。
const unitFrom = (id, side, config, start, faceTo, combat) => ({
  id, name: config.name, side, ...start,
  facing: facingToward(start, faceTo),
  modelFacingOffset: EXPEDITION_BATTLE_CONFIG.presentation.modelFacingOffset[side],
  ...combat,
  defenseDc: config.defenseDc,
  fleeHpRatio: config.fleeHpRatio ?? 0,
  agility: config.agility,
  height: config.height,
  canClimb: config.canClimb,
  ranged: config.ranged ?? false,
  maxStep: EXPEDITION_BATTLE_CONFIG.movement.maxStep,
  modelId: config.modelId,
  ...(config.tint !== undefined ? { tint: config.tint } : {}),
});

const makeState = (guardian, layout, equipment = {}, party = {}, seed = 0) => {
  const { hero: heroConfig, mage: mageConfig, enemy: enemyConfig, corridorEnemy: corridorEnemyConfig, guardian: guardianConfig } = EXPEDITION_BATTLE_CONFIG.units;
  // 通路戦だけ2体編成(corridorEnemy)。三叉路・守護者戦は従来どおり1体。
  const foeConfig = guardian ? guardianConfig : layout === "corridor" ? corridorEnemyConfig : enemyConfig;
  // 最大HPは core.partyMaxHp が正本。地図画面と戦闘画面で違う値を出さないよう式を複製しない。
  const hero = { atk: atkOf(heroConfig.atk, equipment.hero), hp: partyMaxHp("hero", equipment) };
  const mage = { atk: atkOf(mageConfig.atk, equipment.mage), hp: partyMaxHp("mage", equipment) };
  const battleLayout = guardian ? "guardian" : layout;
  const { grid, starts } = createExpeditionBattleLayout(battleLayout, seed);
  // 味方の初期の向きは1体目の敵に対して決める(2体目は少し離れた位置に見えるだけでよい)。
  const foeFaceTo = starts.enemies[0];
  const foes = starts.enemies.map((pos, i) =>
    unitFrom(starts.enemies.length > 1 ? `enemy-${i}` : "enemy", "enemy", foeConfig, pos, starts.hero, { hp: foeConfig.hp, maxHp: foeConfig.hp, atk: foeConfig.atk }));
  const units = [
    unitFrom("hero", "party", heroConfig, starts.hero, foeFaceTo, { hp: Math.min(hero.hp, party.hero ?? hero.hp), maxHp: hero.hp, atk: hero.atk }),
    unitFrom("mage", "party", mageConfig, starts.mage, foeFaceTo, { hp: Math.min(mage.hp, party.mage ?? mage.hp), maxHp: mage.hp, atk: mage.atk }),
    ...foes,
  ];
  // 遭遇は稀に不意打ちで、敵が先手を取ることがある(既定20%)。+555はダイス用rng(+777)や
  // 盤面生成用rng(seedそのまま)とは別系列にするためのオフセット。
  const enemyFirst = makeRng(seed + 555)() < EXPEDITION_BATTLE_CONFIG.encounter.enemyFirstChance;
  const openingLine = guardian ? "守護者が宝箱を守っている。"
    : layout?.kind === "junction" ? "坑道の獣が三叉路を塞いだ。"
    : layout?.kind === "hall" ? "大広間の奥で、坑道の獣が振り返った。"
    : "坑道の獣が2匹、狭い通路を塞いだ。";
  return { grid, units, order: turnOrder(units, { enemyFirst }).map(u => u.id), turn: 0, log: [openingLine] };
};
const alive = (units, side) => units.some(u => u.side === side && u.hp > 0);
// ポケモンアングルの「向き」側。手番の駒が向いている方向(facing)を画面奥にする水平角度(度)。
// 注視点側は pokemonAngle() が決める。カメラ位置→原点の視線方向が
// heroの向きの逆になるように定める(=heroが向いている敵と、画面奥で正対する構図を保つ)。
// 厳密に180度正対させると、hero自身が画面上で奥の敵と重なって隠してしまうため、
// 少しだけ角度をずらす(既定20度)。
const azimuthForFacing = facing => {
  const rad = Math.atan2(-Math.cos(facing), -Math.sin(facing));
  const deg = ((rad * 180 / Math.PI) % 360 + 360) % 360;
  return (deg - EXPEDITION_BATTLE_CONFIG.presentation.cameraAzimuthOffsetDeg + 360) % 360;
};
export default function ExpeditionBattle({ guardian, layout = "corridor", equipment = {}, party = {}, seed = 0, tonics = 0, onUseTonic, onFinish }) {
  const battleLayout = guardian ? "guardian" : layout;
  const mount = useRef(null), scene = useRef(null), [state, setState] = useState(() => makeState(guardian, battleLayout, equipment, party, seed));
  const turnTimer = useRef(null);
  // seedからダイス目を再現する。+777で盤面配置のrng(同じseedをそのまま使う)とは別系列にする。
  const rng = useRef(null);
  if (!rng.current) rng.current = makeRng(seed + 777);
  const roll = () => 1 + Math.floor(rng.current() * 20);
  const [moved, setMoved] = useState(false), [partyAction, setPartyAction] = useState(null), [busy, setBusy] = useState(false), [combatShot, setCombatShot] = useState(false);
  // カメラの水平の向き(度)。初期値はheroの初期の向き(敵と対峙する向き)を画面奥にする角度。
  // 「視点を回す」ボタンとスライダーの両方から同じ値を操作する。
  const [cameraAzimuthDeg, setCameraAzimuthDegState] = useState(() => {
    const hero = state.units.find(u => u.id === "hero");
    return hero ? azimuthForFacing(hero.facing) : 45;
  });
  const setAzimuth = deg => { const normalized = ((deg % 360) + 360) % 360; setCameraAzimuthDegState(normalized); scene.current?.setCameraAzimuthDeg(normalized); };
  // 表示・スモークテスト用の0-3方向ラベルは、実際の角度から逆算する派生値にする(正本はcameraAzimuthDeg)。
  const viewDirection = Math.round(((cameraAzimuthDeg - 45 + 360) % 360) / 90) % 4;
  // カメラの見下ろし角を見た目を見ながら調整するスライダー。正本はConfig側で、ここでは動かして確認するだけ。
  //
  // 以前は敵に隣接している間だけ60度へ上げていた(hero自身が対峙する敵を隠すため)。
  // 2026-08-25に外した。スタンディ(垂直なアクリル板)は見下ろすほど絵が短縮されて潰れるので、
  // 一番駒を見たい戦闘中に一番読めなくなっていた(scripts/camera-compare.mjsで並べて確認)。
  // 隠れの対処はcameraAzimuthOffsetDegと遮蔽フェードが担う。
  const [cameraElevationDeg, setCameraElevationDeg] = useState(
    () => EXPEDITION_BATTLE_CONFIG.presentation.cameraElevationDeg);
  const setElevation = deg => { setCameraElevationDeg(deg); scene.current?.setCameraElevationDeg(deg); };
  const [cameraZoom, setCameraZoomState] = useState(() => EXPEDITION_BATTLE_CONFIG.presentation.cameraZoom);
  const setZoom = zoom => {
    const normalized = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Number(zoom) || EXPEDITION_BATTLE_CONFIG.presentation.cameraZoom));
    setCameraZoomState(normalized);
    scene.current?.setCameraZoom(normalized);
  };
  // 演出の見た目調整用(BattleView.jsxの検証パネルと同じもの)。ゲームの状態には影響しない。
  const [fogOn, setFogOn] = useState(false);
  const [fogLevel, setFogLevel] = useState(1);
  const [fogColor, setFogColor] = useState("#161a22");
  const [dustOn, setDustOn] = useState(EXPEDITION_BATTLE_CONFIG.presentation.dust);
  const [rainOn, setRainOn] = useState(false);
  const [wallsOn, setWallsOn] = useState(EXPEDITION_BATTLE_CONFIG.presentation.showBackdropWalls);
  const [bgColor, setBgColor] = useState(EXPEDITION_BATTLE_CONFIG.presentation.backgroundColor);
  const [lightPreset, setLightPreset] = useState("night");
  const [obstaclesOn, setObstaclesOn] = useState(true);
  const [waterOn, setWaterOn] = useState(true);
  const [holesOn, setHolesOn] = useState(true);
  // カンテラの点灯/消灯。暗闇の戦闘での主光源なので既定は点灯。
  // 味方全員に効かせる。以前はheroにだけ効かせていたため、消しても
  // リディアのカンテラが点いたままで炎の揺らぎが残っていた
  // (2026-08-25、床の明るさのばらつきを実測して発覚: 消したはずが2.303、
  //  両方消すと0.001)。消灯時は環境光だけになり、揺らぎは完全に止まる。
  const [lanternOn, setLanternOn] = useState(true);
  // 画面に出す指の本数。view3dがcanvasのdata属性へ書くので、そこを見に行く。
  const [fingers, setFingers] = useState(0);
  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    const read = () => setFingers(Number(el.dataset.fingers || 0));
    const mo = new MutationObserver(read);
    mo.observe(el, { attributes: true, attributeFilter: ["data-fingers"] });
    return () => mo.disconnect();
  }, []);
  const applyLanterns = (scene, units, on) => {
    for (const u of units) if (u.side === "party") scene?.setLanternEnabled(u.id, on);
  };
  const active = state.units.find(u => u.id === state.order[state.turn] && u.hp > 0);
  const partyAlive = alive(state.units, "party"), enemyAlive = alive(state.units, "enemy");
  // 味方は全員プレイヤーが操作する。2026-08-25にリディアのオートバトルを外した
  // (chooseCompanionActionによる自動行動と、その入口だった「相棒指示」を同時に消している)。
  const playerTurn = active?.side === "party" && partyAlive && enemyAlive;
  // 近接は隣接、遠隔は射線が通る敵。攻撃できる相手の集合はどちらか一方だけが埋まる。
  // 命中判定は撃つ瞬間にダイスを引くので、ここではroll:20で「届くか」だけを見る。
  const attackTargets = !playerTurn ? []
    : active.ranged
      ? state.units.filter(u => u.side === "enemy" && u.hp > 0
          && resolveRanged({ attacker: active, target: u, units: state.units, grid: state.grid, roll: () => 20 }).ok)
      : state.units.filter(u => u.side === "enemy" && u.hp > 0 && isAdjacent(active, u));
  // 手番の味方の向きが変わるたび、その向きを画面奥にするよう追従する。
  // 以前はheroの向きだけを見ていた。リディアも操作するようになったので、
  // 彼女の手番では彼女の視点(彼女が正対している敵を画面奥に置く構図)へ切り替える。
  const activeParty = active?.side === "party" ? active : null;
  const activeFacing = activeParty?.facing;
  useEffect(() => { if (activeFacing !== undefined) setAzimuth(azimuthForFacing(activeFacing)); }, [activeFacing]);

  const activeReach = playerTurn && !moved ? reachableCells(state.grid, active, movePointsFor(active.agility), occupiedBy(state.units, active.id), active) : [];
  // 待機で手番を終える駒は、一番近い敵の方を向いて終わる。
  // 何もしないと移動してきた向きのまま突っ立って、敵に背を向けたまま次の手番へ行く。
  // 攻撃で終わる場合は damage() 側が対象へ向き直すので、ここは待機だけの話。
  const faceNearestEnemy = unit => {
    if (!unit) return;
    const foe = nearestAlive(unit, state.units.filter(u => u.side === "enemy"));
    if (!foe) return;
    setState(s => ({ ...s, units: s.units.map(u =>
      u.id === unit.id ? { ...u, facing: facingToward(u, foe, u.facing) } : u) }));
  };
  const scheduleNextTurn = (expectedTurn, delay = EXPEDITION_BATTLE_CONFIG.timing.turnTransitionMs) => {
    clearTimeout(turnTimer.current);
    setBusy(true);
    turnTimer.current = setTimeout(() => {
      setMoved(false); setPartyAction(null);
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
    // 撃つ前に対象へ向き直る。
    // 以前は下の applyResult の中で向きを更新していた。近接は同時なので気づかないが、
    // 遠隔の applyResult は弾の着弾(playRangedのonImpact)まで走らないため、
    // リディアが「撃った方向を向かないまま魔法を放つ」状態になっていた。
    setState(s => ({ ...s, units: s.units.map(u =>
      u.id === attacker.id ? { ...u, facing: facingToward(attacker, target, u.facing) } : u) }));
    // 判定はここで確定させる(見た目の都合で結果を変えない)。近接は即座に演出するが、
    // 遠隔は弾が着弾するまで、ダメージ演出とstate更新を遅らせる(playRangedのonImpactで発火)。
    const applyResult = () => {
      scene.current?.setCombatCamera(attacker, target); setCombatShot(true);
      setTimeout(() => { scene.current?.setCameraFocus(null); setCombatShot(false); }, EXPEDITION_BATTLE_CONFIG.timing.attackCameraMs);
      scene.current?.[result.hit ? "playHit" : "playMiss"](target.x, target.y, { damage: result.damage, unitId: target.id });
      setState(s => ({ ...s, units: s.units.map(u =>
        // 命中した攻撃の的(enemy側)は、直近に自分を攻撃してきた相手をaggroIdに覚える(簡易ヘイト)。
        u.id === target.id ? { ...u, hp: Math.max(0, u.hp - (result.hit ? result.damage : 0)), ...(result.hit && u.side === "enemy" ? { aggroId: attacker.id } : {}) }
        : u
      ), log: [...s.log, ...(ranged ? [`${attacker.name}は魔法を放った。`] : []), result.hit ? `${attacker.name}の攻撃。${result.damage}ダメージ。` : `${attacker.name}の攻撃は外れた。`] }));
    };
    if (ranged) scene.current?.playRanged(attacker.x, attacker.y, target.x, target.y, { onImpact: applyResult });
    else applyResult();
    return true;
  };
  const moveUnit = (unit, to, line) => {
    scene.current?.playMove(unit.x, unit.y, to.x, to.y);
    setState(s => ({ ...s, units: s.units.map(u => u.id === unit.id ? { ...u, ...to, facing: facingToward(unit, to, u.facing) } : u), log: [...s.log, line] }));
  };
  useEffect(() => {
    const grid = state.grid; const s = createBattleScene(mount.current, grid, { voidBoundaryWalls: typeof battleLayout === "object", cameraElevationDeg: EXPEDITION_BATTLE_CONFIG.presentation.cameraElevationDeg, cameraZoom: EXPEDITION_BATTLE_CONFIG.presentation.cameraZoom }); scene.current = s;
    s.setFogEnabled(fogOn); s.setFogIntensity(fogLevel); s.setFogColor(fogColor);
    s.setDustEnabled(dustOn); s.setRainEnabled(rainOn); s.setWallsEnabled(wallsOn);
    s.setBackgroundColor(bgColor); s.setLightPreset(lightPreset);
    s.setObstaclesEnabled(obstaclesOn); s.setWaterEnabled(waterOn); s.setHolesEnabled(holesOn);
    applyLanterns(s, state.units, lanternOn);
    s.setCameraAzimuthDeg(cameraAzimuthDeg);
    s.setCameraElevationDeg(cameraElevationDeg);
    s.setEnemiesVisible(true);
    return () => s.dispose();
  }, []);
  // 演出パネルの設定を、盤面を作り直さず既存シーンへその場で効かせる。
  useEffect(() => { scene.current?.setFogEnabled(fogOn); }, [fogOn]);
  useEffect(() => { scene.current?.setFogIntensity(fogLevel); }, [fogLevel]);
  useEffect(() => { scene.current?.setFogColor(fogColor); }, [fogColor]);
  useEffect(() => { scene.current?.setDustEnabled(dustOn); }, [dustOn]);
  useEffect(() => { scene.current?.setRainEnabled(rainOn); }, [rainOn]);
  useEffect(() => { scene.current?.setWallsEnabled(wallsOn); }, [wallsOn]);
  useEffect(() => { scene.current?.setBackgroundColor(bgColor); }, [bgColor]);
  useEffect(() => { scene.current?.setLightPreset(lightPreset); }, [lightPreset]);
  useEffect(() => { scene.current?.setObstaclesEnabled(obstaclesOn); }, [obstaclesOn]);
  useEffect(() => { scene.current?.setWaterEnabled(waterOn); }, [waterOn]);
  useEffect(() => { scene.current?.setHolesEnabled(holesOn); }, [holesOn]);
  // 手番で新しく生成された駒のカンテラにも効かせるため、units側の変化も見る。
  useEffect(() => { applyLanterns(scene.current, state.units, lanternOn); }, [lanternOn, state.units]);
  useEffect(() => { scene.current?.setCameraZoom(cameraZoom); }, [cameraZoom]);
  // 手番が回ってきた味方は、まず一番近い敵へ正対する。
  // 待機で向き直すのと同じ処理を手番の頭でも行い、「常に敵を見ている」状態にする。
  useEffect(() => { if (playerTurn) faceNearestEnemy(active); }, [active?.id]);
  // リディアの手番は、彼女の視点へ切り替える。注視点を彼女と敵の中間へ寄せ、
  // 上のazimuth追従で彼女の正対方向が画面奥になる。投影は正射影のままなので
  // マスのクリックはそのまま効く(setCameraFocusは寄るだけで方式を変えない)。
  // 攻撃演出中(combatShot)はそちらのカメラを尊重して触らない。
  /* ポケモンアングル ─ 戦闘中の既定のアングル(作者の命名 2026-08-27)。
     手番の駒と、その駒が狙う敵の中間を注視点にし、駒の背中越しに敵を見る構図にする。
     azimuthForFacingが向きを、ここが注視点を決める。2つで1つの構図。

     以前はリディアの手番だけこの構図で、ガレスの手番は盤面の中心を見ていた。
     縦画面(iPhone 16縦・ズーム2.5)では盤面中心のままだと味方2人とも枠外へ出たため、
     味方全員をこの構図に統一した。

     注視点を動かすのはこの1か所だけにする。2か所から触ると、後から走った方が
     相手のtargetを上書きして「寄ったはずが盤面中心に戻る」になる。 */
  const pokemonAngle = () => {
    const s = scene.current; if (!s || !active) return;
    if (active.side === "party") {
      const foe = nearestAlive(active, state.units.filter(u => u.side === "enemy"));
      s.setCameraFocus(active, foe || null);
    } else {
      // 敵の手番は寄りを解除して、その駒を画面の中心に置く。
      s.setCameraFocus(null);
      s.setCameraCenter(active.x, active.y);
    }
  };
  useEffect(() => {
    if (combatShot) return;   // 攻撃演出中はそちらの構図を尊重する
    pokemonAngle();
  }, [active?.id, active?.x, active?.y, combatShot, state.units]);
  // 視点を既定へ戻す。コンパスのタップから呼ぶ。
  // 指示はズーム・見下ろし角・注視点の3つだったが、方位角も戻す。指で回した向きが
  // 残ると盤面が画面の端に寄ったままになり、「戻した」ことにならなかった(実機で確認)。
  // 方位角の既定は「手番の駒が敵と正対する向きを画面奥にする角度」で、手番の頭でも同じ値を使う。
  const resetView = () => {
    const { cameraZoom: z, cameraElevationDeg: e } = EXPEDITION_BATTLE_CONFIG.presentation;
    setCameraZoomState(z);
    setCameraElevationDeg(e);
    scene.current?.setCameraZoom(z);
    scene.current?.setCameraElevationDeg(e);
    if (activeFacing !== undefined) setAzimuth(azimuthForFacing(activeFacing));
    pokemonAngle();
  };
  // 指の操作をカメラへ繋ぐ。activeを見ているのでuseEffectで貼り直す(古いactiveを掴まないため)。
  // 指で動いた値はスライダーの表示にも返す。片方だけが真になると、次にスライダーを
  // 触った瞬間にカメラが飛ぶ。
  useEffect(() => {
    scene.current?.setGestureHandlers({
      // ダブルタップした点をカメラの注視点にする(作者の指示 2026-08-27)。
      // その場所が画面の中心へ来る。ズームと見下ろし角はそのまま残す。
      // せっかく指で合わせた寄りが戻ると困るため。
      onDoubleTap: ({ clientX, clientY }) => { scene.current?.lookAtScreenPoint(clientX, clientY); },
      onCameraChange: ({ azimuthDeg, elevationDeg, zoom }) => {
        // sceneへ返さない。指の操作でsceneは既に動いているので、ここで戻すと二重に効く。
        setCameraAzimuthDegState(azimuthDeg);
        setCameraElevationDeg(elevationDeg);
        setCameraZoomState(zoom);
      },
    });
  }, [active?.id, active?.x, active?.y, state.units]);
  useEffect(() => {
    const s = scene.current; if (!s) return;
    const targets = partyAction === "attack" ? attackTargets : [];
    const highlights = partyAction === "move" ? activeReach.map(p => ({ ...p, kind: "reach" })) : targets.map(t => ({ x: t.x, y: t.y, kind: "target" }));
    s.sync({ units: state.units, activeId: active?.id, targetIds: targets.map(t => t.id), highlights });
    s.setPickHandler(data => {
      if (!playerTurn) return;
      const t = state.units.find(u => u.id === data.id);
      if (t && partyAction === "attack" && targets.some(x => x.id === t.id) && !busy) { setPartyAction(null); damage(active, t, !!active.ranged); scheduleNextTurn(state.turn, EXPEDITION_BATTLE_CONFIG.timing.attackSettleMs); }
      else if (data.kind === "cell" && partyAction === "move" && !moved && activeReach.some(p => p.x === data.x && p.y === data.y)) { moveUnit(active, data, "あなたは移動した。"); setMoved(true); setPartyAction(null); }
    }, { preferCells: partyAction === "move" });
  }, [state, active?.id, playerTurn, moved, partyAction, busy]);
  useEffect(() => {
    if (!partyAlive || !enemyAlive) { onFinish(enemyAlive ? "defeat" : "victory", Object.fromEntries(state.units.filter(u => u.side === "party").map(u => [u.id, u.hp]))); return; }
    if (!active || active.side === "party") return;   // 味方は全員プレイヤーが操作する
    const expectedTurn = state.turn;
    setBusy(true);
    const t = setTimeout(() => {
      const act = chooseEnemyAction(state.grid, active, state.units, { fleeHpRatio: active.fleeHpRatio });
      if (act.type === "attack") { const t = state.units.find(u => u.id === act.targetId); if (t) damage(active, t); }
      if (act.type === "move") moveUnit(active, act.to, act.intent === "flee" ? `${active.name}は傷を負い、後退した。` : `${active.name}は${state.units.find(u => u.id === act.targetId)?.name || "あなた"}へ接近した。`);
      if (act.type === "wait") setState(s => ({ ...s, log: [...s.log, `${active.name}は進路を探している。`] }));
      scheduleNextTurn(expectedTurn, act.type === "move" ? EXPEDITION_BATTLE_CONFIG.timing.moveSettleMs : EXPEDITION_BATTLE_CONFIG.timing.attackSettleMs);
    }, EXPEDITION_BATTLE_CONFIG.timing.aiThinkMs); return () => clearTimeout(t);
  }, [active?.id, state.turn, partyAlive, enemyAlive]);
  const obstacleCount = state.grid.cells.filter(cell => cell.obstacle).length;
  // 手番中に何を求められているかを1文で示す。上ほど限定的な状況で、先に一致した方を採る。
  const actionStatus = (() => {
    if (!playerTurn) return "";
    const who = active.name;
    const verb = active.ranged ? "魔法" : "攻撃";
    const noTarget = active.ranged ? "射線の通る敵がいない" : "隣接する敵がいない";
    if (busy) return "行動を処理中です。";
    if (partyAction === "move") return `${who}の移動先を選択中：青いマスを1つ選びます。`;
    if (partyAction === "attack") return `${who}の${verb}対象を選択中：赤い敵を選びます。`;
    if (moved) return attackTargets.length ? `${who}は移動済み：${verb}できます。` : `${who}は移動済み：${noTarget}ため${verb}できません。`;
    return attackTargets.length ? `${who}の行動を選んでください：移動または${verb}。`
      : `${who}の行動を選んでください：${noTarget}ため、移動または待機。`;
  })();
  const layoutLabel = battleLayout === "guardian" ? "arena-8x8"
    : typeof battleLayout === "object" ? `${battleLayout.kind}-${battleLayout.width}x${battleLayout.height}` : "corridor-3x7";
  // data-* はスモークテストが盤面と手番を外から読むための足がかり。表示には使わない。
  return <div style={S.page}
    data-battle-layout={layoutLabel}
    data-obstacle-count={obstacleCount}
    data-active-unit={active?.id || ""}
    data-hero-action={playerTurn ? (partyAction || (moved ? "moved" : "choose")) : ""}
    data-attack-targets={attackTargets.length}
    data-reach-cells={JSON.stringify(activeReach.map(({ x, y }) => ({ x, y })))}>
    <div style={S.stage}>
      <div ref={mount} style={S.canvas} data-camera={combatShot ? "combat" : "iso"} data-view-direction={viewDirection} data-camera-azimuth-deg={cameraAzimuthDeg} data-camera-elevation-deg={cameraElevationDeg} data-camera-zoom={cameraZoom}/>
      {/* 方位と拡大率。指で自由に回せるようにした結果、いま自分がどちらを向いて
          どれだけ寄っているかが分からなくなったので、まず状態として出す。
          タップすると既定(ズーム2.5 / 高さ20度 / 手番の駒)へ戻る(作者の指示 2026-08-27)。
          状態表示に操作を足す形になるが、地図アプリのコンパスと同じ慣習なので、
          「いまの向き」と「向きを戻す」は同じ場所にあってよいと判断した。 */}
      <button type="button" style={S.compass} data-compass-azimuth-deg={Math.round(cameraAzimuthDeg)}
        aria-label="視点を既定に戻す" onClick={resetView}>
        <svg width="58" height="58" viewBox="-29 -29 58 58" aria-hidden="true">
          <circle r="26" fill="rgba(10,14,22,.70)" stroke="#4a5366" strokeWidth="1"/>
          {COMPASS_POINTS.map(([label, deg]) => {
            // 画面の上に来るワールド方向はカメラの視線そのもの。北(=y減少)が画面上で
            // なす角は 90度 - 方位角。各記号はそこから時計回りにdegだけずらす。
            const a = (90 - cameraAzimuthDeg + deg) * Math.PI / 180;
            // dominantBaseline=centralで文字の中心を半径上に置く。ベースラインを
            // 手で足すと、円の下側の記号だけ縁からはみ出す。
            return <text key={label} x={Math.sin(a) * 16} y={-Math.cos(a) * 16}
              textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight={deg === 0 ? 700 : 400}
              fill={deg === 0 ? "#e8b45c" : "#8f98ac"}>{label}</text>;
          })}
        </svg>
        <div style={S.zoomLabel}>×{cameraZoom.toFixed(2)}</div>
      </button>
    </div>
    <div style={S.hud}>
      <b>{!partyAlive ? "敗北" : !enemyAlive ? "勝利" : `${active?.name}の手番`}</b>
      <div style={S.row}>{state.units.map(u => <span key={u.id} style={S.chip}>{u.name} {u.hp}/{u.maxHp}</span>)}</div>
      <div style={S.row}>
        <button style={S.btn} onClick={() => setAzimuth(cameraAzimuthDeg + 90)}>視点を回す</button>
        {playerTurn && <button disabled={busy || moved} style={{ ...S.btn, ...(partyAction === "move" ? S.active : {}) }}
          onClick={() => { setPartyAction("move"); setState(s => ({ ...s, log: [...s.log, "移動先の青いマスを選ぶ。"] })); }}>移動</button>}
        {playerTurn && <button disabled={busy || !attackTargets.length} style={{ ...S.btn, ...(partyAction === "attack" ? S.active : {}) }}
          onClick={() => { setPartyAction("attack"); setState(s => ({ ...s, log: [...s.log, active.ranged ? "射線の通る敵を選んで魔法を放つ。" : "隣接する敵を選んで攻撃する。"] })); }}>{active.ranged ? "魔法" : "攻撃"}</button>}
        {playerTurn && <button disabled={busy} style={S.btn}
          onClick={() => { setPartyAction(null); faceNearestEnemy(active); scheduleNextTurn(state.turn, 0); }}>待機</button>}
        {playerTurn && active.id === "hero" && <button disabled={!tonics || busy} style={S.btn}
          onClick={() => { if (onUseTonic?.()) setState(s => ({ ...s, units: s.units.map(u => u.id === "hero" ? { ...u, hp: Math.min(u.maxHp, u.hp + ITEMS.tonic.power) } : u), log: [...s.log, "回復薬を使った。"] })); }}>回復薬 ({tonics})</button>}
        {busy && <span>行動中…</span>}
      </div>
      <div style={S.hint}>{actionStatus || "攻撃時は対面カメラになります。"}</div>
      {/* 離脱は「この手番の行動」ではないので、行動ボタンとは別の行に置く(one-place-one-function)。
          倒した扱いにはせず、入口まで退くだけ。戻ればまた戦える。 */}
      {partyAlive && enemyAlive && <div style={S.row}>
        <button style={S.escape} disabled={busy}
          onClick={() => onFinish("escape", Object.fromEntries(state.units.filter(u => u.side === "party").map(u => [u.id, u.hp])))}>
          入口へ戻る
        </button>
        <span style={S.hint}>戦わずに退く。敵はその場に残る。</span>
      </div>}
      <div style={S.log}>{state.log.slice(-4).map((x, i) => <div key={i}>{x}</div>)}</div>
      {/* 調整はプレイヤー向けの操作ではないので、既定で畳んでおく(game-debug-tools)。
          盤面の面積を食わないことが目的なので、中身は触らずdetailsで包むだけにする。 */}
      <details style={S.tuner}>
        <summary style={S.tunerSummary}>調整（開発用）</summary>
      {/* 実機で「1本指のつもりが2本触れている」かを見分けるための表示。
          view3d が touchイベントの e.touches.length をそのまま入れている。 */}
      <div style={S.row}>
        <span>いま触れている指:</span>
        <b style={{ fontVariantNumeric: "tabular-nums" }}>{fingers}</b>
        <span style={S.hint}>本（2以上なら、意図しない接触でカメラが動きます）</span>
      </div>
      <div style={S.row}>
        <span>カメラの高さ:</span>
        <input type="range" min="10" max="80" step="1" value={cameraElevationDeg}
          onChange={e => setElevation(Number(e.target.value))}/>
        <span>{cameraElevationDeg}度</span>
      </div>
      <div style={S.row}>
        <span>カメラの向き:</span>
        <input type="range" min="0" max="359" step="1" value={cameraAzimuthDeg} onChange={e => setAzimuth(Number(e.target.value))}/>
        <span>{cameraAzimuthDeg}度</span>
      </div>
      <div style={S.row}>
        <span>カメラのズーム:</span>
        <input type="range" min={ZOOM_MIN} max={ZOOM_MAX} step="0.05" value={cameraZoom} onChange={e => setZoom(Number(e.target.value))}/>
        <span>×{cameraZoom.toFixed(2)}</span>
      </div>
      {/* いま見えている角度を、そのまま battleConfig.js へ書き写せる形で出す。
          スライダーで決めた値が既定値に反映されないと、次回また探し直しになる。 */}
      <div style={S.row}>
        <span>この値を残すには:</span>
        <code style={{ fontSize: 11, opacity: 0.8 }}>
          presentation: {"{"} cameraElevationDeg: {cameraElevationDeg}, cameraZoom: {cameraZoom.toFixed(2)} {"}"}
          {"  /  方位角 "}{cameraAzimuthDeg.toFixed(0)}{"度(45度の倍数から"}
          {Math.min(cameraAzimuthDeg % 45, 45 - cameraAzimuthDeg % 45).toFixed(0)}{"度ずれ)"}
        </code>
      </div>
      {/* 演出の見た目調整(検証用)。盤面のルールには影響しない */}
      <div style={S.row}>
        <label style={S.toggle}>
          <input type="checkbox" checked={fogOn} onChange={e => setFogOn(e.target.checked)} />
          霧
        </label>
        <input type="range" min={0} max={1} step={0.05} value={fogLevel} disabled={!fogOn}
          onChange={e => setFogLevel(Number(e.target.value))} style={{ width: 90 }}/>
        <input type="color" value={fogColor} disabled={!fogOn}
          onChange={e => setFogColor(e.target.value)} style={{ width: 28, height: 20, padding: 0, border: "none", background: "none" }}/>
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
          <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} style={{ width: 28, height: 20, padding: 0, border: "none", background: "none" }}/>
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
        <label style={S.toggle}>
          <input type="checkbox" checked={lanternOn} onChange={e => setLanternOn(e.target.checked)} />
          カンテラ
        </label>
      </div>
      </details>
    </div>
  </div>;
}
// 画面の見た目。1トークン1行にして、色や余白を1つ変えた時にdiffがその1行だけになるようにする。
const S = {
  page: { position: "fixed", inset: 0, background: "#161a22", color: "#e6e8ee", font: "13px/1.6 system-ui", display: "flex", flexDirection: "column" },
  // 3Dは画面の6.5割で固定する。flex:1にするとログの行数で盤面の高さが変わり、
  // 同じ局面でも見え方が毎回ずれる(作者の指示 2026-08-27)。
  // 6割→7割→6.5割と実機で見比べて決めた。7割は盤面が大きくなるのではなく下の余白が
  // 増えるだけだった(盤面の大きさはcanvasの幅とズームで決まり、高さは効かない)。
  stage: { height: "65%", flex: "none", minHeight: 0, position: "relative", overflow: "hidden" },
  canvas: { position: "absolute", inset: 0, touchAction: "none" },
  // 方位と拡大率。safe-areaぶんだけ内側へ寄せる(Dynamic Islandの下に潜らせない)。
  // タップできるので pointerEvents は生かす。58pxの円は推奨44ptを満たす。
  compass: { position: "absolute", top: "calc(8px + env(safe-area-inset-top))", right: "calc(8px + env(safe-area-inset-right))", textAlign: "center", userSelect: "none", background: "none", border: 0, padding: 0, cursor: "pointer", WebkitTapHighlightColor: "transparent", touchAction: "manipulation" },
  zoomLabel: { marginTop: 2, color: "#c3ccdd", fontSize: 12, fontVariantNumeric: "tabular-nums", textShadow: "0 1px 3px rgba(0,0,0,.85)" },
  // 残り4割がUI。中身が増えた分はUIの中だけでスクロールさせ、盤面は削らない。
  hud: { height: "35%", padding: "10px 14px calc(10px + env(safe-area-inset-bottom))", background: "rgba(20,24,32,.94)", borderTop: "1px solid #2b303c", overflowY: "auto" },
  row: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 6 },
  chip: { border: "1px solid #59647a", borderRadius: 999, padding: "1px 8px" },
  btn: { background: "#2b303c", color: "#e6e8ee", border: "1px solid #3c4354", borderRadius: 6, padding: "5px 11px" },
  escape: { background: "#3a2c2c", color: "#e3c9c9", border: "1px solid #6b4a4a", borderRadius: 6, padding: "6px 12px", fontSize: 13 },
  active: { background: "#3d7fb5" },
  hint: { color: "#9ca8bd", marginTop: 5 },
  log: { marginTop: 5, color: "#d8c98c" },
  toggle: { display: "flex", alignItems: "center", gap: 4, color: "#8b93a7", fontSize: 12, cursor: "pointer" },
  tuner: { marginTop: 6, borderTop: "1px solid #2b303c", paddingTop: 6 },
  tunerSummary: { color: "#6f7a90", fontSize: 12, cursor: "pointer", padding: "6px 0" },
  select: { background: "#2b303c", color: "#e6e8ee", border: "1px solid #3c4354", borderRadius: 4, font: "inherit" },
};
