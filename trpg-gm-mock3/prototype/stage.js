import * as THREE from './vendor/three/three.module.min.js';
// 描画だけの舞台です。ゲーム状態・発見・所有物はindex.html側が管理します。
export function createStage(host, controls, changed) {
 const config={
  // 左右の首振りの上限（度）。広げると舞台の端まで見渡せます。
  yaw:42,
  // 縦の視野角（度）。大きいほど広く、小さく見えます。
  fov:48,
  // ドラッグ1pxあたりの首振り（度）。
  sensitivity:.09,
  // 人物を照らす強さ（0〜1）。0で舞台照明を消します。
  spotStrength:.7,
  // 足元の光の直径（舞台座標）。大きいほど広く照らします。
  spotWidth:3.4,
  // 発言後に照明を保つ秒数。次の発言があれば対象を切り替えます。
  spotHoldSeconds:7,
  // 光の移動と明暗の切り替えにかける秒数。
  spotFadeSeconds:.65,
  // 暖色／寒色。背景の昼夜や発見条件とは独立した演出です。
  spotColor:'warm',
 };
 const scene=new THREE.Scene();scene.background=new THREE.Color('#101c20');
 const camera=new THREE.PerspectiveCamera(config.fov,1,.1,100);camera.position.set(0,3.8,10);
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
 const canvas=renderer.domElement;canvas.className='stage-canvas';canvas.tabIndex=0;canvas.setAttribute('aria-label','舞台。ドラッグまたは左右キーで見渡す');host.prepend(canvas);
 const loader=new THREE.TextureLoader(),textures=new Map(),actors=new Map(),props=new Map();let snap=null,yaw=0,room='',dirty=true,last=0,drag=null,lost=false;
 const reducedMotion=typeof matchMedia==='function'?matchMedia('(prefers-reduced-motion: reduce)'):null;
 const point=new THREE.Vector3(),ray=new THREE.Raycaster(),ndc=new THREE.Vector2();
 function texture(url){if(!textures.has(url)){const t=loader.load(url,()=>{dirty=true;if(snap)sync(snap);},undefined,()=>{host.dataset.stageAssetError='true';});t.colorSpace=THREE.SRGBColorSpace;textures.set(url,t);}return textures.get(url);}
 function flat(map,x,y,z,w,h){const p=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map,transparent:true,alphaTest:.1,side:THREE.DoubleSide}));p.position.set(x,y+h/2,z);scene.add(p);return p;}
 // 岩と床は試作用の描画素材。画像の背景を切り取らず、独立したカキワリを作ります。
 function rockTexture(){const c=document.createElement('canvas');c.width=256;c.height=512;const x=c.getContext('2d');const polygons=[[[30,490],[15,285],[39,61],[123,7],[202,87],[246,265],[226,506]],[[30,490],[15,285],[111,316],[130,508]],[[15,285],[39,61],[108,117],[111,316]],[[108,117],[123,7],[202,87],[177,240],[111,316]],[[111,316],[177,240],[246,265],[226,506],[130,508]]];const colors=['#273237','#18272b','#334248','#405055','#233337'];polygons.forEach((p,i)=>{x.beginPath();p.forEach(([a,b],j)=>j?x.lineTo(a,b):x.moveTo(a,b));x.closePath();x.fillStyle=colors[i];x.fill();x.strokeStyle='#111c20';x.lineWidth=4;x.stroke();});for(let i=0;i<1800;i++){const a=(Math.sin(i*127.1)*43758.5)%1,b=(Math.sin(i*311.7)*14758.5)%1;x.fillStyle=i%2?'#ffffff08':'#00000014';x.fillRect(Math.abs(a)*256,Math.abs(b)*512,2,2);}return new THREE.CanvasTexture(c);}
 const rock=rockTexture();rock.colorSpace=THREE.SRGBColorSpace;
 const foreground=[flat(rock,-8.8,-.3,1,3.7,7.5),flat(rock,9.8,-.2,-1,4.5,8.5)];
 const sideL=flat(rock,-18,-1,-5,20,24),sideR=flat(rock,18,-1,-5,20,24);sideL.rotation.y=.75;sideR.rotation.y=-.75;
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(70,70),new THREE.MeshBasicMaterial({color:'#202b2b'}));floor.rotation.x=-Math.PI/2;floor.position.y=-.08;scene.add(floor);
 const back=flat(null,0,-2,-15,48,25);
 // SpriteMaterialは照明を受けないため、光芒・床の光と人物の色を合わせて表現します。
 // 見つかっていない場所は照らさず、ゲーム内の灯りの状態も変更しません。
 function lightTexture(beam=false){const c=document.createElement('canvas');c.width=256;c.height=512;const x=c.getContext('2d');
  if(beam){for(let y=0;y<512;y++){const spread=8+y*.24,g=x.createLinearGradient(128-spread,0,128+spread,0);g.addColorStop(0,'#ffffff00');g.addColorStop(.4,'#ffffffaa');g.addColorStop(.6,'#ffffffaa');g.addColorStop(1,'#ffffff00');x.fillStyle=g;x.globalAlpha=Math.sin(y/512*Math.PI)*.45;x.fillRect(0,y,256,1);}}
  else {x.scale(1,2);const g=x.createRadialGradient(128,128,0,128,128,128);g.addColorStop(0,'#ffffffaa');g.addColorStop(.4,'#ffffff66');g.addColorStop(1,'#ffffff00');x.fillStyle=g;x.fillRect(0,0,256,256);}
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
 }
 const lightMaterial=map=>new THREE.MeshBasicMaterial({map,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});
 const pool=new THREE.Mesh(new THREE.PlaneGeometry(1,1),lightMaterial(lightTexture()));pool.rotation.x=-Math.PI/2;pool.position.y=.015;scene.add(pool);
 const beam=new THREE.Mesh(new THREE.PlaneGeometry(1,1),lightMaterial(lightTexture(true)));scene.add(beam);pool.visible=beam.visible=false;
 let lightMode='auto',speaker='',until=0,level=0,focus='',lightLast=0;const lightPosition=new THREE.Vector3();const weights=new Map();
 function speak(id){if(!['ines','brom','gareth','lydia','guardian_rampage'].includes(id))return;speaker=id;until=performance.now()+config.spotHoldSeconds*1000;dirty=true;}
 function setLight(mode){if(!['auto','off','ines','brom','gareth','lydia','guardian_rampage'].includes(mode))return;lightMode=mode;if(mode==='auto'){speaker='';until=0;}dirty=true;}
 function updateLight(now){const dt=Math.min(.1,Math.max(0,(now-lightLast)/1000));lightLast=now;
  const id=lightMode==='auto'?(now<until?speaker:''):lightMode==='off'?'':lightMode,a=actors.get(id);
  // 消灯中は光芒も人物の増光も止め、蒼い塵を探す条件を保ちます。
  const enabled=!!(snap?.lit&&!snap.end&&a?.sprite.visible&&config.spotStrength>0),target=enabled?config.spotStrength:0,k=reducedMotion?.matches?1:1-Math.exp(-dt*5/config.spotFadeSeconds);
  let moving=Math.abs(target-level)>.001;level=moving?level+(target-level)*k:target;
  if(enabled){if(!focus||level<.005)lightPosition.copy(a.sprite.position);focus=id;moving=lightPosition.distanceTo(a.sprite.position)>.005||moving;lightPosition.lerp(a.sprite.position,k);}
  const color=new THREE.Color(config.spotColor==='cool'?'#acd9ff':'#ffe0a0');pool.material.color.copy(color);beam.material.color.copy(color);
  pool.visible=beam.visible=!!snap?.lit&&!snap.end&&level>.001;pool.position.set(lightPosition.x,.015,lightPosition.z);pool.scale.set(config.spotWidth,config.spotWidth,1);pool.material.opacity=level*.65;
  beam.position.set(lightPosition.x,4.8,lightPosition.z-.1);beam.quaternion.copy(camera.quaternion);beam.scale.set(config.spotWidth*1.2,9.6,1);beam.material.opacity=level*.32;
  for(const [actorId,v] of actors){const desired=enabled&&actorId===id?1:0,weight=weights.get(actorId)||0,next=Math.abs(desired-weight)>.001?weight+(desired-weight)*k:desired;weights.set(actorId,next);if(Math.abs(weight-next)>.0001)moving=true;
   const ambient=1-level*.32,boost=next*level*.65;v.sprite.material.color.setRGB(ambient+boost*color.r,ambient+boost*color.g,ambient+boost*color.b);
   if(!snap?.lit)v.sprite.material.color.set(0xffffff);
  }
  host.dataset.stageSpot=enabled?id:'';
  return moving;
 }
 const anchors={cart:[-11.3,1.7,-10],rails:[1,1.3,-4],etching:[11.5,4.5,-12],cache:[11.5,3,-12],door:[0,4,-7],rune:[-8,3.8,-6],wheel:[-4,2.8,-6],water:[5,1,-4]};
 // 台車と壁の傷はコードで描いた仮のカキワリ。完成素材へ置き換えられます。
 function propCanvas(kind){const c=document.createElement('canvas');c.width=512;c.height=384;const x=c.getContext('2d');
  if(kind==='cart'){x.fillStyle='#121a1c';for(const v of [130,360]){x.beginPath();x.arc(v,310,53,0,Math.PI*2);x.fill();x.strokeStyle='#89928e';x.lineWidth=9;x.stroke();x.beginPath();x.moveTo(v-40,310);x.lineTo(v+40,310);x.moveTo(v,270);x.lineTo(v,350);x.stroke();}x.fillStyle='#544a39';x.beginPath();x.moveTo(65,135);x.lineTo(435,135);x.lineTo(400,282);x.lineTo(95,282);x.closePath();x.fill();x.strokeStyle='#292f2e';x.lineWidth=12;x.stroke();for(let y=159;y<270;y+=28){x.strokeStyle='#8a7960';x.lineWidth=3;x.beginPath();x.moveTo(88,y);x.lineTo(411,y);x.stroke();}x.strokeStyle='#89928e';x.lineWidth=10;for(const a of [125,370]){x.beginPath();x.moveTo(a,138);x.lineTo(a,283);x.stroke();}x.strokeStyle='#222b2a';x.lineWidth=7;x.strokeRect(62,125,375,14);}
  else {x.strokeStyle='#a3a697';x.lineWidth=3;x.shadowColor='#050a0b';x.shadowBlur=6;for(let i=0;i<7;i++){x.beginPath();x.moveTo(130+i*30,110+(i%3)*12);x.lineTo(138+i*30,176);x.lineTo(120+i*30,212);x.stroke();}}
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
 }
 function prop(id,map,pos,w,h){const v=new THREE.Sprite(new THREE.SpriteMaterial({map,alphaTest:.1}));v.position.set(...pos);v.scale.set(w,h,1);scene.add(v);props.set(id,v);}
 prop('cart',propCanvas('cart'),[-11.3,1.3,-10],4.5,3.3);
 prop('etching',propCanvas('etching'),[11.5,4.5,-12],3,2.2);
 // 手前の岩・中景の人物・奥の背景を分け、役者の足元に簡易の接地影を置きます。
 function actor(id){if(!actors.has(id)){const t=texture('../replay/img/'+id+'.webp'),material=new THREE.SpriteMaterial({map:t,alphaTest:.08}),sprite=new THREE.Sprite(material);sprite.center.set(.5,0);scene.add(sprite);const shadow=new THREE.Mesh(new THREE.CircleGeometry(.7,24),new THREE.MeshBasicMaterial({color:'#050b0c',transparent:true,opacity:.35,depthWrite:false}));shadow.rotation.x=-Math.PI/2;scene.add(shadow);actors.set(id,{sprite,shadow});}return actors.get(id);}
 function orient(){camera.lookAt(camera.position.x+Math.sin(yaw*Math.PI/180)*20,3.1,camera.position.z-Math.cos(yaw*Math.PI/180)*20);camera.updateMatrixWorld();}
 function setYaw(value){if(document.querySelector('dialog[open]'))return;yaw=Math.max(-config.yaw,Math.min(config.yaw,value));orient();dirty=true;host.dataset.stageYaw=yaw.toFixed(1);controls.querySelector('output').textContent=Math.abs(yaw)<1?'正面':(yaw<0?'左 ':'右 ')+Math.round(Math.abs(yaw))+'°';changed();}
 function projectPosition(a){if(!a)return null;point.set(...a);const view=point.clone().applyMatrix4(camera.matrixWorldInverse),v=point.clone().project(camera);let visible=view.z<0&&Math.abs(v.x)<.92&&Math.abs(v.y)<.86;ndc.set(v.x,v.y);ray.setFromCamera(ndc,camera);const hit=ray.intersectObjects(foreground,false)[0];if(hit&&hit.distance<point.distanceTo(camera.position))visible=false;return {x:(v.x+1)*host.clientWidth/2,y:(1-v.y)*host.clientHeight/2,visible};}
 function project(id){return projectPosition(anchors[id]);}
 function projectActor(id){const a=actors.get(id);if(!a?.sprite.visible)return null;const p=a.sprite.position;return projectPosition([p.x,p.y+a.sprite.scale.y*.77,p.z]);}
 function sync(next){snap=next;if(room!==next.room+next.phase){room=next.room+next.phase;speaker='';until=0;setYaw(0);}back.material.map=texture('../replay/img/'+next.image+'.webp');back.material.needsUpdate=true;
  if(!next.lit||next.end){pool.visible=beam.visible=false;for(const a of actors.values())a.sprite.material.color.set(0xffffff);}
  for(const [id,a] of actors){a.sprite.visible=false;a.shadow.visible=false;}
  for(const p of next.actors){const a=actor(p.id),height=(p.id==='brom'?4.2:4.8)*next.depth.size/46,t=a.sprite.material.map,ratio=t.image?.width/t.image?.height||.5;a.sprite.scale.set(height*ratio,height,1);a.sprite.position.set((p.x-50)*.15,0,1-p.z*next.depth.shrink/25*4.5);a.sprite.visible=!next.end;a.shadow.position.set(a.sprite.position.x,.005,a.sprite.position.z);a.shadow.visible=!next.end;}
  const boss=actor('guardian_rampage');boss.sprite.visible=next.battle;boss.sprite.position.set(5.5,0,-5);boss.sprite.scale.set(4.5,6,1);boss.shadow.visible=next.battle;boss.shadow.position.set(5.5,.005,-5);
  props.forEach(p=>p.visible=next.room==='entry'&&!next.battle&&!next.end);
  for(const p of foreground)p.material.color.set(next.lit?'#aab4b4':'#263438');
  orient();dirty=true;changed();
 }
 function resize(){renderer.setSize(host.clientWidth,host.clientHeight,false);camera.aspect=host.clientWidth/host.clientHeight;camera.fov=config.fov;camera.updateProjectionMatrix();orient();dirty=true;if(snap&&!lost){renderer.render(scene,camera);dirty=false;}changed();}
 const observer=new ResizeObserver(resize);observer.observe(host);
 controls.querySelectorAll('[data-look]').forEach(b=>b.onclick=()=>setYaw(b.dataset.look==='center'?0:yaw+Number(b.dataset.look)));
 canvas.onpointerdown=e=>{if(e.button!==0)return;canvas.focus();drag={id:e.pointerId,x:e.clientX,start:yaw};canvas.setPointerCapture(e.pointerId);};
 canvas.onpointermove=e=>{if(drag?.id===e.pointerId)setYaw(drag.start-(e.clientX-drag.x)*config.sensitivity);};
 canvas.onpointerup=canvas.onpointercancel=()=>drag=null;
 canvas.onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home'].includes(e.key)){e.preventDefault();setYaw(e.key==='Home'?0:yaw+(e.key==='ArrowLeft'?-8:8));}};
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;canvas.hidden=true;host.classList.remove('stage-ready');controls.hidden=true;changed();});
 canvas.addEventListener('webglcontextrestored',()=>{lost=false;dirty=true;canvas.hidden=false;host.classList.add('stage-ready');controls.hidden=false;changed();});
 function frame(now){requestAnimationFrame(frame);if(document.hidden||lost||now-last<33)return;last=now;if(updateLight(now))dirty=true;if(!dirty)return;dirty=false;renderer.render(scene,camera);}
 host.classList.add('stage-ready');host.dataset.stageRenderer='three';controls.hidden=false;orient();resize();requestAnimationFrame(frame);
 return {sync,project,projectActor,setYaw,config,resize,speak,setLight,refreshLight:()=>{dirty=true;}};
}
