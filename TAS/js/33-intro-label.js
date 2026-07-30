
/* 画面上の呼称を「イントロ」に統一する。データ上のtype/openingやchapter.introは変更しない。 */
function normalizeIntroLabelsInPage(){
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  const nodes=[];let node;
  while(node=walker.nextNode())nodes.push(node);
  nodes.forEach(text=>{if(text.nodeValue.includes('オープニング'))text.nodeValue=text.nodeValue.replaceAll('オープニング','イントロ')});
  document.querySelectorAll('input,textarea').forEach(input=>{if(input.value==='オープニング')input.value='イントロ'});
}
var baseRenderAllForIntroLabels=renderAll;
renderAll=function(){baseRenderAllForIntroLabels();normalizeIntroLabelsInPage()};
var baseRenderTabForIntroLabels=renderTab;
renderTab=function(){baseRenderTabForIntroLabels();normalizeIntroLabelsInPage()};
normalizeIntroLabelsInPage();
