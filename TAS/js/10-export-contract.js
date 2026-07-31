
/* エクスポート契約v0.2: 表示名と分離した安定ID、構造化style、catalog情報を付与する。 */
function stableId(value,fallback){const raw=String(value||"").normalize("NFKC").toLowerCase().trim().replace(/[^a-z0-9_-]+/g,"-").replace(/^-+|-+$/g,"");return raw||fallback}
var tasCampaignId="lanternhill";
var tasChapterIds={ch1:"chapter_01",ch2:"chapter_02"};
var baseWorkspaceDraftForStable=workspaceDraft;
workspaceDraft=function(){return {...baseWorkspaceDraftForStable(),campaignId:tasCampaignId,chapterIds:tasChapterIds}}
var baseApplyWorkspaceDraftForStable=applyWorkspaceDraft;
applyWorkspaceDraft=function(data){baseApplyWorkspaceDraftForStable(data);tasCampaignId=stableId(data.campaignId||campaignName,"campaign");tasChapterIds=data.chapterIds&&typeof data.chapterIds==="object"?data.chapterIds:{ch1:"chapter_01",ch2:"chapter_02"};}
try{const rawStable=localStorage.getItem(DRAFT_KEY);if(rawStable){const parsedStable=JSON.parse(rawStable);const dataStable=parsedStable.data||parsedStable;tasCampaignId=stableId(dataStable.campaignId||campaignName,"campaign");tasChapterIds=dataStable.chapterIds&&typeof dataStable.chapterIds==="object"?dataStable.chapterIds:tasChapterIds}}catch(e){}
function runtimeChapterId(key){if(!tasChapterIds[key]){const n=Math.max(1,chapterOrder.indexOf(key)+1);tasChapterIds[key]=`chapter_${String(n).padStart(2,"0")}`}return tasChapterIds[key]}
function runtimeImageName(value){const raw=String(value||"");if(!raw||raw.startsWith("data:"))return "";return raw.replace(/^.*[\\/]/,"")}
function runtimeAssetId(file){return stableId(String(file).replace(/\\.[^.]+$/,""),"asset")}

/* 出力の段: 安定ID・style・素材台帳(assets)を付ける。段の並びは js/43-output-pipeline.js */
function outputStableIds(payload){
  
  const chapterKey=activeChapter;
  const chapterId=runtimeChapterId(chapterKey);
  const baseCampaign=payload.campaign||{};
  const baseStyle=baseCampaign.style||{};
  const companions=Array.isArray(baseCampaign.companions)&&baseCampaign.companions.length?baseCampaign.companions:[{id:"gareth",name:"ガレス",persona:"寡黙で実用的な戦士。短く話す。"}];
  const style={...baseStyle,
    narration:baseStyle.narration||"である調。地の文は短く、確定事実を優先する。",
    readingLevel:baseStyle.readingLevel||"平易な日本語を使う。",
    world:campaignWorld,
    theme:campaignTheme,
    terms:campaignTerms
  };
  const chapter=payload.chapter||{};
  const firstScene=(chapter.scenes||[])[0]||{};
  const sceneNodes=chapterNodes().filter(n=>n.type==="scene");
  const normalizedChapter={...chapter,
    id:Number(chapter.id)||Number(String(chapterId).replace(/\D/g,""))||1,
    title:chapter.title||currentFreshChapterLabel(),
    quest:chapter.quest||firstScene.goal||`${chapter.title||currentFreshChapterLabel()}の目的を達成する。`,
    intro:chapter.intro||firstScene.brief||"この章の導入を設定してください。",
    scenes:(chapter.scenes||[]).map((rawScene,index)=>{
      const node=sceneNodes[index]||{};
      const key=node.type?nodeKey(node):"";
      const sceneImage=runtimeImageName(sceneBackgrounds[key]||rawScene.img);
      const npcId=(rawScene.npcs||[])[0];
      const npcImage=runtimeImageName(npcId&&castImages[npcId]);
      const parallaxDisabled=Boolean(sceneOverrides[key]?.parallaxDisabled);
      const skyImage=parallaxDisabled?"":runtimeImageName(sceneOverrides[key]?.parallaxSky||rawScene.parallax?.sky);
      const next={...rawScene};
      if(sceneImage)next.img=sceneImage;
      if(skyImage){
        next.parallax={...(next.parallax||{}),sky:skyImage};
        if(sceneImage)next.parallax.fg=sceneImage;
      }else if(parallaxDisabled)delete next.parallax;
      delete next.parallaxSky;
      delete next.parallaxDisabled;
      delete next.parallaxEnabled;
      if(npcImage)next.npcSprite=npcImage;
      /* スプライトは常にファイル名だけへ正規化する。下書き側の値は importedAssetRef により
         "/images/名前" になっていることがあり、そのまま出すとmock2が /images/ を二重に前置して404になる */
      if(next.enemy){const sprite=runtimeImageName(next.enemy.sprite||next.enemy.img);next.enemy={...next.enemy};if(sprite)next.enemy.sprite=sprite;delete next.enemy.img;}
      delete next.enemyName;
      return next;
    })
  };
  const campaign={...baseCampaign,
    meta:{...(baseCampaign.meta||{}),id:tasCampaignId,title:campaignName,version:(baseCampaign.meta||{}).version||"0.2"},
    style,
    companions:companions.map(c=>{const image=runtimeImageName(castImages[c.id]);return image?{...c,sprite:image}:{...c}}),
    image:runtimeImageName(campaignImage)||baseCampaign.image||null
  };
  const assets={};
  const addAsset=(file,kind,usedBy)=>{if(!file)return;const id=runtimeAssetId(file);if(assets[id]){if(!assets[id].usedBy.includes(usedBy))assets[id].usedBy.push(usedBy);return}assets[id]={file,kind,status:"candidate",usedBy:[usedBy]}};
  addAsset(runtimeImageName(campaignImage),"campaign",`campaign.image`);
  campaign.companions.forEach(c=>addAsset(c.sprite,"portrait",`campaign.companions.${c.id}.sprite`));
  addAsset(normalizedChapter.intro?.img,"background",`${chapterId}.intro.img`);
  addAsset(normalizedChapter.intro?.npcSprite,"sprite",`${chapterId}.intro.npcSprite`);
  normalizedChapter.scenes.forEach((s,i)=>{const base=`${chapterId}.scenes.${s.id||i+1}`;addAsset(s.img,"background",`${base}.img`);addAsset(s.npcSprite,"sprite",`${base}.npcSprite`);addAsset(s.parallax?.sky,"parallax.sky",`${base}.parallax.sky`);addAsset(s.parallax?.fg,"parallax.fg",`${base}.parallax.fg`);addAsset(s.enemy?.img,"enemy",`${base}.enemy.img`);addAsset(s.enemy?.sprite,"sprite",`${base}.enemy.sprite`);(s.secrets||[]).forEach(secret=>{addAsset(secret.img,"popup",`${base}.secrets.${secret.id}.img`);addAsset(secret.bg,"background",`${base}.secrets.${secret.id}.bg`)})});
  addAsset(normalizedChapter.ending?.img,"background",`${chapterId}.ending.img`);
  addAsset(normalizedChapter.ending?.npcSprite,"sprite",`${chapterId}.ending.npcSprite`);
  Object.values(assets).forEach(asset=>asset.usedBy.sort());
  return {...payload,campaign,chapter:normalizedChapter,assets,campaignId:tasCampaignId,chapterId,chapterFile:`${chapterId}.json`};
}
var baseCreateNewCampaignForStable=createNewCampaign;
createNewCampaign=function(){baseCreateNewCampaignForStable();tasCampaignId=stableId(campaignName,"campaign");tasChapterIds={ch1:"chapter_01"};saveWorkspaceDraft(true)};
if(newCampaignButton)newCampaignButton.onclick=createNewCampaign;
var baseCreateNewChapterForStable=createNewChapter;
createNewChapter=function(){baseCreateNewChapterForStable();tasChapterIds[activeChapter]=`chapter_${String(chapterOrder.indexOf(activeChapter)+1).padStart(2,"0")}`;saveWorkspaceDraft(true)};
if(newChapterButton)newChapterButton.onclick=createNewChapter;
var baseBindWorldForStable=bindWorld;
bindWorld=function(){baseBindWorldForStable();const input=$("campaignName");if(input)input.oninput=e=>{campaignName=e.target.value.trim()||DEFAULT_CAMPAIGN_NAME;if(!tasCampaignId||tasCampaignId==="lanternhill"&&freshCampaign)tasCampaignId=stableId(campaignName,"campaign");renderScenes();saveWorkspaceDraft(true);setStatus("キャンペーン名を更新しました")}}
