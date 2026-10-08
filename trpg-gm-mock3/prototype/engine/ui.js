// 画面部品の接続（設定・宛先・演出・会話欄・GM・視線・音声）と起動。
function chronicleMarkdown(entries=chat){return CHRONICLE_HEADER+entries.filter(e=>e.kind!=='error').map((e,i)=>'## '+(i+1)+'. '+e.who+'\n\n'+e.text).join('\n\n');}
function updateAIComparison(){
 const select=$('aiConnection');if(!select)return;select.disabled=busy;select.value=aiConnection;
 if(aiModelInfo){const primary=aiModelInfo.backend==='anthropic'?'Claude':aiModelInfo.backend==='ollama'?'ローカル':'既存接続';select.options[0].textContent=primary+' · '+aiModelInfo.model;const c=aiModelInfo.comparison;select.options[1].textContent='クラウド · '+(c?.cloudModel||'Gemma');select.options[1].disabled=!c?.cloudConfigured||!c?.cloudModelAccepted;
 $('aiModelStatus').textContent=aiConnection==='cloud-gemma'?'Google API · '+c.cloudModel:primary+' · '+aiModelInfo.model+'で試遊中。'+(c?.cloudConfigured?'Gemmaへ切り替えられます。':'GemmaはAPIキー未設定です。');}
 const fallback=$('aiFallbacks');if(fallback)fallback.textContent='形式違反で読み飛ばした回数：'+Object.values(aiFallbacks).reduce((n,v)=>n+v,0)+'回'+(aiLastTurn?' · 直近の発言：'+aiLastTurn.calls+'呼出 · 合計 '+aiLastTurn.totalMs+' ms':'');
 if(aiLastTiming){const t=aiLastTiming;$('aiTiming').textContent='直近のAI通信：'+(t.connection==='cloud-gemma'?'Gemma':aiModelInfo?.backend==='anthropic'?'Claude':'既存接続')+' · '+t.durationMs+' ms · '+(t.ok?'応答あり':'通信エラー')+(t.ok?' · 入力 '+(t.usage.input_tokens||0)+' / 出力 '+(t.usage.output_tokens||0)+' トークン':'');}
}
function setupSystem(){
 const panel=$('systemPanel');
 $('aiConnection').onchange=e=>{if(busy){e.target.value=aiConnection;return;}aiConnection=e.target.value;updateAIComparison();render();};
 const refresh=()=>{$('chroniclePreview').value=chronicleMarkdown();};
 $('systemOpen').onclick=()=>{refresh();$('resetConfirm').hidden=true;panel.showModal();};
 $('systemClose').onclick=()=>panel.close();
 $('diceDemo').onclick=()=>{if(busy)return;panel.close();openDice('demo');};
 $('reset').onclick=()=>{$('resetConfirm').hidden=false;$('resetCancel').focus();};
 $('resetCancel').onclick=()=>{$('resetConfirm').hidden=true;$('reset').focus();};
 $('resetAccept').onclick=()=>{reset();$('resetConfirm').hidden=true;panel.close();};
 $('chronicleControls').ontoggle=()=>{if($('chronicleControls').open)refresh();};
 $('debugEnabled').onchange=e=>{$('effectControls').hidden=!e.target.checked;$('diceDemo').hidden=!e.target.checked;$('stageTuning').hidden=!e.target.checked;$('battleTuning').hidden=!e.target.checked;$('stageLightTuning').hidden=!e.target.checked;$('battlePreviewRow').hidden=!e.target.checked;$('battlePreviewNote').hidden=!e.target.checked;if(!e.target.checked&&battlePreview){battlePreview=false;previewPlacement=null;$('battlePreview').checked=false;render();}};
 $('battlePreview').onchange=e=>{if(busy||state.phase==='battle'){e.target.checked=false;return;}battlePreview=e.target.checked;previewPlacement=null;panel.close();render();};
 $('sceneFade').oninput=e=>{sceneFadeMs=Number(e.target.value);$('sceneFadeValue').textContent=(sceneFadeMs/1000).toFixed(1)+'秒';};
 $('chronicleExport').onclick=()=>{refresh();const blob=new Blob([chronicleMarkdown()],{type:'text/markdown;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='mock3_chronicle_'+new Date().toISOString().slice(0,10)+'.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('chronicleStatus').textContent='Markdownファイルを出力しました。';};
}
function recipientName(id){return id==='all'?'全員':id==='gm'?'GM':PEOPLE.find(p=>p.id===id).name;}
function updateRecipients(){const name=recipientName(recipient);$('messageLabel').textContent=name+'に話しかける';document.querySelectorAll('input[name="recipient"]').forEach(input=>{input.checked=input.value===recipient;input.disabled=busy||battlePreview;});}
function setupRecipients(){const allIcon='<svg viewBox="0 0 36 36" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="18" cy="11" r="4"/><circle cx="7" cy="15" r="3"/><circle cx="29" cy="15" r="3"/><path d="M10 29v-5q0-8 8-8t8 8v5M2 29v-5q0-5 5-5M34 29v-5q0-5-5-5"/></g></svg>';$('recipients').innerHTML='<legend>呼びかけ先</legend>'+[{id:'all',name:'全員'},...aiPeople(),{id:'gm',name:'GM'}].map(p=>`<label class="recipient-choice"><input type="radio" name="recipient" value="${p.id}"><span class="recipient-card">${p.id==='all'?allIcon:`<img src="${p.id==='gm'?'images/gm_mascot.png':'../replay/img/'+(p.id==='lydia'?'maren':p.id)+'.webp'}" alt="">`}<span>${p.name}</span></span></label>`).join('');document.querySelectorAll('input[name="recipient"]').forEach(input=>input.onchange=()=>{if(!busy){recipient=input.value;updateRecipients();}});updateRecipients();}
function updateConversation(){const layout=document.querySelector('.layout');layout.classList.toggle('conversation-folded',conversationFolded);const toggle=$('conversationToggle');toggle.textContent=conversationFolded?'<<'+(conversationUnread?'\n未読 '+conversationUnread:''):'>>';toggle.setAttribute('aria-label',conversationFolded?'会話欄を開く'+(conversationUnread?'、未読'+conversationUnread+'件':''):'会話欄を畳む');toggle.title=conversationFolded?'会話欄を開く':'会話欄を畳む';toggle.setAttribute('aria-expanded',String(!conversationFolded));$('gmdrag').disabled=conversationFolded;(conversationFolded?$('conversation'):document.querySelector('.compose-body')).append($('gmstage'));(conversationFolded?document.querySelector('.sidehead'):document.querySelector('.compose-heading')).append($('systemOpen'));positionGM();}
// 演出の初期値。塵は粒数、ほかは0〜100の強さです。
function lightningLevel(age,duration=LIGHTNING_CONFIG.duration){return age<0||age>=duration?0:(1-age/duration)**2;}
function setupEffects(){
 const panel=$('effectControls');
 panel.innerHTML=`<summary>演出テスト・調整</summary><div class="effect-fields">${[['dust','漂う塵',60],['flame','ランタンの揺らぎ',100],['fog','霧の濃さ',100],['rain','雨の量',100],['wind','風の向き・強さ',100],['lightning','雷光の強さ',100]].map(([id,label,max])=>`<label>${label}<input id="fx-${id}" type="range" min="${id==='wind'?-100:0}" max="${max}" value="${fx[id]}" aria-label="${label}"><output id="fx-value-${id}" for="fx-${id}">${fx[id]}</output></label>`).join('')}${[['shrink','奥の縮小率',0,60],['rise','奥の足元の高さ',0,28],['size','人物の基準サイズ',30,60]].map(([id,label,min,max])=>`<label>${label}<input id="depth-${id}" type="range" min="${min}" max="${max}" value="${depth[id]}" aria-label="${label}"><output id="depth-value-${id}">${depth[id]}%</output></label>`).join('')}<button id="fx-lightning-test" type="button">雷光を試す</button><button id="depth-shuffle" type="button">立ち位置を配置し直す</button><label class="effect-check"><input type="checkbox" id="fx-outside" checked>霧は入口（屋外）のみ</label><label class="effect-check"><input type="checkbox" id="fx-pause">動きを停止して比較</label><button id="fx-reset" type="button">演出を初期値へ</button><p>塵とランタンの光は点灯後に表示。雨のある入口では雷光が時折走ります。坑道内では雷光を表示しません。天候はゲーム進行を変えません。値は再読み込みで戻ります。</p></div>`;
 for(const id of ['dust','flame','fog','rain','wind','lightning'])$('fx-'+id).oninput=e=>{fx[id]=Number(e.target.value);$('fx-value-'+id).value=fx[id];};
 for(const id of ['shrink','rise','size'])$('depth-'+id).oninput=e=>{depth[id]=Number(e.target.value);$('depth-value-'+id).value=depth[id]+'%';renderPlacement();};
 $('depth-shuffle').onclick=()=>{placementKey='';renderPlacement();};
 $('fx-outside').onchange=e=>fx.outdoorsOnly=e.target.checked;
 $('fx-pause').onchange=e=>fx.paused=e.target.checked;
 $('fx-reset').onclick=()=>{Object.assign(depth,DEPTH_DEFAULT);for(const id of ['shrink','rise','size']){$('depth-'+id).value=depth[id];$('depth-value-'+id).value=depth[id]+'%';}renderPlacement();Object.assign(fx,FX_DEFAULT);for(const id of ['dust','flame','fog','rain','wind','lightning']){$('fx-'+id).value=fx[id];$('fx-value-'+id).value=fx[id];}$('fx-outside').checked=fx.outdoorsOnly;$('fx-pause').checked=fx.paused;};
 const canvas=$('sceneEffects'),ctx=canvas.getContext('2d'),motion=matchMedia('(prefers-reduced-motion: reduce)');
 let w=0,h=0,time=0,last=0,lastDraw=0,flashStart=-100,nextFlash=LIGHTNING_CONFIG.firstDelay,flashSeed=1,flashState=null,flashRoom=null,flashOutside=null;
 function strike(){flashStart=time;flashSeed++;flashRoom=state.room;canvas.dataset.lightningStrikes=String(flashSeed-1);nextFlash=time+LIGHTNING_CONFIG.minInterval+Math.random()*(LIGHTNING_CONFIG.maxInterval-LIGHTNING_CONFIG.minInterval);}
 $('fx-lightning-test').onclick=()=>{strike();draw();if(motion.matches&&!fx.paused)setTimeout(()=>{flashStart=-100;draw();},LIGHTNING_CONFIG.duration*1000);};
 // 描画解像度を1.5倍までに制限し、演出は30fpsを上限とします。
 const maxDpr=1.5,frameMs=1000/30;
 const resize=()=>{w=canvas.clientWidth;h=canvas.clientHeight;const dpr=Math.min(devicePixelRatio||1,maxDpr);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);};
 new ResizeObserver(()=>{resize();placeTargetLabels();}).observe(canvas);resize();
 // 演出だけの固定ばらつき。戦闘判定の乱数には触れません。
 const noise=i=>{const n=Math.sin(i*127.1+311.7)*43758.5453;return n-Math.floor(n);};
 const wrap=n=>((n%1)+1)%1;
 function draw(){
  ctx.clearRect(0,0,w,h);if(!state||!w||!h)return;
  const lit=state.lit,outside=isOutsideScene(),weather=!fx.outdoorsOnly||outside;
  if(flashState!==state||flashRoom!==state.room||flashOutside!==outside){flashState=state;flashRoom=state.room;flashOutside=outside;flashStart=-100;nextFlash=time+LIGHTNING_CONFIG.firstDelay;}
  if(outside&&fx.rain>0&&fx.lightning>0&&!fx.paused&&!motion.matches&&time>=nextFlash)strike();
  const flash=outside?lightningLevel(time-flashStart)*fx.lightning/100*(motion.matches ? .35 : 1):0;
  $('scene').style.setProperty('--lightning-flash',flash);
  $('scene').classList.toggle('lightning-flash',flash>0);

  drawScenarioEffects(ctx,w,h,time,noise,wrap,lit);
  if(weather&&fx.fog){
   const amount=fx.fog/100;ctx.fillStyle=`rgba(177,195,195,${amount*.08})`;ctx.fillRect(0,0,w,h);
   for(let i=0;i<6;i++){const x=wrap(noise(i+70)+time*(.006+fx.wind*.00008))*w*1.5-w*.25,y=h*(.18+noise(i+80)*.7),radius=w*(.28+noise(i+90)*.16);ctx.save();ctx.translate(x,y);ctx.scale(1,.45);const g=ctx.createRadialGradient(0,0,0,0,0,radius);g.addColorStop(0,`rgba(191,207,207,${amount*.26})`);g.addColorStop(1,'rgba(191,207,207,0)');ctx.fillStyle=g;ctx.fillRect(-radius,-radius,radius*2,radius*2);ctx.restore();}
  }
  if(lit&&fx.dust){
   for(let i=0;i<fx.dust;i++){const x=wrap(noise(i+1)+time*(.004+noise(i+2)*.008))*w,y=wrap(noise(i+9)-time*.003+Math.sin(time*.35+i)*.02)*h;ctx.fillStyle=`rgba(249,222,164,${.12+noise(i+5)*.45})`;ctx.beginPath();ctx.arc(x,y,.7+noise(i+12)*1.5,0,Math.PI*2);ctx.fill();}
  }
  if(outside&&fx.rain){
   const count=Math.round(fx.rain*2.4),slant=fx.wind*.18;
   ctx.lineWidth=.8;
   for(let i=0;i<count;i++){const y=wrap(noise(i+200)+time*(.65+noise(i+201)*.45))*h,x=wrap(noise(i+300)+time*fx.wind*.001+slant*y/w*.015)*w,length=9+noise(i+400)*15;ctx.strokeStyle=`rgba(186,212,224,${.15+noise(i+500)*.3})`;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-slant*.8,y-length);ctx.stroke();}
   for(let i=0;i<Math.round(fx.rain/12);i++){const age=wrap(time*1.8+noise(i+600));ctx.strokeStyle=`rgba(186,212,224,${(1-age)*.24})`;ctx.beginPath();ctx.ellipse(noise(i+650)*w,h*(.9+noise(i+660)*.08),2+age*8,1+age*2,0,0,Math.PI*2);ctx.stroke();}
  }
  if(flash>0){
   ctx.fillStyle=`rgba(207,227,255,${flash*.3})`;ctx.fillRect(0,0,w,h);
   const start=w*(.08+noise(flashSeed+1000)*.25),length=h*.34;
   ctx.save();ctx.strokeStyle=`rgba(230,244,255,${Math.min(1,flash*2)})`;ctx.lineWidth=2;ctx.shadowColor='#bce3ff';ctx.shadowBlur=12;ctx.beginPath();ctx.moveTo(start,0);
   let x=start,y=0;for(let i=1;i<=7;i++){x=start+(noise(flashSeed*7+i)*2-1)*w*.035+i*w*.008;y=length*i/7;ctx.lineTo(x,y);}ctx.stroke();
   ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(start+w*.02,length*.4);ctx.lineTo(start-w*.035,length*.65);ctx.lineTo(start-w*.025,length*.8);ctx.stroke();ctx.restore();
  }
 }
 redrawEffects=draw;draw();
 function frame(now){requestAnimationFrame(frame);const delta=last?Math.min((now-last)/1000,.1):0;last=now;if(document.hidden)return;if(!fx.paused&&!motion.matches)time+=delta;if(now-lastDraw<frameMs)return;lastDraw=now;draw();}
 requestAnimationFrame(frame);
}

function setupConversation(){
 const layout=document.querySelector('.layout'),split=$('conversationResize');
 // 幅の調整範囲。単位: px。位置・幅は再読み込みすると初期値に戻ります。
 const minWidth=240,maxWidth=420;
 let width=340,drag=null;
 function setWidth(value){width=Math.max(minWidth,Math.min(maxWidth,value));layout.style.setProperty('--conversation-width',width+'px');split.setAttribute('aria-valuenow',String(Math.round(width)));positionGM();}
 split.onpointerdown=e=>{if(e.button!==0)return;drag={id:e.pointerId,x:e.clientX,width};split.setPointerCapture(e.pointerId);e.preventDefault();};
 split.onpointermove=e=>{if(drag&&drag.id===e.pointerId)setWidth(drag.width+drag.x-e.clientX);};
 split.onpointerup=split.onpointercancel=split.onlostpointercapture=()=>{drag=null;};
 split.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();setWidth(e.key==='Home'?minWidth:e.key==='End'?maxWidth:width+(e.key==='ArrowLeft'?10:-10));};
 $('conversationToggle').onclick=()=>{conversationFolded=!conversationFolded;if(!conversationFolded){conversationUnread=0;}updateConversation();if(!conversationFolded)$('log').scrollTop=$('log').scrollHeight;};
 updateConversation();
}
function setupGM(){
$('gmdrag').onpointerdown=e=>{if(conversationFolded||e.button!==0)return;gmDrag={id:e.pointerId,x:e.clientX,y:e.clientY,startX:gmX,startY:gmY};e.currentTarget.setPointerCapture(e.pointerId);};
$('gmdrag').onpointermove=e=>{if(!gmDrag||gmDrag.id!==e.pointerId)return;gmX=gmDrag.startX+e.clientX-gmDrag.x;gmY=gmDrag.startY-e.clientY+gmDrag.y;positionGM();walkGM();};
function stopGMDrag(){gmDrag=null;clearTimeout(gmWalkTimer);$('gmguide').classList.remove('walking');}
$('gmdrag').onpointerup=stopGMDrag;$('gmdrag').onpointercancel=stopGMDrag;$('gmdrag').onlostpointercapture=stopGMDrag;
$('gmdrag').onkeydown=e=>{const step=10;if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();gmX+=e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0;gmY+=e.key==='ArrowUp'?step:e.key==='ArrowDown'?-step:0;positionGM();walkGM();};
new ResizeObserver(positionGM).observe($('gmstage'));new ResizeObserver(()=>{placeTargetLabels();positionContextActions();}).observe($('scene'));
}
// 視線は端末内の表示状態。首を振るだけでは発見・共有・行動は変更しません。
function placeStagePoints(){
 if(!stageView)return;
 if(!$('scene').classList.contains('stage-ready')){$('points').querySelectorAll('[data-target]').forEach(b=>b.hidden=false);if($('dustspot'))$('dustspot').hidden=false;$('actions').hidden=false;placeTargetLabels();return;}
 const bounds=$('scene').getBoundingClientRect();
 for(const b of $('points').querySelectorAll('[data-target]')){const p=stageView.project(b.dataset.target);b.hidden=!p?.visible;if(p){b.style.left=Math.max(8,Math.min(bounds.width-b.offsetWidth-8,p.x-b.offsetWidth/2))+'px';b.style.top=p.y+'px';}}
 const dust=$('dustspot'),p=stageView.project(SCENARIO_DUST_TARGET);if(dust){dust.hidden=!p?.visible;if(p){dust.style.left=p.x+'px';dust.style.top=p.y+'px';}}
 if(target&&!stageView.project(target)?.visible){$('actions').hidden=true;}else $('actions').hidden=false;
 positionContextActions();
}
// マイクは押した間の1発言だけ。認識した文は編集欄へ入り、自動送信しません。
let voiceSession=null;
function stopVoice(){const v=voiceSession;if(!v)return;voiceSession=null;v.recognition.stop();v.button.classList.remove('listening');v.button.setAttribute('aria-pressed','false');}
function startVoice(inputId,button,status){
 if(busy)return;if(voiceSession){stopVoice();return;}const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!Recognition){if(status)status.textContent='このブラウザーは音声入力に未対応です。文字で自由に話せます。';return;}
 const input=$(inputId);if(!input)return;const recognition=new Recognition(),epoch=generation,original=input.value;recognition.lang='ja-JP';recognition.continuous=false;recognition.interimResults=false;
 const session={recognition,button,inputId};voiceSession=session;button.classList.add('listening');button.setAttribute('aria-pressed','true');if(status)status.textContent='聞いています。もう一度押すと停止します。';
 recognition.onresult=e=>{if(voiceSession!==session||epoch!==generation||!input.isConnected)return;const text=Array.from(e.results).filter(r=>r.isFinal).map(r=>r[0].transcript).join('');if(input.value!==original){if(status)status.textContent='編集中の文を残しました。';return;}input.value=(original+(original?' ':'')+text).slice(0,500);input.dispatchEvent(new Event('input',{bubbles:true}));if(status)status.textContent='聞き取った言葉を確認し、自由に直してから「話す」を押してください。';};
 recognition.onerror=e=>{if(voiceSession===session&&status)status.textContent=e.error==='not-allowed'?'マイクが許可されていません。文字入力で続けられます。':'音声を聞き取れませんでした。文字入力で続けられます。';};
 recognition.onend=()=>{if(voiceSession===session){voiceSession=null;button.classList.remove('listening');button.setAttribute('aria-pressed','false');}};
 try{recognition.start();}catch(e){stopVoice();if(status)status.textContent='音声入力を開始できませんでした。文字入力で続けられます。';}
}
function setupVoice(){$('sheet').addEventListener('close',()=>{if(voiceSession?.inputId==='sheetMessage')stopVoice();});$('mainMic').onclick=()=>startVoice('message',$('mainMic'),$('mainVoiceStatus'));document.addEventListener('visibilitychange',()=>{if(document.hidden)stopVoice();});}

function reset(){battlePreview=false;previewPlacement=null;$('battlePreview').checked=false;if(stageView){stageView.setLight('auto');$('stageLightMode').value='auto';}stopVoice();roleRequest++;if($('rolePanel')?.open)$('rolePanel').close();humanRequests=[];sheetDrafts={};pendingTransfer=null;explorationOffers={};latestProposal=null;announcedPoints=new Set();consents={};recipient='all';conversationUnread=0;updateConversation();generation++;state=initial();busy=false;target=null;chat=[];plan=[];actionHistory=[];planReview=null;$('log').replaceChildren();introduceInventory();render();}

// DOMへの接続と起動はここだけ。検査はこの関数を呼ばずに同じファイルを読みます。
function bootGame(){
$('chat').onsubmit=e=>{e.preventDefault();const text=$('message').value.trim();if(!text||busy)return;$('message').value='';submitMessage(text);};
$('message').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();if(!busy)$('chat').requestSubmit();}};
setupRoleHelp();setupVoice();setupRecipients();setupConversation();setupGM();reset();setupEffects();setupSystem();setupDice();fetch('/api/model-info').then(async r=>{apiReady=r.ok;if(r.ok)aiModelInfo=await r.json();updateAIComparison();render();}).catch(()=>render());
}
