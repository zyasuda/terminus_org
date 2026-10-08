// AIとの通信・仲間の返答・協力の提案・探索の依頼・議題ごとの合意・入力欄からの送信・台詞の下書き。
// 呼び出し側でroom・lit・plan等の追加条件を保持します。
function responseIsCurrent(epoch,source){return epoch===generation&&source===state;}
function parseAI(text){
 try{return JSON.parse(text.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));}
 catch(error){
  const fences=[...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)];
  if(fences.length===1)try{return JSON.parse(fences[0][1]);}catch{}
  throw error;
 }
}
async function ask(system,payload,maxTokens=450){const connection=aiConnection,started=performance.now(),turn=aiTurn;if(turn)turn.calls++;try{const res=await fetch('/api/gm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({connection,turnId:turn?.turnId||null,system,messages:[{role:'user',content:JSON.stringify(payload)}],max_tokens:maxTokens}),signal:AbortSignal.timeout(45000)});const data=await res.json();aiLastTiming={connection,durationMs:Math.round(performance.now()-started),ok:res.ok,usage:data.usage||{}};updateAIComparison();if(!res.ok)throw Error(data.error?.message||'AI中継からエラーが返りました。');apiReady=true;return (data.content||[]).map(c=>c.text||'').join('');}finally{if(turn)turn.totalMs+=Math.round(performance.now()-started);}}
// 人物への質問では、問いに必要な設定だけを渡し、探索候補で話題を逸らさないようにします。
async function aiPlayer(p,planning=false,requested=null,correction=null){
 const input=dialogueInput(p,planning,requested,correction),possible=actionsFor(p.id),allowed=Object.keys(input.allowed),proposalChoices=Object.keys(input.proposalChoices);
 const style=Math.random()<CHAT_JOKE_RATE?'状況に合う軽い冗談を添えてもよい。判断は明確に。':'冗談を無理に入れない。';
 const focusRule=playerFocusRule(input);
 const system=playerPrompt(p,style,focusRule,planning,requested);
 let r;
 // 戦闘で候補外の行動や読めない形式が返った時だけ、本人に1回選び直してもらいます。
 for(let attempt=0;attempt<(planning?2:1);attempt++){
  const text=await ask(system,attempt?{...input,formatCorrection:'前の回答は行動の形式が違います。actionはこのキーだけから選ぶ: '+allowed.join(', ')+ '。'+(r?'前のaction: '+String(r.action):'JSONオブジェクトを返してください。')}:input,550);
  try{r=parseAI(text);}catch(error){if(!planning||attempt)throw error;continue;}
  // 相談中の行動指定は、現在できる申し出として扱い、了承前には実行しません。
  if(!planning&&!requested&&proposalChoices.includes(r?.action)){r.proposal=r.action;r.action='wait';recordAIFallback('conversation-action-as-proposal');}
  if(planning&&r&&r.share===undefined)r.share=false;
  if(!planning||typeof r?.speech==='string'&&r.speech.length<=350&&allowed.includes(r.action)&&typeof r.share==='boolean')break;
 }
 if(typeof r?.speech!=='string'||r.speech.length>350||!(planning?allowed:requested?['wait',...possible]:['wait']).includes(r.action)||typeof r.share!=='boolean')throw Error('AIの返答が行動の形式に合いません。もう一度相談してください。');
 if(requested&&r.action!=='wait'&&r.action!==requested){
  // 同じ対象への観察・解読の違いは、実行せず本人の確認へ戻します。
  if(!planning&&safeInvestigation(requested)&&safeInvestigation(r.action)&&ACTION_TARGET[requested]&&ACTION_TARGET[requested]===ACTION_TARGET[r.action]){
   r.proposal=r.action;r.action='wait';r.speech='「'+LABEL[requested]+'」の依頼ですね。代わりに「'+LABEL[r.proposal]+'」をしてよいですか？';r.share=false;r.shareClues=[];
  }else throw Error('依頼と異なる行動は実行しません。');
 }
 r.requested=requested;r.proposal=proposalChoices.includes(r.proposal)&&spokenOffer(r.proposal,r.speech)?r.proposal:'';r.shareClues=Array.isArray(r.shareClues)?r.shareClues.filter(k=>state.discovery.clues[p.id].includes(k)):[];return r;
}
function reportInvestigation(p,a,out){
 sayResult(p.name+'（AI）','調べた結果：'+out.text,'');
 publishReport(p.id,out.text,state,true);
 for(const key of state.discovery.clues[p.id])if(CLUES[key]===out.text)shareClue(p.id,key);
 investigationFollowup(p,a);
 delete explorationOffers[p.id];if($('sheet')?.open)$('sheet').close();cooperationFollowup(p.id,a);
}
// 共有された実結果から、次に必要な本人の申し出を1つだけ返します。実行は了承を待ちます。
function currentHumanRequests(to='all'){
 return humanRequests.filter(r=>r.epoch===generation&&r.room===state.room&&state.phase==='explore'&&(to==='all'||to===r.id)&&actionsFor(humanId()).includes(r.action));
}
function askHuman(id,action,speech){
 say(personName(id)+'（AI）',speech);
 if(!HUMAN_CONVERSATION_ACTIONS.includes(action)||!actionsFor(humanId()).includes(action))return;
 humanRequests=humanRequests.filter(r=>r.room===state.room&&r.epoch===generation&&!(r.id===id&&r.action===action));
 humanRequests.push({id,action,room:state.room,epoch:generation,paused:false});
}
async function actFromConversation(intent){
 const result=await human(intent.action,intent.requester);
 if(result?.performed&&$('sheet')?.open)$('sheet').close();
 return result;
}
function offerCooperation(id,action,speech){
 if(!actionsFor(id).includes(action))return;
 say(personName(id)+'（AI）',speech);propose(id,action);
 if(safeInvestigation(action)||COOPERATION_ACTIONS.includes(action)||action==='open_cache'){explorationOffers[id]={room:state.room,action};latestProposal={kind:'offer',id,action,room:state.room,epoch:generation};}
}
// 次の相談は現在地の公開結果から選ぶだけ。提案の時点では行動も所有も変えません。
function speakCooperation(advice){
 if(!advice)return false;
 if(advice.action&&!isHuman(advice.id))offerCooperation(advice.id,advice.action,advice.speech);
 else if(isHuman(advice.id))askHuman('brom',advice.action,advice.speech);
 else say(personName(advice.id)+'（AI）',advice.speech);
 return true;
}
// 明確に無理な分担と「次は何をする？」を会話へ戻します。質問・否定を実行しません。
function acceptAI(p,r,planning){
 if(!planning&&r.requested&&r.action!=='wait'){
  if(safeInvestigation(r.action)){propose(p.id,r.action);const out=apply(p.id,r.action,state,humanId());reportInvestigation(p,r.action,out);render();return true;}
 }
 revealProfile(p.id,r.profileClaims||[]);say(p.name+'（AI）',r.speech);if(!planning){rememberMapOffer(p,r.speech);rememberHumanRequest(p.id,r.speech);}
 if(r.share)publishReport(p.id,r.speech);for(const key of r.shareClues||[])shareClue(p.id,key);
 if(r.proposal&&spokenOffer(r.proposal,r.speech)){propose(p.id,r.proposal);if(safeInvestigation(r.proposal)||COOPERATION_ACTIONS.includes(r.proposal)||r.proposal==='open_cache'){explorationOffers[p.id]={room:state.room,action:r.proposal};latestProposal={kind:'offer',id:p.id,action:r.proposal,room:state.room,epoch:generation};}}
 if(r.action!=='wait'&&(planning||r.requested&&state.phase==='explore')){
  if(planning)plan.push({id:p.id,action:r.action});else{const out=apply(p.id,r.action,state,humanId());if(!out.private){sayResult('GM',out.text,'gm');delete explorationOffers[p.id];cooperationFollowup(p.id,r.action);}}
 }
 render();return false;
}
async function companions(planning=false,addressedTo='all',investigations=[]){
 const start=Math.max(0,chat.findLastIndex(c=>c.kind==='you')),epoch=generation,order=listeners(addressedTo,planning);
 for(const p of order){const requested=investigations.find(j=>j.id===p.id)?.action||null;
  // 明示された観察・解読は、ゲーム側の条件を使ってその場で調べ、実結果を返します。
  if(!planning&&requested&&safeInvestigation(requested)){propose(p.id,requested);const out=apply(p.id,requested,state,humanId());reportInvestigation(p,requested,out);render();continue;}
  // 本人が既に申し出た支援・解錠は、人間の了承後に同じ判断をLLMへ聞き直しません。
  if(!planning&&COOPERATION_ACTIONS.includes(requested)&&currentOffers()[p.id]?.action===requested){acceptAI(p,{speech:(p.id==='brom'?'よし、':'ああ、')+LABEL[requested]+'。',action:requested,requested,share:false,shareClues:[],profileClaims:[]},false);continue;}
  if(requested==='open_cache'){propose(p.id,requested);if($('sheet')?.open)$('sheet').close();openDice('cache',true);return;}
  if(!confirmScenarioAction(requested))continue;
  const r=await checkedReply(p,planning,requested);if(epoch!==generation||!r)return;acceptAI(p,r,planning);}
 if(!planning&&epoch===generation){const question=chat[start]?.text||'',profileQuestion=order.length===1&&dialogueFocus(order[0],question).type==='profile';if(!profileQuestion&&!investigations.length)for(const topic of Object.keys(CONSENT_TOPICS)){await settleConsent(topic,start);if(epoch!==generation)return;}if(epoch===generation)announceVisiblePoints();}
}

// 支援・解錠の了承は本人の直前の一意な申し出だけを使います。
function conversationChoices(id){return state.phase==='explore'?actionsFor(id).filter(a=>!consentTopicOf(a)):[];}
function currentOffers(){
 return Object.fromEntries(Object.entries(explorationOffers).filter(([id,v])=>v.room===state.room&&conversationChoices(id).includes(v.action)&&usefulInvestigation(v.action)));
}
function normalizeExplorationIntent(r,to,text){
 if(Array.isArray(r)&&r.length===1)r=r[0];
 if(!r||typeof r!=='object')return {kind:'conversation',jobs:[],clarify:''};
 // 試作では、相談に混ざった実行候補は捨てて、本人の会話を続けます。
 if(r.kind==='conversation')return {...r,jobs:[],clarify:''};
 const actors=to==='all'?aiPeople().map(p=>p.id):[to];
 const jobs=(Array.isArray(r.jobs)?r.jobs:[]).filter(j=>j&&typeof j==='object').map(j=>{
  if(!j||typeof j.quote==='string'&&j.quote.trim()&&text.includes(j.quote))return j;
  // 「操作輪を調べて」→「操作輪を調べる」のような引用の言い換えを補正します。
  if(r.kind==='request'&&actors.includes(j.id)&&conversationChoices(j.id).includes(j.action)&&safeInvestigation(j.action)&&spokenOffer(j.action,text)&&/調べて|調べよう|解読して|読んで|見て|確かめて/.test(text)&&!/しない|やめ|ないで|いけない|たら|なら/.test(text))return {...j,quote:text};
  return j;
 });
 return {...r,jobs,clarify:typeof r.clarify==='string'?r.clarify:''};
}
function validateExplorationIntent(r,to,text){
 if(Array.isArray(r)&&r.length===1)r=r[0];
 if(!r||!Array.isArray(r.jobs)||r.jobs.length>3||!['request','approval','survey','conversation'].includes(r.kind)||typeof r.clarify!=='string'||r.clarify.length>150)throw Error('調査の依頼を確認できませんでした。実行は保留しています。');
 const actors=to==='all'?aiPeople().map(p=>p.id):[to],seen=new Set(),named=to==='all'?aiPeople().filter(p=>mentionsActor(p,text)).map(p=>p.id):[],offers=currentOffers();
 if(r.kind==='approval'&&r.jobs.length===1&&(to===r.jobs[0].id||to==='all'&&named.length===1&&named[0]===r.jobs[0].id)&&!offers[r.jobs[0].id])r.kind='request';
 for(const j of r.jobs)if(!actors.includes(j.id)||seen.has(j.id)||!conversationChoices(j.id).includes(j.action)||typeof j.quote!=='string'||!j.quote.trim()||!text.includes(j.quote)||r.kind!=='request'&&!safeInvestigation(j.action)&&!(r.kind==='approval'&&(COOPERATION_ACTIONS.includes(j.action)||j.action==='open_cache')&&currentOffers()[j.id]?.action===j.action))throw Error('現在できない調査や指定外の仲間への依頼は実行しません。');else seen.add(j.id);
 if(r.kind==='conversation'&&r.jobs.length)throw Error('相談だけで調査を実行しません。');
 if(r.kind==='approval'){const eligible=Object.entries(offers).filter(([id])=>actors.includes(id)&&(named.length!==1||id===named[0]));if(eligible.length!==1)return {jobs:[],clarify:'どの仲間の、どの調査を頼みますか？'};if(r.jobs.some(j=>j.id!==eligible[0][0]||j.action!==eligible[0][1].action))throw Error('了承と直前の提案が一致しません。');}
 if(r.jobs.some(j=>!safeInvestigation(j.action))&&r.jobs.length>1)return {jobs:[],clarify:'仕掛けを動かす依頼は、一人ずつ相談しましょう。'};
 if(r.clarify&&r.jobs.length)throw Error('確認が必要な調査はまだ実行しません。');
 return r;
}
async function explorationIntent(text,to){
 if(state.phase!=='explore'||/^(?:何か|なにか).*(?:見つかった|分かった|わかった)|調べた結果を|何が見つかった|(?:提案して|提案を聞かせて|案を出して)[。？！!?]*$/.test(text))return {jobs:[],clarify:''};
 // 本人の直前の一意な申し出への短い了承。別の保留や反対があれば補いません。
 const offersNow=Object.entries(currentOffers()).filter(([id])=>to==='all'||to===id);
 if(!anyConsentBlocked()&&!currentMapOffer()&&!pendingTransfer&&/^(?:うん[、,\s]*)?(?:はい|お願い(?:します)?|いいよ|やってみて)[。！!\s]*$/.test(text)){
  const consentOffers=consentVoiced(['request']);
  if(!consentOffers&&offersNow.length===1)return validateExplorationIntent({kind:'approval',jobs:[{id:offersNow[0][0],action:offersNow[0][1].action,quote:text}],clarify:''},to,text);
  if(offersNow.length>1)return {jobs:[],clarify:'どの仲間の、どの申し出をお願いしますか？'};
 }
 if(to!=='all'&&PEOPLE.some(p=>p.id===to)&&dialogueFocus(PEOPLE.find(p=>p.id===to),text).type==='profile')return {jobs:[],clarify:''};
 const choices=Object.fromEntries(aiPeople().map(p=>[p.id,Object.fromEntries(conversationChoices(p.id).map(a=>[a,LABEL[a]]))]));
 if(!Object.values(choices).some(x=>Object.keys(x).length)){
  const reason=explorationBlockedReason();
  if(reason&&/調べ|見て|見てみ|確かめ|探して|探って|解読|読んで|開けて/.test(text))return {jobs:[],clarify:reason};
  return {jobs:[],clarify:''};
 }
 const epoch=generation,source=state,room=state.room,offers=currentOffers();
 const raw=await ask(EXPLORATION_INTENT_PROMPT,{text,to,choices,offers,visible:visibleTargets().map(t=>TARGETS[t].name),conversation:chat.filter(c=>!['private','error'].includes(c.kind)).slice(-10)},700);
 if(!responseIsCurrent(epoch,source)||room!==state.room)return {jobs:[],clarify:''};
 let r;try{r=normalizeExplorationIntent(parseAI(raw),to,text);}catch{recordAIFallback('exploration-format');return {jobs:[],clarify:''};}
 // 調査済みへの再依頼は再実行せず、本人が既知の結果を踏まえて返答します。
 if(r&&Array.isArray(r.jobs))r.jobs=r.jobs.filter(j=>!(r.kind==='request'&&(to==='all'||to===j.id)&&aiPeople().some(p=>p.id===j.id)&&typeof j.quote==='string'&&j.quote.trim()&&text.includes(j.quote)&&['inspect','inspect_'+ACTION_TARGET[j.action]].includes(j.action)&&state.seen[j.id]?.includes(ACTION_TARGET[j.action])));
 // 不正な候補で会話全体を止めず、実行を外して仲間の返答へ進みます。
 try{return validateExplorationIntent(r,to,text);}catch{recordAIFallback('exploration-validation');return {jobs:[],clarify:''};}
}
function announceVisiblePoints(){
 if(state.phase!=='explore')return;
 if(explorationBlockedReason())return;
 const fresh=visibleTargets().filter(t=>!announcedPoints.has(state.room+':'+t));
 if(!fresh.length)return;
 fresh.forEach(t=>announcedPoints.add(state.room+':'+t));
 const p=aiPeople()[announcedPoints.size%aiPeople().length];if(!p)return;say(p.name+'（AI）',fresh.map(t=>'「'+TARGETS[t].name+'」').join('と')+'が見えるよ。気になる場所を調べてみよう。');
}
// 議題ごとの相談。保存・戦闘計画とは分け、範囲が変われば破棄します。
function currentConsent(topic){
 if(consents[topic]&&(consents[topic].scope!==CONSENT_TOPICS[topic].scope(state)||state.phase!=='explore'))delete consents[topic];
 return consents[topic]||null;
}
function consentBlocked(topic){const voices=Object.values(currentConsent(topic)?.voices||{});return voices.some(v=>['oppose','question'].includes(v.stance))||new Set(voices.filter(v=>v.stance==='request').map(v=>v.action)).size>1;}
function consentStatus(topic){
 const voices=Object.values(currentConsent(topic)?.voices||{}),blocked=voices.filter(v=>['oppose','question'].includes(v.stance));
 if(blocked.length)return CONSENT_TOPICS[topic].label+'の操作は保留です。'+[...new Set(blocked.map(v=>PEOPLE.find(p=>p.id===v.id).name))].join('・')+'の反対や疑問を確認しましょう。';
 if(new Set(voices.filter(v=>v.stance==='request').map(v=>v.action)).size>1)return CONSENT_TOPICS[topic].conflict;
 return '';
}
function validateConsentSignals(topic,r,lines){
 // 中継モデルが一覧を外側の配列として返す場合も、各発言の検査は同じです。
 if(Array.isArray(r))r=r.length===1&&r[0]?.signals?r[0]:{signals:r};
 if(!r||!Array.isArray(r.signals)||r.signals.length>20)throw Error(CONSENT_TOPICS[topic].label+'の相談を確認できませんでした。実行は保留しています。');
 const seen=new Set();
 for(const v of r.signals){
  const line=lines.find(x=>x.index===v.index);
  if(!line||!CONSENT_TOPICS[topic].actions.includes(v.action)||!['request','oppose','question','withdraw'].includes(v.stance)||typeof v.quote!=='string'||!v.quote.trim()||!line.text.includes(v.quote)||seen.has(v.index+':'+v.action+':'+v.stance))throw Error(CONSENT_TOPICS[topic].label+'の相談に発言根拠がありません。実行は保留しています。');
  seen.add(v.index+':'+v.action+':'+v.stance);
  const same=r.signals.filter(x=>x.index===v.index&&x.action===v.action);if(same.length>1&&(same.length!==2||!same.some(x=>x.stance==='withdraw')||!same.some(x=>x.stance==='request')))throw Error('同じ発言の'+CONSENT_TOPICS[topic].label+'の意見が食い違っています。実行は保留しています。');
 }
 return r.signals.map(v=>({...v,id:lines.find(x=>x.index===v.index).id})).sort((a,b)=>a.index-b.index||(a.stance==='withdraw'?-1:b.stance==='withdraw'?1:0));
}
function mergeConsentSignals(topic,previous,signals,s=state){
 const result={scope:CONSENT_TOPICS[topic].scope(s),voices:{...(previous?.voices||{})}};
 for(const v of signals){const key=v.id+':'+v.action;if(v.stance==='withdraw')delete result.voices[key];else result.voices[key]={id:v.id,action:v.action,stance:v.stance,quote:v.quote};}
 return result;
}
function consentCandidate(topic,d,s=state){
 if(s.phase!=='explore'||!d||d.scope!==CONSENT_TOPICS[topic].scope(s))return null;
 const voices=Object.values(d.voices),requested=[...new Set(voices.filter(v=>v.stance==='request').map(v=>v.action))];
 if(requested.length!==1||voices.some(v=>['oppose','question'].includes(v.stance)))return null;
 const action=requested[0];
 // 本人の提案だけで持ち物の質問を実行に変えません。仲間の依頼・賛成が必要です。
 return voices.some(v=>v.stance==='request'&&v.id!==CONSENT_TOPICS[topic].actor(s)&&v.action===action)&&actionsFor(CONSENT_TOPICS[topic].actor(s),s).includes(action)?action:null;
}
async function settleConsent(topic,start,direct=null){
 if(state.phase!=='explore')return;const actor=CONSENT_TOPICS[topic].actor(state),name=personName(actor);
 const pending=currentConsent(topic),round=chat.slice(start);
 const lines=round.flatMap((c,i)=>{const p=c.kind==='you'?PEOPLE.find(p=>p.id===humanId()):PEOPLE.find(p=>c.who===p.name+'（AI）');return p?[{index:start+i,id:p.id,text:c.text}]:[];});
 // 人間の言い方だけで除外しません。仲間の提案・依頼も相談の入口です。
 if(!direct&&!pending&&!lines.some(c=>CONSENT_TOPICS[topic].mentions.test(c.text)))return;
 const epoch=generation,source=state,scope=CONSENT_TOPICS[topic].scope(state);
 // 明示依頼は分類済みなので、抽出を省いて本人の判断段階へ渡します。
 const text=direct?null:await ask(CONSENT_TOPICS[topic].signalsPrompt, {public:publicView(),actor,addressedTo:recipient,voices:pending?.voices||{},lines},1400);
 if(!responseIsCurrent(epoch,source)||scope!==CONSENT_TOPICS[topic].scope(state))return;
 const signals=(direct?[{index:lines.at(-1).index,id:humanId(),action:direct.action,stance:'request',quote:lines.at(-1).text}]:validateConsentSignals(topic,parseAI(text),lines)).filter(v=>!(v.id===actor&&v.stance==='request'&&!actionsFor(actor).includes(v.action)));
 // 明確な短い了承を分類モデルが落としても、直前の一意な提案と宛先から補います。
 const human=lines.find(v=>v.id===humanId()),prior=[...new Set(Object.values(pending?.voices||{}).filter(v=>v.stance==='request').map(v=>v.action))];
 const otherOffers=Object.keys(currentOffers()).some(id=>recipient==='all'||recipient===id)||currentMapOffer()||pendingTransfer;
 if(human&&prior.length===1&&!otherOffers&&(recipient==='all'||recipient===actor)&&/^(?:うん[、,\s]*)?(?:はい|お願い(?:します)?|いいよ)[。！!\s]*$/.test(human.text)&&!signals.some(v=>v.id===humanId()))signals.push({index:human.index,id:humanId(),action:prior[0],stance:'request',quote:human.text});
 consents[topic]=mergeConsentSignals(topic,pending,signals);
 for(const v of signals)if(!isHuman(v.id)&&v.stance==='request')latestProposal={kind:'consent',id:v.id,action:v.action,topic,room:state.room,epoch:generation};
 const action=consentCandidate(topic,consents[topic]);
 if(!action){
  const voices=Object.values(consents[topic].voices);
  if(!voices.length){delete consents[topic];return;}
  const blocked=voices.filter(v=>['oppose','question'].includes(v.stance));
  if(blocked.length||new Set(voices.filter(v=>v.stance==='request').map(v=>v.action)).size>1)say('GM',consentStatus(topic),'gm');
  else if(voices.some(v=>v.stance==='request'&&v.id!==actor)&&!actionsFor(actor).includes(voices.find(v=>v.stance==='request').action)){say(name,CONSENT_TOPICS[topic].already(state));delete consents[topic];}
  render();return;
 }
 const answer=parseAI(await ask(CONSENT_TOPICS[topic].decisionPrompt(name)+speechStyle(actor),{selfProfile:profileFacts(actor),public:publicView(),proposal:action,voices:consents[topic].voices,conversation:lines},500));
 if(!responseIsCurrent(epoch,source)||scope!==CONSENT_TOPICS[topic].scope(state))return;
 if(typeof answer.speech!=='string'||!answer.speech.trim()||answer.speech.length>350||!['wait',action].includes(answer.action))throw Error(name+'の判断を確認できませんでした。'+CONSENT_TOPICS[topic].label+'の操作は保留しています。');
 const audit=await auditProfile(actor,answer.speech);
 if(!responseIsCurrent(epoch,source)||scope!==CONSENT_TOPICS[topic].scope(state))return;
 if(!audit.valid)throw Error(name+'の判断が人物設定と食い違うため、'+CONSENT_TOPICS[topic].label+'の操作を保留しています。');
 revealProfile(actor,audit.claims);say(name+'（AI）',answer.speech);
 if(answer.action==='wait'){consents[topic].voices[actor+':'+action]={id:actor,action,stance:'question',quote:answer.speech};render();return;}
 if(consentCandidate(topic,consents[topic])!==action)return;
 const out=apply(actor,action,state,actor);sayResult('GM',out.text,'gm');
 if($('sheet')?.open)$('sheet').close();render();return {performed:true};
}
function proposeConsent(topic,id,action,quote){consents[topic]=mergeConsentSignals(topic,currentConsent(topic),[{id,action,stance:'request',quote}]);latestProposal={kind:'consent',id,action,topic,room:state.room,epoch:generation};}
function consentTopicOf(action){return Object.keys(CONSENT_TOPICS).find(topic=>CONSENT_TOPICS[topic].actions.includes(action))||null;}
function consentVoiced(stances){return Object.keys(CONSENT_TOPICS).some(topic=>Object.values(currentConsent(topic)?.voices||{}).some(v=>stances.includes(v.stance)));}
function anyConsentBlocked(){return Object.keys(CONSENT_TOPICS).some(topic=>consentBlocked(topic));}
async function run(task){if(busy)return;const epoch=generation;busy=true;render();try{return await task();}catch(e){if(epoch===generation)say('接続・応答の確認',e.message+' ゲームの状態は保持しています。','error');}finally{if(epoch===generation){busy=false;render();}}}
function request(id,a){if(busy||!actionsFor(id).includes(a))return;const topic=consentTopicOf(a);if(topic&&CONSENT_TOPICS[topic].actor(state)===id&&(consentBlocked(topic)||id!==humanId())){submitMessage(personName(id)+'、'+LABEL[a]+'をお願い。',id);return;}if(!confirmScenarioAction(a))return;const p=PEOPLE.find(p=>p.id===id);if(a==='open_cache'){if(!canShowProposal(id,a))return;if($('sheet').open)$('sheet').close();openDice('cache');return;}if(topic||a==='decode'){say(personName(humanId())+'（あなた）',p.name+'、'+LABEL[a]+'をお願い。','you');const out=apply(id,a,state,humanId());if(out.private)say(p.name,'調べました。分かったことを相談で伝えます。');else sayResult(p.name,out.text,'');render();return;}say(personName(humanId())+'（あなた）',`${p.name}、「${LABEL[a]}」をお願い。`,'you');run(async()=>{const epoch=generation;const r=await checkedReply(p,false,a);if(epoch!==generation||!r)return;acceptAI(p,r,false);});}
async function human(a,requester=null){if(busy)return;const topic=consentTopicOf(a);if(topic&&consentBlocked(topic)){say('GM',consentStatus(topic),'gm');render();return;}if(state.phase==='battle'){planReview=null;plan=[{id:humanId(),action:a}];say(personName(humanId())+'（あなた）',LABEL[a]+'でいこう。','you');const epoch=generation;await run(()=>companions(true));if(epoch!==generation)return;if(plan.length!==4){plan=[];render();}return;}const out=apply(humanId(),a);humanRequests=humanRequests.filter(r=>r.action!==a&&actionsFor(humanId()).includes(r.action));if(!out.private){sayResult('GM',out.text,'gm');const responder=requester||(HUMAN_CONVERSATION_ACTIONS.includes(a)?'brom':null);if(responder)say(personName(responder)+'（AI）',humanActionReply(a,responder));cooperationFollowup(humanId(),a);}render();return {performed:true};}
function gmText(text){const clean=text.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');let value;try{value=JSON.parse(clean);}catch{return clean;}if(typeof value==='string')return value;for(const key of ['response','text','speech'])if(typeof value?.[key]==='string')return value[key];throw Error('GMの返答を文章として確認できませんでした。もう一度相談してください。');}
async function consultGM(question){if(scenarioGMHint(question))return;const epoch=generation;const text=await ask('あなたはTRPGのGM。現在地で見える事実と共有された情報だけを整理し、次の相談を促す短い問いを1つ出す。既知の能力を案内してよい。知らない人物情報は本人へ尋ねるよう促す。未共有の個別情報や未訪問の場所の仕組みを暴露しない。行動を代行しない。入力された相談に答え、120文字以内の本文だけを返す。JSONやコードブロックは不要。blockedがあれば、それが今は調べられない理由なので、最初にその理由と解決の頼み先を伝える。',{question,blocked:explorationBlockedReason(),public:publicView(),characters:PEOPLE.map(p=>({name:p.name,role:p.role,known:visibleProfile(p.id)})),shared:state.shared.slice(-16),conversation:chat.filter(c=>c.kind!=='error').slice(-12)});if(epoch===generation)say('GM',gmText(text),'gm');}

// 点灯・消灯の明示的な依頼だけを受理。質問・仮定・複数の指示は相談に残します。
function submitMessage(text,to=recipient){
 if(!text||busy||battlePreview)return;
 const turn={turnId:Date.now().toString(36)+'-'+(++aiTurnSerial),started:aiClock(),calls:0,totalMs:0,fallbacks:{}};aiTurn=turn;
 try{const result=submitMessageBody(text,to);if(result&&typeof result.then==='function')return result.finally(()=>{finishAITurn(turn);});finishAITurn(turn);return result;}catch(error){finishAITurn(turn);throw error;}
}
function isShortApproval(text){return /^(?:(?:うん|そうだね|そうだな|そうしよう|いいね|了解|オーケー|OK)[、,。！!\s]+)?(?:はい|お願い(?:します|ね)?|いいよ|やってみて|頼む|頼んだ|よろしく)[。！!\s]*$/.test(text);}
function shortApproval(text,to){
 if(!isShortApproval(text)||!latestProposal||latestProposal.epoch!==generation||latestProposal.room!==state.room||state.phase!=='explore'||to!=='all'&&to!==latestProposal.id||pendingTransfer||currentMapOffer())return null;
 const {kind,id,action,topic}=latestProposal;
 if(kind==='offer'){
  if(currentOffers()[id]?.action!==action)return null;
  return run(()=>companions(false,to,[{id,action,quote:text}]));
 }
 if(currentConsent(topic)?.voices[id+':'+action]?.stance!=='request')return null;
 if(consentBlocked(topic)){say('GM',consentStatus(topic),'gm');render();return {performed:false};}
 if(CONSENT_TOPICS[topic].actor(state)!==id||!actionsFor(id).includes(action))return null;
 const out=apply(id,action,state,humanId());sayResult(personName(id),out.text,'');render();announceVisiblePoints();return {performed:true};
}
function submitMessageBody(text,to=recipient){
 if(!text||busy)return;stopVoice();recipient=to;updateRecipients();const name=recipientName(to);say(personName(humanId())+'（あなた）→'+name,text,'you');state.shared.push(personName(humanId())+'→'+name+'：'+text);
 shareMentionedClues(text);
 const own=humanMessageIntent(text,to);
 if(own){
  if(own.action)return actFromConversation(own);
  if(own.pause){for(const r of own.pause)r.paused=true;if(own.cancel)humanRequests=humanRequests.filter(r=>!own.pause.includes(r));say(personName(own.pause.at(-1).id)+'（AI）',own.cancel?'分かった。その依頼はいったん取り下げるよ。':'分かった。作業は待つよ。準備ができたら、自分が何をするか教えて。');}
  else say('GM',own.clarify,'gm');render();return {performed:false};
 }
 const equipment=equipmentIntent(text,to);if(equipment){if(equipment.clarify){say('GM',equipment.clarify,'gm');render();return {performed:false};}return run(()=>handleEquipment(equipment,text));}
 const navigation=navigationIntent(text,to);if(navigation)return run(()=>handleNavigation(navigation));
 if(cooperationConversation(text,to)){render();return {performed:false};}
 const wheel=wheelConversation(text);if(wheel){if(wheel.selfAction)return human(wheel.selfAction).then(result=>{if($('sheet')?.open)$('sheet').close();return result;});say('GM',wheel.clarify,'gm');render();return {performed:false};}
 const approval=shortApproval(text,to);if(approval!==null)return approval;
 for(const topic of Object.keys(CONSENT_TOPICS)){
  const direct=CONSENT_TOPICS[topic].direct(text,to);
  if(direct&&!consentBlocked(topic)){
   const {actor,action}=direct;
   if(!actionsFor(actor).includes(action)){say(personName(actor),CONSENT_TOPICS[topic].unavailable(actor,action,state));render();return {performed:false};}
   // AI仲間の品は明示依頼でも本人が了承・拒否します。自分の品だけその場で操作します。
   if(actor!==humanId())return run(()=>settleConsent(topic,chat.length-1,{action}));
   const out=apply(actor,action,state,humanId());sayResult(personName(actor),out.text,'');render();announceVisiblePoints();return {performed:true};
  }
 }
 return run(async()=>{const epoch=generation;const transfer=await transferIntent(text,to);if(epoch!==generation||transfer?.stale)return;if(transfer?.cancelled){say('GM','保留していた受け渡しを取り消しました。','gm');return {performed:false};}if(transfer?.clarify){say('GM',transfer.clarify,'gm');return {performed:false};}if(transfer?.transfer)return handleTransfer(transfer.transfer,text);if(mentionsOwnProfile(text)){const audit=await auditProfile(humanId(),text);if(epoch!==generation)return;if(!audit.valid){state.profiles.feedback[humanId()]='GM：'+audit.conflicts.map(c=>profileFacts(humanId())[c.key].label+'は'+profileFacts(humanId())[c.key].value).join('／')+'。シートを確認して言い直してみましょう。';say('GM','イネスの自己紹介に設定との食い違いがあります。'+audit.conflicts.map(c=>profileFacts(humanId())[c.key].label+'：'+profileFacts(humanId())[c.key].value).join('／')+'。自分のシートを確認して言い直してみましょう。','gm');const at=state.shared.indexOf(personName(humanId())+'→'+name+'：'+text);if(at>=0)state.shared.splice(at,1);render();return;}delete state.profiles.feedback[humanId()];revealProfile(humanId(),audit.claims,state,'イネスの自己紹介');}if(to==='gm')return consultGM(text);const intent=await explorationIntent(text,to);if(epoch!==generation)return;if(intent.clarify){say('GM',intent.clarify,'gm');return;}return companions(false,to,intent.jobs);});
}
// 自分の設定・自分が知る情報だけで台詞を補助。生成結果は確定した発言とは別です。
let roleRequest=0,roleOrigin=null,rolePending=false;
function roleContext(intent,to,s=state){return {intent,recipient:recipientName(to),actor:{name:personName(humanId()),tone:CHAT_TONE[humanId()],voice:characterVoice(humanId()),profile:visibleProfile(humanId(),s,humanId()),inventory:inventoryView(humanId(),s).items},others:aiPeople().map(p=>({name:p.name,known:visibleProfile(p.id,s,humanId())})),scene:{name:ROOMS[s.room].name,phase:s.phase,lit:s.lit},ownKnowledge:s.knowledge[humanId()],ownClues:s.discovery.clues[humanId()].map(k=>CLUES[k]),shared:s.shared.slice(-12),conversation:chat.filter(c=>c.kind!=='error').slice(-8)};}
function roleText(raw){const text=gmText(raw).trim();if(!text||text.length>500)throw Error('下書きを短い台詞として確認できませんでした。自分の言葉で続けられます。');return text;}
function openRoleHelp(input='message',to=recipient){if(busy)return;stopVoice();roleRequest++;rolePending=false;roleOrigin={input,to,epoch:generation,room:state.room,source:$(input)?.value||''};$('roleIntent').value=roleOrigin.source;$('roleDraft').value='';$('roleGenerate').disabled=false;$('roleUse').disabled=false;$('roleStatus').textContent='下書きは演技のきっかけです。どう話すかはあなたが決めます。';$('rolePanel').showModal();$('roleIntent').focus();}
async function generateRoleDraft(){
 const intent=$('roleIntent').value.trim();if(!intent||rolePending)return;const request=++roleRequest,epoch=generation,source=state,room=state.room,phase=state.phase,draft=$('roleDraft').value;rolePending=true;$('roleGenerate').disabled=true;$('roleStatus').textContent='言葉のきっかけを考えています…';
 try{const raw=await ask(ROLE_PROMPT,roleContext(intent,roleOrigin.to),500);if(request!==roleRequest||!responseIsCurrent(epoch,source)||room!==state.room||phase!==state.phase||!$('rolePanel').open)return;if($('roleIntent').value.trim()!==intent){$('roleStatus').textContent='意図が変わったため、古い下書きは使いません。もう一度頼めます。';return;}const text=roleText(raw);if($('roleDraft').value===draft){$('roleDraft').value=text;$('roleStatus').textContent='途中からアドリブしても、全部言い換えても大丈夫です。';}else $('roleStatus').textContent='編集中の下書きを残しました。必要ならもう一度頼めます。';}
 catch(e){if(request===roleRequest)$('roleStatus').textContent='下書きを作れませんでした。'+e.message+' 自分で書いて続けられます。';}
 finally{if(request===roleRequest){rolePending=false;$('roleGenerate').disabled=false;}}
}
function setupRoleHelp(){
 $('roleOpen').onclick=()=>openRoleHelp();$('roleGenerate').onclick=generateRoleDraft;
 const close=()=>{$('rolePanel').close();roleRequest++;rolePending=false;};$('roleClose').onclick=$('roleBack').onclick=close;$('rolePanel').addEventListener('cancel',()=>{roleRequest++;rolePending=false;});
 $('roleUse').onclick=()=>{const input=roleOrigin&&$(roleOrigin.input);if(!input||roleOrigin.epoch!==generation||roleOrigin.room!==state.room){$('roleStatus').textContent='場面が変わりました。今の場面から開き直してください。';return;}if(input.value!==roleOrigin.source){$('roleStatus').textContent='元の入力欄が変更されています。下書きを手で写すか、開き直してください。';return;}input.value=$('roleDraft').value;input.dispatchEvent(new Event('input',{bubbles:true}));close();input.focus();};
}
