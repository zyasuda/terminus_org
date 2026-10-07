// 実際のGLBと同梱ローダーを解析します。画像の復号・見た目はブラウザーで別途確認します。
const fs=require('node:fs');
(async()=>{
 global.self=globalThis;
 global.createImageBitmap=async()=>({width:1,height:1,close(){}});
 const THREE=await import('./vendor/three/three.module.min.js');
 const {GLTFLoader}=await import('./vendor/three/loaders/GLTFLoader.js');
 let checks=0;const ok=(v,m)=>{checks++;if(!v)throw Error(m);};
 for(const id of ['ines','brom','gareth','lydia']){
  const bytes=fs.readFileSync(__dirname+'/assets/standees/'+(id==='lydia'?'maren':id)+(id==='brom'?'-hammer-shield':id==='gareth'?'-sheathed':'-v64')+'.glb');
  const result=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const bounds=new THREE.Box3().setFromObject(result.scene),size=bounds.getSize(new THREE.Vector3());let meshes=0,maps=0;
  result.scene.traverse(o=>{if(o.isMesh){meshes++;if(o.material.map)maps++;ok(o.geometry.attributes.position.count>0,id+'の頂点がない');}});
  ok(meshes===3&&maps===2,id+'の表・裏・側面が揃わない');
  ok(Math.abs(size.z-.04)<.0001,id+'のアクリル板の厚みが失われた');
  ok(size.y>0&&Number.isFinite(size.x),id+'の寸法が不正');
  console.log(JSON.stringify({id,bytes:bytes.length,meshes,printedSurfaces:maps,plateThickness:+size.z.toFixed(5)}));
 }
 console.log('PASS: '+checks+' checks — 実GLBの解析 / 表・裏・側面 / アクリル板の厚み / 有効な寸法');
})().catch(e=>{console.error(e);process.exitCode=1;});
