// 立ち位置・調査ラベル・場面転換・メイン画面の描画。
// 見かけだけの奥行き。射程や戦闘判定には使いません。
let placement=null,placementState=null,placementKey='',battlePreview=false,previewPlacement=null;
function projectActor(p,settings=depth){const scale=1-p.z*settings.shrink/100;return {x:p.x,bottom:4+p.z*settings.rise,height:settings.size*scale*((PEOPLE.find(person=>person.id===p.id)?.heightCm||172)/172),scale,layer:Math.round((1-p.z)*100)};}
function renderPlacement(){
 const battle=state.phase==='battle'||battlePreview,key=state.room+':'+state.phase;
 if(placementState!==state||placementKey!==key){placement=makePlacement(state.phase==='battle');placementState=state;placementKey=key;}
 if(battlePreview&&!previewPlacement)previewPlacement=makePlacement(true);
 $('figures').classList.toggle('battle-layout',battle);$('scene').classList.toggle('battle-scene',battle);
 $('figures').innerHTML=(battlePreview?previewPlacement:placement).map(p=>{const q=projectActor(p),person=PEOPLE.find(a=>a.id===p.id);return `<span class="scene-actor" data-actor="${p.id}" data-depth="${p.z.toFixed(3)}" data-scale="${q.scale.toFixed(3)}" style="left:${q.x}%;bottom:${q.bottom}%;height:${q.height}%;z-index:${q.layer}"><img src="../replay/img/${p.id==='lydia'?'maren':p.id}.webp" alt="${person.name}"></span>`;}).join('');
 $('figures').hidden=state.phase==='end'&&!battlePreview;
 $('figures').querySelectorAll('img').forEach(img=>img.onload=placeTargetLabels);
 renderFallbackEnemy();
 placeTargetLabels();
}
// 人物とラベルの間に確保する余白。単位: px。
const TARGET_CLEARANCE=8;
function rectOverlap(a,b,gap=0){return a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y;}
function freeLabelPosition(origin,size,bounds,obstacles){
 const candidates=[origin];
 for(let y=12;y<=bounds.height-size.height-12;y+=12)for(let x=12;x<=bounds.width-size.width-12;x+=12)candidates.push({x,y});
 candidates.sort((a,b)=>((a.x-origin.x)**2*1.5+(a.y-origin.y)**2)-((b.x-origin.x)**2*1.5+(b.y-origin.y)**2));
 return candidates.find(p=>p.x>=8&&p.y>=8&&p.x+size.width<=bounds.width-8&&p.y+size.height<=bounds.height-8&&!obstacles.some(o=>rectOverlap({...p,...size},o,TARGET_CLEARANCE)))||origin;
}
function placeTargetLabels(){
 const scene=$('scene'),bounds=scene.getBoundingClientRect();if(!bounds.width)return;
 if(stageView&&scene.classList.contains('stage-ready')){placeStagePoints();return;}
 const local=e=>{const r=e.getBoundingClientRect();return {x:r.left-bounds.left,y:r.top-bounds.top,width:r.width,height:r.height};};
 const actors=[...scene.querySelectorAll('.scene-actor')].map(e=>{
  const r=local(e),img=e.querySelector('img');if(!img.naturalWidth)return r;
  const ratio=img.naturalWidth/img.naturalHeight,width=Math.min(r.width,r.height*ratio),height=Math.min(r.height,r.width/ratio);
  return {x:r.x+(r.width-width)/2,y:r.y+r.height-height,width,height};
 });
 const obstacles=[...actors,...[scene.querySelector('.scenehead'),$('exits')].filter(e=>!e.hidden&&e.getBoundingClientRect().height).map(local)];
 for(const button of $('points').querySelectorAll('[data-target]')){
  const t=TARGETS[button.dataset.target],size={width:button.offsetWidth,height:button.offsetHeight};
  const origin={x:bounds.width*t.x/100,y:bounds.height*t.y/100},p=freeLabelPosition(origin,size,bounds,obstacles);
  button.style.left=p.x+'px';button.style.top=p.y+'px';obstacles.push({...p,...size});
 }
}
// 寄り絵は調査前の外観。表示しても知識や発見状態は変えません。
function investigationRecord(t,s=state,records=actionHistory){
 return records.filter(c=>c.id===humanId()).findLastIndex(c=>c.room===s.room&&c.result?.text&&(safeInvestigation(c.action)||c.action==='scout')&&(ACTION_TARGET[c.action]===t||c.action==='scout'&&t==='etching'));
}
function showInvestigationRecord(t){
 const index=investigationRecord(t);if(index<0)return;
 sheet(humanId(),'notes');const row=$('sheet').querySelector('[data-history-index="'+index+'"]');
 row?.scrollIntoView({block:'center'});row?.focus({preventScroll:true});
}
function positionContextActions(){
 const panel=$('actions');if(!panel.classList.contains('contextual'))return;
 const scene=$('scene').getBoundingClientRect(),marker=$('points').querySelector('[data-target="'+target+'"]');if(!marker)return;
 const local=e=>{const r=e.getBoundingClientRect();return {x:r.left-scene.left,y:r.top-scene.top,width:r.width,height:r.height};};
 const point=local(marker),margin=12,size={width:panel.offsetWidth,height:panel.offsetHeight};
 const origin={x:Math.max(margin,Math.min(scene.width-size.width-margin,point.x)),y:Math.max(margin,Math.min(scene.height-size.height-margin,point.y+point.height+8))};
 const obstacles=[...$('scene').querySelectorAll('.scene-actor,.scenehead,[data-target]'),$('exits'),$('sceneTools')].filter(e=>!e.hidden&&e.getBoundingClientRect().height).map(local);
 const pos=freeLabelPosition(origin,size,scene,obstacles);panel.style.left=pos.x+'px';panel.style.top=pos.y+'px';

}
let sceneVisualKey=null,sceneFadeMs=600,sceneFading=false,sceneFadePending=false;
function sceneKey(){return state.phase+':'+state.room+':'+(state.outcome||'')+':'+battlePreview;}
function revolvingSceneChange(from,to){const [pa,ra,,ba]=from.split(':'),[pb,rb,,bb]=to.split(':');return pa==='explore'&&pb==='explore'&&ra!==rb&&ba==='false'&&bb==='false';}
function render(){
 const key=sceneKey();
 if(sceneFading){sceneFadePending=true;return;}
 if(sceneVisualKey===null||sceneVisualKey===key||!sceneFadeMs||matchMedia('(prefers-reduced-motion: reduce)').matches){sceneVisualKey=key;renderNow();return;}
 // 探索中に部屋を移るときは、暗転の代わりに背景の板を回します。人物の配置が変わる戦闘などの転換は暗転のままです。
 if(revolvingSceneChange(sceneVisualKey,key)){sceneFading=true;if(stageView?.revolve?.(()=>{sceneVisualKey=sceneKey();renderNow();$('scene').classList.add('revolve-swapped');},()=>{$('scene').classList.remove('revolving');$('scene').classList.remove('revolve-swapped');sceneFading=false;if(sceneFadePending){sceneFadePending=false;render();}})){$('scene').classList.add('revolving');return;}sceneFading=false;}
 const scene=$('scene'),out=Math.round(sceneFadeMs*.42),back=sceneFadeMs-out;
 sceneFading=true;scene.style.transition=`filter ${out}ms ease-in`;scene.style.filter='brightness(0)';
 setTimeout(()=>{
  sceneVisualKey=sceneKey();renderNow();scene.style.transition=`filter ${back}ms ease-out`;void scene.offsetWidth;scene.style.filter='brightness(1)';
  setTimeout(()=>{scene.style.removeProperty('filter');scene.style.removeProperty('transition');sceneFading=false;if(sceneFadePending){sceneFadePending=false;render();}},back);
 },out);
}
function renderNow(){
 const followLog=$('log').scrollHeight-$('log').clientHeight-$('log').scrollTop<=80;
 positionGM();
 const battle=state.phase==='battle'||battlePreview,end=state.phase==='end'&&!battlePreview,room=ROOMS[state.room];document.querySelector('.world').classList.toggle('battle-world',battle);
 if(target&&!visibleTargets().includes(target))target=null;
 $('phase').textContent=end?'結末':battle?'連携戦':'探索';
 $('place').textContent=sceneTitle(battle,end,room);
 $('objective').textContent=sceneObjective(battle,end);
 $('scene').style.backgroundImage=`url('../replay/img/${sceneImage(battle,end,room)}.webp')`;
 $('scene').classList.toggle('dark',!state.lit&&!battlePreview);$('scene').classList.toggle('drained',isDrainedScene());
 $('points').innerHTML=!battle&&!end?visibleTargets().map(t=>`<button class="target" style="left:${TARGETS[t].x}%;top:${TARGETS[t].y}%" data-target="${t}" aria-pressed="${target===t}">${pointLabel(t)}</button>`).join(''):'';
 renderDiscoveryPoints(battle);
 $('points').querySelectorAll('[data-target]').forEach(b=>b.onclick=()=>{target=b.dataset.target;render();if($('actions').classList.contains('contextual'))($('actions').querySelector('[data-act]')||$('investigationResult')||$('contextClose')).focus();});
 renderPlacement();
 $('bossimg').hidden=!battle;$('tele').hidden=!battle;$('tele').innerHTML=enemyTelegraph();
 $('exits').innerHTML=visibleExits().map(e=>`<button data-room="${e.id}" ${busy?'disabled':''}><span aria-hidden="true">↗</span> ${esc(e.name?e.name+'へ':e.passage)}</button>`).join('');$('exits').hidden=battle||end||!state.lit;$('exits').querySelectorAll('[data-room]').forEach(b=>b.onclick=()=>{if(!busy)travel(b.dataset.room);});
 $('party').innerHTML=PEOPLE.map(p=>`<button class="person ${p.id===humanId()?'mine':''}" data-person="${p.id}"><img src="../replay/img/${p.id==='lydia'?'maren':p.id}.webp" alt=""><span><strong>${p.name}</strong><small>${p.role.split('・').pop()} · ${state.hp[p.id]}/${p.hp}</small><span class="party-vitals"><span class="party-meter" role="progressbar" aria-label="${p.name}のHP" aria-valuemin="0" aria-valuemax="${p.hp}" aria-valuenow="${state.hp[p.id]}"><i style="width:${Math.max(0,Math.min(100,state.hp[p.id]/p.hp*100))}%"></i></span><span class="party-meter mp" role="img" aria-label="${p.name}のMP：数値未設定"></span></span></span></button>`).join('');$('party').querySelectorAll('button').forEach(b=>b.onclick=()=>sheet(b.dataset.person));
 let body=actionIntro(battle,end);
 if(battlePreview)body=`<h3>あなたの行動 · 表示確認</h3><p>戦闘画面のプレビューです。進行状態や持ち物は変わりません。</p><div class="choices">${ownedActions(humanId(),['study','aid','throw','retreat'],state).map(a=>`<button disabled>${LABEL[a]}</button>`).join('')}</div>`;
 if(!battlePreview&&plan.length){const approved=planReview?.key===planKey(plan)?planReview.approved:{};body+=`<div class="queue">${plan.map((p,i)=>`<div><b>${i+1}</b><span>${PEOPLE.find(x=>x.id===p.id).name}：${LABEL[p.action]}<small class="plan-vote">${p.id===humanId()?'あなたが選んだ行動':approved[p.id]===true?'本人が了承':approved[p.id]===false?'本人が再相談を希望':'本人の確認待ち'}</small></span>${p.id===humanId()?`<select id="ownBattleAction" aria-label="${personName(humanId())}自身の行動" ${busy?'disabled':''}>${actionsFor(humanId()).map(a=>`<option value="${a}" ${a===p.action?'selected':''}>${LABEL[a]}</option>`).join('')}</select>`:''}<button data-move="${i},-1" aria-label="${i+1}番の行動を上へ" ${busy||i===0?'disabled':''}>↑</button><button data-move="${i},1" aria-label="${i+1}番の行動を下へ" ${busy||i===plan.length-1?'disabled':''}>↓</button></div>`).join('')}</div><div class="plan-coordination"><strong>GM：連携の確認</strong>${planIssues(plan).map(x=>`<p>${esc(x.text)}</p>`).join('')||'<p>現在の行動と順番に、ルール上の食い違いはありません。</p>'}<p>順番や行動を変えると、本人の確認を取り直します。1回の調整で各AIが1回ずつ返答します。</p></div><div class="choices"><button id="coordinate" ${busy||plan.length!==4?'disabled':''}>仲間と連携を調整</button><button id="execute" class="primary" ${busy||!planReady()?'disabled':''}>この行動で進める</button><button id="cancelplan" ${busy?'disabled':''}>選び直す</button></div>`;
 }else if(!end&&!battlePreview){const own=actionsFor(humanId()).filter(a=>battle||ACTION_TARGET[a]===target&&canShowProposal(humanId(),a));if(!battle&&target)body=body.replace('自分でできる行動を選べます。仲間への依頼は会話で伝えます。',own.length?personName(humanId())+'ができること':'今、自分でできる操作はありません。仲間に相談できます。');body+=`<div class="choices">${own.map(a=>`<button data-act="${a}" ${busy?'disabled':''}>${LABEL[a]}</button>`).join('')}${advanceControl(battle)}</div>`;}
 $('sceneTools').innerHTML=!battle&&!end?actionsFor(humanId()).filter(a=>a==='scout').map(a=>`<button data-act="${a}" ${busy?'disabled':''}>${LABEL[a]}</button>`).join(''):'';
 $('sceneTools').querySelectorAll('[data-act]').forEach(b=>b.onclick=()=>human(b.dataset.act));
 if(!battle&&!end&&target&&investigationRecord(target)>=0){body=body.replace('今、自分でできる操作はありません。仲間に相談できます。','調査した結果を記録から確認できます。仲間への相談もできます。');body+='<button id="investigationResult">調査結果を見る</button>';}
 const context=!battle&&!end&&!!target,panel=$('actions');panel.classList.toggle('contextual',context);panel.classList.toggle('idle',!battle&&!end&&!context);
 if(context){$('scene').append(panel);body=body.replace('</h3>','</h3>'+targetPortrait(target));body='<button type="button" id="contextClose" class="context-close" aria-label="調査地点の操作を閉じる">×</button>'+body;}
 else{document.querySelector('.world').insertBefore(panel,$('private'));panel.style.removeProperty('left');panel.style.removeProperty('top');}
 $('actions').innerHTML=body;$('actions').querySelectorAll('[data-act]').forEach(b=>b.onclick=()=>human(b.dataset.act));$('actions').querySelectorAll('[data-request]').forEach(b=>b.onclick=()=>request(...b.dataset.request.split(',')));
 if($('investigationResult'))$('investigationResult').onclick=()=>showInvestigationRecord(target);
 if($('contextClose'))$('contextClose').onclick=()=>{const selected=target;target=null;render();$('points').querySelector('[data-target="'+selected+'"]')?.focus();};$('actions').onkeydown=e=>{if(e.key==='Escape'&&$('contextClose')){e.preventDefault();$('contextClose').click();}};
 $('actions').querySelectorAll('[data-move]').forEach(b=>b.onclick=()=>{const [i,d]=b.dataset.move.split(',').map(Number);[plan[i],plan[i+d]]=[plan[i+d],plan[i]];planReview=null;render();});
 if($('ownBattleAction'))$('ownBattleAction').onchange=e=>{plan.find(p=>p.id===humanId()).action=e.target.value;planReview=null;render();};if($('coordinate'))$('coordinate').onclick=()=>run(coordinatePlan);if($('execute'))$('execute').onclick=execute;if($('cancelplan'))$('cancelplan').onclick=()=>{plan=[];planReview=null;render();};
 if($('advance'))$('advance').onclick=()=>{if(!busy)advance();};
 const discovery=privateSummary();$('private').hidden=!discovery.count;
 $('private').innerHTML=discovery.count?`<strong>自分の発見 · 未共有${discovery.count}件</strong><span class="private-preview">${esc(discovery.latest)}</span><button id="privateDetails">記録を見る</button>${discovery.clue?`<button data-share-clue="${discovery.clue}" ${busy?'disabled':''}>皆に伝える</button>`:`<button data-share-knowledge="${state.knowledge[humanId()].indexOf(discovery.latest)}" ${busy?'disabled':''}>皆に伝える</button>`}`:'';
 if($('privateDetails'))$('privateDetails').onclick=()=>sheet(humanId(),'notes');
 $('private').querySelectorAll('[data-share-clue]').forEach(b=>b.onclick=()=>publishOwnClue(b.dataset.shareClue));
 $('private').querySelectorAll('[data-share-knowledge]').forEach(b=>b.onclick=()=>publishOwnKnowledge(Number(b.dataset.shareKnowledge)));
 const discussions=battlePreview?[]:conversationStatus();$('conversationState').hidden=!discussions.length;$('conversationState').innerHTML=discussions.map(text=>'<div>'+esc(text)+'</div>').join('');
 if(stageView)stageView.sync(stageSnapshot());
 updateAIComparison();placeTargetLabels();positionContextActions();updateRecipients();$('message').disabled=busy||battlePreview;$('chat').querySelector('[type=submit]').disabled=busy||battlePreview;$('mainMic').disabled=battlePreview;$('roleOpen').disabled=battlePreview;$('battlePreview').disabled=busy||state.phase==='battle';$('status').textContent=battlePreview?'戦闘画面のプレビュー中。設定のスイッチを切ると元の場面に戻ります。':busy?(diceJob&&$('dicePanel').open?'GMが判定しています…':'AIの仲間が考えています…'):apiReady?'AI接続済み。仲間に話しかけてみてください。':'AI未接続。GMを選んで相談すると再試行できます。';redrawEffects();refreshOpenSheet();if(followLog&&!conversationFolded)$('log').scrollTop=$('log').scrollHeight;
}
