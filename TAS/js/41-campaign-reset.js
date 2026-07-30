
/* キャンペーン初期化は世界設定に一本化する。初期化前の保存を明示的に確認する。 */
function campaignResetMarkup(){return '<div class="card campaign-reset-card"><h3>キャンペーン管理</h3><p class="hint">現在のキャンペーンを空の状態に戻し、新しいキャンペーンとして作り直します。</p><button class="sub" id="btnResetCampaign">現在のキャンペーンを初期化</button></div>'}
var baseRenderWorldForCampaignReset=renderWorld;
renderWorld=function(){return baseRenderWorldForCampaignReset()+campaignResetMarkup()};
var baseBindWorldForCampaignReset=bindWorld;
bindWorld=function(){baseBindWorldForCampaignReset();const button=$('btnResetCampaign');if(button)button.onclick=()=>{const save=window.confirm('初期化前に、現在のキャンペーンデータを保存しますか？\n\nOK：保存して初期化\nキャンセル：保存せず初期化するか、次に確認します');if(save&&!saveCampaignFile())return;if(!save&&!window.confirm('現在のキャンペーンデータを保存せずに初期化しますか？\n\nこの操作は元に戻せません。'))return;window.__tasSkipCampaignConfirm=true;try{createNewCampaign()}finally{window.__tasSkipCampaignConfirm=false}}};
renderAll();
