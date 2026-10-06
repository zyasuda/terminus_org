// 本番index.htmlの外部classic scriptを、その順番で読みます。bootGameは各検査が制御します。
const fs=require('node:fs'),vm=require('node:vm');
function sources(){return [...fs.readFileSync(__dirname+'/index.html','utf8').matchAll(/<script src="\.\/([^"]+)"[^>]*><\/script>/g)].map(([,file])=>({file,source:fs.readFileSync(__dirname+'/'+file,'utf8')}));}
function load(context){for(const {file,source} of sources())vm.runInContext(source,context,{filename:__dirname+'/'+file});}
module.exports={sources,load};
