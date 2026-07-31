
/* 敵データ解決の堅牢化: 台帳に無い参照で既存enemyを失わず、契約項目を台帳から編集する。 */
function monsterTextValue(monster,key){return typeof monster?.[key]==='string'?monster[key]:''}
function monsterNumberValue(monster,key,fallback=''){const value=Number(monster?.[key]);return Number.isFinite(value)&&value>0?value:fallback}
function monsterWeaknessValue(monster){const weakness=monster?.weakness&&typeof monster.weakness==='object'?monster.weakness:{};return {triggers:Array.isArray(weakness.triggers)?weakness.triggers:[],effect:weakness.effect==='stun'?'stun':'flee',text:typeof weakness.text==='string'?weakness.text:'',hint:typeof weakness.hint==='string'?weakness.hint:''}}
function monsterDefinedText(target,key,value){const text=String(value||'').trim();if(text)target[key]=text}
function definedEnemyFields(monster){
  const patch={name:String(monster?.name||'').trim()};
  /* presence/ambush/ambushTriggerはモンスタータブでは編集できなくなったが、
     encounters[].enemyはシーン単位の上書きを持たず、この関数の戻り値だけが
     唯一の情報源のため、ここでのフォールバックとしては残す。
     scenes[].enemy側は01i-output.jsでシーンの上書きが後から優先して重なる */
  ['unknownName','surface','trait','ambushTrigger'].forEach(key=>monsterDefinedText(patch,key,monster?.[key]));
  if(!patch.trait)monsterDefinedText(patch,'trait',monster?.notes);
  ['hp','maxHp','atk','defenseDc','fleeDc','agility','ambushDc'].forEach(key=>{const value=Number(monster?.[key]);if(Number.isFinite(value)&&value>0)patch[key]=value});
  if(patch.hp&&!patch.maxHp)patch.maxHp=patch.hp;
  ['ambush','presence'].forEach(key=>{if(Object.prototype.hasOwnProperty.call(monster||{},key))patch[key]=Boolean(monster[key])});
  const weakness=monsterWeaknessValue(monster);if(weakness.triggers.length||weakness.text||weakness.hint)patch.weakness={...weakness,triggers:weakness.triggers.filter(Boolean)};
  const sprite=runtimeImageName(monster?.image);if(sprite)patch.sprite=sprite;
  return patch;
}
function monsterContractCard(monster,index){
  const weakness=monsterWeaknessValue(monster),hp=monsterNumberValue(monster,'hp',10),maxHp=monsterNumberValue(monster,'maxHp',hp),input=(label,key,value,attrs='')=>`<div class="field"><label>${label}</label><input class="monster-${key}" data-monster-index="${index}" value="${escapeHtml(value)}" ${attrs}></div>`,area=(label,key,value,attrs='')=>`<div class="field span-2"><label>${label}</label><textarea class="monster-${key}" data-monster-index="${index}" ${attrs}>${escapeHtml(value)}</textarea></div>`;
  return `<div class="card monster-contract-card" data-monster-contract-index="${index}"><div class="card-head"><h3 data-monster-title="${index}">${escapeHtml(monster.name||`モンスター${index+1}`)}</h3><button class="sub delete-btn" data-remove-monster="${index}">削除</button></div><div class="cast-media"><div class="cast-thumb">${monster.image?`<img src="${escapeHtml(monster.image)}">`:'画像なし'}</div><div class="field cast-file"><label>画像</label><input type="file" accept="image/*" class="monster-image" data-monster-index="${index}"></div></div><div class="monster-basic-grid">${input('名前','name',monster.name||'',`placeholder="錆喰い"`)}${input('HP','hp',hp,`type="number" min="1"`)}${input('最大HP','max-hp',maxHp,`type="number" min="1"`)}</div><details class="monster-contract-details"><summary>戦闘・演出の詳細設定</summary><p class="hint">空欄の項目は、すでに章にある敵データを上書きしません。未識別時の演出や弱点もここで確認・編集できます。</p><div class="monster-contract-grid">${input('未識別時の表示名','unknown-name',monsterTextValue(monster,'unknownName'),`placeholder="不気味な影"`)}${input('行動順（敏捷）','agility',monsterNumberValue(monster,'agility',''),`type="number" min="1" placeholder="例：8"`)}${area('未識別時の外見描写','surface',monsterTextValue(monster,'surface'),`placeholder="正体が分かる前に見聞きする姿・音・気配"`)}${area('正体判明後の特徴・行動指針','trait',monsterTextValue(monster,'trait')||monsterTextValue(monster,'notes'),`placeholder="正体が分かった後の特徴、行動、演出上の注意"`)}${input('攻撃力','atk',monsterNumberValue(monster,'atk',''),`type="number" min="1" placeholder="例：1"`)}${input('防御難易度','defense-dc',monsterNumberValue(monster,'defenseDc',''),`type="number" min="1" placeholder="例：12"`)}${input('離脱難易度','flee-dc',monsterNumberValue(monster,'fleeDc',''),`type="number" min="1" placeholder="例：10"`)}</div><div class="section-divider"><h4>弱点</h4></div><div class="weakness-grid">${input('弱点として反応する語句（カンマ区切り）','weakness-triggers',weakness.triggers.join(', '),`placeholder="例：ランタン, 光, 照らす"`)}<div class="field"><label>効果</label><select class="monster-weakness-effect" data-monster-index="${index}"><option value="flee" ${weakness.effect==='flee'?'selected':''}>退散する</option><option value="stun" ${weakness.effect==='stun'?'selected':''}>ひるむ</option></select></div>${input('仲間が出すヒント（任意）','weakness-hint',weakness.hint,`placeholder="例：光を嫌っているようだ"`)}${area('弱点が成功した時の説明','weakness-text',weakness.text,`placeholder="例：光を浴びた錆喰いは坑道の奥へ退いていった"`)}</div></details></div>`;
}
var baseRenderMonstersForEnemyContract=renderMonsters;
renderMonsters=function(){const holder=document.createElement('div');holder.innerHTML=baseRenderMonstersForEnemyContract();holder.querySelectorAll('[data-monster-title]').forEach(title=>{const index=Number(title.dataset.monsterTitle);title.closest('.card')?.replaceWith(document.createRange().createContextualFragment(monsterContractCard(monsters[index]||{},index)))});return holder.innerHTML};
function monsterFieldValue(card,selector){return card.querySelector(selector)?.value.trim()||''}
function monsterNumberField(card,selector){const value=Number(card.querySelector(selector)?.value);return Number.isFinite(value)&&value>0?value:undefined}
function monsterOptional(target,key,value){if(value!==undefined&&value!==''&&!(Array.isArray(value)&&!value.length))target[key]=value;else delete target[key]}
function collectMonsterContract(card,index){const old=monsters[index]||{};const next={...old,id:old.id||`monster_${index+1}`,name:monsterFieldValue(card,'.monster-name'),hp:monsterNumberField(card,'.monster-hp')||Number(old.hp)||10,maxHp:monsterNumberField(card,'.monster-max-hp')||monsterNumberField(card,'.monster-hp')||Number(old.maxHp)||Number(old.hp)||10};monsterOptional(next,'unknownName',monsterFieldValue(card,'.monster-unknown-name'));monsterOptional(next,'surface',monsterFieldValue(card,'.monster-surface'));monsterOptional(next,'trait',monsterFieldValue(card,'.monster-trait'));monsterOptional(next,'agility',monsterNumberField(card,'.monster-agility'));monsterOptional(next,'atk',monsterNumberField(card,'.monster-atk'));monsterOptional(next,'defenseDc',monsterNumberField(card,'.monster-defense-dc'));monsterOptional(next,'fleeDc',monsterNumberField(card,'.monster-flee-dc'));const triggers=monsterFieldValue(card,'.monster-weakness-triggers').split(',').map(value=>value.trim()).filter(Boolean);const weakness={triggers,effect:card.querySelector('.monster-weakness-effect')?.value==='stun'?'stun':'flee',text:monsterFieldValue(card,'.monster-weakness-text'),hint:monsterFieldValue(card,'.monster-weakness-hint')};if(weakness.triggers.length||weakness.text||weakness.hint)next.weakness=weakness;else delete next.weakness;delete next.presence;delete next.ambush;delete next.ambushDc;delete next.ambushTrigger;delete next.notes;return next}
var baseBindMonstersForEnemyContract=bindMonsters;
bindMonsters=function(){baseBindMonstersForEnemyContract();const sync=()=>{const cards=Array.from(document.querySelectorAll('.monster-contract-card'));monsters=cards.map((card,index)=>collectMonsterContract(card,index));document.querySelectorAll('[data-monster-title]').forEach(title=>{const index=Number(title.dataset.monsterTitle);title.textContent=monsters[index]?.name||`モンスター${index+1}`});saveWorkspaceDraft(true);renderRightPanel();renderValidation()};document.querySelectorAll('.monster-contract-card input:not(.monster-image),.monster-contract-card select,.monster-contract-card textarea').forEach(input=>{input.oninput=sync;input.onchange=sync})};

/* 旧下書きのモンスター側設定を、使用シーンごとの上書きへ一度だけ移す。 */
function migrateIdentifyRevealToScenes(){
  if(migrateIdentifyRevealToScenes._done)return;
  /* このファイル(40番)は、ensureMonsters()を定義する46番より先に読み込まれる。
     04/39/41/42番末尾の即時renderAll()はスクリプト読み込み途中でも実行されるため、
     46番がまだ無い段階で呼ばれることがある(実測で再現)。未定義ならまだ移行せず、
     全スクリプト読み込み後の本来の初期描画で再試行する（._doneを立てない）。 */
  if(typeof ensureMonsters!=='function'||typeof ensureStructureChapters!=='function')return;
  migrateIdentifyRevealToScenes._done=true;
  ensureMonsters();ensureStructureChapters();
  /* sceneOverridesのキーをIDへ揃える移行(migrateSceneOverrideKeys)を先に必ず済ませる。
     この関数はキーを`chapter:scene:ID`の形で新規に書き込むため、旧形式(配列位置)からの
     移行が後から走ると、書いたばかりのキーを「まだ移行していない配列位置」と誤認し、
     別のシーンへ押し流してしまう（実測で発見。読み込み順のwrap入れ子順ではこの関数が
     先に実行され、後からmigrateSceneOverrideKeysが実行される経路があった）。
     直接呼ぶことで、ファイルの読み込み順に関係なく必ずこちらを先に完了させる */
  if(typeof migrateSceneOverrideKeys==='function')migrateSceneOverrideKeys();
  const writes=[];
  chapterOrder.forEach(chapterKey=>(structureChapters[chapterKey]?.scenes||[]).forEach(scene=>{
    const key=`${chapterKey}:scene:${scene.id}`,current=sceneOverrides[key]||{};
    const enemyId=typeof current.enemyId==='string'?current.enemyId.trim():typeof scene.enemyId==='string'?scene.enemyId.trim():'';
    const enemyName=typeof current.enemyName==='string'?current.enemyName.trim():typeof scene.enemyName==='string'?scene.enemyName.trim():String(scene.enemy?.name||'').trim();
    const mon=monsters.find(monster=>String(monster.id||monster.name)===enemyId)||monsters.find(monster=>monster.name===enemyName);
    if(!mon)return;
    const next={...current};
    if(mon.identifySecret&&!current.identifySecret)next.identifySecret=mon.identifySecret;
    if(mon.revealOnDefeat&&!current.revealOnDefeat)next.revealOnDefeat=mon.revealOnDefeat;
    if(Object.prototype.hasOwnProperty.call(mon,'presence')&&!Object.prototype.hasOwnProperty.call(current,'presence'))next.presence=Boolean(mon.presence);
    if(Object.prototype.hasOwnProperty.call(mon,'ambush')&&!Object.prototype.hasOwnProperty.call(current,'ambush'))next.ambush=Boolean(mon.ambush);
    if(mon.ambush&&Number(mon.ambushDc)>0&&!Object.prototype.hasOwnProperty.call(current,'ambushDc'))next.ambushDc=Number(mon.ambushDc);
    if(mon.ambush&&mon.ambushTrigger&&!Object.prototype.hasOwnProperty.call(current,'ambushTrigger'))next.ambushTrigger=mon.ambushTrigger;
    if(['identifySecret','revealOnDefeat','presence','ambush','ambushDc','ambushTrigger'].some(field=>next[field]!==current[field]))writes.push([key,next]);
  }));
  writes.forEach(([key,next])=>{sceneOverrides[key]=next});
}
var baseRenderAllForSceneEnemySecrets=renderAll;
renderAll=function(){migrateIdentifyRevealToScenes();baseRenderAllForSceneEnemySecrets()};
var baseWorkspaceDraftForSceneEnemySecrets=workspaceDraft;
workspaceDraft=function(){migrateIdentifyRevealToScenes();return baseWorkspaceDraftForSceneEnemySecrets()};
var baseApplyWorkspaceDraftForSceneEnemySecrets=applyWorkspaceDraft;
applyWorkspaceDraft=function(data){baseApplyWorkspaceDraftForSceneEnemySecrets(data);migrateIdentifyRevealToScenes._done=false};
