const fs=require('node:fs'),vm=require('node:vm');
const script=fs.readFileSync(__dirname+'/game.js','utf8');
const context=vm.createContext({document:{getElementById(){}},crypto:require('node:crypto').webcrypto});
vm.runInContext(script,context,{filename:__dirname+'/game.js'});
vm.runInContext(`(async()=>{
 let count=0;const ok=(value,message)=>{count++;if(!value)throw Error(message);};
 render=()=>{};updateRecipients=()=>{};say=(who,text,kind='')=>chat.push({who,text,kind});
 state=initial();chat=[];lanternDiscussion=null;actionHistory=[];
 const before=JSON.stringify(state.items);
 ok(!knowsProfile('lydia','item2'),'紹介前から地図が公開される');
 introduceInventory();
 ok(chat.length===4&&chat[0].kind==='gm'&&chat[0].text.includes('持ち物を紹介'),'GMから導入が始まらない');
 ok(!chat.some(c=>c.who.includes('イネス（あなた）')),'人間の紹介を代行した');
 ok(!busy&&!state.lit&&actionHistory.length===0&&JSON.stringify(state.items)===before,'紹介だけで操作を待たせたり品を使用・移動した');
 for(const r of inventoryIntroductions()){
  ok(r.items.length>=1&&r.items.length<=2,'紹介する品が1〜2個でない');
  ok(r.items.every(item=>hasItem(r.id,item)&&r.speech.includes(ITEM_DEFS[item].name)),'紹介が実所持や実発言と違う');
  ok(PEOPLE.every(viewer=>r.items.every(item=>knowsProfile(r.id,itemKey(r.id,item),state,viewer.id))),'紹介した品を仲間が覚えていない');
  ok(r.items.every(item=>!knowsProfile(r.id,itemKey(r.id,item,true))),'名前だけの紹介から用途まで開示した');
  ok(!knowsProfile(r.id,'origin')&&!knowsProfile(r.id,'skill0')&&!knowsProfile(r.id,'stat0'),'持ち物紹介から経歴・技能・数値まで漏れた');
 }
 ok(!knowsProfile('lydia','item1')&&knowsProfile('lydia','item2'),'紹介していない杖まで公開／紹介した地図が非公開');
 ok(!knowsProfile('ines','item0',state,'brom')&&!knowsProfile('ines','item1',state,'lydia'),'人間の未発言の所持品を公開');
 ok(state.profiles.history.length===6&&state.profiles.history.every(h=>h.source==='持ち物の紹介'),'紹介の履歴が欠ける');
 ok(lanternDiscussion.voices['lydia:light']&&lanternCandidate(lanternDiscussion)===null,'本人の提案だけで点灯を確定');
 // 紹介直後の短い了承も、灯りの提案と宛先を照合する既存経路へ送ります。
 const start=chat.length;recipient='lydia';chat.push({who:'イネス（あなた）→リディア',text:'お願いします',kind:'you'});
 let calls=0,payload;ask=async(system,input)=>{if(++calls===1){payload=input;return JSON.stringify({signals:[{index:start,action:'light',stance:'request',quote:'お願いします'}]});}return JSON.stringify({speech:'ええ、灯します。',action:'light'});};
 auditProfile=async()=>({valid:true,claims:[],conflicts:[]});await settleLantern(start);
 ok(payload.voices['lydia:light']&&payload.addressedTo==='lydia','導入の提案が短い了承へ引き継がれない');
 ok(state.lit&&actionHistory.length===1&&calls===2,'紹介後の了承から実際に点灯しない');
 // 紹介候補に入っていても、他人が持つ品・存在しない品は名乗りません。
 const moved=initial();moved.items.lantern.holder='brom';delete moved.items.shield;
 const rows=inventoryIntroductions(moved),lydia=rows.find(r=>r.id==='lydia'),brom=rows.find(r=>r.id==='brom');
 ok(lydia.items.join(',')==='lydia_map'&&!lydia.offer&&!lydia.speech.includes('ランタン'),'持っていないランタンを紹介・操作提案');
 ok(brom.items.join(',')==='hammer'&&!brom.speech.includes('盾'),'存在しない品を紹介');
 state=initial();chat=[];lanternDiscussion=null;actionHistory=[];introduceInventory();
 ok(chat.length===4&&state.profiles.history.length===6&&!state.lit,'新しい開始で紹介や点灯が残る');
 ok(mentionsOwnProfile('投げ縄があるよ')&&!mentionsOwnProfile('ランタンを持ってる人は？'),'本人の品名による自己申告を見落とす／他者の質問を自己申告にする');
 acquireItem('ines','ironbar');ok(mentionsOwnProfile('工具を持ってるよ'),'入手品の別名を見落とす');
 // 人間は自分で発言した品だけ公開。質問や虚偽はGM照合で公開しません。
 state=initial();chat=[];lanternDiscussion=null;
 transferIntent=async()=>null;explorationIntent=async()=>({jobs:[]});let replies=0;companions=async()=>{replies++;};
 const key=itemKey('ines','rope');auditProfile=async(id,speech)=>({valid:true,claims:[{key,value:ITEM_DEFS.rope.name,quote:'投げ縄'}],conflicts:[]});
 await submitMessage('投げ縄があるよ','all');
 ok(PEOPLE.every(p=>knowsProfile('ines',key,state,p.id))&&replies===1,'一人称のない人間の持ち物紹介が更新されない');
 ok(!knowsProfile('ines','item1',state,'brom'),'人間が紹介していない地図まで公開');
 state=initial();chat=[];auditProfile=async()=>({valid:true,claims:[],conflicts:[]});await submitMessage('投げ縄を使える人は？','all');
 ok(!knowsProfile('ines',key,state,'brom'),'品名の質問だけで人間の所持品を公開');
 state=initial();chat=[];auditProfile=async()=>({valid:false,claims:[],conflicts:[{key:'item0'}]});const previousReplies=replies;await submitMessage('私は金槌を持っています','all');
 ok(!knowsProfile('ines',key,state,'brom')&&replies===previousReplies&&chat.some(c=>c.kind==='gm'),'設定と違う紹介から会話や開示が進む');
 return count;
})()`,context).then(n=>console.log('PASS: '+n+' checks — GMの導入 / 実所持と発言 / 限定開示 / 個別所有 / 人間の紹介 / 矛盾・質問 / 短い了承から点灯 / 再開始')).catch(e=>{console.error(e);process.exitCode=1;});
