const vm=require('node:vm'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
const root=__dirname;
const reference=execFileSync('git',['show','c36fc01:trpg-gm-mock3/prototype/game.js'],{encoding:'utf8',cwd:root});
async function trace(sources){
 const hash=createHash('sha256');let cases=0;
 const math=Object.create(Math);math.random=()=>.5;
 const element={open:false,close(){}};
 const context=vm.createContext({assertDOM:()=>assert.equal(vm.runInContext("$('scene')",context),element),structuredClone,Math:math,document:{getElementById:()=>element},capture:value=>{hash.update(JSON.stringify(value)+'\n');cases++;}});
 for(const source of sources)vm.runInContext(source,context);
 await vm.runInContext(`(async()=>{
 render=()=>{};say=(who,text,kind='')=>chat.push({who,text,kind});
 const snapshot=()=>JSON.parse(JSON.stringify({state,history:actionHistory,chat}));
 const attempt=fn=>{try{return {result:fn()};}catch(e){return {error:e.message};}};
 assertDOM();capture(initial());
 for(let mask=0;mask<256;mask++)for(const room of Object.keys(ROOMS)){
  const s=initial();s.room=room;s.lit=!!(mask&1);s.everLit=!!(mask&2);s.drained=!!(mask&4);s.holding=!!(mask&8);s.locked=!(mask&16);s.supported=!!(mask&32);s.opened=!!(mask&64);s.observedDrain=!!(mask&128);
  s.discovery.etching=!!(mask&2);s.discovery.cache=!!(mask&8);s.discovery.opened=!!(mask&64);s.discovery.stoneOn=!!(mask&128);s.discovery.cacheRetry=!!(mask&32);
  if(mask&16){acquireItem('ines','ironbar',s);s.discovery.shared=Object.keys(CLUES);}
  if(mask&64)acquireItem('gareth','lampstone',s);
  for(const p of PEOPLE){s.discovery.clues[p.id]=mask&32?Object.keys(CLUES):[];s.seen[p.id]=mask&128?Object.keys(TARGETS):[];s.discovery.proposals.push({id:p.id,action:'decode'},{id:p.id,action:'open_cache'});}
  state=s;actionHistory=[];chat=[];
  capture([visibleTargets(s),visibleExits(s),mapRecord(s),discoveryHint(s),publicView(),conversationProgress(),cooperationAdvice(),stageSnapshot()]);
  for(const p of PEOPLE){capture([p.id,actionsFor(p.id,s),Object.keys(TARGETS).map(t=>inspectText(p.id,t,s)),dialogueInput(p,false,null,null)]);
   for(const action of Object.keys(LABEL)){const copy=structuredClone(s);state=copy;actionHistory=[];chat=[];const out=attempt(()=>apply(p.id,action,copy,'ines'));capture([p.id,action,out,snapshot()]);state=s;}
  }
  for(const to of Object.keys(ROOMS)){state=structuredClone(s);actionHistory=[];chat=[];const out=attempt(()=>move(to));capture([to,out,snapshot()]);}state=s;
  for(const n of [1,2,5,7,10,20])for(const support of [false,true]){state=structuredClone(s);actionHistory=[];chat=[];capture([n,support,attempt(()=>resolveCache(state,n,support)),snapshot()]);}state=s;
 }
 for(const n of [1,5,9,10,14,20])for(const round of [1,2])for(const noisy of [false,true]){
  const s=initial();s.phase='battle';s.round=round;s.noisy=noisy;s.boss=noisy?30:24;
  const options=PEOPLE.map(p=>actionsFor(p.id,s));
  for(const a of options[0])for(const b of options[1])for(const c of options[2])for(const d of options[3]){const copy=structuredClone(s),checks=[],jobs=[a,b,c,d].map((action,i)=>({id:PEOPLE[i].id,action}));const out=attempt(()=>resolve(copy,jobs,()=>n,r=>checks.push(r)));capture([jobs,n,out,copy,checks]);}
 }
 state=initial();actionHistory=[];chat=[];
 for(const [id,action] of [['lydia','light'],['ines','scout']]){capture(apply(id,action));capture(snapshot());}
 shareClue('ines','etching');propose('lydia','decode');capture(apply('lydia','decode'));shareClue('lydia','darkness');capture(apply('lydia','douse'));capture(apply('ines','find_cache'));capture(apply('lydia','light'));capture(apply('ines','inspect_cache'));shareClue('ines','cache_lock');propose('gareth','open_cache');capture(resolveCache(state,1));capture(resolveCache(state,7));capture(snapshot());
 for(const finish of ['wedge','crawl','smash']){
  state=initial();actionHistory=[];chat=[];
  const act=(id,a)=>{const out=apply(id,a);capture([out,snapshot()]);};
  const go=to=>{const out=move(to);capture([out,snapshot()]);};
  act('lydia','light');act('ines','inspect_cart');act('ines','take');go('hall');act('gareth','unlock');
  if(finish==='smash')act('brom','smash');
  else {go('entry');go('drain');act('brom','hold');act('ines','pry');go('entry');go('hall');act('brom','support');act('ines',finish);}
  capture(advance());capture(snapshot());
  const jobs=[{id:'ines',action:'study'},{id:'brom',action:'cover'},{id:'gareth',action:'stab'},{id:'lydia',action:'fire'}];
  while(state.phase==='battle'){jobs.at(-1).action=state.fire>0?'fire':'spark';capture(resolve(state,jobs,()=>14));capture(snapshot());}
 }
 for(const phase of ['explore','battle'])for(const text of ['何か見つかった？','どっちに行く？','得意なことは？','ランタンを消してみて'])for(const p of PEOPLE){state=initial();state.phase=phase;chat=[{kind:'you',who:'イネス',text}];ask=async(system,payload)=>{capture([system,payload]);return JSON.stringify({speech:'相談を続けよう。',action:phase==='battle'?actionsFor(p.id)[0]:'wait',share:false});};try{capture(await aiPlayer(p,phase==='battle'));}catch(e){capture(e.message);}}
 })()`,context);
 return {cases,digest:hash.digest('hex')};
}
function referenceLighting(){
 const original=execFileSync('git',['show','c36fc01:trpg-gm-mock3/prototype/lighting-check.cjs'],{encoding:'utf8',cwd:root});
 const stage=execFileSync('git',['show','c36fc01:trpg-gm-mock3/prototype/stage.js'],{encoding:'utf8',cwd:root});
 const test=original.replace("fs.readFileSync(__dirname+'/stage.js','utf8')",JSON.stringify(stage));
 const filename=root+'/lighting-check.cjs';
 return execFileSync(process.execPath,['-e',`const Module=require('node:module');const m=new Module(${JSON.stringify(filename)});m.filename=${JSON.stringify(filename)};m.paths=Module._nodeModulePaths(${JSON.stringify(root)});m._compile(${JSON.stringify(test)},m.filename);`],{encoding:'utf8',cwd:root});
}
function unchangedBodies(){
 const original=vm.createContext({}),current=vm.createContext({});vm.runInContext(reference,original);require('./load-prototype.cjs').load(current);
 const names='initial actionsFor inspectText applyAction move publicView discoveryTargets visibleTargets blueDust discoveryHint canShowProposal propose suggestedAction reportVersion conversationProgress mapRecord drawMap advance targetPortrait initialProfiles inventoryIntroductions dialogueFocus cooperationAdvice cooperationConversation spokenOffer safeInvestigation usefulInvestigation retaliationDamage resolve planIssues arrangePlan cacheBonus cacheOdds resolveCache isOutsideScene lanternActor lanternRequest wheelConversation stageSnapshot makePlacement'.split(' ');
 for(const name of names)assert.equal(vm.runInContext(name+'.toString()',current),vm.runInContext(name+'.toString()',original),name+'の中身が変わった');
 return names.length;
}
(async()=>{
 console.log('PASS: 移動した '+unchangedBodies()+' 関数の本文が分離前と完全一致');
 const before=await trace([reference]),after=await trace(require('./load-prototype.cjs').sources().map(s=>s.source));assert.deepEqual(after,before);
 console.log(JSON.stringify({reference:'c36fc01',...after}));
 console.log('PASS: 同じ状態・入力・出目で状態全体・結果文・行動履歴・会話入力・プロンプトが一致 / DOM参照 / 工具・潜入・破壊の3経路から結末まで');
 const lighting=execFileSync(process.execPath,[root+'/lighting-check.cjs'],{encoding:'utf8',cwd:root});assert.equal(lighting,referenceLighting());
 console.log('PASS: 分離前後の舞台検査70件と座標・角度・サイズの生出力が一致');
})().catch(e=>{console.error(e);process.exitCode=1;});
