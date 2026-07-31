
/* モンスター登録の一元化。キャンペーン内の全チャプターデータにある敵定義を
   モンスタータブ(monsters[])へ集約する。シーンの基本敵・遭遇の対象モンスターは、
   ここを参照するだけにし、能力値を複製しない。
   定義はキャンペーン（モンスタータブ）、使う場所はチャプター・シーン、という
   責務分けに合わせる。 */
function ensureMonsters(){
  if(freshCampaign)return monsters;
  const byName=new Map(monsters.filter(m=>m&&m.name).map(m=>[m.name,m]));
  /* idは名前をそのまま使う。連番で採番すると、収集順序が変わるたびにIDの意味が
     ずれ、encounters[].monsterIdの参照先が別モンスターにすり替わる（実害あり、実測済み）。
     名前はMapで一意にしているため、名前をIDにしても衝突しない */
  /* 生データのspriteは、モンスタータブの画像欄(image)とキー名が違う。
     definedEnemyFields()はmonster.imageからしかspriteを作らないため、ここで橋渡しする。
     importedAssetRef()はゲームJSONインポート時にも同じ変換で使っている既存の関数 */
  const collect=raw=>{if(!raw||!raw.name||byName.has(raw.name))return;byName.set(raw.name,{...raw,id:raw.id||raw.name,image:importedAssetRef(raw.image||raw.sprite||'')})};
  Object.keys(context?.dataFiles||{}).filter(name=>/^chapter_\d+\.json$/.test(name)).forEach(name=>{
    try{
      const chapter=JSON.parse(context.dataFiles[name]);
      (chapter.scenes||[]).forEach(s=>{
        if(s.enemy&&s.enemy.name)collect(s.enemy);
        (s.encounters||[]).forEach(enc=>{if(enc.enemy&&enc.enemy.name)collect(enc.enemy)});
      });
    }catch(e){/* 壊れたJSONは無視。ここは補助的な取り込みであり必須経路ではない */}
  });
  monsters=Array.from(byName.values());
  return monsters;
}
var baseRenderAllForMonsterRegistry=renderAll;
renderAll=function(){ensureMonsters();baseRenderAllForMonsterRegistry()};
var baseWorkspaceDraftForMonsterRegistry=workspaceDraft;
workspaceDraft=function(){ensureMonsters();return baseWorkspaceDraftForMonsterRegistry()};
