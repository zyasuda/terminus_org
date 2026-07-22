// 最小限の外部ストア。app.js(旧vanilla版)のDOM直書き換えを、Reactが購読できる
// 1個のsnapshotオブジェクトへの差し替えに置き換えるためだけの薄い層。
// Redux等は導入しない(このアプリの規模ならuseSyncExternalStore+単純オブジェクトで足りる)。
let snapshot = {
  chat: [],           // {id, kind:'msg'|'dice'|'pic'|'reveal', ...}[]
  diceLog: [],         // 文字列[](新しい順)
  sceneBg: "linear-gradient(135deg, #151720 0%, #1e2230 100%)",
  parallax: null,       // {sky, fg} パララックス素材(D-027: シーン1のみ試作)。nullなら単層背景
  activePortrait: "gareth",
  fx: "",              // ""|"crit"|"fumble" (旧CSS演出。USE_PHASER_FX=false時のフォールバック)
  shakeSeq: 0,          // shakeクラス再トリガー用のカウンタ
  phaserFx: { type: "", seq: 0 }, // Phaser演出のトリガー {type:'dice'|'crit'|'fumble', seq, roll?, ok?, crit?, fumble?}
  leftPanelOpen: false,  // 3パネル独立開閉(排他制御の復活はUI_REDESIGN.md参照)。開幕は全パネル閉→シーケンスで下パネルだけ開く
  rightPanelOpen: false,
  underPanelOpen: true,  // 再開(前回の続き)ではすぐ操作できるよう下パネルは開けておく
  popups: [],           // 通知型ポップアップのキュー {kind, title, body, img}[]。先頭を表示、閉じるとshift
  overlay: { text: "", seq: 0 }, // 主画面に重ねるシーン説明(数秒でフェードアウト)。seqで再トリガー
  sceneInfo: { num: 1, total: 1, brief: "", report: false }, // 左パネルに常時表示する現在シーンの要約。report=依頼人への報告シーン
  clues: [],            // 開示済み手がかり(secretのtext)。左パネルに永続表示
  enemySprite: null,    // {src, identified} 交戦中の敵スプライト。未識別はCSSで黒シルエット→判明時に実体化
  sceneNpcName: null,   // enemySpriteが実際はNPC(依頼人マイラ等)表示の時だけ名前が入る。敵の時はnull
  gmBubble: { text: "", emotion: "Neutral", seq: 0 }, // GMペットの吹き出し(最新のGM発言+感情)。感情はCE仕様の5種、表情アニメの駆動用
  companionBubbles: {},  // 同行者の吹き出し {who: {text, seq}}。立ち絵スロットの脇にGMと同じ形式で表示
  npcBubble: { text: "", seq: 0 }, // シーンNPC(依頼人マイラ等)の吹き出し。中央のnpcSpriteの上に表示
  thinking: {},          // AI応答待ちの「考え中」表示 {gm: true, lydia: true, npc: true など}。対象の吹き出し位置に「…」を出す
  busy: false,
  hp: 10, maxHp: 10, items: [],
  tokenText: "",
  modelText: "(取得中)",
  directionText: "",
  stateJsonText: "",
  secrets: [],          // {open, text}[]
  revealedEntities: [], // 開示済みsecretのentity名(重複なし)。入力補助チップに使う
  verbChips: [],        // 使用頻度順の動詞チップ(プレイをまたいで端末に蓄積)。名詞チップと組み合わせて2タップで指示を作る
  pendingRoll: null,    // {reason, diff, actorName} プレイヤーの「ダイスを振る!」待ち。同行者の判定も名義を表示して本人が振る
  gmMode: "hybrid",     // GMモード: hybrid(移動・調査はscripted、他はLLM) / scripted(LLMゼロ) / llm(従来)
  partySlots: [],       // 同行者の立ち絵スロット {slot, who, img, flip}[]。campaign.jsonのcompanions[].spriteから起動時に組み立てる
  gmSprite: "gm_mascot.png", // GMペットの画像。campaign.jsonのgmSpriteで差し替え可
  curtain: false,       // 新規開始の依頼ポップアップ中は背景を幕で隠す。「はじめる」でfalseになり背景が現れる
  apiViewText: "(まだ通信なし)",
  contentCatalog: [],
  selectedCampaignId: "",
  selectedChapterId: "",
  selectedCampaignTitle: "",
  selectedChapterTitle: ""
};
let listeners = new Set();
let nextId = 1;

export function getSnapshot() { return snapshot; }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function setStore(patch) {
  snapshot = { ...snapshot, ...(typeof patch === "function" ? patch(snapshot) : patch) };
  listeners.forEach(fn => fn());
}
export function pushChat(entry) {
  const withId = { id: nextId++, ...entry };
  setStore(s => ({ chat: [...s.chat, withId] }));
  return withId;
}
export function updateChatEntry(id, patch) {
  setStore(s => ({ chat: s.chat.map(e => e.id === id ? { ...e, ...patch } : e) }));
}
export function clearChat() {
  setStore({ chat: [] });
}
