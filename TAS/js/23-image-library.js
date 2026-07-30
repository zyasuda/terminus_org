
/* 画像フォルダの読み込みと、フォルダ内画像の選択。 */
let imageLibraryFiles={};
let imageLibraryFolderName='';
let imageAssetRefs={};
let imagePickerUrls=[];
let imageLibraryDirectoryHandle=null;
let imageLibraryAccessState='none';
const IMAGE_LIBRARY_DB_NAME='tas-image-library-v1';
const IMAGE_LIBRARY_HANDLE_KEY='selected-directory';
function imageLibraryDb(){return new Promise((resolve,reject)=>{const request=indexedDB.open(IMAGE_LIBRARY_DB_NAME,1);request.onupgradeneeded=()=>request.result.createObjectStore('handles');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
function imageLibraryRequest(request){return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
async function savedImageDirectoryHandle(){try{const db=await imageLibraryDb();return await imageLibraryRequest(db.transaction('handles','readonly').objectStore('handles').get(IMAGE_LIBRARY_HANDLE_KEY))}catch(error){return null}}
async function saveImageDirectoryHandle(handle){try{const db=await imageLibraryDb();const transaction=db.transaction('handles','readwrite');transaction.objectStore('handles').put(handle,IMAGE_LIBRARY_HANDLE_KEY);await new Promise((resolve,reject)=>{transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error)});return true}catch(error){return false}}
async function readImageDirectory(handle){const files=[];for await(const [,entry] of handle.entries()){if(entry.kind==='file'){const file=await entry.getFile();if(file.type.startsWith('image/'))files.push(file)}else if(entry.kind==='directory'){files.push(...await readImageDirectory(entry))}}return files}
function applyImageLibraryFiles(files,name,state='ready'){imageLibraryFiles=Object.fromEntries(files.map(file=>[imageFileKey(file.name),file]));imageLibraryFolderName=name||'選択したフォルダ';imageLibraryAccessState=state;renderAll();setStatus(`${files.length}件の画像を読み込みました`)}
async function connectImageDirectory(handle,requestPermission=false){if(!handle)return false;try{let permission=await handle.queryPermission?.({mode:'read'});if(permission!=='granted'&&requestPermission)permission=await handle.requestPermission?.({mode:'read'});if(permission!=='granted'){imageLibraryDirectoryHandle=handle;imageLibraryFolderName=handle.name||'選択したフォルダ';imageLibraryAccessState='needs-permission';renderAll();setStatus('画像フォルダを再接続してください');return false}const files=await readImageDirectory(handle);imageLibraryDirectoryHandle=handle;await saveImageDirectoryHandle(handle);applyImageLibraryFiles(files,handle.name,'ready');return true}catch(error){imageLibraryAccessState='needs-permission';setStatus(`画像フォルダを開けませんでした: ${error.message}`);return false}}
async function chooseImageDirectory(){if(!window.showDirectoryPicker){document.querySelector('#imageFolderInput')?.click();return}try{const handle=await window.showDirectoryPicker({mode:'read'});await connectImageDirectory(handle,true)}catch(error){if(error?.name!=='AbortError')setStatus(`画像フォルダの指定に失敗しました: ${error.message}`)}}
async function restoreImageDirectory(){const handle=await savedImageDirectoryHandle();if(!handle)return;imageLibraryDirectoryHandle=handle;imageLibraryFolderName=handle.name||'選択したフォルダ';await connectImageDirectory(handle,false)}
function imageFileKey(name){return String(name||'').split(/[\\/]/).pop().toLowerCase()}
function imageFilename(value){return String(value||'').split(/[\\/]/).pop()}
function imageRefForTarget(target){if(target.startsWith('scene:')&&target.endsWith(':sky')&&sceneOverrides[target.slice(6,-4)]?.parallaxDisabled)return '';const exact=imageAssetRefs[target];if(exact)return imageFilename(exact);const suffix=target.startsWith('scene:')?target.slice(6):target;const legacy=Object.entries(imageAssetRefs).find(([key])=>key===suffix||key.endsWith(`:${suffix}`));return legacy?imageFilename(legacy[1]):''}
function localImageValue(target,value){const registered=imageRefForTarget(target);if(registered)return registered;const raw=String(value||'');return raw.startsWith('data:')?'':imageFilename(raw)}
function localDraftSnapshot(){
  const data=JSON.parse(JSON.stringify(workspaceDraft()));
  // ローカル保存では、現在有効なチャプターだけを正本として保持する。
  // 削除済みチャプターの編集途中データを残すと、次回保存・出力時に復活するため。
  const activeChapterKeys=Array.isArray(data.chapterOrder)&&data.chapterOrder.length
    ? [...new Set(data.chapterOrder)]
    : [data.activeChapter||'ch1'];
  const activeChapterSet=new Set(activeChapterKeys);
  const filterChapterMap=value=>Object.fromEntries(Object.entries(value||{}).filter(([key])=>activeChapterSet.has(key)));
  const filterScopedMap=value=>Object.fromEntries(Object.entries(value||{}).filter(([key])=>activeChapterKeys.some(chapterKey=>key===chapterKey||key.startsWith(`${chapterKey}:`))));
  data.customChapterScenes=filterChapterMap(data.customChapterScenes);
  data.chapterNames=filterChapterMap(data.chapterNames);
  data.collapsedChapters=filterChapterMap(data.collapsedChapters);
  if(data.chapterIds)data.chapterIds=filterChapterMap(data.chapterIds);
  if(data.structureChapters)data.structureChapters=filterChapterMap(data.structureChapters);
  if(data.flagRulesByChapter)data.flagRulesByChapter=filterChapterMap(data.flagRulesByChapter);
  data.sceneOverrides=filterScopedMap(data.sceneOverrides);
  data.sceneBackgrounds=filterScopedMap(data.sceneBackgrounds);
  data.discoveryFoldState=filterScopedMap(data.discoveryFoldState);
  if(!activeChapterSet.has(data.activeChapter))data.activeChapter=activeChapterKeys[0];
  // 初期所持品は items[].acquisition から導出できるため、ローカル保存では二重管理しない。
  // mock2向けの campaign.initialInventory / initialInventoryIds は出力時に従来どおり生成する。
  delete data.initialInventory;
  data.campaignImage=localImageValue('campaign',data.campaignImage);
  data.castImages=Object.fromEntries(Object.entries(data.castImages||{}).map(([id,value])=>[id,localImageValue(`cast:${id}`,value)]).filter(([,value])=>value));
  data.sceneBackgrounds=Object.fromEntries(Object.entries(data.sceneBackgrounds||{}).map(([key,value])=>[key,localImageValue(`scene:${key}`,value)]).filter(([,value])=>value));
  data.monsters=(data.monsters||[]).map((monster,index)=>{const next={...monster};const image=localImageValue(`monster:${index}`,monster.image||monster.sprite||monster.img);delete next.img;delete next.sprite;if(image)next.image=image;else delete next.image;return next});
  data.items=(data.items||[]).map((item,index)=>{const next={...item};const image=localImageValue(`item:${index}`,item.image);if(image)next.image=image;else delete next.image;return next});
  const monsterImages=new Map((data.monsters||[]).filter(monster=>monster.name&&monster.image).map(monster=>[monster.name,monster.image]));
  data.customChapterScenes=Object.fromEntries(Object.entries(data.customChapterScenes||{}).map(([chapterKey,scenes])=>[chapterKey,(Array.isArray(scenes)?scenes:[]).map((scene,index)=>{const next={...scene};if(next.img)next.img=localImageValue(`scene:${chapterKey}:scene:${index}`,next.img);if(next.enemy){const enemy={...next.enemy};const image=monsterImages.get(enemy.name)||localImageValue(`monster:${(data.monsters||[]).findIndex(monster=>monster.name===enemy.name)}`,enemy.sprite||enemy.img);delete enemy.img;delete enemy.sprite;if(image)enemy.sprite=image;next.enemy=enemy}if(next.parallax?.sky){next.parallax={...next.parallax,sky:localImageValue(`scene:${chapterKey}:sky:${index}`,next.parallax.sky)}}return next})]));
  // シーンに登場する敵もローカル保存用のモンスター台帳へ同期する。
  // 手入力した台帳を優先し、不足している敵だけシーン設定から補完する。
  const savedMonsters=Array.isArray(data.monsters)?data.monsters:[];
  const monsterByName=new Map(savedMonsters.filter(monster=>monster?.name).map(monster=>[monster.name,monster]));
  Object.values(data.customChapterScenes||{}).forEach(scenes=>{
    (Array.isArray(scenes)?scenes:[]).forEach(scene=>{
      const sourceEnemy=scene?.enemy||(scene?.enemyName?{name:scene.enemyName}:null);
      if(!sourceEnemy?.name)return;
      const existing=monsterByName.get(sourceEnemy.name);
      const sourceImage=sourceEnemy.sprite||sourceEnemy.img||'';
      if(!existing){
        const next={...sourceEnemy,id:sourceEnemy.id||`monster_${savedMonsters.length+1}`};
        delete next.img;delete next.sprite;
        if(sourceImage)next.image=sourceImage;
        savedMonsters.push(next);monsterByName.set(next.name,next);
        if(next.image)monsterImages.set(next.name,next.image);
        return;
      }
      Object.entries(sourceEnemy).forEach(([key,value])=>{
        if(key==='name'||key==='img'||key==='sprite')return;
        if(existing[key]===undefined)existing[key]=value;
      });
      if(!existing.image&&sourceImage){existing.image=sourceImage;monsterImages.set(existing.name,sourceImage)}
    });
  });
  data.monsters=savedMonsters;
  data.imageAssetRefs=Object.fromEntries(Object.entries(data.imageAssetRefs||{}).map(([target,value])=>[target,imageFilename(value)]).filter(([,value])=>value));
  return data;
}
function imageTargetValue(target){
  if(target==='campaign')return campaignImage;
  if(target.startsWith('scene:')&&target.endsWith(':sky')){const override=sceneOverrides[target.slice(6,-4)]||{};return override.parallaxDisabled?'':(override.parallaxSky||'')}
  if(target.startsWith('scene:'))return sceneBackgrounds[target.slice(6)];
  if(target.startsWith('cast:'))return castImages[target.slice(5)];
  if(target.startsWith('monster:'))return monsters[Number(target.slice(8))]?.image;
  if(target.startsWith('item:'))return items[Number(target.slice(5))]?.image;
  return '';
}
function setImageTargetValue(target,url){
  if(target==='campaign')campaignImage=url;
  else if(target.startsWith('scene:')&&target.endsWith(':sky')){const key=target.slice(6,-4);sceneOverrides[key]={...(sceneOverrides[key]||{}),parallaxEnabled:true,parallaxDisabled:false,parallaxSky:url}}
  else if(target.startsWith('scene:'))sceneBackgrounds[target.slice(6)]=url;
  else if(target.startsWith('cast:'))castImages[target.slice(5)]=url;
  else if(target.startsWith('monster:')){const i=Number(target.slice(8));if(monsters[i])monsters[i].image=url}
  else if(target.startsWith('item:')){const i=Number(target.slice(5));if(items[i])items[i].image=url}
}
function applyLibraryImage(target,file){
  if(!target||!file)return;
  imageAssetRefs[target]=file.name;
  handleImageInput(file,url=>setImageTargetValue(target,url),'画像を設定しました');
  saveWorkspaceDraft(true);
}
function closeImagePicker(){
  imagePickerUrls.forEach(url=>URL.revokeObjectURL(url));imagePickerUrls=[];
  document.querySelector('#imagePickerModal')?.remove();
}
function clearLibraryImage(target){
  setImageTargetValue(target,'');delete imageAssetRefs[target];
  closeImagePicker();saveWorkspaceDraft(true);renderAll();setStatus('画像を解除しました');
}
function openImagePicker(target){
  const files=Object.values(imageLibraryFiles);
  if(!files.length){
    activeTab='world';renderScenes();renderAll();
    setStatus('世界設定の「画像管理」で画像フォルダを指定してください');
    return;
  }
  closeImagePicker();
  const current=imageRefForTarget(target)||imageFilename(imageTargetValue(target));
  const modal=document.createElement('div');modal.id='imagePickerModal';modal.className='image-picker-modal';
  modal.innerHTML=`<div class="image-picker-dialog" role="dialog" aria-modal="true" aria-label="画像を選ぶ"><div class="image-picker-head"><div><h3>画像を選ぶ</h3><p>画像フォルダ：${escapeHtml(imageLibraryFolderName||'選択済み')}</p></div><button type="button" class="sub" data-close-image-picker>閉じる</button></div><input type="search" class="image-picker-search" placeholder="ファイル名で絞り込む"><div class="image-picker-grid"></div><div class="image-picker-foot"><span>現在：${escapeHtml(current||'未設定')}</span><button type="button" class="sub" data-clear-image-picker ${current?'':'disabled'}>画像を解除</button></div></div>`;
  const grid=modal.querySelector('.image-picker-grid');
  files.sort((a,b)=>a.name.localeCompare(b.name)).forEach(file=>{
    const button=document.createElement('button');button.type='button';button.className=`image-picker-item ${file.name===current?'selected':''}`;button.dataset.imagePickerFile=file.name;
    const url=URL.createObjectURL(file);imagePickerUrls.push(url);
    button.innerHTML=`<img src="${url}" alt=""><span>${escapeHtml(file.name)}</span>`;grid.append(button);
  });
  modal.querySelector('.image-picker-search').oninput=event=>{const query=event.target.value.trim().toLowerCase();grid.querySelectorAll('.image-picker-item').forEach(button=>{button.hidden=Boolean(query&&!button.dataset.imagePickerFile.toLowerCase().includes(query))})};
  modal.onclick=event=>{
    if(event.target===modal||event.target.closest('[data-close-image-picker]')){closeImagePicker();return}
    if(event.target.closest('[data-clear-image-picker]')){clearLibraryImage(target);return}
    const item=event.target.closest('[data-image-picker-file]');if(!item)return;
    const file=imageLibraryFiles[imageFileKey(item.dataset.imagePickerFile)];if(file){closeImagePicker();applyLibraryImage(target,file)}
  };
  document.body.append(modal);modal.querySelector('.image-picker-search').focus();
}
function decorateImageInputs(){
  const targets=[];
  const campaign=$('campaignImageInput');if(campaign)targets.push([campaign,'campaign']);
  const sceneInput=$('sceneBgInput');if(sceneInput)targets.push([sceneInput,`scene:${sceneKey()}`]);
  const skyInput=$('sceneSkyInput');if(skyInput)targets.push([skyInput,`scene:${sceneKey()}:sky`]);
  document.querySelectorAll('.cast-image-input').forEach(input=>targets.push([input,`cast:${input.dataset.castId}`]));
  document.querySelectorAll('.monster-image').forEach(input=>targets.push([input,`monster:${input.dataset.monsterIndex}`]));
  document.querySelectorAll('.item-image').forEach(input=>targets.push([input,`item:${input.dataset.itemIndex}`]));
  targets.forEach(([input,target])=>{
    input.classList.add('direct-image-input');
    input.dataset.imageTarget=target;
    if(input.dataset.imageLibraryDecorated)return;
    input.dataset.imageLibraryDecorated='1';
    const field=input.parentElement;
    if(!field)return;
    const wrapper=document.createElement('div');wrapper.className='image-library-picker';
    const label=document.createElement('label');label.textContent='現在使用中';
    const current=imageRefForTarget(target)||imageFilename(imageTargetValue(target));
    const names=Object.keys(imageLibraryFiles).sort((a,b)=>a.localeCompare(b));
    const currentName=document.createElement('div');currentName.className='image-library-current';currentName.textContent=current||'画像未設定';
    const selectButton=document.createElement('button');selectButton.type='button';selectButton.className='sub image-select-button';
    selectButton.textContent=names.length?'画像を選ぶ':'世界設定で画像フォルダを指定';
    selectButton.disabled=Boolean(input.disabled);
    selectButton.onclick=()=>openImagePicker(target);
    wrapper.append(label,currentName,selectButton);field.append(wrapper);
  });
}
function imageFolderMarkup(){
  const names=Object.keys(imageLibraryFiles);
  const folderText=imageLibraryFolderName?`画像フォルダ：${escapeHtml(imageLibraryFolderName)}`:'画像フォルダ：未指定';
  const countText=names.length?`読み込み済み：${names.length}件`:(imageLibraryAccessState==='needs-permission'?'再接続が必要です':'画像フォルダを選択してください');
  const action=imageLibraryAccessState==='needs-permission'?'画像フォルダを再接続':(names.length?'画像フォルダを変更':'画像フォルダを指定');
  const note=window.showDirectoryPicker?'一度許可すると、再読み込み後も同じ画像フォルダへ自動で再接続します。':'このブラウザではフォルダへの再接続に対応していません。再読み込み後は再指定してください。';
  return `<div class="card image-library-card"><h3>画像管理</h3><p class="hint">${folderText}<br>${countText}<br>${note}</p><button type="button" class="sub image-folder-button" id="btnChooseImageFolder">${action}</button><input id="imageFolderInput" type="file" accept="image/*" webkitdirectory directory multiple></div>`;
}
var baseRenderWorldForImageLibrary=renderWorld;
renderWorld=function(){return baseRenderWorldForImageLibrary().replace('</p>','</p>'+imageFolderMarkup())};
var baseRenderTabForImageLibrary=renderTab;
renderTab=function(){baseRenderTabForImageLibrary();decorateImageInputs()};
var baseRenderAllForImageLibrary=renderAll;
renderAll=function(){baseRenderAllForImageLibrary();decorateImageInputs()};
var baseWorkspaceDraftForImageLibrary=workspaceDraft;
workspaceDraft=function(){return {...baseWorkspaceDraftForImageLibrary(),imageAssetRefs}};
var baseApplyWorkspaceDraftForImageLibrary=applyWorkspaceDraft;
applyWorkspaceDraft=function(data){
  baseApplyWorkspaceDraftForImageLibrary(data);
  imageAssetRefs=data.imageAssetRefs&&typeof data.imageAssetRefs==='object'?data.imageAssetRefs:{};
  campaignImage=importedAssetRef(campaignImage);
  castImages=Object.fromEntries(Object.entries(castImages||{}).map(([id,value])=>[id,importedAssetRef(value)]));
  sceneBackgrounds=Object.fromEntries(Object.entries(sceneBackgrounds||{}).map(([key,value])=>[key,importedAssetRef(value)]));
  monsters=(monsters||[]).map(monster=>{const next={...monster};const image=importedAssetRef(monster.image||monster.sprite||monster.img);delete next.img;delete next.sprite;if(image)next.image=image;return next});
  items=(items||[]).map(item=>({...item,...(item.image?{image:importedAssetRef(item.image)}:{})}));
  customChapterScenes=Object.fromEntries(Object.entries(customChapterScenes||{}).map(([chapterKey,scenes])=>[chapterKey,(Array.isArray(scenes)?scenes:[]).map(scene=>{if(!scene?.enemy)return scene;const next={...scene,enemy:{...scene.enemy}};const image=importedAssetRef(scene.enemy.sprite||scene.enemy.img);delete next.enemy.img;delete next.enemy.sprite;if(image)next.enemy.sprite=image;return next})]));
};
try{const rawImageRefs=localStorage.getItem(DRAFT_KEY);if(rawImageRefs){const parsed=JSON.parse(rawImageRefs);const data=parsed.data||parsed;if(data.imageAssetRefs&&typeof data.imageAssetRefs==='object')imageAssetRefs=data.imageAssetRefs}}catch(e){}
document.addEventListener('change',event=>{
  const input=event.target;
  if(input?.dataset?.imageTarget&&input.files?.[0]){imageAssetRefs[input.dataset.imageTarget]=input.files[0].name;saveWorkspaceDraft(true)}
  if(input?.id!=='imageFolderInput')return;
  const files=Array.from(input.files||[]).filter(file=>file.type.startsWith('image/'));
  applyImageLibraryFiles(files,files[0]?.webkitRelativePath?.split(/[\\/]/)[0]||'選択したフォルダ','temporary');
},true);
document.addEventListener('click',event=>{if(!event.target.closest?.('#btnChooseImageFolder'))return;event.preventDefault();if(imageLibraryDirectoryHandle&&imageLibraryAccessState==='needs-permission')connectImageDirectory(imageLibraryDirectoryHandle,true);else chooseImageDirectory()},true);
window.addEventListener('load',()=>{restoreImageDirectory()});
