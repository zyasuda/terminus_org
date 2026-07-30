
/* mock側へ出力したファイルを、TAS上で1件ずつ確認する。 */
function renderSavedExportFiles(){
  if(!exportFileViews.length)return '<div class="export-files"><p class="hint">「mock側へ出力」を実行すると、書き出したファイル名を表示します。</p></div>';
  const names=exportFileViews.map(file=>String(file.path||'').split(/[\\/]/).pop()).filter(Boolean);
  return `<div class="export-files"><h3>出力済みファイル</h3><ul>${names.map(name=>`<li>${escapeHtml(name)}</li>`).join('')}</ul></div>`;
}
var baseRenderExportForSavedFiles=renderExport;
renderExport=function(){const holder=document.createElement('div');holder.innerHTML=baseRenderExportForSavedFiles();const viewer=document.createElement('div');viewer.innerHTML=renderSavedExportFiles();holder.querySelector('.bottom')?.after(viewer);return holder.innerHTML};
var baseBindExportForSavedFiles=bindExport;
bindExport=function(){baseBindExportForSavedFiles()};
if(activeTab==='export')renderTab();
