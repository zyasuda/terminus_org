// WebGL描画の代わりに実際のThree.jsの場面・材質を調べます。見た目は実ブラウザーで別途確認します。
const fs=require('node:fs'),vm=require('node:vm');
(async()=>{
 const THREE=await import('./vendor/three/three.module.min.js');let time=0,frame,rendered,renderCamera,checks=0;
 const ok=(v,m)=>{checks++;if(!v)throw Error(m)};
 const glbRequests=[];
 const drawing=new Proxy({createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});
 const canvas=()=>({getContext:()=>drawing,setAttribute(){},addEventListener(){}});
 class Renderer{constructor(){this.domElement=canvas();}setPixelRatio(){}setSize(){}render(s,c){rendered=s;renderCamera=c;}}
 class Loader{load(url){const t=new THREE.Texture();t.name=url;t.image={width:200,height:400};return t;}}
 const lookButtons=['left','right'].map(look=>({dataset:{look},hidden:false}));
 const host={clientWidth:800,clientHeight:700,dataset:{},prepend(){},classList:{add(){},remove(){}}},controls={querySelector:()=>({textContent:''}),querySelectorAll:()=>lookButtons};
 const testMath=Object.create(Math);testMath.random=()=>.99;
 const context=vm.createContext({location:{search:process.env.MOCK3_TEST_BACKGROUND?'?background='+process.env.MOCK3_TEST_BACKGROUND:''},URLSearchParams,Math:testMath,GLTFLoader:class{load(url,done,progress,fail){glbRequests.push({url,done,fail});}},THREE:{...THREE,WebGLRenderer:Renderer,TextureLoader:Loader},document:{createElement:canvas,querySelector:()=>null,hidden:false},devicePixelRatio:1,performance:{now:()=>time},ResizeObserver:class{observe(){}},requestAnimationFrame:f=>frame=f});
 require('./load-prototype.cjs').load(context);
 const source=fs.readFileSync(__dirname+'/stage.js','utf8').replace(/^import[^\n]*\n/gm,'').replace('export const STAGE_FACINGS','const STAGE_FACINGS').replace('export const STAGE_DEFAULTS','const STAGE_DEFAULTS').replace('export function createStage','function createStage');vm.runInContext(source,context);
 const view=context.createStage(host,controls,()=>{}),tick=(n=60)=>{for(let i=0;i<n;i++){time+=34;frame(time);}},snapshot={room:'entry',phase:'explore',image:'mine_entrance',lit:true,end:false,battle:false,actors:[{id:'ines',heightCm:155,x:42,z:.03},{id:'lydia',heightCm:172,x:70,z:.1}],depth:{size:46,shrink:25}};
 view.sync(snapshot);tick();const before=JSON.stringify(snapshot),sprites=()=>rendered.children.filter(x=>x.isSprite),person=id=>rendered.children.find(x=>x.userData.actorId===id),lights=()=>rendered.children.filter(x=>x.material?.blending===THREE.AdditiveBlending);
 // 既定と ?background=folded は折り返し、?background=flat は4頂点の平面
 {const background=rendered.children.find(o=>o.renderOrder===-3);if(process.env.MOCK3_TEST_BACKGROUND==='flat')ok(host.dataset.stageBackground==='flat'&&background.geometry.attributes.position.count===4,'明示した平面背景にならない');else{const p=background.geometry.attributes.position,u=background.geometry.attributes.uv;ok(host.dataset.stageBackground==='folded'&&p.count===8,'折り返し背景が作られない');ok(Math.abs(p.getZ(0)-11.52*Math.sin(25*Math.PI/180))<.00001&&p.getZ(1)===0&&p.getZ(2)===0,'折り返し幅・角度・中央の平面が不正');ok(Math.abs(u.getX(1)-.18)<.00001&&Math.abs(u.getX(2)-.82)<.00001,'画像のつながりが失われた');}}
 ok(JSON.stringify([...vm.runInContext('STAGE_FACINGS',context)])===JSON.stringify(['front','front-left','front-right','back','back-left','back-right']),'真横を除いた6方向にならない');
 ok(JSON.stringify([...vm.runInContext('STAGE_FACINGS.map(d=>Math.round(THREE.MathUtils.radToDeg(facingAngle(d,25))))',context)])===JSON.stringify([0,-25,25,180,205,155]),'6方向の角度が定義どおりにならない');
 ok(lights().every(x=>!x.visible),'発言していないのに照明が点く');
 for(const id of ['ines','lydia']){const a=person(id),shadow=rendered.children.find(x=>x.userData.contactShadow===id);ok(a.isGroup,'仲間がスタンディー用の立体オブジェクトでない');ok(shadow.position.x===a.position.x&&shadow.position.z===a.position.z&&Math.abs(shadow.position.y-a.position.y)<.01,'接地影が足元からずれる');}
 const ground=rendered.children.find(x=>x.material?.isMeshStandardMaterial);ok(ground.material.map&&ground.material.normalMap&&ground.material.alphaMap,'床の質感・境界のなじみがない');
 const size=()=>{const a=person('ines'),v=a.position.clone().applyMatrix4(renderCamera.matrixWorldInverse);return host.clientHeight*a.scale.y/(-v.z*2*Math.tan(renderCamera.fov*Math.PI/360));};
 const currentSize=size();view.config.fov=48;view.config.depthSpan=4.5;view.config.horizon=46;view.refreshLayout();tick();const oldSize=size();
 view.config.fov=65;view.config.depthSpan=2.6;view.config.horizon=54;view.refreshLayout();tick();
 ok(Math.abs(currentSize-size())<.001&&size()<oldSize,'新しい視野角で人物が小さくならない');
 const horizon=new THREE.Vector3(0,renderCamera.position.y,-100000).project(renderCamera);ok(Math.abs((1-horizon.y)/2-.54)<.00001,'消失点が上端54%にならない');
 const rotation=renderCamera.quaternion.clone();view.setPan(-100,100);tick();ok(+host.dataset.stagePanX>=-view.config.panX&&+host.dataset.stagePanY<=view.config.panY,'平行移動が範囲を超える');ok(lookButtons[0].hidden&&!lookButtons[1].hidden,'左端で左だけ非表示にならない');const leftEnd=+host.dataset.stagePanX,screen=rendered.children.find(o=>o.renderOrder===-3),edgeX=side=>new THREE.Vector3(side*screen.geometry.boundingBox.max.x,renderCamera.position.y,screen.position.z+screen.geometry.boundingBox.max.z).project(renderCamera).x;ok(leftEnd<-1&&edgeX(-1)<-1,'左端で背景の端が見える、または左を向けない');// 左右はカメラの位置を x=0 に固定したまま向きだけを変えます（2026-10-08 平行移動から変更）。
 const yawOf=q=>new THREE.Euler().setFromQuaternion(q,'YXZ').y;ok(renderCamera.position.x===0&&Math.abs(yawOf(renderCamera.quaternion)+Math.atan2(+host.dataset.stagePanX,10-view.config.frontRow))<.001&&renderCamera.quaternion.angleTo(rotation)>.01,'左右を向かずにカメラが平行移動する');
 view.setPan(100,-100);tick();ok(+host.dataset.stagePanX<=view.config.panX&&+host.dataset.stagePanY>=-.8,'右・下の移動が範囲を超える');const rightEnd=+host.dataset.stagePanX;ok(rightEnd===-leftEnd&&edgeX(1)>1,'右端で背景の端が見える、または左右の範囲が対称でない');
 ok(!lookButtons[0].hidden&&lookButtons[1].hidden,'右端で右だけ非表示にならない');
 view.setPan(0,0);tick();ok(lookButtons.every(b=>!b.hidden),'端から戻ってもボタンが再表示されない');ok(host.dataset.stagePanX==='0.00'&&host.dataset.stagePanY==='0.00'&&renderCamera.quaternion.angleTo(rotation)<.000001,'正面へ戻らない');
 view.setPan(-3,0);tick();view.sync({...snapshot,room:'pan-reset-test'});tick();ok(renderCamera.position.x===0&&renderCamera.quaternion.angleTo(rotation)<.000001,'場面が変わっても正面へ向き直らない');view.sync(snapshot);tick();
 view.setPan(0,0);lookButtons[0].onclick();tick(5);ok(+host.dataset.stagePanX<0&&+host.dataset.stagePanX>-view.config.panX,'端への移動に中間のスクロールがない');tick(20);ok(+host.dataset.stagePanX===leftEnd&&lookButtons[0].hidden,'左へ1クリックで端に届かない');lookButtons[1].onclick();tick(20);ok(+host.dataset.stagePanX===rightEnd&&lookButtons[1].hidden,'右へ1クリックで端に届かない');view.setPan(0,0);lookButtons[0].onclick();tick(3);view.setPan(0,0);context.matchMedia=()=>({matches:true});lookButtons[1].onclick();ok(+host.dataset.stagePanX===rightEnd,'動きを減らす設定で即座に端へ移動しない');context.matchMedia=()=>({matches:false});view.setPan(0,0);
 const width=host.clientWidth;host.clientWidth=351;
 for(const height of [320,548.59]){host.clientHeight=height;view.resize();view.setPan(-6,0);tick();ok(view.project('cart').visible,'狭い画面で左の台車に届かない：'+height);
 view.setPan(6,0);tick();ok(view.project('etching').visible&&view.project('cache').visible,'狭い画面で右の調査・塵の位置に届かない：'+height);}
 host.clientWidth=width;host.clientHeight=700;view.resize();view.setPan(0,0);tick();
 const fullParty={...snapshot,actors:[{id:'ines',heightCm:155,x:35,z:.03},{id:'brom',heightCm:135,x:20,z:.2},{id:'gareth',heightCm:184,x:55,z:.5},{id:'lydia',heightCm:172,x:75,z:.8}]};view.sync(fullParty);tick();
 const rows=fullParty.actors.map(p=>person(p.id).userData.depthRow);ok(rows.filter(r=>r==='front').length===2&&rows.filter(r=>r==='middle').length===1&&rows.filter(r=>r==='back').length===1,'探索で手前2人・中間1人・奥1人にならない');ok(person('ines').position.z>1,'人物が従来より手前へ移動しない');
 ok(person('brom').scale.y<person('ines').scale.y&&person('ines').scale.y<person('lydia').scale.y,'イネスの身長が2人の中間でない');
 view.setPan(0,100);tick();const busts=fullParty.actors.map(p=>{const a=person(p.id);return new THREE.Vector3(a.position.x,a.scale.y*view.config.bustLine,a.position.z).project(renderCamera).y;});ok(busts.every(y=>y>=-1.00001)&&Math.abs(Math.min(...busts)+1)<.00001,'上方向の上限で人物の胸元が画面下端に残らない');console.log(JSON.stringify({heightCm:fullParty.actors.map(p=>[p.id,p.heightCm]),upperPan:+host.dataset.stagePanY,bustEdge:Math.min(...busts)}));view.setPan(0,0);
 const exploreCamera=renderCamera.position.clone(),exploreView=renderCamera.quaternion.clone(),exploreSizes=fullParty.actors.map(p=>person(p.id).scale.y);
 view.sync({...fullParty,battle:true,phase:'battle'});tick();ok(person('brom').userData.depthRow==='back'&&person('gareth').userData.depthRow==='back'&&person('lydia').userData.depthRow==='front'&&person('guardian_rampage').userData.depthRow==='farthest','戦闘で4段階の立ち位置にならない');
 const stageActors=fullParty.actors.map(p=>person(p.id)),boss=person('guardian_rampage'),viewAngle=a=>THREE.MathUtils.radToDeg(a.rotation.y-Math.PI-Math.atan2(renderCamera.position.x-a.position.x,renderCamera.position.z-a.position.z));ok(stageActors.every(a=>a.position.x<boss.position.x&&a.userData.facing==='back-right'&&Math.abs(viewAngle(a)+25)<.001),'仲間が背面斜め右25度で左に配置されない');ok(renderCamera.position.distanceTo(exploreCamera)<.000001&&renderCamera.quaternion.angleTo(exploreView)<.000001&&stageActors.every((a,i)=>Math.abs(a.scale.y-exploreSizes[i]*.85)<.000001)&&Math.abs(boss.scale.y-10.2)<.001&&boss.material.map.repeat.x===1,'探索と同じカメラ・仲間0.85倍で番人が1.7倍にならない');ok(person('brom').position.z===person('gareth').position.z&&person('brom').position.z<person('ines').position.z&&person('gareth').position.z<person('lydia').position.z&&person('brom').position.z>boss.position.z,'ガレスとブロムが敵側の前衛にならない');ok(new Set([...stageActors,boss].map(a=>a.position.z.toFixed(3))).size===4,'戦闘の奥行きが4段階でない');console.log(JSON.stringify({battleRows:[...stageActors,boss].map(a=>({id:a.userData.actorId,row:a.userData.depthRow,x:a.position.x,z:a.position.z,angle:THREE.MathUtils.radToDeg(a.rotation.y)}))}));
 const formation=stageActors.map(a=>a.position.clone()),bossBaseZ=boss.position.z,bossBaseScale=boss.scale.y;view.config.battleEnemyX=-3.2;view.refreshLayout();tick();ok(stageActors.every((a,i)=>a.position.equals(formation[i]))&&boss.material.map.repeat.x===-1&&boss.material.map.offset.x===1,'番人の回避移動で仲間が場所を変える');ok(boss.position.z<bossBaseZ&&boss.scale.y<bossBaseScale,'同じ側へ来た番人が奥へ退かず仲間と重なる');ok(person('ines').userData.facing==='back-right'&&person('lydia').userData.facing==='back'&&person('brom').userData.facing==='back-left','番人の左右位置に応じて背面の3方向を選ばない');
 view.setPan(-4,0);ok(boss.material.map.repeat.x===-1,'カメラ移動で敵画像の左右が変わる');view.setPan(-2,0);ok(boss.material.map.repeat.x===-1,'カメラ移動で敵画像の左右が変わる');view.setPan(0,0);
 view.config.battleEnemyX=-8;view.refreshLayout();tick();ok(stageActors.every((a,i)=>a.userData.facing==='back-left'&&Math.abs(viewAngle(a)-25)<.001&&a.position.equals(formation[i]))&&boss.position.x===-8&&boss.material.map.repeat.x===-1,'番人が左へ動いても仲間が立ち位置を保って向き直らない');ok(Math.abs(boss.position.z-(bossBaseZ-1.6))<.001&&Math.abs(boss.scale.y-bossBaseScale*.84)<.001,'同じ側の番人を奥へ1.6移し16％縮められない');const battleCamera=renderCamera.position.clone(),battleAngle=person('ines').rotation.y;view.focusActor('ines');tick(20);ok(renderCamera.position.equals(battleCamera)&&person('ines').rotation.y===battleAngle&&person('ines').userData.facing==='back-left','戦闘中のシート表示でカメラや向きが変わる');
 view.config.battlePartySide='right';view.refreshLayout();tick();ok(stageActors.every((a,i)=>a.position.x===-formation[i].x&&a.position.z===formation[i].z&&a.userData.facing==='back-left'),'右側パーティの配置と敵への向きが揃わない');view.config.battleEnemyX=5.5;view.refreshLayout();tick();ok(stageActors.every((a,i)=>a.position.x===-formation[i].x&&a.position.z===formation[i].z)&&boss.material.map.repeat.x===1&&person('brom').userData.facing==='back-right','番人が右へ動くと右側パーティが場所を変える');view.config.battlePartySide='left';view.refreshLayout();tick();ok(stageActors.every((a,i)=>a.position.equals(formation[i])),'仲間の左配置へ戻らない');
 view.setPan(-3,1);tick();ok(+host.dataset.stagePanX===-3&&+host.dataset.stagePanY>0,'戦闘中に左上へ見渡せない');view.setPan(3,-.6);tick();ok(+host.dataset.stagePanX===3&&+host.dataset.stagePanY<0,'戦闘中に右下へ見渡せない');view.setPan(0,0);tick();
 view.config.battleEnemyX=4;view.config.battleEnemyScale=1.5;view.config.battlePartyForward=3;view.config.battlePartyScale=.75;view.config.battleFacing=35;view.refreshLayout();tick();ok(Math.abs(boss.position.x-4)<.001&&boss.scale.y===9&&Math.abs(person('brom').position.z-3.06)<.001&&Math.abs(person('brom').scale.y-exploreSizes[1]*.75)<.001&&Math.abs(viewAngle(person('brom'))+35)<.001,'戦闘構図の調整が反映されない');view.config.battleEnemyX=5.5;view.config.battleEnemyScale=1.7;view.config.battlePartyForward=2.5;view.config.battlePartyScale=.85;view.config.battleFacing=25;
 host.clientWidth=351;host.clientHeight=320;view.resize();tick();ok(Math.abs(person('lydia').position.x+2.4)<.001&&Math.abs(boss.scale.y-10.2)<.001,'狭い画面で戦闘の間隔が縮まらない');host.clientWidth=width;host.clientHeight=700;view.resize();tick();
 view.sync(snapshot);tick();const positions=snapshot.actors.map(p=>person(p.id).position.clone());view.focusActor('lydia');tick(20);ok(person('lydia').rotation.y===0&&host.dataset.stageFocus==='lydia','シートの対象が正面へ向かない');ok(Math.abs(view.projectActor('lydia').x-host.clientWidth/2)<.5&&renderCamera.position.x===0,'シートの対象へ向き直らない');ok(snapshot.actors.every((p,i)=>person(p.id).position.equals(positions[i])),'シート選択で立ち位置が変わる');
 testMath.random=()=>.1;view.sync({...snapshot,room:'back-facing-test'});tick();const reversed=snapshot.actors.filter(p=>Math.abs(person(p.id).rotation.y)>Math.PI/2);ok(reversed.length===1,'探索の後ろ向きが1人にならない');const reversedId=reversed[0].id,angle=person(reversedId).rotation.y;view.sync({...snapshot,room:'back-facing-test'});tick();ok(person(reversedId).rotation.y===angle,'再描画で向きが再抽選される');view.focusActor(reversedId);tick(20);ok(person(reversedId).rotation.y===0,'後ろ向きの人物がシート選択で正面にならない');testMath.random=()=>.99;view.sync(snapshot);tick();
 console.log(JSON.stringify({characterHeightAt700px:{before:+oldSize.toFixed(2),after:+currentSize.toFixed(2)},depthWidth:{before:4.5,after:view.config.depthSpan},horizonPercent:+((1-horizon.y)*50).toFixed(3)}));
 view.speak('lydia');tick();ok(host.dataset.stageSpot==='lydia'&&lights().every(x=>x.visible),'発言者を照らさない');
 ok(person('lydia').material.color.r>person('ines').material.color.r,'発言者と他の人物の明暗が同じ');
 tick(210);ok(!host.dataset.stageSpot&&lights().every(x=>!x.visible),'7秒後に消えない');
 view.setLight('ines');tick();ok(host.dataset.stageSpot==='ines','手動対象に追従しない');
 const warm=lights()[0].material.color.clone();view.config.spotColor='cool';view.refreshLight();tick();ok(lights()[0].material.color.b>warm.b,'寒色に変わらない');
 view.config.spotWidth=5;view.refreshLight();tick();ok(lights()[0].scale.x===5,'広がりが反映されない');
 view.setLight('guardian_rampage');tick();ok(!host.dataset.stageSpot&&lights().every(x=>!x.visible),'不在の番人を照らす');
 view.setLight('lydia');snapshot.lit=false;view.sync(snapshot);tick();ok(!host.dataset.stageSpot&&lights().every(x=>!x.visible),'暗闇の照明が停止しない');
 ok(rendered.children.filter(x=>x.userData.actorId).every(x=>x.material.color.equals(new THREE.Color(0xffffff))),'暗闇で人物を増光する');
 snapshot.lit=true;view.sync(snapshot);tick();ok(host.dataset.stageSpot==='lydia','再点灯で復帰しない');
 view.config.spotStrength=0;view.refreshLight();tick();ok(!host.dataset.stageSpot&&lights().every(x=>!x.visible),'明るさ0でも点く');
 view.config.spotStrength=.7;view.setLight('auto');view.speak('ines');tick();ok(host.dataset.stageSpot==='ines','自動モードに戻らない');
 snapshot.room='hall';view.sync(snapshot);tick();ok(!host.dataset.stageSpot,'移動後に前の発言を照らす');
 const hallColor=ground.material.color.clone();snapshot.room='drain';view.sync(snapshot);tick();ok(!ground.material.color.equals(hallColor)&&ground.material.roughness<.9,'排水室の床に湿りがない');snapshot.room='entry';ok(JSON.stringify(snapshot)===before,'演出がゲームの入力状態を変更');
 // 背景を回す転換：真横で次の場面を描き、正面へ戻す。回り始めに全員が後ろを向き、次の場面では話した人だけ正面へ向き直る
 testMath.random=()=>.99;view.sync(snapshot);tick();const backdrop=rendered.children.find(x=>x.renderOrder===-3),facesBack=id=>Math.abs(Math.abs(person(id).rotation.y)-Math.PI)<.001;
 const cart=rendered.children.find(x=>x.material?.map?.name.includes('mine-cart')),cartStart=cart.position.clone();
 let applied=0,finished=0;ok(view.revolve(()=>{applied++;view.sync({...snapshot,room:'hall'});},()=>finished++),'探索中に背景を回せない');
 tick(10);ok(applied===0&&backdrop.rotation.y===0,'仲間が後ろを向き終える前に背景が回り始める');
 ok(!view.revolve(()=>{},()=>{}),'回っている途中に二重に回す');
 tick(10);ok(snapshot.actors.every(p=>facesBack(p.id)),'背景が回る前に全員が後ろを向かない');
 tick(10);ok(applied===0&&backdrop.rotation.y<0&&backdrop.rotation.y>-Math.PI/2,'回り始めの背景が右の端を手前へ回さない、または早く差し替わる');
 ok(cart.rotation.y===backdrop.rotation.y&&cart.position.distanceTo(cartStart)>1,'小道具が背景と一緒に回らない');
 tick(30);ok(applied===1&&finished===0,'真横を向いたときに次の場面へ差し替わらない');
 tick(50);ok(finished===1&&backdrop.rotation.y===0,'回し終えた背景が正面に戻らない');
 ok(cart.rotation.y===0&&cart.position.distanceTo(cartStart)<.000001,'転換後に小道具の位置と向きが戻らない');
 ok(snapshot.actors.every(p=>facesBack(p.id)&&person(p.id).userData.facing==='back'),'次の場面で後ろ向きが解ける');
 view.speak('lydia');tick(20);ok(Math.abs(person('lydia').rotation.y)<.001&&facesBack('ines'),'話した人だけが正面を向かない');
 view.sync({...snapshot,room:'drain'});tick();ok(snapshot.actors.every(p=>!facesBack(p.id)),'暗転で移った場面にも後ろ向きが残る');
 view.sync({...snapshot,end:true});tick();ok(!view.revolve(()=>{},()=>{}),'終わった場面で背景を回す');view.sync(snapshot);tick();
 // もともと後ろ寄り（−173°）を向いていた人は、180°へ近い方の7°だけ回る（遠回りの353°はクルクル回って見える。2026-10-07 試遊で発見）。−180°と+180°は同じ向きなので、差は一周の範囲で測る
 person('ines').rotation.y=THREE.MathUtils.degToRad(-173);let travel=0,prev=person('ines').rotation.y;
 ok(view.revolve(()=>view.sync({...snapshot,room:'hall'}),()=>{}),'2回目の転換で背景を回せない');
 for(let i=0;i<110;i++){tick(1);travel+=Math.abs(THREE.MathUtils.euclideanModulo(person('ines').rotation.y-prev+Math.PI,2*Math.PI)-Math.PI);prev=person('ines').rotation.y;}
 ok(travel<THREE.MathUtils.degToRad(10)&&facesBack('ines'),'後ろ寄りの人が遠回りして1周近く回る');
 view.sync(snapshot);tick();
 ok(JSON.stringify(snapshot)===before,'背景を回す転換がゲームの入力状態を変更');
 // 装備と全身差分：本人が装備中の品だけを根拠に選ぶ。借り手へ未作成の武器絵を付けず、絵が無いことを示す
 {const variant=(id,equipment)=>context.scenarioStandeeVariant({id,equipment}),sheets=vm.runInContext('SCENARIO_SHEETS',context);
  ok(variant('gareth',['dagger']).file==='gareth-sheathed'&&!variant('gareth',['dagger']).missing&&variant('gareth',['dagger']).sheet===sheets.gareth,'片手剣を装備したガレスが納刀姿にならない');
  ok(variant('gareth',[]).file==='gareth-empty'&&!variant('gareth',[]).missing&&variant('gareth',[]).sheet.figure.join()==='167,74,680,1224','剣を外したガレスが素体にならない、または素体の印刷範囲が違う');
  ok(variant('ines',['dagger']).file==='ines-empty'&&variant('ines',['dagger']).missing==='ines:dagger','借り手に剣の絵を付ける、または絵が無いことを示さない');
  ok(variant('brom',['hammer','shield']).file==='brom-hammer-shield'&&!variant('brom',['shield','hammer']).missing,'ブロムの現行姿が装備と一致しない');
  ok(variant('brom',[]).file==='brom-empty'&&!variant('brom',[]).missing&&variant('brom',[]).sheet.plate.join()==='125,41,825,1056'&&variant('brom',[]).sheet.figure.join()==='154,69,798,1028','両手が空のブロムが素体にならない、または素体の印刷範囲が違う');
  ok(variant('ines',[]).file==='ines-empty'&&!variant('ines',[]).missing&&variant('ines',[]).sheet.plate.join()==='272,50,709,1212'&&variant('lydia',[]).file==='maren-empty'&&!variant('lydia',[]).missing&&variant('lydia',[]).sheet.figure.join()==='126,64,685,1232'&&variant('lydia',['staff']).file==='maren-v64'&&variant('lydia',['staff']).sheet===sheets.lydia,'イネス・マレンの素体、または杖を装備したマレンの現行姿にならない');
  ok(variant('brom',['shield']).file==='brom-hammer-shield'&&variant('brom',['shield']).missing==='brom:shield'&&variant('brom',['hammer']).missing==='brom:hammer','未作成の金槌のみ・盾のみの絵があるように扱う、または未対応を示さない');
  // 実際の所持・装備状態から選ぶ：装備／外す／貸与／借り手が装備／返却後は未装備／再装備
  vm.runInContext("state=initial();state.phase='battle';placement=makePlacement(true);",context);

   function runStaffChecks(){vm.runInContext("equipItem('lydia','staff',true);",context);ok(vm.runInContext("stageSnapshot().actors.find(p=>p.id==='lydia').equipment.includes('staff') && ownedActions('lydia',['fire','spark'],state).length===2",context),'杖の装備が表示と魔法に反映されない');vm.runInContext("equipItem('lydia','staff',false);",context);ok(vm.runInContext("!stageSnapshot().actors.find(p=>p.id==='lydia').equipment.includes('staff') && ownedActions('lydia',['fire','spark'],state).length===0",context),'杖を外しても魔法を使えてしまう');}
   const worn=id=>vm.runInContext(`scenarioStandeeVariant(stageSnapshot().actors.find(p=>p.id==='${id}'))`,context),run=code=>vm.runInContext(code,context),give=(mode,from,to)=>run(`transferItem({item:'dagger',from:'${from}',to:'${to}',mode:'${mode}'})`);
  ok(worn('gareth').file==='gareth-empty'&&worn('brom').file==='brom-empty'&&worn('ines').file==='ines-empty'&&worn('lydia').file==='maren-empty','開始時に剣・金槌・盾を外した素体にならない、またはイネスが素体・マレンが杖未装備で登場しない');
  {run("state=initial();state.phase='battle';placement=makePlacement(true)");
   run("equipItem('lydia','staff',true)");ok(worn('lydia').file==='maren-v64','杖装備のマレンが杖姿でない');run("equipItem('lydia','lantern',true)");
   run("state.lit=true");ok(worn('lydia').file==='maren-lantern','点灯中にランタン姿にならない');
   run("state.lit=false");ok(worn('lydia').file==='maren-empty','消灯しても素体に戻らない');
   run("battlePreview=true;state.lit=false");ok(worn('lydia').file==='maren-empty','プレビューの照明だけでランタン姿になる');run("battlePreview=false;state.lit=true;transferItem({item:'lantern',from:'lydia',to:'ines',mode:'lend'})");
   ok(worn('lydia').file==='maren-empty'&&worn('ines').file==='ines-empty','貸与後も本人がランタンを持つ、または借り手に未作成の絵を付ける');
   run("transferItem({item:'lantern',from:'ines',to:'lydia',mode:'return'});equipItem('lydia','lantern',true);state.lit=true");ok(worn('lydia').file==='maren-lantern','返却された点灯ランタン姿が戻らない');
   run("equipItem('lydia','staff',false);state.lit=false");ok(worn('lydia').file==='maren-empty','杖未装備の消灯後が素体でない');run("equipItem('lydia','lantern',true);state.lit=true");ok(worn('lydia').file==='maren-lantern','杖未装備の点灯でランタン姿にならない');
   run("state=initial();state.phase='battle';placement=makePlacement(true)");}
  runStaffChecks();
  run("equipItem('gareth','dagger',true)");ok(worn('gareth').file==='gareth-sheathed','装備で納刀姿にならない');
  run("equipItem('gareth','dagger',false)");ok(worn('gareth').file==='gareth-empty'&&!worn('gareth').missing,'外しても剣の絵が残る');
  run("equipItem('gareth','dagger',true)");ok(worn('gareth').file==='gareth-sheathed','再装備で納刀姿に戻らない');
  give('lend','gareth','ines');ok(worn('gareth').file==='gareth-empty'&&worn('ines').file==='ines-empty'&&!worn('ines').missing,'貸与で貸主に剣が残る、または借り手に絵が付く');
  run("equipItem('ines','dagger',true)");ok(worn('ines').file==='ines-empty'&&worn('ines').missing==='ines:dagger'&&worn('gareth').file==='gareth-empty','借り手の装備で絵を偽る');
  give('return','ines','gareth');ok(worn('gareth').file==='gareth-empty'&&!worn('ines').missing,'返却で自動的に納刀姿になる');
  run("equipItem('gareth','dagger',true)");ok(worn('gareth').file==='gareth-sheathed','返却後の再装備で納刀姿に戻らない');
  run("equipItem('brom','hammer',true)");ok(worn('brom').file==='brom-hammer-shield'&&worn('brom').missing==='brom:hammer','金槌だけ装備したブロムの未対応を示さない');
  // 舞台での差し替え：同じ差分は読み直さない／古い応答を捨てる／失敗しても今の姿を残す／足元0・身長1・位置を保つ
  const fake=()=>{const scene=new THREE.Group(),map=new THREE.Texture(),mesh=new THREE.Mesh(new THREE.BoxGeometry(1,2,.04),new THREE.MeshStandardMaterial({map}));scene.add(mesh);const f={scene,disposed:0};for(const o of [mesh.geometry,map])o.addEventListener('dispose',()=>f.disposed++);return f;};
  const dressed=eq=>({...fullParty,actors:fullParty.actors.map(p=>({...p,equipment:eq[p.id]||[]}))}),armed={brom:['hammer','shield'],gareth:['dagger']},bare={brom:['hammer','shield']};
  const garethRequests=()=>glbRequests.filter(r=>r.url.includes('/gareth-')),last=()=>garethRequests().at(-1),g=()=>person('gareth');
  const local=o=>{const parent=o.parent;parent.remove(o);const b=new THREE.Box3().setFromObject(o);parent.add(o);return b;};
  // 最初の同期（装備欄なし＝素体）ではGLBより先に素体のPNGを同じ印刷範囲で出している
  const pngs=g().children.filter(m=>m.material?.map?.name?.includes('gareth-empty-'));
  ok(pngs.length===2&&pngs.every(m=>Math.abs(m.position.y-(1224-1309/2)/1150)<1e-9&&Math.abs(m.geometry.parameters.height-1309/1150)<1e-9)&&pngs[1].rotation.y===Math.PI,'PNG代替が差分の印刷範囲で足元0・身長1にならない');
  let pngDisposed=0;for(const m of pngs)m.material.map.addEventListener('dispose',()=>pngDisposed++);
  const stale=last();ok(stale.url==='./assets/standees/gareth-empty.glb','素体GLBを読まない');
  view.sync(dressed(armed));tick();const place=[g().position.clone(),g().scale.clone(),g().rotation.y];
  ok(last().url==='./assets/standees/gareth-sheathed.glb'&&garethRequests().length===2,'装備したのに納刀姿を読まない');
  view.sync(dressed(armed));tick();ok(garethRequests().length===2,'同じ差分を読み直す');
  const old=fake();stale.done({scene:old.scene});ok(old.disposed===2&&!g().children.includes(old.scene)&&pngs.every(m=>g().children.includes(m)),'古い応答が新しい状態を上書きする、または破棄されない');
  const sheathed=fake();last().done({scene:sheathed.scene});tick();
  ok(g().children.length===1&&g().children[0]===sheathed.scene&&pngDisposed===0&&host.dataset.stageVariants.includes('gareth:gareth-sheathed')&&host.dataset.stageStandees.includes('gareth'),'納刀姿へ差し替わらない、または共用のPNG地図を捨てる');
  {const b=local(sheathed.scene),s=sheets.gareth,body=s.figure[3]-s.figure[1];ok(Math.abs(b.min.y+(s.plate[3]-s.figure[3])/body)<1e-9&&Math.abs(b.max.y-(s.figure[3]-s.plate[1])/body)<1e-9&&Math.abs((b.min.x+b.max.x)/2)<1e-9,'納刀姿の足元0・身長1が揃わない');}
  view.sync(dressed(bare));tick();ok(last().url==='./assets/standees/gareth-empty.glb'&&garethRequests().length===3&&g().children[0]===sheathed.scene,'外したときに素体を読まない、または届く前に姿を消す');
  ok(g().position.equals(place[0])&&g().scale.equals(place[1])&&g().rotation.y===place[2],'装備の変化で位置・身長・向きが変わる');
  const pending=last();view.sync(dressed(armed));tick();ok(garethRequests().length===3,'読み込み済みの姿へ戻るのに読み直す');
  const late=fake();pending.done({scene:late.scene});ok(late.disposed===2&&g().children[0]===sheathed.scene,'取り消した素体の応答が納刀姿を上書きする');
  view.sync(dressed(bare));tick();delete host.dataset.stageAssetError;last().fail(new Error('test'));
  ok(host.dataset.stageAssetError==='standee:gareth:gareth-empty'&&g().children[0]===sheathed.scene&&sheathed.disposed===0&&host.dataset.stageVariants.includes('gareth:gareth-sheathed'),'読み込み失敗で今の姿が消える、またはエラーを示さない');
  const failed=garethRequests().length;view.sync(dressed(bare));tick();ok(garethRequests().length===failed,'失敗した差分を同期のたびに読み直す');
  view.sync(dressed(armed));tick();view.sync(dressed(bare));tick();const empty=fake();last().done({scene:empty.scene});tick();
  ok(g().children[0]===empty.scene&&sheathed.disposed===2&&host.dataset.stageVariants.includes('gareth:gareth-empty'),'素体へ差し替わらない、または旧GLBの形状・地図を捨てない');
  {const b=local(empty.scene);ok(Math.abs(b.min.y+(1257-1224)/1150)<1e-9&&Math.abs(b.max.y-(1224-40)/1150)<1e-9,'素体の足元0・身長1が揃わない');}
  ok(g().position.equals(place[0])&&g().scale.equals(place[1])&&g().rotation.y===place[2],'差し替え後に位置・身長・向きが変わる');
  view.sync(dressed({...armed,ines:['dagger'],brom:['shield']}));tick();ok(host.dataset.stageEquipmentMissing.split(',').sort().join()==='brom:shield,ines:dagger','絵の無い装備状態を示さない');
  view.sync(dressed(armed));tick();ok(!host.dataset.stageEquipmentMissing,'絵のある状態で未対応を示す');
 }
 console.log('PASS: '+checks+' checks — 発言者追従 / 7秒後の消灯 / 手動照明 / 色・広がり / 不在の人物 / 暗闇の保護 / 再点灯 / 明るさ0 / シーン移動 / 入力状態の保護 / 人物縮小・消失点・左右を向く・位置の固定・4段階の立ち位置・内向きの角度・狭い画面での調査 / スタンディー・足元の影・床の質感 / 背景を回す転換・後ろ向き・話した人だけ正面 / 装備と全身差分・読み直し防止・古い応答・読み込み失敗');
})().catch(e=>{console.error(e);process.exitCode=1});
