
/* テーマ項目はゲーム側で利用しないため、旧下書きを保持しつつ画面・出力から除外する。 */
var baseRenderWorldWithoutTheme=renderWorld;
renderWorld=function(){return baseRenderWorldWithoutTheme().replace(/<div class="field"><label>テーマ<\/label>[\s\S]*?<\/div><div class="field"><label>用語・禁止事項<\/label>/,'<div class="field"><label>用語・禁止事項<\/label>')};
var baseMockCampaignPayloadWithoutTheme=mockCampaignPayload;
mockCampaignPayload=function(){const payload=baseMockCampaignPayloadWithoutTheme();if(payload.campaign){delete payload.campaign.theme;if(payload.campaign.style)delete payload.campaign.style.theme}return payload};
var baseExportPayloadWithoutTheme=exportPayload;
exportPayload=function(){const payload=baseExportPayloadWithoutTheme();if(payload.campaign){delete payload.campaign.theme;if(payload.campaign.style)delete payload.campaign.style.theme}return payload};
var baseSceneGenerationPromptWithoutTheme=sceneGenerationPrompt;
sceneGenerationPrompt=function(instruction){return baseSceneGenerationPromptWithoutTheme(instruction).replace(/\\nテーマ: [^\\n]*/g,'')};
