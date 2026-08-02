
/* 旧下書き・旧生成処理が参照する互換変数。テーマは画面・保存・出力には含めない。 */
let campaignTheme="";
let assistantMode="prompt";let assistantAiResult="";
const DRAFT_KEY="tas_campaign_draft_v1";const $=id=>document.getElementById(id);let context=null;let activeTab="world";let activeChapter="ch1";let selectedNode={type:"scene",index:0};/* 左ツリーの選択対象。"campaign" / "chapter" / "node"（イントロ・シーン・アウトロ）。 */let selectedTarget="campaign";let history=[];let draft="";let review="";let rightPanelEnabled=false;const DEFAULT_CAMPAIGN_NAME="ランタンヒル年代記";const DEFAULT_CAMPAIGN_WORLD="ミステリ / ロー・ファンタジー。静かで神秘的、少し切ない。";const DEFAULT_CAMPAIGN_TERMS="現代語彙を避ける。\n禁止語：懐中電灯、電灯、モーター、エンジン、電池、メートル\n言い換えが必要な場合は、世界観に合う平易な表現を使う。";let campaignName=DEFAULT_CAMPAIGN_NAME;let campaignImage="";let campaignWorld=DEFAULT_CAMPAIGN_WORLD;let campaignTerms=DEFAULT_CAMPAIGN_TERMS;let extraCompanions=0;let npcCount=1;let monsters=[];let items=[];let castImages={};let castNames={};let castProfiles={};let castFlags={};let castAttributes={};let sceneBackgrounds={};let sceneOverrides={};/* 章単位の幕間演出。{ [chapterKey]: { opening: {enabled,text}, ending: {enabled,text} } } */let chapterInterludes={};/* 章開始時の所持品。{ [chapterKey]: { [ownerId]: [itemId, …] } } */let chapterStartingInventory={};let discoveryFoldState={};let pendingCastFocus=null;let collapsedCampaign=false;let collapsedChapters={ch1:false,ch2:false};
const fallbackScenes=[{id:1,name:"坑道の入口前",brief:"古いレールと木札がある。奥から金属音が聞こえる。",goal:"札とレールを確認し、奥へ進む",discoveries:["作業札","トロッコ軌道"]},{id:2,name:"分かれ道",brief:"封鎖の木柵と左右の坑道。奥に灯りが揺れる。",goal:"第三坑道へ入る手段を見つける",discoveries:["封鎖の木柵","油の匂い"]},{id:3,name:"坑道の最奥",brief:"ランタンを持つ人影がこちらを向く。",goal:"灯りの主と決着する",discoveries:["灯りの主の正体","動力と坑道維持"]},{id:4,name:"村への帰還",brief:"村の広場。マイラの家に灯りがともる。",goal:"マイラの家へ入る",discoveries:[]},{id:5,name:"マイラの部屋",brief:"マイラが報告を待っている。",goal:"見聞きしたことを報告する",discoveries:[]}];
let freshCampaign=false;let customChapterScenes={ch1:[],ch2:[]};let chapterNames={ch1:"",ch2:""};let chapterOrder=["ch1"];let exportFileViews=[];let exportFileIndex=0;
/* 左ツリーで選んだ対象ごとのタブ。renderTabs / renderRightPanel / renderTab がこの定義を共有する。 */
const CAMPAIGN_TABS=[["world","設定"],["concepts","GM設定"],["cast","キャラクター"],["monsters","モンスター"],["items","アイテム"],["rules","共通ルール"]];
const CHAPTER_TABS=[["chapterOverview","構成・進行"]];
const SCENE_TABS=[["structure","シーン設定"],["state","シーン要素"],["expression","表現・会話"],["playtest","テキストプレイ"],["draft","生成レビュー"]];
const CAMPAIGN_TAB_IDS=CAMPAIGN_TABS.map(([id])=>id);
const CHAPTER_TAB_IDS=CHAPTER_TABS.map(([id])=>id);
let chapterData=()=>{if(freshCampaign)return {title:activeChapter==="ch2"?"新しい章":"新しい章",scenes:Array.isArray(customChapterScenes[activeChapter])?customChapterScenes[activeChapter]:[]};try{const file=activeChapter==="ch2"?"chapter_02.json":"chapter_01.json";const raw=context?.dataFiles?.[file]||context?.dataFiles?.["chapter_01.json"];if(raw)return JSON.parse(raw)}catch(e){}return {title:activeChapter==="ch2"?"心石の在処":"廃坑の灯",scenes:activeChapter==="ch2"?fallbackScenes.slice(0,2):fallbackScenes}};
const currentScenes=()=>chapterData().scenes||fallbackScenes;
const nodeKey=(n,chapter=activeChapter)=>`${chapter}:${n.type}:${n.type==='scene'?n.id:(n.index??n.type)}`;
const withSceneOverride=n=>{const merged={...n,...(sceneOverrides[nodeKey(n)]||{})};const discoveries=Array.isArray(merged.discoveries)?merged.discoveries:Array.isArray(merged.secrets)?merged.secrets:null;const {secrets,...rest}=merged;return discoveries?{...rest,discoveries:discoveries.map((x,i)=>normalizeDiscoveryFor(merged,x,i))}:rest};
const chapterNodes=()=>{const d=chapterData();const opening=d.opening&&typeof d.opening==="object"?d.opening:{};const ending=d.ending&&typeof d.ending==="object"?d.ending:{};return [{...opening,type:"opening",id:"opening",name:opening.name||"イントロ",brief:opening.brief||d.intro||"依頼と今回の目的を提示する。",goal:opening.goal||"依頼を受け、坑道へ向かう目的を理解する。"},...currentScenes().map((s,index)=>({...s,type:"scene",index,name:s.name||fallbackScenes[index]?.name||`シーン${s.id??index+1}`})),{...ending,type:"ending",id:"ending",name:ending.name||"アウトロ",brief:ending.brief||"依頼の結果を締めくくり、章の余韻を残す。",goal:ending.goal||"今回の依頼を報告し、章の成果を確定する。"},{type:"intermission",id:"intermission",name:"インターミッション",brief:d.intermission?.brief||"章と章の間をつなぐ。次の依頼や世界の変化を整理する。",goal:d.intermission?.goal||"次章への持ち越し情報を確定する。"}].map(withSceneOverride)};
const scene=()=>chapterNodes().find(n=>n.type===selectedNode.type&&n.index===selectedNode.index)||chapterNodes()[0];
const sceneKey=()=>nodeKey(selectedNode);
const sceneRef=n=>n.type==="scene"?`scene:${n.id}`:n.type;
const sceneRefLabel=n=>n.type==="scene"?`シーン${n.id}：${n.name}`:n.name;
const sceneTargets=()=>chapterNodes().filter(n=>sceneRef(n)!==sceneRef(scene()));
const TRANSITION_TYPES=[
  ["flag","フラグ"],["discovery","調査対象"],["item","所持アイテム"],
  ["check","判定結果"],["combat","戦闘結果"],["conversation","会話結果"]
];
const DISCOVERY_CATEGORIES=[["main","メイン進行"],["place","場所・背景"],["image","画像内要素"],["sense","音・匂い・感覚"],["object","調査対象"],["foreshadow","伏線・世界設定"],["npc","人物・痕跡"]];
const DISCOVERY_IMPORTANCE=[["major","主線"],["support","補助"],["flavor","演出"]];
const DISCOVERY_TEMPLATE_SETS=[
  {category:"main",importance:"major",label:"進行に関わる要素",surface:"プレイヤーが必ず認識する導線や障害。",trigger:"最初の確認動作",fact:"このシーンの進行に必要な事実を記録する。",tags:["主線確認"]},
  {category:"place",importance:"support",label:"場所の違和感",surface:"地形や配置、使われ方の不自然さ。",trigger:"周囲を見る",fact:"場所に関する確定事実を記録する。",tags:["背景観察"]},
  {category:"image",importance:"support",label:"画像で目に入るもの",surface:"立ち絵や背景画像で視認できる要素。",trigger:"画像を確認する",fact:"視覚情報から分かる確定事実を記録する。",tags:["視認済み"]},
  {category:"sense",importance:"flavor",label:"匂い・音・気配",surface:"音、匂い、温度、違和感など。",trigger:"耳を澄ます / 匂いを確かめる",fact:"感覚的に把握できる確定事実を記録する。",tags:["感覚手掛かり"]},
  {category:"object",importance:"support",label:"補助的な調査対象",surface:"本筋でなくても触れられる小物や痕跡。",trigger:"個別に調べる",fact:"寄り道で得られる追加情報を記録する。",tags:["寄り道"]},
  {category:"foreshadow",importance:"flavor",label:"伏線・世界設定",surface:"今は意味が分からないが後で効く要素。",trigger:"違和感として拾う",fact:"後続シーンで参照したい伏線を記録する。",tags:["伏線"]}
];
const DIALOGUE_SPEAKERS=[["gm","GM"],["member","メンバー"],["npc","NPC"],["system","システム"]];
const CAST_GENDERS=[["unspecified","未設定"],["male","男性"],["female","女性"],["nonbinary","ノンバイナリー"],["other","その他"]];
const DIALOGUE_PRIORITIES=[["high","高"],["medium","中"],["low","低"]];
const DIALOGUE_EVENTS=[["","なし"],["flag_add","フラグ付与"],["flag_set","状態値を設定"],["item_grant","アイテム付与"],["npc_join","NPC参加"],["scene_unlock","シーン解放"],["battle_start","バトル開始"],["discovery_reveal","要素開示"]];
