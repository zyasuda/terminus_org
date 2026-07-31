
/* 重要語・概念と物理アイテムを分離し、既存campaign/chapterデータをTASの入力へ移行する。 */
let concepts=[];
let initialInventoryIds=[];
const CONCEPT_SCOPES=[['campaign','キャンペーン全体'],['chapter','チャプター内'],['scene','シーン内']];
const CONCEPT_ROLES=[['main','メインストーリー'],['support','補助設定'],['ambient','雰囲気・背景'],['unrelated','物語とは無関係']];
const CONCEPT_USAGES=[['dialogue_only','会話・発話のみ'],['dialogue_condition','会話・条件に使用'],['broad','会話・条件・行動に使用']];
const ITEM_SCOPES=[['campaign','キャンペーン全体'],['scene','シーンで登場']];
const ITEM_ACQUISITIONS=[['starting_inventory','初期所持'],['scene','シーンで入手'],['dialogue','会話イベントで付与'],['none','入手方法未設定']];
const ITEM_CAPABILITIES=[['inspect','調べる'],['take','入手する'],['use','使う'],['give','渡す'],['lose','紛失する']];
function sourceJson(file){try{return JSON.parse(context?.dataFiles?.[file]||'{}')}catch(e){return {}}}
function conceptId(name,index=0){const known={'心石':'concept_heartstone'};return known[name]||stableId(name,`concept_${index+1}`)}
function normalizeConcept(value,index=0){const x=value&&typeof value==='object'?value:{};const name=String(x.name||x.ja||`重要語${index+1}`);return {id:name==='心石'?conceptId(name,index):(x.id||conceptId(name,index)),name,aliases:parseList(x.aliases||[]),scope:x.scope||'campaign',role:x.role||x.narrativeRole||'support',usage:x.usage||'dialogue_condition',storyKey:x.storyKey!==false,surface:x.surface||'',truth:x.truth||x.text||''}}
function conceptLabels(){return ensureConcepts().map(x=>({value:x.id,label:x.name}))}
function ensureConcepts(){
  if(concepts.length)return concepts;
  const base=sourceJson('campaign.json');
  const candidates=(base.entities||[]).filter(x=>x&&((x.ja||x.name)==='心石'||String(x.kind||'').match(/概念|伝承|重要語/)));
  concepts=candidates.map((x,i)=>normalizeConcept({id:x.id||conceptId(x.ja||x.name,i),name:x.ja||x.name,aliases:x.aliases||[],scope:'campaign',role:(x.ja||x.name)==='心石'?'main':'support',usage:(x.ja||x.name)==='心石'?'dialogue_condition':'dialogue_only',storyKey:(x.ja||x.name)==='心石',surface:x.surface,truth:x.truth||x.visual},i));
  return concepts;
}
function itemId(name,index=0){const known={'心石の欠片':'item_heartstone_fragment','ランタン':'item_lantern','ロープ':'item_rope','ナイフ':'item_knife'};return known[name]||stableId(name,`item_${index+1}`)}
function legacyItemCandidates(){
  const base=sourceJson('campaign.json');
  const candidates=[];
  /* 現行の campaign.json は所持品を items[] で持つ。ここが旧形式(entities の kind に「所持品」)
     しか見ていなかったため、下書きにアイテムが無い状態で出力すると開始所持品が消えた。
     台帳の内部項目名は notes / image なので、出力形式の surface / visual から読み替える。
     entities より先に積むのは、同名があればこちら(情報量の多い側)を採るため。 */
  (base.items||[]).forEach(x=>{const name=x&&(x.ja||x.name);if(!name)return;candidates.push({...x,name,notes:x.notes??x.surface??'',image:x.image??x.visual??''})});
  (base.entities||[]).filter(x=>x&&String(x.kind||'').includes('所持品')).forEach(x=>candidates.push({id:x.id||itemId(x.ja||x.name,candidates.length),name:x.ja||x.name,scope:'campaign',acquisition:'starting_inventory',persistent:true,capabilities:['inspect','use','give','lose'],notes:x.surface||x.visual||''}));
  const chapterFiles=['chapter_01.json','chapter_02.json'];
  chapterFiles.forEach(file=>{const chapter=sourceJson(file);(chapter.scenes||[]).forEach(sceneData=>(sceneData.loot||[]).forEach(raw=>{const loot=typeof raw==='string'?{name:raw}:raw||{};if(!loot.name)return;const concept=ensureConcepts().find(x=>loot.name.includes(x.name)||x.name.includes(loot.name));candidates.push({id:itemId(loot.name,candidates.length),name:loot.name,parentConceptId:concept?.id||'',aliases:concept?[concept.name,...concept.aliases]:[],scope:'scene',acquisition:'scene',persistent:false,requires:loot.requires||'',capabilities:['inspect','take','give','lose','use'],notes:'シーン入手品'})}))});
  return candidates;
}
function ensureItems(){
  if(freshCampaign)return items;
  const additions=legacyItemCandidates();
  const byName=new Map(items.filter(x=>x&&x.name).map(x=>[x.name,x]));
  additions.forEach((x)=>{if(!byName.has(x.name))byName.set(x.name,x)});
  items=Array.from(byName.values()).map((x,i)=>{const conceptsNow=ensureConcepts();const concept=conceptsNow.find(c=>c.id===x.parentConceptId)||conceptsNow.find(c=>x.name&&x.name.includes(c.name));const aliases=parseList(x.aliases||[]);const mergedAliases=concept?[...new Set([...aliases,concept.name,...concept.aliases])]:aliases;const knownId=itemId(x.name,i);return {...x,id:(['心石の欠片','ランタン','ロープ','ナイフ'].includes(x.name)?knownId:(x.id||knownId)),parentConceptId:concept?.id||'',aliases:mergedAliases,capabilities:Array.isArray(x.capabilities)&&x.capabilities.length?x.capabilities:['inspect']}});
  items.forEach(x=>{if(x.acquisition==='starting_inventory'&&!initialInventoryIds.includes(x.id))initialInventoryIds.push(x.id)});
  return items;
}
function conceptScopeLabel(id){return CONCEPT_SCOPES.find(x=>x[0]===id)?.[1]||id}
function conceptRoleLabel(id){return CONCEPT_ROLES.find(x=>x[0]===id)?.[1]||id}
function conceptUsageLabel(id){return CONCEPT_USAGES.find(x=>x[0]===id)?.[1]||id}
function itemScopeLabel(id){return ITEM_SCOPES.find(x=>x[0]===id)?.[1]||id}
function itemAcquisitionLabel(id){return ITEM_ACQUISITIONS.find(x=>x[0]===id)?.[1]||id}
function renderConcepts(){
  const list=ensureConcepts();
  const index=sectionIndex('重要語・概念一覧',list.map((x,i)=>({id:String(i),name:x.name,meta:`${conceptScopeLabel(x.scope)}・${conceptRoleLabel(x.role)}`})),'重要語・概念はまだありません。');
  const cards=list.map((x,i)=>`<div class="card concept-editor" data-concept-index="${i}"><div class="card-head"><h3>${escapeHtml(x.name||`重要語${i+1}`)}</h3><button class="sub delete-btn" data-remove-concept="${i}">削除</button></div><div class="semantic-grid"><div class="field"><label>正式名</label><input class="concept-name" data-concept-index="${i}" value="${escapeHtml(x.name)}" placeholder="心石"></div><div class="field"><label>別名（カンマ区切り）</label><input class="concept-aliases" data-concept-index="${i}" value="${escapeHtml(x.aliases.join(', '))}" placeholder="青い石"></div><div class="field"><label>使用範囲</label><select class="concept-scope" data-concept-index="${i}">${CONCEPT_SCOPES.map(([id,label])=>`<option value="${id}" ${x.scope===id?'selected':''}>${label}</option>`).join('')}</select></div><div class="field"><label>物語上の関係</label><select class="concept-role" data-concept-index="${i}">${CONCEPT_ROLES.map(([id,label])=>`<option value="${id}" ${x.role===id?'selected':''}>${label}</option>`).join('')}</select></div><div class="field"><label>使用方法</label><select class="concept-usage" data-concept-index="${i}">${CONCEPT_USAGES.map(([id,label])=>`<option value="${id}" ${x.usage===id?'selected':''}>${label}</option>`).join('')}</select></div><div class="field"><label>ストーリーキー</label><label class="check-row"><input type="checkbox" class="concept-story-key" data-concept-index="${i}" ${x.storyKey?'checked':''}>会話・条件のキーとして扱う</label></div><div class="field span-2"><label>表層説明</label><textarea class="concept-surface" data-concept-index="${i}" placeholder="プレイヤーが見聞きできる情報">${escapeHtml(x.surface)}</textarea></div><div class="field span-2"><label>確定情報</label><textarea class="concept-truth" data-concept-index="${i}" placeholder="開示後に扱う情報">${escapeHtml(x.truth)}</textarea></div></div></div>`).join('');
  return `<h2>重要語・物語概念</h2><p class="hint">キャンペーン全体の会話語、伝承、固有概念、メインストーリーのキーを登録します。ここに登録しても物理アイテムの所持状態は変わりません。</p>${index}${cards||'<div class="empty-card">重要語・概念はまだありません。</div>'}<div class="bottom"><button class="sub" id="btnAddConcept">＋ 重要語を追加</button></div>`;
}
function bindConcepts(){
  const sync=()=>{concepts=Array.from(document.querySelectorAll('.concept-editor')).map((card,i)=>{const get=s=>card.querySelector(s)?.value.trim()||'';return {...concepts[i],id:concepts[i]?.id||conceptId(get('.concept-name'),i),name:get('.concept-name'),aliases:parseList(get('.concept-aliases')),scope:get('.concept-scope')||'campaign',role:get('.concept-role')||'support',usage:get('.concept-usage')||'dialogue_condition',storyKey:Boolean(card.querySelector('.concept-story-key')?.checked),surface:get('.concept-surface'),truth:get('.concept-truth')}});saveWorkspaceDraft(true)};
  document.querySelectorAll('.concept-name,.concept-aliases,.concept-scope,.concept-role,.concept-usage,.concept-story-key,.concept-surface,.concept-truth').forEach(el=>{el.oninput=sync;el.onchange=sync});
  document.querySelectorAll('[data-remove-concept]').forEach(btn=>btn.onclick=()=>{const i=Number(btn.dataset.removeConcept);concepts=concepts.filter((_,j)=>j!==i);saveWorkspaceDraft(true);renderTab()});
  const add=$('btnAddConcept');if(add)add.onclick=()=>{concepts=[...ensureConcepts(),{id:conceptId('新しい重要語',concepts.length),name:'新しい重要語',aliases:[],scope:'campaign',role:'support',usage:'dialogue_condition',storyKey:false,surface:'',truth:''}];saveWorkspaceDraft(true);renderTab()};
  document.querySelectorAll('[data-section-focus]').forEach(button=>button.onclick=()=>{const i=Number(button.dataset.sectionFocus);document.querySelector(`.concept-editor[data-concept-index="${i}"]`)?.scrollIntoView({behavior:'smooth',block:'center'})});
}
function renderSemanticItemCard(x,i){const caps=Array.isArray(x.capabilities)&&x.capabilities.length?x.capabilities:['inspect'];return `<div class="card item-editor" data-item-index="${i}"><div class="card-head"><h3 data-item-title="${i}">${escapeHtml(x.name||`アイテム${i+1}`)}</h3><button class="sub delete-btn" data-remove-item="${i}">削除</button></div><div class="cast-media"><div class="cast-thumb">${x.image?`<img src="${x.image}">`:'画像なし'}</div><div class="field cast-file"><label>画像</label><input type="file" accept="image/*" class="item-image" data-item-index="${i}"></div></div><div class="semantic-grid"><div class="field span-2"><label>正式名</label><input class="item-name" data-item-index="${i}" value="${escapeHtml(x.name||'')}" placeholder="心石の欠片"></div><div class="field"><label>親となる概念</label><select class="item-parent-concept" data-item-index="${i}"><option value="">なし</option>${conceptLabels().map(o=>`<option value="${o.value}" ${x.parentConceptId===o.value?'selected':''}>${escapeHtml(o.label)}</option>`).join('')}</select></div><div class="field"><label>使用範囲</label><select class="item-scope" data-item-index="${i}">${ITEM_SCOPES.map(([id,label])=>`<option value="${id}" ${x.scope===id?'selected':''}>${label}</option>`).join('')}</select></div><div class="field"><label>入手方法</label><select class="item-acquisition" data-item-index="${i}">${ITEM_ACQUISITIONS.map(([id,label])=>`<option value="${id}" ${x.acquisition===id?'selected':''}>${label}</option>`).join('')}</select></div><div class="field"><label>キャンペーン中の扱い</label><label class="check-row"><input type="checkbox" class="item-persistent" data-item-index="${i}" ${x.persistent?'checked':''}>シーンをまたいで使う</label></div><div class="field span-2"><label>可能な操作</label><div class="semantic-checks">${ITEM_CAPABILITIES.map(([id,label])=>`<label class="check-row"><input type="checkbox" class="item-capability" data-item-index="${i}" value="${id}" ${caps.includes(id)?'checked':''}>${label}</label>`).join('')}</div></div><div class="field span-2"><label>別名（カンマ区切り）</label><input class="item-aliases" data-item-index="${i}" value="${escapeHtml((x.aliases||[]).join(', '))}" placeholder="心石、青い石"></div><div class="field span-2"><label>説明・メモ</label><textarea class="item-notes" data-item-index="${i}" placeholder="第三坑道の錠に合う。">${escapeHtml(x.notes||'')}</textarea></div><div class="field"><label>入手条件キー（任意）</label><input class="item-requires" data-item-index="${i}" value="${escapeHtml(x.requires||'')}" placeholder="s3b"></div></div></div>`}
var baseRenderItemsForSemantic=renderItems;
renderItems=function(){ensureItems();const list=items;const index=sectionIndex('アイテム一覧',list.map((x,i)=>({id:String(i),name:x.name||`アイテム${i+1}`,meta:`${itemScopeLabel(x.scope||'scene')}・${itemAcquisitionLabel(x.acquisition||'none')}`})),'アイテムはまだありません。');return `<h2>アイテム</h2><p class="hint">物理的に存在し、入手・所持・使用・譲渡・紛失できるものを登録します。会話上の概念は「重要語・物語概念」で管理します。</p>${index}${list.map(renderSemanticItemCard).join('')||'<div class="empty-card">アイテムはまだありません。</div>'}<div class="bottom"><button class="sub" id="btnAddItem">＋ アイテムを追加</button></div>`};
var baseBindItemsForSemantic=bindItems;
bindItems=function(){
  ensureItems();
  baseBindItemsForSemantic();
  const sync=()=>{items=Array.from(document.querySelectorAll('.item-editor')).map((card,i)=>{const get=s=>card.querySelector(s)?.value.trim()||'';return {...items[i],id:items[i]?.id||itemId(get('.item-name'),i),name:get('.item-name'),parentConceptId:get('.item-parent-concept'),scope:get('.item-scope')||'scene',acquisition:get('.item-acquisition')||'none',persistent:Boolean(card.querySelector('.item-persistent')?.checked),capabilities:Array.from(card.querySelectorAll('.item-capability:checked')).map(x=>x.value),aliases:parseList(get('.item-aliases')),notes:get('.item-notes'),requires:get('.item-requires')}});initialInventoryIds=items.filter(x=>x.acquisition==='starting_inventory').map(x=>x.id);saveWorkspaceDraft(true)};
  document.querySelectorAll('.item-name,.item-parent-concept,.item-scope,.item-acquisition,.item-persistent,.item-capability,.item-aliases,.item-notes,.item-requires').forEach(el=>{el.oninput=sync;el.onchange=sync});
  document.querySelectorAll('[data-section-focus]').forEach(button=>button.onclick=()=>{const i=Number(button.dataset.sectionFocus);document.querySelector(`.item-editor[data-item-index="${i}"]`)?.scrollIntoView({behavior:'smooth',block:'center'})});
}
var baseWorkspaceDraftForSemantics=workspaceDraft;
workspaceDraft=function(){ensureConcepts();ensureItems();return {...baseWorkspaceDraftForSemantics(),concepts,initialInventory:items.filter(x=>x.acquisition==='starting_inventory').map(x=>x.id)}};
var baseApplyWorkspaceDraftForSemantics=applyWorkspaceDraft;
applyWorkspaceDraft=function(data){baseApplyWorkspaceDraftForSemantics(data);if(Array.isArray(data.concepts))concepts=data.concepts.map(normalizeConcept);if(Array.isArray(data.initialInventory))initialInventoryIds=data.initialInventory.map(String);};
try{const rawSemanticDraft=localStorage.getItem(DRAFT_KEY);if(rawSemanticDraft){const parsed=JSON.parse(rawSemanticDraft);const data=parsed.data||parsed;if(Array.isArray(data.concepts))concepts=data.concepts.map(normalizeConcept);if(Array.isArray(data.initialInventory))initialInventoryIds=data.initialInventory.map(String)}}catch(e){}
var baseCreateNewCampaignForSemantics=createNewCampaign;
createNewCampaign=function(){concepts=[];initialInventoryIds=[];baseCreateNewCampaignForSemantics()};
var baseRenderScenesForConcepts=renderScenes;
renderScenes=function(){if(activeTab==='entities')activeTab='world';baseRenderScenesForConcepts()};
var baseRenderTabForConcepts=renderTab;
renderTab=function(){if(activeTab==='concepts'){const c=$('tabContent');c.innerHTML=renderConcepts();bindConcepts();return}baseRenderTabForConcepts()};
var baseRenderRightPanelForConcepts=renderRightPanel;
renderRightPanel=function(){baseRenderRightPanelForConcepts();if(activeTab==='concepts'){const target=$('rightBody')?.querySelector('.right-section p');if(target)target.textContent='キャンペーン／重要語・物語概念'}};
var baseRenderAllForSemantics=renderAll;
renderAll=function(){ensureConcepts();ensureItems();baseRenderAllForSemantics()};

/* 出力の段: campaign.concepts / items / initialInventory を作る。段の並びは js/43-output-pipeline.js */
function outputConceptsItems(payload){ensureConcepts();ensureItems();const campaign={...(payload.campaign||{})};const conceptsOut=concepts.map(x=>({id:x.id,ja:x.name,aliases:x.aliases,kind:'concept',role:x.role,usage:x.usage,scope:x.scope,storyKey:x.storyKey,surface:x.surface,truth:x.truth}));const itemsOut=items.filter(x=>x.name).map(x=>({id:x.id,ja:x.name,aliases:x.aliases||[],kind:'item',parentConceptId:x.parentConceptId||null,scope:x.scope||'scene',acquisition:x.acquisition||'none',persistent:Boolean(x.persistent),capabilities:x.capabilities||['inspect'],requires:x.requires||'',surface:x.notes||'',visual:x.image||''}));const existing=Array.isArray(campaign.entities)?campaign.entities:[];const byName=new Map(existing.filter(x=>x&&(x.ja||x.name)).map(x=>[x.ja||x.name,x]));conceptsOut.forEach(x=>byName.set(x.ja,x));itemsOut.forEach(x=>byName.set(x.ja,x));return {...payload,campaign:{...campaign,concepts:conceptsOut,items:itemsOut,initialInventory:items.filter(x=>x.name&&x.acquisition==='starting_inventory').map(x=>x.name),initialInventoryIds:items.filter(x=>x.name&&x.acquisition==='starting_inventory').map(x=>x.id),entities:Array.from(byName.values())}}};
