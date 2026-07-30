
/* 補助パネルの操作を再描画後も確実に受け付ける。 */
document.addEventListener('click',async event=>{
  const visualAssistant=event.target.closest?.('[data-assistant-visual="parallax"]');
  if(visualAssistant){
    event.preventDefault();event.stopPropagation();
    rightPanelEnabled=true;assistantMode='ai';assistantAiResult='';syncRightPanel();renderRightPanel();renderValidation();
    const instruction=document.querySelector('#assistantInstruction');
    if(instruction){instruction.value='このシーンのパララックス構成を確認してください。前景（fg）と空・遠景（sky）の役割、足りない素材、画面演出上の注意を日本語で提案してください。';instruction.focus()}
    setStatus('補助パネルに、パララックス用の相談内容を用意しました');
    return;
  }
  const suggest=event.target.closest?.('#btnSuggest');
  if(suggest){
    event.preventDefault();event.stopPropagation();
    const box=document.querySelector('#suggestion');
    if(box){box.classList.remove('hidden');box.innerHTML=`${promptBlock('codex','Codex')}${promptBlock('claude','Claude')}`;box.querySelectorAll('[data-copy-text]').forEach(btn=>btn.onclick=()=>navigator.clipboard.writeText(btn.dataset.copyText).then(()=>setStatus('プロンプトをコピーしました')).catch(err=>setStatus('コピーに失敗しました: '+err.message)))}
    return;
  }
  const askAI=event.target.closest?.('#btnAssistantAI');
  if(askAI){
    event.preventDefault();event.stopPropagation();
    const instruction=document.querySelector('#assistantInstruction')?.value.trim()||'';askAI.disabled=true;setStatus('AIに相談中…');
    try{assistantAiResult=await callLLM('あなたはTRPG制作の設計補助です。TASの現在設定を読み取り、未確定事項を勝手に確定せず、改善点と具体案を日本語で整理してください。',[{role:'user',content:`${assistantPrompt('claude')}\n\n追加指示:\n${instruction||'現在の設定について、優先度の高い改善点を整理してください。'}`}],4000);renderRightPanel();renderValidation()}
    catch(err){assistantAiResult=`AI相談を実行できませんでした。${err.message}`;setStatus('AI相談に失敗しました')}
    finally{if(document.querySelector('#btnAssistantAI'))document.querySelector('#btnAssistantAI').disabled=false}
    return;
  }
  const mode=event.target.closest?.('[data-assistant-mode]');
  if(mode){event.preventDefault();event.stopPropagation();assistantMode=mode.dataset.assistantMode;assistantAiResult='';saveWorkspaceDraft(true);renderRightPanel();renderValidation()}
},true);
