import * as THREE from './vendor/three/three.module.min.js';
import {GLTFLoader} from './vendor/three/loaders/GLTFLoader.js';
// 描画だけの舞台です。ゲーム状態・発見・所有物はindex.html側が管理します。
export const STAGE_DEFAULTS=Object.freeze({
  // 左右に平行移動できる最大距離（舞台座標）。背景の端でも自動的に止まります。
  panX:6,
  // 左右ボタンで端へ移動する時間（秒）。
  scrollSeconds:.45,
  // 探索シーンで1人だけ後ろを向かせる確率。戦闘では使いません。
  backFacingRate:.35,
  // 上への最大移動距離。さらに人物の胸元が画面下端に残る位置で止めます。
  panY:5,
  // 上限で残す身体の位置（足裏0、頭頂1）。胸元は0.64。
  bustLine:.64,
  // 手前の立ち位置（z）。大きいほどカメラへ近づきます。
  frontRow:2.2,
  // 手前・中間・奥・最奥の間隔。全幅は従来と同じ約3.2です。
  rowGap:1.07,
  // 両端の人物を中央へ向ける最大角度（度）。中央ほど正面へ戻します。
  inwardAngle:12,
  // 縦の視野角（度）。大きいほど広く、小さく見えます。
  fov:65,
  // 前後の配置幅（舞台座標）。小さくすると人物・小道具・背景の奥行きを圧縮します。
  depthSpan:2.6,
  // 舞台側の消失点の高さ（画面上端から%）。50で中央、大きいほど下がります。
  horizon:54,
  // ドラッグで舞台をつかむ移動倍率。1で画面上の移動量にほぼ一致します。
  sensitivity:1,
  // 人物同士の輪郭を離す最小の間隔（舞台座標）。
  actorGap:.35,
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
});
export function createStage(host, controls, changed) {
 const config={...STAGE_DEFAULTS};
 const scene=new THREE.Scene();scene.background=new THREE.Color('#101c20');
 const camera=new THREE.PerspectiveCamera(config.fov,1,.1,100);camera.position.set(0,3.8,10);
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
 const canvas=renderer.domElement;canvas.className='stage-canvas';canvas.tabIndex=0;canvas.setAttribute('aria-label','舞台。ドラッグで上下左右、左右の矢印キーで見渡す');host.prepend(canvas);
 const glbLoader=new GLTFLoader();
 const loader=new THREE.TextureLoader(),textures=new Map(),actors=new Map(),props=new Map();let snap=null,panX=0,panY=0,room='',dirty=true,last=0,drag=null,panSlide=null,lost=false,backFacing=null;const faceFront=new Set(),turns=new Map();
 const reducedMotion=typeof matchMedia==='function'?matchMedia('(prefers-reduced-motion: reduce)'):null;
 const point=new THREE.Vector3(),ray=new THREE.Raycaster(),ndc=new THREE.Vector2();
 function texture(url){if(!textures.has(url)){const t=loader.load(url,()=>{dirty=true;if(snap)sync(snap);},undefined,()=>{host.dataset.stageAssetError='true';});t.colorSpace=THREE.SRGBColorSpace;textures.set(url,t);}return textures.get(url);}
 function flat(map,x,y,z,w,h){const p=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map,transparent:true,alphaTest:.1,side:THREE.DoubleSide}));p.position.set(x,y+h/2,z);p.userData.stageZ=z;scene.add(p);return p;}
 // 端の岩は背景を囲う控えめな袖。巨大な仮ポリゴンは使いません。
 const rock=texture('./art-preview/scenery/foreground-rock-v02.png');
 const foreground=[flat(rock,-12.8,-.06,-3,3.2,4.8),flat(rock,13.2,-.06,-4,3.5,5.2)];
 foreground[0].scale.x=-1;
 function frameRocks(){for(const [i,p] of foreground.entries()){const half=camera.aspect*Math.tan(config.fov*Math.PI/360)*(camera.position.z-p.position.z);p.position.x=(i?1:-1)*(half*.92-p.geometry.parameters.width*.3);}}
 // 岩床の色・凹凸は同じ模様を使います。再現可能なノイズで粒度を一定にします。
 function groundTexture(){const c=document.createElement('canvas');c.width=c.height=512;const x=c.getContext('2d');let seed=1729;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  x.fillStyle='#827969';x.fillRect(0,0,512,512);
  for(let i=0;i<26000;i++){const v=Math.floor(85+random()*95);x.fillStyle=`rgb(${v},${v-5},${v-13})`;x.globalAlpha=.28+random()*.4;x.fillRect(random()*512,random()*512,1+random()*3,1+random()*3);}
  x.globalAlpha=1;
  for(let i=0;i<420;i++){const px=random()*512,py=random()*512,r=1+random()*7;x.beginPath();x.ellipse(px,py,r,r*.65,random()*Math.PI,0,Math.PI*2);x.fillStyle=i%3?'#645e54':'#a29a87';x.fill();x.strokeStyle='#403e37';x.lineWidth=.6;x.stroke();}
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(16,16);t.anisotropy=4;return t;
 }
 const ground=groundTexture();
 // 奥の床を背景画へなじませます。遠端ほど透明にし、直線状の継ぎ目を消します。
 const fadeCanvas=document.createElement('canvas');fadeCanvas.width=4;fadeCanvas.height=512;const fadeContext=fadeCanvas.getContext('2d'),fade=fadeContext.createLinearGradient(0,185,0,265);fade.addColorStop(0,'#000000');fade.addColorStop(1,'#ffffff');fadeContext.fillStyle=fade;fadeContext.fillRect(0,0,4,512);const groundFade=new THREE.CanvasTexture(fadeCanvas);
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(70,70),new THREE.MeshStandardMaterial({map:ground,bumpMap:ground,bumpScale:.045,alphaMap:groundFade,transparent:true,depthWrite:false,roughness:.96,metalness:0,color:'#747166'}));floor.rotation.x=-Math.PI/2;floor.position.y=-.04;floor.renderOrder=-2;scene.add(floor);
 const ambient=new THREE.HemisphereLight('#a9bac6','#51412e',1.2);scene.add(ambient);
 const lantern=new THREE.PointLight('#ffcc86',8,22,1);lantern.position.set(2,3,2);scene.add(lantern);
 // 背景は上下の絵を保ったまま左右にも届く幅にし、平面の端を見せません。
 const back=flat(null,0,-2,-15,64,25);back.renderOrder=-3;
 // 印刷面は光芒・床の光と色調を合わせ、絵の陰影を保ちます。
 // 見つかっていない場所は照らさず、ゲーム内の灯りの状態も変更しません。
 function lightTexture(beam=false){const c=document.createElement('canvas');c.width=256;c.height=512;const x=c.getContext('2d');
  if(beam){for(let y=0;y<512;y++){const spread=8+y*.24,g=x.createLinearGradient(128-spread,0,128+spread,0);g.addColorStop(0,'#ffffff00');g.addColorStop(.4,'#ffffffaa');g.addColorStop(.6,'#ffffffaa');g.addColorStop(1,'#ffffff00');x.fillStyle=g;x.globalAlpha=Math.sin(y/512*Math.PI)*.45;x.fillRect(0,y,256,1);}}
  else {x.scale(1,2);const g=x.createRadialGradient(128,128,0,128,128,128);g.addColorStop(0,'#ffffffaa');g.addColorStop(.4,'#ffffff66');g.addColorStop(1,'#ffffff00');x.fillStyle=g;x.fillRect(0,0,256,256);}
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
 }
 const lightMaterial=map=>new THREE.MeshBasicMaterial({map,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});
 const pool=new THREE.Mesh(new THREE.PlaneGeometry(1,1),lightMaterial(lightTexture()));pool.rotation.x=-Math.PI/2;pool.position.y=-.015;scene.add(pool);
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
  pool.visible=beam.visible=!!snap?.lit&&!snap.end&&level>.001;pool.position.set(lightPosition.x,-.015,lightPosition.z);pool.scale.set(config.spotWidth,config.spotWidth,1);pool.material.opacity=level*.65;
  beam.position.set(lightPosition.x,4.8,lightPosition.z-.1);beam.quaternion.copy(camera.quaternion);beam.scale.set(config.spotWidth*1.2,9.6,1);beam.material.opacity=level*.32;
  for(const [actorId,v] of actors){const desired=enabled&&actorId===id?1:0,weight=weights.get(actorId)||0,next=Math.abs(desired-weight)>.001?weight+(desired-weight)*k:desired;weights.set(actorId,next);if(Math.abs(weight-next)>.0001)moving=true;
   const ambient=1-level*.32,boost=next*level*.65;v.sprite.material.color.setRGB(ambient+boost*color.r,ambient+boost*color.g,ambient+boost*color.b);
   if(!snap?.lit)v.sprite.material.color.set(0xffffff);
   v.sprite.traverse(m=>{if(m.isMesh&&m.material?.color)m.material.color.copy(m.userData.baseColor||new THREE.Color(0xffffff)).multiply(v.sprite.material.color);});
  }
  host.dataset.stageSpot=enabled?id:'';
  return moving;
 }
 const anchors={cart:[-11.3,1.7,-10],rails:[1,1.3,-4],etching:[11.5,4.5,-12],cache:[11.5,3,-12],door:[0,4,-7],rune:[-8,3.8,-6],wheel:[-4,2.8,-6],water:[5,1,-4]};
 // 刻みは読める情報を先出ししない、薄い傷だけの模様です。
 function etchingTexture(){const c=document.createElement('canvas');c.width=512;c.height=384;const x=c.getContext('2d');x.strokeStyle='#a3a697';x.lineWidth=3;x.shadowColor='#050a0b';x.shadowBlur=6;for(let i=0;i<7;i++){x.beginPath();x.moveTo(130+i*30,110+(i%3)*12);x.lineTo(138+i*30,176);x.lineTo(120+i*30,212);x.stroke();}const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
 function prop(id,map,pos,w,h){const v=new THREE.Sprite(new THREE.SpriteMaterial({map,alphaTest:.1}));v.position.set(...pos);v.userData.stageZ=pos[2];v.scale.set(w,h,1);scene.add(v);props.set(id,v);}
 prop('cart',texture('./assets/scenery/mine-cart-v1.png'),[-11.3,-3*66/1024,-10],4.5,3);props.get('cart').center.set(.5,0);
 prop('etching',etchingTexture(),[11.5,4.5,-12],3,2.2);
 // スタンディーの印刷範囲。透明余白ではなく実際の足裏を床へ揃えます。
 const sheets={ines:{width:793,height:1251,figure:[261,65,615,1177],plate:[233,33,639,1208]},brom:{width:924,height:1029,figure:[100,85,824,959],plate:[77,60,852,984]},gareth:{width:780,height:1444,figure:[93,93,703,1354],plate:[55,57,739,1389]},lydia:{width:780,height:1444,figure:[149,87,655,1358],plate:[110,51,700,1395]}};
 function shadowTexture(){const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d'),g=x.createRadialGradient(64,64,5,64,64,64);g.addColorStop(0,'#000000cc');g.addColorStop(.35,'#00000066');g.addColorStop(1,'#00000000');x.fillStyle=g;x.fillRect(0,0,128,128);return new THREE.CanvasTexture(c);}
 const contactMap=shadowTexture();
 function actor(id){if(!actors.has(id)){
  const info=sheets[id],sprite=info?new THREE.Group():new THREE.Sprite(new THREE.SpriteMaterial({map:texture('../replay/img/'+id+'.webp'),alphaTest:.08}));
  sprite.userData.actorId=id;
  if(info){sprite.material={color:new THREE.Color(0xffffff)};sprite.rotation.y=0;
   const body=info.figure[3]-info.figure[1],w=info.width/body,h=info.height/body;
   for(const [i,side] of ['front','back'].entries()){const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:texture('./art-preview/characters/'+id+'-v64-'+side+'.png'),transparent:true,alphaTest:.04,depthWrite:true,side:THREE.FrontSide}));mesh.position.set((info.width/2-(info.figure[0]+info.figure[2])/2)/body,(info.figure[3]-info.height/2)/body,i?-.008:.008);mesh.rotation.y=i?Math.PI:0;sprite.add(mesh);}
   glbLoader.load('./assets/standees/'+id+'-v64.glb',gltf=>{
    const model=gltf.scene,bounds=new THREE.Box3().setFromObject(model),bodyFraction=body/(info.plate[3]-info.plate[1]),unit=1/((bounds.max.y-bounds.min.y)*bodyFraction),foot=(info.plate[3]-info.figure[3])/(info.plate[3]-info.plate[1])*(bounds.max.y-bounds.min.y);
    model.scale.setScalar(unit);model.position.set(-(bounds.min.x+bounds.max.x)/2*unit,-(bounds.min.y+foot)*unit,0);
    model.traverse(m=>{if(!m.isMesh)return;const old=m.material;const mat=new THREE.MeshBasicMaterial({map:old.map||null,color:old.color,opacity:old.opacity,transparent:true,alphaTest:old.map?.04:0,depthWrite:true,side:old.side});if(!old.map)mat.opacity=.2;m.material=mat;m.userData.baseColor=mat.color.clone();old.dispose();});
    for(const child of [...sprite.children]){sprite.remove(child);child.geometry?.dispose();child.material?.dispose();}sprite.add(model);sprite.userData.standeeLoaded=true;host.dataset.stageStandees=[...actors].filter(([,a])=>a.sprite.userData.standeeLoaded).map(([key])=>key).join(',');dirty=true;
   },undefined,()=>{host.dataset.stageAssetError='standee:'+id;});
  }else sprite.center.set(.5,0);
  scene.add(sprite);
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:contactMap,color:'#10100d',transparent:true,opacity:.55,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.userData.contactShadow=id;scene.add(shadow);actors.set(id,{sprite,shadow});
 }return actors.get(id);}
 function stageZ(z){return 1+(z-1)*config.depthSpan/4.5;}
 // 向きを変えず、カメラと注視点を一緒に平行移動します。
 function orient(){camera.position.set(panX,3.8+panY,10);const y=camera.position.y+20*2*(config.horizon/100-.5)*Math.tan(config.fov*Math.PI/360);camera.lookAt(panX,y,-10);camera.updateMatrixWorld();}
 function panLimits(){const distance=camera.position.z-back.position.z,tangent=Math.tan(config.fov*Math.PI/360),halfX=distance*tangent*camera.aspect,halfY=distance*tangent;
  const tilt=Math.atan(2*(config.horizon/100-.5)*tangent),bottomSlope=Math.tan(tilt-config.fov*Math.PI/360);
  const bustLimits=[...actors.values()].filter(a=>a.sprite.visible&&a.sprite.userData.actorId!=='guardian_rampage').map(a=>a.sprite.position.y+a.sprite.scale.y*config.bustLine-3.8-(10-a.sprite.position.z)*bottomSlope);
  return {x:Math.max(0,Math.min(config.panX,32-halfX-1)),up:Math.max(0,Math.min(config.panY,back.position.y+back.geometry.parameters.height*back.scale.y/2-halfY-3.8-2,...bustLimits)),down:.8};
 }
 function setPan(x,y){const limit=panLimits();panX=Math.max(-limit.x,Math.min(limit.x,x));panY=Math.max(-limit.down,Math.min(limit.up,y));orient();dirty=true;host.dataset.stagePanX=panX.toFixed(2);host.dataset.stagePanY=panY.toFixed(2);const directions=[];if(Math.abs(panX)>.05)directions.push(panX<0?'左':'右');if(Math.abs(panY)>.05)directions.push(panY>0?'上':'下');host.dataset.stageDirection=directions.join('・')||'正面';controls.querySelectorAll('[data-look]').forEach(b=>{b.hidden=b.dataset.look==='left'?panX<=-limit.x+.001:b.dataset.look==='right'?panX>=limit.x-.001:false;});changed();}
 function projectPosition(a){if(!a)return null;point.set(...a);const view=point.clone().applyMatrix4(camera.matrixWorldInverse),v=point.clone().project(camera);let visible=view.z<0&&Math.abs(v.x)<.92&&Math.abs(v.y)<.86;ndc.set(v.x,v.y);ray.setFromCamera(ndc,camera);const hit=ray.intersectObjects(foreground,false)[0];if(hit&&hit.distance<point.distanceTo(camera.position))visible=false;return {x:(v.x+1)*host.clientWidth/2,y:(1-v.y)*host.clientHeight/2,visible};}
 function project(id){const p=anchors[id];return p?projectPosition([p[0],p[1],stageZ(p[2])]):null;}
 function projectActor(id){const a=actors.get(id);if(!a?.sprite.visible)return null;const p=a.sprite.position;return projectPosition([p.x,p.y+a.sprite.scale.y*.77,p.z]);}
 function sync(next){snap=next;if(room!==next.room+next.phase){room=next.room+next.phase;panSlide=null;turns.clear();faceFront.clear();host.dataset.stageFocus='';backFacing=!next.battle&&next.actors.length&&Math.random()<config.backFacingRate?next.actors[Math.floor(Math.random()*next.actors.length)].id:null;speaker='';until=0;setPan(0,0);}back.material.map=texture('../replay/img/'+next.image+'.webp');back.material.needsUpdate=true;const backgroundImage=back.material.map.image;if(backgroundImage?.width&&backgroundImage?.height)back.scale.y=64*backgroundImage.height/backgroundImage.width/25; // 背景画の縦横比を保ち、横へ引き伸ばしません。
  if(!next.lit||next.end){pool.visible=beam.visible=false;for(const a of actors.values())a.sprite.material.color.set(0xffffff);}
  for(const v of [...foreground,back,...props.values()])v.position.z=stageZ(v.userData.stageZ);
  for(const [id,a] of actors){a.sprite.visible=false;a.shadow.visible=false;}
  // 抽選された左右順・前後関係を保ち、印刷面同士の重なりだけを避けます。
  const depthOrder=[...next.actors].sort((a,b)=>a.z-b.z),frontCount=Math.ceil(depthOrder.length/2),depthRows=new Map(depthOrder.map((p,i)=>[p.id,i<frontCount?0:Math.min(2,i-frontCount+1)]));
  const actorHeight=p=>4.8*(p.heightCm||172)/172*next.depth.size/46;
  const arranged=next.actors.map(p=>{const info=sheets[p.id],height=actorHeight(p);return {...p,stageX:(p.x-50)*.22,halfWidth:info?(info.figure[2]-info.figure[0])/(info.figure[3]-info.figure[1])*height/2:height*.25};}).sort((a,b)=>a.stageX-b.stageX);
  for(let i=1;i<arranged.length;i++)arranged[i].stageX=Math.max(arranged[i].stageX,arranged[i-1].stageX+arranged[i-1].halfWidth+arranged[i].halfWidth+config.actorGap);
  const center=arranged.length?(arranged[0].stageX-arranged[0].halfWidth+arranged.at(-1).stageX+arranged.at(-1).halfWidth)/2:0;
  const halfSpan=Math.max(1,...arranged.map(p=>Math.abs(p.stageX-center)));
  for(const p of arranged){const a=actor(p.id),info=sheets[p.id],height=actorHeight(p),t=a.sprite.material.map,ratio=t?.image?.width/t?.image?.height||.5;if(info)a.sprite.scale.setScalar(height);else a.sprite.scale.set(height*ratio,height,1);const row=next.battle?(p.id==='brom'?0:p.id==='lydia'?2:1):depthRows.get(p.id);a.sprite.userData.depthRow=['front','middle','back','farthest'][row];a.sprite.position.set(p.stageX-center,0,config.frontRow-row*config.rowGap);if(info&&!turns.has(p.id))a.sprite.rotation.y=faceFront.has(p.id)?0:THREE.MathUtils.degToRad(-(p.stageX-center)/halfSpan*config.inwardAngle)+(backFacing===p.id?Math.PI:0);a.sprite.visible=!next.end;a.shadow.position.set(a.sprite.position.x,.005,a.sprite.position.z);a.shadow.scale.set(p.id==='brom'?1.8:1.25,.65,1);a.shadow.visible=!next.end;}
  const boss=actor('guardian_rampage');boss.sprite.visible=next.battle;boss.sprite.position.set(5.5,0,config.frontRow-3*config.rowGap);boss.sprite.userData.depthRow='farthest';boss.sprite.scale.set(4.5,6,1);boss.shadow.visible=next.battle;boss.shadow.position.set(5.5,.005,boss.sprite.position.z);
  const palettes={entry:['#747166','#182027',.96],hall:['#85847a','#151b20',.94],drain:['#5b716c','#111d22',.7]};const palette=palettes[next.room]||palettes.hall;floor.material.color.set(palette[0]);floor.material.roughness=palette[2];scene.background.set(palette[1]);lantern.visible=next.lit;lantern.position.set(actors.get('lydia')?.sprite.position.x||2,3,actors.get('lydia')?.sprite.position.z||2);ambient.intensity=next.lit?1.2:.2;
  props.forEach(p=>p.visible=next.room==='entry'&&!next.battle&&!next.end);
  for(const p of foreground)p.material.color.set(next.lit?'#aab4b4':'#263438');
  updateFacing();host.dataset.stageRows=arranged.map(p=>p.id+':'+actors.get(p.id).sprite.userData.depthRow).join(',');frameRocks();setPan(panX,panY);dirty=true;changed();
 }
 function resize(){renderer.setSize(host.clientWidth,host.clientHeight,false);camera.aspect=host.clientWidth/host.clientHeight;camera.fov=config.fov;camera.updateProjectionMatrix();frameRocks();setPan(panX,panY);dirty=true;if(snap&&!lost){renderer.render(scene,camera);}changed();}
 const observer=new ResizeObserver(resize);observer.observe(host);
 function updateFacing(){host.dataset.stageFacing=[...actors].filter(([,a])=>a.sprite.visible&&a.sprite.isGroup).map(([id,a])=>id+':'+THREE.MathUtils.radToDeg(a.sprite.rotation.y).toFixed(1)).join(',');}
 function slidePan(x){drag=null;const end=Math.max(-panLimits().x,Math.min(panLimits().x,x)),reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;if(reduced||config.scrollSeconds<=0){panSlide=null;setPan(end,panY);}else panSlide={from:panX,to:end,y:panY,start:performance.now()};return reduced;}
 function focusActor(id){const a=actors.get(id);if(!a?.sprite.visible||!a.sprite.isGroup)return;host.dataset.stageFocus=id;faceFront.add(id);const reduced=slidePan(a.sprite.position.x);if(reduced||config.scrollSeconds<=0){a.sprite.rotation.y=0;turns.delete(id);updateFacing();dirty=true;}else{const angle=THREE.MathUtils.euclideanModulo(a.sprite.rotation.y+Math.PI,2*Math.PI)-Math.PI;turns.set(id,{from:angle,start:performance.now()});}}
 controls.querySelectorAll('[data-look]').forEach(b=>b.onclick=()=>slidePan((b.dataset.look==='left'?-1:1)*panLimits().x));
 canvas.onpointerdown=e=>{if(e.button!==0)return;panSlide=null;canvas.focus();drag={id:e.pointerId,x:e.clientX,y:e.clientY,startX:panX,startY:panY,units:2*(10-config.frontRow)*Math.tan(config.fov*Math.PI/360)/host.clientHeight*config.sensitivity};canvas.setPointerCapture(e.pointerId);};
 canvas.onpointermove=e=>{if(!e.buttons){drag=null;return;}if(drag?.id===e.pointerId)setPan(drag.startX-(e.clientX-drag.x)*drag.units,drag.startY+(e.clientY-drag.y)*drag.units);};
 canvas.onpointerup=canvas.onpointercancel=canvas.onlostpointercapture=()=>drag=null;
 canvas.onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home'].includes(e.key)){e.preventDefault();drag=null;panSlide=null;if(e.key==='Home')setPan(0,0);else setPan(panX+(e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:0),panY+(e.key==='ArrowUp'?1:e.key==='ArrowDown'?-1:0));}};
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;canvas.hidden=true;host.classList.remove('stage-ready');controls.hidden=true;changed();});
 canvas.addEventListener('webglcontextrestored',()=>{lost=false;dirty=true;canvas.hidden=false;host.classList.add('stage-ready');controls.hidden=false;changed();});
 function frame(now){requestAnimationFrame(frame);if(document.hidden||lost||now-last<33)return;last=now;for(const [id,turn] of turns){const t=Math.min(1,(now-turn.start)/(config.scrollSeconds*1000)),ease=t*t*(3-2*t);actors.get(id).sprite.rotation.y=turn.from*(1-ease);if(t>=1)turns.delete(id);dirty=true;updateFacing();}if(panSlide){const t=Math.min(1,(now-panSlide.start)/(config.scrollSeconds*1000)),ease=t*t*(3-2*t);setPan(panSlide.from+(panSlide.to-panSlide.from)*ease,panSlide.y);if(t>=1)panSlide=null;}if(updateLight(now))dirty=true;if(!dirty)return;dirty=false;renderer.render(scene,camera);}
 host.classList.add('stage-ready');host.dataset.stageRenderer='three';controls.hidden=false;orient();resize();requestAnimationFrame(frame);
 return {sync,project,projectActor,setPan,focusActor,config,resize,speak,setLight,refreshLight:()=>{dirty=true;},refreshLayout:()=>{if(snap)sync(snap);resize();}};
}
