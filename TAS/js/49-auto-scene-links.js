/* 初期版の一本道だけを保つ。作者が作った出口は変更しない。 */
const AUTO_NEXT_EXIT_ID="auto_next";
const AUTO_NEXT_MATCH=["次へ進む","了解した","先へ行く"];
function isAutomaticNextExit(exit){return String(exit?.id||"")===AUTO_NEXT_EXIT_ID}
function automaticNextExit(target){return {id:AUTO_NEXT_EXIT_ID,match:AUTO_NEXT_MATCH,to:target,requires:{text:""}}}
function syncAutomaticSceneExits(key){
  ensureStructureChapters();
  const scenes=structureChapters[key]?.scenes||[];
  scenes.forEach((scene,index)=>{
    const exits=Array.isArray(scene.exits)?scene.exits:[];
    const autoIndex=exits.findIndex(isAutomaticNextExit);
    if(autoIndex<0)return;
    const next=index<scenes.length-1?`scene:${scenes[index+1].id}`:"end";
    scene.exits=[...exits.slice(0,autoIndex),automaticNextExit(next),...exits.slice(autoIndex+1)];
  });
}
function addAutomaticExitToLastScene(key){const scenes=structureChapters[key]?.scenes||[];const last=scenes[scenes.length-1];if(last&&Array.isArray(last.exits)&&last.exits.length===0)last.exits=[automaticNextExit("end")]}
function syncAndSaveAutomaticSceneExits(key,message){syncAutomaticSceneExits(key);saveWorkspaceDraft(true);renderScenes();renderAll();if(message)setStatus(message)}
var baseAddManagedSceneForAutoLinks=addManagedScene;
addManagedScene=function(key){const before=(structureChapters[key]?.scenes||[]).length;baseAddManagedSceneForAutoLinks(key);if((structureChapters[key]?.scenes||[]).length>before){addAutomaticExitToLastScene(key);syncAndSaveAutomaticSceneExits(key,"シーンを追加し、標準の進行をつなぎ直しました")}};
var baseMoveManagedSceneForAutoLinks=moveManagedScene;
moveManagedScene=function(key,index,delta){const before=(structureChapters[key]?.scenes||[]).map(scene=>scene.id).join(",");baseMoveManagedSceneForAutoLinks(key,index,delta);if((structureChapters[key]?.scenes||[]).map(scene=>scene.id).join(",")!==before)syncAndSaveAutomaticSceneExits(key,"シーンの順番と標準の進行を更新しました")};
var baseDeleteManagedSceneForAutoLinks=deleteManagedScene;
deleteManagedScene=function(key,index){const before=(structureChapters[key]?.scenes||[]).length;baseDeleteManagedSceneForAutoLinks(key,index);if((structureChapters[key]?.scenes||[]).length<before)syncAndSaveAutomaticSceneExits(key,"シーンを削除し、標準の進行をつなぎ直しました")};
var baseCreateNewSceneForAutoLinks=createNewScene;
createNewScene=function(){const before=(customChapterScenes[activeChapter]||[]).length;baseCreateNewSceneForAutoLinks();if(freshCampaign&&(customChapterScenes[activeChapter]||[]).length>before){structureChapters=null;ensureStructureChapters();addAutomaticExitToLastScene(activeChapter);syncAndSaveAutomaticSceneExits(activeChapter,"シーンを追加し、標準の進行をつなぎ直しました")}};
var baseRenderChapterOverviewForAutoLinks=renderChapterOverview;
renderChapterOverview=function(){return baseRenderChapterOverviewForAutoLinks().replace("</h2>","</h2><p class=\"hint\">標準の進行は「次へ進む」「了解した」で次のシーンへ進みます。シーンを追加・削除・並べ替えた場合も自動でつなぎ直します。</p>")};
