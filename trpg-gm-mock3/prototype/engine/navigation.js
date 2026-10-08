// 出口・地図・移動。
function visibleExits(s=state){return s.phase==='explore'&&s.lit?ROOMS[s.room].links.map(id=>({id,passage:PASSAGES[s.room][id],name:s.navigation.known.includes(id)||s.visited.includes(id)?ROOMS[id].name:null,visited:s.visited.includes(id)})):[];}
function mapOptions(s=state,viewer=humanId()){return PEOPLE.flatMap(p=>knownItems(p.id,s,viewer)).filter(item=>Object.hasOwn(MAPS,item.id));}
function navigationView(s=state){return {exits:visibleExits(s),maps:mapOptions(s).filter(m=>PEOPLE.every(p=>knowsProfile(m.holder,itemKey(m.holder,m.id),s,p.id))).map(m=>({item:m.id,name:m.name,holder:m.holder,shared:s.navigation.maps.includes(m.id)})),known:mapRecord(s)};}
function readMap(holder,item,s=state){
 if(!Object.hasOwn(MAPS,item)||!hasItem(holder,item,s))throw Error('その地図を今持っている人に頼んでみましょう。');
 if(s.phase!=='explore')throw Error('今は地図を広げる余裕がありません。');
 if(!s.lit&&!s.discovery.stoneOn)throw Error('暗くて地図を読めません。先に灯りを用意しましょう。');
 s.navigation.known=[...new Set([...s.navigation.known,...MAPS[item].rooms])];if(!s.navigation.maps.includes(item))s.navigation.maps.push(item);s.navigation.offer=null;
 revealProfile(holder,[{key:itemKey(holder,item)}],s,'地図を広げた');
 if(s===state)recordAction(holder,'map',humanId(),s.room,{text:MAPS[item].rooms.map(id=>ROOMS[id].name).join('・')+'が地図に記されている。'});
 return MAPS[item].rooms.map(id=>ROOMS[id].name);
}
function currentMapOffer(s=state){const r=s.navigation.offer;return r&&r.room===s.room&&s.phase==='explore'&&hasItem(r.holder,r.item,s)&&!s.navigation.maps.includes(r.item)?r:null;}
function rememberMapOffer(p,speech){
 if(state.phase!=='explore'||! /地図|坑道図/.test(speech)||! /(?:広げ|見せ)(?:てみ|よう|ましょう|ます|ても)|(?:地図|坑道図).*(?:読んで|読みま|見よう)/.test(speech)||/見せない|広げない|持っていない|広げた|見せた|見せてもら|読んでくれ/.test(speech)||PEOPLE.some(other=>other.id!==p.id&&new RegExp(other.name+'(?:の地図|の坑道図|[、,\\s].*(?:地図|坑道図).*(?:見せて|広げて))').test(speech)))return;
 const own=mapOptions().filter(m=>m.holder===p.id&&!state.navigation.maps.includes(m.id));
 if(own.length===1)state.navigation.offer={holder:p.id,item:own[0].id,room:state.room};
}
// 共有された実結果と公開の取得状態だけをまとめます。本人だけの発見は含めません。
function showMap(holder=state.items[SCENARIO_MAP].holder,item=SCENARIO_MAP){
 const places=readMap(holder,item),dialog=$('sheet');
 sayResult('GM',personName(holder)+'が'+ITEM_DEFS[item].name+'を広げた。'+places.join('・')+'が記されている。未訪問の場所は、地図の記載として覚えておこう。','gm');
 dialog.classList.remove('character-sheet');dialog.setAttribute('aria-labelledby','mapHeading');dialog.classList.add('map-sheet');dialog.dataset.map=item;
 dialog.innerHTML=mapSheetContent(holder,item);
 $('mapback').onclick=()=>sheet(holder,'items');$('closesheet').onclick=()=>dialog.close();
 $('mapChat').onsubmit=e=>{e.preventDefault();if(busy)return;const text=$('mapMessage').value.trim();if(text){$('mapMessage').value='';submitMessage(text,'all');}};
 if(!dialog.open)dialog.showModal();render();return {performed:true};
}
async function requestMap(holder,item){
 try{if(!hasItem(holder,item)||!Object.hasOwn(MAPS,item))throw Error('その地図を今持っている人に頼んでみましょう。');if(state.phase!=='explore')throw Error('今は地図を広げる余裕がありません。');if(!state.lit&&!state.discovery.stoneOn)throw Error('今は地図を読めません。先に灯りを用意しましょう。');}
 catch(e){say('GM',e.message,'gm');state.profiles.feedback[holder]=e.message;render();return {performed:false};}
 if(holder===humanId())return showMap(holder,item);
 const epoch=generation,source=state,room=state.room;
 try{
 const reply=parseAI(await ask('あなたは'+personName(holder)+'。仲間から、今持っている地図を見せてほしいと頼まれた。通常は地図を広げることを了承する。自分の設定と会話を踏まえ、理由があればwaitとして短く伝える。まだ地図を読んでいないので行き先や地図の内容を創作せず、これから広げる意思だけを話す。地図を渡す・貸すこととは別で、所有・所持は変えない。JSONだけ:{"decision":"showまたはwait","speech":"80文字以内"}。'+speechStyle(holder),{item:ITEM_DEFS[item].name,inventory:inventoryView(holder),selfProfile:profileFacts(holder),public:publicView(),conversation:chat.filter(c=>!['private','error'].includes(c.kind)).slice(-8)},450));
 if(!responseIsCurrent(epoch,source)||room!==state.room)return {performed:false};
 if(!reply||!['show','wait'].includes(reply.decision)||typeof reply.speech!=='string'||!reply.speech.trim()||reply.speech.length>350)throw Error('地図を見せる本人の返答を確認できませんでした。');
 const audit=await auditProfile(holder,reply.speech);if(!responseIsCurrent(epoch,source)||room!==state.room)return {performed:false};
 if(!audit.valid)throw Error('地図の返答が人物設定と食い違うため、共有を保留します。');
 if(!hasItem(holder,item))throw Error('地図を持つ人が変わりました。今持っている人に頼みましょう。');
 revealProfile(holder,audit.claims);say(personName(holder)+'（AI）',reply.speech);
 if(reply.decision==='wait'){state.profiles.feedback[holder]=personName(holder)+'：'+reply.speech;return {performed:false};}delete state.profiles.feedback[holder];return showMap(holder,item);
 }catch(e){if(epoch===generation&&source===state)state.profiles.feedback[holder]=/quota|利用上限/i.test(e.message)?'AIの利用上限に達したため、地図の返答を待っています。利用枠が回復してから再試行してください。':'地図の依頼を保留しました。会話ログのエラーを確認し、再試行してください。';throw e;}
}
function travel(to){
 const text=move(to);sayResult('GM',text,'gm');target=null;if($('sheet')?.open)$('sheet').close();cooperationFollowup(humanId(),'move');render();announceVisiblePoints();return {performed:true};
}
async function handleNavigation(intent){
 if(intent.kind==='map')return requestMap(intent.holder,intent.item);
 if(intent.kind==='move')return travel(intent.to);
 if(intent.kind==='advance')return handleAdvance();
 if(intent.kind==='clarify'){say('GM',intent.text,'gm');render();return {performed:false};}
 const exits=visibleExits();say('GM',exits.length?'今見える道は'+exits.map(e=>'「'+(e.name||e.passage)+'」').join('と')+'です。どちらへ進むか相談しよう。地図で行き先を確かめることもできます。':'暗くて通路が見えません。先に灯りを用意しよう。','gm');
 await companions(false,recipient);return {performed:false};
}
