// WebGL描画の代わりに実際のThree.jsの場面・材質を調べます。見た目は実ブラウザーで別途確認します。
const fs=require('node:fs'),vm=require('node:vm');
(async()=>{
 const THREE=await import('./vendor/three/three.module.min.js');let time=0,frame,rendered,checks=0;
 const ok=(v,m)=>{checks++;if(!v)throw Error(m)};
 const drawing=new Proxy({createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});
 const canvas=()=>({getContext:()=>drawing,setAttribute(){},addEventListener(){}});
 class Renderer{constructor(){this.domElement=canvas();}setPixelRatio(){}setSize(){}render(s){rendered=s;}}
 class Loader{load(url){const t=new THREE.Texture();t.name=url;t.image={width:200,height:400};return t;}}
 const host={clientWidth:800,clientHeight:700,dataset:{},prepend(){},classList:{add(){},remove(){}}},controls={querySelector:()=>({textContent:''}),querySelectorAll:()=>[]};
 const context=vm.createContext({THREE:{...THREE,WebGLRenderer:Renderer,TextureLoader:Loader},document:{createElement:canvas,querySelector:()=>null,hidden:false},devicePixelRatio:1,performance:{now:()=>time},ResizeObserver:class{observe(){}},requestAnimationFrame:f=>frame=f});
 const source=fs.readFileSync(__dirname+'/stage.js','utf8').replace(/^import[^\n]*\n/,'').replace('export function createStage','function createStage');vm.runInContext(source,context);
 const view=context.createStage(host,controls,()=>{}),tick=(n=60)=>{for(let i=0;i<n;i++){time+=34;frame(time);}},snapshot={room:'entry',phase:'explore',image:'mine_entrance',lit:true,end:false,battle:false,actors:[{id:'ines',x:42,z:.03},{id:'lydia',x:70,z:.1}],depth:{size:46,shrink:25}};
 view.sync(snapshot);tick();const before=JSON.stringify(snapshot),sprites=()=>rendered.children.filter(x=>x.isSprite),person=id=>sprites().find(x=>x.material.map.name.endsWith('/'+id+'.webp')),lights=()=>rendered.children.filter(x=>x.material?.blending===THREE.AdditiveBlending);
 ok(lights().every(x=>!x.visible),'発言していないのに照明が点く');
 view.speak('lydia');tick();ok(host.dataset.stageSpot==='lydia'&&lights().every(x=>x.visible),'発言者を照らさない');
 ok(person('lydia').material.color.r>person('ines').material.color.r,'発言者と他の人物の明暗が同じ');
 tick(210);ok(!host.dataset.stageSpot&&lights().every(x=>!x.visible),'7秒後に消えない');
 view.setLight('ines');tick();ok(host.dataset.stageSpot==='ines','手動対象に追従しない');
 const warm=lights()[0].material.color.clone();view.config.spotColor='cool';view.refreshLight();tick();ok(lights()[0].material.color.b>warm.b,'寒色に変わらない');
 view.config.spotWidth=5;view.refreshLight();tick();ok(lights()[0].scale.x===5,'広がりが反映されない');
 view.setLight('guardian_rampage');tick();ok(!host.dataset.stageSpot&&lights().every(x=>!x.visible),'不在の番人を照らす');
 view.setLight('lydia');snapshot.lit=false;view.sync(snapshot);tick();ok(!host.dataset.stageSpot&&lights().every(x=>!x.visible),'暗闇の照明が停止しない');
 ok(sprites().every(x=>x.material.color.equals(new THREE.Color(0xffffff))),'暗闇で人物を増光する');
 snapshot.lit=true;view.sync(snapshot);tick();ok(host.dataset.stageSpot==='lydia','再点灯で復帰しない');
 view.config.spotStrength=0;view.refreshLight();tick();ok(!host.dataset.stageSpot&&lights().every(x=>!x.visible),'明るさ0でも点く');
 view.config.spotStrength=.7;view.setLight('auto');view.speak('ines');tick();ok(host.dataset.stageSpot==='ines','自動モードに戻らない');
 snapshot.room='hall';view.sync(snapshot);tick();ok(!host.dataset.stageSpot,'移動後に前の発言を照らす');
 snapshot.room='entry';ok(JSON.stringify(snapshot)===before,'演出がゲームの入力状態を変更');
 console.log('PASS: '+checks+' checks — 発言者追従 / 7秒後の消灯 / 手動照明 / 色・広がり / 不在の人物 / 暗闇の保護 / 再点灯 / 明るさ0 / シーン移動 / 入力状態の保護');
})().catch(e=>{console.error(e);process.exitCode=1});
