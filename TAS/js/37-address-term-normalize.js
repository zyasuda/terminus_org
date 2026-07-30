
/* addressTermを正本にし、旧互換キーは読み込み時に移行して保存しない。 */
function normalizeAddressTermState(){
  castAttributes=Object.fromEntries(Object.entries(castAttributes||{}).map(([id,attrs])=>{
    const next={...attrs,addressTerm:String(attrs?.addressTerm||attrs?.addressing||'')};
    delete next.addressing;
    return [id,next];
  }));
  document.querySelectorAll('.cast-addressing-input').forEach(input=>{const id=input.dataset.castAttributeId;if(id)input.value=castAttributes[id]?.addressTerm||''});
}
var baseApplyWorkspaceDraftForAddressTerm=applyWorkspaceDraft;
applyWorkspaceDraft=function(data){baseApplyWorkspaceDraftForAddressTerm(data);normalizeAddressTermState()};
var baseWorkspaceDraftForAddressTerm=workspaceDraft;
workspaceDraft=function(){const data=baseWorkspaceDraftForAddressTerm();data.castAttributes=Object.fromEntries(Object.entries(data.castAttributes||{}).map(([id,attrs])=>{const next={...attrs,addressTerm:String(attrs?.addressTerm||attrs?.addressing||'')};delete next.addressing;return [id,next]}));return data};
document.addEventListener('input',event=>{const input=event.target.closest?.('.cast-addressing-input');if(!input)return;const id=input.dataset.castAttributeId;if(!id)return;castAttributes[id]={...(castAttributes[id]||{}),addressTerm:input.value.trim()};delete castAttributes[id].addressing;saveWorkspaceDraft(true)});
var baseRenderAllForAddressTerm=renderAll;
renderAll=function(){baseRenderAllForAddressTerm();normalizeAddressTermState()};
var baseRenderTabForAddressTerm=renderTab;
renderTab=function(){baseRenderTabForAddressTerm();normalizeAddressTermState()};
var baseCastCardForAddressTerm=castCard;
castCard=function(...args){return baseCastCardForAddressTerm(...args).replace(/(<input class="cast-addressing-input" data-cast-attribute-id="([^"]+)" value=")[^"]*(")/,(_,prefix,id,suffix)=>`${prefix}${escapeHtml(castAttribute(id).addressTerm)}${suffix}`)};
tasPlaytestCompanions=function(){return ["gareth",...Array.from({length:extraCompanions},(_,i)=>`member_${i+2}`)].map(id=>{const attrs=castAttribute(id);const name=castName(id,id);const voice=[attrs.gender?`性別属性:${attrs.gender}`:"",attrs.firstPerson?`一人称:${attrs.firstPerson}`:"",attrs.addressTerm?`呼称:${attrs.addressTerm}`:""].filter(Boolean).join(" / ");return `- ${name}(${id}): ${castProfile(id,"役割・口調は未設定")}${voice?` / ${voice}`:""}`}).join("\n")};
normalizeAddressTermState();
