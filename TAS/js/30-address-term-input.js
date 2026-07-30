
/* 呼称・二人称は画面表示とゲーム出力の addressTerm を同時に保持する。 */
document.addEventListener('input',event=>{
  const input=event.target.closest?.('.cast-addressing-input');
  if(!input)return;
  const id=input.dataset.castAttributeId;
  if(!id)return;
  const value=input.value.trim();
  castAttributes[id]={...(castAttributes[id]||{}),addressing:value,addressTerm:value};
  saveWorkspaceDraft(true);
});
