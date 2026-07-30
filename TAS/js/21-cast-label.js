
/* キャラクター画面の見出しを左ペインの名称に統一する。 */
var baseRenderCastForCharacterLabel=renderCast;
renderCast=function(){
  const html=baseRenderCastForCharacterLabel();
  const holder=document.createElement('div');holder.innerHTML=html;
  const heading=holder.querySelector('h2');if(heading)heading.textContent='キャラクター';
  const listHeading=[...holder.querySelectorAll('h3')].find(x=>x.textContent.trim()==='キャスト一覧');if(listHeading)listHeading.textContent='キャラクター一覧';
  return holder.innerHTML;
};
