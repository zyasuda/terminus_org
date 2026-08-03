
/* 世界設定の人物概要は、キャンペーン全体のキャストを表示する。 */
var baseRenderWorldForCampaignCast=renderWorld;
renderWorld=function(){
  const html=baseRenderWorldForCampaignCast();
  const holder=document.createElement('div');holder.innerHTML=html;
  const card=[...holder.querySelectorAll('.card')].find(x=>x.querySelector('h3')?.textContent.trim()==='登場人物');
  if(card){
    const cast=[{id:'gm',name:castName('gm',DEFAULT_GM_NAME)},{id:'gareth',name:castName('gareth','ガレス')},...Array.from({length:extraCompanions},(_,i)=>({id:`member_${i+2}`,name:castName(`member_${i+2}`,`メンバー${i+2}`)})),...npcList().map(x=>({id:x.id,name:castName(x.id,x.name)}))];
    card.querySelector('h3').textContent='キャンペーンのキャラクター/メンバー';
    const hint=card.querySelector('.hint');if(hint)hint.textContent='このキャンペーンで登録されているキャラクターとメンバーです。';
    const chips=card.querySelector('.chips');if(chips)chips.innerHTML=cast.map(x=>`<button class="chip" data-open-cast="${escapeHtml(x.id)}">${escapeHtml(x.name)}</button>`).join('')||'<span class="chip">キャスト未登録</span>';
  }
  return holder.innerHTML;
};

/* 調査対象の内部キー・追加フラグは、通常入力から分離する。 */
var baseRenderStateWithAdvancedFields=renderState;
renderState=function(){
  const html=baseRenderStateWithAdvancedFields();
  const holder=document.createElement('div');holder.innerHTML=html;
  holder.querySelectorAll('.state-discovery').forEach(card=>{
    const grids=[...card.querySelectorAll('.state-grid')];
    const divider=card.querySelector('.section-divider');
    const aliasField=card.querySelector('.discovery-aliases')?.closest('.field');
    const surfaceField=card.querySelector('.discovery-surface')?.closest('.field');
    if(aliasField&&surfaceField&&grids[0])grids[0].insertBefore(aliasField,surfaceField);
    const advancedGrid=grids[1];
    if(divider&&advancedGrid){
      const details=document.createElement('details');details.className='card state-advanced';
      const summary=document.createElement('summary');summary.textContent='ゲーム連動（詳細設定）';details.append(summary);
      const note=divider.querySelector('p');if(note)details.append(note);
      details.append(advancedGrid);divider.replaceWith(details);
    }
  });
  return holder.innerHTML;
};
