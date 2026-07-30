
/* 補助パネルで、現在のAIバックエンドと実モデル名を表示する。 */
function updateAssistantModelLabel(){
  const usage=document.querySelector('#rightBody .switch-row');
  if(!usage)return;
  let label=usage.parentElement.querySelector('.assistant-model-label');
  if(!label){label=document.createElement('p');label.className='hint assistant-model-label';usage.parentElement.insertBefore(label,usage.nextSibling)}
  label.textContent=assistantMode==='ai'
    ? `使用モデル：${context?.model||'未取得'}${context?.backend?`（${context.backend}）`:''}`
    : 'AI未使用（プロンプトのみ）';
}
var baseRenderRightPanelForModelLabel=renderRightPanel;
renderRightPanel=function(){baseRenderRightPanelForModelLabel();updateAssistantModelLabel()};
updateAssistantModelLabel();
