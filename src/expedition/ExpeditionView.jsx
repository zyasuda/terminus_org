import React, { useEffect, useState } from "react";
import ExpeditionBattle from "./ExpeditionBattle.jsx";
import RogueMap from "./RogueMap.jsx";
import { ITEMS, canOpenChest, createFloor, eventAt, isEntrance, keepAfterDefeat, newVillage, rewardFor, walk } from "./core.js";

const SAVE = "ai_companion_expedition_b1";
const migrateFloor = floor => {
  if (!floor) return null;
  const fresh = createFloor(floor.seed || Date.now());
  return { ...fresh, ...floor, pos: floor.pos || fresh.pos, at: floor.at ?? fresh.at,
    visited: floor.visited || fresh.visited, walked: floor.walked || fresh.walked, seen: floor.seen || fresh.seen,
    events: fresh.events.map(event => ({ ...event, done: floor.events?.find(old => old.id === event.id)?.done || false })),
    chest: { ...fresh.chest, opened: floor.chest?.opened || false },
  };
};
const load = () => { try { const saved = JSON.parse(localStorage.getItem(SAVE) || "{}"); return { village: newVillage(saved.village || saved), floor: migrateFloor(saved.floor), haul: saved.haul || [], command: saved.command || "attack", message: saved.message || "村で遠征準備をする。", battleId: saved.battleId || null }; } catch { return { village: newVillage(), floor: null, haul: [], command: "attack", message: "村で遠征準備をする。", battleId: null }; } };
export default function ExpeditionView() {
  const saved = useState(load)[0];
  const [village, setVillage] = useState(saved.village), [floor, setFloor] = useState(saved.floor), [battle, setBattle] = useState(() => saved.floor?.events.find(e => e.id === saved.battleId) || null), [command, setCommand] = useState(saved.command), [haul, setHaul] = useState(saved.haul), [message, setMessage] = useState(saved.message);
  useEffect(() => { localStorage.setItem(SAVE, JSON.stringify({ village, floor, haul, command, message, battleId: battle?.id || null })); }, [village, floor, haul, command, message, battle]);
  const start = () => { setFloor(createFloor(Date.now() >>> 0)); setHaul([]); setMessage("リディア「宝箱があるなら、寄り道も悪くないですね。」"); };
  const move = direction => setFloor(f => { const next = walk(f, direction); const e = eventAt(next); if (e) setBattle(e); return next; });
  useEffect(() => {
    if (!floor || battle) return;
    const dirs = { ArrowUp: "north", ArrowDown: "south", ArrowLeft: "west", ArrowRight: "east" };
    const onKey = e => { const d = dirs[e.key]; if (d) { e.preventDefault(); move(d); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [floor, battle]);
  const finishBattle = (result, party) => {
    if (result === "defeat") { const kept = keepAfterDefeat(haul, floor.seed); setVillage(v => ({ ...v, stash: [...v.stash, ...kept] })); setFloor(null); setBattle(null); setHaul([]); setMessage(`全滅。リディアが ${kept.length} 個を持ち帰った。`); return; }
    setFloor(f => ({ ...f, party, events: f.events.map(e => e.id === battle.id ? { ...e, done: true } : e) })); setMessage(battle.kind === "guardian" ? "リディア「守護者を倒しました。宝箱を開けましょう。」" : "リディア「道が開けました。」"); setBattle(null);
  };
  const openChest = () => { const item = rewardFor(floor); setHaul(h => [...h, item]); setFloor(f => ({ ...f, chest: { ...f.chest, opened: true } })); setMessage(`宝箱から「${ITEMS[item].name}」を入手。入口まで持ち帰れます。`); };
  const returnVillage = () => { setVillage(v => ({ ...v, stash: [...v.stash, ...haul], gold: v.gold + 8 })); setFloor(null); setHaul([]); setMessage("無事に村へ帰還。8Gと戦利品をスタッシュへ預けた。"); };
  const buy = id => { const cost = ITEMS[id].price; if (village.gold < cost) return setMessage("金貨が足りない。"); setVillage(v => ({ ...v, gold: v.gold - cost, stash: [...v.stash, id] })); };
  const sell = (id, index) => setVillage(v => ({ ...v, gold: v.gold + Math.ceil(ITEMS[id].price / 2), stash: v.stash.filter((_, i) => i !== index) }));
  const [owner, setOwner] = useState("hero");
  const equip = (id, index) => { const item = ITEMS[id]; if (item.slot === "consumable") return; setVillage(v => { const old = v.equipment[owner][item.slot]; return { ...v, stash: [...v.stash.filter((_, i) => i !== index), ...(old ? [old] : [])], equipment: { ...v.equipment, [owner]: { ...v.equipment[owner], [item.slot]: id } } }; }); };
  const useTonic = () => { const i = village.stash.indexOf("tonic"); if (i < 0) return false; setVillage(v => ({ ...v, stash: v.stash.filter((_, n) => n !== i) })); return true; };
  if (battle) return <ExpeditionBattle guardian={battle.kind === "guardian"} order={command} equipment={village.equipment} party={floor.party} tonics={village.stash.filter(i => i === "tonic").length} onUseTonic={useTonic} onFinish={finishBattle}/>;
  if (!floor) return <div style={S.page}><h1>燈火の村</h1><p style={S.message}>{message}</p><p>所持金 {village.gold}G / スタッシュ {village.stash.length}個</p><button style={S.primary} onClick={start}>地下1階へ遠征</button><section style={S.box}><b>装備</b>{[["hero","あなた"],["mage","リディア"]].map(([id,name]) => <div key={id}><b>{name}</b>{["weapon","armor","charm"].map(s => <span key={s} style={S.tag}>{s}: {village.equipment[id][s] ? ITEMS[village.equipment[id][s]].name : "なし"}</span>)}</div>)}</section><section style={S.box}><b>スタッシュ（装備先を選んでから装備）</b><div><button style={{...S.btn,...(owner === "hero" ? S.selected : {})}} onClick={() => setOwner("hero")}>あなたへ</button><button style={{...S.btn,...(owner === "mage" ? S.selected : {})}} onClick={() => setOwner("mage")}>リディアへ</button></div>{village.stash.length === 0 ? <p>空です。</p> : village.stash.map((id,i) => <div key={i} style={S.item}>{ITEMS[id].name} <button style={S.btn} onClick={() => equip(id,i)}>装備</button><button style={S.btn} onClick={() => sell(id,i)}>売る +{Math.ceil(ITEMS[id].price/2)}G</button></div>)}</section><section style={S.box}><b>固定ショップ</b><div>{["tonic","sword","mail","charm"].map(id => <button key={id} style={S.btn} onClick={() => buy(id)}>{ITEMS[id].name} {ITEMS[id].price}G</button>)}</div></section></div>;
  const e = eventAt(floor); const chest = canOpenChest(floor);
  return <div style={S.page}><header style={S.header}><b>地下1階 / seed {floor.seed}</b><span>戦利品: {haul.map(i => ITEMS[i].name).join("、") || "なし"}</span><button style={S.btn} disabled={!isEntrance(floor)} onClick={returnVillage}>入口から帰還</button></header><p style={S.message}>{message}</p><div style={S.layout}><RogueMap floor={floor} onMove={move}/><aside style={S.side}><b>リディアへの指示</b>{[["attack","攻撃"],["guard","護衛"],["retreat","退却"]].map(([id,label]) => <button key={id} style={{...S.btn,...(command===id?S.selected:{})}} onClick={() => setCommand(id)}>{label}</button>)}<p>矢印キーまたは地図下のボタンで移動します。通路は次の部屋まで自動で通過します。</p>{e && <button style={S.primary} onClick={() => setBattle(e)}>戦闘を開始</button>}{chest && <button style={S.primary} onClick={openChest}>宝箱を開ける</button>}</aside></div></div>;
}
const S={page:{minHeight:"100vh",boxSizing:"border-box",padding:"24px",background:"#161a22",color:"#e6e8ee",font:"14px/1.6 system-ui"},header:{display:"flex",gap:16,alignItems:"center",flexWrap:"wrap"},message:{color:"#d8c98c",maxWidth:680},box:{background:"#20242e",border:"1px solid #3c4354",padding:12,borderRadius:8,maxWidth:620,marginTop:12},tag:{display:"inline-block",margin:"8px 12px 0 0"},item:{padding:"5px 0"},btn:{margin:"4px",background:"#2b303c",color:"#e6e8ee",border:"1px solid #4a5366",borderRadius:5,padding:"5px 9px"},primary:{margin:"6px 0",background:"#3d7fb5",color:"#fff",border:0,borderRadius:6,padding:"8px 12px"},layout:{display:"flex",gap:24,alignItems:"start",flexWrap:"wrap"},side:{maxWidth:260},selected:{background:"#3d7fb5"}};
