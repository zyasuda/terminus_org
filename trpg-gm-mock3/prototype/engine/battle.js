// 戦闘の作戦調整・番人の移動・ダイス。
function d20(){const n=new Uint32Array(1);do{crypto.getRandomValues(n);}while(n[0]>=4294967280);return n[0]%20+1;}
// 戦闘の判定・威力・反撃を表示とAI指示でも共有します。値は従来どおりです。
function planKey(items){return JSON.stringify(items.map(p=>[p.id,p.action]));}
function planReady(){return plan.length===4&&new Set(plan.map(p=>p.id)).size===4&&plan.every(p=>actionsFor(p.id).includes(p.action))&&planReview?.key===planKey(plan)&&aiPeople().every(p=>planReview.approved[p.id]===true)&&!planIssues(plan).some(x=>['support','cover'].includes(x.code));}
async function coordinatePlan(){
 if(state.phase!=='battle'||plan.length!==4)return;
 const epoch=generation,source=state;plan=arrangePlan(plan);const key=planKey(plan),snapshot=plan.map(p=>({...p})),answers=[];planReview=null;
 const issues=planIssues(snapshot);say('GM',issues.length?issues.map(x=>x.text).join(' '):'各自の行動と順番を確認しよう。誰か一人が他の仲間の行動を決めることはありません。','gm');render();
 for(const p of aiPeople()){
  const battle=dialogueInput(p,true,null,null);
  const text=await ask(`あなたは協力型TRPGの${p.name}。${p.motive} 固定のリーダーはいません。自分が選んだown.actionとplanの順番を確認してください。通常はown.actionを維持し、理由があればallowedの別の行動を選べます。actionは必ずallowedのキー。ルールにない味方への火球ダメージ等を創作しない。発言は未実行の意思です。agreesはこの行動と順番で動く了承。疑問や反対が残る場合はfalseと理由を伝える。撤退と攻撃が混在しても本人が納得すれば共同行動できます。JSONのみ:{"speech":"100文字以内","action":"allowedのID","agrees":true}`+speechStyle(p.id),{selfProfile:battle.selfProfile,public:battle.public,blockedActions:battle.blockedActions,conversation:chat.filter(c=>c.kind!=='private'&&c.kind!=='error').slice(-6),self:p.id,own:snapshot.find(x=>x.id===p.id),plan:snapshot,allowed:battle.allowed,issues:issues.map(x=>x.text),rules:battleCoordinationRules()});
  if(!responseIsCurrent(epoch,source)||key!==planKey(plan))return;
  const r=parseAI(text);
  if(typeof r.speech!=='string'||r.speech.length>350||typeof r.agrees!=='boolean'||!actionsFor(p.id).includes(r.action))throw Error(p.name+'の連携確認を読み取れませんでした。もう一度調整できます。');
  const audit=await auditProfile(p.id,r.speech);if(!responseIsCurrent(epoch,source)||key!==planKey(plan))return;if(!audit.valid)throw Error(p.name+'の返答が人物設定と食い違うため実行を保留します。もう一度調整してください。');revealProfile(p.id,audit.claims);answers.push({id:p.id,...r});say(p.name+'（AI）',r.speech);
 }
 const changed=answers.some(r=>snapshot.find(p=>p.id===r.id).action!==r.action);
 plan=arrangePlan(snapshot.map(p=>isHuman(p.id)?p:{id:p.id,action:answers.find(r=>r.id===p.id).action}));
 planReview=changed?null:{key:planKey(plan),approved:Object.fromEntries(answers.map(r=>[r.id,r.agrees]))};
 say('GM',changed?'本人が行動を変更しました。変更後の組み合わせを、もう一度短く確認できます。':planReady()?'本人たちが了承しました。各自が選んだ行動で進められます。':'確認が残っています。各人の理由を聞いて、あなた自身の行動や順番を提案し直せます。','gm');render();
}
function execute(){if(busy||!planReady())return;openDice('battle');}

// 戦闘のラウンドごとの番人の横移動。左右の幅は舞台座標で調整します。
function moveEnemyForRound(round){
 const side=stageView?.config.battlePartySide==='right'?-1:1,target=BATTLE_ENEMY_ROUTE[(round-1)%BATTLE_ENEMY_ROUTE.length]*side;
 if(!stageView)return target;
 const from=stageView.config.battleEnemyX,start=performance.now(),source=state,epoch=generation,duration=450;
 const place=x=>{stageView.config.battleEnemyX=x;$('battleEnemyX').value=x;$('battleEnemyXValue').textContent=x.toFixed(1);stageView.refreshLayout();};
 if(matchMedia('(prefers-reduced-motion: reduce)').matches||from===target){place(target);return target;}
 const step=now=>{if(state!==source||generation!==epoch||state.phase!=='battle')return;const t=Math.min(1,(now-start)/duration),ease=t*t*(3-2*t);place(from+(target-from)*ease);if(t<1)requestAnimationFrame(step);};
 requestAnimationFrame(step);return target;
}

// 判定の演出時間（ms）。ゲーム用の乱数は1判定に1回だけ使用します。
function setDiceActor(id){const color=DICE_COLORS[id]||DICE_COLORS.gm;$('die').style.filter=color.hue?'url(#dice-color-'+id+')':'none';$('die').dataset.actor=id;$('die').dataset.color=color.name;$('diceSprite').alt=color.name+'の20面ダイス'+($('die').dataset.face?'：'+$('die').dataset.face:'');}
function diceAsset(kind,value){if(kind==='stop'&&(!Number.isInteger(value)||value<1||value>20))throw Error('停止画像の出目は1〜20です。');if(kind==='red'&&(!Number.isInteger(value)||value<0||value>15))throw Error('回転画像は0〜15です。');return 'images/d20/d20-'+kind+'-'+String(value).padStart(2,'0')+'.png';}
let diceImagesReady;
function preloadDice(){return diceImagesReady??=Promise.all([...Array.from({length:16},(_,n)=>diceAsset('red',n)),...Array.from({length:20},(_,n)=>diceAsset('stop',n+1))].map(src=>{const image=new Image();image.src=src;return image.decode();})).catch(e=>{diceImagesReady=null;throw Error('ダイス画像を読み込めませんでした。再度お試しください。');});}
async function animateDice(value,job){
 const die=$('die'),sprite=$('diceSprite'),valid=()=>job.session===diceSession&&job.epoch===generation,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 await preloadDice();if(!valid())return;
 die.style.setProperty('--dice-roll-time',DICE_CONFIG.duration+'ms');die.classList.remove('rolling','landed','critical','low-roll');sprite.alt='20面ダイスを振っています';sprite.src=diceAsset('red',0);die.removeAttribute('data-face');
 if(!reduced){void die.offsetWidth;die.classList.add('rolling');let frame=0;const timer=setInterval(()=>{if(valid())sprite.src=diceAsset('red',++frame%16);},DICE_CONFIG.frameInterval);try{await new Promise(done=>setTimeout(done,DICE_CONFIG.duration));}finally{clearInterval(timer);}}
 if(!valid())return;
 die.classList.remove('rolling');die.classList.add('landed');die.classList.toggle('critical',value===20);die.classList.toggle('low-roll',value===1);die.dataset.face=String(value);sprite.src=diceAsset('stop',value);sprite.alt=DICE_COLORS[die.dataset.actor].name+'の20面ダイス：'+value;
 await new Promise(done=>setTimeout(done,reduced?80:DICE_CONFIG.landedDuration));
}
let diceSession=0,diceJob=null;
function openDice(mode,fromConversation=false){
 if(busy&&!fromConversation||mode==='battle'&&!planReady())return;const dialog=$('dicePanel');diceJob={mode,epoch:generation,source:state,items:plan.map(p=>({...p})),session:++diceSession};
 $('die').classList.remove('rolling','landed','critical','low-roll');$('diceSprite').src=diceAsset('red',0);$('diceSprite').alt='赤い20面ダイス';$('die').removeAttribute('data-face');setDiceActor(mode==='cache'?'gareth':mode==='battle'?diceJob.items.find(p=>!['aid','cover'].includes(p.action))?.id||'gm':'gm');$('diceRecords').replaceChildren();$('diceRoll').disabled=false;$('diceRoll').hidden=false;$('diceClose').textContent='キャンセル';$('diceClose').disabled=false;$('diceSupport').checked=false;$('diceSupport').disabled=false;$('diceSupportLabel').hidden=mode!=='cache';$('diceColorLabel').hidden=mode!=='demo';$('diceColorActor').disabled=false;$('diceColorActor').value='gm';
 $('diceIntro').textContent=diceIntro(mode);
 const preview=()=>{dicePlan(mode);};
 $('diceSupportLabel').lastChild.textContent='イネスが照明と見張りで支援（＋'+DICE_CONFIG.support+'）';$('diceSupport').onchange=preview;preview();dialog.showModal();
}
function setupDice(){
 const dialog=$('dicePanel');$('diceColorActor').innerHTML=[{id:'gm',name:'GM'},...PEOPLE].map(p=>`<option value="${p.id}">${p.name} · ${DICE_COLORS[p.id].name}</option>`).join('');$('diceColorActor').onchange=e=>setDiceActor(e.target.value);$('diceColorFilters').innerHTML=Object.entries(DICE_COLORS).filter(([,c])=>c.hue).map(([id,c])=>`<filter id="dice-color-${id}" x="-35%" y="-35%" width="170%" height="170%" color-interpolation-filters="sRGB"><feColorMatrix in="SourceGraphic" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 3 -4 -1 0 0" result="redMask"/><feColorMatrix in="SourceGraphic" type="hueRotate" values="${c.hue}" result="tint"/><feComposite in="tint" in2="redMask" operator="in" result="coloredFace"/><feComposite in="SourceGraphic" in2="redMask" operator="out" result="originalRest"/><feComposite in="coloredFace" in2="originalRest" operator="arithmetic" k2="1" k3="1"/></filter>`).join('');$('diceClose').onclick=()=>dialog.close();
 dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 dialog.addEventListener('close',()=>{diceSession++;$('gmguide').classList.remove('dice-throw');$('die').classList.remove('rolling');if(diceJob&&diceJob.epoch===generation){busy=false;render();}diceJob=null;});
 $('diceRoll').onclick=async()=>{
  const job=diceJob;if(!job||busy)return;busy=true;$('diceColorActor').disabled=true;$('diceRoll').disabled=true;$('diceClose').disabled=true;$('diceSupport').disabled=true;render();
  const draft=structuredClone(state),records=[];let results=[];
  try{
   if(job.mode==='battle')results=resolve(draft,job.items,d20,r=>records.push(r));
   else if(job.mode==='cache'){const r=resolveCache(draft,d20(),$('diceSupport').checked);records.push(r);results=[r.text];}
   else {const n=d20();records.push({id:$('diceColorActor').value,action:'demo',n,bonus:0,total:n,target:10,hit:n>=10,source:'補正なし'});}
   for(const r of records){
    if(job.session!==diceSession||job.epoch!==generation)return;
    setDiceActor(r.id);const name=r.id==='gm'?'GM':PEOPLE.find(p=>p.id===r.id).name;
    $('diceIntro').textContent=job.mode==='demo'?'GM：ダイスを振ります。':'GM：'+name+'の判定です。';$('die').classList.remove('rolling','landed','critical','low-roll');$('diceSprite').src=diceAsset('red',0);$('diceSprite').alt='赤い20面ダイス';$('die').removeAttribute('data-face');$('gmguide').classList.add('dice-throw');
    await animateDice(r.n,job);
    if(job.session!==diceSession||job.epoch!==generation)return;
    $('gmguide').classList.remove('dice-throw');
    const outcome=r.outcome==='partial'?'代償つき成功':r.outcome==='failure'?'失敗':r.hit?'成功':'失敗',line=name+'：'+r.n+' ＋ '+r.bonus+' ＝ '+r.total+' ／ 目標'+r.target+' · '+outcome;
    const entry=document.createElement('div');entry.className='dice-record';entry.textContent=line;const source=document.createElement('small');source.textContent=r.source;entry.append(source);$('diceRecords').append(entry);
   }
   if(job.mode!=='demo'){
    if(job.source!==state)return;state=draft;recordDiceActions(job,records,results);
    records.forEach(r=>say('GM',PEOPLE.find(p=>p.id===r.id).name+'の判定：'+r.n+'＋'+r.bonus+'＝'+r.total+'（'+r.source+' / 目標'+r.target+'）'+(r.outcome==='partial'?'代償つき成功':r.hit?'成功':'失敗'),'gm'));results.forEach(t=>sayResult('GM',t,'gm'));
    diceFollowup(job,records);
   }
   results.forEach(t=>{const e=document.createElement('div');e.className='dice-record';e.textContent=t;$('diceRecords').append(e);});
   $('diceIntro').textContent=job.mode==='demo'?'演出テスト完了。ゲーム状態は変更していません。':'GM：判定が終わりました。';$('diceRoll').hidden=true;$('diceClose').textContent='閉じる';
  }catch(e){$('diceRecords').textContent=e.message;$('diceRoll').hidden=true;$('diceClose').textContent='閉じる';}
  finally{if(job.session===diceSession&&job.epoch===generation){busy=false;$('diceColorActor').disabled=false;$('diceClose').disabled=false;$('diceSupport').disabled=$('diceRoll').hidden;$('gmguide').classList.remove('dice-throw');render();}}
 };
}

