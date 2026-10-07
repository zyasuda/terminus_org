const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'..');
const LLM_LOG_PATH=process.env.MOCK3_LLM_LOG||path.join(root,'logs','llm.jsonl');
// 比較用クラウドモデル。既定のローカル接続は変更しません。
const CLOUD_MODEL=process.env.MOCK3_CLOUD_GEMMA_MODEL||'gemma-4-26b-a4b-it';
const CLOUD_MODELS=['gemma-4-26b-a4b-it','gemma-4-31b-it'];
function cloudKey(){return process.env.MOCK3_GEMMA_API_KEY||process.env.GEMINI_API_KEY||(process.env.LLM_API_KEY?.startsWith('AIza')?process.env.LLM_API_KEY:'');}
async function callCloudGemma(payload,{key=cloudKey(),model=CLOUD_MODEL,fetcher=fetch}={}){
 if(!key)return {status:503,body:{error:{message:'クラウドGemmaのAPIキーが未設定です。サーバー側のGEMINI_API_KEYを設定してください。'}}};
 if(!CLOUD_MODELS.includes(model))return {status:400,body:{error:{message:'比較用Gemmaのモデル名を確認してください。'}}};
 const contents=[];for(const m of payload.messages||[]){const role=m.role==='assistant'?'model':'user',text=String(m.content||''),last=contents.at(-1);if(last?.role===role)last.parts[0].text+='\n\n'+text;else contents.push({role,parts:[{text}]});}
 const started=Date.now();
 const url=`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,options={method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify({systemInstruction:{parts:[{text:payload.system||''}]},contents,generationConfig:{temperature:0.2,maxOutputTokens:Math.min(8192,Math.max(1024,Number(payload.max_tokens)||450)),thinkingConfig:{thinkingLevel:'minimal'},responseMimeType:'application/json'}}),signal:AbortSignal.timeout(40000)};
 let response,retryCount=0;
 // 500だけ1秒後に1回再試行。同じ通信を送り、全体の40秒制限は延長しません。
 for(let attempt=0;attempt<2;attempt++){
  response=await fetcher(url,options);if(response.status!==500||attempt===1)break;
  await response.body?.cancel();await new Promise(done=>setTimeout(done,1000));retryCount++;
 }
 const data=await response.json();
 if(!response.ok)return {status:response.status,body:{error:{type:'cloud_gemma_error',retryCount,message:String(data.error?.message||'クラウドGemmaが応答しませんでした。').replaceAll(key,'[redacted]')}}};
 let text=(data.candidates?.[0]?.content?.parts||[]).filter(p=>!p.thought).map(p=>p.text||'').join('').trim();
 // Gemmaが会話のJSONを1要素の配列で包む場合だけ、同じ内容を取り出します。行動の内容・許可は変更しません。
 let unwrapped=false;try{const value=JSON.parse(text);if(Array.isArray(value)&&value.length===1&&['speech','response','text'].some(k=>typeof value[0]?.[k]==='string')){text=JSON.stringify(value[0]);unwrapped=true;}}catch{}
 if(!text)return {status:502,body:{error:{message:'クラウドGemmaの返答が空です。ゲーム状態は変更していません。'}}};
 return {status:200,body:{content:[{type:'text',text}],usage:{input_tokens:data.usageMetadata?.promptTokenCount||0,output_tokens:data.usageMetadata?.candidatesTokenCount||0},comparison:{connection:'cloud-gemma',model,unwrapped,retryCount,durationMs:Date.now()-started}}};
}
function replaceRequired(source,before,after){if(!source.includes(before))throw Error('mock2中継の置き換え元が見つかりません: '+before);return source.replace(before,after);}
function prepareRelaySource(source,localLLM){
 source=replaceRequired(source,'const LLM_LOG_PATH = path.join(__dirname, "logs", "llm.jsonl");',`const LLM_LOG_PATH = ${JSON.stringify(LLM_LOG_PATH)};`);
 if(localLLM){source=replaceRequired(source,'if (process.env.LLM_API_KEY) {','if (process.env.LLM_API_KEY && BACKEND !== "ollama") {');source=replaceRequired(source,'think: !OLLAMA_ALWAYS_THINKS,','think: false,');}
 return source;
}
function cleanFencedJsonReply(text){
 if(typeof text!=='string')return text;
 const match=/^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```([\s\S]*)$/.exec(text.trim());
 if(!match||match[2].includes('```')||match[2].includes('{')||match[2].includes('['))return text;
 try{JSON.parse(match[1]);return match[1];}catch{return text;}
}
function start(){
 fs.mkdirSync(path.dirname(LLM_LOG_PATH),{recursive:true});
 process.env.LLM_BACKEND=process.env.MOCK3_LLM_BACKEND||'anthropic';
 const localLLM=process.env.LLM_BACKEND==='ollama';
 if(localLLM){process.env.LLM_MODEL=process.env.MOCK3_LLM_MODEL||'gemma4:e4b';process.env.OLLAMA_NUM_CTX=process.env.MOCK3_OLLAMA_NUM_CTX||'8192';process.env.OLLAMA_HOST='http://127.0.0.1:11434';}
 else if(process.env.LLM_BACKEND==='anthropic')process.env.LLM_MODEL=process.env.MOCK3_LLM_MODEL||'claude-haiku-4-5-20251001';
 const sourcePath=path.resolve(root,'../trpg-gm-mock2/server.cjs');
 const relayPort=Number(process.env.MOCK3_RELAY_PORT)||8798,previewPort=Number(process.env.MOCK3_PREVIEW_PORT)||8797;
 process.env.PORT=String(relayPort);
 const mod=new Module(sourcePath,module);mod.filename=sourcePath;mod.paths=Module._nodeModulePaths(path.dirname(sourcePath));
 let source=prepareRelaySource(fs.readFileSync(sourcePath,'utf8'),localLLM);
 mod._compile(source,sourcePath);
 http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://localhost');
   if(url.pathname==='/api/turn-metrics'&&req.method==='POST'){
    let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>10000){res.writeHead(413);res.end();return;}}
    const input=JSON.parse(body),record={ts:new Date().toISOString(),type:input.type,turnId:input.turnId||null};
    if(input.type==='ai-turn'){Object.assign(record,{calls:input.calls,totalMs:input.totalMs,elapsedMs:input.elapsedMs,fallbacks:input.fallbacks});}else if(input.type==='ai-fallback'){record.kind=input.kind;}else{res.writeHead(400);res.end();return;}
    fs.appendFileSync(LLM_LOG_PATH,JSON.stringify(record)+'\n');res.writeHead(204);res.end();return;
   }
   let turnId=null;
   if(url.pathname==='/api/gm'||url.pathname==='/api/model-info'){
    let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>100000){res.writeHead(413);res.end();return;}}
    if(url.pathname==='/api/gm'&&req.method==='POST'){
     const payload=JSON.parse(body),connection=payload.connection||'default';delete payload.connection;turnId=payload.turnId||null;delete payload.turnId;
     if(!['default','cloud-gemma'].includes(connection)){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:'AIの接続先を確認してください。'}}));return;}
     if(connection==='cloud-gemma'){
      const started=Date.now(),result=await callCloudGemma(payload);
      fs.appendFileSync(LLM_LOG_PATH,JSON.stringify({ts:new Date().toISOString(),backend:'gemini',model:CLOUD_MODEL,turnId,durationMs:Date.now()-started,system:payload.system,messages:payload.messages,status:result.status,response:result.body})+'\n');
      res.writeHead(result.status,{'Content-Type':'application/json'});res.end(JSON.stringify(result.body));return;
     }
     body=JSON.stringify(payload);
    }
    const callStarted=Date.now();
    const r=await fetch('http://127.0.0.1:'+relayPort+url.pathname,{method:req.method,headers:{'Content-Type':'application/json'},body:req.method==='POST'?body:undefined,signal:AbortSignal.timeout(90000)});
    let data=await r.text();if(url.pathname==='/api/gm')fs.appendFileSync(LLM_LOG_PATH,JSON.stringify({ts:new Date().toISOString(),type:'ai-call',turnId,durationMs:Date.now()-callStarted,status:r.status})+'\n');
    if(url.pathname==='/api/gm'&&r.ok&&process.env.LLM_BACKEND==='anthropic'){
     const reply=JSON.parse(data);for(const part of reply.content||[])if(part.type==='text')part.text=cleanFencedJsonReply(part.text);
     data=JSON.stringify(reply);
    }
    if(url.pathname==='/api/model-info'&&r.ok){const info=JSON.parse(data);info.comparison={cloudModel:CLOUD_MODEL,cloudConfigured:!!cloudKey(),cloudModelAccepted:CLOUD_MODELS.includes(CLOUD_MODEL)};data=JSON.stringify(info);}
    res.writeHead(r.status,{'Content-Type':'application/json'});res.end(data);return;
   }
   const requested=decodeURIComponent(url.pathname==='/'||url.pathname==='/prototype/'?'/prototype/index.html':url.pathname),file=path.resolve(root,'.'+requested);
   if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
   const types={'.html':'text/html; charset=utf-8','.webp':'image/webp','.png':'image/png','.js':'text/javascript','.css':'text/css'};
   const data=fs.readFileSync(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
  }catch(e){res.writeHead(e.code==='ENOENT'?404:502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:e.code==='ENOENT'?'ファイルがありません。':'AI中継に接続できません。ゲーム状態は保持しています。'}}));}
 }).listen(previewPort,'127.0.0.1',()=>console.log('試作: http://127.0.0.1:'+previewPort+'/prototype/'));
}
if(require.main===module)start();
module.exports={callCloudGemma,prepareRelaySource,cleanFencedJsonReply};
