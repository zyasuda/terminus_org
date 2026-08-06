/* キャンペーンIDを画面から直接直せるようにする。
   2026-08-06、タイトル編集がIDを勝手に作り直すバグ(js/10-export-contract.js参照)で
   壊れたIDが下書きに保存され、開発者ツールでlocalStorageを消す以外に直す手段が無かった。
   出力確認タブのID欄を編集可能にし、ここで直接書き戻せるようにする */
var baseBindExportForCampaignIdEdit=bindExport;
bindExport=function(){
  baseBindExportForCampaignIdEdit();
  const input=$("campaignIdInput");
  if(!input)return;
  input.onchange=e=>{
    const next=stableId(e.target.value,"campaign");
    if(!next){setStatus("キャンペーンIDが空になるため変更しませんでした");input.value=tasCampaignId;return}
    tasCampaignId=next;
    input.value=next;
    saveWorkspaceDraft(true);
    renderTab(); // 出力フォルダ・JSONプレビューを新しいIDで再描画する
    setStatus(`キャンペーンIDを "${next}" にしました。mock側の既存データを更新する場合は、そちらのIDと一致させてください`);
  };
};
