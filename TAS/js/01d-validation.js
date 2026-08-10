function currentValidationMessages(){const s=scene();if(activeTab==="world")return [campaignName?"キャンペーン名があります":"キャンペーン名が未設定",campaignWorld?"世界・ジャンルがあります":"世界・ジャンルが未設定"];if(activeTab==="cast")return [npcList().length?`NPC ${npcList().length}件を確認できます`:"NPCは未登録です",castName("gm",DEFAULT_GM_NAME)?"GM設定を確認できます":"GM設定を確認してください"];if(activeTab==="rules")return ["共通ルールを確認できます"];if(activeTab==="structure")return [s.name?"シーン名があります":"シーン名が未設定",s.brief?"開始時の説明があります":"開始時の説明が未設定",Array.isArray(s.exits)&&s.exits.some(x=>x.to!=="")?"シーンの出口が設定されています":"シーンの出口が未設定です"];if(activeTab==="state")return [Array.isArray(s.discoveries)&&s.discoveries.length?`調査対象 ${s.discoveries.length}件を登録済み`:"調査対象が未登録です"];if(activeTab==="expression")return [sceneOverrides[sceneKey()]?.dialogueRules?.length?`発話ルール ${sceneOverrides[sceneKey()].dialogueRules.length}件を登録済み`:"条件付き発話ルールは未登録です"];if(activeTab==="playtest")return [s.name?"プレイ対象のシーン名があります":"プレイ対象のシーン名が未設定",s.brief?"開始時の説明があります":"開始時の説明が未設定"];return [s.name?"名称があります":"名称が未設定"]}
/* 設計デバッグ: 参照切れ(タイポで発火しない事故)と未参照要素を検出する */
function sceneConditionTokens(condition){return String(condition||"").split(/\s+(?:AND|OR)\s+/i).map(v=>v.trim().replace(/^(flag|discovery|item|npc|scene|battle):/i,"")).filter(Boolean)}
function designDiagnostics(n){try{
const out=[];const ds=(n.discoveries||[]).map((v,i)=>normalizeDiscoveryFor(n,v,i));
const valid=new Set();ds.forEach(d=>{valid.add(d.id);if(d.label)valid.add(d.label);d.tags.forEach(t=>valid.add(t));d.aliases.forEach(a=>valid.add(a))});items.forEach(x=>{if(x.name)valid.add(x.name)});
const refs=new Set();
const rules=(sceneOverrides[nodeKey(n)]?.dialogueRules||[]).map(normalizeDialogueRule);
rules.forEach((r,i)=>{sceneConditionTokens(r.condition).forEach(tok=>{refs.add(tok);if(!valid.has(tok))out.push({level:"error",text:`発話ルール${i+1}の条件「${tok}」に一致する要素がありません`})});
if(r.eventType==="discovery_reveal"&&r.targetId&&!ds.some(d=>d.id===r.targetId||d.label===r.targetId))out.push({level:"error",text:`発話ルール${i+1}の開示対象「${r.targetId}」が要素にありません`});
if(r.eventType==="item_grant"&&r.targetId&&!items.some(x=>x.name===r.targetId))out.push({level:"warn",text:`発話ルール${i+1}のアイテム「${r.targetId}」が台帳にありません`});
if(r.eventType==="scene_unlock"&&r.targetId&&!chapterNodes().some(x=>sceneRef(x)===r.targetId))out.push({level:"warn",text:`発話ルール${i+1}の解放先「${r.targetId}」が見つかりません`});
if(r.eventType==="npc_join"&&r.targetId&&!npcList().some(x=>x.id===r.targetId))out.push({level:"warn",text:`発話ルール${i+1}のNPC「${r.targetId}」が未登録です`});
if(r.eventType&&!r.targetId)out.push({level:"warn",text:`発話ルール${i+1}のイベント対象が未設定です`})});
ds.forEach(d=>{const used=[d.id,d.label,...d.tags,...d.aliases].some(tok=>refs.has(tok));if(!used)out.push({level:"info",text:`要素「${d.label}」はどの条件からも参照されていません（演出目的なら問題なし）`})});
/* 開示のきっかけ語句(trigger)の検査。
   mock2は「、」「,」で分割し、2文字以上の各語をプレイヤー入力への部分一致で照合し、
   該当する要素がちょうど1件の時だけ採用する(trpg-gm-mock2 src/engine/progression.js の
   matchSecretByTrigger)。長い文はプレイヤーがその通り打たないので一致せず、
   汎用動詞は同じ場面の他の要素まで横取りする。
   2026-08-10の実測: 実プレイの宣言545種に対し、章データのきっかけ語句7件のうち
   機能していたのは2件だけだった。「調べる,見る」と書かれた1件が185件を横取りし、
   文章で書かれた4件は一度も一致しなかった。 */
const TRIGGER_GENERIC_VERBS=["調べ","よく見","見る","見て","観察","眺め","確かめ","触","嗅","進む","戻る","拾","取る","話"];
const triggerSeen=new Map();
ds.forEach(d=>{
const raw=String(d.trigger||"");
if(!raw.trim())return;
if(raw.includes("/"))out.push({level:"warn",text:`要素「${d.label}」のきっかけ語句が「/」で区切られています。区切りは「,」か「、」です（「/」は語の一部として扱われ一致しません）`});
raw.split(/[,、]/).map(t=>t.trim().replace(/[。.]$/,"")).filter(Boolean).forEach(t=>{
if(t.length<2){out.push({level:"warn",text:`要素「${d.label}」のきっかけ語句「${t}」は1文字のため無視されます（2文字以上が必要）`});return}
if(t.length>6){out.push({level:"warn",text:`要素「${d.label}」のきっかけ語句「${t}」は長すぎます。プレイヤーがこの通り打たないと一致しません。語幹だけ書いてください`});return}
const namePart=(d.label||"").length>=2&&Array.from({length:Math.max(0,d.label.length-1)},(_,k)=>d.label.slice(k,k+2)).some(part=>t.includes(part));
if(!namePart&&TRIGGER_GENERIC_VERBS.some(v=>t.includes(v)))out.push({level:"warn",text:`要素「${d.label}」のきっかけ語句「${t}」は汎用動詞だけです。同じ場面の他の要素まで横取りします`});
const prev=triggerSeen.get(t);
if(prev&&prev!==d.label)out.push({level:"error",text:`きっかけ語句「${t}」が「${prev}」と「${d.label}」で重複しています。複数に一致するとどちらも開きません`});
triggerSeen.set(t,d.label)})});
return out}catch(e){return []}}
function assistantPrompt(kind){const s=scene();const scope=activeTab==="world"?"キャンペーン全体":activeTab==="cast"?"キャスト設計":activeTab==="rules"?"共通ルール":`${CHAPTERS[activeChapter].name} / ${s.type==="scene"?`シーン${s.id}`:s.name}`;const json=JSON.stringify(exportPayload(),null,2);const checks=currentValidationMessages().join("\n- ");const roleText=kind==="codex"?"あなたは実装担当のCodexです。":"あなたは設計補助のClaudeです。";return `${roleText}\n\n対象: ${scope}\n現在タブ: ${activeTab}\n検証メモ:\n- ${checks}\n\n依頼:\n- 現在の設定を読み取り、欠けている点・矛盾・次に詰めるべき論点を整理してください。\n- 必要なら、この画面で埋めるべき文面やタグ案を具体的に提案してください。\n- ゲーム状態を勝手に追加確定せず、未確定事項は未確定と明記してください。\n\n参照データ:\n${json}`.trim()}
function promptBlock(kind,label){const prompt=assistantPrompt(kind);return `<div class="prompt-card"><div class="prompt-head"><h4>${label} 用プロンプト</h4><button class="icon-btn" data-copy-text="${escapeHtml(prompt)}">⎘</button></div><textarea class="prompt-box" readonly>${escapeHtml(prompt)}</textarea></div>`}
