const vm=require('node:vm'),fs=require('node:fs');
const P=process.argv[2],OUT=process.argv[3];
const {load}=require(P+'/load-prototype.cjs');
const element=()=>({innerHTML:'',style:{},classList:{toggle(){},add(){},remove(){}},querySelectorAll(){return []},setAttribute(){},removeAttribute(){},replaceChildren(){},append(){},addEventListener(){},dataset:{},open:false,close(){}});
const els={};
const ctx=vm.createContext({document:{getElementById(id){return els[id]??=element()},querySelector(){return element()},querySelectorAll(){return []},addEventListener(){}},window:{addEventListener(){}},crypto:require('node:crypto').webcrypto,performance,AbortSignal,localStorage:{getItem(){return null},setItem(){}},setTimeout,clearTimeout});
load(ctx);
const names='CONTROL VOICE_FIELDS CHAT_JOKE_RATE GM_SPEECH_MS PEOPLE ROOMS PASSAGES MAPS TARGETS LABEL ACTION_TARGET CHAT_TONE VOICE_DEFAULT ITEM_DEFS ITEM_REQUIRED CLUES SHEET_STATS SHEET_ABILITIES PROFILE_DRAFT OPENING_ITEMS COOPERATION_ACTIONS HUMAN_CONVERSATION_ACTIONS BATTLE_RULES BATTLE_ENEMY_ROUTE DICE_COLORS CHRONICLE_HEADER SCENARIO_STAGE_DEFAULTS SCENARIO_ANCHORS SCENARIO_SHEETS SCENARIO_BATTLE_X SCENARIO_PALETTES SCENARIO_ENEMY SCENARIO_STANDEE_VARIANTS MAREN_LANTERN_VARIANT DICE_CONFIG FX_DEFAULT LIGHTNING_CONFIG SCENARIO_MAP EXPLORATION_INTENT_PROMPT LANTERN_SIGNALS_PROMPT CONSENT_TOPICS ROLE_PROMPT DEPTH_DEFAULT PROFILE_LABELS STAT_NAMES TARGET_CLEARANCE'.split(' ');
const ser=v=>JSON.stringify(v,(k,x)=>typeof x==='function'?'[fn] '+x.toString():x instanceof Set?[...x]:x,1);
const res={};for(const n of names){try{res[n]=vm.runInContext(n,ctx)}catch(e){res[n]='ERR '+e.message}}
fs.writeFileSync(OUT+'/data.json',ser(res));
try{fs.writeFileSync(OUT+'/initial.json',ser(vm.runInContext('initial()',ctx)))}catch(e){console.log('initial',e.message)}
console.log(Object.entries(res).map(([k,v])=>k+':'+(ser(v)||'').length).join(' '));
