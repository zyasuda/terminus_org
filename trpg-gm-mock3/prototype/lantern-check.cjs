const fs=require('node:fs'),vm=require('node:vm');
const loadPrototype=require('./load-prototype.cjs').load;
const context=vm.createContext({document:{getElementById(){}},crypto:require('node:crypto').webcrypto});
loadPrototype(context);
vm.runInContext(`(async()=>{
 let count=0;const ok=(x,m)=>{count++;if(!x)throw Error(m);},rejects=fn=>{try{fn();return false;}catch{return true;}};
 state=initial();render=()=>{};say=(who,text,kind='')=>chat.push({who,text,kind});
 const signal=(id,action,stance,quote='発言')=>({id,action,stance,quote});
 let d=mergeConsentSignals('lantern',null,[signal('lydia','light','request')]);
 ok(consentCandidate('lantern',d)===null,'本人の提案だけで持ち物質問を実行した');
 d=mergeConsentSignals('lantern',d,[signal('brom','light','request')]);ok(consentCandidate('lantern',d)==='light','仲間の依頼を実行できない');
 d=mergeConsentSignals('lantern',d,[signal('ines','light','oppose')]);ok(consentCandidate('lantern',d)===null,'本人の反対を無視');
 d=mergeConsentSignals('lantern',d,[signal('gareth','light','request')]);ok(consentCandidate('lantern',d)===null,'多数の賛成で反対を消した');
 d=mergeConsentSignals('lantern',d,[signal('brom','light','withdraw')]);ok(d.voices['ines:light'].stance==='oppose','他人の撤回で反対を消した');
 d=mergeConsentSignals('lantern',d,[signal('ines','light','withdraw')]);ok(consentCandidate('lantern',d)==='light','本人の撤回後も保留');
 d=mergeConsentSignals('lantern',d,[signal('ines','light','question')]);ok(consentCandidate('lantern',d)===null,'疑問が残ったまま実行');
 d=mergeConsentSignals('lantern',d,[signal('ines','light','request')]);ok(consentCandidate('lantern',d)==='light','本人が納得しても疑問が消えない');
 d=mergeConsentSignals('lantern',d,[signal('gareth','douse','request')]);ok(consentCandidate('lantern',d)===null,'点灯と消灯が食い違っても実行');
 consents.lantern=d;ok(consentBlocked('lantern'),'相反する依頼で明示命令を通した');
 const lit=initial();lit.lit=true;ok(consentCandidate('lantern',mergeConsentSignals('lantern',null,[signal('brom','light','request')],lit),lit)===null,'点灯済みを再実行');
 ok(consentCandidate('lantern',mergeConsentSignals('lantern',null,[signal('brom','douse','request')],lit),lit)==='douse','消灯の同意で実行不可');
 const battle=initial();battle.phase='battle';ok(consentCandidate('lantern',d,battle)===null,'戦闘で探索の灯りを操作');
 const other=initial();other.room='hall';ok(consentCandidate('lantern',d,other)===null,'別シーンの相談を流用');
 consents.lantern=d;state.room='hall';ok(currentConsent('lantern')===null,'移動で保留が破棄されない');state=initial();
 const lines=[{index:2,id:'ines',text:'点灯は反対。'},{index:3,id:'brom',text:'マレン、灯してくれ。'}];
 const compound=validateConsentSignals('lantern',{signals:[{index:3,action:'light',stance:'request',quote:'灯して'},{index:3,action:'light',stance:'withdraw',quote:'灯して'}]},lines);ok(compound[0].stance==='withdraw'&&compound[1].stance==='request','撤回と賛成の複合発言で賛成が消える');
 const validated=validateConsentSignals('lantern',{signals:[{index:2,action:'light',stance:'oppose',quote:'点灯は反対'}]},lines);ok(validated[0].id==='ines','発言者が不正');ok(validateConsentSignals('lantern',[{index:3,action:'light',stance:'request',quote:'灯して'}],lines)[0].id==='brom','実GMの配列形式を扱えない');
 ok(rejects(()=>validateConsentSignals('lantern',{signals:[{index:3,action:'light',stance:'request',quote:'消して'}]},lines)),'未発言の根拠を受理');
 ok(rejects(()=>validateConsentSignals('lantern',{signals:[{index:9,action:'light',stance:'request',quote:'灯して'}]},lines)),'未知の発言を受理');
 ok(rejects(()=>validateConsentSignals('lantern',{signals:[{index:3,action:'smash',stance:'request',quote:'灯して'}]},lines)),'対象外の行動を受理');
 ok(rejects(()=>validateConsentSignals('lantern',{signals:[{index:3,action:'light',stance:'request',quote:'灯して'},{index:3,action:'light',stance:'oppose',quote:'灯して'}]},lines)),'同じ発言の重複を受理');
 function fixture(){state=initial();consents={};actionHistory=[];chat=[{who:'イネス（あなた）→全員',kind:'you',text:'誰か灯りを持ってる？'},{who:'ブロム（AI）',kind:'',text:'マレン、灯してくれ。'}];}
 const gmSignals=JSON.stringify({signals:[{index:1,action:'light',stance:'request',quote:'灯してくれ'}]});
 auditProfile=async()=>({valid:true,claims:[],conflicts:[]});
 fixture();let calls=0;ask=async()=>++calls===1?gmSignals:JSON.stringify({speech:'うん、灯すわ。',action:'light'});await settleConsent('lantern',0);
 ok(state.lit&&actionHistory.length===1&&actionHistory[0].initiator==='lydia','了承から自発点灯・行動記録が成立しない');
 ok(!consents.lantern,'完了した相談が残る');
 calls=0;ask=async()=>++calls===1?gmSignals:JSON.stringify({speech:'灯すわ。',action:'light'});await settleConsent('lantern',0);ok(actionHistory.length===1&&calls===1,'実行済みを二重実行');
 fixture();calls=0;ask=async()=>++calls===1?gmSignals:JSON.stringify({speech:'少し待って、足元を確かめたいわ。',action:'wait'});await settleConsent('lantern',0);
 ok(!state.lit&&actionHistory.length===0&&consentBlocked('lantern'),'本人の保留を無視');
 fixture();calls=0;ask=async()=>++calls===1?gmSignals:JSON.stringify({speech:'扉を壊すわ。',action:'smash'});let wrong=false;try{await settleConsent('lantern',0);}catch{wrong=true;}ok(wrong&&!state.lit&&actionHistory.length===0,'別の行動を実行');
 fixture();ask=async()=>{throw Error('通信失敗');};let disconnected=false;try{await settleConsent('lantern',0);}catch{disconnected=true;}ok(disconnected&&!state.lit&&actionHistory.length===0,'接続失敗で実行');
 fixture();ask=async()=>{generation++;return gmSignals;};await settleConsent('lantern',0);ok(!state.lit&&actionHistory.length===0,'古い応答で実行');
 fixture();calls=0;ask=async()=>++calls===1?gmSignals:JSON.stringify({speech:'灯すわ。',action:'light'});auditProfile=async()=>({valid:false,claims:[],conflicts:[{}]});let mismatch=false;try{await settleConsent('lantern',0);}catch{mismatch=true;}ok(mismatch&&!state.lit&&actionHistory.length===0,'人物照合の失敗を無視');
 // 実ログの会話を再現。人間が「ランタン」と言わなくても仲間の依頼を整理します。
 fixture();auditProfile=async()=>({valid:true,claims:[],conflicts:[]});
 chat=[{who:'イネス（あなた）→全員',kind:'you',text:'誰か明るくして'},{who:'マレン（AI）',kind:'',text:'私が持っているランタンを灯しましょう。'},{who:'ブロム（AI）',kind:'',text:'マレン、ランタン頼めるか。'},{who:'ガレス（AI）',kind:'',text:'マレン、ランタンを頼む。'}];
 calls=0;ask=async()=>++calls===1?JSON.stringify({signals:[{index:2,action:'light',stance:'request',quote:'ランタン頼めるか'},{index:3,action:'light',stance:'request',quote:'ランタンを頼む'}]}):JSON.stringify({speech:'ええ、ランタンを灯します。',action:'light'});
 await settleConsent('lantern',0);ok(state.lit&&actionHistory.length===1&&calls===2,'誰か明るくしてから仲間の依頼・点灯へ進まない');
 fixture();chat[0].text='なんとかして';chat[1].text='マレン、ランタンを頼む。';calls=0;
 ask=async()=>++calls===1?JSON.stringify({signals:[{index:1,action:'light',stance:'request',quote:'ランタンを頼む'}]}):JSON.stringify({speech:'ええ、灯します。',action:'light'});
 await settleConsent('lantern',0);ok(state.lit&&calls===2,'灯りの単語がない人間の発言で仲間のランタン依頼も除外');
 fixture();recipient='lydia';chat=[{who:'イネス（あなた）→マレン',kind:'you',text:'ランタン持ってる？'},{who:'マレン（AI）',kind:'',text:'ええ。ランタンを灯しましょうか？'}];
 ask=async()=>JSON.stringify({signals:[{index:1,action:'light',stance:'request',quote:'ランタンを灯しましょうか'}]});await settleConsent('lantern',0);
 ok(!state.lit&&Object.keys(consents.lantern.voices).length===1,'質問と本人の提案だけで点灯');
 chat.push({who:'イネス（あなた）→マレン',kind:'you',text:'お願いします'},{who:'マレン（AI）',kind:'',text:'ランタンを灯しましょう。'});
 calls=0;let approvalInput;ask=async(system,payload)=>{if(++calls===1){approvalInput=payload;return JSON.stringify({signals:[{index:2,action:'light',stance:'request',quote:'お願いします'},{index:3,action:'light',stance:'request',quote:'ランタンを灯しましょう'}]});}return JSON.stringify({speech:'ええ、灯します。',action:'light'});};
 await settleConsent('lantern',2);ok(state.lit&&calls===2,'直前の点灯提案への短い了承から進まない');
 ok(approvalInput.actor==='lydia'&&approvalInput.addressedTo==='lydia'&&approvalInput.voices['lydia:light'],'短い了承の所持者・宛先・直前の提案が渡されない');
 fixture();chat=[{who:'イネス（あなた）→ブロム',kind:'you',text:'お願いします'},{who:'ブロム（AI）',kind:'',text:'任せてくれ。'}];calls=0;ask=async()=>{calls++;throw Error('灯りと無関係');};await settleConsent('lantern',0);
 ok(calls===0&&!state.lit,'無関係な短い了承を灯りの相談にした');
 // 実ブラウザーで出た signals=[]。一意な直前提案への人間の了承だけ補完します。
 for(const mode of ['approve','wrong-recipient','other-offer','opposition']){
  fixture();recipient=mode==='wrong-recipient'?'brom':'lydia';explorationOffers={};pendingTransfer=null;
  consents.lantern=mergeConsentSignals('lantern',null,[{id:'lydia',action:'light',stance:'request',quote:'灯しましょうか'}]);
  if(mode==='opposition')consents.lantern=mergeConsentSignals('lantern',consents.lantern,[{id:'gareth',action:'light',stance:'oppose',quote:'待って'}]);
  if(mode==='other-offer')pendingTransfer={item:'lantern'};
  chat=[{who:'イネス（あなた）→'+recipientName(recipient),kind:'you',text:'お願いします'}];calls=0;
  ask=async()=>++calls===1?JSON.stringify({signals:[]}):JSON.stringify({speech:'ええ、灯します。',action:'light'});
  await settleConsent('lantern',0);ok(mode==='approve'?state.lit&&calls===2:!state.lit&&calls===1,'短い了承の補完条件が不正：'+mode);
 }
 // 仲間役のLLMへ渡す相談は、分離前と同じ {room,lit,voices} の形のまま渡します。
 fixture();consents.lantern=mergeConsentSignals('lantern',null,[signal('brom','light','request')]);
 ok(JSON.stringify(dialogueInput(PEOPLE[1],false,null,null).lanternDiscussion)===JSON.stringify({room:state.room,lit:state.lit,voices:consents.lantern.voices}),'仲間役への相談の入力形式が変わった');
 // 2026-10-07：本人が今できない操作（点灯中の点灯）を口にしても依頼として残しません。他の仲間の依頼には「すでに灯っている」と答えます。
 fixture();apply('lydia','light');chat=[{who:'イネス（あなた）→全員',kind:'you',text:'壁の傷を見て'},{who:'マレン（AI）',kind:'',text:'ランタンの光を当てて見てみましょう。'}];
 ask=async()=>JSON.stringify({signals:[{index:1,action:'light',stance:'request',quote:'ランタンの光を当てて'}]});await settleConsent('lantern',0);
 ok(!currentConsent('lantern')?.voices['lydia:light'],'点灯中の本人の「光を当てて」を点灯の依頼として残す');
 fixture();apply('lydia','light');chat=[{who:'イネス（あなた）→全員',kind:'you',text:'マレン、ランタンを灯して'}];
 ask=async()=>JSON.stringify({signals:[{index:0,action:'light',stance:'request',quote:'ランタンを灯して'}]});await settleConsent('lantern',0);
 ok(chat.at(-1).text==='ランタンはすでに灯っているよ。'&&!currentConsent('lantern'),'仲間の点灯依頼に「すでに灯っている」と答えない');
 // 2026-10-07：持ち主本人の提案に人間が短く了承したら、本人に聞き直さず実行します。反対や疑問が残っていれば実行しません。
 updateRecipients=()=>{};finishAITurn=()=>{};
 fixture();busy=false;apply('lydia','light');actionHistory=[];calls=0;ask=async()=>{calls++;throw Error('LLMを呼ばない');};
 proposeConsent('lantern','lydia','douse','ランタンを消して見え方を確かめてみましょうか？');
 await submitMessage('そうだね。やってみて','lydia');ok(!state.lit&&actionHistory.at(-1)?.action==='douse'&&calls===0,'本人の消灯提案への短い了承で消灯しない、またはLLMに聞き直す');
 fixture();busy=false;apply('lydia','light');actionHistory=[];ask=async()=>{throw Error('LLMを呼ばない');};
 proposeConsent('lantern','lydia','douse','ランタンを消してみましょうか？');consents.lantern=mergeConsentSignals('lantern',consents.lantern,[signal('gareth','douse','oppose')]);
 await submitMessage('お願い','lydia');ok(state.lit,'反対が残っているのに短い了承で消灯');
 // 2026-10-08：AI仲間の品は明示依頼でも本人が了承してから操作します。分類の呼び出しは省き、本人の判断1回だけです。
 auditProfile=async()=>({valid:true,claims:[],conflicts:[]});
 let decisionInput;fixture();busy=false;calls=0;ask=async(system,payload)=>{calls++;decisionInput=payload;return JSON.stringify({speech:'ええ、灯します。',action:'light'});};
 let sent=await submitMessage('ランタンを灯して','lydia');
 ok(state.lit&&calls===1&&decisionInput.proposal==='light'&&decisionInput.voices['ines:light']?.stance==='request'&&actionHistory.at(-1)?.initiator==='lydia'&&sent?.performed,'明示依頼が本人の了承を経て本人の操作として実行されない');
 fixture();busy=false;ask=async()=>JSON.stringify({speech:'今は暗いままで様子を見たいわ。',action:'wait'});await submitMessage('ランタンを灯して','lydia');
 ok(!state.lit&&actionHistory.length===0&&consentBlocked('lantern'),'本人の保留を無視して明示依頼を実行');
 fixture();busy=false;ask=async()=>{throw Error('通信失敗');};await submitMessage('ランタンを灯して','lydia');ok(!state.lit&&actionHistory.length===0&&chat.at(-1).kind==='error','通信失敗で明示依頼を実行');
 fixture();busy=false;ask=async()=>JSON.stringify({speech:'扉を壊すわ。',action:'smash'});await submitMessage('ランタンを灯して','lydia');ok(!state.lit&&actionHistory.length===0,'明示依頼で別の行動を受理');
 fixture();busy=false;ask=async()=>{generation++;return JSON.stringify({speech:'灯します。',action:'light'});};await submitMessage('ランタンを灯して','lydia');ok(!state.lit&&actionHistory.length===0,'古い判断で明示依頼を実行');
 fixture();busy=false;auditProfile=async()=>({valid:false,claims:[],conflicts:[{}]});ask=async()=>JSON.stringify({speech:'灯します。',action:'light'});await submitMessage('ランタンを灯して','lydia');ok(!state.lit&&actionHistory.length===0,'人物照合の失敗で明示依頼を実行');
 auditProfile=async()=>({valid:true,claims:[],conflicts:[]});
 // 持っていない人には操作させません。持ち主へ渡った後は持ち主が判断します。
 fixture();busy=false;state.items.lantern.holder='brom';calls=0;ask=async()=>{calls++;return JSON.stringify({speech:'灯します。',action:'light'});};
 await submitMessage('ランタンを灯して','lydia');ok(!state.lit&&calls===0&&chat.at(-1).text.includes('ブロムが持っています'),'持っていないマレンが点灯した');
 await submitMessage('ランタンを灯して','brom');ok(state.lit&&calls===1&&actionHistory.at(-1)?.id==='brom'&&actionHistory.at(-1)?.initiator==='brom','持ち主のブロムが了承して点灯しない');
 // 人間が持つランタンは本人の操作なので、聞き直さずに実行します。
 fixture();busy=false;state.items.lantern.holder='ines';calls=0;ask=async()=>{calls++;throw Error('LLMを呼ばない');};
 await submitMessage('イネス、ランタンを灯して','all');ok(state.lit&&calls===0,'自分のランタンを自分で灯せない');
 // 仲間のシートのボタンも同じ了承を経由します。
 fixture();busy=false;calls=0;ask=async()=>{calls++;return JSON.stringify({speech:'少し待って。',action:'wait'});};confirmScenarioAction=()=>true;
 request('lydia','light');for(let i=0;busy&&i<1000;i++)await Promise.resolve();ok(!state.lit&&calls===1&&actionHistory.length===0,'ボタンの依頼が本人の了承を飛ばした');
 return count;
})()`,context).then(n=>console.log('PASS: '+n+' checks — 仲間の依頼 / 明示依頼・ボタンの本人了承・持ち主限定 / 本人の了承・保留 / 反対・疑問・撤回 / 相反する案 / 点灯済み / 二重実行防止 / 発言根拠 / シーン・戦闘の制限 / 通信・形式・人物照合の失敗 / 古い応答')).catch(e=>{console.error(e);process.exitCode=1;});
