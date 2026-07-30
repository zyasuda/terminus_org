
/* プレイテストを再挑戦できるようにする。 */
function resetPlaytestState(){playtestRuntime={discovered:{},flags:{},items:{},npcs:{},unlocked:{},battles:{},fired:{},logs:{},notes:{}};renderAll()}
var originalPlaytestRender=renderPlaytest;
renderPlaytest=function(){return originalPlaytestRender().replace('</div><div id="chat"', '<button class="secondary" id="retryPlay" style="margin-top:10px">再挑戦</button><span class="hint" style="margin-left:8px">プレイ状態を初期化して、このシーンから開始します。</span></div><div id="chat"')}
var originalPlaytestBind=bindPlaytest;
bindPlaytest=function(){originalPlaytestBind();var retry=$('retryPlay');if(retry)retry.onclick=resetPlaytestState}
