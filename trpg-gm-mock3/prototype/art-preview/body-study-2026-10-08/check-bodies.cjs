const sharp=require(require.resolve('sharp',{paths:[require('node:path').resolve(__dirname,'../../../../trpg-gm-mock2')]}));
const fs=require('node:fs'),path=require('node:path');
(async()=>{for(const id of ['maren','ines','lydia']){
const file=path.join(__dirname,id+'-empty-review.png');if(!fs.existsSync(file))continue;
const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
let transparent=0;const halves=[0,1].map(()=>({pixels:0,bounds:[info.width,info.height,-1,-1]}));
for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const a=data[(y*info.width+x)*4+3];if(a===0)transparent++;if(a<128)continue;const h=halves[x<info.width/2?0:1];h.pixels++;h.bounds=[Math.min(h.bounds[0],x),Math.min(h.bounds[1],y),Math.max(h.bounds[2],x),Math.max(h.bounds[3],y)];}
if(!transparent||halves.some(h=>h.pixels<1000))throw Error(id+': 透過背景または前後像がありません');
console.log(JSON.stringify({id,width:info.width,height:info.height,transparentPixels:transparent,halves}));
}})().catch(e=>{console.error(e);process.exitCode=1});
