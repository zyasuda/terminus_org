async function callLLM(system,messages,max_tokens){if(isLocalFile())throw new Error("ローカルモードではAI APIを既定で使用しません");const res=await fetch("/api/llm",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({system,messages,max_tokens})});const d=await res.json();if(!res.ok||d.error)throw new Error(d.error?.message||res.status);setStatus(`完了 (in:${d.usage?.input_tokens||0} / out:${d.usage?.output_tokens||0})`);return d.text}
function sceneGenerationPrompt(instruction){const s=withSceneOverride(scene());const targets=sceneTargets().map(n=>`- ${sceneRef(n)} = ${sceneRefLabel(n)}`).join("\n");return `対象シーンの構造化データの叩き台を作ってください。出力はJSONオブジェクト1個のみ。説明文・コードフェンスは不要です。

# キャンペーン
名前: ${campaignName}
世界・ジャンル: ${campaignWorld}
テーマ: ${campaignTheme}
用語・禁止事項: ${campaignTerms}

# 対象シーンの現在データ（既存の要素は削らず、指示に沿って改良・追加する）
${JSON.stringify(s,null,2)}

# 出力スキーマ（このキーのみ使う）
{
 "name": "シーン名",
 "brief": "開始時の説明",
 "goal": "このシーンの目的",
 "discoveries": [{"label":"要素名","category":"main|place|image|sense|object|foreshadow|npc","importance":"major|support|flavor","surface":"プレイヤーが見聞きする情報","trigger":"開示方法","fact":"ゲームが保持する確定事実","tags":["発見済み名"],"aliases":["プレイヤー入力のトリガー語句。短い別名"],"dc":"0|8|12|15|18（調べる判定の難易度。0は判定なしで即開示）"}],
 "exits": [{"id":"出口ID","match":["プレイヤーの行動のトリガー語句"],"to":"下記の移動先のいずれか","requires":{"text":"必要な調査対象名（AND / OR 可。不要なら空文字）"},"blockedText":"条件未達時の説明","text":"行き止まり／到達時の説明"}],
 "dialogueRules": [{"speaker":"gm|member|npc|system","condition":"発火条件（flag:発見済み名 / discovery:項目キー。常時なら空文字）","priority":"high|medium|low","line":"発言内容","eventType":"空文字|flag_add|item_grant|npc_join|scene_unlock|battle_start|discovery_reveal","targetId":"イベント対象","eventNotes":"補足","once":true,"hiddenUntilTriggered":false}],
 "gmSceneNotes": "GM向け補足メモ"
}

# 出口の移動先に使えるシーン参照
${targets}

# 指示
${instruction}

未確定の設定を勝手に断定しない。確定できない事項はgmSceneNotesに【要議論】として書く。`}
function parseGeneratedScene(text){const raw=String(text||"");const start=raw.indexOf("{");const end=raw.lastIndexOf("}");if(start<0||end<=start)throw new Error("JSONが見つかりません");return JSON.parse(raw.slice(start,end+1))}
function applyGeneratedScene(data){const key=sceneKey();const o={...(sceneOverrides[key]||{})};let invalidTargets=0,emptyMatches=0;if(typeof data.name==="string"&&data.name)o.name=data.name;if(typeof data.brief==="string"&&data.brief)o.brief=data.brief;if(typeof data.goal==="string"&&data.goal)o.goal=data.goal;if(Array.isArray(data.discoveries))o.discoveries=data.discoveries.map((d,i)=>normalizeDiscoveryFor(scene(),d,i));if(Array.isArray(data.exits)){const validTargets=new Set(exitTargetValues());o.exits=data.exits.map(normalizeExit).filter(exit=>{if(!exit.match.length){emptyMatches++;return false}if(!validTargets.has(exit.to===null?"__dead_end__":exit.to)){invalidTargets++;return false}return true}).map(exit=>exit.to===null?exit:{...exit,to:exit.to==="__dead_end__"?null:exit.to})}if(Array.isArray(data.dialogueRules))o.dialogueRules=data.dialogueRules.map(normalizeDialogueRule);if(typeof data.gmSceneNotes==="string"&&data.gmSceneNotes)o.gmSceneNotes=data.gmSceneNotes;sceneOverrides[key]=o;saveWorkspaceDraft(true);const warning=invalidTargets||emptyMatches?`移動先が存在しない出口 ${invalidTargets}件、トリガー語句が空の出口 ${emptyMatches}件を取り込みませんでした。`:"";if(warning)queueMicrotask(()=>setStatus(warning))}
function bindDraft(){document.querySelectorAll("[data-instruction-template]").forEach(btn=>btn.onclick=()=>{const t=INSTRUCTION_TEMPLATES[Number(btn.dataset.instructionTemplate)];const box=$("instruction");box.value=box.value.trim()?`${box.value.trim()}\n${t.text}`:t.text;box.focus();setStatus("テンプレートを挿入しました。【】を書き換えてください")});
$("btnWish").onclick=async()=>{const wish=$("wishInput").value.trim();if(!wish){alert("やりたいことを一言で書いてください");return}setStatus("指示文を作成中…");try{const text=await callLLM("あなたはTRPG制作ツールの入力支援です。ユーザーの要望を、シーン生成AIへの具体的な指示文（3〜5行の箇条書き）に清書してください。対象シーンの現状を踏まえ、主線・伏線・禁止事項の観点を含めます。出力は指示文のみ。",[{role:"user",content:`対象シーンの現状:\n${JSON.stringify(withSceneOverride(scene()),null,2)}\n\n要望: ${wish}`}],1000);$("instruction").value=text.trim();setStatus("指示文を作成しました。確認して「叩き台を生成」を押してください")}catch(e){setStatus("指示文の作成に失敗しました: "+e.message)}};
$("btnGenerate").onclick=async()=>{const inst=$("instruction").value.trim();if(!inst){alert("指示を入力してください");return}setStatus("生成中…");try{const text=await callLLM("あなたはTRPGの共同制作者です。出力は指定スキーマのJSONオブジェクト1個のみ。前置き・説明・コードフェンスを付けない。",[{role:"user",content:sceneGenerationPrompt(inst)}],8000);const parsed=parseGeneratedScene(text);draft=JSON.stringify(parsed,null,2);renderTab();setStatus("生成完了。内容を確認してシーンへ取り込んでください")}catch(e){setStatus("エラー: "+e.message)}};$("btnReview").onclick=async()=>{setStatus("レビュー中…");try{review=await callLLM("TRPGシナリオの品質レビュアーです。シーンの構造化データ案を検査し、矛盾・未定義の参照（存在しない発見済み名やシーン参照）・秘密の早期開示・演出上の弱点を重大度順に指摘してください。",[{role:"user",content:`キャンペーン設定:\n${campaignWorld}\nテーマ: ${campaignTheme}\n\n現在のシーン:\n${JSON.stringify(withSceneOverride(scene()),null,2)}\n\n生成案:\n${$("draft").value}`}],4000);renderTab();setStatus("レビュー完了")}catch(e){setStatus("エラー: "+e.message)}};$("btnApprove").onclick=()=>{try{const data=parseGeneratedScene($("draft").value);applyGeneratedScene(data);activeTab="structure";renderScenes();renderAll();setStatus("シーンへ取り込みました。各タブで内容を確認してください")}catch(e){setStatus("取り込み失敗: "+e.message)}}}
