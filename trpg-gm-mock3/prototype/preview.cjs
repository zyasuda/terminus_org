const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'..');
// 既存のAI中継をそのまま使い、ログの出力先だけ今回の試作内へ向ける。
const sourcePath=path.resolve(root,'../trpg-gm-mock2/server.cjs');
process.env.PORT='8798';
const mod=new Module(sourcePath,module);mod.filename=sourcePath;mod.paths=Module._nodeModulePaths(path.dirname(sourcePath));
const source=fs.readFileSync(sourcePath,'utf8').replace('const LLM_LOG_PATH = path.join(__dirname, "logs", "llm.jsonl");',`const LLM_LOG_PATH = ${JSON.stringify('/tmp/mock3-llm.jsonl')};`);
mod._compile(source,sourcePath);
http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/api/gm'||url.pathname==='/api/model-info'){
   let body='';for await(const chunk of req){body+=chunk;if(body.length>100000){res.writeHead(413);res.end();return;}}
   const r=await fetch('http://127.0.0.1:8798'+url.pathname,{method:req.method,headers:{'Content-Type':'application/json'},body:req.method==='POST'?body:undefined,signal:AbortSignal.timeout(90000)});
   res.writeHead(r.status,{'Content-Type':'application/json'});res.end(await r.text());return;
  }
  const requested=decodeURIComponent(url.pathname==='/'||url.pathname==='/prototype/'?'/prototype/index.html':url.pathname);
  const file=path.resolve(root,'.'+requested);
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  const types={'.html':'text/html; charset=utf-8','.webp':'image/webp','.js':'text/javascript','.css':'text/css'};
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(fs.readFileSync(file));
 }catch(e){res.writeHead(e.code==='ENOENT'?404:502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:e.code==='ENOENT'?'ファイルがありません。':'AI中継に接続できません。'}}));}
}).listen(8797,'127.0.0.1',()=>console.log('試作: http://127.0.0.1:8797/prototype/'));
