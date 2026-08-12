
/* 管理画面UX Phase 1-3: 入力時検証、シーン折りたたみ、mock2確認導線。 */
let adminUxSectionFoldState={};
let mock2PreviewBaseUrl=localStorage.getItem('tas_mock2_preview_base_url_v1')||'https://localhost:5173/';

function adminUxSceneKey(){return sceneKey()}
function adminUxFoldStateForScene(){const key=adminUxSceneKey();return adminUxSectionFoldState[key]||{}}
function adminUxSetFold(sectionId,open){const key=adminUxSceneKey();adminUxSectionFoldState[key]={...adminUxFoldStateForScene(),[sectionId]:Boolean(open)};saveWorkspaceDraft(true)}
function adminUxIsBareImageName(value){const raw=String(value||'').trim();return !raw||raw.startsWith('blob:')||raw.startsWith('data:')||(!/[\\/]/.test(raw)&&!/^file:/i.test(raw))}
/* 必要条件に指定できるのは、このノードの調査対象と、アイテム台帳の品物。
   品物を含めないと、正しく品物を選んだ出口まで誤って警告になる */
function adminUxDiscoveryTokens(n){const set=new Set();(n.discoveries||[]).map((value,index)=>normalizeDiscoveryFor(n,value,index)).forEach(item=>{[item.id,item.label,...(item.aliases||[]),...(item.tags||[])].filter(Boolean).forEach(value=>set.add(value))});(items||[]).forEach(x=>{if(x&&x.name)set.add(x.name)});return set}
function adminUxIssue(level,text,target,section){return {level,text,target,section}}
function adminUxIssues(n=scene()){
  const issues=[];const key=sceneKey();const valid=adminUxDiscoveryTokens(n);const exits=sceneExits();const seenExitIds=new Map();
  const enemyId=typeof n.enemyId==='string'?n.enemyId.trim():'';const enemyName=typeof n.enemyName==='string'?n.enemyName.trim():'';const enemy=enemyId||enemyName?monsters.find(monster=>String(monster.id||monster.name)===enemyId)||monsters.find(monster=>monster.name===enemyName):null;
  if(n.enemyId!==null&&(enemyId||enemyName)&&!enemy)issues.push(adminUxIssue('warn',`「${enemyId||enemyName}」がモンスター台帳にありません。モンスター画面で登録するか、このシーンの敵を選び直してください。既存の敵データはそのまま保持しています。`,'#sceneEnemy','actors'));
  exits.forEach((exit,index)=>{
    const id=String(exit.id||'').trim();
    if(!id)issues.push(adminUxIssue('error',`出口${index+1}の出口IDを入力してください`,`.exit-id[data-exit-index="${index}"]`,'exits'));
    else if(seenExitIds.has(id))issues.push(adminUxIssue('error',`出口${index+1}の出口ID「${id}」が出口${seenExitIds.get(id)+1}と重複しています`,`.exit-id[data-exit-index="${index}"]`,'exits'));
    else seenExitIds.set(id,index);
    if(!exit.match?.length)issues.push(adminUxIssue('error',`出口${index+1}にトリガー語句を1つ以上指定してください`,`.exit-match[data-exit-index="${index}"]`,'exits'));
    if(exit.to===''||exit.to===undefined)issues.push(adminUxIssue('warn',`出口${index+1}の移動先を選択してください（行き止まりなら「行き止まり」を選びます）`,`.exit-target[data-exit-index="${index}"]`,'exits'));
    sceneConditionTokens(exitRequiresText(exit)).forEach(token=>{if(!valid.has(token))issues.push(adminUxIssue('error',`出口${index+1}の必要条件「${token}」は、このシーンの調査対象にも品物にもありません`,`.exit-condition-token[data-exit-index="${index}"]`,'exits'))})
  });
  const rawEncounters=Array.isArray(n.encounters)?n.encounters:[];
  sceneEncounters().forEach((encounter,index)=>{
    const monster=monsters.find(monster=>String(monster.id||monster.name)===encounter.monsterId||monster.name===encounter.monsterName);
    if(!monster)issues.push(adminUxIssue('error',`遭遇${index+1}の対象モンスターを選択してください`,`.encounter-monster[data-encounter-index="${index}"]`,'actors'));
    encounter.requiredElements.forEach(name=>{if(name&&!valid.has(name))issues.push(adminUxIssue('error',`遭遇${index+1}の必要な調査対象「${name}」が見つかりません`,`.encounter-required-elements[data-encounter-index="${index}"]`,'actors'))});
    const rawProbability=rawEncounters[index]?.probability;
    if(encounter.type==='random'&&(encounter.probability===null||encounter.probability===undefined))issues.push(adminUxIssue('error',`ランダム遭遇${index+1}には遭遇確率を指定してください`,`.encounter-probability[data-encounter-index="${index}"]`,'actors'));
    if(rawProbability!==undefined&&rawProbability!==''&&(Number(rawProbability)<0||Number(rawProbability)>100))issues.push(adminUxIssue('error',`遭遇${index+1}の確率は0〜100%で指定してください`,`.encounter-probability[data-encounter-index="${index}"]`,'actors'));
  });
  const foreground=sceneBackgrounds[key]||sceneOverrides[key]?.img||n.img||'';
  const parallaxDisabled=Boolean(sceneOverrides[key]?.parallaxDisabled);
  const sky=parallaxDisabled?'':(n.parallax?.sky||sceneOverrides[key]?.parallaxSky||'');
  const foregroundRef=imageRefForTarget(`scene:${key}`)||foreground;
  const skyRef=imageRefForTarget(`scene:${key}:sky`)||sky;
  if(!adminUxIsBareImageName(foregroundRef))issues.push(adminUxIssue('error','背景画像はファイル名のみで保存してください', '#sceneBgInput','visuals'));
  if(!adminUxIsBareImageName(skyRef))issues.push(adminUxIssue('error','SKY画像はファイル名のみで保存してください', '#sceneSkyInput','visuals'));
  if(sky&&!foregroundRef)issues.push(adminUxIssue('warn','空・遠景だけが設定されています。上部のシーン画像を選ぶと、前景（fg）もゲームへ渡せます。','#sceneBgInput','visuals'));
  if(Object.prototype.hasOwnProperty.call(sceneOverrides[key]||{},'useParallax'))issues.push(adminUxIssue('warn','`useParallax`はmock2で使われません。パララックスはこの画面のチェックで切り替えてください',' .sky-parallax-field','visuals'));
  return issues;
}
function adminUxIssuesMarkup(issues){
  if(!issues.length)return '<div class="authoring-checks ok" id="adminUxChecks"><h3>編集チェック</h3><p>この画面の入力に問題は見つかりません。</p></div>';
  return `<div class="authoring-checks has-issues" id="adminUxChecks"><h3>編集チェック</h3><p>${issues.filter(issue=>issue.level==='error').length}件の修正項目と、${issues.filter(issue=>issue.level!=='error').length}件の確認項目があります。</p><ul>${issues.map(issue=>`<li class="${issue.level}">${escapeHtml(issue.text)}</li>`).join('')}</ul></div>`;
}
function adminUxRefreshInlineFeedback(){
  if(activeTab!=='structure')return;
  const issues=adminUxIssues();const checks=$('adminUxChecks');if(checks)checks.outerHTML=adminUxIssuesMarkup(issues);
  document.querySelectorAll('.admin-ux-invalid,.admin-ux-warning').forEach(field=>{field.classList.remove('admin-ux-invalid','admin-ux-warning');field.querySelectorAll('[aria-invalid]').forEach(input=>input.removeAttribute('aria-invalid'));field.querySelector('.admin-ux-field-message')?.remove()});
  const byTarget=new Map();issues.forEach(issue=>{if(!issue.target)return;const list=byTarget.get(issue.target)||[];list.push(issue);byTarget.set(issue.target,list)});
  byTarget.forEach((fieldIssues,target)=>{let input;try{input=document.querySelector(target.trim())}catch(error){return}const field=input?.closest('.field')||input;if(!field)return;const hasError=fieldIssues.some(issue=>issue.level==='error');field.classList.add(hasError?'admin-ux-invalid':'admin-ux-warning');const message=document.createElement('p');message.className='admin-ux-field-message';message.textContent=fieldIssues.map(issue=>issue.text).join(' ');field.append(message);if(input?.setAttribute)input.setAttribute('aria-invalid',hasError?'true':'false')});
}

var baseDesignDiagnosticsForAdminUx=designDiagnostics;
designDiagnostics=function(node){return [...baseDesignDiagnosticsForAdminUx(node),...adminUxIssues(node).map(issue=>({level:issue.level,text:issue.text}))]};
var baseRenderValidationForAdminUx=renderValidation;
renderValidation=function(){baseRenderValidationForAdminUx();adminUxRefreshInlineFeedback()};

function adminUxCreateSection(holder,id,title,nodes,defaultOpen){
  const present=nodes.filter(Boolean);if(!present.length)return null;
  const issues=adminUxIssues().filter(issue=>issue.section===id);const state=adminUxFoldStateForScene();const open=Object.prototype.hasOwnProperty.call(state,id)?state[id]:(issues.length?true:defaultOpen);
  const details=document.createElement('details');details.className='card author-section';details.dataset.adminUxSection=id;details.open=open;
  const summary=document.createElement('summary');summary.innerHTML=`<span>${escapeHtml(title)}</span><span class="author-section-count ${issues.some(issue=>issue.level==='error')?'has-error':''}">${issues.length?`要確認 ${issues.length}件`:'設定を編集'}</span>`;
  const body=document.createElement('div');body.className='author-section-body';present.forEach(node=>body.append(node));details.append(summary,body);return details;
}
var baseRenderStructureForAdminUx=renderStructure;
renderStructure=function(){
  const holder=document.createElement('div');holder.innerHTML=baseRenderStructureForAdminUx();
  const heading=holder.querySelector('h2');const hint=heading?.nextElementSibling;
  const background=holder.querySelector('#sceneBgInput')?.closest('.field');const sky=holder.querySelector('.sky-parallax-field');
  const name=holder.querySelector('#sceneName')?.closest('.field');const brief=holder.querySelector('#sceneBrief')?.closest('.field');
  const npcs=holder.querySelector('.scene-npc')?.closest('.field');const enemy=holder.querySelector('.enemy-encounter-group');
  const exits=holder.querySelector('.transition-list')?.closest('.field');
  if(background){
    const parallaxEnabled=Boolean(sky?.querySelector('#sceneParallaxEnabled')?.checked);
    background.classList.add('scene-visual-hero');
    const label=background.querySelector('label');if(label)label.textContent=parallaxEnabled?'前景画像（fg）':'シーン画像';
    const visualHint=document.createElement('p');visualHint.className='hint';visualHint.textContent=parallaxEnabled?'パララックスでは、この画像を前景（fg）として使用します。下の空・遠景（sky）と組み合わせます。':'このシーンを見分けるためのメインビジュアルです。';
    label?.after(visualHint);
    if(heading)heading.after(background);else holder.prepend(background);
  }
  const checks=document.createElement('div');checks.innerHTML=adminUxIssuesMarkup(adminUxIssues());const checkCard=checks.firstElementChild;
  const sections=[
    adminUxCreateSection(holder,'basics','基本設定',[name,brief],true),
    adminUxCreateSection(holder,'visuals','パララックス（必要なときだけ）',[sky],false),
    adminUxCreateSection(holder,'actors','登場人物・敵・遭遇',[npcs,enemy],Boolean(enemy)),
    adminUxCreateSection(holder,'exits','出口',[exits],true)
  ].filter(Boolean);
  if(hint)hint.after(checkCard,...sections);else holder.prepend(checkCard,...sections);
  return holder.innerHTML;
};
var baseBindStructureForAdminUx=bindStructure;
bindStructure=function(){baseBindStructureForAdminUx();document.querySelectorAll('[data-admin-ux-section]').forEach(details=>details.addEventListener('toggle',()=>adminUxSetFold(details.dataset.adminUxSection,details.open)));adminUxRefreshInlineFeedback()};
var baseWorkspaceDraftForAdminUx=workspaceDraft;
workspaceDraft=function(){return {...baseWorkspaceDraftForAdminUx(),adminUxSectionFoldState,mock2PreviewBaseUrl}};
var baseApplyWorkspaceDraftForAdminUx=applyWorkspaceDraft;
applyWorkspaceDraft=function(data){baseApplyWorkspaceDraftForAdminUx(data);adminUxSectionFoldState=data.adminUxSectionFoldState&&typeof data.adminUxSectionFoldState==='object'?data.adminUxSectionFoldState:{};if(typeof data.mock2PreviewBaseUrl==='string'&&data.mock2PreviewBaseUrl)mock2PreviewBaseUrl=data.mock2PreviewBaseUrl};

/* 選択中のシーンidを?scene=として渡す(mock2側の受信契約: src/scenario.js
   CONTENT_SELECTION.sceneId、src/engine/index.js resetGame)。イントロ/アウトロ等の
   シーン以外を選んでいる時はscene指定を省き、章の通常開始(イントロから)にする */
function adminUxMock2PreviewUrl(){
  try{
    const url=new URL(mock2PreviewBaseUrl,location.href);
    url.searchParams.set('campaign',tasCampaignId||'campaign');
    url.searchParams.set('chapter',runtimeChapterId(activeChapter));
    const node=scene();
    if(node&&node.type==='scene'&&node.id!=null)url.searchParams.set('scene',String(node.id));
    else url.searchParams.delete('scene');
    return url.toString();
  }catch(error){return mock2PreviewBaseUrl}
}
function adminUxMock2PreviewLabel(){const node=scene();return node&&node.type==='scene'?`mock2で「${escapeHtml(node.name||`シーン${node.id}`)}」から開く`:'mock2で章の最初から開く'}
function adminUxPreviewMarkup(){return `<div class="card mock2-preview-card"><h3>mock2で確認</h3><p class="hint">選択中のシーンからmock2を開きます(新規プレイのみ有効。保存済みの続きがある場合は「続きから/最初から」の選択を優先します)。</p><div class="field"><label>mock2のURL</label><input id="mock2PreviewBaseUrl" value="${escapeHtml(mock2PreviewBaseUrl)}" placeholder="https://localhost:5173/"></div><div class="mock2-preview-actions"><a id="openMock2Preview" href="${escapeHtml(adminUxMock2PreviewUrl())}" target="_blank" rel="noopener">${adminUxMock2PreviewLabel()}</a></div></div>`}
var baseRenderExportForAdminUx=renderExport;
renderExport=function(){const holder=document.createElement('div');holder.innerHTML=baseRenderExportForAdminUx();holder.append(document.createRange().createContextualFragment(adminUxPreviewMarkup()));return holder.innerHTML};
var baseBindExportForAdminUx=bindExport;
bindExport=function(){baseBindExportForAdminUx();const input=$('mock2PreviewBaseUrl');const link=$('openMock2Preview');if(input)input.oninput=event=>{mock2PreviewBaseUrl=event.target.value.trim()||'https://localhost:5173/';localStorage.setItem('tas_mock2_preview_base_url_v1',mock2PreviewBaseUrl);saveWorkspaceDraft(true);if(link)link.href=adminUxMock2PreviewUrl()}};
renderAll();
