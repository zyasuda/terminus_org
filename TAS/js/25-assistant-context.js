
/* 補助AIへ渡す情報を現在の登録先に限定し、未依頼のシーン案を生成しない。 */
function assistantTargetContext(){
  const instruction=document.querySelector('#assistantInstruction')?.value||'';
  if(activeTab==='world')return {label:'世界設定',data:{campaignName,campaignWorld,campaignTerms}};
  if(activeTab==='cast'){
    const all=[{id:'gm',name:castName('gm',DEFAULT_GM_NAME),profile:castProfile('gm','')},{id:'gareth',name:castName('gareth','ガレス'),profile:castProfile('gareth','')},...Array.from({length:extraCompanions},(_,i)=>{const id=`member_${i+2}`;return {id,name:castName(id,`メンバー${i+2}`),profile:castProfile(id,'')}}),...npcList().map(x=>({id:x.id,name:castName(x.id,x.name),profile:castProfile(x.id,'')}))];
    const focus=all.find(x=>x.name&&instruction.includes(x.name));return {label:focus?`キャラクター「${focus.name}」`:'キャラクター一覧',data:focus||all};
  }
  if(activeTab==='monsters'){
    const focus=monsters.find(x=>x.name&&instruction.includes(x.name));return {label:focus?`モンスター「${focus.name}」`:'モンスター一覧',data:focus||monsters};
  }
  if(activeTab==='items'){
    const focus=items.find(x=>x.name&&instruction.includes(x.name));return {label:focus?`アイテム「${focus.name}」`:'アイテム一覧',data:focus||items};
  }
  if(activeTab==='concepts'){
    const list=ensureConcepts();const focus=list.find(x=>x.name&&instruction.includes(x.name));return {label:focus?`重要語・概念「${focus.name}」`:'重要語・概念一覧',data:focus||list};
  }
  const current=withSceneOverride(scene());
  if(activeTab==='state')return {label:`${current.name}の調査対象`,data:{name:current.name,discoveries:current.discoveries||[]}};
  if(activeTab==='expression')return {label:`${current.name}の表現・会話`,data:{name:current.name,dialogueRules:sceneOverrides[sceneKey()]?.dialogueRules||[],gmSceneNotes:sceneOverrides[sceneKey()]?.gmSceneNotes||''}};
  if(activeTab==='structure')return {label:`${current.name}のシーン設定`,data:current};
  return {label:`${current.name}の設定`,data:current};
}
assistantPrompt=function(kind){
  const target=assistantTargetContext();
  const roleText=kind==='codex'?'あなたは実装担当のCodexです。':'あなたは設計補助のClaudeです。';
  const structureNote=activeTab==='structure'?`\n出口のTAS形式:\n- フィールドは exits[].id / exits[].match（トリガー語句） / exits[].to（実在する scene:<id> または null） / exits[].requires.text / exits[].blockedText / exits[].text を使う。\n- destination、condition、description、scene_complete などの独自フィールドは使わない。\n- 現在の出口が空なら「未設定」と明示し、画面に入力できる1〜2件の案だけを示す。\n- 移動先は現在章に存在するシーンだけを候補にする。\n利用可能な移動先:\n${JSON.stringify(sceneTargets().map(x=>({ref:sceneRef(x),name:x.name})),null,2)}\n`:'\n';
  return `${roleText}

対象範囲: ${target.label}

重要な制約:
- 対象範囲の内容だけを確認し、他のシーン・台帳・タブのレビューを勝手に追加しない。
- 依頼された入力欄にそのまま貼れる具体的な回答を最優先する。
- 依頼されていない調査対象、イベント、移動、設定を新規提案しない。
- 既存の確定事実を変更せず、不足がある場合は「不足」と明記する。
- 依頼が「行動・演出の指針」なら、行動・演出の指針だけを短く提示する。
- JSONは依頼された場合だけ出力する。
- 回答はMarkdown記法を使わず、見出し記号・箇条書き記号・強調記号を使わないプレーンテキストで書く。
${structureNote}

参照する現在データ:
${JSON.stringify(target.data,null,2)}

依頼:
${document.querySelector('#assistantInstruction')?.value.trim()||'この対象の不足点を確認し、入力欄に記入できる具体案を1つ提示してください。'}`.trim();
};
