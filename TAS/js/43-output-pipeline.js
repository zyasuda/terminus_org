
/* ゲーム側へ渡すJSONを作る段を、ここで一列に並べる。
 *
 * 2026-07-30まで、各ファイルが
 *     var base=mockCampaignPayload; mockCampaignPayload=function(){ const payload=base(); … }
 * という形で前段を包んでいた。11段が9ファイルに散り、どの項目をどの段が確定させるのかが
 * コードから追えなかった。「空の値・解決できない値で既存データを黙って潰す」不具合が
 * 2026-07-29以降で8件出ており、いずれも根はここにあった。
 *
 * 各段は payload を受けて payload を返す普通の関数になっている。並びはこの配列だけが決める。
 * 段を足すときは、関数を該当ファイルへ書き、この配列へ名前を足す。包み込みは作らない。
 * 順序を入れ替えると出力内容が変わるので、変えたら npm test で基準出力の差分を確認する。
 */
const OUTPUT_STEPS = [
  ["outputBaseChapter",    "01i-output.js",         "章とキャンペーンの土台を組む"],
  ["outputFreshCampaign",  "09-new-campaign.js",    "新規キャンペーンのときだけ章と同行者を作り直す"],
  ["outputStableIds",      "10-export-contract.js", "安定ID・style・素材台帳(assets)を付ける"],
  ["outputEntityLedger",   "13-entity-ledger.js",   "campaign.entities をエンティティ台帳から作る"],
  ["outputConceptsItems",  "17-concepts-items.js",  "campaign.concepts / items / initialInventory を作る"],
  ["outputCastAttributes", "26-cast-attributes.js", "campaign.castAttributes を作る"],
  ["outputSceneNpc",       "26-cast-attributes.js", "scenes[].npc / npcSprite を確定させる"],
  ["outputFlagContract",   "27-flags-contract.js",  "campaign.flags / chapter.flagRules / stateUpdates / gameOverText"],
  ["outputRuntimeIds",     "27-flags-contract.js",  "調査対象IDを実行時IDへ置き換え、参照元も追随させる"],
  ["outputThemeRemoval",   "28-theme-removal.js",   "廃止した theme を出力から除く"],
  ["outputEncounters",     "38-encounters.js",      "scenes[].encounters を作る"],
  ["outputMatchWordExits", "42-match-words.js",     "イントロ・アウトロの出口を画面の入力で上書きする"]
];

/* 出力の入口はここだけ。段の名前は呼び出し時に解決するので、ファイルの読み込み順に依存しない。
   段が欠けていたら、黙って飛ばさずに落とす。飛ばすと出力が静かに欠ける。 */
function mockCampaignPayload() {
  return OUTPUT_STEPS.reduce((payload, [name, file]) => {
    const step = window[name];
    if (typeof step !== "function") throw new Error(`出力の段 ${name}（${file}）が見つかりません`);
    return step(payload);
  }, undefined);
};
