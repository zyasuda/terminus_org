
/* 新しいキャンペーンの下書きを開始する。既存の下書きは上書き前に確認する。 */
function createNewCampaign(skipConfirm=false){
  if(!skipConfirm&&!window.__tasSkipCampaignConfirm&&!window.confirm("現在のキャンペーン下書きを新しいキャンペーンで置き換えます。必要な場合は先に保存してください。続けますか？"))return;
  campaignName="新しいキャンペーン";campaignImage="";campaignWorld="";campaignTheme="";campaignTerms="";
  freshCampaign=true;customChapterScenes={ch1:[]};chapterNames={ch1:""};chapterOrder=["ch1"];activeChapter="ch1";selectedNode={type:"opening"};extraCompanions=0;npcCount=1;monsters=[];items=[];
  castImages={};castNames={};castProfiles={};castFlags={};sceneBackgrounds={};sceneOverrides={};chapterStartingInventory={};discoveryFoldState={};
  collapsedCampaign=false;collapsedChapters={ch1:false};activeTab="world";rightPanelEnabled=false;
  saveWorkspaceDraft(true);renderScenes();renderAll();setStatus("新しいキャンペーンを作成しました");
}
function createNewScene(){
  if(!freshCampaign){setStatus("見本キャンペーンのシーンは直接変更できません。新規キャンペーンで作成してください");return}
  const scenes=[...(customChapterScenes[activeChapter]||[])];
  const nextId=scenes.reduce((max,item)=>Math.max(max,Number(item.id)||0),0)+1;
  scenes.push({id:nextId,name:`シーン${nextId}`,brief:"",goal:"",discoveries:[],exits:[]});
  customChapterScenes[activeChapter]=scenes;selectedNode={type:"scene",index:scenes.length-1};activeTab="structure";
  saveWorkspaceDraft(true);renderScenes();renderAll();setStatus(`シーン${nextId}を作成しました`);
}
function createNewChapter(){
  if(!freshCampaign){setStatus("見本キャンペーンではチャプター追加はできません。新規キャンペーンで作成してください");return}
  const nextNumber=chapterOrder.length+1;const key=`ch${nextNumber}`;
  chapterOrder=[...chapterOrder,key];customChapterScenes[key]=[];chapterNames[key]="";collapsedChapters[key]=false;CHAPTERS[key]={name:`チャプター${nextNumber}`,file:`CHAPTER_${String(nextNumber).padStart(2,"0")}`};
  activeChapter=key;selectedNode={type:"opening"};activeTab="structure";
  saveWorkspaceDraft(true);renderScenes();renderAll();setStatus(`チャプター${nextNumber}を作成しました`);
}
var newCampaignButton=$("btnNewCampaign");
if(newCampaignButton)newCampaignButton.onclick=createNewCampaign;
var newSceneButton=$("btnNewScene");
if(newSceneButton)newSceneButton.onclick=createNewScene;
var newChapterButton=$("btnNewChapter");
if(newChapterButton)newChapterButton.onclick=createNewChapter;
function deleteCurrentScene(){
  if(!freshCampaign||scene().type!=="scene")return;
  const scenes=[...(customChapterScenes[activeChapter]||[])];
  const index=Number(scene().index);
  if(!confirm(`シーン${scene().id}を削除しますか？`))return;
  scenes.splice(index,1);customChapterScenes[activeChapter]=scenes;
  selectedNode=scenes.length?{type:"scene",index:Math.min(index,scenes.length-1)}:{type:"opening"};
  saveWorkspaceDraft(true);renderScenes();renderAll();setStatus("シーンを削除しました");
}
function moveCurrentScene(delta){
  if(!freshCampaign||scene().type!=="scene")return;
  const scenes=[...(customChapterScenes[activeChapter]||[])];const index=Number(scene().index);const next=index+delta;
  if(next<0||next>=scenes.length)return;
  [scenes[index],scenes[next]]=[scenes[next],scenes[index]];customChapterScenes[activeChapter]=scenes;selectedNode={type:"scene",index:next};
  saveWorkspaceDraft(true);renderScenes();renderAll();setStatus("シーンの順番を変更しました");
}
var baseStructureRenderForFresh=renderStructure;
renderStructure=function(){
  const html=baseStructureRenderForFresh();
  if(freshCampaign&&scene().type==="opening")return html.replace(/<\/h2>/,'</h2><div class="field"><label>チャプター名</label><input id="chapterName" value="'+escapeHtml(chapterNames[activeChapter]||"")+'" placeholder="例：第一章　はじめての冒険"></div>');
  if(!freshCampaign||scene().type!=="scene")return html;
  return html.replace(/<\/div>$/,'<div class="bottom"><button class="sub" id="btnMoveSceneUp">↑ 上へ</button><button class="sub" id="btnMoveSceneDown">↓ 下へ</button><button class="delete-btn" id="btnDeleteScene">シーンを削除</button></div></div>');
};
var baseStructureBindForFresh=bindStructure;
bindStructure=function(){
  baseStructureBindForFresh();
  const chapterNameInput=$("chapterName");
  if(chapterNameInput)chapterNameInput.oninput=e=>{chapterNames[activeChapter]=e.target.value;saveWorkspaceDraft(true);renderScenes()};
  const up=$("btnMoveSceneUp"),down=$("btnMoveSceneDown"),del=$("btnDeleteScene");
  if(up)up.onclick=()=>moveCurrentScene(-1);if(down)down.onclick=()=>moveCurrentScene(1);if(del)del.onclick=deleteCurrentScene;
};
var baseRightPanelForFresh=renderRightPanel;
function currentFreshChapterLabel(){const index=Math.max(0,chapterOrder.indexOf(activeChapter))+1;return chapterNames[activeChapter]||`チャプター${index}（未命名）`}
renderRightPanel=function(){
  baseRightPanelForFresh();
  if(!freshCampaign)return;
  const target=$("rightBody")?.querySelector(".right-section p");
  if(target&&!["world","cast","monsters","items","rules","export"].includes(activeTab))target.textContent=`${currentFreshChapterLabel()} / ${scene().type==="scene"?`シーン${scene().id}「${scene().name}」`:scene().name}`;
};

/* 出力の段: 新規キャンペーンのときだけ章と同行者を作り直す。段の並びは js/43-output-pipeline.js
   freshCampaign=true は作者が「新しいキャンペーンで置き換える」を選んだ状態(createNewCampaignの確認ダイアログ)。
   この時点の payload.campaign には前段(outputBaseChapter)経由で土台JSON(TAS/data、既存の見本キャンペーン)の
   cast/gm/gmSprite/player がまだ乗っている。新規作成はその見本を置き換える操作なので、
   ここでこれらを保持すると見本のNPC・GM画像が新しいキャンペーンへ紛れ込む。保持してはならない */
function outputFreshCampaign(payload){

  if(!freshCampaign)return payload;
  const chapterInfo=CHAPTERS[activeChapter]||{name:currentFreshChapterLabel(),file:`CHAPTER_${String(chapterOrder.indexOf(activeChapter)+1).padStart(2,"0")}`};
  const entities=[...monsters.map(m=>m.name),...items.map(i=>i.name)].filter(Boolean).map(ja=>({ja,note:"TAS台帳から登録"}));
  const baseCampaign=payload.campaign||{};
  return {...payload,campaign:{meta:{title:campaignName},style:{...(baseCampaign.style||{}),world:campaignWorld,theme:campaignTheme,terms:campaignTerms},entities},chapter:{...payload.chapter,title:currentFreshChapterLabel(),scenes:payload.chapter?.scenes||[]},chapterFile:`${chapterInfo.file.toLowerCase()}.json`};
};
