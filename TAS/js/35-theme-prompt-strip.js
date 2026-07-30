
/* 削除済みのテーマ仕様を、補助AI・生成AIのプロンプトへ渡さない。 */
function removeDeletedThemeFromPrompt(value){
  return String(value||'').replace(/^\s*テーマ\s*[:：].*\n?/gm,'').replace(/campaignTheme/g,'');
}
var baseCallLLMWithoutDeletedTheme=callLLM;
callLLM=async function(system,messages,max_tokens){
  const cleanMessages=(messages||[]).map(message=>({...message,content:removeDeletedThemeFromPrompt(message.content)}));
  return baseCallLLMWithoutDeletedTheme(removeDeletedThemeFromPrompt(system),cleanMessages,max_tokens);
};
