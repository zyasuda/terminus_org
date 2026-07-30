
/* 補助パネルは親要素でイベントを受け、再描画後も切替を維持する。 */
$("rightBody").onclick=async e=>{
  const suggest=e.target.closest("#btnSuggest");
  if(suggest){
    const box=$("suggestion");
    if(box){box.classList.remove("hidden");box.innerHTML=`${promptBlock("codex","Codex")}${promptBlock("claude","Claude")}`;document.querySelectorAll("[data-copy-text]").forEach(btn=>btn.onclick=()=>{navigator.clipboard.writeText(btn.dataset.copyText).then(()=>setStatus("プロンプトをコピーしました")).catch(err=>setStatus("コピーに失敗しました: "+err.message))})}
    return;
  }
  const askAI=e.target.closest("#btnAssistantAI");
  if(askAI){
    const instruction=$("assistantInstruction")?.value.trim()||"";
    askAI.disabled=true;setStatus("AIに相談中…");
    try{assistantAiResult=await callLLM("あなたはTRPG制作の設計補助です。TASの現在設定を読み取り、未確定事項を勝手に確定せず、改善点と具体案を日本語で整理してください。",[{role:"user",content:`${assistantPrompt("claude")}\n\n追加指示:\n${instruction||"現在の設定について、優先度の高い改善点を整理してください。"}`}],4000);renderRightPanel();renderValidation();}
    catch(err){assistantAiResult=`AI相談を実行できませんでした。${err.message}`;setStatus("AI相談に失敗しました")}
    finally{if($("btnAssistantAI"))$("btnAssistantAI").disabled=false}
    return;
  }
  const mode=e.target.closest("[data-assistant-mode]");
  if(mode){assistantMode=mode.dataset.assistantMode;assistantAiResult="";saveWorkspaceDraft(true);renderRightPanel();renderValidation();return}
};
