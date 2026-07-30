
/* 調査対象の基本情報とゲーム連動の詳細設定を分離する。 */
var baseRenderStateForDetails=renderState;
renderState=function(){const holder=document.createElement("div");holder.innerHTML=baseRenderStateForDetails();holder.querySelectorAll(".state-discovery").forEach(card=>{const grids=[...card.querySelectorAll(".state-grid")];const divider=card.querySelector(".section-divider");const aliasField=card.querySelector(".discovery-aliases")?.closest(".field");const surfaceField=card.querySelector(".discovery-surface")?.closest(".field");if(aliasField&&surfaceField&&grids[0])grids[0].insertBefore(aliasField,surfaceField);if(divider&&grids[1]){const details=document.createElement("details");details.className="section-divider game-link-details";details.open=false;details.innerHTML="<summary>ゲーム連動（詳細設定）</summary><p class=\"hint\">通常は変更不要です。内部キー、追加フラグ、ゲームが保持する確定事実を設定します。</p>";details.appendChild(grids[1]);divider.replaceWith(details)}});return holder.innerHTML};
if(activeTab==="state")renderTab();
