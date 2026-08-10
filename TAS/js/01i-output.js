/* 出口の必要条件を、出力用の形に決める。
   requires.text は画面の入力欄でありゲーム側の契約には無い。解決できる条件が1つも無ければ
   requires ごと出力しない。同じ判断がイントロ・アウトロの出力(01-core)とトリガー語句側の
   上書き出力(42-match-words)に二重に書かれ、後者にこの除外が無かったため
   requires:{text:""} がゲームJSONへ漏れていた(2026-07-30)。判断はここ1箇所に置く。
   node を渡すのは、条件の語をそのノードの調査対象と突き合わせるため。省略すると
   exitRequires が選択中のシーンを見てしまい、別のシーンの調査対象に一致しうる。
   exitRequires は mockCampaignPayload の内側で window へ載るので window 経由で参照する。 */
function outputExitRequires(requires,resolveSecretId,node){
  const source=requires&&typeof requires==="object"?requires:{};
  if(source.text)return window.exitRequires(source.text,resolveSecretId,node);
  const rest=Object.fromEntries(Object.entries(source).filter(([key])=>key!=="text"));
  return Object.keys(rest).length?rest:undefined;
}
function outputExitTarget(value){return value===null||value===""?null:value==="end"?"end":Number.isFinite(Number(value))?Number(value):value||null}
function exportPayload(){return {campaign:{name:campaignName,world:campaignWorld,theme:campaignTheme,terms:campaignTerms,image:campaignImage?"assets/campaign/campaign_image.png":null},casts:{gm:{id:"gm",name:castName("gm",DEFAULT_GM_NAME),profile:castProfile("gm","ゲームマスター。確定した結果を説明し、プレイヤーを案内する。"),flags:castFlagSet("gm","GM"),image:castImages.gm?"assets/casts/gm.png":null},companions:[{id:"gareth",name:castName("gareth","ガレス"),profile:castProfile("gareth","普通の戦士・用心棒。短く実用的に話す。"),flags:castFlagSet("gareth","メンバー"),image:castImages.gareth?"assets/casts/gareth.png":null},...Array.from({length:extraCompanions},(_,i)=>({id:`member_${i+2}`,name:castName(`member_${i+2}`,`メンバー${i+2}`),profile:castProfile(`member_${i+2}`,"未設定。必要ならメンバーの役割・口調を定義する。"),flags:castFlagSet(`member_${i+2}`,"メンバー"),image:castImages[`member_${i+2}`]?`assets/casts/member_${i+2}.png`:null}))],npcs:npcList().map(n=>({id:n.id,name:n.name,profile:castProfile(n.id,"シーンごとに設定するNPC。"),flags:castFlagSet(n.id,"NPC"),image:castImages[n.id]?`assets/casts/${n.id}.png`:null}))},chapters:Object.entries(CHAPTERS).map(([id,c])=>({id,title:c.name,file:c.file,scenes:id===activeChapter?chapterNodes():[]})),generatedAt:new Date().toISOString()}}
/* これはAIアシスタント用プレビューで、本番出力は mockCampaignPayload() である。 */
/* 出力の段: 章とキャンペーンの土台を組む。ここが1段目。段の並びは js/43-output-pipeline.js
   全段を通した出力は 43-output-pipeline.js が確定させる。 */
function outputBaseChapter(){const baseCampaign=JSON.parse(context?.dataFiles?.["campaign.json"]||"{}");const baseChapter=JSON.parse(context?.dataFiles?.[CHAPTERS[activeChapter].file.toLowerCase()+".json"]||"{}");const campaign={...baseCampaign,meta:{...(baseCampaign.meta||{}),title:campaignName},style:{...(baseCampaign.style||{}),world:campaignWorld}};
/* <script>ブロックごとにスコープが切れるため、constのままだと後続ブロック
   (イントロ・アウトロの出力)から参照できない。windowへ載せて共有する */
const exitRequires=window.exitRequires=(text,resolveSecretId,n=scene())=>{const raw=String(text||"").trim();if(!raw)return undefined;const parts=exitConditionParts(raw);const discoveries=(n.discoveries||[]).map((value,index)=>normalizeDiscoveryFor(n,value,index));const itemNames=new Set(items.map(item=>String(item.name||"").trim()).filter(Boolean));const resolved=parts.tokens.map((token,index)=>{const normalized=String(token||"").trim();const discovery=discoveries.find(item=>item.id===normalized||item.label===normalized);if(discovery)return {kind:"discovery",value:resolveSecretId(discovery.id)||discovery.id,join:index?parts.connectors[index-1]||"AND":null};if(itemNames.has(normalized))return {kind:"item",value:normalized,join:index?parts.connectors[index-1]||"AND":null};return null}).filter(Boolean);if(!resolved.length)return undefined;const mixed=new Set(resolved.map(item=>item.kind)).size>1;const output={};for(const kind of ["discovery","item"]){const values=resolved.filter(item=>item.kind===kind);if(!values.length)continue;const any=!mixed&&resolved.length>1&&values.every((item,index)=>index===0||item.join==="OR");const key=kind==="discovery"?(any?"secretsAny":"secretsAll"):(any?"itemsAny":"itemsAll");output[key]=[...new Set(values.map(item=>item.value))]}return output};
/* モンスター・アイテム台帳の名前をエンティティ台帳へ自動登録する(mock2の正名の原則) */
const entityNames=new Set((campaign.entities||[]).map(e=>e.ja));
const extraEntities=[...monsters.map(m=>m.name),...items.map(x=>x.name)].filter(n=>n&&!entityNames.has(n)).map(n=>({ja:n,note:"TAS台帳から自動登録"}));
if(extraEntities.length)campaign.entities=[...(campaign.entities||[]),...extraEntities];const scenes=chapterNodes().filter(n=>n.type==="scene").map((node,i)=>{const original=baseChapter.scenes?.[i]||{};const override=sceneOverrides[nodeKey(node)]||{};const merged={...original,...node,...override};
/* enemyだけは浅いコピーで潰さない。下書き(node)や画面上書き(override)が薄いenemyを持っていても、
   章データ(original)のunknownName・ambush・weakness等を落とさずに重ねる。
   ponytail: 深いマージはenemyに限定する。他のキーで同じ事故が出たらここに足す

   secrets[].text(真相)に要素名(d.label/old.entity)を代入してはならない。空欄のまま
   書き出すこと。2026-08-06の実プレイで、s3b「胸の光るもの」の真相が要素名のまま
   表示された(作者は「確定事実」欄に何も書いておらず、この既定値が空欄を埋めていた)。
   空でない文字列になるため、どの検査も異常と見なせなかった。空で出せばmock2の
   progression.test.mjs 検査17が落ちる */
const enemyLayers=[original.enemy,node.enemy,override.enemy].filter(e=>e&&typeof e==="object");
if(enemyLayers.length)merged.enemy=Object.assign({},...enemyLayers);if(Array.isArray(node.discoveries)){merged.secrets=node.discoveries.map((raw,j)=>{const d=normalizeDiscoveryFor(node,raw,j);const old=(original.secrets||[]).find(o=>o.id===d.id)||{};const fields={id:d.id||`s${node.id}_${j+1}`,entity:d.label,aliases:d.aliases,dc:d.dc||undefined,surface:d.surface,text:d.fact,trigger:d.trigger,category:d.category,importance:d.importance,appearances:d.appearances,tags:d.tags};const preserved=Object.fromEntries(["playerText","img","bg","usage"].filter(key=>Object.hasOwn(old,key)).map(key=>[key,old[key]]));const secret={};[...Object.keys(old),...Object.keys(fields),...Object.keys(preserved)].forEach(key=>{if(Object.hasOwn(fields,key))secret[key]=fields[key];else if(Object.hasOwn(preserved,key))secret[key]=preserved[key]});return secret})}
const secretIdByToken={};(merged.secrets||[]).forEach(s=>{secretIdByToken[s.id]=s.id;if(s.entity&&!secretIdByToken[s.entity])secretIdByToken[s.entity]=s.id;[...(s.tags||[]),...(s.aliases||[])].forEach(t=>{if(t&&!secretIdByToken[t])secretIdByToken[t]=s.id})});
const configuredExits=Array.isArray(merged.exits)?merged.exits.map(normalizeExit):[];
const exitSecretId=(token)=>secretIdByToken[String(token||"").trim().replace(/^(flag|discovery|item|npc|scene|battle):/i,"")];
if(configuredExits.length){
  merged.exits=configuredExits.map((x,i)=>{const e=normalizeExit(x);const requires=e.requires&&typeof e.requires==="object"?e.requires:{};const converted=requires.text?exitRequires(requires.text,exitSecretId,merged):Object.keys(requires).some(key=>key!=="text")?requires:undefined;const to=outputExitTarget(e.to);return {id:e.id||`exit_${i+1}`,match:e.match, ...(to===null?{to:null}:{to}), ...(converted&&Object.keys(converted).length?{requires:converted}:{}), ...(e.removeItems?.length?{removeItems:e.removeItems}:{}), ...(e.addItems?.length?{addItems:e.addItems}:{}), ...(e.npcSay?{npcSay:e.npcSay}:{}), ...(e.blockedText?{blockedText:e.blockedText}:{}), ...(e.text?{text:e.text}:{})}});
}
/* mock2が読まないTAS独自フィールドはauthoringキーへまとめ、mock2が安全に無視できる形で保存する */
merged.authoring={exits:merged.exits||[],dialogueRules:Array.isArray(override.dialogueRules)?override.dialogueRules.map(normalizeDialogueRule):merged.dialogueRules||[],gmSceneNotes:typeof override.gmSceneNotes==="string"?override.gmSceneNotes:merged.gmSceneNotes||""};
/* 発話ルールをmock2が実際に読む形へ変換する。
   item_grant → loot（条件が要素に対応すればrequires=secret id付き）、発言 → direction（GM演出指示）へ追記。
   directionはマーカー以降を作り直すため、再エクスポートしても重複しない */
const dlgRules=merged.authoring.dialogueRules;
const firstToken=cond=>String(cond||"").split(/\s+(?:AND|OR)\s+/i)[0]?.trim().replace(/^(flag|discovery|item|npc|scene|battle):/i,"")||"";
const lootAdd=dlgRules.filter(r=>r.eventType==="item_grant"&&r.targetId).map(r=>{const req=secretIdByToken[firstToken(r.condition)];return req?{name:r.targetId,requires:req}:r.targetId});
if(lootAdd.length){const lootName=x=>typeof x==="string"?x:x.name;merged.loot=[...(merged.loot||[]).filter(x=>!lootAdd.some(a=>lootName(a)===lootName(x))),...lootAdd]}
const DIRECTION_MARK="【TAS発話ルール】";
const baseDirection=String(merged.direction||"").split(DIRECTION_MARK)[0].trim();
const directionLines=dlgRules.filter(r=>r.line).map(r=>`${r.condition?`「${r.condition}」の開示後に`:""}${speakerLabel(r.speaker)}が「${r.line}」と伝える${r.once?"（一度だけ）":""}`);
merged.direction=directionLines.length?`${baseDirection?baseDirection+"\n":""}${DIRECTION_MARK}${directionLines.join(" / ")}`:baseDirection||merged.direction;
/* シーン敵: enemyIdを優先し、旧下書きのenemyNameへフォールバックする。enemyId:nullだけを「なし」の明示選択として扱い、未操作の既存enemyは消さない。 */
const requestedId=typeof merged.enemyId==="string"?merged.enemyId.trim():"";const requestedName=typeof merged.enemyName==="string"?merged.enemyName.trim():"";
if(merged.enemyId===null)delete merged.enemy;else{if(requestedId||requestedName){const mon=monsters.find(m=>String(m.id||m.name)===requestedId)||monsters.find(m=>m.name===requestedName);if(mon)merged.enemy={...(merged.enemy||{}),...definedEnemyFields(mon)}}const identifySecret=typeof override.identifySecret==='string'?override.identifySecret.trim():'';const revealOnDefeat=typeof override.revealOnDefeat==='string'?override.revealOnDefeat.trim():'';if(merged.enemy&&identifySecret)merged.enemy.identifySecret=identifySecret;if(merged.enemy&&revealOnDefeat)merged.enemy.revealOnDefeat=revealOnDefeat;if(merged.enemy&&typeof override.presence==='boolean')merged.enemy.presence=override.presence;if(merged.enemy&&typeof override.ambush==='boolean'){merged.enemy.ambush=override.ambush;if(override.ambush){if(override.ambushDc)merged.enemy.ambushDc=Number(override.ambushDc);if(override.ambushTrigger)merged.enemy.ambushTrigger=override.ambushTrigger}else{delete merged.enemy.ambushDc;delete merged.enemy.ambushTrigger}}}
/* merged.transitions: 画面・収集・消費のすべてで未使用と実測できたため定義側は削除した(2026-08-03)。
   過去の下書き(localStorage)には残っているので、ここで捨てる処理だけ安全網として残す */
delete merged.enemyId;delete merged.enemyName;delete merged.identifySecret;delete merged.revealOnDefeat;delete merged.presence;delete merged.ambush;delete merged.ambushDc;delete merged.ambushTrigger;delete merged.type;delete merged.index;delete merged.discoveries;delete merged.transitions;delete merged.dialogueRules;delete merged.gmSceneNotes;return merged});const chapter={...baseChapter,title:baseChapter.title||CHAPTERS[activeChapter].name,scenes};
const opening=chapterNodes().find(n=>n.type==="opening")||{};
const ending=chapterNodes().find(n=>n.type==="ending")||{};
const openingOverride=sceneOverrides[nodeKey({type:"opening",id:"opening"})]||{};
const endingOverride=sceneOverrides[nodeKey({type:"ending",id:"ending"})]||{};
/* イントロ・アウトロは、元データ(chapter)の上に画面の入力だけを重ねる。
   以前は「作者が書いたか」を brief と既定文言の文字列比較で判定し、真ならノードを
   丸ごと作り直していた。そのため画面で設定していない項目が黙って消え、実際に
   アウトロの背景が失われた(2026-07-30)。既定文言を変えるだけで判定が壊れる形でもあった。
   画面の入力は sceneOverrides / sceneBackgrounds / castImages にしか無いので、
   「作者が触ったか」はそこだけで判定し、値は元データへ重ねる。 */
const terminalNodeOutput=(baseValue,fallbackId,node,override,interludeOverride)=>{
  const img=runtimeImageName(sceneBackgrounds[nodeKey(node)]);
  const npcId=(override.npcs||[])[0];
  const brief=String(override.brief||"").trim();
  const greeting=String(override.greeting||"").trim();
  const hintChips=Array.isArray(override.hintChips)?override.hintChips.filter(Boolean):[];
  const touched=[brief,img,npcId,override.name,override.blockedText,greeting,hintChips.length,(override.exits||[]).length].some(Boolean);
  /* 幕間は作者がトグルに触ったときだけ出す。触っていない章の intro は文字列のまま返し、契約を変えない。 */
  const raw=interludeOverride;
  const interlude=raw&&typeof raw==="object"?{enabled:Boolean(raw.enabled),text:typeof raw.text==="string"?raw.text:""}:null;
  if(!touched&&!interlude)return baseValue;
  const base=baseValue&&typeof baseValue==="object"?baseValue:{brief:typeof baseValue==="string"?baseValue:""};
  if(!touched)return {...base,...(interlude?{interlude}:{})};
  const npcSprite=runtimeImageName(castImages[npcId]);
  const exits=(node.exits||[]).map((x,i)=>{const e=normalizeExit(x);const converted=outputExitRequires(e.requires,()=>undefined,node);const to=outputExitTarget(e.to);return {id:e.id||`exit_${i+1}`,match:e.match,...(to===null?{to:null}:{to}),...(converted&&Object.keys(converted).length?{requires:converted}:{}),...(e.removeItems?.length?{removeItems:e.removeItems}:{}),...(e.addItems?.length?{addItems:e.addItems}:{}),...(e.npcSay?{npcSay:e.npcSay}:{}),...(e.blockedText?{blockedText:e.blockedText}:{}),...(e.text?{text:e.text}:{})}});
  return {id:base.id||fallbackId,name:override.name||base.name||node.name,...base,...(brief?{brief}:{}),...(img?{img}:{}),...(npcSprite?{npcSprite}:{}),...(npcId?{npc:{id:npcId,name:castName(npcId)}}:{}),...(node.blockedText?{blockedText:node.blockedText}:{}),...(exits.length?{exits}:{}),...(interlude?{interlude}:{}),...(greeting?{greeting}:{}),...(hintChips.length?{hintChips}:{})};
};
chapter.intro=terminalNodeOutput(chapter.intro,"ch1_intro",opening,openingOverride,chapterInterludes[activeChapter]?.opening);
chapter.ending=terminalNodeOutput(chapter.ending,"ch1_ending",ending,endingOverride,chapterInterludes[activeChapter]?.ending);
return {campaign,chapter,chapterFile:`${CHAPTERS[activeChapter].file.toLowerCase()}.json`}}
