// brom-hammer-only.glb を既存ブロム2体と比べる。standee-check.cjs と同じ GLTFLoader 解析に、
// 足元原点・材質・ノーマルマップ・埋め込み画像の一致を足したもの。
// 使い方: node check-glb.cjs <sharpのあるnode_modulesの親ディレクトリ>
const fs=require('node:fs'),path=require('node:path');
const P=path.resolve(__dirname,'../..'),S=__dirname;
const sharp=require(require.resolve('sharp',{paths:[process.argv[2]||'/private/tmp/brom-standee-tools']}));
(async()=>{
 global.self=globalThis;
 global.createImageBitmap=async()=>({width:1,height:1,close(){}});
 const THREE=await import(P+'/vendor/three/three.module.min.js');
 const {GLTFLoader}=await import(P+'/vendor/three/loaders/GLTFLoader.js');
 let fail=0;const ok=(v,m)=>{console.log((v?'OK  ':'NG  ')+m);if(!v)fail++;};
 const info={};
 for(const id of ['brom-empty','brom-hammer-shield','maren-lantern','brom-hammer-only']){
  const bytes=fs.readFileSync(P+'/assets/standees/'+id+'.glb');
  const r=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const b=new THREE.Box3().setFromObject(r.scene),size=b.getSize(new THREE.Vector3());
  const mats=[];r.scene.traverse(o=>{if(o.isMesh)mats.push({name:o.material.name,map:!!o.material.map,normalMap:!!o.material.normalMap,side:o.material.side,transparent:o.material.transparent});});
  // 埋め込み画像はJSONチャンクから直接取り出す
  const jl=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+jl).toString()),bin=bytes.subarray(20+jl+8);
  const images=(json.images||[]).map(im=>{const v=json.bufferViews[im.bufferView];return bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength);});
  info[id]={bytes:bytes.length,size:[size.x,size.y,size.z].map(v=>+v.toFixed(5)),min:[b.min.x,b.min.y,b.min.z].map(v=>+v.toFixed(5)),max:[b.max.x,b.max.y,b.max.z].map(v=>+v.toFixed(5)),nodes:json.nodes.length,meshes:json.meshes.length,materials:json.materials.map(m=>m.name),mats,images};
  console.log(JSON.stringify({id,...info[id],images:images.length}));
 }
 const a=info['brom-hammer-only'],e=info['brom-empty'],n=info['maren-lantern'];
 const base=m=>m.replace(/\.\d+$/,'');
 ok(Math.abs(a.size[1]-e.size[1])<.002,`身長(Y) ${a.size[1]} ≒ brom-empty ${e.size[1]}`);
 ok(Math.abs(a.size[2]-.04)<.0001,`板厚 ${a.size[2]} = 0.04`);
 ok(Math.abs(a.min[1]-e.min[1])<.002,`足元の高さ min.y ${a.min[1]} ≒ brom-empty ${e.min[1]}`);
 ok(Math.abs(a.min[2]+a.max[2])<.0001,'板厚の中心がz=0');
 ok(a.nodes===e.nodes&&a.meshes===e.meshes,`ノード${a.nodes}・メッシュ${a.meshes}が既存と同数`);
 ok(JSON.stringify(a.materials.map(base))===JSON.stringify(e.materials.map(base)),`材質の並び ${a.materials} が既存ブロムと同じ(.001の連番は除く)`);
 // 既存ブロム2体はノーマルマップ入り。今回は指示どおり無しなので、無しで作った maren-lantern と比べる
 ok(JSON.stringify(a.mats)===JSON.stringify(n.mats),'材質の map/normalMap/side/transparent が maren-lantern(ノーマルマップ無しの既存)と同じ');
 ok(a.mats.every(m=>!m.normalMap),'ノーマルマップなし');
 // 埋め込み画像と板テクスチャの画素一致
 const raw=async src=>(await sharp(src).ensureAlpha().raw().toBuffer({resolveWithObject:true}));
 const same=async(x,y)=>{const p=await raw(x),q=await raw(y);if(p.info.width!==q.info.width||p.info.height!==q.info.height)return false;return Buffer.compare(p.data,q.data)===0;};
 const front=S+'/plate/front.png',back=S+'/plate/back.png';
 ok(a.images.length===2,'埋め込み画像2枚');
 ok(await same(a.images[0],front)||await same(a.images[1],front),'GLB内に plate/front.png と同一画素の画像');
 ok(await same(a.images[0],back)||await same(a.images[1],back),'GLB内に plate/back.png(板座標の背面) と同一画素の画像');
 ok(await same(front,P+'/art-preview/characters/brom-hammer-only-front.png'),'characters/brom-hammer-only-front.png = plate/front.png');
 ok(await same(await sharp(back).flop().png().toBuffer(),P+'/art-preview/characters/brom-hammer-only-back.png'),'characters/brom-hammer-only-back.png = plate/back.png の左右反転(自然な背面)');
 ok(await same(P+'/art-preview/characters/brom-empty-back.png',await sharp(P+'/art-preview/brom-equipment-study/empty-plate/back.png').flop().png().toBuffer()),'既存brom-emptyも同じ規則(PNG背面=板背面の左右反転)');
 console.log(fail?`FAIL: ${fail}件`:'PASS');process.exitCode=fail?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
