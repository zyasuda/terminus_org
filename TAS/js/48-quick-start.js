/* 初めての作者向け。詳細編集のデータ構造には触れず、3シーンの下書きを作る。 */
let quickStartOpen=false;
let quickStartStep=1;
let quickStartDraft={name:"",world:"",scenes:[
  {name:"導入",brief:"物語の始まりと、これから向き合う問題を説明する。"},
  {name:"問題",brief:"調べるべき場所や、乗り越える障害を示す。"},
  {name:"解決",brief:"見つけた手がかりをもとに、問題を解決する。"}
]};
function quickStartModal(){
  if(!quickStartOpen)return "";
  const steps=["キャンペーン","シーン","確認"];
  const body=quickStartStep===1?`<div class="field"><label>キャンペーン名</label><input id="quickCampaignName" value="${escapeHtml(quickStartDraft.name)}" placeholder="例：月影の街の冒険"></div><div class="field"><label>キャンペーン概要</label><textarea id="quickCampaignWorld" placeholder="例：夜ごとに月が消える街で、その理由を探す冒険。">${escapeHtml(quickStartDraft.world)}</textarea></div>`:quickStartStep===2?`<p class="hint">各シーンで、最初にプレイヤーへ見せる状況を書きます。</p>${quickStartDraft.scenes.map((scene,index)=>`<div class="quick-start-scene"><h3>シーン${index+1}</h3><div class="field"><label>名前</label><input data-quick-scene-name="${index}" value="${escapeHtml(scene.name)}"></div><div class="field"><label>開始時の説明</label><textarea data-quick-scene-brief="${index}" placeholder="プレイヤーが最初に見聞きすること">${escapeHtml(scene.brief)}</textarea></div></div>`).join("")}`:`<div class="card"><h3>${escapeHtml(quickStartDraft.name||"新しいキャンペーン")}</h3><p>${escapeHtml(quickStartDraft.world||"概要は未入力です")}</p><ol>${quickStartDraft.scenes.map(scene=>`<li>${escapeHtml(scene.name||"名称未入力")}</li>`).join("")}</ol></div><p class="hint">作成後は、詳細編集でキャラクター、画像、分岐、敵などを必要な分だけ追加できます。</p>`;
  return `<div class="quick-start-modal" role="dialog" aria-modal="true" aria-label="簡単作成"><div class="quick-start-dialog"><div class="quick-start-head"><div><h2>簡単作成</h2><p class="hint">まずはキャンペーンと3つのシーンだけ作ります。</p></div><button class="ghost" id="btnQuickStartClose">閉じる</button></div><div class="quick-start-steps">${steps.map((step,index)=>`<span class="quick-start-step ${quickStartStep===index+1?"active":""}">${index+1}. ${step}</span>`).join("")}</div>${body}<div class="quick-start-actions"><button class="sub" id="btnQuickStartBack" ${quickStartStep===1?"disabled":""}>戻る</button><div><button class="ghost" id="btnQuickStartSave">途中保存</button><button id="btnQuickStartNext">${quickStartStep===3?"この内容で作成":"次へ"}</button></div></div></div></div>`;
}
function syncQuickStartInputs(){
  const name=$("quickCampaignName"),world=$("quickCampaignWorld");
  if(name)quickStartDraft.name=name.value.trim();if(world)quickStartDraft.world=world.value.trim();
  document.querySelectorAll("[data-quick-scene-name]").forEach(input=>quickStartDraft.scenes[Number(input.dataset.quickSceneName)].name=input.value.trim());
  document.querySelectorAll("[data-quick-scene-brief]").forEach(input=>quickStartDraft.scenes[Number(input.dataset.quickSceneBrief)].brief=input.value.trim());
}
function quickStartError(){
  syncQuickStartInputs();
  if(quickStartStep===1&&!quickStartDraft.name)return "キャンペーン名を入力してください。";
  if(quickStartStep===1&&!quickStartDraft.world)return "キャンペーン概要を入力してください。";
  if(quickStartStep===2){const empty=quickStartDraft.scenes.findIndex(scene=>!scene.name||!scene.brief);if(empty>=0)return `シーン${empty+1}の名前と開始時の説明を入力してください。`;}
  return "";
}
function finishQuickStart(){
  /* 後から追加された互換ラッパーは引数を受け渡さないため、既存の確認回避フラグを一時利用する。 */
  window.__tasSkipCampaignConfirm=true;createNewCampaign();window.__tasSkipCampaignConfirm=false;
  campaignName=quickStartDraft.name;campaignWorld=quickStartDraft.world;chapterNames={ch1:"第1話"};chapterOrder=["ch1"];
  customChapterScenes={ch1:quickStartDraft.scenes.map((scene,index)=>({id:index+1,name:scene.name,brief:scene.brief,goal:"",discoveries:[],exits:[{id:"auto_next",match:["次へ進む","了解した","先へ行く"],to:index<2?`scene:${index+2}`:"end",requires:{text:""}}]}))};
  structureChapters=null;activeChapter="ch1";selectedTarget="node";selectedNode={type:"scene",index:0};activeTab="structure";quickStartOpen=false;saveWorkspaceDraft(true);renderScenes();renderAll();setStatus("3シーンのキャンペーンを作成しました。必要な項目だけ追加してください。");
}
function bindQuickStart(){
  const open=$("btnQuickStart");if(open)open.onclick=()=>{quickStartOpen=true;quickStartStep=1;quickStartDraft={name:campaignName==="新しいキャンペーン"?"":campaignName,world:campaignWorld,scenes:quickStartDraft.scenes};renderAll()};
  const close=$("btnQuickStartClose");if(close)close.onclick=()=>{quickStartOpen=false;renderAll()};
  const back=$("btnQuickStartBack");if(back)back.onclick=()=>{syncQuickStartInputs();quickStartStep--;renderAll()};
  const save=$("btnQuickStartSave");if(save)save.onclick=()=>{syncQuickStartInputs();localStorage.setItem("tas_quick_start_v1",JSON.stringify(quickStartDraft));setStatus("簡単作成の途中内容を保存しました")};
  const next=$("btnQuickStartNext");if(next)next.onclick=()=>{const error=quickStartError();if(error){setStatus(error);return}if(quickStartStep===3)finishQuickStart();else{quickStartStep++;renderAll()}};
}
var baseRenderAllForQuickStart=renderAll;
renderAll=function(){baseRenderAllForQuickStart();document.getElementById("quickStartModal")?.remove();const html=quickStartModal();if(html){const holder=document.createElement("div");holder.id="quickStartModal";holder.innerHTML=html;document.body.appendChild(holder)}bindQuickStart()};
(function restoreQuickStart(){try{const saved=JSON.parse(localStorage.getItem("tas_quick_start_v1")||"null");if(saved&&Array.isArray(saved.scenes)&&saved.scenes.length===3)quickStartDraft=saved}catch(e){}})();
