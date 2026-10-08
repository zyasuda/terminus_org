// 同一の立ち位置・視線、環境演出停止の実画面3枚を比較します。
// sharpはmock2の既存の依存を借ります。worktreeにはnode_modulesが無いので、本体の作業ツリーのmock2も探します（2026-10-08）。
const path=require('node:path'),mainTree=path.dirname(require('node:child_process').execFileSync('git',['rev-parse','--path-format=absolute','--git-common-dir'],{encoding:'utf8',cwd:__dirname}).trim());
const sharp=require(require.resolve('sharp',{paths:[__dirname+'/../../trpg-gm-mock2',mainTree+'/trpg-gm-mock2']}));
async function pixels(file,region){return sharp(__dirname+'/screenshots/'+file).extract(region).removeAlpha().raw().toBuffer();}
const mean=buf=>{let sum=0;for(let i=0;i<buf.length;i+=3)sum+=.2126*buf[i]+.7152*buf[i+1]+.0722*buf[i+2];return sum/(buf.length/3);};
(async()=>{
 const region={left:650,top:375,width:145,height:400},a=await pixels('spot-off.png',region),b=await pixels('spot-warm.png',region),c=await pixels('spot-cool.png',region);
 const channels=buf=>[0,1,2].map(k=>{let n=0;for(let i=k;i<buf.length;i+=3)n+=buf[i];return +(n/(buf.length/3)).toFixed(3);});
 const darkRegion={left:24,top:58,width:843,height:771},d=await pixels('spot-dark-off.png',darkRegion),e=await pixels('spot-dark-on.png',darkRegion);let diff=0;for(let i=0;i<d.length;i++)if(d[i]!==e[i])diff++;
 console.log(JSON.stringify({region,brightness:{off:+mean(a).toFixed(3),warm:+mean(b).toFixed(3),cool:+mean(c).toFixed(3)},RGB:{warm:channels(b),cool:channels(c)},darkChangedChannels:diff},null,2));
 if(mean(b)<=mean(a)||mean(c)<=mean(a)||diff>0)throw Error('照明の増光または暗闇の保護を画素で確認できません');
})().catch(e=>{console.error(e);process.exitCode=1});
