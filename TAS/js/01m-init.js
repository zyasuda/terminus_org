async function init(){loadWorkspaceDraft();if(isLocalFile()){context={backend:"local",files:{},dataFiles:{}};setStatus("ローカルモード: AI APIは既定で使用しません")}else{try{const r=await fetch("/api/context");context=await r.json();if(context.error)throw new Error(context.error.message);setStatus(`接続済み: ${context.backend}`)}catch(e){context={backend:"local",files:{},dataFiles:{}};setStatus("ローカルモードに切り替えました")}}
  /* 章構造(structureChapters)は一度作ると再利用される。/api/context の到着前に作られると
     fallbackScenes(index.html内の見本5シーン)で固定され、実データに戻らなくなる。
     contextが揃ったこの時点で、下書きの構造を復元するか、無ければ作り直す */
  try{const raw=localStorage.getItem(DRAFT_KEY);const parsed=raw?JSON.parse(raw):null;const saved=parsed?(parsed.data||parsed):null;
    if(saved&&Array.isArray(saved.chapterOrder)&&saved.chapterOrder.length)chapterOrder=saved.chapterOrder;
  }catch(e){}
  /* 下書きに残った構造は使わない。旧IDや作りかけの出口を抱えていることがあり、
     実データ(context)より古い。シーンごとの編集内容はsceneOverridesに別途あるので、
     ここで作り直しても作者の入力は失われない */
  structureChapters=null;
  renderScenes();renderAll()}
$("layerTabs").onclick=e=>{const b=e.target.closest("[data-tab]");if(!b)return;activeTab=b.dataset.tab;renderScenes();renderAll()};$("btnBuild").onclick=()=>{activeTab="export";renderScenes();renderAll();setStatus("出力内容を確認してください")};$("btnSaveDraft").onclick=()=>saveCampaignFile();$("btnLoadCampaign").onclick=()=>$("campaignFileInput").click();$("campaignFileInput").onchange=e=>loadCampaignFile(e.target.files?.[0]);$("toggleRightSwitch").onchange=e=>{rightPanelEnabled=e.target.checked;syncRightPanel();saveWorkspaceDraft()};if($("btnNewScene"))$("btnNewScene").onclick=()=>setStatus("新規シーン作成は次段階で接続します");init();
