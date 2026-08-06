function setStatus(t){$("status").textContent=t}function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]))}
window.__tasRunMockExport=async button=>{button.disabled=true;setStatus("mock側へ出力中…");try{if(isLocalFile())throw new Error("ローカルファイルでは出力できません。node server.cjs で起動してください");const payload=mockCampaignPayload();const res=await fetch("/api/export-campaign",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});const data=await res.json();if(!res.ok||data.error)throw new Error(data.error?.message||res.status);setStatus(`mock側へ出力しました: ${data.saved.join(", ")}`)}catch(e){setStatus(`出力失敗: ${e.message}`)}finally{button.disabled=false}};
document.addEventListener("click",event=>{const button=event.target.closest?.("#btnExportCampaign");if(button)window.__tasRunMockExport(button)});
function currentSceneCastChips(){const s=scene();const members=[{id:"gareth",name:castName("gareth","ガレス")},...Array.from({length:extraCompanions},(_,i)=>{const id=`member_${i+2}`;return {id,name:castName(id,`メンバー${i+2}`)}})];const npcs=(s.npcs||[]).map(id=>({id,name:castName(id,id.toUpperCase())}));return [...members,...npcs]}
function workspaceDraft(){return {campaignName,campaignImage,campaignWorld,campaignTerms,freshCampaign,customChapterScenes,chapterNames,chapterOrder,activeChapter,selectedNode,selectedTarget,extraCompanions,npcCount,monsters,items,castImages,castNames,castProfiles,castFlags,castAttributes,sceneBackgrounds,sceneOverrides,chapterInterludes,chapterStartingInventory,discoveryFoldState,rightPanelEnabled,assistantMode,collapsedCampaign,collapsedChapters}}
function applyWorkspaceDraft(data){campaignName=typeof data.campaignName==="string"?data.campaignName:campaignName;campaignImage=typeof data.campaignImage==="string"?data.campaignImage:"";campaignWorld=typeof data.campaignWorld==="string"?data.campaignWorld:campaignWorld;campaignTerms=typeof data.campaignTerms==="string"?data.campaignTerms:campaignTerms;freshCampaign=Boolean(data.freshCampaign);customChapterScenes=data.customChapterScenes&&typeof data.customChapterScenes==="object"?data.customChapterScenes:{ch1:[],ch2:[]};chapterNames=data.chapterNames&&typeof data.chapterNames==="object"?data.chapterNames:{ch1:"",ch2:""};chapterOrder=Array.isArray(data.chapterOrder)&&data.chapterOrder.length?data.chapterOrder:(freshCampaign?["ch1"]:["ch1","ch2"]);activeChapter=data.activeChapter||activeChapter;selectedNode=data.selectedNode||selectedNode;if(selectedNode.type==="intermission")selectedNode={type:"opening"};selectedTarget=["campaign","chapter","node"].includes(data.selectedTarget)?data.selectedTarget:"campaign";extraCompanions=Number(data.extraCompanions||0);npcCount=Number(data.npcCount||1);monsters=Array.isArray(data.monsters)?data.monsters:[];items=Array.isArray(data.items)?data.items:[];castImages=data.castImages||{};castNames=data.castNames||{};castProfiles=data.castProfiles||{};castFlags=data.castFlags||{};castAttributes=data.castAttributes&&typeof data.castAttributes==="object"?data.castAttributes:{};sceneBackgrounds=data.sceneBackgrounds||{};sceneOverrides=data.sceneOverrides||{};chapterInterludes=data.chapterInterludes&&typeof data.chapterInterludes==="object"?data.chapterInterludes:{};chapterStartingInventory=data.chapterStartingInventory&&typeof data.chapterStartingInventory==="object"&&!Array.isArray(data.chapterStartingInventory)?data.chapterStartingInventory:{};Object.entries(sceneOverrides).forEach(([key,override])=>{const match=/^(.+):(opening|ending):\2$/.exec(key),interlude=override?.interlude;if(!match||!interlude||typeof interlude!=="object")return;const [,chapterKey,type]=match;chapterInterludes[chapterKey]??={};chapterInterludes[chapterKey][type]??={...interlude};delete override.interlude;if(!Object.keys(override).length)delete sceneOverrides[key]});discoveryFoldState=data.discoveryFoldState||{};rightPanelEnabled=Boolean(data.rightPanelEnabled);collapsedCampaign=Boolean(data.collapsedCampaign);collapsedChapters=data.collapsedChapters||collapsedChapters}
function saveWorkspaceDraft(silent=false){try{const draftData=workspaceDraft();let mediaOmitted=false;try{localStorage.setItem(DRAFT_KEY,JSON.stringify(draftData))}catch(storageError){const refOnly=value=>{const text=String(value||"");return text.startsWith("data:")?"":value};const compact={...draftData,campaignImage:refOnly(draftData.campaignImage),castImages:Object.fromEntries(Object.entries(draftData.castImages||{}).map(([k,v])=>[k,refOnly(v)])),sceneBackgrounds:Object.fromEntries(Object.entries(draftData.sceneBackgrounds||{}).map(([k,v])=>[k,refOnly(v)])),mediaOmitted:true};localStorage.setItem(DRAFT_KEY,JSON.stringify(compact));mediaOmitted=true}if(!silent)setStatus(mediaOmitted?"下書きを保存しました（画像データが大きい場合は、サーバー上の画像参照を使用してください）":"下書きをブラウザに保存しました")}catch(e){setStatus("下書き保存に失敗しました: "+e.message)}}
function loadWorkspaceDraft(){try{const raw=localStorage.getItem(DRAFT_KEY);if(!raw)return;applyWorkspaceDraft(JSON.parse(raw))}catch(e){setStatus("下書き復元に失敗しました: "+e.message)}}
const applyWorkspaceDraftBase=applyWorkspaceDraft;applyWorkspaceDraft=data=>{applyWorkspaceDraftBase(data);assistantMode=data.assistantMode==="ai"?"ai":"prompt"};
function sanitizeFilename(name){const ascii=String(name||"").normalize("NFKD").replace(/[^\x20-\x7E]/g,"").replace(/[^a-zA-Z0-9_-]+/g,"_").replace(/^_+|_+$/g,"").toLowerCase();return ascii||"tas_campaign_data"}
function saveCampaignFile(){try{const suggested=`${sanitizeFilename(campaignName)}.json`;const entered=prompt("保存ファイル名を入力してください（英数字・-_ 推奨）",suggested);if(entered===null){setStatus("保存をキャンセルしました");return}const filename=`${sanitizeFilename(entered.replace(/\.json$/i,""))}.json`;const payload={version:1,savedAt:new Date().toISOString(),data:workspaceDraft()};const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=filename;link.click();URL.revokeObjectURL(url);saveWorkspaceDraft();setStatus(`キャンペーンデータを保存しました: ${filename}`)}catch(e){setStatus("保存に失敗しました: "+e.message)}}
function importedAssetRef(value){const raw=String(value||"").trim();if(!raw||raw.startsWith("data:")||raw.startsWith("http")||raw.startsWith("/"))return raw;return `/images/${raw.split(/[\\/]/).pop()}`}
function gamePayloadToWorkspaceDraft(raw){
  const payload=raw&&typeof raw==="object"?(raw.data&&typeof raw.data==="object"?raw.data:raw):{};
  const campaign=payload.campaign&&typeof payload.campaign==="object"?payload.campaign:{};
  const chapter=payload.chapter&&typeof payload.chapter==="object"?payload.chapter:(Array.isArray(payload.chapters)?payload.chapters[0]:payload);
  if(!campaign.meta&&!campaign.style&&!Array.isArray(chapter.scenes))return null;
  const scenes=Array.isArray(chapter.scenes)?chapter.scenes:[];
  const companions=Array.isArray(campaign.companions)?campaign.companions:[];
  const castNames={};const castProfiles={};const castImages={};const castAttributes={};
  companions.forEach((c,index)=>{if(!c)return;const id=index===0?"gareth":`member_${index+1}`;castNames[id]=c.name||c.id||id;castProfiles[id]=c.persona||c.profile||"";if(c.sprite||c.image)castImages[id]=importedAssetRef(c.sprite||c.image);if(c.gender||c.firstPerson||c.addressTerm||c.speechRules||c.speechFrequency)castAttributes[id]={gender:c.gender||"unspecified",firstPerson:c.firstPerson||"",addressTerm:c.addressTerm||"",speechRules:c.speechRules||"",speechFrequency:c.speechFrequency||""}});
  /* GMも取り込む。入れないと、既存キャンペーンを開いた時にGMの名前・役割・一人称・呼称が空に戻り、
     そのまま出力すると campaign.gm と castAttributes.gm を既定値で潰す。
     旧データは campaign.gm を持たず castAttributes.gm だけを持つので、両方を見る */
  const gmSource={...(campaign.castAttributes?.gm||{}),...(campaign.gm||{})};
  if(gmSource.name)castNames.gm=gmSource.name;
  if(gmSource.persona||gmSource.profile)castProfiles.gm=gmSource.persona||gmSource.profile;
  if(gmSource.sprite||gmSource.image)castImages.gm=importedAssetRef(gmSource.sprite||gmSource.image);
  if(gmSource.gender||gmSource.firstPerson||gmSource.addressTerm||gmSource.speechRules)castAttributes.gm={gender:gmSource.gender||"unspecified",firstPerson:gmSource.firstPerson||"",addressTerm:gmSource.addressTerm||"",speechRules:gmSource.speechRules||""};
  const monsters=[];const seenMonsters=new Set();scenes.forEach(s=>{const e=s&&s.enemy;if(e&&e.name&&!seenMonsters.has(e.name)){seenMonsters.add(e.name);const image=importedAssetRef(e.sprite||e.img);const monster={...e};delete monster.img;delete monster.sprite;if(image)monster.image=image;monsters.push(monster)}});
  const items=Array.isArray(campaign.items)?campaign.items.map(item=>({...item,name:item.name||item.ja||item.id||"",image:importedAssetRef(item.image||item.img)})).filter(item=>item.name):[];
  const sceneBackgrounds={};scenes.forEach((s,i)=>{if(s&&s.img)sceneBackgrounds[`ch1:scene:${i}`]=importedAssetRef(s.img)});
  /* イントロ・アウトロの背景も下書きへ入れる。入れないと画面の「シーン画像」が空欄で表示され、
     作者は設定済みだと思ったまま本文を編集する。2026-07-30にアウトロで実際に起きた。 */
  const terminalObject=value=>value&&typeof value==="object"?value:{};
  if(terminalObject(chapter.intro).img)sceneBackgrounds["ch1:opening:opening"]=importedAssetRef(chapter.intro.img);
  if(terminalObject(chapter.ending).img)sceneBackgrounds["ch1:ending:ending"]=importedAssetRef(chapter.ending.img);
  /* アウトロもイントロと同じように下書きへ入れる。イントロだけを入れていたため、アウトロは
     画面の入力が常に空として扱われ、画面で編集しても出力へ反映されなかった(2026-07-30)。
     2026-08-06、brief/goal以外の全フィールド(npc/npcSprite/exits/npcSay/greeting/hintChips)が
     ここで黙って消えていたことが発覚(mock2出力を「読込」で再取り込むと、依頼人の設定や
     出口の照合語・台詞が全部消える)。npc周りも保持する */
  const terminalNpc=value=>terminalObject(value).npc||null;
  const terminalOverride=value=>{
    const v=terminalObject(value);
    const npc=terminalNpc(value);
    return {brief:typeof value==="string"?value:(v.brief||""),goal:v.goal||"",greeting:v.greeting||"",
      hintChips:Array.isArray(v.hintChips)?v.hintChips:[],
      npcs:npc?.id?[npc.id]:[],
      exits:Array.isArray(v.exits)?v.exits:[]};
  };
  const sceneOverrides={"ch1:opening:opening":terminalOverride(chapter.intro),"ch1:ending:ending":terminalOverride(chapter.ending)};
  /* イントロ・アウトロ・各シーンのNPC名・立ち絵・番号をcastNames/castImages/npcCountへ登録する。
     登録しないと画面のNPC選択肢に出ず、選んでも名前が「NPC1」のような既定名に化ける */
  const allNpcHolders=[chapter.intro,chapter.ending,...scenes];
  allNpcHolders.forEach(value=>{
    const v=terminalObject(value);const npc=v.npc;
    if(!npc?.id)return;
    if(npc.name&&!castNames[npc.id])castNames[npc.id]=npc.name;
    if(v.npcSprite)castImages[npc.id]=importedAssetRef(v.npcSprite);
  });
  const maxNpcNum=allNpcHolders.reduce((max,value)=>{
    const m=/^npc_(\d+)$/.exec(terminalObject(value).npc?.id||"");return m?Math.max(max,Number(m[1])):max;
  },0);
  scenes.forEach((s,i)=>{const key=`ch1:scene:${i}`;const image=sceneBackgrounds[key];const sky=importedAssetRef(s?.parallax?.sky);if(image||sky)sceneOverrides[key]={...(image?{img:image}:{}),...(sky?{parallaxSky:sky}:{})};});
  return {campaignName:campaign.meta?.title||campaign.title||payload.title||"",campaignImage:importedAssetRef(campaign.image||campaign.img),campaignWorld:campaign.style?.world||campaign.world||"",campaignTerms:campaign.style?.terms||campaign.terms||"",campaignStyle:normalizeCampaignStyle({conversationSpread:campaign.style?.conversationSpread,narration:campaign.style?.narration,readingLevel:campaign.style?.readingLevel,goodExample:campaign.style?.goodExample,badExample:campaign.style?.badExample,extra:Array.isArray(campaign.style?.extra)?campaign.style.extra.join("\n"):"",forbiddenWords:Array.isArray(campaign.style?.forbiddenWords)?campaign.style.forbiddenWords.join("、"):"",rollReactionCritical:campaign.style?.rollReaction?.critical,rollReactionFumble:campaign.style?.rollReaction?.fumble,emptyHanded:Array.isArray(campaign.style?.emptyHanded)?campaign.style.emptyHanded.join("\n"):"",unknownTarget:campaign.style?.unknownTarget,companionsHint:campaign.companionsHint}),freshCampaign:true,customChapterScenes:{ch1:scenes},chapterNames:{ch1:chapter.title||"チャプター1"},chapterOrder:["ch1"],activeChapter:"ch1",selectedNode:{type:"opening"},selectedTarget:"campaign",extraCompanions:Math.max(0,companions.length-1),npcCount:Math.max(1,maxNpcNum,Array.isArray(chapter.scenes?.[0]?.npcs)?chapter.scenes[0].npcs.length:1),monsters,items,castImages,castNames,castProfiles,castAttributes,sceneBackgrounds,sceneOverrides,rightPanelEnabled:false,collapsedCampaign:false,collapsedChapters:{ch1:false},campaignId:payload.campaignId||campaign.meta?.id||"campaign",chapterIds:{ch1:payload.chapterId||"chapter_01"}};
}
function loadCampaignFile(file){if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const parsed=JSON.parse(reader.result);const source=parsed.data||parsed;const draft=source.campaign||source.chapter||Array.isArray(source.chapters)||Array.isArray(source.scenes)?gamePayloadToWorkspaceDraft(parsed):null;applyWorkspaceDraft(draft||source);saveWorkspaceDraft();renderScenes();renderAll();setStatus(draft?"ゲーム出力JSONをTASへ読み込みました":"キャンペーンデータを読み込みました")}catch(e){setStatus("読込に失敗しました: "+e.message)}};reader.readAsText(file)}
