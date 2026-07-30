
/* アイテム追加処理を最終的な入力画面へ確実に接続する。 */
function bindItemAddButton(){
  const add=$('btnAddItem');
  if(add)add.onclick=()=>{
    ensureItems();
    items=[...items,{id:itemId('新しいアイテム',items.length),name:'新しいアイテム',scope:'scene',acquisition:'none',persistent:false,capabilities:['inspect'],aliases:[],notes:'',requires:'',image:''}];
    saveWorkspaceDraft(true);renderTab();setStatus('アイテムを追加しました');
    bindItemAddButton();
  };
}
document.addEventListener('click',event=>{
  const button=event.target.closest?.('#btnAddItem');
  if(!button)return;
  event.preventDefault();event.stopPropagation();
  ensureItems();
  items=[...items,{id:itemId('新しいアイテム',items.length),name:'新しいアイテム',scope:'scene',acquisition:'none',persistent:false,capabilities:['inspect'],aliases:[],notes:'',requires:'',image:''}];
  saveWorkspaceDraft(true);renderTab();setStatus('アイテムを追加しました');
  normalizeTerminologyInPage();
},true);

/* 画面上の用語を正式名称へ統一する。データ値・内部IDは変更しない。 */
function normalizeTerminologyText(value){
  return String(value??'')
    .replaceAll('キャスト／エージェント','キャラクター')
    .replaceAll('キャスト一覧','キャラクター一覧')
    .replaceAll('キャスト設計','キャラクター設計')
    .replaceAll('キャンペーンのキャラクター/メンバー','キャンペーンのキャラクター')
    .replaceAll('登場人物','キャンペーンのキャラクター')
    .replaceAll('キャスト','キャラクター')
    .replaceAll('重要語・物語概念','重要語・概念')
    .replaceAll('エンディング','アウトロ')
    .replaceAll('シーンの出口・分岐','出口')
    .replaceAll('出口・分岐','出口')
    .replaceAll('分岐／接続先','出口')
    .replaceAll('トリガーする語句','トリガー語句')
    .replaceAll('照合語','トリガー語句')
    .replaceAll('シーン要素','調査対象')
    .replaceAll('発見項目','調査対象')
    .replaceAll('移動識別子','出口ID')
    .replaceAll('遷移','出口')
    .replaceAll('表層説明','見た目の説明')
    .replaceAll('表面描写','見た目の説明')
    .replaceAll('確定情報','確定事実');
}
function normalizeTerminologyInPage(){
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  nodes.forEach(node=>{node.nodeValue=normalizeTerminologyText(node.nodeValue)});
  document.body.querySelectorAll('input,textarea,[aria-label],[title]').forEach(el=>{
    ['placeholder','aria-label','title'].forEach(attr=>{if(el.hasAttribute(attr))el.setAttribute(attr,normalizeTerminologyText(el.getAttribute(attr)))});
  });
  document.querySelectorAll('.discovery-aliases').forEach(input=>input.closest('.field')?.querySelector('label')?.replaceChildren('トリガー語句（別名。カンマ区切り。1文字も可）'));
  document.querySelectorAll('.encounter-trigger-terms').forEach(input=>input.closest('.field')?.querySelector('label')?.replaceChildren('遭遇のトリガー語句（カンマ区切り）'));
  document.querySelectorAll('.monster-weakness-triggers').forEach(input=>input.closest('.field')?.querySelector('label')?.replaceChildren('弱点のトリガー語句（カンマ区切り）'));
  bindItemAddButton();
}
var baseRenderAllForTerminology=renderAll;
renderAll=function(){baseRenderAllForTerminology();normalizeTerminologyInPage()};
normalizeTerminologyInPage();
