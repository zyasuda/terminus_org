import * as THREE from '../vendor/three/three.module.min.js';

const host=document.querySelector('#standeeView');
const selector=document.querySelector('#character');
const angle=document.querySelector('#angle');
const status=document.querySelector('#status');
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(38,1,.1,30);
camera.position.set(0,1.25,3.8);
camera.lookAt(0,.86,0);
const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
renderer.outputColorSpace=THREE.SRGBColorSpace;
host.append(renderer.domElement);
const standee=new THREE.Group();
scene.add(standee);
const floor=new THREE.Mesh(new THREE.CircleGeometry(.85,64),new THREE.MeshBasicMaterial({color:0x0b1211,transparent:true,opacity:.45}));
floor.rotation.x=-Math.PI/2;
floor.position.y=-.008;
scene.add(floor);
const manifest=await fetch('manifest.json').then(r=>{if(!r.ok)throw new Error('素材一覧を読み込めません');return r.json();});
const loader=new THREE.TextureLoader();
const cache=new Map();
let selection=0;
const draw=()=>renderer.render(scene,camera);
function updateAngle(){
 standee.rotation.y=THREE.MathUtils.degToRad(Number(angle.value));
 document.querySelector('#angleValue').textContent=`${angle.value}°`;
 draw();
}
async function showCharacter(){
 const revision=++selection;
 const entry=manifest.characters.find(c=>c.id===selector.value);
 status.textContent=`${entry.name}の素材を読み込み中です。`;
 try{
  if(!cache.has(entry.id))cache.set(entry.id,Promise.all(['front','back'].map(async side=>{
   const map=await loader.loadAsync(entry.files[side].file);
   map.colorSpace=THREE.SRGBColorSpace;
   return map;
  })).catch(error=>{cache.delete(entry.id);throw error;}));
  const textures=await cache.get(entry.id);
  if(revision!==selection)return;
  for(const child of [...standee.children]){standee.remove(child);child.geometry.dispose();child.material.dispose();}
  // 人物の実身長と元画像の足裏位置を使い、透明な余白の大きさで接地を変えません。
  const scale=entry.heightM/(entry.frame.figure[3]-entry.frame.figure[1]);
  textures.forEach((map,i)=>{
   const mesh=new THREE.Mesh(new THREE.PlaneGeometry(entry.frame.width*scale,entry.frame.height*scale),new THREE.MeshBasicMaterial({map,transparent:true,alphaTest:.3,depthWrite:true,side:THREE.FrontSide}));
   mesh.position.set(0,(entry.frame.figure[3]-entry.frame.height/2)*scale,i?-.003:.003);
   mesh.rotation.y=i?Math.PI:0;
   standee.add(mesh);
  });
  status.textContent=`${entry.name} · 表示高さ ${entry.heightM.toFixed(2)} m · ${entry.status}`;
  updateAngle();
 }catch(error){if(revision===selection)status.textContent=`読み込みに失敗しました：${error.message}`;}
}
function resize(){renderer.setSize(host.clientWidth,host.clientHeight,false);camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();draw();}
new ResizeObserver(resize).observe(host);
angle.addEventListener('input',updateAngle);
selector.addEventListener('change',showCharacter);
document.querySelectorAll('[data-angle]').forEach(button=>button.addEventListener('click',()=>{angle.value=button.dataset.angle;updateAngle();}));
document.querySelectorAll('button[data-bg]').forEach(button=>button.addEventListener('click',()=>{
 document.querySelector('#rockStage').dataset.bg=button.dataset.bg;
 document.querySelectorAll('button[data-bg]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
}));
resize();
showCharacter();
