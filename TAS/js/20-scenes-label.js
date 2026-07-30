
/* 左ペインの登録先名称を簡潔にする。 */
var baseRenderScenesForCharacterLabel=renderScenes;
renderScenes=function(){
  baseRenderScenesForCharacterLabel();
  const castButton=document.querySelector('[data-global="cast"]');
  if(castButton)castButton.textContent='├─ キャラクター';
};
