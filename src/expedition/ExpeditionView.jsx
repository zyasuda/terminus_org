import React, { useEffect, useState } from "react";
import ExpeditionBattle from "./ExpeditionBattle.jsx";
import RogueMap from "./RogueMap.jsx";
import { ITEMS, canOpenChest, createFloor, equipFromStash, equipInField, eventAt, isEntrance, keepAfterDefeat, newVillage, partyMaxHp, rerouteFloorCorridors, rewardFor, useFieldTonic, walk } from "./core.js";

const SAVE = "ai_companion_expedition_b1";
// 開発中の検証専用。プレイヤー向け機能ではない(game-debug-tools)。
// URLに?debugが付いている時だけ、戦闘を即座に勝利扱いでスキップするボタンを出す。
// 遠征コアのロジックには一切手を入れず、UI層に1つボタンを足すだけにする。
const DEBUG = new URLSearchParams(window.location.search).has("debug");
// ?battle=1 で戦闘画面へ直行する。実機で画面レイアウトを見るたびに
// 村→遠征→通路の踏破をやり直さずに済ませるための入口(game-debug-tools)。
// ?battle=corridor / junction / guardian で戦う場面も選べる。
const BATTLE_NOW = new URLSearchParams(window.location.search).get("battle");
// ?seed=1234 で盤面を固定する。見た目の案を並べて比べる時に、障害物の位置が
// 毎回変わると比較にならないため(game-debug-tools)。
const FIXED_SEED = new URLSearchParams(window.location.search).get("seed");
const migrateFloor = floor => {
  if (!floor) return null;
  const fresh = createFloor(floor.seed || Date.now());
  const sameMap = floor.mapVersion === fresh.mapVersion;
  return { ...fresh, ...floor, mapVersion: fresh.mapVersion, pos: sameMap ? floor.pos || fresh.pos : fresh.pos, at: sameMap ? floor.at ?? fresh.at : fresh.at,
    visited: sameMap ? floor.visited || fresh.visited : fresh.visited, walked: sameMap ? floor.walked || fresh.walked : fresh.walked, seen: sameMap ? floor.seen || fresh.seen : fresh.seen,
    events: fresh.events.map(event => ({ ...event, done: floor.events?.find(old => old.id === event.id)?.done || false })),
    chest: { ...fresh.chest, opened: floor.chest?.opened || false },
  };
};
const load = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE) || "{}");
    return {
      village: newVillage(saved.village || saved),
      floor: migrateFloor(saved.floor),
      haul: saved.haul || [],
      message: saved.message || "村で遠征準備をする。",
      battleId: saved.battleId || null,
    };
  } catch {
    // ponytail: 壊れたセーブは黙って村からやり直す。直後のuseEffectが同じキーを上書きするので、
    // 中断していた遠征は復旧できない。惜しくなったら、捨てる前に作者へ知らせる導線を足す。
    return { village: newVillage(), floor: null, haul: [], message: "村で遠征準備をする。", battleId: null };
  }
};
export default function ExpeditionView() {
  const saved = useState(load)[0];
  const [village, setVillage] = useState(saved.village), [floor, setFloor] = useState(saved.floor), [battle, setBattle] = useState(() => saved.floor?.events.find(e => e.id === saved.battleId) || null), [haul, setHaul] = useState(saved.haul), [message, setMessage] = useState(saved.message);
  useEffect(() => { localStorage.setItem(SAVE, JSON.stringify({ village, floor, haul, message, battleId: battle?.id || null })); }, [village, floor, haul, message, battle]);
  const start = () => { setFloor(createFloor(Date.now() >>> 0)); setHaul([]); setMessage("リディア「宝箱があるなら、寄り道も悪くないですね。」"); };
  const move = direction => setFloor(f => { const next = walk(f, direction); const e = eventAt(next); if (e) setBattle(e); return next; });
  useEffect(() => {
    if (!BATTLE_NOW || battle) return;
    const f = floor || createFloor(FIXED_SEED ? Number(FIXED_SEED) >>> 0 : Date.now() >>> 0);
    const e = f.events.find(x => x.kind === BATTLE_NOW) || f.events[0];
    if (!floor) setFloor(f);
    setBattle(e);
  }, []);
  useEffect(() => {
    if (!floor || battle) return;
    const dirs = { ArrowUp: "north", ArrowDown: "south", ArrowLeft: "west", ArrowRight: "east" };
    const onKey = e => { const d = dirs[e.key]; if (d) { e.preventDefault(); move(d); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [floor, battle]);
  const finishBattle = (result, party) => {
    if (result === "defeat") { const kept = keepAfterDefeat(haul, floor.seed); setVillage(v => ({ ...v, stash: [...v.stash, ...kept] })); setFloor(null); setBattle(null); setHaul([]); setMessage(`全滅。リディアが ${kept.length} 個を持ち帰った。`); return; }
    // 守護者を倒した時だけ、部屋とドアの位置は変えずに通路の曲がり方を引き直し、
    // 通路の記憶(seen/walked)も消す。「中ボスを倒して村に戻る際に通路が変化している」
    // 「通路をロストした感じ」という要望への対応。部屋の記憶(visited)は消さない。
    setFloor(f => ({ ...f, party, events: f.events.map(e => e.id === battle.id ? { ...e, done: true } : e),
      ...(battle.kind === "guardian" ? rerouteFloorCorridors(f) : {}) }));
    setMessage(battle.kind === "guardian" ? "リディア「守護者を倒しました。宝箱を開けましょう。」" : "リディア「道が開けました。」"); setBattle(null);
  };
  const openChest = () => { const item = rewardFor(floor); setHaul(h => [...h, item]); setFloor(f => ({ ...f, chest: { ...f.chest, opened: true } })); setMessage(`宝箱から「${ITEMS[item].name}」を入手。入口まで持ち帰れます。`); };
  const returnVillage = () => { setVillage(v => ({ ...v, stash: [...v.stash, ...haul], gold: v.gold + 8 })); setFloor(null); setHaul([]); setMessage("無事に村へ帰還。8Gと戦利品をスタッシュへ預けた。"); };
  const buy = id => { const cost = ITEMS[id].price; if (village.gold < cost) return setMessage("金貨が足りない。"); setVillage(v => ({ ...v, gold: v.gold - cost, stash: [...v.stash, id] })); };
  const sell = (id, index) => setVillage(v => ({ ...v, gold: v.gold + Math.ceil(ITEMS[id].price / 2), stash: v.stash.filter((_, i) => i !== index) }));
  const [owner, setOwner] = useState("hero");
  const equip = (id, index) => { if (ITEMS[id]?.slot !== "consumable") setVillage(v => equipFromStash(v, owner, index)); };
  const useTonic = () => { const i = village.stash.indexOf("tonic"); if (i < 0) return false; setVillage(v => ({ ...v, stash: v.stash.filter((_, n) => n !== i) })); return true; };
  if (battle) return <>
    <ExpeditionBattle guardian={battle.kind === "guardian"} layout={battle.kind === "junction" ? "junction" : "corridor"} equipment={village.equipment} party={floor.party} seed={(floor.seed + [...battle.id].reduce((n, char) => n + char.charCodeAt(0), 0)) >>> 0} tonics={village.stash.filter(i => i === "tonic").length} onUseTonic={useTonic} onFinish={finishBattle}/>
    {DEBUG && <button style={S.debugSkip} onClick={() => finishBattle("victory", floor.party)}>[debug] 戦闘スキップ</button>}
  </>;
  if (!floor) return <div style={S.page}>
    <h1>燈火の村</h1>
    <p style={S.message}>{message}</p>
    <p>所持金 {village.gold}G / スタッシュ {village.stash.length}個</p>
    <button style={S.primary} onClick={start}>地下1階へ遠征</button>
    <section style={S.box}>
      <b>装備</b>
      {[["hero", "あなた"], ["mage", "リディア"]].map(([id, name]) => <div key={id}>
        <b>{name}</b>
        {["weapon", "armor", "charm"].map(s =>
          <span key={s} style={S.tag}>{s}: {village.equipment[id][s] ? ITEMS[village.equipment[id][s]].name : "なし"}</span>)}
      </div>)}
    </section>
    <section style={S.box}>
      <b>スタッシュ（装備先を選んでから装備）</b>
      <div>
        <button style={{ ...S.btn, ...(owner === "hero" ? S.selected : {}) }} onClick={() => setOwner("hero")}>あなたへ</button>
        <button style={{ ...S.btn, ...(owner === "mage" ? S.selected : {}) }} onClick={() => setOwner("mage")}>リディアへ</button>
      </div>
      {village.stash.length === 0 ? <p>空です。</p> : village.stash.map((id, i) => <div key={i} style={S.item}>
        {ITEMS[id].name}{" "}
        <button style={S.btn} onClick={() => equip(id, i)}>装備</button>
        <button style={S.btn} onClick={() => sell(id, i)}>売る +{Math.ceil(ITEMS[id].price / 2)}G</button>
      </div>)}
    </section>
    <section style={S.box}>
      <b>固定ショップ</b>
      <div>{["tonic", "sword", "mail", "charm"].map(id =>
        <button key={id} style={S.btn} onClick={() => buy(id)}>{ITEMS[id].name} {ITEMS[id].price}G</button>)}</div>
    </section>
  </div>;
  const e = eventAt(floor); const chest = canOpenChest(floor);
  const useFieldItem = target => {
    const result = useFieldTonic(village, floor, target);
    if (!result) return setMessage("回復薬がない。");
    setVillage(result.village); setFloor(result.floor);
    const name = target === "hero" ? "あなた" : "リディア";
    setMessage(`${name}は回復薬を使った。HP ${result.before} → ${result.hp}/${result.maxHp}。`);
  };
  const equipInMap = (id, index) => {
    if (ITEMS[id]?.slot === "consumable") return;
    const result = equipInField(village, floor, owner, index);
    setVillage(result.village); setFloor(result.floor);
  };
  const equipmentItems = village.stash.map((id, index) => ({ id, index })).filter(({ id }) => ITEMS[id]?.slot !== "consumable");
  return <div style={S.page}>
    <header style={S.header}>
      <b>地下1階 / seed {floor.seed}</b>
      <span>戦利品: {haul.map(i => ITEMS[i].name).join("、") || "なし"}</span>
      <button style={S.btn} disabled={!isEntrance(floor)} onClick={returnVillage}>入口から帰還</button>
    </header>
    <p style={S.message}>{message}</p>
    <div style={S.layout}>
      <RogueMap floor={floor} onMove={move}/>
      <aside style={S.side}>
        <section style={S.field}>
          <b>携行品・装備</b>
          <div>{[["hero", "あなた"], ["mage", "リディア"]].map(([id, name]) => <div key={id}>
            {name} HP {floor.party[id]}/{partyMaxHp(id, village.equipment)}{" "}
            <button style={S.btn} disabled={!village.stash.includes("tonic")} onClick={() => useFieldItem(id)}>回復薬 ({village.stash.filter(item => item === "tonic").length})</button>
          </div>)}</div>
          <div>
            <button style={{ ...S.btn, ...(owner === "hero" ? S.selected : {}) }} onClick={() => setOwner("hero")}>あなたへ装備</button>
            <button style={{ ...S.btn, ...(owner === "mage" ? S.selected : {}) }} onClick={() => setOwner("mage")}>リディアへ装備</button>
          </div>
          {equipmentItems.length
            ? equipmentItems.map(({ id, index }) => <div key={index} style={S.item}>
              {ITEMS[id].name}{" "}
              <button style={S.btn} onClick={() => equipInMap(id, index)}>装備</button>
            </div>)
            : <div style={S.muted}>変更できる装備はありません。</div>}
        </section>
        <p>矢印キーまたは地図下のボタンで移動します。通路は次の部屋まで自動で通過します。三叉路では止まります。</p>
        {e && <button style={S.primary} onClick={() => setBattle(e)}>戦闘を開始</button>}
        {chest && <button style={S.primary} onClick={openChest}>宝箱を開ける</button>}
      </aside>
    </div>
  </div>;
}
// 画面の見た目。1トークン1行にして、色や余白を1つ変えた時にdiffがその1行だけになるようにする。
const S = {
  page: { width: "100vw", height: "100dvh", overflowY: "auto", boxSizing: "border-box", padding: "24px", background: "#161a22", color: "#e6e8ee", font: "14px/1.6 system-ui" },
  header: { display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" },
  message: { color: "#d8c98c", maxWidth: 680 },
  box: { background: "#20242e", border: "1px solid #3c4354", padding: 12, borderRadius: 8, maxWidth: 620, marginTop: 12 },
  field: { background: "#20242e", border: "1px solid #3c4354", padding: 10, borderRadius: 8, marginBottom: 12 },
  tag: { display: "inline-block", margin: "8px 12px 0 0" },
  item: { padding: "5px 0" },
  btn: { margin: "4px", background: "#2b303c", color: "#e6e8ee", border: "1px solid #4a5366", borderRadius: 5, padding: "5px 9px" },
  primary: { margin: "6px 0", background: "#3d7fb5", color: "#fff", border: 0, borderRadius: 6, padding: "8px 12px" },
  layout: { display: "flex", gap: 24, alignItems: "start", flexWrap: "wrap" },
  side: { maxWidth: 260 },
  selected: { background: "#3d7fb5" },
  muted: { opacity: .6, marginTop: 4 },
  // 本番プレイヤーが誤って押さないよう、通常のUIから明確に浮いた見た目にする。
  debugSkip: { position: "fixed", top: 8, right: 8, zIndex: 9999, background: "#a83232", color: "#fff", border: "1px solid #ff8080", borderRadius: 4, padding: "6px 10px", fontSize: 12 },
};
