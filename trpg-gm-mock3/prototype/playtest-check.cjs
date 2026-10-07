// 試遊で止まった場面を、記録した実際のLLM応答で再生します。成否は台詞ではなく状態で判定します。
// 応答は playtest-cases.json（中継サーバーの記録から抜き出したもの）。記録に無い呼び出しは失敗として数えます。
const vm=require('node:vm');
const {cleanFencedJsonReply}=require('./preview.cjs');
const {cases}=require('./playtest-cases.json');
const context=vm.createContext({document:{getElementById(){}},crypto:require('node:crypto').webcrypto,cases,cleanFencedJsonReply});
require('./load-prototype.cjs').load(context);
vm.runInContext(`(async()=>{
 render=()=>{};updateRecipients=()=>{};finishAITurn=()=>{};say=(who,text,kind='')=>chat.push({who,text,kind});
 let fallbacks=[],unrecorded=[];recordAIFallback=kind=>fallbacks.push(kind);
 const replay=replies=>{const queue=[...replies];return async system=>{const i=queue.findIndex(r=>system.startsWith(r.system));if(i<0){unrecorded.push(system.slice(0,20));throw Error('記録に無い呼び出し');}return cleanFencedJsonReply(queue.splice(i,1)[0].reply);};};
 const results=[];
 for(const c of cases){
  state=initial();chat=[];actionHistory=[];consents={};explorationOffers={};humanRequests=[];pendingTransfer=null;plan=[];fallbacks=[];unrecorded=[];busy=false;recipient=c.to;
  let setup='';
  if(c.setup==='drain'){state.room='drain';state.lit=true;state.everLit=true;}
  if(c.setup==='entry-decoded'){
   // 点灯中の会話（記録では「光を当てて」が点灯の依頼として残った）と、その後の解読からの消灯の提案を、記録どおりに再生します。
   apply('lydia','light');const {lines}=JSON.parse(c.settle.chat);
   chat=Array.from({length:lines[0].index},()=>({who:'GM',text:'',kind:'gm'})).concat(lines.map(l=>({who:l.id==='ines'?'イネス（あなた）→全員':personName(l.id)+'（AI）',text:l.text,kind:l.id==='ines'?'you':''})));
   ask=replay([c.settle.reply]);await settleConsent('lantern',lines[0].index);
   state.discovery.etching=true;learnClue('lydia','etching');propose('lydia','decode');reportInvestigation(PEOPLE[3],'decode',apply('lydia','decode'));
   const voices=Object.keys(currentConsent('lantern')?.voices||{});
   setup=voices.includes('lydia:douse')?'':'前提の相談が再現できない: '+voices.join(',');
  }
  Object.assign(explorationOffers,c.offers||{});
  ask=replay(c.replies);const before=chat.length;
  if(!setup)await submitMessage(c.text,c.to);
  const ok=!setup&&(c.expect==='holding'?state.holding===true:c.expect==='doused'?state.lit===false:false);
  results.push({id:c.id,ok,pending:c.pending||"",setup,fallbacks:[...fallbacks],unrecorded:[...unrecorded],said:chat.slice(before).map(x=>x.who+'：'+x.text.slice(0,60))});
 }
 return results;
})()`,context).then(results=>{
 for(const r of results){
  console.log((r.ok?"PASS":r.pending?"PENDING":"FAIL")+" "+r.id+(r.pending&&!r.ok?"（"+r.pending+"）":""));
  if(!r.ok||process.env.SHOW){if(r.setup)console.log('  '+r.setup);if(r.fallbacks.length)console.log('  代替処理: '+r.fallbacks.join(', '));if(r.unrecorded.length)console.log('  記録に無い呼び出し: '+r.unrecorded.join(', '));for(const s of r.said)console.log('  '+s);}
 }
 const failed=results.filter(r=>!r.ok&&!r.pending).length,pending=results.filter(r=>!r.ok&&r.pending).length;
 console.log(failed?`FAIL: ${failed}/${results.length} 件の場面で依頼が実行されない`:`PASS: ${results.length-pending} 件の場面で依頼どおりに状態が変わる`+(pending?` / 方針で保留 ${pending} 件`:""));
 if(failed)process.exitCode=1;
}).catch(e=>{console.error(e);process.exitCode=1;});
