
/* 種別ごとの目次を各登録画面の先頭へ置き、一覧から詳細入力へ移動できるようにする。 */
function insertSectionIndex(html,indexHtml){
  const marker="</p>";
  const at=html.indexOf(marker);
  return at<0?indexHtml+html:html.slice(0,at+marker.length)+indexHtml+html.slice(at+marker.length);
}
function sectionIndex(title,rows,emptyMessage){
  return `<div class="section-index"><div class="section-index-head"><h3>${escapeHtml(title)}</h3><span class="chip meta-chip">${rows.length}件</span></div><p class="hint">一覧から対象を選ぶと、下の詳細入力へ移動します。</p><div class="section-index-list">${rows.length?rows.map(row=>`<button class="section-index-row" data-section-focus="${escapeHtml(row.focus||row.id||"")}"><span class="index-main"><span class="index-name">${escapeHtml(row.name)}</span><span class="index-meta">${escapeHtml(row.meta||"")}</span></span><span class="sub index-jump">詳細へ</span></button>`).join(""):`<div class="section-index-empty">${escapeHtml(emptyMessage)}</div>`}</div></div>`;
}
function focusSection(selector,status){
  const target=document.querySelector(selector);
  if(!target){setStatus("詳細入力欄が見つかりません");return}
  target.scrollIntoView({behavior:"smooth",block:"center"});
  setStatus(status||"詳細入力欄を表示しました");
}
function castSectionRows(){
  const rows=[{id:"gm",name:castName("gm","GM"),meta:"GM・固定"},{id:"gareth",name:castName("gareth","ガレス"),meta:"メンバー・固定"}];
  for(let i=0;i<extraCompanions;i++){const id=`member_${i+2}`;rows.push({id,name:castName(id,`メンバー${i+2}`),meta:"メンバー"})}
  npcList().forEach(x=>rows.push({id:x.id,name:castName(x.id,x.name),meta:"NPC"}));
  return rows;
}
function monsterSectionRows(){return monsters.map((x,i)=>({id:String(i),name:x.name||`モンスター${i+1}`,meta:`HP ${Number(x.hp)||10}`}))}
function itemSectionRows(){return items.map((x,i)=>({id:String(i),name:x.name||`アイテム${i+1}`,meta:x.notes?"説明あり":"未設定"}))}
function discoverySectionRows(){
  const s=scene();
  return (s.discoveries||[]).map((raw,i)=>{const x=normalizeDiscoveryFor(s,raw,i);return {id:String(i),name:x.label||`発見項目${i+1}`,meta:`${categoryLabel(x.category)}・${importanceLabel(x.importance)}`}});
}
var baseRenderWorldForSplitLedger=renderWorld;
renderWorld=function(){
  const html=baseRenderWorldForSplitLedger();
  const start=html.indexOf('<div class="card"><h3>エンティティ台帳（現在の登録名）</h3>');
  if(start<0)return html;
  const end=html.indexOf('<div class="card"><h3>登場人物</h3>',start);
  return end<0?html.slice(0,start):html.slice(0,start)+html.slice(end);
};
var baseRenderCastForSplitLedger=renderCast;
renderCast=function(){return insertSectionIndex(baseRenderCastForSplitLedger(),sectionIndex("キャスト一覧",castSectionRows(),"キャストがありません。"))};
var baseBindCastForSplitLedger=bindCast;
bindCast=function(){
  baseBindCastForSplitLedger();
  document.querySelectorAll('[data-section-focus]').forEach(button=>button.onclick=()=>focusSection(`[data-cast-card="${button.dataset.sectionFocus}"]`,`${button.querySelector(".index-name")?.textContent||"キャスト"}の詳細入力へ移動しました`));
};
var baseRenderMonstersForSplitLedger=renderMonsters;
renderMonsters=function(){return insertSectionIndex(baseRenderMonstersForSplitLedger(),sectionIndex("モンスター一覧",monsterSectionRows(),"モンスターがありません。"))};
var baseBindMonstersForSplitLedger=bindMonsters;
bindMonsters=function(){
  baseBindMonstersForSplitLedger();
  document.querySelectorAll('[data-section-focus]').forEach(button=>button.onclick=()=>{const i=Number(button.dataset.sectionFocus);focusSection(`.monster-name[data-monster-index="${i}"]`,`${monsters[i]?.name||`モンスター${i+1}`}の詳細入力へ移動しました`)});
};
var baseRenderItemsForSplitLedger=renderItems;
renderItems=function(){return insertSectionIndex(baseRenderItemsForSplitLedger(),sectionIndex("アイテム一覧",itemSectionRows(),"アイテムがありません。"))};
var baseBindItemsForSplitLedger=bindItems;
bindItems=function(){
  baseBindItemsForSplitLedger();
  document.querySelectorAll('[data-section-focus]').forEach(button=>button.onclick=()=>{const i=Number(button.dataset.sectionFocus);focusSection(`.item-name[data-item-index="${i}"]`,`${items[i]?.name||`アイテム${i+1}`}の詳細入力へ移動しました`)});
};
var baseRenderStateForSplitLedger=renderState;
renderState=function(){return insertSectionIndex(baseRenderStateForSplitLedger(),sectionIndex("シーン要素一覧",discoverySectionRows(),"シーン要素がありません。"))};
var baseBindStateForSplitLedger=bindState;
bindState=function(){
  baseBindStateForSplitLedger();
  document.querySelectorAll('[data-section-focus]').forEach(button=>button.onclick=()=>{const i=Number(button.dataset.sectionFocus);focusSection(`.state-discovery[data-discovery-index="${i}"]`,`${discoverySectionRows()[i]?.name||"シーン要素"}の詳細入力へ移動しました`)});
};
var baseRenderScenesForSplitLedger=renderScenes;
renderScenes=function(){
  if(activeTab==="entities")activeTab="world";
  baseRenderScenesForSplitLedger();
};
