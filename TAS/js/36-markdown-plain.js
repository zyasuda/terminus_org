
/* 補助AIの回答をプレーンテキストで表示し、全文コピーを提供する。 */
function markdownToPlainText(value){
  return String(value||'')
    .replace(/```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)```/g,'$1')
    .replace(/^\s{0,3}#{1,6}\s*/gm,'')
    .replace(/^\s{0,3}>\s?/gm,'')
    .replace(/^\s*[-*+]\s+/gm,'')
    .replace(/^\s*\d+[.)]\s+/gm,'')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g,'$1')
    .replace(/\*\*([^*]+)\*\*/g,'$1')
    .replace(/__([^_]+)__/g,'$1')
    .replace(/\*([^*]+)\*/g,'$1')
    .replace(/_([^_]+)_/g,'$1')
    .replace(/`([^`]+)`/g,'$1')
    .replace(/^\s*[-*_]{3,}\s*$/gm,'')
    .replace(/\n{3,}/g,'\n\n')
    .trim();
}
function decorateAssistantAiOutput(){
  const output=document.querySelector('#assistantAiOutput');
  if(!output)return;
  output.textContent=markdownToPlainText(output.textContent);
  if(output.previousElementSibling?.classList.contains('assistant-copy-all'))return;
  const copy=document.createElement('button');
  copy.type='button';copy.className='icon-btn assistant-copy-all';copy.textContent='⧉';
  copy.title='回答をすべてコピー';copy.setAttribute('aria-label','回答をすべてコピー');
  copy.onclick=()=>navigator.clipboard.writeText(output.textContent).then(()=>setStatus('AI回答をすべてコピーしました')).catch(error=>setStatus(`コピーに失敗しました: ${error.message}`));
  output.parentElement.insertBefore(copy,output);
}
var baseRenderRightPanelForPlainAi=renderRightPanel;
renderRightPanel=function(){baseRenderRightPanelForPlainAi();decorateAssistantAiOutput()};
decorateAssistantAiOutput();
