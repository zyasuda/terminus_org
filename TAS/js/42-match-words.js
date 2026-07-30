
/* トリガー語句はAIの候補としてだけ保持する。sceneOverrides（下書き）に触れるのは作者が採用した時だけ。 */
let matchWordProposals=null;
let matchWordProposalError='';

function matchWordNodes(){return chapterNodes().filter(node=>['opening','scene','ending'].includes(node.type))}
function matchWordNodeRef(node){return {type:node.type,index:node.type==='scene'?Number(node.index):null}}
function matchWordNodeId(node){return `${node.type}:${node.type==='scene'?Number(node.index):''}`}
function matchWordExitsForNode(node){return Array.isArray(node.exits)?node.exits.map(normalizeExit):[]}
function matchWordDiscoveriesForNode(node){return Array.isArray(node.discoveries)?node.discoveries.map((value,index)=>normalizeDiscoveryFor(node,value,index)):[]}
function matchWordNodeInput(node){return {
  node:matchWordNodeRef(node),
  type:node.type==='opening'?'イントロ':node.type==='ending'?'アウトロ':'シーン',
  name:node.name||'',
  brief:node.brief||'',
  exits:matchWordExitsForNode(node).map(exit=>({id:exit.id,match:exit.match,to:exit.to})),
  discoveries:matchWordDiscoveriesForNode(node).map(discovery=>({id:discovery.id,label:discovery.label,surface:discovery.surface,aliases:discovery.aliases}))
}}
function matchWordGenerationPrompt(){return `章全体の照合語候補を作ってください。出力はJSONオブジェクト1個のみ。説明文・コードフェンスは不要です。

対象は、入力にある既存の exits[].match と discoveries[].aliases だけです。新しい出口・シーン要素・本文・transitions は作らないでください。各候補は、対応する node（type と scene の index）、exit id、discovery id を必ず指定してください。

# 照合語の仕組み（必ず守ること）
- 照合は部分一致である。プレイヤーの宣言文に照合語が含まれていれば一致する。
- そのため語幹で書くのが効率的。「引き受け」と書けば「引き受ける」「引き受けよう」「引き受けます」をすべて拾える。活用形を並べる必要はない。
- 1〜2文字の語は、別の要素の説明文や他の照合語に紛れ込んで誤爆する。
- 実例: シーン3の要素「胸の光るもの」に1文字の別名「光」があり、別要素の文言「光の源に意識を集中させる」を拾ってしまう。
- 同一シーン内の別の要素・別の出口と、同じ語や包含関係にある語を使わない。複数に一致すると、システムは曖昧と判断してどちらも選ばない。
- 場面でプレイヤーが実際に打ちそうな言い回しを想像する。依頼を受ける場面 → 引き受け、承知、わかった、任せ。分岐で方向を選ぶ場面 → 左、右、それぞれの通路の呼び名。行き止まりから帰る場面 → 戻る、引き返す、来た道。
- 出口ごとに、その出口が表す行動に固有の語を出すこと。すべての出口に「進む」を入れると、どの出口も選べなくなる。
- 網羅より確実さを優先する。1つの出口につき5〜10語程度を目安とする。

空の配列・空文字の候補は出さないでください。既存値が空でない項目も必ず提案対象です。

# 出力スキーマ
{"nodes":[{"node":{"type":"opening|scene|ending","index":0},"exits":[{"id":"既存exit id","match":["照合語"]}],"discoveries":[{"id":"既存discovery id","aliases":["別名"]}]}]}

# 入力
${JSON.stringify({nodes:matchWordNodes().map(matchWordNodeInput)},null,2)}`}
function parseMatchWordProposals(text){
  const data=parseGeneratedScene(text);
  if(!Array.isArray(data.nodes))throw new Error('照合語候補の nodes 配列がありません');
  const known=new Map(matchWordNodes().map(node=>[matchWordNodeId(node),node]));
  const nodes=[];
  data.nodes.forEach(entry=>{
    const ref=entry?.node||{};const type=ref.type;const index=type==='scene'?Number(ref.index):null;
    const node=known.get(`${type}:${type==='scene'?index:''}`);if(!node)return;
    const exitIds=new Set(matchWordExitsForNode(node).map(exit=>exit.id));
    const discoveryIds=new Set(matchWordDiscoveriesForNode(node).map(discovery=>discovery.id));
    const exits=(Array.isArray(entry.exits)?entry.exits:[]).map(item=>({id:String(item?.id||''),match:parseList(item?.match)})).filter(item=>exitIds.has(item.id)&&item.match.length);
    const discoveries=(Array.isArray(entry.discoveries)?entry.discoveries:[]).map(item=>({id:String(item?.id||''),aliases:parseList(item?.aliases)})).filter(item=>discoveryIds.has(item.id)&&item.aliases.length);
    if(exits.length||discoveries.length)nodes.push({node:matchWordNodeRef(node),exits,discoveries});
  });
  return {nodes};
}
function matchWordProposalFor(node){return matchWordProposals?.nodes?.find(entry=>entry.node.type===node.type&&entry.node.index===matchWordNodeRef(node).index)||null}
function applyMatchWordProposal(node,kind,id){
  const proposal=matchWordProposalFor(node);if(!proposal)return;
  const item=(kind==='exit'?proposal.exits:proposal.discoveries).find(value=>value.id===id);const values=parseList(kind==='exit'?item?.match:item?.aliases);
  /* 空のAI値は候補にも採用対象にもならない。既存値を空で消さない。 */
  if(!values.length)return;
  const key=nodeKey(node);const override={...(sceneOverrides[key]||{})};
  if(kind==='exit'){
    const exits=matchWordExitsForNode(node);const index=exits.findIndex(exit=>exit.id===id);if(index<0)return;
    exits[index]={...exits[index],match:values};override.exits=exits;
  }else{
    const discoveries=matchWordDiscoveriesForNode(node);const index=discoveries.findIndex(discovery=>discovery.id===id);if(index<0)return;
    discoveries[index]={...discoveries[index],aliases:values};override.discoveries=discoveries;
  }
  sceneOverrides[key]=override;saveWorkspaceDraft(true);renderScenes();renderAll();setStatus('照合語候補を採用しました');
}
function applyAllMatchWordProposals(){
  let count=0;
  matchWordNodes().forEach(node=>{const proposal=matchWordProposalFor(node);if(!proposal)return;proposal.exits.forEach(item=>{if(item.match.length){applyMatchWordProposal(node,'exit',item.id);count++}});proposal.discoveries.forEach(item=>{if(item.aliases.length){applyMatchWordProposal(node,'discovery',item.id);count++}})});
  if(!count)setStatus('採用できる照合語候補がありません');
}
function renderMatchWordCandidate(node,kind,current,proposal){
  const values=kind==='exit'?proposal.match:proposal.aliases;const label=kind==='exit'?`出口 ${proposal.id}`:`シーン要素 ${current.label}`;
  const before=kind==='exit'?current.match:current.aliases;
  return `<div class="card match-word-candidate"><h3>${escapeHtml(label)}</h3><div class="match-word-values"><strong>現在</strong><span>${escapeHtml(before.join(', ')||'（未設定）')}</span><strong>提案</strong><span>${escapeHtml(values.join(', '))}</span></div><div class="bottom"><button class="sub" data-apply-match-word-kind="${kind}" data-apply-match-word-node="${escapeHtml(matchWordNodeId(node))}" data-apply-match-word-id="${escapeHtml(proposal.id)}">採用</button></div></div>`
}
function renderMatchWords(){
  const sections=matchWordNodes().map(node=>{const proposal=matchWordProposalFor(node);if(!proposal)return '';const exits=matchWordExitsForNode(node);const discoveries=matchWordDiscoveriesForNode(node);const cards=[...proposal.exits.map(item=>{const current=exits.find(exit=>exit.id===item.id);return current?renderMatchWordCandidate(node,'exit',current,item):''}),...proposal.discoveries.map(item=>{const current=discoveries.find(discovery=>discovery.id===item.id);return current?renderMatchWordCandidate(node,'discovery',current,item):''})].filter(Boolean).join('');if(!cards)return '';const title=node.type==='opening'?'イントロ':node.type==='ending'?'アウトロ':`シーン${node.id}「${node.name}」`;return `<section class="match-word-node"><h2>${escapeHtml(title)}</h2>${cards}</section>`}).filter(Boolean).join('');
  return `<div class="draft-area"><h2>照合語候補</h2><p class="hint">イントロ・全シーン・アウトロの出口照合語とシーン要素の別名を、AIが1回で候補化します。生成しただけでは下書きに反映しません。</p><div class="bottom"><button id="btnGenerateMatchWords">章全体の候補を生成</button><button class="sub" id="btnApplyAllMatchWords" ${sections?'':'disabled'}>候補を一括採用</button></div>${matchWordProposalError?`<p class="validation error">${escapeHtml(matchWordProposalError)}</p>`:''}${sections||'<p class="match-word-empty">候補はまだありません。</p>'}</div>`
}
function bindMatchWords(){
  const generate=$('btnGenerateMatchWords');if(generate)generate.onclick=async()=>{generate.disabled=true;matchWordProposalError='';setStatus('章全体の照合語候補を生成中…');try{const text=await callLLM('あなたはTRPGの照合語を安全に設計する共同制作者です。出力は指定スキーマのJSONオブジェクト1個のみ。', [{role:'user',content:matchWordGenerationPrompt()}],8000);const next=parseMatchWordProposals(text);matchWordProposals=next;renderTab();setStatus('照合語候補を生成しました。現在値と比較して採用してください');}catch(error){matchWordProposalError=`照合語候補の生成に失敗しました: ${error.message}`;renderTab();setStatus(matchWordProposalError)}finally{generate.disabled=false}};
  const applyAll=$('btnApplyAllMatchWords');if(applyAll)applyAll.onclick=applyAllMatchWordProposals;
  document.querySelectorAll('[data-apply-match-word-kind]').forEach(button=>button.onclick=()=>{const [type,indexText='']=button.dataset.applyMatchWordNode.split(':');const node=matchWordNodes().find(value=>matchWordNodeId(value)===`${type}:${indexText}`);if(node)applyMatchWordProposal(node,button.dataset.applyMatchWordKind,button.dataset.applyMatchWordId)});
}
var baseRenderTabsForMatchWords=renderTabs;
renderTabs=function(){baseRenderTabsForMatchWords();const tabs=$('layerTabs');if(tabs&&!tabs.querySelector('[data-tab="matchWords"]'))tabs.insertAdjacentHTML('beforeend',`<button class="tab ${activeTab==='matchWords'?'active':''}" data-tab="matchWords">照合語候補</button>`)};
var baseRenderTabForMatchWords=renderTab;
renderTab=function(){if(activeTab==='matchWords'){const content=$('tabContent');content.innerHTML=renderMatchWords();bindMatchWords();return}baseRenderTabForMatchWords()};
/* 用語集に従い、AIへの説明文だけを正規化する。下書きデータは変更しない。 */
var baseMatchWordGenerationPromptForGlossary=matchWordGenerationPrompt;
matchWordGenerationPrompt=function(){const prompt=baseMatchWordGenerationPromptForGlossary();const marker='\n# 入力\n';const index=prompt.indexOf(marker);if(index<0)return prompt;return normalizeTerminologyText(prompt.slice(0,index))+prompt.slice(index)};
var baseTasPlaytestAiPromptForGlossary=tasPlaytestAiPrompt;
tasPlaytestAiPrompt=function(node){return baseTasPlaytestAiPromptForGlossary(node).replace('移動はTASの照合処理が確定する。','移動はTASのトリガー語句の判定が確定する。')};
var baseAdminUxIssueForGlossary=adminUxIssue;
adminUxIssue=function(level,text,target,section){return baseAdminUxIssueForGlossary(level,normalizeTerminologyText(text),target,section)};
renderAll();

/* 出力の段: イントロ・アウトロの出口を画面の入力で上書きする。段の並びは js/43-output-pipeline.js */
function outputMatchWordExits(payload){
  const chapter={...(payload.chapter||{})};
  [['opening','intro'],['ending','ending']].forEach(([type,key])=>{
    const node=matchWordNodes().find(value=>value.type===type);const override=node?sceneOverrides[nodeKey(node)]:null;
    if(!node||!Array.isArray(override?.exits))return;
    const original=chapter[key]&&typeof chapter[key]==='object'?chapter[key]:{};
    const exits=override.exits.map(normalizeExit).filter(exit=>exit.match.length).map((exit,index)=>{const to=exit.to===null?null:exit.to==='end'?'end':Number.isFinite(Number(exit.to))?Number(exit.to):exit.to||null;const requires=outputExitRequires(exit.requires,token=>{const target=(node.discoveries||[]).map((value,targetIndex)=>normalizeDiscoveryFor(node,value,targetIndex)).find(target=>target.id===token||target.label===token);return target?.id},node);return {id:exit.id||`exit_${index+1}`,match:exit.match,...(to===null?{to:null}:{to}),...(requires&&Object.keys(requires).length?{requires}:{}),...(exit.removeItems?.length?{removeItems:exit.removeItems}:{}),...(exit.addItems?.length?{addItems:exit.addItems}:{}),...(exit.npcSay?{npcSay:exit.npcSay}:{}),...(exit.blockedText?{blockedText:exit.blockedText}:{}),...(exit.text?{text:exit.text}:{})}});
    if(exits.length)chapter[key]={...original,id:original.id||`ch1_${key}`,name:original.name||node.name,brief:original.brief||node.brief,exits};
  });
  return {...payload,chapter};
};
