/* 左ペインは物語の目次だけを描く。古い拡張が共通設定リンクを差し込まない最終描画点。 */
function storyTreeNodes(key){
  ensureStructureChapters();
  const chapter=structureChapters?.[key]||{};
  const node=(value,type,index)=>({...value,...(sceneOverrides[nodeKey({...value,type,index},key)]||{}),type,index});
  return [
    node(chapter.opening||{id:"opening",name:"イントロ"},"opening"),
    ...(chapter.scenes||[]).map((value,index)=>node(value,"scene",index)),
    node(chapter.ending||{id:"ending",name:"アウトロ"},"ending")
  ];
}

renderScenes=function(){
  const list=$("sceneList");
  ensureStructureChapters();
  const chapters=chapterOrder.map((key,index)=>[key,structureChapterLabel(key,index)]);
  let html=`<div class="tree-root ${selectedTarget==="campaign"?"active":""}"><span class="caret" data-toggle-campaign>${collapsedCampaign?"▸":"▾"}</span><button data-select-campaign>${escapeHtml(campaignName)}</button></div><div class="tree-block ${collapsedCampaign?"collapsed":""}"><div class="tree-label">チャプター</div>`;
  chapters.forEach(([key,label])=>{
    const collapsed=Boolean(collapsedChapters[key]);
    const nodes=storyTreeNodes(key);
    html+=`<div class="chapter-heading ${selectedTarget==="chapter"&&key===activeChapter?"active":""}"><span class="caret" data-toggle-chapter="${key}">${collapsed?"▸":"▾"}</span><button data-chapter="${key}">${escapeHtml(label)}</button></div><div class="chapter-children ${collapsed?"collapsed":""}">${nodes.map(node=>`<button class="scene-item ${selectedTarget==="node"&&key===activeChapter&&node.type===selectedNode.type&&node.index===selectedNode.index?"active":""}" data-chapter-node="${key}" data-node-type="${node.type}" data-node-index="${node.type==="scene"?node.index:""}">${node.type==="scene"?`├─ シーン${node.id}`:node.type==="opening"?"├─ イントロ":"└─ アウトロ"}：${escapeHtml(node.name)}</button>`).join("")}</div>`;
  });
  list.innerHTML=html+"</div>";
  list.querySelector("[data-toggle-campaign]").onclick=()=>{collapsedCampaign=!collapsedCampaign;saveWorkspaceDraft(true);renderScenes();renderAll()};
  list.querySelector("[data-select-campaign]").onclick=()=>{selectedTarget="campaign";activeTab="world";renderScenes();renderAll();renderTabs()};
  list.querySelectorAll("[data-toggle-chapter]").forEach(button=>button.onclick=()=>{const key=button.dataset.toggleChapter;collapsedChapters[key]=!collapsedChapters[key];saveWorkspaceDraft(true);renderScenes();renderAll()});
  list.querySelectorAll("[data-chapter]").forEach(button=>button.onclick=()=>{activeChapter=button.dataset.chapter;selectedTarget="chapter";activeTab="chapterOverview";collapsedCampaign=false;collapsedChapters[activeChapter]=false;saveWorkspaceDraft(true);renderScenes();renderAll();renderTabs()});
  list.querySelectorAll("[data-chapter-node]").forEach(button=>button.onclick=()=>{activeChapter=button.dataset.chapterNode;selectedTarget="node";selectedNode={type:button.dataset.nodeType,index:button.dataset.nodeType==="scene"?Number(button.dataset.nodeIndex):undefined};activeTab="structure";collapsedCampaign=false;collapsedChapters[activeChapter]=false;saveWorkspaceDraft(true);renderScenes();renderAll();renderTabs()});
};

var baseRenderTabsForStoryTree=renderTabs;
renderTabs=function(){
  if(activeTab==="entities"||activeTab==="matchWords")activeTab=selectedTarget==="campaign"?"concepts":selectedTarget==="chapter"?"chapterOverview":"structure";
  baseRenderTabsForStoryTree();
  $("layerTabs").querySelector('[data-tab="matchWords"]')?.remove();
};

function renderEntityLedgerForGm(){
  const holder=document.createElement("div");
  holder.innerHTML=renderEntities();
  holder.querySelector("h2")?.remove();
  holder.querySelector("p.hint")?.remove();
  return holder.innerHTML;
}
var baseRenderTabForStoryTree=renderTab;
renderTab=function(){
  baseRenderTabForStoryTree();
  if(activeTab!=="concepts")return;
  const content=$("tabContent");
  content.insertAdjacentHTML("beforeend",`<details class="card entity-gm-settings"><summary>名前・別名の台帳</summary><p class="hint">キャラクター、モンスター、アイテム以外の重要な名前や別名を管理します。</p>${renderEntityLedgerForGm()}</details>`);
  bindEntities();
  document.querySelectorAll("[data-entity-destination-tab]").forEach(button=>button.onclick=()=>{
    if(button.dataset.entityDetailIndex!==undefined){const details=document.querySelector(".entity-details");if(details)details.open=true;document.querySelector(`[data-entity-index="${button.dataset.entityDetailIndex}"]`)?.scrollIntoView({behavior:"smooth",block:"center"});return}
    const tab=button.dataset.entityDestinationTab;
    selectedTarget="campaign";
    activeTab=tab==="entities"?"concepts":tab;
    if(activeTab==="cast")pendingCastFocus=button.dataset.entityDestinationFocus||null;
    renderScenes();renderAll();
  });
};

var baseRenderRightPanelForStoryTree=renderRightPanel;
renderRightPanel=function(){
  baseRenderRightPanelForStoryTree();
  const target=$("rightBody")?.querySelector(".right-section p");
  if(!target)return;
  if(activeTab==="concepts")target.textContent="キャンペーン／GM設定";
  else if(selectedTarget==="chapter")target.textContent=`${chapter().name} / チャプター設定`;
};

/* init() はこのファイルより前に非同期で始まる。contextが届いた後に最終の描画関数で
   一度描き直し、古いクリックハンドラが残らないようにする。 */
(function refreshStoryTreeWhenReady(){
  if(!context){setTimeout(refreshStoryTreeWhenReady,25);return}
  renderScenes();renderAll();
})();
