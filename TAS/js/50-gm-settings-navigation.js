/* GMはキャラクター一覧ではなく、キャンペーンのGM設定で管理する。保存処理は既存のcast経路を再利用する。 */
var baseRenderCastForGmSettings=renderCast;
renderCast=function(){
  const holder=document.createElement("div");holder.innerHTML=baseRenderCastForGmSettings();
  holder.querySelector('[data-cast-card="gm"]')?.replaceWith(Object.assign(document.createElement("div"),{className:"card",innerHTML:'<h3>GM</h3><p class="hint">GMの設定は、キャンペーンのGM設定にあります。</p><button type="button" class="sub" id="btnOpenGmSettings">GM設定を開く</button>'}));
  return holder.innerHTML;
};
var baseRenderConceptsForGmSettings=renderConcepts;
renderConcepts=function(){
  const holder=document.createElement("div");holder.innerHTML=baseRenderConceptsForGmSettings();
  holder.insertAdjacentHTML("afterbegin",'<div class="card gm-settings-card"><h3>GMの設定</h3><p class="hint">GMは、世界観・会話・秘密・判定・進行を管理します。</p></div>');
  const card=holder.querySelector(".gm-settings-card");
  if(card){card.insertAdjacentHTML("beforeend",castCard("gm",DEFAULT_GM_NAME,"GM","ゲームマスター。確定した結果を説明し、プレイヤーを案内する。",{chat:true,propose:true,act:false,mutate:false},"",{fixed:true}));const gmCard=card.querySelector('[data-cast-card="gm"]');gmCard?.querySelectorAll('.field').forEach(field=>{if(field.querySelector('label')?.textContent.trim()==='権限')field.remove()})}
  /* エンティティ台帳の唯一の入口。左ツリーから外したので、ここに畳んで置く。 */
  const ledger=document.createElement("div");ledger.innerHTML=renderEntities();
  ledger.querySelector("h2")?.remove();ledger.querySelector("p.hint")?.remove();
  holder.insertAdjacentHTML("beforeend",`<details class="card entity-gm-settings"><summary>名前・別名の台帳</summary><p class="hint">キャラクター、モンスター、アイテム以外の重要な名前や別名を管理します。</p>${ledger.innerHTML}</details>`);
  return holder.innerHTML;
};
var baseBindCastForGmSettings=bindCast;
bindCast=function(){baseBindCastForGmSettings();const button=$("btnOpenGmSettings");if(button)button.onclick=()=>{selectedTarget="campaign";activeTab="concepts";renderScenes();renderAll()}};
var baseBindConceptsForGmSettings=bindConcepts;
bindConcepts=function(){baseBindConceptsForGmSettings();bindCast();bindEntities()};
