const normalizeTransition=t=>({conditionType:(t.conditionType||t.type)==="secret"?"discovery":t.conditionType||t.type||"flag",conditionValue:t.conditionValue??t.value??t.condition??"",target:t.target||""});
const slugifyKeyPart=(value,fallback)=>String(value||"").normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"")||fallback;
const discoveryKeyPrefixFor=n=>`${activeChapter}_${n?.type==="scene"?`s${n.id}`:slugifyKeyPart(n?.type,"section")}`;
const discoveryKey=(value,index,n=scene())=>`${discoveryKeyPrefixFor(n)}_${slugifyKeyPart(value,`item_${index+1}`)}`;
const parseList=value=>Array.isArray(value)?value.map(v=>String(v).trim()).filter(Boolean):String(value||"").split(",").map(v=>v.trim()).filter(Boolean);
const joinList=value=>parseList(value).join(", ");
const categoryLabel=value=>DISCOVERY_CATEGORIES.find(([id])=>id===value)?.[1]||"未分類";
const importanceLabel=value=>DISCOVERY_IMPORTANCE.find(([id])=>id===value)?.[1]||"未設定";
const discoveryOrdinalLabel=(id,index)=>{const match=String(id||"").trim().match(/([a-z])$/i);return `${(match?.[1]||String.fromCharCode(97+index)).toLowerCase()}.`};
const discoveryTemplate=(template,index,n=scene())=>{const label=template.label||`調査対象${index+1}`;return normalizeDiscoveryFor(n,{...template,label,id:discoveryKey(label,index,n)},index)};
const speakerLabel=value=>DIALOGUE_SPEAKERS.find(([id])=>id===value)?.[1]||"話者未設定";
const eventLabel=value=>DIALOGUE_EVENTS.find(([id])=>id===value)?.[1]||"イベントなし";
const dialogueEventMeta=eventType=>({
  "":{label:"対象",placeholder:"なし",mode:"none"},
  flag_add:{label:"付与するフラグ",placeholder:"例：封鎖の木柵調査済",mode:"flag"},
  flag_set:{label:"設定するフラグと値",placeholder:"例：guardian_fate=対話",mode:"text"},
  item_grant:{label:"付与するアイテム",placeholder:"例：old_bag",mode:"text"},
  npc_join:{label:"参加するNPC",placeholder:"例：npc_1",mode:"npc"},
  scene_unlock:{label:"解放するシーン",placeholder:"例：scene:4",mode:"scene"},
  battle_start:{label:"開始するバトル",placeholder:"例：battle_mine_guard",mode:"text"},
  discovery_reveal:{label:"開示する要素",placeholder:"例：s2a",mode:"discovery"}
}[eventType]||{label:"対象",placeholder:"例：target_id",mode:"text"});
const eventTargetOptions=(eventType,n=scene())=>{const discoveries=(n.discoveries||[]).map((value,index)=>normalizeDiscoveryFor(n,value,index));const flags=[...new Set(discoveries.flatMap(x=>x.tags).filter(Boolean))];if(eventType==="flag_add")return flags.map(value=>({value,label:value}));if(eventType==="item_grant")return items.filter(x=>x.name).map(x=>({value:x.name,label:x.name}));if(eventType==="npc_join")return npcList().map(npc=>({value:npc.id,label:npc.name}));if(eventType==="scene_unlock")return sceneTargets().map(target=>({value:sceneRef(target),label:sceneRefLabel(target)}));if(eventType==="discovery_reveal")return discoveries.map(x=>({value:x.id,label:`${discoveryOrdinalLabel(x.id,discoveries.indexOf(x))} ${x.label}`}));return []};
const normalizeDialogueRule=(value,index)=>{const rule=value&&typeof value==="object"?value:{};return {id:rule.id||`rule_${index+1}`,speaker:rule.speaker||"gm",condition:rule.condition||"",priority:rule.priority||"medium",line:rule.line||"",eventType:rule.eventType||"",targetId:rule.targetId??rule.eventValue??"",targetLabel:rule.targetLabel||"",eventNotes:rule.eventNotes||"",once:rule.once!==false,hiddenUntilTriggered:Boolean(rule.hiddenUntilTriggered)}}; 
const normalizeDiscoveryFor=(n,value,index)=>{if(value&&typeof value==="object"){const label=value.label??value.name??value.entity??value.id??`調査対象${index+1}`;return {id:value.id||discoveryKey(label,index,n),label,category:value.category||"object",importance:value.importance||"support",appearances:parseList(value.appearances||value.sources||[]),surface:value.surface??value.summary??"",trigger:value.trigger??value.condition??value.revealCondition??"",fact:value.fact??value.text??"",tags:parseList(value.tags||value.flags||[]),aliases:parseList(value.aliases||[]),dc:Number(value.dc)||0};}const label=String(value??`調査対象${index+1}`);return {id:discoveryKey(label,index,n),label,category:"object",importance:"support",appearances:[],surface:"",trigger:"",fact:"",tags:[],aliases:[],dc:0};};
const normalizeDiscovery=(value,index)=>normalizeDiscoveryFor(scene(),value,index);
const defaultCastProfile=(id,fallback)=>({gm:"ゲームマスター。確定した結果を説明し、プレイヤーを案内する。",gareth:"普通の戦士・用心棒。短く実用的に話す。"}[id]||fallback);
const castAttribute=(id)=>{const value=castAttributes[id]||{};const addressTerm=String(value.addressTerm||value.addressing||"");return {gender:value.gender||"unspecified",firstPerson:String(value.firstPerson||""),addressTerm};};
const castGenderLabel=id=>CAST_GENDERS.find(x=>x[0]===id)?.[1]||"未設定";
const defaultCastFlags=(id,role)=>role==="GM"||id==="gareth"?{chat:true,propose:true,act:false,mutate:false}:{chat:false,propose:false,act:false,mutate:false};
const castName=(id,fallback)=>castNames[id]||fallback;
const castProfile=(id,fallback)=>castProfiles[id]||defaultCastProfile(id,fallback);
const castFlagSet=(id,role)=>({...defaultCastFlags(id,role),...(castFlags[id]||{})});
const npcList=()=>Array.from({length:npcCount},(_,i)=>({id:`npc_${i+1}`,name:castName(`npc_${i+1}`,`NPC${i+1}`)}));
const isLocalFile=()=>location.protocol==="file:";
