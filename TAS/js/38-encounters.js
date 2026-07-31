
/* エンカウンター契約 v0.1 試作。ゲーム側未実装でもTASに保存・出力できる形にする。 */
const ENCOUNTER_TYPES=[['normal','通常遭遇'],['conditional','条件付き遭遇'],['optional','任意遭遇'],['random','ランダム遭遇']];
const ENCOUNTER_TIMINGS=[['scene_enter','シーン開始時'],['player_action','プレイヤーの行動時'],['turn_start','ターン開始時'],['movement','移動時'],['after_check','判定後']];
/* この遭遇が参照するモンスターをmonsters[]（モンスタータブ、キャンペーンの定義台帳）から解決する。
   IDが無ければ名前で引く。ここで能力値を複製せず、参照のまま持つ */
function resolveEncounterMonster(monsterId,monsterName){
  return monsters.find(m=>String(m.id||m.name)===monsterId)||monsters.find(m=>m.name===monsterName)||null;
}
function normalizeEncounter(value,index=0){
  const x=value&&typeof value==='object'?value:{};
  const type=ENCOUNTER_TYPES.some(([id])=>id===x.type)?x.type:'normal';
  const numberOrNull=value=>value===null||value===undefined||value===''?null:Math.max(0,Number(value)||0);
  const monsterId=String(x.monsterId||x.enemyId||''),monsterName=String(x.monsterName||x.enemyName||'');
  const monster=resolveEncounterMonster(monsterId,monsterName);
  /* この遭遇専用の敵能力。1シーンに複数の敵を出す分岐で使う（scenes[].enemyは1体しか持てないため）。
     モンスタータブに登録があればそれを能力値の正とする（参照）。未登録の旧データだけ、
     直接埋め込まれた値をフォールバックとして使う（複製ではなく移行用の救済） */
  const enemy=monster?definedEnemyFields(monster):(x.enemy&&typeof x.enemy==='object'?x.enemy:null);
  return {
    id:String(x.id||`encounter_${index+1}`),type,
    monsterId,monsterName,
    triggerTerms:parseList(x.triggerTerms||x.triggers||x.trigger||''),
    requiredElements:parseList(x.requiredElements||x.requires?.elements||x.requires||''),
    requiredOperator:x.requiredOperator==='any'||x.requires?.operator==='any'?'any':'all',
    probability:numberOrNull(x.probability),
    timing:ENCOUNTER_TIMINGS.some(([id])=>id===x.timing)?x.timing:'scene_enter',
    maxOccurrences:numberOrNull(x.maxOccurrences??x.maxCount),
    blockedBy:parseList(x.blockedBy||x.preventedBy||''),
    onsetText:String(x.onsetText||x.text||x.description||''),
    notes:String(x.notes||''),
    ...(enemy?{enemy}:{})
  };
}
function sceneEncounters(){return (scene().encounters||[]).map(normalizeEncounter)}
function encounterMonsterOptions(selected){return `<option value="">選択してください</option>${monsters.filter(x=>x.name).map(x=>{const id=String(x.id||x.name);return `<option value="${escapeHtml(id)}" ${selected===id?'selected':''}>${escapeHtml(x.name)}${x.id?`（${escapeHtml(x.id)}）`:''}</option>`}).join('')}`}
function encounterDiscoveryNames(){return (scene().discoveries||[]).map((x,i)=>normalizeDiscoveryFor(scene(),x,i).label).filter(Boolean)}
/* blockedByはmock2側で「撃破済み・離脱済みの敵名」としてしか照合されない(engine/index.jsのresolveEncounterIfNeeded)。
   フラグやイベントIDを入れても効かないため、モンスター名の候補だけを出す */
function encounterMonsterNames(){return monsters.filter(x=>x.name).map(x=>x.name)}
function renderEncounterCard(enc,index){
  const typeLabel=ENCOUNTER_TYPES.find(([id])=>id===enc.type)?.[1]||'通常遭遇';
  const selectedMonster=resolveEncounterMonster(enc.monsterId,enc.monsterName);
  const monsterName=selectedMonster?.name||enc.monsterName||'対象未設定';
  return `<details class="card encounter-card" open><summary>遭遇${index+1}：${escapeHtml(typeLabel)} ／ ${escapeHtml(monsterName)}</summary><div class="encounter-grid" data-encounter-index="${index}">
    <div class="field"><label>遭遇種別</label><select class="encounter-type" data-encounter-index="${index}">${ENCOUNTER_TYPES.map(([id,label])=>`<option value="${id}" ${enc.type===id?'selected':''}>${label}</option>`).join('')}</select></div>
    <div class="field"><label>対象モンスター</label><select class="encounter-monster" data-encounter-index="${index}">${encounterMonsterOptions(enc.monsterId||selectedMonster?.id||selectedMonster?.name||'')}</select></div>
    <div class="field span-2"><label>遭遇のトリガー語句（カンマ区切り）</label><input class="encounter-trigger-terms" data-encounter-index="${index}" value="${escapeHtml(enc.triggerTerms.join(', '))}" placeholder="踏み込む, 殻を調べる"></div>
    <div class="field span-2"><label>必要な調査対象（カンマ区切り）</label><input class="encounter-required-elements" data-encounter-index="${index}" list="encounterDiscoveryNameList" value="${escapeHtml(enc.requiredElements.join(', '))}" placeholder="気配, 殻の散らばり"></div>
    <div class="field"><label>必要な調査対象の条件</label><select class="encounter-required-operator" data-encounter-index="${index}"><option value="all" ${enc.requiredOperator==='all'?'selected':''}>すべて必要（AND）</option><option value="any" ${enc.requiredOperator==='any'?'selected':''}>いずれか（OR）</option></select></div>
    <div class="field"><label>判定タイミング</label><select class="encounter-timing" data-encounter-index="${index}">${ENCOUNTER_TIMINGS.map(([id,label])=>`<option value="${id}" ${enc.timing===id?'selected':''}>${label}</option>`).join('')}</select></div>
    <div class="field"><label>遭遇確率（%）</label><input type="number" min="0" max="100" class="encounter-probability" data-encounter-index="${index}" value="${enc.probability??''}" placeholder="例：25"><p class="hint">ランダム遭遇だけで使用します。</p></div>
    <div class="field"><label>最大遭遇回数</label><input type="number" min="1" class="encounter-max-occurrences" data-encounter-index="${index}" value="${enc.maxOccurrences??''}" placeholder="空欄なら制限なし"></div>
    <div class="field span-2"><label>発生禁止条件（撃破済み・離脱済みの敵名。カンマ区切り）</label><input class="encounter-blocked-by" data-encounter-index="${index}" list="encounterMonsterNameList" value="${escapeHtml(enc.blockedBy.join(', '))}" placeholder="灯の番人"><p class="hint">モンスター名だけが判定に使われます。フラグやイベントIDを入れても発生条件には反映されません。</p></div>
    <div class="field span-2"><label>遭遇時の演出</label><textarea class="encounter-onset-text" data-encounter-index="${index}" placeholder="暗がりから錆喰いが飛び出してくる。">${escapeHtml(enc.onsetText)}</textarea></div>
    <div class="field span-2"><label>GM補足メモ</label><textarea class="encounter-notes" data-encounter-index="${index}" placeholder="この遭遇を発生させる意図や例外条件">${escapeHtml(enc.notes)}</textarea></div>
    <div class="field"><label>出口ID</label><input class="encounter-id" data-encounter-index="${index}" value="${escapeHtml(enc.id)}" placeholder="encounter_s2_rust_eater"></div>
    <div class="field encounter-actions"><button class="sub delete-btn" data-remove-encounter="${index}">削除</button></div>
  </div></details>`;
}
function renderEncounterSection(){
  const encounters=sceneEncounters();
  const names=encounterDiscoveryNames();
  const monsterNames=encounterMonsterNames();
  return `<div class="card encounter-section"><h3>エンカウンター設定</h3><p class="hint">このシーンで敵との遭遇が発生する条件を設定します。通常・条件付き・任意・ランダムを同じ一覧で管理できます。現在はTASで保存・ゲーム側JSONへ出力する試作段階です。</p><datalist id="encounterDiscoveryNameList">${names.map(name=>`<option value="${escapeHtml(name)}">`).join('')}</datalist><datalist id="encounterMonsterNameList">${monsterNames.map(name=>`<option value="${escapeHtml(name)}">`).join('')}</datalist>${encounters.length?encounters.map(renderEncounterCard).join(''):`<div class="empty-card"><p class="hint">遭遇設定はありません。敵が登場するシーンだけ追加してください。</p></div>`}<div class="bottom"><button class="sub" id="btnAddEncounter">＋ 遭遇を追加</button></div></div>`;
}
function collectEncounters(){
  return Array.from(document.querySelectorAll('.encounter-card')).map((card,index)=>normalizeEncounter({
    id:card.querySelector(`.encounter-id[data-encounter-index="${index}"]`)?.value.trim(),
    type:card.querySelector(`.encounter-type[data-encounter-index="${index}"]`)?.value,
    monsterId:card.querySelector(`.encounter-monster[data-encounter-index="${index}"]`)?.value,
    monsterName:card.querySelector(`.encounter-monster[data-encounter-index="${index}"] option:checked`)?.textContent?.replace(/（[^）]*）$/,'')||'',
    triggerTerms:card.querySelector(`.encounter-trigger-terms[data-encounter-index="${index}"]`)?.value,
    requiredElements:card.querySelector(`.encounter-required-elements[data-encounter-index="${index}"]`)?.value,
    requiredOperator:card.querySelector(`.encounter-required-operator[data-encounter-index="${index}"]`)?.value,
    timing:card.querySelector(`.encounter-timing[data-encounter-index="${index}"]`)?.value,
    probability:card.querySelector(`.encounter-probability[data-encounter-index="${index}"]`)?.value,
    maxOccurrences:card.querySelector(`.encounter-max-occurrences[data-encounter-index="${index}"]`)?.value,
    blockedBy:card.querySelector(`.encounter-blocked-by[data-encounter-index="${index}"]`)?.value,
    onsetText:card.querySelector(`.encounter-onset-text[data-encounter-index="${index}"]`)?.value,
    notes:card.querySelector(`.encounter-notes[data-encounter-index="${index}"]`)?.value
  },index));
}
function saveEncounters(value){const key=sceneKey();sceneOverrides[key]={...(sceneOverrides[key]||{}),encounters:value};saveWorkspaceDraft(true);renderScenes();renderRightPanel();renderValidation()}
var baseRenderStructureForEncounters=renderStructure;
renderStructure=function(){const holder=document.createElement('div');holder.innerHTML=baseRenderStructureForEncounters();const anchor=[...holder.querySelectorAll('.field')].find(field=>field.querySelector('#sceneEnemy'));if(anchor&&!holder.querySelector('.enemy-encounter-group')){const group=document.createElement('div');group.className='card enemy-encounter-group';const heading=document.createElement('h3');heading.textContent='敵・遭遇設定';const hint=document.createElement('p');hint.className='hint';hint.textContent='基本敵はこのシーンに直接登場する敵、遭遇設定は条件付き・任意・ランダムに発生する敵を設定します。';const source=document.createElement('div');source.innerHTML=renderEncounterSection();const sourceSection=source.firstElementChild;const section=document.createElement('details');section.className='encounter-section encounter-subsection';section.open=Boolean(sceneEncounters().length);const summary=document.createElement('summary');summary.textContent='遭遇条件（encounters[]）';const body=document.createElement('div');body.className='encounter-subsection-body';body.innerHTML=sourceSection.innerHTML;body.querySelector('h3')?.remove();body.querySelector('p.hint')?.remove();section.append(summary,body);anchor.before(group);group.append(heading,hint,anchor,section)}return holder.innerHTML};
var baseBindStructureForEncounters=bindStructure;
bindStructure=function(){baseBindStructureForEncounters();const section=document.querySelector('.encounter-section');if(!section)return;const update=()=>saveEncounters(collectEncounters());section.querySelectorAll('input,select,textarea').forEach(input=>{input.oninput=update;input.onchange=update});section.querySelectorAll('[data-remove-encounter]').forEach(button=>button.onclick=()=>{saveEncounters(sceneEncounters().filter((_,i)=>i!==Number(button.dataset.removeEncounter)));renderTab()});const add=section.querySelector('#btnAddEncounter');if(add)add.onclick=()=>{saveEncounters([...sceneEncounters(),normalizeEncounter({id:`encounter_${sceneEncounters().length+1}`,type:'conditional'},sceneEncounters().length)]);renderTab()};};

/* 出力の段: scenes[].encounters を作る。段の並びは js/43-output-pipeline.js */
function outputEncounters(payload){
  /* ensureMonsters()は本来renderAll/workspaceDraftの描画サイクルで走るが、出力はそれを
     待たない非同期の呼び出しであってはならない。出力の入口(この段)で直接呼び、
     描画のタイミングに関係なく遭遇の敵解決ができるようにする */
  ensureMonsters();
  if(Array.isArray(payload.chapter?.scenes)){const nodes=chapterNodes().filter(n=>n.type==='scene');payload.chapter.scenes=payload.chapter.scenes.map((raw,index)=>{const node=nodes[index];const encounters=(node?.encounters||raw.encounters||[]).map(normalizeEncounter);return encounters.length?{...raw,encounters}:raw})}return payload};
