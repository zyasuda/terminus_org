
/* 世界設定内のキャンペーン構造管理。表示順と編集内容をTAS下書きに保持する。 */
let structureChapters=null;
function deepCopyStructure(value){return JSON.parse(JSON.stringify(value||{}))}
function structureSourceChapter(key){
  const file=key==='ch2'?'chapter_02.json':'chapter_01.json';
  const data=sourceJson(file);
  const fallbackTitle=key==='ch2'?'心石の在処':'廃坑の灯';
  /* intro は旧データでは文字列、現行データではオブジェクトであり得る。章全体のトリガー語句候補では
     exits を読む必要があるため、文字列も brief を持つノードとして統一する。 */
  const opening=data.opening&&typeof data.opening==='object'?data.opening:data.intro&&typeof data.intro==='object'?data.intro:{brief:typeof data.intro==='string'?data.intro:''};
  return {title:data.title||fallbackTitle,scenes:Array.isArray(data.scenes)?deepCopyStructure(data.scenes):deepCopyStructure(key==='ch2'?fallbackScenes.slice(0,2):fallbackScenes),opening:deepCopyStructure(opening),ending:data.ending||{},intermission:data.intermission||{}};
}
function ensureStructureChapters(){
  if(structureChapters)return structureChapters;
  if(!Array.isArray(chapterOrder)||!chapterOrder.length)chapterOrder=freshCampaign?['ch1']:['ch1','ch2'];
  structureChapters={};
  chapterOrder.forEach((key,index)=>{
    const source=freshCampaign?{title:chapterNames[key]||`チャプター${index+1}`,scenes:Array.isArray(customChapterScenes[key])?deepCopyStructure(customChapterScenes[key]):[],opening:{},ending:{},intermission:{}}:structureSourceChapter(key);
    structureChapters[key]=source;
    if(!chapterNames[key])chapterNames[key]=source.title||`チャプター${index+1}`;
    collapsedChapters[key]=Boolean(collapsedChapters[key]);
    if(!CHAPTERS[key])CHAPTERS[key]={name:source.title||`チャプター${index+1}`,file:`CHAPTER_${String(index+1).padStart(2,'0')}`};
  });
  return structureChapters;
}
var baseChapterDataForStructure=chapterData;
chapterData=()=>{ensureStructureChapters();return structureChapters[activeChapter]||baseChapterDataForStructure()};
function structureChapterLabel(key,index){return chapterNames[key]||structureChapters?.[key]?.title||`チャプター${index+1}（未命名）`}
function structureSceneLabel(node,index){return node.type==='scene'?`シーン${node.id??index+1}`:node.type==='opening'?'オープニング':node.type==='ending'?'アウトロ':'インターミッション'}
function structureReferenceWarnings(key){
  const removed=structureChapters?.[key]?.scenes||[];const ids=new Set(removed.map(x=>`scene:${x.id}`));const warnings=[];
  Object.entries(sceneOverrides||{}).forEach(([overrideKey,value])=>{if(!overrideKey.startsWith(`${key}:`)&&JSON.stringify(value).match(/scene:\d+/)){for(const id of ids)if(JSON.stringify(value).includes(id))warnings.push(`${id}への参照`)}});
  return [...new Set(warnings)];
}
function structureSaveAndRender(message){
  // 見本キャンペーンも、構成を変更した時点で編集用データへ移行する。
  // これを行わないと、削除・並べ替えが一時表示だけになり、左ペインや再読込で元に戻る。
  if(!freshCampaign){
    freshCampaign=true;
    customChapterScenes=Object.fromEntries(chapterOrder.map(key=>[key,deepCopyStructure(structureChapters?.[key]?.scenes||[])]));
    chapterNames=Object.fromEntries(chapterOrder.map((key,index)=>[key,chapterNames[key]||structureChapters?.[key]?.title||`チャプター${index+1}`]));
  }
  saveWorkspaceDraft(true);renderScenes();renderAll();if(message)setStatus(message)
}
function addManagedScene(key){
  ensureStructureChapters();const chapter=structureChapters[key];if(!chapter)return;const scenes=chapter.scenes||[];const nextId=scenes.reduce((max,x)=>Math.max(max,Number(x.id)||0),0)+1;scenes.push({id:nextId,name:`シーン${nextId}`,brief:'',goal:'',discoveries:[],exits:[]});chapter.scenes=scenes;activeChapter=key;selectedNode={type:'scene',index:scenes.length-1};activeTab='structure';structureSaveAndRender(`シーン${nextId}を作成しました`)}
function addManagedChapter(){
  ensureStructureChapters();let n=chapterOrder.length+1;let key=`ch${n}`;while(chapterOrder.includes(key)){n++;key=`ch${n}`};chapterOrder=[...chapterOrder,key];structureChapters[key]={title:`チャプター${n}`,scenes:[],opening:{},ending:{},intermission:{}};chapterNames[key]=`チャプター${n}`;collapsedChapters[key]=false;CHAPTERS[key]={name:`チャプター${n}`,file:`CHAPTER_${String(n).padStart(2,'0')}`};activeChapter=key;selectedNode={type:'opening'};activeTab='structure';structureSaveAndRender(`チャプター${n}を作成しました`)}
function renameManagedChapter(key,value){ensureStructureChapters();if(!structureChapters[key])return;const name=value.trim()||'未命名チャプター';structureChapters[key].title=name;chapterNames[key]=name;if(CHAPTERS[key])CHAPTERS[key].name=name;saveWorkspaceDraft(true);renderScenes();setStatus('チャプター名を更新しました')}
function renameManagedScene(key,index,value){ensureStructureChapters();const item=structureChapters[key]?.scenes?.[index];if(!item)return;const name=value.trim()||`シーン${item.id||index+1}`;item.name=name;sceneOverrides[`${key}:scene:${index}`]={...(sceneOverrides[`${key}:scene:${index}`]||{}),name};saveWorkspaceDraft(true);renderScenes();setStatus('シーン名を更新しました')}
function moveManagedChapter(key,delta){const i=chapterOrder.indexOf(key),next=i+delta;if(i<0||next<0||next>=chapterOrder.length)return;[chapterOrder[i],chapterOrder[next]]=[chapterOrder[next],chapterOrder[i]];structureSaveAndRender('チャプターの順番を変更しました')}
function moveManagedScene(key,index,delta){ensureStructureChapters();const scenes=structureChapters[key]?.scenes||[];const next=index+delta;if(next<0||next>=scenes.length)return;[scenes[index],scenes[next]]=[scenes[next],scenes[index]];if(activeChapter===key&&selectedNode.type==='scene'){if(selectedNode.index===index)selectedNode.index=next;else if(selectedNode.index===next)selectedNode.index=index}structureSaveAndRender('シーンの順番を変更しました')}
function deleteManagedScene(key,index){ensureStructureChapters();const scenes=structureChapters[key]?.scenes||[];if(!scenes[index])return;const label=`シーン${scenes[index].id||index+1}`;scenes.splice(index,1);if(activeChapter===key){selectedNode=scenes.length?{type:'scene',index:Math.min(index,scenes.length-1)}:{type:'opening'}}structureSaveAndRender(`${label}を削除しました`)}
function deleteManagedChapter(key){ensureStructureChapters();if(chapterOrder.length<=1){alert('チャプターは1つ以上必要です');return}const label=structureChapterLabel(key,chapterOrder.indexOf(key));const warnings=structureReferenceWarnings(key);const suffix=warnings.length?`\n\n参照が見つかりました：${warnings.join('、')}\n削除後に遷移先を確認してください。`:'';if(!confirm(`${label}を削除しますか？${suffix}`))return;chapterOrder=chapterOrder.filter(x=>x!==key);delete structureChapters[key];delete chapterNames[key];delete collapsedChapters[key];delete CHAPTERS[key];if(activeChapter===key){activeChapter=chapterOrder[Math.max(0,chapterOrder.indexOf(key)-1)]||chapterOrder[0];selectedNode={type:'opening'}}structureSaveAndRender(`${label}を削除しました`)}
function renderStructureManager(){
  ensureStructureChapters();
  const cards=chapterOrder.map((key,index)=>{const chapter=structureChapters[key]||{title:'',scenes:[]};const nodes=[{type:'opening',name:'オープニング'},...(chapter.scenes||[]).map((x,i)=>({...x,type:'scene',index:i})),{type:'ending',name:'アウトロ'},{type:'intermission',name:'インターミッション'}];const rows=nodes.map((node,i)=>{if(node.type!=='scene')return `<div class="structure-special">${node.type==='opening'?'├─':'└─'} ${structureSceneLabel(node,i)}（固定）</div>`;return `<div class="structure-scene-row"><div><span class="structure-scene-label">├─ ${structureSceneLabel(node,i)}</span><input data-structure-scene-name="${key}" data-structure-scene-index="${node.index}" value="${escapeHtml(node.name||'')}" aria-label="${escapeHtml(node.name||'シーン')}の名称"></div><div class="structure-actions"><button class="sub" data-structure-scene-up="${key}" data-structure-scene-index="${node.index}" ${node.index===0?'disabled':''}>↑</button><button class="sub" data-structure-scene-down="${key}" data-structure-scene-index="${node.index}" ${node.index===(chapter.scenes||[]).length-1?'disabled':''}>↓</button><button class="sub delete-btn" data-structure-scene-delete="${key}" data-structure-scene-index="${node.index}">削除</button></div></div>`}).join('');return `<div class="structure-chapter"><div class="structure-chapter-head"><input data-structure-chapter-name="${key}" value="${escapeHtml(structureChapterLabel(key,index))}" aria-label="チャプター${index+1}の名称"><div class="structure-actions"><button class="sub" data-structure-chapter-up="${key}" ${index===0?'disabled':''}>↑</button><button class="sub" data-structure-chapter-down="${key}" ${index===chapterOrder.length-1?'disabled':''}>↓</button><button class="sub delete-btn" data-structure-chapter-delete="${key}">削除</button></div></div><div class="structure-scenes">${rows}</div><div class="manager-toolbar"><button class="sub" data-structure-add-scene="${key}">＋ シーンを追加</button></div></div>`}).join('');return `<div class="card structure-manager"><h3>チャプター・シーン構成</h3><p class="hint">ここでキャンペーン全体の章とシーンを管理します。名称変更・追加・削除・並べ替えは自動保存されます。イントロ、アウトロ、インターミッションは固定ノードです。</p>${cards||'<p class="hint">チャプターがありません。</p>'}<div class="manager-toolbar"><button class="sub" id="btnStructureAddChapter">＋ チャプターを追加</button></div></div>`;
}
function bindStructureManager(){
  document.querySelectorAll('[data-structure-chapter-name]').forEach(input=>input.onchange=e=>renameManagedChapter(e.target.dataset.structureChapterName,e.target.value));
  document.querySelectorAll('[data-structure-scene-name]').forEach(input=>input.onchange=e=>renameManagedScene(e.target.dataset.structureSceneName,Number(e.target.dataset.structureSceneIndex),e.target.value));
  document.querySelectorAll('[data-structure-chapter-up]').forEach(b=>b.onclick=()=>moveManagedChapter(b.dataset.structureChapterUp,-1));
  document.querySelectorAll('[data-structure-chapter-down]').forEach(b=>b.onclick=()=>moveManagedChapter(b.dataset.structureChapterDown,1));
  document.querySelectorAll('[data-structure-chapter-delete]').forEach(b=>b.onclick=()=>deleteManagedChapter(b.dataset.structureChapterDelete));
  document.querySelectorAll('[data-structure-add-scene]').forEach(b=>b.onclick=()=>addManagedScene(b.dataset.structureAddScene));
  document.querySelectorAll('[data-structure-scene-up]').forEach(b=>b.onclick=()=>moveManagedScene(b.dataset.structureSceneUp,Number(b.dataset.structureSceneIndex),-1));
  document.querySelectorAll('[data-structure-scene-down]').forEach(b=>b.onclick=()=>moveManagedScene(b.dataset.structureSceneDown,Number(b.dataset.structureSceneIndex),1));
  document.querySelectorAll('[data-structure-scene-delete]').forEach(b=>b.onclick=()=>deleteManagedScene(b.dataset.structureSceneDelete,Number(b.dataset.structureSceneIndex)));
  const add=$('btnStructureAddChapter');if(add)add.onclick=addManagedChapter;
}
var baseRenderWorldForStructure=renderWorld;
renderWorld=function(){const html=baseRenderWorldForStructure();return html+renderStructureManager()};
var baseBindWorldForStructure=bindWorld;
bindWorld=function(){baseBindWorldForStructure();bindStructureManager()};
var baseWorkspaceDraftForStructure=workspaceDraft;
workspaceDraft=function(){ensureStructureChapters();return {...baseWorkspaceDraftForStructure(),structureChapters:deepCopyStructure(structureChapters)}};
var baseApplyWorkspaceDraftForStructure=applyWorkspaceDraft;
applyWorkspaceDraft=function(data){baseApplyWorkspaceDraftForStructure(data);structureChapters=data.structureChapters&&typeof data.structureChapters==='object'?deepCopyStructure(data.structureChapters):null};
var baseCreateNewCampaignForStructure=createNewCampaign;
createNewCampaign=function(){structureChapters=null;baseCreateNewCampaignForStructure()};
if(newSceneButton)newSceneButton.onclick=()=>addManagedScene(activeChapter);
if(newChapterButton)newChapterButton.onclick=addManagedChapter;
var baseRenderAllForStructure=renderAll;
renderAll=function(){ensureStructureChapters();baseRenderAllForStructure()};
