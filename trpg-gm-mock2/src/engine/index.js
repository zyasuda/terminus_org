// 旧app.js(vanilla DOM版)のゲームロジックをそのまま移植したエンジン層。
// DOM直書き換え(getElementById/innerHTML)だけをstore.js経由のsnapshot更新に置き換えている。
// ロジック(判定・掛け合い・プロンプト構築・sendActionの手番進行)は元の実装を踏襲する。
import { bindChronicle, exportChronicleFile } from "../chronicle.js";
import * as inv from "../inventory.js";
import {
  initialState,
  STAGNATION_SOFT,
  stateFingerprint as buildStateFingerprint,
  takeInjuryCue as buildInjuryCue,
  takeStagnationCue as buildStagnationCue,
  takeRollReactionCue as buildRollReactionCue,
  takeLootRevealCue as buildLootRevealCue
} from "../state.js";
import { callGmApi } from "../llm.js";
import { CAST, GM, BANTER, SCENARIO, CAMPAIGN, CONTENT_SELECTION, loadScenarioData } from "../scenario.js";
import { pushChat, clearChat, setStore, getSnapshot } from "./store.js";
import { openUnderPanelAfterOverlay, setDialogueNodeInfo, setSceneInfo, showSceneOverlay } from "./scene-ui.js";
import { gmGreeting, gmVoiceRule, voiceRule } from "./voice.js";
import {
  EXAMINE_RE,
  encounterRequiredElementsMet, resolveEncounterFoe,
  matchSecretByText, matchSecretByTrigger, pickExamineSecret, examineDifficulty, requiresMet,
  resolveExit, normalizeExit, exitTargetIndexIn, resolveSecretTarget
} from "./progression.js";

// campaign.json の cast[](NPC台帳)から、このシーンのNPCの一般情報(public)を引く。
// cast[].direction はここでは使わない: 「青く脈打つ石」等、未開示secretの内容そのものを
// 含む演出指示があり、無条件でプロンプトに注入すると開示前の秘密がLLMに漏れる
// (2026-07-22)。秘密の開示状態とdirectionを紐づける仕組みができるまでは、
// 既存の状態ガード付きロジック(下記)がその役割を担う
function reportDirection() {
  const npc = sceneNpc();
  const npcCast = npc && (CAMPAIGN.cast || []).find(c => c.id === npc.id);
  let d = npcCast ? `${npcCast.name}を演じよ。${npcCast.public}。` : "依頼人を演じよ。";
  d += state.defeated.includes("灯の番人")
    ? "『番人を倒した』という報告には、一瞬の落胆を見せてから取り繕い、労をねぎらわせよ。"
    : "坑道の奥にいた『誰か』の話には、身を乗り出すほどの関心を見せよ。";
  if (inv.has(state.inventory, "心石の欠片") || revealed.has("s3b")) {
    d += "『青く脈打つ石』や『番人の動力』に話が及んだら、抑えきれない関心を一瞬見せ、すぐに取り繕え。この動揺の理由を説明してはならない。";
  }
  // 報告の脱線防止(2026-07-17(9) T28-32: 帳簿・年貢などの捏造で報告が締まらなくなった)
  d += `${npc ? npc.name : "依頼人"}の関心は坑道の報告だけにある。帳簿・書類・別の依頼など、新しい品や話題を発明してはならない。話が逸れたら報告に引き戻せ。`;
  return d;
}

let state, history, revealed, busy, chron; // chron: Chronicle用の構造化イベントログ

function stateFingerprint() {
  return buildStateFingerprint({ SCENARIO, state, revealed });
}
function takeStagnationCue() { return buildStagnationCue(state); }
function takeInjuryCue() { return buildInjuryCue(state); }
function takeRollReactionCue() { return buildRollReactionCue(state, CAMPAIGN.style || {}); }
function takeLootRevealCue() { return buildLootRevealCue(state); }

export function exportChronicle() {
  bindChronicle({ SCENARIO, CAST, CAMPAIGN, state, chron, revealed });
  exportChronicleFile();
}

const TOKEN_RATE = { in: 3.0, out: 15.0, usdToJpy: 155 };

/* ---------------- 中断・再開(自動保存) ----------------
   「中断ボタン」は用意しない。中断は多くの場合、突発的(タブを誤って
   閉じる・PCがスリープする等)であり、押し忘れれば意味がないため。
   代わりに、状態が変わるたびにlocalStorageへ黙って自動保存し、
   次に開いた時は自動で続きから再開する。「最初から」は保存も消す。 */
function saveKey() {
  const campaignId = CONTENT_SELECTION?.campaignId || "default";
  const chapterId = CONTENT_SELECTION?.chapterId || "chapter_01";
  return `terminus_save_v2_mock2_${campaignId}_${chapterId}`;
}
const LEGACY_SAVE_KEY = "terminus_save_v1_mock2";

function saveGame() {
  try {
    localStorage.setItem(saveKey(), JSON.stringify({ state, chron, history, revealed: [...revealed] }));
  } catch (e) { /* 容量超過・プライベートモード等で失敗してもプレイは止めない */ }
}
function loadGame() {
  try {
    let raw = localStorage.getItem(saveKey());
    // 旧版の固定キーは、初期キャンペーンだけ一度だけ読み替える。
    if (!raw && CONTENT_SELECTION?.campaignId === "lanternhill" && CONTENT_SELECTION?.chapterId === "chapter_01") {
      raw = localStorage.getItem(LEGACY_SAVE_KEY);
      if (raw) localStorage.setItem(saveKey(), raw);
    }
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function clearSave() {
  try {
    localStorage.removeItem(saveKey());
    if (CONTENT_SELECTION?.campaignId === "lanternhill" && CONTENT_SELECTION?.chapterId === "chapter_01") {
      localStorage.removeItem(LEGACY_SAVE_KEY);
    }
  } catch (e) { /* no-op */ }
}

/* 所持品の所有者の表示名。player はプレイヤー本人。それ以外は同行者の登録名を引く */
function ownerDisplayName(ownerId) {
  if (ownerId === inv.PLAYER) return CAMPAIGN.player?.name || "あなた";
  const who = (CAMPAIGN.companions || []).find(c => c?.id === ownerId);
  return who?.name || ownerId;
}

/* LLMへ渡す所持品。誰が何を持つかまで渡す。品名は正式名のまま。
   持ち物が空の同行者は出さない(プロンプトを短く保つ) */
function inventoryForPrompt() {
  const rows = inv.byOwner(state.inventory, ownerDisplayName).filter(r => r.items.length);
  if (!rows.length) return "なし";
  return rows.map(r => `${r.name}=${JSON.stringify(r.items)}`).join(" / ");
}

// シーン説明の表示先(UI_REDESIGN.md: 下パネルは会話専用、主画面は演出専用):
// ・主画面: フェードアウトするナレーションオーバーレイ(初見の演出)
// ・左パネル: 同じ内容を消えずに保持(いつでも見返せる記録)
// シーン切替の演出: 下パネルを閉じ、1秒後にスライドインさせる(この間にGMが語り始める)。
// シーン説明はGMペットの吹き出しで語るので、主画面に別途フェード表示はしない(文面の重複だった)
function showDialogueNode(node) {
  // intro.img が未指定の旧データ互換では、従来の導入画像へフォールバックする。
  const backdropNode = state.pendingIntro && !node.img ? { ...node, img: "locked_iron_gate.jpg" } : node;
  setSceneBackdrop(backdropNode);
  setDialogueNodeInfo(node, state);
  setStore({
    underPanelOpen: false,
    curtain: false,
    companionBubbles: {},
    npcBubble: { text: "", seq: 0 }
  });
  openUnderPanelAfterOverlay();
  const gmText = node.brief || node.text || "";
  // NPCの第一声は作者がnode.greetingを書いた場合のみ。GMの発言に続けて話す
  const steps = [{ text: gmText, speak: () => addGm(gmText, "Neutral") }];
  if (node.npc && node.greeting) {
    steps.push({ text: node.greeting, speak: () => addNpc(node.greeting, node.npc) });
  }
  runSpeechSequence(steps);
  renderDebug();
}

// ダイス結果・開示画像は一旦ポップアップで表示する(下パネル=会話専用の暫定措置。表示方法は別途検討)。
// 呼び出し側がPromiseを待てば、プレイヤーが閉じるまで後続のGM語り・同行者の一言を保留できる
// (ダイス結果を閉じる前からGMやリディアが話し始めてしまう問題への対処)
let popupResolvers = [];
function pushPopup(p) {
  return new Promise(resolve => {
    popupResolvers.push(resolve);
    setStore(s => ({ popups: [...s.popups, p] }));
  });
}
export function dismissPopup() {
  const cur = getSnapshot().popups[0];
  setStore(s => ({ popups: s.popups.slice(1) }));
  popupResolvers.shift()?.();
  if (cur && cur.kind === "intro") {
    // 開幕シーケンス: 幕が開く(1.2s) → 1秒後に下パネルがスライドイン+GM自己紹介
    setStore({ curtain: false });
    setTimeout(() => {
      if (state.pendingIntro) {
        showDialogueNode(SCENARIO.intro);
      } else {
        showSceneOverlay(); // 下パネルのスライドインだけ行う(showSceneOverlay内)
        setTimeout(() => addGm(gmGreeting(), "Happy"), 1000);
      }
    }, 1200);
  }
}

function setSceneBackdrop(sc) {
  let src = sc && sc.img;
  // D-025: 背景はシーン単位ではなくGMの語りの節目(secret開示)で切り替わる。
  // 開示状態(revealed)から導出するので、リロード復元後も開示済みの背景が維持される
  if (sc && revealed) (sc.secrets || []).forEach(s => { if (s.bg && revealed.has(s.id)) src = s.bg; });
  // 画像の下にグラデーションを敷く: 素材が404(未作成)でも無地グラデーションで破綻しない
  const value = src
    ? `url("/images/${src}") center / cover no-repeat, linear-gradient(135deg, #151720 0%, #1e2230 100%)`
    : "linear-gradient(135deg, #151720 0%, #1e2230 100%)";
  // parallaxがあれば空レイヤー+透過前景の2層で表示(素材が404の間は単層imgにフォールバック)
  setStore({ sceneBg: value, parallax: (sc && sc.parallax) || null });
}

/* 現在の進行状態(イントロ中/アウトロ中/通常シーン)に応じて、背景に使うノードを1箇所で決める。
   renderDebugのenemySprite算出(pendingIntro?SCENARIO.intro: ...)と同じ分岐だが、こちらは
   backdrop用にimg未指定時のフォールバック(locked_iron_gate.jpg)も面倒を見る。
   以前はresetGame/restoreGameがそれぞれ別々にこの分岐を書いており、restoreGameだけ
   pendingIntro/pendingEndingを見ずに常にSCENARIO.scenes[sceneIndex]を使っていたため、
   イントロ中にリロードすると背景だけシーン1に化ける不具合があった */
function currentBackdropNode() {
  if (state.pendingIntro && SCENARIO.intro) {
    return SCENARIO.intro.img ? SCENARIO.intro : { ...SCENARIO.intro, img: "locked_iron_gate.jpg" };
  }
  if ((state.pendingEnding || state.chapterEnded) && SCENARIO.ending) {
    return SCENARIO.ending.img ? SCENARIO.ending : { ...SCENARIO.ending, img: "locked_iron_gate.jpg" };
  }
  return SCENARIO.scenes[state.sceneIndex];
}

// chronの1件をstoreへ再生する(chronへの再pushはしない=保存済みログをそのまま画面に描き直すだけ)
function renderChronEntry(e) {
  switch (e.kind) {
    case "gm": pushChat({ kind: "msg", cls: "gm", text: e.text }); break;
    case "player": pushChat({ kind: "msg", cls: "player", text: e.text }); break;
    case "sys": pushChat({ kind: "msg", cls: "sysnote", text: e.text }); break;
    case "companion": {
      const name = (CAST[e.who] && CAST[e.who].name) || "ガレス";
      pushChat({ kind: "msg", cls: "companion companion-" + e.who, text: name + "「" + e.text + "」" });
      break;
    }
    case "npc":
      pushChat({ kind: "msg", cls: "companion companion-npc", text: (e.name || "？？？") + "「" + e.text + "」" });
      break;
    case "dice":
      // ダイスはチャットに出さない(会話専用)。右パネルのダイスログにだけ復元する
      pushDiceLog(e.t, e.roll, e.diff, e.ok, e.crit, e.fumble, e.reason);
      break;
    case "reveal":
      pushChat({ kind: "reveal" });
      break;
    case "hp": break; // チャットには出さない項目(クロニクルのみで使う)
  }
}

function pushDiceLog(t, roll, diff, ok, crit, fumble, reason) {
  const line = `[T${t}] d20=${roll} vs DC${diff} ${ok ? "OK" : "NG"}${crit ? " CRIT" : ""}${fumble ? " FUMBLE" : ""} (${reason})`;
  setStore(s => ({ diceLog: [line, ...s.diceLog] }));
}

export function restoreGame(saved) {
  state = saved.state;
  // 旧セーブの単一値は全同行者へ複製し、復元直後の従来の抑制を維持する。
  if (!state.lastCompanionTurnByWho) {
    state.lastCompanionTurnByWho = Object.fromEntries(
      Object.keys(CAST).map(who => [who, state.lastCompanionTurn ?? -Infinity])
    );
  }
  delete state.lastCompanionTurn;
  /* 旧セーブは所持品が items(文字列配列)だった。所有者の情報は無いのでプレイヤーへ寄せる。
     読み替えたあと items は消す。両方残すと以後どちらが正か分からなくなる */
  state.inventory = inv.normalizeInventory(state);
  delete state.items;
  (CAMPAIGN.companions || []).forEach(c => c?.id && inv.ensureOwner(state.inventory, c.id));
  chron = saved.chron || [];
  history = saved.history || [];
  revealed = new Set(saved.revealed || []);
  // pendingIntro/pendingEnding中のリロードでもcurrentBackdropNode()で正しい背景を選ぶ。
  // 以前はここが常にSCENARIO.scenes[state.sceneIndex]決め打ちで、イントロ中(sceneIndexは
  // 既定値の0のまま)にリロードすると、背景だけシーン1に見えるのに他の表示(NPCスプライト等)
  // はイントロのままという食い違いが起きていた
  setSceneBackdrop(currentBackdropNode());
  busy = false;
  clearChat();
  setStore({ diceLog: [] });
  chron.forEach(renderChronEntry);
  // 再開ノートは画面にだけ出す。chronに積むとリロードのたびにクロニクルへ蓄積して汚染する
  pushChat({ kind: "msg", cls: "sysnote", text: `↻ 前回の続きから再開しました(シーン${state.sceneIndex + 1} / ターン${state.turn})` });
  // GM/NPC/同行者、それぞれの立ち絵にも直前の発言を喋らせる(左パネルの履歴と同期。
  // タップでの再表示もここから効くようになる)。以前はgmBubbleしか復元しておらず、
  // リロード直後にマイラや同行者をタップしても何も出ない不具合があった
  const lastGm = [...chron].reverse().find(e => e.kind === "gm");
  if (lastGm) setStore(s => ({ gmBubble: { text: lastGm.text, emotion: lastGm.emotion || "Neutral", seq: s.gmBubble.seq + 1 } }));
  const lastNpc = [...chron].reverse().find(e => e.kind === "npc");
  if (lastNpc) setStore(s => ({ npcBubble: { text: lastNpc.text, seq: s.npcBubble.seq + 1 } }));
  Object.keys(CAST).forEach(who => {
    const lastLine = [...chron].reverse().find(e => e.kind === "companion" && e.who === who);
    if (lastLine) {
      setStore(s => ({ companionBubbles: { ...s.companionBubbles,
        [who]: { text: lastLine.text, seq: ((s.companionBubbles[who] || {}).seq || 0) + 1 } } }));
    }
  });
  setSceneInfo(state);
  renderDebug();
}

// 起動時に既存セーブが見つかった場合の「続きから/最初から」選択待ち。resumeSavedGame/startNewGameが消費する
let pendingResumeSave = null;
export async function boot() {
  renderModelInfo();
  // シナリオデータはpublic/data/のJSONから読む(DATA_EXCHANGE.md v0.2)。
  // 手作業変換のミスは検証エラーとして画面に出し、プレイを開始しない(busyのまま入力を塞ぐ)
  try {
    await loadScenarioData();
  } catch (e) {
    setStore({
      busy: true,
      popups: [{ kind: "error", title: "シナリオデータの読み込みエラー", body: String(e.message || e) + "\n\npublic/data/ のJSONを修正してリロードしてください。" }]
    });
    return;
  }
  pushVerbChips(); // 動詞チップはゲーム状態と独立(端末に蓄積)なので、起動時に一度流し込む
  // 立ち絵はcampaign.jsonから組み立てる(コード直書き禁止の契約)。spriteが無い同行者は枠ごと出さない。
  // スロット順は現行レイアウト踏襲: 1人目=右手前、2人目=左手前、3人目=右奥(反転)、4人目=左奥(反転)
  const slotOrder = [
    { slot: "slotR1", flip: false }, { slot: "slotL1", flip: false },
    { slot: "slotR2", flip: true }, { slot: "slotL2", flip: true }
  ];
  const partySlots = (CAMPAIGN.companions || [])
    .filter(c => c.sprite).slice(0, 4)
    .map((c, i) => ({ ...slotOrder[i], who: c.id, img: c.sprite, name: c.name }));
  setStore({
    gmMode,
    partySlots,
    gmSprite: GM.sprite || CAMPAIGN.gmSprite || "gm_mascot.png",
    contentCatalog: CONTENT_SELECTION.catalog.campaigns,
    selectedCampaignId: CONTENT_SELECTION.campaignId,
    selectedChapterId: CONTENT_SELECTION.chapterId,
    selectedCampaignTitle: CONTENT_SELECTION.campaignEntry.title,
    selectedChapterTitle: CONTENT_SELECTION.chapterEntry.title
  }); // GMモードと現在のコンテンツをUIへ
  const saved = loadGame();
  if (saved && saved.state && Array.isArray(saved.chron)) {
    // 以前はここで問答無用にrestoreGame()していたため、リロード=常に前回の続きに戻され、
    // 「新しく始めたつもりが変な画面から再開した」という混乱の元になっていた。
    // 続きから/最初からをプレイヤー自身に選ばせる(resumeSavedGame/startNewGameへ)
    pendingResumeSave = saved;
    setStore({
      busy: true,
      popups: [{
        kind: "resume",
        title: "続きから始めますか?",
        body: `前回の続き(シーン${(saved.state.sceneIndex ?? 0) + 1} / ターン${saved.state.turn ?? 0})があります。`
      }]
    });
    return;
  }
  resetGame();
}
export function resumeSavedGame() {
  const saved = pendingResumeSave;
  pendingResumeSave = null;
  setStore({ popups: [] });
  try {
    if (!saved) throw new Error("保存データが無い");
    restoreGame(saved);
  } catch (e) { resetGame(); } // 壊れた保存は無視して新規開始
}
export function startNewGame() {
  pendingResumeSave = null;
  setStore({ popups: [] });
  resetGame();
}

export function switchContent(campaignId, chapterId) {
  const params = new URLSearchParams();
  params.set("campaign", campaignId);
  params.set("chapter", chapterId);
  window.location.search = params.toString();
}

export function resetGame() {
  clearSave();
  state = initialState();
  /* 章開始時の所持品。chapter.startingInventory(キャラクター別)が正。
     無ければ campaign.initialInventory(平坦な配列)をプレイヤーの持ち物として読む */
  state.inventory = inv.startingInventory({
    chapterStarting: SCENARIO.startingInventory,
    campaignInitial: CAMPAIGN.initialInventory,
    fallback: inv.held(state.inventory)
  });
  (CAMPAIGN.companions || []).forEach(c => c?.id && inv.ensureOwner(state.inventory, c.id));
  history = [];
  revealed = new Set();
  chron = [];
  busy = false;
  const intro = SCENARIO.intro;
  const introIsObject = intro && typeof intro === "object";
  state.pendingIntro = introIsObject; // currentBackdropNode()より先に立てる(この状態を見て背景を選ぶ)
  setSceneBackdrop(currentBackdropNode());
  clearChat();
  // 依頼導入(intro)は通知型ポップアップで提示し、シーン説明(brief)は主画面オーバーレイ+左パネルへ。
  // 下パネルのチャットは会話専用にする(UI_REDESIGN.md / EVENT_MAP.mdの「シナリオ開始=依頼ポップアップ」)。
  // curtain: 依頼ポップアップの間は背景(シーン・パネル・キャラ)を幕で隠し、「はじめる」で開ける。
  // パネルは全部閉じた状態から開幕シーケンス(dismissPopup参照)が始まる。
  // GMペット(既定名はダイス先輩)の自己紹介もシーケンス内(シーン説明のフェードイン後)で行う
  //
  // opening/introはnull運用(TAS_導入終端ノード出力仕様_null運用_2026-07-22):
  // null=未作成(ポップアップを出さない)、文字列=旧形式、オブジェクト(exits[]あり)=新形式。
  // 新形式の場合、"はじめる"の後はシーン0へ直行せず、intro.exits[]の解決を待つ(sendAction側で処理)
  const popups = [];
  if (CAMPAIGN.opening) {
    popups.push({ kind: "intro", title: CAMPAIGN.opening.name || "オープニング", body: CAMPAIGN.opening.brief || CAMPAIGN.opening.text || "", img: CAMPAIGN.opening.img || "locked_iron_gate.jpg" });
  }
  if (!introIsObject && typeof intro === "string" && intro) {
    popups.push({ kind: "intro", title: "依頼", body: intro, img: "locked_iron_gate.jpg" });
  }
  setStore({
    diceLog: [], popups,
    curtain: popups.length > 0,
    leftPanelOpen: false, rightPanelOpen: false, underPanelOpen: false
  });
  setSceneInfo(state);
  const introNarration = introIsObject ? (intro.brief || "") : (typeof intro === "string" && intro ? intro : "");
  const openingBrief = introIsObject ? introNarration : (introNarration ? introNarration + "\n\n" : "") + SCENARIO.scenes[0].brief;
  history.push({ role: "user", content: "【システム】セッションが始まった。" });
  history.push({ role: "assistant", content: JSON.stringify({ narration: openingBrief, companion: null, npc: null, check: null, state_updates: null, engage_enemy: false, flee_enemy: false, scene_complete: false, meta_request: null }) });
  renderDebug();
  // 新形式introにはポップアップを挟まない。既存の幕開けと同じく、説明を表示してから入力を受ける。
  if (introIsObject && popups.length === 0) showDialogueNode(intro);
}

/* ---------------- 動詞チップ(入力補助の実験) ----------------
   プレイヤーの宣言文から述語(動詞)を抽出し、頻度つきでlocalStorageへ永続化する。
   Obsidian的に「使うほど育つ」辞書で、名詞チップ(開示済みentity)と組み合わせると
   2タップで「作業札を調べる」のような指示が完成する。
   CONVERSATION_ENGINE.mdのIntent Parser辞書方式を、実プレイから自動構築する実験でもある。
   抽出は後方一致のヒューリスティック(文末の述語を助詞で切り出す)。精度が欲しくなったらLLM抽出に切替 */
const VERB_KEY = "terminus_verb_freq_v1";
const SEED_VERBS = ["調べる", "よく見る", "話しかける", "進む", "戻る", "攻撃する", "使う"];
const VERB_RECENT_MS = 7 * 24 * 60 * 60 * 1000; // 最近使われていない学習動詞はチップに出さない(7日)
// 意味の近い表記ゆれを基本動詞に寄せる(「しらべる/調べる」「進む/進もう」が別チップで並ぶのを防ぐ)
const VERB_CANON = {
  "しらべる": "調べる", "調べろ": "調べる", "調査する": "調べる",
  "見る": "よく見る", "みる": "よく見る", "観察する": "よく見る", "眺める": "よく見る",
  "進もう": "進む", "すすむ": "進む", "向かう": "進む",
  "もどる": "戻る", "戻ろう": "戻る",
  "話す": "話しかける", "はなしかける": "話しかける", "尋ねる": "話しかける", "聞く": "話しかける", "声をかける": "話しかける", "呼びかける": "話しかける",
  "攻撃": "攻撃する", "殴る": "攻撃する", "斬る": "攻撃する"
};
// 動詞ごとに直前の助詞は一意に決まる(「扉を調べる」「坑道に進む」)。名詞チップ側で
// 「を」を決め打ちすると「坑道を進む」になるので、助詞は動詞チップが補う。
// 学習した未知の動詞は既定の「を」にする(他動詞の方が多いため)
const VERB_PARTICLE = {
  "調べる": "を", "よく見る": "を", "攻撃する": "を", "使う": "を",
  "話しかける": "に", "進む": "に", "戻る": "に"
};
const DEFAULT_PARTICLE = "を";
function particleFor(v) { return VERB_PARTICLE[v] || DEFAULT_PARTICLE; }
// 名詞チップ→動詞チップの連結時に挟む助詞を返す。空欄・すでに助詞や句読点で
// 終わっている場合は何も挟まない(「扉を」+「を調べる」の二重を防ぐ)
export function joinParticle(prev, particle) {
  const t = (prev || "").trimEnd();
  if (!t) return "";
  if (/[をにへとでがはやもか、。「」\s]$/.test(t)) return "";
  return particle;
}
function canonVerb(v) { return VERB_CANON[v] || v; }
function loadVerbFreq() {
  // 旧形式 {verb: count} は {verb: {n, t}} へ移行する(tは最終使用時刻。旧データはt=0で「古い」扱い)
  try {
    const raw = JSON.parse(localStorage.getItem(VERB_KEY)) || {};
    Object.keys(raw).forEach(k => { if (typeof raw[k] === "number") raw[k] = { n: raw[k], t: 0 }; });
    return raw;
  } catch (e) { return {}; }
}
// 既知の動詞(シード+表記ゆれ)。長い方から見て後方一致させる
const KNOWN_VERBS = [...new Set([...SEED_VERBS, ...Object.keys(VERB_CANON)])].sort((a, b) => b.length - a.length);
const VERB_MAX_LEN = 5; // 未知語はこの長さまで。助詞なしで名詞と繋がった「見取り図調べる」を弾く
export function extractVerb(text) {
  const tail = text.replace(/[。!?！？\s]+$/, "").split(/[をにへとで、。]/).pop().trim();
  // 助詞が無くても「名詞+動詞」を切れるよう、まず既知の動詞で後方一致を試す
  const known = KNOWN_VERBS.find(v => tail.endsWith(v));
  if (known) return known;
  if (tail.length < 2 || tail.length > VERB_MAX_LEN) return null; // 短すぎ/長すぎは述語とみなさない
  if (!/[るすくぐむぶぬうつ]$/.test(tail)) return null; // 動詞の終止形らしい語尾のみ採用
  return tail;
}
function recordVerb(text) {
  const v = canonVerb(extractVerb(text) || "");
  if (!v) return;
  const freq = loadVerbFreq();
  freq[v] = { n: (freq[v]?.n || 0) + 1, t: Date.now() };
  try { localStorage.setItem(VERB_KEY, JSON.stringify(freq)); } catch (e) { /* no-op */ }
  pushVerbChips();
}
function pushVerbChips() {
  const raw = loadVerbFreq();
  // 過去に別表記で貯まった分も正規形へ合流させる(n合算・tは新しい方)
  const freq = {};
  Object.entries(raw).forEach(([k, v]) => {
    const c = canonVerb(k);
    freq[c] = { n: (freq[c]?.n || 0) + v.n, t: Math.max(freq[c]?.t || 0, v.t || 0) };
  });
  const now = Date.now();
  const learned = Object.keys(freq)
    .filter(k => now - (freq[k].t || 0) < VERB_RECENT_MS) // 最近使ったものだけ表示(列が伸び続けるのを防ぐ)
    .filter(k => k.length <= VERB_MAX_LEN || SEED_VERBS.includes(k)) // 旧バージョンが誤学習した「名詞+動詞」を掃除する
    .sort((a, b) => freq[b].n - freq[a].n);
  const all = [...new Set([...learned, ...SEED_VERBS])]; // 学習済みを頻度順で先頭に、シードで穴埋め
  setStore({ verbChips: all.slice(0, 6).map(v => ({ v, p: particleFor(v) })) });
}

/* ---------------- UI helpers(store経由) ---------------- */
function addMsg(cls, text) { pushChat({ kind: "msg", cls, text }); }

// LLMはプロンプトの文字数指示を守り切らないことがあるため、GMの語りは表示前に必ず短く切る(子ども向け可読性要件、GDD 1.7)
function trimNarration(text) {
  if (!text) return text;
  const sentences = [];
  let depth = 0, start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "「") depth++;
    else if (c === "」") depth = Math.max(0, depth - 1);
    else if ("。!?！?".includes(c) && depth === 0) {
      sentences.push(text.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < text.length) sentences.push(text.slice(start));

  let out = "";
  for (let i = 0; i < sentences.length; i++) {
    if (out && (out.length + sentences[i].length > 100 || i >= 3)) break;
    out += sentences[i];
  }
  if (!out) out = text;

  if (out.length > 100) {
    let cut = out.slice(0, 100);
    let d = 0;
    for (const c of cut) { if (c === "「") d++; else if (c === "」") d = Math.max(0, d - 1); }
    if (d > 0) {
      const closeIdx = out.indexOf("」", 100);
      cut = (closeIdx !== -1 && closeIdx < 140) ? out.slice(0, closeIdx + 1) : out.slice(0, 100);
    }
    out = cut;
  }
  // 末尾に閉じられない「…が残ったら、その開き括弧ごと落とす(「」「 のような切れ端の表示対策)。
  // 全文が閉じられないセリフだけの場合は空になるので、その時は元のまま返す
  const stripped = out.replace(/「[^」]*$/, "").trimEnd();
  return stripped || out;
}
// GMの語りはチャットログに残しつつ、主画面のGMペットの吹き出しにも最新の1件を出す
// (復元時のrenderChronEntryはaddGmを通らないので、リロードで過去の発言が吹き出しに再表示されることはない)
// 感情はCONVERSATION_ENGINE.mdの定義に合わせる。GMペットの表情アニメ(将来の差分フレーム)の駆動データ
const EMOTIONS = ["Happy", "Angry", "Fear", "Sad", "Neutral"];
const normalizeEmotion = e => (EMOTIONS.includes(e) ? e : "Neutral");
const addGm = (t, emotion) => {
  const emo = normalizeEmotion(emotion);
  chron.push({ t: state.turn, ts: Date.now(), kind: "gm", text: t, emotion: emo });
  addMsg("gm", t);
  setStore(s => ({ gmBubble: { text: t, emotion: emo, hidden: false, seq: s.gmBubble.seq + 1 } }));
};
// GMペットをタップした時: 最後の発言の吹き出しを出し直す(seqの増分で再マウント→フェードが再スタート)
export function replayGmBubble() {
  setStore(s => s.gmBubble.text ? { gmBubble: { ...s.gmBubble, hidden: false, seq: s.gmBubble.seq + 1 } } : {});
}
// 同行者の立ち絵をタップした時: その同行者の最後の発言の吹き出しを出し直す。
// まだ一度も喋っていない場面では反応が無く「壊れている」ように見えるので、
// CAST[who].idleLine(scenario.jsが一人称から既定値を用意する)で受け答えする
export function replayCompanionBubble(who) {
  setStore(s => {
    const b = s.companionBubbles[who];
    if (b && b.text) return { companionBubbles: { ...s.companionBubbles, [who]: { ...b, hidden: false, seq: b.seq + 1 } } };
    const idle = (CAST[who] && CAST[who].idleLine) || "…どうした?";
    return { companionBubbles: { ...s.companionBubbles, [who]: { text: idle, hidden: false, seq: ((b || {}).seq || 0) + 1 } } };
  });
}
// NPC(依頼人マイラ等)の立ち絵をタップした時: 最後の発言の吹き出しを出し直す
export function replayNpcBubble() {
  setStore(s => s.npcBubble.text ? { npcBubble: { ...s.npcBubble, hidden: false, seq: s.npcBubble.seq + 1 } } : {});
}
// AI応答待ちの「考え中(…)」表示。key: "gm" | 同行者id | "npc"
function setThinking(key, on) {
  setStore(s => {
    const t = { ...s.thinking };
    if (on) t[key] = true; else delete t[key];
    return { thinking: t };
  });
}
// LLMの語り専用: 直前のLLM語りと完全一致なら差し替える(小型モデルが自分の応答をなぞる劣化ループ対策。
// 2026-07-17(6) T15-26で同文が10連続した)。決定論の定型文(改めて確かめる等)には適用しない
let lastLlmNarration = "";
const addGmNarration = (t, emotion) => {
  if (t && t === lastLlmNarration) {
    addGm("……状況は変わらないようだ。別の手を試すか、先へ進む頃合いかもしれない。", "Neutral");
    return;
  }
  lastLlmNarration = t;
  addGm(t, emotion);
};
const addPlayer = t => { chron.push({ t: state.turn, ts: Date.now(), kind: "player", text: t }); addMsg("player", t); };
const addNote = t => { chron.push({ t: state.turn, ts: Date.now(), kind: "sys", text: t }); addMsg("sysnote", t); };
function highlightPortrait(who) {
  setStore({ activePortrait: who });
}
// セリフのサニタイズ: 表示側が「」で包むため、モデルが入れてくるカギ括弧やJSON断片(,」等)を除去する。
// 「A」「B」,」のような複数文連結は最初の一文だけ残す(2026-07-17(9) T25-32)。
// さらに、スキーマ語彙の漏れ込み(say内に"gareth"等の話者idやJSONキーが混入する。ローカルSLMで観測)を落とす。
// 台詞は日本語なので、生の英字id・キー名が台詞に現れることは正当にはない
function sanitizeSay(t) {
  const ids = [...Object.keys(CAST), ...SCENARIO.scenes.map(s => s.npc && s.npc.id).filter(Boolean)];
  // スキーマ語彙(キー名・話者id・JSONリテラル)を含む英字トークンは、アンダースコア連結
  // ("aside_true_false_..."等の崩れた出力)ごと丸ごと落とす。\w*で連結全体を巻き込む
  const vocab = `who|say|aside|check|true|false|null|narration|emotion|scene|meta|state|delta|complete|request|${ids.join("|")}`;
  return String(t)
    .replace(/」\s*[、,]?\s*「/g, " ").replace(/[「」]/g, "")
    .replace(new RegExp(`["'{}:,]?\\s*\\b\\w*(?:${vocab})\\w*\\b\\s*["'{}:]?`, "gi"), " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s"':,{}、]+/, "").replace(/[\s"':{},、]+$/, "").trim();
}
const addCompanion = (t, who = Object.keys(CAST)[0]) => {
  const name = (CAST[who] && CAST[who].name) || who;
  t = sanitizeSay(t);
  if (!t) return;
  chron.push({ t: state.turn, ts: Date.now(), kind: "companion", who, text: t });
  addMsg("companion companion-" + who, name + "「" + t + "」");
  // GMペットと同じ形式の吹き出しを、その同行者の立ち絵の脇に出す(約8秒でフェードアウト)
  setStore(s => ({ companionBubbles: { ...s.companionBubbles,
    [who]: { text: t, hidden: false, seq: ((s.companionBubbles[who] || {}).seq || 0) + 1 } } }));
  highlightPortrait(who);
};
// シーンNPC(依頼人マイラ等)の台詞。話者名はシーン定義から取る(モデルに選ばせない)
// 話者は既定でシーン常在のNPC。イントロ・アウトロのようにシーン外のノードで喋らせる場合は
// そのノードのnpcを渡す(シーン側にnpcが無いと、渡さない限り何も出ない)
const addNpc = (t, speaker) => {
  const npc = speaker || SCENARIO.scenes[state.sceneIndex].npc;
  if (!npc) return;
  t = sanitizeSay(t);
  if (!t) return;
  chron.push({ t: state.turn, ts: Date.now(), kind: "npc", name: npc.name, text: t });
  addMsg("companion companion-npc", npc.name + "「" + t + "」");
  // GM/同行者と同じ形式の吹き出しを、中央のnpcSprite(#enemySprite)の上に出す
  setStore(s => ({ npcBubble: { text: t, hidden: false, seq: s.npcBubble.seq + 1 } }));
  saveGame(); // 非同期(npcAgentReply)でターン確定後に届くため、ここで保存しないとリロードで消える
};
/* ---------------- 表示シーケンス ----------------
   「Aを話す→Aを読み終わる頃合いまで待つ→前の吹き出しを消す→Bを話す→…」という進行を
   1箇所に集約する。個々の呼び出し側でCONSENT_GAP_MS的な場当たりのsetTimeout値を
   書かない(2026-08-07以前は箇所ごとに違う固定値がハードコードされ、短すぎて
   同時に見えたり、逆に短すぎて読む間もなくシーン転換したりしていた)。

   吹き出し(gmBubble/npcBubble/companionBubbles)はどれもCSSアニメーションで
   8〜10.6秒間は表示され続けるため、次の話者が話す前に明示的に消さないと
   画面上で重なって見える。読了目安の時間はテキストの文字数から機械的に計算する
   (声優の読み上げ速度を模した値ではなく、プレイヤーが目で追える最低限の時間)。 */
function readDelayMs(text) {
  return Math.min(4000, Math.max(900, (text || "").length * 60));
}
/* 吹き出しを隠すのは hidden フラグで行い、text は最後の発言として残す。
   text を空にすると立ち絵タップの replay*Bubble() が「何も無い」になってしまうため
   (シーケンス中に前の話者を消すたび、その話者の発言が復元できなくなっていた) */
function clearGmBubble() {
  setStore(s => (s.gmBubble.hidden ? {} : { gmBubble: { ...s.gmBubble, hidden: true } }));
}
function clearNpcBubble() {
  setStore(s => (s.npcBubble.hidden ? {} : { npcBubble: { ...s.npcBubble, hidden: true } }));
}
function clearCompanionBubble(who) {
  setStore(s => (s.companionBubbles[who] && !s.companionBubbles[who].hidden
    ? { companionBubbles: { ...s.companionBubbles, [who]: { ...s.companionBubbles[who], hidden: true } } }
    : {}));
}
function clearAllBubbles() {
  clearGmBubble();
  clearNpcBubble();
  setStore(s => ({
    companionBubbles: Object.fromEntries(
      Object.entries(s.companionBubbles).map(([who, b]) => [who, { ...b, hidden: true }]))
  }));
}
/* steps: [{ text, speak(), clear() }, ...]。各stepの直前にclear()(省略時はclearAllBubbles)
   を呼んで前の話者の吹き出しを消し、speak()を呼ぶ。次のstepまではreadDelayMs(text)だけ待つ。
   全stepの後、最後のtextの読了目安だけ待ってからonDone()を呼ぶ(省略可) */
function runSpeechSequence(steps, onDone) {
  const run = idx => {
    if (idx >= steps.length) {
      const lastText = steps.length ? steps[steps.length - 1].text : "";
      if (onDone) setTimeout(onDone, lastText ? readDelayMs(lastText) : 0);
      return;
    }
    const s = steps[idx];
    (s.clear || clearAllBubbles)();
    s.speak();
    setTimeout(() => run(idx + 1), readDelayMs(s.text));
  };
  run(0);
}
// クリティカル/ファンブル時の画面演出。フラッシュはPhaser(PhaserFx.jsx)、
// シェイクはDOM全体を揺らす必要があるため従来のCSS(body.shake)のまま。
// Phaser側で問題が出たらUSE_PHASER_FX=falseで旧CSSフラッシュ(#fx)に戻せる。
const USE_PHASER_FX = true;
function firePhaserFx(type, payload) {
  setStore(s => ({ phaserFx: { type, seq: s.phaserFx.seq + 1, ...payload } }));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
function screenFx(kind) {
  if (USE_PHASER_FX) {
    firePhaserFx(kind);
    setStore(s => ({ shakeSeq: s.shakeSeq + 1 }));
    return;
  }
  setStore(s => ({ fx: kind, shakeSeq: s.shakeSeq + 1 }));
  setTimeout(() => setStore({ fx: "" }), 700);
}
// ダイス演出はD20Overlay(判定待ちの間に主画面で回って確定)、結果の文言はポップアップで通知
async function addDice(roll, diff, ok, crit, fumble, reason) {
  const label = crit ? "クリティカル!" : fumble ? "ファンブル…" : ok ? "成功" : "失敗";
  chron.push({ t: state.turn, ts: Date.now(), kind: "dice", roll, diff, ok, crit, fumble, reason });
  pushDiceLog(state.turn, roll, diff, ok, crit, fumble, reason);
  if (crit || fumble) screenFx(crit ? "crit" : "fumble");
  /* 判定リアクション(campaign.style.rollReaction)の材料。全てのダイスはここを通るので、
     出目の判定を新しく書かずに1箇所で拾える。この手番でLLMを呼ばずに終わった場合は
     消費されないまま残るが、次の手番の頭で捨てるので1手番遅れて出ることはない */
  if (crit || fumble) state.pendingRollOutcome = crit ? "critical" : "fumble";
  // プレイヤーがポップアップを閉じるまで、呼び出し元(await addDice)の後続処理(GMの語り・
  // 開示・同行者の一言)を保留する
  await pushPopup({ kind: "dice", title: "判定", body: `🎲 ${reason} — d20 → ${roll} / DC ${diff} … ${label}` });
}
// secretを開示する。text=LLM注入用(GM向け注記込み)、playerText=プレイヤー表示用(あれば優先)
function addReveal(s) {
  // クロニクルはプレイヤー成果物なので、GM向け注記入りのtextではなくplayerTextを記録する(注記の漏えい対策)
  chron.push({ t: state.turn, ts: Date.now(), kind: "reveal", text: s.playerText || s.text });
  pushChat({ kind: "reveal" });
  if (s.bg) setSceneBackdrop(SCENARIO.scenes[state.sceneIndex]); // D-025: 開示に連動して背景を差し替え
  // 画像も③層に従う: 開示条件を満たした時にだけ表示される。手がかりの本文は左パネルに永続表示される
  if (s.img) pushPopup({ kind: "reveal", title: "情報開示", body: s.playerText || s.text, img: s.img });
}

function renderTokens() {
  const t = state.tokens;
  const total = t.in + t.out;
  const usd = (t.in / 1e6) * TOKEN_RATE.in + (t.out / 1e6) * TOKEN_RATE.out;
  const jpy = usd * TOKEN_RATE.usdToJpy;
  const perTurn = state.turn > 0 ? Math.round(total / state.turn) : 0;
  setStore({
    tokenText:
      `入力 : ${t.in.toLocaleString()}\n` +
      `出力 : ${t.out.toLocaleString()}\n` +
      `合計 : ${total.toLocaleString()}  (API ${t.calls}回 / 1手番 約${perTurn.toLocaleString()})\n` +
      `概算 : $${usd.toFixed(4)} ≒ ¥${jpy.toFixed(1)}  ※目安`
  });
}

async function renderModelInfo() {
  try {
    const res = await fetch("/api/model-info");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const info = await res.json();
    setStore({
      modelText:
        `backend : ${info.backend}\n` +
        `model   : ${info.model}\n` +
        `source  : ${info.source}` +
        (info.normalizedConfiguredModel && info.normalizedConfiguredModel !== info.configuredModel
          ? `\nalias   : ${info.configuredModel} -> ${info.normalizedConfiguredModel}`
          : "") +
        (info.configuredModel && !info.configuredModelAccepted
          ? `\nignored : ${info.configuredModel}`
          : "")
    });
  } catch (e) {
    setStore({ modelText: `取得失敗: ${e.message}` });
  }
}

function renderDebug() {
  renderTokens();
  const curScene = SCENARIO.scenes[state.sceneIndex];
  const secrets = [];
  const revealedEntities = [];
  const clues = [];
  SCENARIO.scenes.forEach(sc => sc.secrets.forEach(s => {
    const open = revealed.has(s.id);
    secrets.push({ open, text: open ? s.text : "シーン" + sc.id + "の未開示情報(判定成功で開放)" });
    // 名詞チップは現在のシーンの分だけ(チップ列が横に伸び続けるのを防ぐ。過去の手がかりは左パネルで参照)。
    // 開示済みに加え、一度でも判定を振った対象(examined)も出す(失敗後の再挑戦を2タップに)
    const known = open || (state.examined || []).includes(s.entity);
    const chipLabel = s.entity; // aliasesは入力照合用の別名辞書。表示は作者が書いたentityを使う
    if (known && chipLabel && sc === curScene && !revealedEntities.includes(chipLabel)) revealedEntities.push(chipLabel);
    if (open) clues.push(s.playerText || s.text);
  }));
  // 交戦中の敵は名詞チップの先頭に出す(未識別は「不気味な影」、正体判明で「錆喰い」に切り替わる)
  if (state.enemy) revealedEntities.unshift(enemyName(state.enemy));
  (state.unknownTarget?.candidates || []).forEach(name => {
    if (name && !revealedEntities.includes(name)) revealedEntities.push(name);
  });
  // イントロ中(pendingIntro)だけ、作者が書いた固定のヒント(「依頼について」等)を出す。
  // 名詞チップ(revealedEntities)と違い「を」を付け足さずそのまま入力欄に入れるため別枠にする
  const introHints = state.pendingIntro && SCENARIO.intro && Array.isArray(SCENARIO.intro.hintChips)
    ? SCENARIO.intro.hintChips : [];
  setStore({
    introHints,
    directionText: curScene.report ? reportDirection() : curScene.direction,
    hp: state.hp, maxHp: state.maxHp, items: inv.held(state.inventory),
    // 回復薬はinventory(一意な品名)の外で個数管理しているため、表示だけここで合流させる
    inventoryByOwner: inv.byOwner(
      state.healPotions > 0
        ? { ...state.inventory, [inv.PLAYER]: [...(state.inventory[inv.PLAYER] || []), `${HEAL_POTION_NAME}×${state.healPotions}`] }
        : state.inventory,
      ownerDisplayName
    ),
    secrets,
    revealedEntities,
    clues,
    // 交戦状態から導出(engage/正体判明/撃破/離脱/シーン遷移のどこでもrenderDebugが呼ばれるため、ここで一元管理)
    // 交戦中は従来通り。presence指定の敵(灯の番人など)は交戦前からシーンに常在させ、
    // identifySecretの開示で実体化する(平和ルートでもスプライトを見せる)。
    // npcSpriteは敵ではないシーン常在キャラ(依頼人マイラ等)。常に実体表示。
    // sceneNpcName: #enemySpriteスロットが実際にNPC表示(敵ではない)の時だけ名前を渡す
    // (タップ時に「マイラに」を入力欄へ差し込むため、UI側は敵かNPCかを区別できる必要がある)
    ...(() => {
      if (state.enemy && state.enemy.sprite) {
        return { enemySprite: { src: state.enemy.sprite, identified: !!state.enemy.identified, name: state.enemy.name }, sceneNpcName: null };
      }
      if (curScene.enemy && curScene.enemy.presence && curScene.enemy.sprite && !state.defeated.includes(curScene.enemy.name)) {
        return { enemySprite: { src: curScene.enemy.sprite, identified: revealed.has(curScene.enemy.identifySecret), name: curScene.enemy.name }, sceneNpcName: null };
      }
      // intro / ending もシーンNPCと同じスロット・表示ロジックを使う。
      // 章完了後(chapterEnded)もendingのスプライトを維持する。渡す等の出口処理で
      // pendingEndingがfalseに戻った直後、まだsceneIndexは最後のシーンのままのため、
      // ここで切り替えないとcurScene(村人等)のスプライトへ逆戻りしていた
      const dialogueNode = state.pendingIntro ? SCENARIO.intro
        : (state.pendingEnding || state.chapterEnded) ? SCENARIO.ending : null;
      if (dialogueNode && dialogueNode.npcSprite) {
        return { enemySprite: { src: dialogueNode.npcSprite, identified: true }, sceneNpcName: (dialogueNode.npc && dialogueNode.npc.name) || null };
      }
      if (curScene.npcSprite) {
        return { enemySprite: { src: curScene.npcSprite, identified: true }, sceneNpcName: (curScene.npc && curScene.npc.name) || null };
      }
      return { enemySprite: null, sceneNpcName: null };
    })()
  });
  saveGame(); // 状態が変わるたびに黙って自動保存(中断ボタンの代わり)
}

/* ---------------- ゲームロジック(システム側の権威) ---------------- */
function rollD20() { return 1 + Math.floor(Math.random() * 20); }

/* ダイスはプレイヤー自身に振らせる: 判定が要求されたら「ダイスを振る!」ボタンで手を止め、
   タップされてから出目を確定する(乱数は従来通りJS側)。同行者(actor)の判定はプレイヤーの
   手を止めず自動で確定する——止まるのはプレイヤー自身の判定だけ */
let rollResolver = null;
function requestPlayerRoll(reason, diff, actorName) {
  if (actorName && actorName !== "あなた") return Promise.resolve(rollD20());
  // 出目は演出の開始前に確定する。UIはこの値を見せるだけで、演出完了後に解決する。
  setStore({ pendingRoll: { reason, diff, actorName, result: rollD20() } });
  return new Promise(resolve => { rollResolver = resolve; });
}
export function performRoll(result) {
  if (!rollResolver) return;
  const resolve = rollResolver;
  rollResolver = null;
  const value = result ?? getSnapshot().pendingRoll?.result ?? rollD20();
  setStore({ pendingRoll: null });
  resolve(value);
}

function applyUpdates(u, opts = {}) {
  if (!u) return;
  if (typeof u.hp_delta === "number") {
    let delta = Math.max(-3, Math.min(2, Math.round(u.hp_delta)));
    // LLM提案の被ダメージは戦闘中かファンブル時のみ有効(調査・会話の失敗でHPを削らせない)
    if (delta < 0 && !opts.allowPlayerDamage) delta = 0;
    state.hp = Math.max(0, Math.min(state.maxHp, state.hp + delta));
  }
  if (opts.allowEnemyDamage && state.enemy && typeof u.enemy_hp_delta === "number") {
    const delta = Math.max(-3, Math.min(0, Math.round(u.enemy_hp_delta)));
    state.enemy.hp = Math.max(0, state.enemy.hp + delta);
  }
  if (Array.isArray(u.add_items)) {
    const allowed = availableLoot(SCENARIO.scenes[state.sceneIndex]); // requires付きは開示前は入手不可
    u.add_items.slice(0, 2).forEach(i => {
      if (typeof i === "string" && allowed.includes(i) && inv.give(state.inventory, i)) {
        logSceneEvent(`「${i}」を手に入れた`);
      }
    });
  }
  if (Array.isArray(u.remove_items)) u.remove_items.forEach(i => inv.take(state.inventory, i));
}

// cause(任意): ダメージの原因(敵の攻撃のダイス結果など)。ポップアップに明示する
function applyUpdatesLogged(u, opts, cause) {
  const before = state.hp;
  applyUpdates(u, opts);
  if (state.hp < before) {
    state.pendingInjuryConcern = true;
    const dmg = before - state.hp;
    // ダメージは見逃されやすいので、画面シェイク+赤フラッシュ→ポップアップで明示+GMが残りHPを知らせる
    screenFx("damage");
    pushPopup({
      kind: "damage",
      title: "ダメージを受けた!",
      body: `${cause ? cause + "\n" : ""}HP ${before} → ${state.hp}(−${dmg})`
    });
    addGm(
      `${dmg}ダメージ! 残りHPは ${state.hp}/${state.maxHp} だ。${state.hp <= 3 ? "……まずいぞ、無理はするな。" : ""}`,
      state.hp <= 3 ? "Fear" : "Sad"
    );
  }
  if (state.hp !== before) {
    chron.push({ t: state.turn, ts: Date.now(), kind: "hp", from: before, to: state.hp });
  }
}

// whoの正規化: モデルはid("lydia")ではなく名前("リディア"や"リディア(同行者)")を返すことがある。
// 名前からidを引き、どうしても解決できない時だけfallbackを使う(誤帰属でキャラが入れ替わるのを防ぐ)
// キャラのgender(male/female/none)から語尾の制約を機械的に生成する(一人称の厳密指定は別途firstPerson)。
// キャラごとに手書きする代わりにここで一元管理し、書き漏れ(片方だけ指定漏れ等)を構造的に防ぐ
function normalizeWho(w, fallback) {
  if (CAST[w]) return w;
  const s = String(w || "");
  const hit = Object.entries(CAST).find(([id, c]) => s.includes(c.name) || s.toLowerCase().includes(id));
  return hit ? hit[0] : fallback;
}

// 現在のシーンに常在するNPC(依頼人マイラ等)。同行者(CAST)とは別の話者区分
function sceneNpc() {
  return SCENARIO.scenes[state.sceneIndex].npc || null;
}
// whoがシーンNPCを指しているか(名前・id・部分一致で判定)
function matchesNpc(w, npc) {
  if (!npc) return false;
  const s = String(w || "");
  return s === npc.id || s.includes(npc.name) || npc.name.includes(s) ||
    s.toLowerCase().includes(npc.id);
}

function resolveCompanion(r) {
  if (!r.companion || !r.companion.say) return;
  const say = String(r.companion.say).slice(0, 120);
  const who = normalizeWho(r.companion.who, null);
  if (who) return { say, who };
  // 同行者に解決できない話者はガレス/リディアへ倒さない(誤帰属で人格が入れ替わる)。
  // シーンNPC(マイラ等)ならNPCとして表示し、それ以外は台詞を捨てる(欠落の方が害が小さい)
  const npc = sceneNpc();
  if (matchesNpc(r.companion.who, npc)) return { say, npc };
  console.warn("companion.who を解決できないため台詞を破棄:", r.companion.who, say);
}

// 「考え中」表示の最低表示時間や、reveal直後にNPCの非同期応答を一拍置く等、
// 読了目安(readDelayMs)を計算するほどの内容が無い箇所向けの短い間。
// 話者間の読了待ち(GM→NPC→同行者等)はreadDelayMs/runSpeechSequenceを使う
const SHORT_PACING_MS = 350;
const FREQUENCY_GAP = { none: Infinity, low: 6, standard: 3, high: 1 };
function shouldShowCompanion(companion, addressed) {
  if (!companion) return false;
  if (!companion.who || addressed) return true;
  const gap = FREQUENCY_GAP[CAST[companion.who]?.speechFrequency || "standard"] ?? 3;
  if (gap === Infinity) return false;
  const last = state.lastCompanionTurnByWho?.[companion.who] ?? -Infinity;
  return state.turn - last >= gap;
}

function maybeCompanion(r, addressed, companion = resolveCompanion(r)) {
  if (!shouldShowCompanion(companion, addressed)) return false;
  const { say, who } = companion;
  if (!who) {
    addNpc(say);
    return true;
  }
  addCompanion(say, who);
  (state.lastCompanionTurnByWho ||= {})[who] = state.turn;
  if (r.companion.aside && !addressed) registerBoke(who, say);
  return true;
}

async function revealTurnBeats(r, addressed) {
  const companion = resolveCompanion(r);
  const willSpeak = companion && companion.who && shouldShowCompanion(companion, addressed);
  if (willSpeak) setThinking(companion.who, true);
  await sleep(SHORT_PACING_MS);
  if (willSpeak) setThinking(companion.who, false);
  return maybeCompanion(r, addressed, companion);
}

// メイン応答のnpc.sayフィールドはスキーマ上の「受け皿」としてだけ残し、表示には使わない
// (受け皿がないとマイラの台詞がcompanion枠へ流れ込む。一方、表示に使うとローカルSLMが
// シーンbrief内の台詞をそのまま複写し、毎ターン同じ一言に固定化する。クロニクル2026-07-18(1) T27-34)。
// 実際の台詞は下のnpcAgentReplyが専用コンテキストで生成する。

// NPCの部分エージェント化: revealFlavorと同じ「専用の小さな呼び出し・非同期・本編を待たせない」
// パターンで、シーンNPC(依頼人マイラ等)の一言を生成する。メインGMのJSONから独立した
// コンテキストを持つため、briefの複写や他キャラとの混同が構造的に起きない
function npcAgentReply(playerText, revealGate) {
  const npc = sceneNpc();
  if (!npc) return;
  const sc = SCENARIO.scenes[state.sceneIndex];
  const direction = sc.report ? reportDirection() : (sc.direction || "");
  // 直近のやり取り(プレイヤー宣言・GM語り・自分の過去の発言)だけを渡す。未開示の真相は渡らない
  const recent = chron.slice(-14)
    .filter(e => ["player", "gm", "npc"].includes(e.kind))
    .map(e => e.kind === "player" ? `プレイヤー: ${e.text}`
      : e.kind === "gm" ? `GM: ${e.text}`
      : `${npc.name}(あなた): ${e.text}`)
    .join("\n");
  setThinking("npc", true); // 非同期でターン終了後に届くため、GM/同行者とは別に自前で消す
  callGmApi({
    system: `ソロTRPGの登場人物「${npc.name}」として一言だけ返す。${direction}\n` +
      `日本語の口語。40字以内で言い切る。直前の自分の発言と同じ文・同じ問いを繰り返すな。` +
      `プレイヤーが新しい情報を伝えたら、それを聞いた反応を返せ。応答はJSONのみ: {"say":"一言"}`,
    messages: [{ role: "user", content: `直近のやり取り:\n${recent}\n\nプレイヤーの最新の発言・行動:「${playerText}」\n${npc.name}が返す一言だけをJSONで。` }],
    maxTokens: 80
  }).then(async data => {
    const raw = ((data && data.content) || []).map(b => b.text || "").join("");
    const m = raw.match(/\{[\s\S]*\}/);
    const r = JSON.parse(m ? m[0] : raw);
    const say = sanitizeSay(String(r.say || "").slice(0, 120));
    if (revealGate && await revealGate) await sleep(SHORT_PACING_MS);
    // 前回と同じ一言は表示しない(固定化の再発防止。沈黙の方が壊れて見えない)
    if (!say || say === state.lastNpcLine) return;
    state.lastNpcLine = say;
    addNpc(say);
  }).catch(() => {}).finally(() => setThinking("npc", false));
}

/* 導入・終端ノードで、照合語に外れた宣言へ依頼人が答える。npcAgentReplyと同じ
   「専用の小さな呼び出し」パターンだが、シーン配列の外なのでシーンロジック(tryScripted・
   意図分類器・調査判定)は一切通さない。通すと隣のシーンの秘密を誤って開示しうる。
   2026-08-03のログT1-T3で「マイラに話しかける」「見取り図をよく見る」が3連続で死んでいた */
function dialogueNodeReply(node, playerText) {
  const npc = node && node.npc;
  if (!npc || !npc.name) return;
  const recent = chron.slice(-10)
    .filter(e => ["player", "gm", "npc"].includes(e.kind))
    .map(e => e.kind === "player" ? `プレイヤー: ${e.text}`
      : e.kind === "gm" ? `GM: ${e.text}`
      : `${npc.name}(あなた): ${e.text}`)
    .join("\n");
  const accept = (node.exits || []).flatMap(e => e.match || []).filter(Boolean).slice(0, 6);
  setThinking("npc", true);
  callGmApi({
    system: `ソロTRPGの登場人物「${npc.name}」として一言だけ返す。${node.direction || ""}\n` +
      `場面: ${node.brief || ""}\n` +
      `日本語の口語。40字以内で言い切る。直前の自分の発言と同じ文・同じ問いを繰り返すな。\n` +
      `【厳守】まだ話は決まっていない。プレイヤーが引き受けた・断ったことにしてはならない。` +
      `新しい人物・場所・入手品・確定事実を作ってはならない。上の場面説明にある範囲だけで答えよ。` +
      (accept.length ? `\nプレイヤーが迷っているなら、${accept.join("・")}のいずれかを口にするよう促してよい。` : "") +
      `\n応答はJSONのみ: {"say":"一言"}`,
    messages: [{ role: "user", content: `直近のやり取り:\n${recent}\n\nプレイヤーの最新の発言・行動:「${playerText}」\n${npc.name}が返す一言だけをJSONで。` }],
    maxTokens: 80
  }).then(data => {
    const raw = ((data && data.content) || []).map(b => b.text || "").join("");
    const m = raw.match(/\{[\s\S]*\}/);
    const say = sanitizeSay(String(JSON.parse(m ? m[0] : raw).say || "").slice(0, 120));
    if (!say || say === state.lastNpcLine) { dialogueNodeFallback(node, accept); return; }
    state.lastNpcLine = say;
    // 話者を必ず渡す。導入ノードはシーン配列の外なので、渡さないとaddNpcが
    // SCENARIO.scenes[sceneIndex].npc を見て何も出さずに終わる(addNpcのコメント参照)
    addNpc(say, npc);
  }).catch(() => dialogueNodeFallback(node, accept))
    .finally(() => setThinking("npc", false));
}
/* 導入・終端ノードでLLMが応答しなかった時の受け皿。ここを黙って落とすと、この手番の出力が
   ゼロになり「考え中」が消えるだけで壊れて見える(修正前の定型文より悪い)。
   無料枠のレート制限(429)は server.cjs が最大65秒待ってリトライするため、実際に起こりうる。
   次の一手が分かる形で返すこと——プレイヤーを手詰まりにしない */
function dialogueNodeFallback(node, accept) {
  const hint = (accept || []).length ? `「${accept[0]}」のように答えてくれ。` : "";
  addGm(node.blockedText || `どう答えるか、はっきりしない。${hint}`, "Neutral");
}

function banterAllowed() { return !SCENARIO.scenes[state.sceneIndex].noBanter; }

function registerBoke(to, bokeLine) {
  if (!banterAllowed()) return;
  BANTER.filter(b => b.to === to).forEach(b => {
    const key = b.from + ">" + b.to;
    state.banterCharge[key] = (state.banterCharge[key] || 0) + 1;
    const need = Math.max(2, b.retortEvery - ((CAST[b.from].retortDrive || 3) - 3));
    if (state.banterCharge[key] >= need) {
      state.banterCharge[key] = 0;
      state.pendingRetort = { from: b.from, to: b.to, bokeLine };
    }
  });
}

function takeBanterCue() {
  const p = state.pendingRetort;
  state.pendingRetort = null;
  if (!p || !banterAllowed()) return "";
  const pair = BANTER.find(b => b.from === p.from && b.to === p.to);
  if (!pair) return "";
  const fromName = CAST[p.from].name, toName = CAST[p.to].name;
  const samples = (pair.tsukkomi || []).slice(0, 2).join(" / ");
  return `\n# 掛け合い許可(この手番のみ・任意)\n先ほど${toName}が軽口をこぼした:「${p.bokeLine || "(先の一言)"}」\nこれに${fromName}が短く反応してよい。${fromName}らしい呆れ・皮肉、あるいは「ふん」と流す黙殺でもよい。40字以内。companion に who:"${p.from}" で入れ、aside:true とせよ。\nトーン見本(そのまま使わず、場に合わせて書き直せ): ${samples}\n※場面が緊迫・厳粛、または今この反応が不自然なら、無理に入れず companion は null でよい。`;
}

/* ウィザードリィ式の敵識別: unknownNameを持つ敵は「不気味な影」等の未識別名で登場し、
   戦闘中に判定(攻撃)して初めて正体(本名+画像)が判明する。identifiedフラグで管理 */
function enemyName(e) { return e.identified ? e.name : (e.unknownName || e.name); }
// 戦闘の行動順(agility降順、同値は定義順)。開始宣言とターン解決の両方で同じ並びを使う
function combatActors(enemy) {
  return [
    { id: "player", name: "あなた", agi: (CAMPAIGN.player && CAMPAIGN.player.agility) || 6 },
    ...Object.entries(CAST).map(([id, c]) => ({ id, name: c.name, agi: c.agility || 5 })),
    { id: "enemy", name: enemyName(enemy), agi: enemy.agility || 5 }
  ].sort((a, b) => b.agi - a.agi);
}
function engageEnemy(def) {
  state.enemy = { ...def, identified: !def.unknownName };
  const order = combatActors(state.enemy).map(a => a.name).join(" → ");
  addGm(`戦闘になった! 相手は「${enemyName(state.enemy)}」。行動順は ${order} だ。`, "Fear");
  addNote(`⚔ 戦闘開始 — 行動順: ${order}`);
  // 戦闘開始の瞬間は全パネルを閉じて画面を戦闘に譲る。ターン終了時(sendActionのfinally)に
  // 下パネルだけ再度開く。engageEnemyの呼び出し元は複数(通常/奇襲/不意打ち)あるため、
  // フラグをここで立てて出口を一箇所(finally)に集約する
  setStore({ leftPanelOpen: false, rightPanelOpen: false, underPanelOpen: false });
  state.justEngaged = true;
}
// エンカウント通知: 遭遇の瞬間をポップアップで見せる。未識別の敵は画像も黒シルエット(ウィザードリィ式)
function pushEncounterPopup() {
  const e = state.enemy;
  pushPopup({
    kind: "encounter",
    title: e.identified ? `${e.name}が現れた!` : "何かが現れた!",
    body: e.surface || e.trait || "",
    img: e.sprite || e.img,
    sprite: !!e.sprite, // 透過スプライトは枠線なしで表示する
    silhouette: !e.identified
  });
}
function identifyEnemy() {
  if (!state.enemy || state.enemy.identified) return "";
  state.enemy.identified = true;
  addNote(`⚔ 正体が判明: ${state.enemy.name}`);
  renderDebug(); // スプライトの実体化(シルエット解除)を、GM応答を待たずすぐ始める
  // エンカウント時と同じくスプライト優先(旧img=プレゼン用画像はスプライトが無い敵のフォールバック)
  const revealImg = state.enemy.sprite || state.enemy.img;
  if (revealImg) pushPopup({ kind: "reveal", title: "正体判明", body: state.enemy.name, img: revealImg, sprite: !!state.enemy.sprite });
  return `\n# 正体判明\n交戦して、相手の正体が「${state.enemy.name}」だと分かった。以後この名で呼んでよい。`;
}

function maybeEngage(r) {
  const sc = SCENARIO.scenes[state.sceneIndex];
  if (!sc.enemy || state.enemy || state.defeated.includes(sc.enemy.name) || (state.fled || []).includes(sc.enemy.name)) return;
  if (r.engage_enemy) {
    engageEnemy(sc.enemy);
    if (!String(r.narration || "").includes(enemyName(state.enemy))) {
      addGm(`${enemyName(state.enemy)}が姿を現した。${state.enemy.surface || state.enemy.trait}`);
    }
    pushEncounterPopup();
  }
}

// 旧risky正規表現の活用形をそのまま列挙する。敵の条件文に含まれる語だけを使う。
const RISKY_WORDS = ["奥", "暗がり", "穴", "殻", "近づ", "進む", "進も", "進み", "踏み込", "入る", "入ろ", "入っ", "抜け", "くぐ", "拾う", "拾お", "拾い", "触る", "触ろ", "触れ", "触っ", "取る", "取ろ", "取っ"];

function enemyRiskyWords(enemy) {
  const trigger = String(enemy?.ambushTrigger || "");
  const matched = RISKY_WORDS.filter(word => trigger.includes(word));
  return matched.length ? matched : RISKY_WORDS;
}

function maybeAmbushCheck(playerText) {
  const sc = SCENARIO.scenes[state.sceneIndex];
  const enemy = sc.enemy;
  if (!enemy || !enemy.ambush || state.enemy || state.defeated.includes(enemy.name) || (state.fled || []).includes(enemy.name)) return null;
  if ((state.ambushResolved || []).includes(enemy.name)) return null;
  const risky = enemyRiskyWords(enemy).some(word => playerText.includes(word));
  const cautious = /(慎重|気配|警戒|聞く|見る|観察|調べ|ランタン|照ら|確認)/.test(playerText);
  if (!risky || cautious) return null;
  // 未識別の敵は判定名でも本名を出さない
  return { reason: `${enemy.unknownName || enemy.name}の気配に先に気づけるか`, difficulty: enemy.ambushDc || 12, enemy };
}

async function resolveAmbushIfNeeded(playerText) {
  const ambush = maybeAmbushCheck(playerText);
  if (!ambush) return false;
  const roll = await requestPlayerRoll(ambush.reason, ambush.difficulty, "あなた");
  const crit = roll === 20, fumble = roll === 1;
  const ok = crit || (!fumble && roll >= ambush.difficulty);
  await addDice(roll, ambush.difficulty, ok, crit, fumble, ambush.reason);
  state.ambushResolved = state.ambushResolved || [];
  state.ambushResolved.push(ambush.enemy.name);

  if (ok) {
    // 察知成功=完全スルーだと敵との遭遇ごと消える(2026-07-17(10) T17)。
    // 敵を「発見済み・未交戦」にして足を止め、次の宣言で 戦う/追い払う/やり過ごす を選ばせる
    const dispName = ambush.enemy.unknownName || ambush.enemy.name;
    state.spotted = ambush.enemy.name;
    addNote(`👁 奇襲察知:${dispName}の気配を先に捉えた`);
    addGm(`待て——${dispName}が潜んでいる。向こうはまだこちらに気づいていない。仕掛けるか、やり過ごすか、君が決めろ。`, "Fear");
    return true;
  }

  engageEnemy(ambush.enemy);
  const dispName = enemyName(state.enemy);
  addGm(`${dispName}が暗がりから飛び出した。${state.enemy.surface || state.enemy.trait}`);
  addNote(`⚔ 奇襲:${dispName}に先手を取られた`);
  pushEncounterPopup();

  const attackRoll = rollD20();
  const hit = attackRoll >= 10;
  addNote(`⚔ ${dispName}の先制攻撃: d20=${attackRoll} → ${hit ? "命中" : "外れ/かすめる"}`);
  if (hit) {
    addGm(`${dispName}の牙が当たった。熱くて痛い。`); // 語りを先に、ダメージ通知(吹き出し)を後に
    applyUpdatesLogged({ hp_delta: -1 }, { allowPlayerDamage: true }, `${dispName}の先制攻撃が命中(d20=${attackRoll})`);
  } else {
    addGm(`${dispName}の牙は外れた。岩の壁に、爪の音だけが響いた。`);
  }
  return true;
}

// TASの「エンカウンター設定」(2026-07-23実装)の受け皿。scenes[].encountersがあれば
// こちらを使い(旧enemy.ambushの正規表現ヒューリスティックは使わない)、無ければ従来通り
// resolveAmbushIfNeededにフォールバックする(既存データへの後方互換)。
// timingフィールド(scene_enter/turn_start/movement/player_action/after_check)は、
// このゲームがターン/移動フェーズを独立に持たないため、現状は区別せず毎回の宣言時に評価する。
async function resolveEncounterIfNeeded(playerText, sc) {
  for (const enc of sc.encounters) {
    /* 敵の能力は encounters[].enemy に直接書かれていればそれを使い、無ければ scenes[].enemy を使う。
       1つのシーンに複数の敵を出す分岐（シーン2の柵=錆喰い／崩落=坑道蝙蝠）に必要。
       scenes[].enemy は1体しか置けないため、それだけでは片方の遭遇が発生しなかった */
    const foe = resolveEncounterFoe(enc, sc);
    if (!foe) continue; // 敵の能力がどこにも無い、または名前が食い違って解決できない遭遇
    if (state.defeated.includes(foe.name) || (state.fled || []).includes(foe.name)) continue;
    if ((enc.blockedBy || []).some(n => state.defeated.includes(n) || (state.fled || []).includes(n))) continue;
    const count = (state.encounterCounts || {})[enc.id] || 0;
    if (enc.maxOccurrences != null && count >= enc.maxOccurrences) continue;
    if (!encounterRequiredElementsMet(enc, sc, { revealed, inventory: state.inventory })) continue;
    if ((enc.triggerTerms || []).length && !enc.triggerTerms.some(t => playerText.includes(t))) continue;
    if (enc.type === "random" && !(Math.random() * 100 < (enc.probability ?? 100))) continue;

    state.encounterCounts = state.encounterCounts || {};
    state.encounterCounts[enc.id] = count + 1;
    engageEnemy(foe);
    addGm(`${enemyName(state.enemy)}が現れた。${enc.onsetText || state.enemy.surface || state.enemy.trait || ""}`, "Fear");
    addNote(`⚔ エンカウンター発生:${enc.id}`);
    pushEncounterPopup();
    return true;
  }
  return false;
}

/* ---------------- 戦闘v1: ターン制・決定論(BORG/TRPG/MockDocs/COMBAT_SPEC.md) ----------------
   進行・ダメージ・弱点・逃走は全てシステムが確定し、LLMは確定結果の描写のみ。
   LLMが落ちても定型文で完走する。戦闘行動以外(調べる・話す)は従来のLLMルートに落ちる */
const COMBAT_DEFEND_RE = /防御|身を守|守りを固|盾|構え/;
const COMBAT_FLEE_RE = /逃げ|逃走|退却|撤退|離脱/;

function classifyCombatAction(text) {
  if (mentionsHealPotionUse(text)) return "heal"; // 在庫切れもここで受ける(判定行動に落とさない)
  const w = state.enemy.weakness;
  if (w && (w.triggers || []).some(t => text.includes(t))) return "weakness";
  if (COMBAT_FLEE_RE.test(text)) return "flee";
  if (COMBAT_DEFEND_RE.test(text)) return "defend";
  if (SCRIPTED_ATTACK_RE.test(text)) return "attack";
  // 戦闘中はLLMの自由裁量ルートを開かない。定型以外は「工夫」として判定つきで試せる
  // (調査で真相を開く道は判定成功時に残る。宣言はターンを消費し、敵は行動する)
  return "improvise";
}

async function tryCombatTurn(text) {
  const action = classifyCombatAction(text);
  if (!action) return false;
  const enemy = state.enemy;
  const facts = []; // 確定した出来事(この順で描写させる)。主画面チャットにも逐次表示する
  const fact = t => { facts.push(t); addNote(`⚔ ${t}`); };
  let defending = 0; // 防御参加人数ぶん被ダメージを減らす
  let enemyStunned = false;

  const actors = combatActors(enemy);

  const attackOnce = async (who, auto) => {
    const dc = enemy.defenseDc || 12;
    const reason = `${who === "あなた" ? "" : who + ": "}${enemyName(enemy)}への攻撃`;
    const roll = auto ? rollD20() : await requestPlayerRoll(reason, dc, who);
    const crit = roll === 20, fumble = roll === 1;
    const ok = crit || (!fumble && roll >= dc);
    await addDice(roll, dc, ok, crit, fumble, reason);
    identifyEnemy(); // 攻撃した時点で正体判明(ウィザードリィ式)
    if (ok) {
      const dmg = crit ? 2 : 1;
      enemy.hp = Math.max(0, enemy.hp - dmg);
      fact(`${who}の攻撃が${crit ? "深々と" : ""}命中! ${enemyName(enemy)}に${dmg}ダメージ(敵HP ${enemy.hp}/${enemy.maxHp})`);
    } else {
      fact(`${who}の攻撃は${fumble ? "大きく外れ、体勢を崩した" : "外れた"}`);
    }
    return { ok, fumble };
  };

  for (const a of actors) {
    if (!state.enemy || state.enemy.hp <= 0) break; // 撃破・離脱済みなら残りの行動は流す
    addNote(`⚔ ── ${a.name}のターン ──`);

    if (a.id === "player") {
      if (action === "attack") {
        const res = await attackOnce("あなた", false);
        if (res.fumble) { // ファンブル: 敵の追撃1回(手痛い代償を決定論で)
          const r2 = rollD20();
          addNote(`⚔ ${enemyName(enemy)}の追撃: d20=${r2} → ${r2 >= 10 ? "命中" : "外れ"}`);
          if (r2 >= 10) applyUpdatesLogged({ hp_delta: -(enemy.atk || 1) }, { allowPlayerDamage: true }, `ファンブルの隙への追撃(d20=${r2})`);
        }
      } else if (action === "defend") {
        defending++;
        fact("あなたは身を固めて防御した");
      } else if (action === "flee") {
        const dc = enemy.fleeDc || 10;
        const roll = await requestPlayerRoll("戦闘からの離脱", dc, "あなた");
        const ok = roll === 20 || (roll !== 1 && roll >= dc);
        await addDice(roll, dc, ok, roll === 20, roll === 1, "戦闘からの離脱");
        if (ok) {
          fact(`一行は${enemyName(enemy)}から離脱した`);
          logSceneEvent(`${enemyName(enemy)}から逃げ切った`);
          (state.fled ||= []).push(enemy.name);
          state.enemy = null;
          companionBattleEndLine("fled");
        } else {
          fact("逃げ場を探したが、退路を塞がれた");
        }
      } else if (action === "heal") {
        if (!state.healPotions) {
          fact(`${HEAL_POTION_NAME}は残っていない`);
        } else {
          const result = useHealPotion();
          fact(result
            ? `${HEAL_POTION_NAME}を使った(HP ${result.before}→${result.after})`
            : `${HEAL_POTION_NAME}を持っているが、今は万全だ`);
        }
      } else if (action === "weakness") {
        const w = enemy.weakness;
        fact(w.text || `${enemyName(enemy)}は怯んだ`);
        if (w.effect === "flee") {
          logSceneEvent(`${enemy.name}を弱点で退けた`);
          (state.fled ||= []).push(enemy.name);
          state.enemy = null;
          companionBattleEndLine("repelled");
        } else { // stun
          enemyStunned = true;
          addNote(`⚔ ${enemyName(enemy)}は怯んで動けない`);
        }
      } else { // improvise: 定型以外の工夫。判定つきで試し、調査系はsecret開示にもつながる
        const reason = text.length > 24 ? text.slice(0, 24) + "…" : text;
        const roll = await requestPlayerRoll(reason, 12, "あなた");
        const crit = roll === 20, fumble = roll === 1;
        const ok = crit || (!fumble && roll >= 12);
        await addDice(roll, 12, ok, crit, fumble, reason);
        const matched = resolveSecretTarget(SCENARIO.scenes[state.sceneIndex], null, text, text, { revealed, inventory: state.inventory });
        if (matched) markExamined(matched.entity);
        const secret = ok ? matched : null;
        if (secret) {
          unlockSecret(secret);
          fact(`その最中に気づいたことがある——${secret.playerText || secret.text}`);
        } else {
          fact(ok ? `あなたは「${reason}」を試み、少しだけ状況が良くなった気がする`
                  : `あなたは「${reason}」を試みたが、うまくいかなかった`);
        }
      }
    } else if (a.id === "enemy") {
      if (enemyStunned) continue;
      const roll = rollD20();
      const hit = roll >= 10;
      addNote(`⚔ ${enemyName(enemy)}の行動: d20=${roll} → ${hit ? "攻撃が届く" : "外れ/牽制"}`);
      if (hit) {
        const dmg = Math.max(0, (enemy.atk || 1) - defending);
        if (dmg > 0) {
          applyUpdatesLogged({ hp_delta: -dmg }, { allowPlayerDamage: true }, `${enemyName(enemy)}の攻撃が命中(d20=${roll})`);
          fact(`${enemyName(enemy)}の攻撃が届いた`);
        } else {
          fact(`${enemyName(enemy)}の攻撃は防御に受け止められた`);
        }
      } else {
        fact(`${enemyName(enemy)}の攻撃は外れた`);
      }
    } else { // 同行者: 自動行動(攻撃60% / 防御20% / 一言20%)。ダイスは自動で振る
      const r = Math.random();
      if (r < 0.6) {
        await attackOnce(a.name, true);
      } else if (r < 0.8) {
        defending++;
        fact(`${a.name}は防御に回った`);
      } else {
        // 一言(20%): 探索用の癖セリフ(quirks)は戦闘の文脈を無視して唐突になる
        // (「先に罠を見せて」問題。クロニクル2026-07-18(2) T18/T20)。戦闘中は
        // (1)正体判明済みで弱点ヒントが未提示なら、実在する弱点のヒント(プレイヤーが
        //    実際に宣言すれば weakness アクションとして機能する)
        // (2)戦闘用の一言(battleMutters)
        // (3)どちらも無ければ黙って攻撃 にフォールバックする
        const w = state.enemy.weakness;
        if (state.enemy.identified && w && w.hint && !state.enemy.hintGiven) {
          state.enemy.hintGiven = true;
          addCompanion(w.hint, a.id);
        } else {
          const allLines = CAST[a.id].battleMutters || [];
          // 直前と同じ一言が連投されるのを防ぐ(2026-07-20チロニクルでリディアが3ターン連続同一発言)
          const lines = allLines.length > 1
            ? allLines.filter(l => l !== state.lastBattleMutter?.[a.id])
            : allLines;
          if (lines.length) {
            const line = lines[Math.floor(Math.random() * lines.length)];
            state.lastBattleMutter = { ...(state.lastBattleMutter || {}), [a.id]: line };
            addCompanion(line, a.id);
          } else await attackOnce(a.name, true);
        }
      }
    }
  }

  const downedName = state.enemy ? state.enemy.name : null;
  const downed = checkEnemyDown(); // 撃破処理(正体判明・revealOnDefeat開示)は従来関数に集約
  if (downed) {
    addGm(`とどめだ! ${downedName}は動かなくなった。`, "Happy");
    companionBattleEndLine("win");
  }
  // 戦闘中はLLMを一切呼ばない(ウォーム6秒でもテンポを壊す。2026-07-17(4)で確認)。
  // 進行はターンごとの⚔行+ダメージ通知で全て見えているので、追加の語りは不要
  renderDebug();
  return true;
}

// 戦闘終了時にガレスかリディアが一言(campaign.jsonのcompanions[].battleEndから。データ駆動)
/* シーン到着時、同行者の1人が短い一言を返す(companionBattleEndLineと同じ「候補から
   ランダムに1人」設計)。GMの到着セリフと違い、シナリオ内容に紐づく必要は無い——
   誰にでも当てはまる中立の一言で十分(2026-08-04、ユーザー案「さて、どうする?」等)。
   quirks/battleMutters/battleEndと同じ理由でLLMを介さない固定文にする */
const SCENE_ARRIVAL_LINES = ["何か気になることは?", "まず何からいく?", "気をつけていこう。"];

/* GM自身の到着セリフのバリエーション(2026-08-04)。話数とシーン名は章の進行状況を
   伝える情報なので必ず含めるが、それ以外の言い回しは複数用意してランダムに選ぶ。
   同行者のSCENE_ARRIVAL_LINESと違い、n/nameを埋め込む関数の配列にする(文構造ごと
   変えられるようにするため。「話数+シーン名」を先頭に固定した接尾辞だけの変化に
   限定しない) */
const GM_SCENE_ARRIVAL_LINES = [
  (n, name) => `第${n}話「${name}」だ。さて、どうする?`,
  (n, name) => `第${n}話「${name}」だ。何から確かめる?`,
  (n, name) => `あなたたちは、第${n}話「${name}」に到着した。`,
  (n, name) => `第${n}話「${name}」だ。気を引き締めていこう。`
];
function gmSceneArrivalLine(sceneNo, name) {
  return GM_SCENE_ARRIVAL_LINES[Math.floor(Math.random() * GM_SCENE_ARRIVAL_LINES.length)](sceneNo, name);
}
// runSpeechSequenceのstepに使うため、話す内容を先に決めて返すだけにする(speak()の実行はしない)
function pickCompanionSceneArrivalLine() {
  const ids = Object.keys(CAST);
  if (!ids.length) return null;
  const who = ids[Math.floor(Math.random() * ids.length)];
  const text = SCENE_ARRIVAL_LINES[Math.floor(Math.random() * SCENE_ARRIVAL_LINES.length)];
  return { who, text };
}

function companionBattleEndLine(outcome) {
  const candidates = Object.entries(CAST)
    .map(([id, c]) => ({ id, lines: (c.battleEnd || {})[outcome] || [] }))
    .filter(c => c.lines.length);
  if (!candidates.length) return;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  addCompanion(pick.lines[Math.floor(Math.random() * pick.lines.length)], pick.id);
}

/* ---------------- scriptedモード(D-035候補: LLMを使わない決定論GMの検証) ----------------
   Intent Parser(辞書) → Game Engine(既存のシステム権威) → 焼き付きテキスト、の三層。
   LLMから「決定権」を奪い、テキストも定型で返す。チップ入力(名詞×動詞)は必ず辞書にヒットする。
   gmMode:
     "hybrid"  … 移動・調査(secretのある対象)はscriptedで確定処理、会話・自由文はLLMへ(既定)
     "scripted"… すべてscripted。未対応の入力は定型文(LLM呼び出し完全ゼロ)
     "llm"     … 従来どおり全部LLM */
const GM_MODE_KEY = "terminus_gm_mode_v1";
let gmMode = "hybrid";
try { gmMode = localStorage.getItem(GM_MODE_KEY) || "hybrid"; } catch (e) { /* no-op */ }
export function toggleGmMode() {
  const order = ["hybrid", "scripted", "llm"];
  gmMode = order[(order.indexOf(gmMode) + 1) % order.length];
  try { localStorage.setItem(GM_MODE_KEY, gmMode); } catch (e) { /* no-op */ }
  setStore({ gmMode });
}

const MOVE_RE = /進む|進も|向かう|向かお|入る|入ろ|行く|行こ|降り|登る|渡る/;
const BACK_RE = /戻る|戻ろ|引き返|退く/;
const TALK_RE = /話|聞く|聞いて|尋ね|訊|呼びかけ|声をかけ/;
const TAKE_RE = /拾|取る|取っ|手に入れ|回収|持ち帰|持って(いく|行く)/;
const SCRIPTED_ATTACK_RE = /攻撃|斬|切りかか|殴|撃つ|叩く|突く|蹴/;

/* 回復薬: 汎用のuse/give intent(未実装)を待たず、この品名にだけ効く決定論アクション。
   「使う/飲む」+品名の一致だけで判定する。戦闘中はclassifyCombatActionが同じ判定を使い、
   1ターン消費する行動として扱う(他の戦闘行動と同じ枠に入るだけで、専用の待機は無い) */
const HEAL_POTION_NAME = "回復薬";
const HEAL_AMOUNT = 2; // 1回の使用でのHP回復量。既存のhp_delta上限(-3〜+2)に合わせた固定値
const DEFAULT_ITEM_ON_DEFEAT_COUNT = 1;
const USE_HEAL_RE = /使う|使っ|飲む|飲ん|服用/;
// 「回復薬を飲む」という宣言かどうか(在庫は見ない)。在庫が無い時にここで拾わずLLMへ
// 流すと、持っていない品でLLMが勝手に回復させてしまう(2026-08-07のプレイで発生)
function mentionsHealPotionUse(text) {
  return USE_HEAL_RE.test(text) && text.includes(HEAL_POTION_NAME);
}
function canUseHealPotion(text) {
  return state.healPotions > 0 && mentionsHealPotionUse(text);
}
// 呼び出し前にcanUseHealPotion()を確認していること。満タンなら消費せずnullを返す
function useHealPotion() {
  if (state.hp >= state.maxHp) return null;
  state.healPotions--;
  const before = state.hp;
  applyUpdatesLogged({ hp_delta: HEAL_AMOUNT });
  return { before, after: state.hp };
}

// 主語(誰が)の確定情報抽出(2026-07-21: 動詞+オブジェクトの分類改善、BORG/TRPG/MockDocs/RULE_INVENTORY.md 意図分類表)。
// 立ち絵タップは必ず「名前、」を宣言の先頭に挿入するため、この確実な信号をLLMに推測させず直接読む。
// 残り文字列(rest)を動詞・目的語の判定に使う(分類器に渡すプロンプトも短くなる)
function extractActor(text) {
  for (const [id, c] of Object.entries(CAST)) {
    if (text.startsWith(c.name + "、")) {
      return { actorId: id, actorName: c.name, rest: text.slice(c.name.length + 1).trim() };
    }
  }
  return { actorId: "player", actorName: "あなた", rest: text };
}

// 調査のscripted処理: 判定→成功で開示(既存の開示機構=ポップアップ・背景切替・チップがそのまま動く)
// 初めて判定を振った調査対象をチップ化する(失敗しても対象名は「知った」扱い。再挑戦を2タップに)
function markExamined(entity) {
  if (!entity) return;
  if (!(state.examined ||= []).includes(entity)) { state.examined.push(entity); }
}

/* 調べたが分からなかった時の一文。作者がcampaign.style.emptyHandedへ複数書けば順に回す。
   実プレイログ(2026-08-03)で同じ固定文が7回続いたため、作者が世界観に合う手ざわりを
   与えられるようにした。ここをLLMに任せない理由は :480 のコメントにある通り
   (過去にLLMが同文を10連続生成した事故があり、意図的に決定論にしてある)。
   乱数ではなくターン数で回す——同じ状態から同じ結果が出る性質を保つため */
function emptyHandedNote() {
  const notes = (CAMPAIGN.style.emptyHanded || []).filter(Boolean);
  if (!notes.length) return "それ以上のことは、まだ分からない。";
  return notes[state.turn % notes.length];
}

/* 調査の難易度。失敗を重ねるほど下がる。
   進行に必須な秘密がダイス運のゲートの奥にあると、同じ宣言を成功するまで連打するだけの
   体験になる(設計メモ3節が「初期モックの失敗」として名指しした構造)。失敗を無駄にせず、
   粘った分だけ確実に近づける形にする。実測(2026-08-04の実プレイ4周)では開示に最大3回
   かかり、1周は3連続失敗で1シーンも進めなかった。
   ponytail: 下限DC2は残す。自然な1のファンブルだけが失敗する状態で止め、完全な自動成功に
   はしない(振る意味を残すため)。「必ず開く」を保証したくなったら下限を1にすればよい */
async function scriptedExamine(secret, actorName = "あなた") {
  markExamined(secret.entity);
  state.examineFails = state.examineFails || {};
  const failures = state.examineFails[secret.id] || 0;
  const diff = examineDifficulty(secret, failures);
  const reason = (actorName === "あなた" ? "" : `${actorName}: `) + `${secret.entity}を調べる`;
  const roll = await requestPlayerRoll(reason, diff, actorName);
  const crit = roll === 20, fumble = roll === 1;
  const ok = crit || (!fumble && roll >= diff);
  await addDice(roll, diff, ok, crit, fumble, reason);
  if (ok) {
    delete state.examineFails[secret.id];
    unlockSecret(secret);
    addGm(secret.playerText || secret.text, "Happy");
    state.noProgressTurns = 0;
    revealFlavor(secret); // 開示の余韻(同行者の一言)を非同期で追加。失敗しても進行に影響なし
  } else {
    state.examineFails[secret.id] = failures + 1;
    const surfaceText = secret.surface ? secret.surface.replace(/。+$/, "") + "。" : "";
    /* 失敗が「何も起きなかった」で終わると、繰り返しに意味が無くなる。
       次はやりやすくなったことを必ず伝える(難易度が下がったという事実の言語化) */
    const next = examineDifficulty(secret, failures + 1);
    const closingIn = next < diff ? "だが、さきほどより見当がついてきた。もう一度確かめれば掴めそうだ。" : "";
    addGm(`${surfaceText}${emptyHandedNote()}${closingIn}`, "Neutral");
    addNote(`🔎 ${secret.entity}: ${failures + 1}回目の失敗 — 次回の難易度 ${diff} → ${next}`);
  }
}

// 開示直後に同行者が短く反応する(彩り)。callGmApiを直接使い、会話履歴を汚さない・待たない。
// 数秒遅れて一言が届く形になるが、テンポは止めない(2026-07-17(8): 決定論化で語りが定型文だけになった対策)
function revealFlavor(secret) {
  // scriptedモードは「LLM呼び出し完全ゼロ」が契約(:1295の説明)。彩りのためにそれを破らない
  if (gmMode === "scripted") return;
  const names = Object.entries(CAST)
    .map(([id, c]) => `${id}=${c.name}(${c.persona}${voiceRule(c)})`).join(" / ");
  const whoIds = Object.keys(CAST).join(" または ");
  callGmApi({
    system: `ソロTRPGの同行者として一言だけ反応する。日本語のである調・口語。40字以内。応答はJSONのみ: {"who":"${whoIds}","say":"一言"}\n同行者: ${names}\n注意: この真相は今の調査で初めて分かったことである。以前から知っていたかのような発言、この件についての自分の過去・因縁・関わりを捏造してはならない(例:「俺が守ってたやつだ」等は不可)。初めて知った驚き・所感・示唆に留めよ。`,
    messages: [{ role: "user", content: `たった今、調査でこの真相が分かった:「${secret.playerText || secret.text}」。場に合う方の同行者の、短い反応の一言だけを返せ。` }],
    maxTokens: 80
  }).then(data => {
    const raw = ((data && data.content) || []).map(b => b.text || "").join("");
    const m = raw.match(/\{[\s\S]*\}/);
    const r = JSON.parse(m ? m[0] : raw);
    // 話者が同行者に解決できなければ捨てる(リディアへの機械的フォールバックは誤帰属のもと)
    const flavorWho = normalizeWho(r.who, null);
    if (r.say && flavorWho) addCompanion(String(r.say).slice(0, 80), flavorWho);
  }).catch(() => {});
}

/* requiresを満たし、かつ行き先を持つ出口。「照合語に外れたが本当は通れる」場面を見分けるために使う。
   2026-08-03のログで、必要な秘密2つを開示済みなのに「奥へ進む」が照合語(右/さく/木柵…)に
   一致せず9ターン進行不能になった。移動の意図は既に確定しているので、行き場が1つなら通す */
function viableExits(node) {
  return (node.exits || []).filter(e => requiresMet(e.requires, { revealed, inventory: state.inventory }) && e.to !== null && e.to !== undefined);
}
// 通れる出口の呼び方(作者が書いたmatchの先頭語)。聞き返しの候補に使う。そのまま打てば必ず通る
function exitChoiceLabels(node) {
  return viableExits(node).map(e => (e.match || [])[0]).filter(Boolean);
}
/* 「先へ進めない」時の文言。通れる出口があるのに blockedText を出すと嘘になる
   (ログT28: LLMが「道が開いている」と言った直後に「ふさいでいる」と否定していた)。
   出口が複数あって決まらない場合は、作者の語で聞き返す */
function moveBlockedNote(node) {
  const labels = exitChoiceLabels(node);
  if (!labels.length) return node.blockedText || "これより先へは、まだ進めない。何かを見落としている気がする。";
  return labels.length > 1
    ? `どちらへ向かう? ${labels.join(" か ")} だ。`
    : `どちらへ向かうか、宣言してくれ。${labels[0]}へ行けそうだ。`;
}
export function resolveExitTargetIndex(to) {
  return exitTargetIndexIn(SCENARIO.scenes, to);
}

function scriptedMoveForward(text) {
  const sc = SCENARIO.scenes[state.sceneIndex];
  if (state.enemy) { addGm(`${enemyName(state.enemy)}が行く手をふさいでいる。`, "Fear"); return; }
  if (Array.isArray(sc.exits) && sc.exits.length) {
    let exit = resolveExit(sc, text || "");
    /* 照合語に外れた時。requiresを満たす出口が1つだけなら、言い方が作者の想定と違っても通す。
       複数あるなら聞き返す。1つも無いなら本当にふさがっているので blockedText でよい。
       requiresの門番は緩めない——未解決の手がかりを残して進むと開示不能な秘密が出る(2026-07-12) */
    if (!exit) {
      const viable = viableExits(sc);
      if (viable.length !== 1) { addGm(moveBlockedNote(sc), "Neutral"); return; }
      exit = normalizeExit(viable[0]);
    }
    if (!requiresMet(exit.requires, { revealed, inventory: state.inventory })) {
      addGm(exit.blockedText || sc.blockedText || "まだ進めない。", "Neutral");
      return;
    }
    if (exit.to === null || exit.to === undefined) {
      addGm(exit.arrivalText || exit.blockedText || "この先には進めない。", "Neutral");
      return;
    }
    if (exit.to === "end" || exit.to === "ending") {
      if (exit.arrivalText) addGm(exit.arrivalText, "Neutral");
      advanceScene(SCENARIO.scenes.length); // 範囲外indexでadvanceSceneの終幕分岐に入る
      return;
    }
    const targetIdx = resolveExitTargetIndex(exit.to);
    if (targetIdx === -1) {
      addGm("行き先が見つからない(データ不整合)。", "Neutral");
      return;
    }
    if (exit.arrivalText) addGm(exit.arrivalText, "Neutral");
    advanceScene(targetIdx);
    return;
  }
  // exits未定義のシーン(後方互換): 従来通り配列の次の要素へ
  if (!sceneCompleteAllowed(sc)) {
    addGm(sc.blockedText || "これより先へは、まだ進めない。何かを見落としている気がする。", "Neutral");
    return;
  }
  advanceScene();
}

// scripted解決を試す。trueを返したらこの手番はLLMを呼ばない
async function tryScripted(text) {
  if (gmMode === "llm") return false;
  const sc = SCENARIO.scenes[state.sceneIndex];
  if (sc.report) {
    // 報告シーンは会話が本体。hybridではLLMに任せ、scriptedでは定型で章を締める
    if (gmMode !== "scripted") return false;
    addGm(`${(sc.npc && sc.npc.name) || "依頼人"}に見聞きしたことを伝えた。報告はすんだ。`, "Neutral");
    advanceScene();
    return true;
  }
  if (SCRIPTED_ATTACK_RE.test(text)) {
    if (gmMode !== "scripted") return false; // 戦闘のscripted化は未実装(次の検証範囲)
    addGm(state.enemy ? "(scripted戦闘は未実装だ。GMモードを切り替えて戦ってくれ)" : "敵はいない。", "Neutral");
    return true;
  }
  // EXAMINE_REは汎用動詞の辞書なので、作者がsecret.triggerへ書いた「触れてみる」
  // 「意識を集中させる」のような言い回しを拾えない。triggerが一致した時も調査として扱う
  const ctx = { revealed, inventory: state.inventory };
  const triggerHit = matchSecretByTrigger(sc, text, ctx);
  if (EXAMINE_RE.test(text) || triggerHit) {
    const { actorName, rest } = extractActor(text);
    // 対象の決定はpickExamineSecretに集約する(優先順位の根拠はあちらのコメント)
    const { secret } = pickExamineSecret(sc, text, rest, ctx);
    if (secret) { await scriptedExamine(secret, actorName); return true; }
    const known = matchSecretByText(sc, rest, true, undefined, ctx);
    if (known) { addGm("改めて確かめる。" + (known.playerText || known.text), "Neutral"); return true; }
    if (gmMode === "scripted") { addGm("特に変わったものは見つからない。", "Neutral"); return true; }
    return false; // hybrid: secretのない対象の描写はLLMの領分
  }
  if (mentionsHealPotionUse(text)) {
    if (!state.healPotions) {
      addGm(`${HEAL_POTION_NAME}はもう残っていない。`, "Neutral");
      return true;
    }
    const result = useHealPotion();
    if (result) {
      logSceneEvent(`${HEAL_POTION_NAME}を使った`);
      addGm(`${HEAL_POTION_NAME}を飲んだ。HPが${result.after}/${state.maxHp}まで戻った。`, "Happy");
    } else {
      addGm("今は万全だ。使う必要はない。", "Neutral");
    }
    return true;
  }
  /* 品物の取得。scriptedモードは「LLM呼び出し完全ゼロで遊べる」ことが売りだが、
     取得のレーンが無いため、品物を要求する出口がある章はここで詰んでいた(アウトロの
     「心石の欠片を渡す」が典型)。判定は要らない——availableLootが開示状況で既に
     門番しているので、名前が文中にあれば渡してよい。曖昧な言い回しはhybridでは
     従来どおりLLM分類器へ流す(対象の幻覚ガードがあちらにある) */
  if (TAKE_RE.test(text)) {
    const item = availableLoot(sc).find(n => text.includes(n));
    if (item) {
      if (inv.give(state.inventory, item)) {
        logSceneEvent(`「${item}」を手に入れた`);
        addGm(`${item}を手に入れた。`, "Happy");
      } else {
        addGm(`${item}はもう持っている。`, "Neutral");
      }
      return true;
    }
    if (gmMode === "scripted") { addGm("持ち出せるものは見当たらない。", "Neutral"); return true; }
    return false;
  }
  if (BACK_RE.test(text) && !MOVE_RE.test(text)) {
    // 行き止まりの部屋のように、作者が「戻る」出口を用意している場合はそちらを使う。
    // 出口が無い時だけ、寄り道を止める従来の定型文にする(出口を見ずに一律拒否すると
    // 引き返すしかない部屋から永久に出られない)
    if (Array.isArray(sc.exits) && resolveExit(sc, text)) { scriptedMoveForward(text); return true; }
    addGm("今は戻らない。依頼がまだ残っている。", "Neutral");
    return true;
  }
  if (MOVE_RE.test(text)) { scriptedMoveForward(text); return true; }
  const who = Object.keys(CAST).find(id => text.includes(CAST[id].name));
  if (who && TALK_RE.test(text)) {
    if (gmMode !== "scripted") return false; // 自由会話はこの製品の柱なのでhybridではLLMへ
    const qs = CAST[who].quirks || [];
    addCompanion(qs.length ? qs[state.turn % qs.length].mutter : "……", who);
    return true;
  }
  if (gmMode === "scripted") {
    addGm("うまく伝わらなかったようだ。チップを使うか、別の言い方を試してくれ。", "Neutral");
    return true;
  }
  return false;
}

/* ---------------- 意図分類器(段階2: BORG/TRPG/MockDocs/RULE_INVENTORY.md) ----------------
   辞書(tryScripted)に漏れた宣言の意図と対象をLLMに「穴埋め」で読み取らせる。
   LLMは分類するだけで、結果の解決(判定・開示・遷移・取得)は常にシステム側。
   分類を誤っても最悪「別のレーンで穏当に処理される」だけで、状態は壊れない */
function confirmedTalkIntent(text) {
  const { actorId, rest } = extractActor(text);
  const restVerb = canonVerb(rest.replace(/[。!?！？\s]+$/g, ""));
  if (actorId !== "player" && restVerb === "話しかける") {
    addNote("🧭 分類: talk(確定)");
    return { intent: "talk", target: null, named: null, actorId, actorName: CAST[actorId].name,
      extraSystem: "\n# 確定した会話宣言\n場面に変化はない。narration は場の空気を保つ一文だけにせよ。世界の現象を新たに描写するな。" };
  }
  return null;
}

async function classifyIntent(text) {
  // 主語がチップ(立ち絵タップ)由来で確定している場合、LLMに推測させず、残り文字列(rest)だけを
  // 分類に使う(プロンプトが短くなり、主語の混入で目的語判定がぶれるのも防ぐ)
  const { actorId, rest } = extractActor(text);
  const chipActor = actorId !== "player";
  const sc = SCENARIO.scenes[state.sceneIndex];
  const targetAlias = new Map();
  const addTarget = (label, canonical) => {
    if (label && !targetAlias.has(label)) targetAlias.set(label, canonical);
  };
  sc.secrets.forEach(s => {
    addTarget(s.entity, s.entity);
    (s.aliases || []).forEach(alias => addTarget(alias, s.entity));
  });
  availableLoot(sc).forEach(name => addTarget(name, name));
  Object.values(CAST).forEach(c => addTarget(c.name, c.name));
  if (state.enemy) addTarget(enemyName(state.enemy), enemyName(state.enemy));
  if (sc.report && sc.npc) addTarget(sc.npc.name, sc.npc.name);
  const allTargets = [...targetAlias.keys()];
  const targets = allTargets.slice(0, 40);
  if (allTargets.length > targets.length) addNote(`🧭 対象候補を${targets.length}件に制限(${allTargets.length - targets.length}件を省略)`);
  const recentTargets = (state.sceneLog || []).filter(entry => entry.turn === state.turn - 1).flatMap(entry => {
    const scene = SCENARIO.scenes[entry.scene];
    return scene ? scene.secrets.filter(s => revealed.has(s.id) && entry.text.includes(s.entity)).map(s => s.entity) : [];
  }).slice(-2);
  const system = `プレイヤーの宣言を分類する。応答は次のJSONのみ(前置き禁止):
{"intent":"investigate|move|back|talk|talk_gm|take|other","target":"候補から最も近いもの、なければnull","named":"宣言が指している具体物の名前。候補になくてもそのまま書く。漠然とした宣言ならnull"${chipActor ? "" : `,"actor":"player|${Object.keys(CAST).join("|")}"`}}
対象の候補: ${targets.join("、") || "(なし)"}
${recentTargets.length ? `直前に話題になった対象: ${recentTargets.join("、")}\n「それ」「あれ」「さっきの」はこの中から選ぶ。` : ""}
基準:
- investigate: 何かを調べる・見る・聞く・嗅ぐ・観察する
- move: 先へ・奥へ進む(場所を移る)
- back: 来た道を戻る
- talk: 登場人物への発言・質問・報告(「坑道は崩れそうだ」のような平叙文の報告も含む)
- talk_gm: GM(${GM.name})やゲームの仕組みそのものへの質問・要望
- take: その場にある物を拾う・手に取る(既に持っている道具を使う・操作するのはother)
- other: どれにも当てはまらない
targetの規則(厳守):
- 宣言の中で明示・言い換えされている対象だけを選ぶ。宣言に出てこない対象を推測で補うな。
- 「周りを見る」「天井を見る」のような漠然とした宣言や、候補に無い物への行動は target=null。${chipActor ? "" : `\nactorは「リディアに調べてもらう」等の委任があればそのid、なければplayer。`}`;
  try {
    const data = await callGmApi({ system, messages: [{ role: "user", content: rest }], maxTokens: 80 });
    const raw = data.content && data.content[0] && data.content[0].text || "";
    const m = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(m ? m[0] : raw);
    const intent = ["investigate", "move", "back", "talk", "talk_gm", "take", "other"].includes(parsed.intent)
      ? parsed.intent : "other";
    const target = targets.includes(parsed.target) ? targetAlias.get(parsed.target) : null;
    const named = typeof parsed.named === "string" && parsed.named.trim() ? parsed.named.trim() : null;
    // 主語はチップ由来の確定情報を優先。無ければLLMの読み取りをnormalizeWhoで解決
    const resolvedActorId = chipActor ? actorId : normalizeWho(parsed.actor, "player");
    const actorName = CAST[resolvedActorId] ? CAST[resolvedActorId].name : "あなた";
    addNote(`🧭 分類: ${intent}${target ? " → " + target : ""}`);
    return { intent, target, named, actorId: resolvedActorId, actorName };
  } catch (e) {
    return null; // 分類器が落ちたら従来のLLMルートに委ねる(安全側)
  }
}

// 作者が章データに書いた品物を渡す。add_items(LLM経由)は「今のシーンのlootにある物」しか
// 通さない絞り込みがあるが、あれはLLMが品物を捏造するのを防ぐためのもの。
// 作者が書いた報酬はその対象外なので、こちらの入口を使う
function grantAuthoredItems(names) {
  if (!Array.isArray(names)) return;
  names.forEach(n => {
    if (!inv.give(state.inventory, n)) return;
    logSceneEvent(`「${n}」を手に入れた`);
  });
}

// 同行者の同意は参加者ごとの応答として記録する。CPU自動応答はこの入口を呼ぶ実装の一つであり、
// 将来人間プレイヤーが操作する場合も、この関数へ応答を渡せば同じ進行になる。
// 応答は1人ずつ届く(CPUが即答するとは限らない・将来は人間の入力待ちもありうる)ため、
// 静的なsteps配列を組めない。runSpeechSequenceと同じ「前の吹き出しを消す→話す→読了目安だけ待つ」
// 原則を、届いた順に手動でチェーンする
function submitCompanionConsent(who, response) {
  const waiting = state.pendingCompanionConsents;
  if (!waiting) return;
  const participant = waiting.find(p => p.who === who && p.response === null);
  if (!participant) return;
  clearAllBubbles(); // 直前の話者(GMの促し、または前の同行者)の吹き出しを消してから話す
  participant.response = response;
  addCompanion(response, who);
  renderDebug();
  const next = waiting.find(p => p.response === null);
  if (next) {
    setTimeout(() => resolveCpuCompanionConsent(next.who), readDelayMs(response));
    return;
  }
  // 最後の1人の吹き出しも読ませてからシーンへ進む。advanceSceneは冒頭でcompanionBubblesを
  // 空にするため、ここで間を置かないと最後の同意だけ一瞬も表示されない
  // (実測: 100ms間隔で監視しても一度も描画されなかった)。
  // 進行状態は先に畳んでおく(この間にプレイヤーが入力しても同意フローへ再突入させない)
  const targetIdx = state.pendingIntroTarget;
  state.pendingCompanionConsents = null;
  state.pendingIntroTarget = null;
  setTimeout(() => advanceScene(targetIdx), readDelayMs(response));
}

function companionConsentLine(companion) {
  // voiceRule()はLLM経路と同じ人格制約の唯一の組み立て口。定型CPU応答も必ずここを通す。
  const rule = voiceRule(companion);
  if (companion.gender === "female") {
    return { rule, say: `${companion.firstPerson || "あたし"}も賛成。${companion.addressTerm || "あなた"}が受けるなら、同行するわ。` };
  }
  if (companion.gender === "male") {
    return { rule, say: `${companion.firstPerson || "俺"}も賛成だ。${companion.addressTerm || "お前"}が受けるなら、同行する。` };
  }
  return { rule, say: "同行する。" };
}

function resolveCpuCompanionConsent(who) {
  const companion = CAST[who];
  if (!companion) return;
  const response = companionConsentLine(companion);
  // response.rule は上記で voiceRule() を通過した人格制約。CPU応答を差し替える実装もここを置換する。
  submitCompanionConsent(who, response.say);
}

function beginCompanionConsent(targetIdx) {
  const participants = Object.keys(CAST).map(who => ({ who, response: null }));
  if (!participants.length) { advanceScene(targetIdx); return; }
  state.pendingCompanionConsents = participants;
  state.pendingIntroTarget = targetIdx;
  const prompt = "同行する者にも、意思を確かめよう。";
  clearAllBubbles();
  addGm(prompt, "Neutral");
  // GMの促しが読み終わる頃合いまで待ってから最初の同行者に答えさせる(以前はここが0秒待ちで、
  // GMの吹き出しと最初の同行者の返事が同時に出ていた)
  setTimeout(() => resolveCpuCompanionConsent(participants[0].who), readDelayMs(prompt));
}

function finishChapter() {
  if (state.chapterEnded) return;
  state.chapterEnded = true;
  captureWorldFlags();
  const campaignEnding = CAMPAIGN.ending;
  if (campaignEnding) addGm(campaignEnding.brief || campaignEnding.text || "", "Neutral");
  addNote("—— 物語は決着した。おつかれさま。「最初から」で別の選択を試せる ——");
}

// シーン遷移の実行(LLM経路・scripted経路の両方から使う)。最終シーンなら章を締める
// targetIndexを渡すとexits[]の任意遷移先へジャンプする(未指定なら従来通り次のシーン)
function advanceScene(targetIndex) {
  const idx = targetIndex !== undefined ? targetIndex : state.sceneIndex + 1;
  if (idx >= 0 && idx < SCENARIO.scenes.length) {
    state.sceneIndex = idx;
    state.sceneTalkTurns = 0; // talkTurnsMin条件(報告シーン等)のカウンタはシーンごとにリセット
    setSceneBackdrop(SCENARIO.scenes[state.sceneIndex]);
    state.enemy = null;
    state.pendingFailedCheck = null; state.blockedMove = false;
    state.lastBattleMutter = {};
    history = [];
    // 前シーンの吹き出しが新シーンに持ち越されないよう、同行者・NPCの吹き出しをクリア
    setStore({ companionBubbles: {}, npcBubble: { text: "", seq: 0 } });
    addNote(`—— シーン${state.sceneIndex + 1} ——`);
    const newScene = SCENARIO.scenes[state.sceneIndex];
    const newBrief = newScene.brief;
    setSceneInfo(state);
    showSceneOverlay();
    // GMペットの吹き出し・語り履歴が前のシーンへの回答のまま残らないよう、
    // 下パネルが開き直す(1s)のを待ってGM→NPC(いれば)→同行者の順に語らせる。
    // 各stepの間隔・前の吹き出しを消すタイミングはrunSpeechSequenceに一本化してある
    const sceneNo = state.sceneIndex + 1;
    const arrivalLine = gmSceneArrivalLine(sceneNo, newScene.name || "");
    const steps = [{ text: arrivalLine, speak: () => addGm(arrivalLine, "Happy") }];
    if (newScene.npc && newScene.greeting) {
      steps.push({ text: newScene.greeting, speak: () => addNpc(newScene.greeting, newScene.npc) });
    }
    const companionLine = pickCompanionSceneArrivalLine();
    if (companionLine) {
      steps.push({ text: companionLine.text, speak: () => addCompanion(companionLine.text, companionLine.who) });
    }
    setTimeout(() => runSpeechSequence(steps), 1000);
    history.push({ role: "user", content: "【システム】シーンが切り替わった。" });
    history.push({ role: "assistant", content: JSON.stringify({ narration: newBrief, companion: null, npc: null, check: null, state_updates: null, engage_enemy: false, flee_enemy: false, scene_complete: false, meta_request: null }) });
  } else {
    if (state.chapterEnded) return; // 終幕後にLLMが再度scene_completeを申告しても二重記録しない
    // chapter.ending/campaign.endingはnull運用(TAS_導入終端ノード出力仕様_null運用_2026-07-22):
    // 未作成(null)なら何も再生せず、従来通りの定型文にフォールバックする
    const chapterEnding = SCENARIO.ending;
    if (chapterEnding && typeof chapterEnding === "object") {
      state.pendingEnding = true;
      showDialogueNode(chapterEnding);
      return;
    }
    // 旧形式(ending=nullを含む)は従来通り、定型文で即時終了する。
    if (chapterEnding) addGm(chapterEnding.brief || chapterEnding.text || "", "Neutral");
    finishChapter();
  }
}

function checkEnemyDown() {
  if (state.enemy && state.enemy.hp <= 0) {
    identifyEnemy(); // 未識別のまま倒した場合も、倒した時点で正体は分かる
    addNote(`⚔ ${enemyName(state.enemy)}を倒した`);
    logSceneEvent(`${state.enemy.name}を倒した`);
    state.defeated.push(state.enemy.name);
    // 撃破で開示される秘密は章データのenemy.revealOnDefeatで指定する(定義順の自動開示は廃止)
    const revealId = state.enemy.revealOnDefeat;
    const itemId = state.enemy.itemOnDefeat;
    // 個数は章データのenemy.itemOnDefeatCountが正(TAS「撃破時に渡す個数」欄)。
    // 未指定の遭遇(1個で十分な品)を壊さないよう既定値1にフォールバックする
    const itemCount = Math.max(1, Number(state.enemy.itemOnDefeatCount) || DEFAULT_ITEM_ON_DEFEAT_COUNT);
    state.enemy = null;
    if (revealId) {
      const secret = SCENARIO.scenes[state.sceneIndex].secrets.find(s => s.id === revealId && !revealed.has(s.id));
      if (secret) unlockSecret(secret);
    }
    // itemOnDefeatは現状「回復薬」専用(state.healPotionsという専用カウンタで数を持つ)。
    // 他の品を渡す遭遇が増えたらinv.give経由の分岐をここに足す
    if (itemId === HEAL_POTION_NAME) {
      state.healPotions += itemCount;
      addNote(`⚔ ${HEAL_POTION_NAME}を${itemCount}個手に入れた`);
      logSceneEvent(`${HEAL_POTION_NAME}を${itemCount}個手に入れた`);
    }
    return true;
  }
  return false;
}

// world_flagsの受け渡しスタブ(DATA_EXCHANGE.md 未決2。TAS MVPが生成する第2章と接続するための受け皿)。
// chapter.flagRulesを上から順に評価し、章に依存しない汎用ロジックでworldFlagsを導出する
// (BORG Inbox「flags宣言の宣言的マッピングとgameOverText仕様調整依頼 2026-07-22」で合意した形式)。
// 条件語彙: defeated(敵の正名)/revealed(secret id)/itemsInclude(品の正名)/else(既定値)
function evaluateFlagRules() {
  const rules = SCENARIO.flagRules || {};
  const result = {};
  for (const [flagName, ruleList] of Object.entries(rules)) {
    for (const rule of ruleList || []) {
      if (rule.else) { result[flagName] = rule.value; break; }
      const cond = rule.if || {};
      const matched =
        (cond.defeated === undefined || state.defeated.includes(cond.defeated)) &&
        (cond.revealed === undefined || revealed.has(cond.revealed)) &&
        (cond.itemsInclude === undefined || inv.has(state.inventory, cond.itemsInclude));
      if (matched) { result[flagName] = rule.value; break; }
    }
  }
  return result;
}

// campaign.style.gameOverTextがあれば章ごとの文言、無ければ汎用フォールバック(BORG Inbox仕様調整依頼 2026-07-22)
function gameOverText() {
  return `HPが0になった。${(CAMPAIGN.style && CAMPAIGN.style.gameOverText) || "君は力尽きた。"}——ゲームオーバー。`;
}

// scenes[].stateUpdates(type:"flag_set")を評価する。conditionの語句が宣言文に含まれていたら
// flagをvalueに確定させる(TASの発話ルール「状態値を設定」由来。secrets.aliasesと同じ単純な部分一致)。
// onceのものはstate.flagsFiredで二重発火を防ぐ
function applySceneStateUpdates(text) {
  const sc = SCENARIO.scenes[state.sceneIndex];
  (sc.stateUpdates || []).forEach((u, idx) => {
    if (u.type !== "flag_set") return;
    const key = `${state.sceneIndex}:${idx}`;
    state.flagsFired = state.flagsFired || [];
    if (u.once && state.flagsFired.includes(key)) return;
    if (u.condition && !text.includes(u.condition)) return;
    state.flags = state.flags || {};
    state.flags[u.flag] = u.value;
    if (u.once) state.flagsFired.push(key);
    addNote(`🚩 ${u.flag} = ${JSON.stringify(u.value)}`);
  });
}

// 章の結末をstate.worldFlagsへ書き出す(saveGame経由でセーブに残る)。
// flagRules由来(世界状態から導出)とstate.flags由来(プレイヤーの選択でapplySceneStateUpdatesが確定させた値)を統合する
function captureWorldFlags() {
  state.worldFlags = { ...evaluateFlagRules(), ...(state.flags || {}) };
  addNote("🏁 章の結末を記録した(world_flags): " + JSON.stringify(state.worldFlags));
  renderDebug();
}

/* lootは文字列、または {name, requires: "secretId"}。
   requires付きの品は、そのsecretが開示されるまで「存在しない」——プロンプトにも正名を注入せず、
   add_itemsのホワイトリストにも載せない。旧実装の「心石はs3b開示まで不可」のハードコードを
   データ駆動に置き換えたもの(正名の常時注入が未開示の秘密をネタバレする穴を塞ぐ) */
function availableLoot(sc) {
  return (sc.loot || [])
    .map(i => (typeof i === "string" ? { name: i } : i))
    .filter(i => !i.requires || revealed.has(i.requires))
    .map(i => i.name);
}

function askBackCandidates(sc) {
  const candidates = [];
  const add = name => { if (name && !candidates.includes(name)) candidates.push(name); };
  sc.secrets.filter(s => revealed.has(s.id)).forEach(s => add(s.entity));
  availableLoot(sc).forEach(add);
  Object.values(CAST).forEach(c => add(c.name));
  if (state.enemy) add(enemyName(state.enemy));
  return candidates;
}

function askBackUnknownTarget(named, sc, repeated) {
  const candidates = askBackCandidates(sc);
  const shown = candidates.slice(0, repeated ? 6 : 3);
  state.unknownTarget = { lastTurnAskedBack: true, candidates: shown };
  const choices = shown.length ? ` 候補: ${shown.join("、")}。` : "";
  /* 前置きの一言だけを作者が差し替えられる(campaign.style.unknownTarget)。
     候補一覧はエンジンが決定論で添える——ここをLLMや作者に任せると存在しない物を並べうる */
  const opener = CAMPAIGN.style.unknownTarget || `「${named}」が何を指すのか、もう少し教えてくれ。`;
  addGm(repeated
    ? `${opener}この中から選んでくれ。${choices}`
    : `${opener}${choices}`, "Neutral");
}

/* シーン遷移のシステム側ガード。scene.completeRequires(機械可読の条件)を満たさない限り、
   LLMのscene_complete申告を却下する。goal文の解釈をLLM任せにしない(クロニクル2026-07-12で
   条件未達のままシーン遷移し、未開示秘密が回収不能になった破綻への対策) */
function sceneCompleteAllowed(sc) {
  // exits[]を持つシーンは行き先が複数(または特定の1つ)になりうるため、
  // LLMの自己申告(scene_complete)による「配列の次へ」進行を許可しない。
  // 移動は必ずmove意図→scriptedMoveForwardのexits解決を経由させる
  if (Array.isArray(sc.exits) && sc.exits.length) return false;
  const req = sc.completeRequires;
  if (!req) return true;
  if (req.secretsAny && !req.secretsAny.some(id => revealed.has(id))) return false;
  // 報告・会話シーン用: このシーンで最低Nターンの会話(LLM会話レーン)を経るまで決着させない
  if (req.talkTurnsMin && (state.sceneTalkTurns || 0) < req.talkTurnsMin) return false;
  return true;
}

/* 開示対象のマッチング(Codex設計相談 2026-07-12 に基づく二段階方式)。
   旧unlockNextSecret(定義順に1件)は、調べた対象と開示内容が食い違う破綻を起こした。
   一致1: LLMがcheck.targetEntityに正名をそのまま返した場合(推奨経路。depthBlockで指示)
   一致2: 宣言文・判定名・targetEntityに、entityの部分語かaliases(章データの別名辞書)が含まれるか
   0件・複数件なら開示しない——誤った秘密を漏らすより「開示なし」の方が三層モデルとして安全 */
function unlockSecret(secret) {
  const sc = SCENARIO.scenes[state.sceneIndex];
  const before = new Set(availableLoot(sc));
  revealed.add(secret.id);
  addReveal(secret);
  logSceneEvent(`「${secret.entity}」の真相を解明した`);
  /* この秘密の開示でrequiresを満たし、新たに入手可能になった品を控える。
     従来はシナリオ側のdirection欄への自由記述("〜を手に取ったと伝える")に促しを頼っていたが、
     LLMが従うかどうかは保証されない(2026-08-03のログで実際に発火せず、プレイヤーが
     エンディングで「まだ渡していないものがある」を3回連続で拒否された)。
     ここで確実に控え、takeLootRevealCue()で1回だけ強く念押しする */
  const newlyAvailable = availableLoot(sc).filter(n => !before.has(n));
  if (newlyAvailable.length) state.pendingLootReveal = [...(state.pendingLootReveal || []), ...newlyAvailable];
}

// 各シーンで確定した出来事を記録する(プロンプトの「これまでの経緯」の材料。履歴24件切れ対策の長期記憶)
function logSceneEvent(text) {
  (state.sceneLog ||= []).push({ scene: state.sceneIndex, turn: state.turn, text }); // ||= は旧セーブデータ(sceneLogなし)の互換
}

/* ---------------- プロンプト構築 ---------------- */
function systemPrompt(extra) {
  const sc = SCENARIO.scenes[state.sceneIndex];
  const revealedTexts = SCENARIO.scenes.flatMap(s => s.secrets)
    .filter(s => revealed.has(s.id))
    .map(s => "・" + s.text);
  const depthTargets = sc.secrets.filter(s => !revealed.has(s.id) && s.entity)
    .map(s => "・" + s.entity + (s.surface ? `(表層: ${s.surface})` : ""));
  // B1: talk/other等の会話レーン(投機的な投げかけ)が未開示secretsに言及・捏造するのを防ぐ。
  // 調査のヒット判定自体はscriptedExamineが決定論で処理するため、ここは「会話中に漏れる」経路専用。生きている
  const depthBlock = depthTargets.length
    ? `\n# 深さのある対象(未開示の詳細がシステム側にある)\n以下の対象について語ってよいのは、括弧内の「表層」の範囲まで。対象を指す時は上記の名称を一字一句そのまま使え。\n${depthTargets.join("\n")}\n【厳守】\n・あなたは対象の正体・仕組み・来歴・目的を知らない。それを語るな。\n・表層で説明がつかない時、正体を推測・創作して埋めてはならない(例:「石になっていく」「呪いだ」等、独自の設定をでっち上げるのは禁止)。分からないものは、見えた所作・音・質感だけで描き、分からないまま残せ。\n・「最近」「誰かが」「今も」など、変化や活動の兆候を匂わせる描写も真相の一部である。表層に無ければ、たとえ一言でも判定なしに語ってはならない(例:「最近こすれた跡がある」「誰かが最近触れた形跡」は不可。「古い」「錆びている」等、静的な状態の描写に留めよ)。\n・真相は「判定成功時にシステムが渡した文」だけが根拠。渡されていない限り、対象が何であるか・なぜそうしているかを断定・示唆してはならない。\n・プレイヤーが対象を観察・質問・分析するなど深く知ろうとしたら、地の文で答えを出さず、必ず check を要求せよ(真相はその成功時にのみ解禁される)。\n・その check では、check.targetEntity に上記の名称を一字一句そのまま入れよ。これらの対象以外への判定では targetEntity は null にせよ。\n・判定に失敗しても、対象を破壊・消失させてはならない。`
    : "";
  // 未開示の秘密に紐づく品は正名を注入しない(ネタバレ防止。開示された瞬間からLLMに見える)
  const lootNames = availableLoot(sc);
  const hasUnavailableLoot = (sc.loot || []).some(item => typeof item !== "string" && item.requires && !revealed.has(item.requires));
  const lootBlock = lootNames.length
    ? `\n# このシーンで入手しうる品(正名)\n${lootNames.join("、")} — プレイヤーが物語上、自然に手に入れる流れになった時だけ、add_items にこの正名をそのまま入れて提案せよ。ここに無い品は入手させない。`
    : "";
  const unavailableLootBlock = hasUnavailableLoot
    ? "\nこのシーンには、まだ手に入らない品がある。プレイヤーへ「拾え」「取れ」「手に入れろ」と促してはならない。"
    : "";
  const direction = sc.report ? reportDirection() : sc.direction;
  // 未識別の敵は、LLMにも本名と正体につながる特徴(trait)を渡さない(名前も③層扱い)。BORG/TRPG/MockDocs/RULE_INVENTORY.md B5
  const unidentifiedNote = "\n【未識別】この敵の正体はまだ分かっていない。上記の名称をそのまま使い、正体・種族・名前を推測して語ってはならない。見えた姿・音・動きだけで描写せよ。";
  // (B4は2026-07-21削除): 交戦中(state.enemy有効)はtryCombatTurnが常に決定論で処理してここに到達しないため、
  // 「交戦中の敵」ブロックは死んだコードだった。ここに残るのは「まだ交戦していない・潜む敵」の描写のみ(生きているLLM経路)
  const enemyBlock = sc.enemy && !state.defeated.includes(sc.enemy.name) && !(state.fled || []).includes(sc.enemy.name)
    ? `\n# このシーンに潜む敵(まだ交戦していない)\n名前:${sc.enemy.unknownName || sc.enemy.name} / 特徴:${sc.enemy.unknownName ? (sc.enemy.surface || "暗くてよく見えない") : sc.enemy.trait}${sc.enemy.unknownName ? unidentifiedNote : ""}\nプレイヤーが刺激した場合や物語上自然な場合、まず姿・特徴・威嚇を地の文で描写してから engage_enemy を true にして戦闘を開始できる。\n奇襲はシステム専権。敵が潜んでいても、あなたは奇襲成功や先制ダメージを確定してはならない。${sc.enemy.ambush ? `\n奇襲条件:${sc.enemy.ambushTrigger}` : ""}`
    : "";
  // B2: LLM自身が提案したcheckが失敗した時だけ立つ(scriptedExamineの判定失敗はここを通らない)。生きている
  const failedCheckBlock = state.pendingFailedCheck
    ? `\n# 直前に失敗した判定\n${state.pendingFailedCheck.reason} は失敗している。この対象について、真相・正体・仕組み・最近の痕跡・内側/外側の構造などの確定情報を語ってはならない。見えた表層、危険、分からなさだけを描写せよ。`
    : "";
  // B3: LLMが自ら申告したscene_completeをシステムが却下した時だけ立つ(move意図の決定論遷移はここを通らない)。生きている
  const blockedMoveBlock = state.blockedMove
    ? `\n# 直前の状況\n一行は先へ進もうとしたが、まだ進めない(このシーンに未解決の手がかりが残っている)。先へ進んだ・場所を移った描写をしてはならない。一行をこの場に留めて描写せよ。scene_complete も出すな。`
    : "";
  // B8: 文体・語彙・世界観はcampaign.jsonから組み立てる(コード直書き禁止の契約、DATA_EXCHANGE.md 6.2)。
  // 応答フォーマット・判定ルール・三層の開示制御はエンジンの動作契約なのでコードに残す
  const st = CAMPAIGN.style;
  const spreadNote = {
    story: "プレイヤーの発言が本筋から逸れても、物語の目的・手がかりへ自然に引き戻せ。雑談は短く切り上げよ。",
    standard: "",
    free: "プレイヤーとの雑談や脱線を歓迎してよい。無理に本筋へ戻そうとしなくてよい。"
  }[st.conversationSpread || "standard"] || "";
  /* GMの人格(誰であるか)と、地の文の作法(どう書くか)は役割が別なので行を分ける。
     どちらもキャンペーン単位で固定なので、プロンプト前半(KVキャッシュの対象)に置いてよい */
  const styleBlock = [
    `あなたはソロTRPGのゲームマスター。名は${GM.name}。${GM.persona}`,
    gmVoiceRule(),
    st.narration,
    st.readingLevel,
    st.goodExample ? `良い例:「${st.goodExample}」` : "",
    st.badExample ? `悪い例:「${st.badExample}」` : "",
    st.terms || "", // TASの「用語・禁止事項」入力(自由記述。forbiddenWordsとは別枠)
    ...(st.extra || []),
    spreadNote,
    st.world + ((st.forbiddenWords || []).length ? `使ってはならない語の例: ${st.forbiddenWords.join("、")}。` : "")
  ].filter(Boolean).join("\n");
  // B9: 同行者の人格・掛け合い条件。一人称・語尾・呼称はvoiceRule()で自動生成する
  // (2026-07-22: キャラごとに手書きすると増やし忘れる事故が起きた。リディアの一人称指定漏れで
  // ガレスの「俺」が漏れて出た実例あり。以後はgender/firstPerson/addressTermから機械的に導出し、書き漏れを構造的に防ぐ)
  const companionLines = Object.entries(CAST)
    .map(([id, c]) => `- ${c.name}(${id}): ${c.persona}${voiceRule(c)}`).join("\n");
  const companionIds = Object.keys(CAST).map(id => `"${id}"`).join(" か ");
  // B10: シーンNPC(依頼人等)の台詞は専用チャネルnpc.sayへ。companion枠に混ざると
  // normalizeWhoの解決失敗→誤帰属(マイラの台詞がリディア名義になる等)が起きるため、出口を分ける
  const npc = sc.npc;
  const npcBlock = npc
    ? `\n# シーンの人物(同行者ではない)\nこのシーンには${npc.name}がいる。あなたが演じてよいが、${npc.name}の台詞は必ず npc.say に入れよ。companion は同行者(${companionIds})専用であり、${npc.name}の台詞を入れてはならない。\nこのシーンの対話の主役は${npc.name}とプレイヤーである。同行者はプレイヤーに直接話しかけられた時だけ返答し、それ以外は companion を null にせよ。\n`
    : "";
  const npcSchema = npc ? `"npc":{"say":"${npc.name}の一言"}または null,` : "";
  // B11: これまでの経緯。シーンごとの確定事実の記録(履歴24件切れ対策。特に終盤の報告シーンで章全体を参照できる)
  const log = state.sceneLog || [];
  const digestLines = SCENARIO.scenes.slice(0, state.sceneIndex + 1).map((s, i) => {
    const events = log.filter(e => e.scene === i).map(e => e.text);
    const label = `シーン${i + 1}「${s.name}」`;
    if (i === state.sceneIndex) return events.length ? `・${label}(現在): ${events.join("。")}。` : `・${label}(現在)`;
    return `・${label}: ${events.length ? events.join("。") + "。" : "特筆する出来事なし。"}`;
  });
  const digestBlock = state.sceneIndex > 0 || log.length
    ? `\n# これまでの経緯(システムが確定した事実の記録。矛盾する語りをするな)\n${digestLines.join("\n")}\n`
    : "";
  // 並び順の契約: 前半=毎ターン不変(文体・依頼・同行者・ルール)、後半=変動(経緯・シーン・状態)。
  // ローカルSLM(Ollama)はプロンプト先頭が前回と一致する部分のKVキャッシュを再利用するため、
  // 静的部分を先頭に固めると毎ターンの再処理が変動部分だけで済む(実測: 全再処理31秒→キャッシュ時3秒)
  //
  // 以下のテンプレート文字列はそのままLLMへ送るプロンプト本体(注釈をここに書き足すとトークンが増える)。
  // BORG/TRPG/MockDocs/RULE_INVENTORY.md のB系IDとの対応は本文の出現順で辿れる:
  //   companionブロック→B9、直後の「# ルール」冒頭〜HP提案まで→B7(状態変更提案の制約)、
  //   narration一文→B12(2026-07-21追加、メタ描写禁止)、移動の一文→B3と対、
  //   メタ発言の一文→B10、npcBlock挿入部→B10。個別ルールを増やす前に、まずRULE_INVENTORY.mdへの
  //   追記とここでの棚卸しを先にすること(肥大化を可視化する)。
  return `${styleBlock}

# 依頼(プレイヤーの目的)
${SCENARIO.quest}
プレイヤーが目的を見失って停滞している時のみ、同行者の台詞や語りで自然に思い出させてよい。

# 同行者(あなたが演じる)。全員、プレイヤーと同じ情報しか知らない——未開示の真相・演出指示・「深さのある対象」の注釈を台詞に反映させてはならない。
${companionLines}
次の場合に companion へ一言(短く。原則40字、長くても60字程度で言い切る)を入れる。それ以外は必ず null:
- プレイヤーが同行者に直接話しかけた・尋ねた・気遣った時は、必ず何か返す(黙殺は不可。分からない事は「分からん」でよい)
- プレイヤーが迷い・停滞している時(依頼を思い出させる、または状況を短く整理する)
- 倫理的に重い選択の前に「本当にやるのか」と一拍置く時
- 明白な危険への短い警告
companion.who に喋る方(${companionIds})を必ず指定する。${CAMPAIGN.companionsHint || "場面に合う方を選べ。"}
companion.aside は、その一言が「頼まれてもいないのに口を突いて出た、そのキャラの癖・軽口」の時だけ true にする(例:ガレスが待ちきれず先走る、リディアの理屈っぽい独り言)。プレイヤーの質問への回答・進言・警告など、真面目な発言は false。迷ったら false。
答えを与えるな。判断は常にプレイヤーに残せ。彼らは自分からは行動しない。
注: 同行者どうしの掛け合い(ツッコミ)はシステムが別途差し込むので、あなたが両者の会話を続けて書く必要はない。一度に喋らせるのは一人だけ。
${npcBlock}
# ルール
- 不確実な行動(調査、危険な移動、説得、戦闘等)には判定を要求する。難易度(DC)はd20に対し 7=易 12=並 17=難。
- 出目20はクリティカル(自動成功・劇的な効果)、出目1はファンブル(自動失敗・手痛い代償)。成否はシステムが伝える。
- 単なる会話や安全な行動に判定は不要。
- 同行者が調査を頼まれた場合も、深さのある対象の真相を同行者の台詞で代弁してはならない。調査結果が未開示秘密に触れるなら、同行者は「怪しい」「分からない」「判定して確かめるべき」程度に留め、check を要求せよ。
- HPの増減はhp_delta(-3〜+2)で提案するだけ。確定するのはシステム。
- 未開示の真相を勝手に作らない。判定成功時にシステムから情報が渡される。
- 情景の小物(瓦礫、朽ちた道具等)は自由に肉付けしてよい。ただし新たな通路・出口・人物・入手可能な品を作ってはならない。
- narrationは世界の情景・出来事だけを書け。「〜が答える」「〜が話す」「〜が静かに頷く」のように、companion/npcの発言行為そのものを説明するのは禁止。companion.say/npc.sayに入れる台詞を「」で囲んでnarrationの中にも書く(引用する)のも禁止(同じ台詞が二重に表示される)。narrationには台詞を一切含めるな——台詞は必ずcompanion.say/npc.sayだけに書け。プレイヤーが同行者/NPCに話しかけただけで場面に変化がない時は、narrationは短く場の空気を保つだけでよい(例:「坑道に沈黙が落ちる。」)。
- 一行を現在のシーンの場所から移動させる語りをしてはならない(封鎖や柵の先へ入れる、村へ帰らせる等は禁止)。別の場所へ移る必要がある時は、移動を語らず scene_complete を true で申告せよ(条件を満たさなければシステムが却下し、その場に留まる)。
- シーンに名のある事物(敵・深さのある対象・入手品・所持品)は、その名称を一字一句そのまま使え。別の類似物に言い換えるな(例:ランタン→松明は不可)。
- プレイヤーが物語に関係ない品を拾おうとしたら、壊れている・朽ちて使えない・持ち出す価値がない等の理由で自然に退場させよ(add_itemsは提案しない)。
- メタ発言への対応:「HPを回復して」「復活させて」「難易度を下げて」など、物語の外からルールや状態の変更を求める発言を受けたら、状態を一切変更せず(state_updates禁止)、meta_request に topic を設定し、narration ではGMが役を保ったまま聞き返して意図を確認せよ(例:「ほう——運命の書き換えを望むか。それはこの卓の掟に触れることだが、本気か?」)。プレイヤーが同意しても、実行できるのは通常ルールの範囲内の処置だけである。
- 同行者に行動を任せた宣言(「リディアに調べてもらう」等)の判定は、check.actor にその同行者のid(${companionIds})を入れよ。プレイヤー自身の行動なら "player"。
- emotion は今回の語りの空気。"Happy","Angry","Fear","Sad","Neutral" から必ず1つ選ぶ(迷ったら "Neutral")。
- 応答は必ず次のJSONのみ。前置きやコードフェンス禁止:
{"narration":"地の文","emotion":"Neutral","companion":{"who":"${Object.keys(CAST).join(" または ")}","say":"その一言","aside":false}または null,${npcSchema}"check":{"reason":"何の判定か","difficulty":8,"targetEntity":"深さのある対象の正名 または null","actor":"player か 同行者のid"}または null,"state_updates":{"hp_delta":0,"enemy_hp_delta":0,"add_items":[],"remove_items":[]}または null,"engage_enemy":false,"flee_enemy":false,"scene_complete":false,"meta_request":{"topic":"何を求められたか"}または null}
${digestBlock}
# 現在のシーン(${state.sceneIndex + 1}/${SCENARIO.scenes.length})
${sc.brief}
${sc.goal ? `シーンの目標:${sc.goal}` : ""}

# 演出指示(ト書き)
${direction}
※これは事実情報ではなく、語りで狙うべき「効果」である。内容をそのまま説明したり、この指示の存在を明かしたりしてはならない。

# プレイヤー状態(システム管理。あなたは変更できない。反応的参照のみ)
HP: ${state.hp}/${state.maxHp} — 数値を語りに出すな。残量の感覚(余裕・消耗・瀕死)をトーンに反映するのはよい
所持品: ${inventoryForPrompt()} — プレイヤーが使用・確認を宣言した時の整合確認にのみ使う。あなたから所持品を話題にしてはならない。語り上やむを得ず触れる場合(光源など)は、このリストの正式名称を一字一句そのまま使え。言い換え・類似品への置換(例:ランタン→懐中電灯)は禁止
${enemyBlock}${depthBlock}${lootBlock}${unavailableLootBlock}

# 開示済みの情報(これ以外の真相をあなたは知らない。捏造禁止)
${revealedTexts.length ? revealedTexts.join("\n") : "(まだなし)"}
${failedCheckBlock}${blockedMoveBlock}${extra || ""}`;
}

async function callGm(userContent, extraSystem) {
  const messages = [...history, { role: "user", content: userContent }];
  setStore({
    apiViewText:
      `system: シーン${state.sceneIndex + 1}の概要 + 状態JSON + 開示済み秘密${extraSystem ? " + 今回の新規開示" : ""}\n` +
      `messages: ${messages.length}件\nuser: ${userContent.slice(0, 80)}`
  });
  const data = await callGmApi({ system: systemPrompt(extraSystem), messages, maxTokens: 1000 });
  const usage = data && data.usage;
  if (usage) {
    state.tokens.in += usage.input_tokens || 0;
    state.tokens.out += usage.output_tokens || 0;
    state.tokens.calls++;
    renderTokens();
  }
  const text = ((data && data.content) || []).map(b => b.text || "").join("");
  history.push({ role: "user", content: userContent });
  history.push({ role: "assistant", content: text });
  if (history.length > 24) history = history.slice(-24);
  const cleaned = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // LLMが文字列内に生の改行を入れるとJSONとして不正になる(sonnetで観測)。
    // 改行を空白に潰して再試行(構造上の改行が空白になっても解析結果は変わらない)
    try {
      return JSON.parse(cleaned.replace(/\r?\n/g, " "));
    } catch (e2) {
      // 完全な破損(閉じ括弧の欠落・生成の途中切れ等)でもnarrationの値部分だけは正規表現で救出を試みる。
      // 救出できないからといって生のJSON断片({"narration":"...等)をそのままプレイヤーに見せない(2026-07-21実害)
      let salvaged = null;
      const closed = cleaned.match(/"narration"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (closed) {
        try { salvaged = JSON.parse(`"${closed[1]}"`); } catch (e3) { /* 救出も失敗 */ }
      } else {
        // 閉じ引用符すら無い(生成が途中で途切れた)場合、開始位置から末尾までを素朴にアンエスケープする
        const open = cleaned.match(/"narration"\s*:\s*"((?:[^"\\]|\\.)*)$/);
        if (open) salvaged = open[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      }
      return {
        narration: salvaged || "……何かの拍子に、言葉がうまくまとまらなかったようだ。",
        check: null, state_updates: null, scene_complete: false
      };
    }
  }
}

/* 手番の最初の関門: 参加者の同意待ち・導入ノード(intro)・終端ノード(ending)。
   3つとも通常シーンのロジックより先に解決し、決着したらこの手番を終える。
   sendActionのtryブロックより手前で走るので、後始末(busy解除・renderDebug)は
   finallyを通らない——finish()で自前に行う。trueなら呼び出し側はそのままreturnする */
function turnDialogueNodes(text) {
  const finish = () => { busy = false; setStore({ busy: false }); renderDebug(); return true; };

  // 導入受諾後は、参加者ごとの応答が揃うまでシーンへ進めない。
  if (state.pendingCompanionConsents) {
    const waiting = state.pendingCompanionConsents.find(p => p.response === null);
    if (waiting) addGm(`${(CAST[waiting.who] && CAST[waiting.who].name) || waiting.who}の返事を待っている。`, "Neutral");
    return finish();
  }

  // 導入ノード(intro)がオブジェクト形式(exits[]あり)の間は、シーンロジックより先に
  // intro.exits[]の解決を試みる(null運用: TAS_導入終端ノード出力仕様_null運用_2026-07-22)
  if (state.pendingIntro) {
    const intro = SCENARIO.intro;
    const exit = resolveExit(intro, text);
    if (!exit) {
      /* 照合語に外れた宣言は、依頼人との会話として扱う(死んだターンにしない)。
         受諾を確定させるのは照合語の一致だけなので、ここで話が進んでしまうことはない */
      if (intro.npc && intro.npc.name) dialogueNodeReply(intro, text);
      else addGm(intro.blockedText || "どう答えるか、はっきりしない。別の言い方を試してくれ。", "Neutral");
    } else if (!requiresMet(exit.requires, { revealed, inventory: state.inventory })) {
      addGm(exit.blockedText || "まだ準備ができていない。", "Neutral");
    } else {
      state.pendingIntro = false;
      const targetIdx = exit.to === null || exit.to === undefined ? 0 : resolveExitTargetIndex(exit.to);
      if (exit.arrivalText) addGm(exit.arrivalText, "Neutral");
      if (exit.npcSay) addNpc(exit.npcSay, intro.npc); // 依頼の一言はNPCの吹き出しへ(GMの地の文にしない。endingと対)
      beginCompanionConsent(targetIdx >= 0 ? targetIdx : 0);
    }
    return finish();
  }

  // 終端ノード(ending)もintroと同じく、通常シーンの解決より先にexits[]を解決する。
  if (state.pendingEnding) {
    const ending = SCENARIO.ending;
    const exit = resolveExit(ending, text);
    if (!exit) {
      if (ending.npc && ending.npc.name) dialogueNodeReply(ending, text);
      else addGm(ending.blockedText || "どう締めくくるか、はっきりしない。別の言い方を試してくれ。", "Neutral");
    } else if (!requiresMet(exit.requires, { revealed, inventory: state.inventory })) {
      addGm(exit.blockedText || ending.blockedText || "まだ進めない。", "Neutral");
    } else {
      if (Array.isArray(exit.removeItems)) applyUpdates({ remove_items: exit.removeItems });
      grantAuthoredItems(exit.addItems); // 謝礼など、作者が書いた報酬
      state.pendingEnding = false;
      if (exit.arrivalText) addGm(exit.arrivalText, "Neutral");
      if (exit.npcSay) addNpc(exit.npcSay, ending.npc); // 締めの台詞はNPCの吹き出しへ(GMの地の文にしない)
      finishChapter();
    }
    return finish();
  }
  return false;
}

/* 同じ状況で同じ宣言を繰り返した手番。判定の余地が無いので結論は変わらない——
   LLMを呼ばずに打ち切る。trueなら呼び出し側はそのままreturnする */
function turnRepeatGuard(normalizedText, fp) {
  const prev = state.lastAction;
  if (!(prev && prev.text === normalizedText && prev.fingerprint === fp && !prev.hadCheck)) return false;
  addNote("🔁 同じ状況で同じ行動を繰り返した。判定の余地もなく、結論は変わらない(APIは呼んでいない) — 別の行動を試すか、先へ進もう");
  renderDebug();
  busy = false;
  setStore({ busy: false });
  return true;
}

/* 辞書でも分類器でも決着しなかった宣言を、GMの語り(LLM)で解決する手番の本体。
   会話ターンの計数 → 語りの呼び出し → 判定の解決 → 進行判定とシーン遷移、までが
   ひと続きの計算になっている(r・revealGate・progressed が段をまたいで縦断するため
   これ以上は割れない)。ctx は sendAction が集めた材料——progressed はここで書き換える
   ので、値ではなくオブジェクトのプロパティとして受け渡す。
   例外は握らない: 呼び出し側(sendAction)の catch/finally が後始末を持つ */
async function turnFreeform(text, ctx) {
  // talkTurnsMin条件用: 会話系の宣言だけを数える(調査連打で報告シーンが決着するのを防ぐ。Codexレビュー指摘)
  if (!ctx.cls || ["talk", "talk_gm", "other"].includes(ctx.cls.intent)) {
    state.sceneTalkTurns = (state.sceneTalkTurns || 0) + 1;
    // 報告シーンでは会話そのものが前進(クリア条件がtalkTurnsMin)。前進扱いにしないと
    // noProgressTurnsが積み上がり、停滞ナッジが誤爆して同行者が毎ターン喋り出す
    // (クロニクル2026-07-18: マイラの部屋でリディア/ガレスが喋りすぎる問題)
    if (SCENARIO.scenes[state.sceneIndex].report) ctx.progressed = true;
  }
  // 「考え中(…)」表示: 語りの主体であるGMは常に、宛先が同行者ならそのキャラにも出す
  // (NPCへの表示は npcAgentReply 側で管理。非同期でターン終了後に届くため寿命が別)
  const addressedWho = Object.keys(CAST).find(id => text.includes(CAST[id].name)) || null;
  setThinking("gm", true);
  if (addressedWho) setThinking(addressedWho, true);
  /* この場でtakeLootRevealCue()を呼ぶ(ctx.cls分岐より前で計算・消費すると、決定論の経路が
     LLMを呼ばずにreturnした時に控えが黒く消える。2026-08-03の実測: 「胸の光るもの」開示の直後、
     「奥へ進む」が決定論の移動経路で解決されて念押しが一度も出なかった。ここまで来て初めて
     消費すれば、LLMを呼ぶ手番が来るまで控えが持続し、必ずどこかの手番で届く) */
  let r = await callGm(`プレイヤーの宣言: ${text}`, ctx.banterCue + ctx.stagnationCue + ctx.injuryCue + takeLootRevealCue() + ctx.gmDirectCue + takeRollReactionCue());
  setThinking("gm", false);
  state.pendingFailedCheck = null; state.blockedMove = false;
  if (r.narration) addGmNarration(trimNarration(r.narration), r.emotion);
  if (addressedWho) setThinking(addressedWho, false);
  // 報告シーンの対話の主役はNPCとプレイヤー。同行者のスロットル解除は「直接話しかけられた時」
  // だけに限定する(停滞・負傷の割り込みでは口を挟ませない)
  const revealGate = revealTurnBeats(r, ctx.addressed ||
    ((ctx.nudgeActive || ctx.concernActive) && !SCENARIO.scenes[state.sceneIndex].report));
  // NPCの一言は専用エージェント(npcAgentReply)が非同期で生成する。r.npc.sayは受け皿として捨てる
  npcAgentReply(text, revealGate);
  if (r.meta_request) {
    addNote(`⚖ メタ発言を検知(${r.meta_request.topic || "内容不明"}) — GMが確認中。状態は変更されていない`);
    r.state_updates = null;
  }
  maybeEngage(r);
  applyUpdatesLogged(r.state_updates, { allowPlayerDamage: !!state.enemy });
  if (r.flee_enemy && state.enemy) { addNote(`⚔ ${enemyName(state.enemy)}との戦闘を離脱`); logSceneEvent(`${enemyName(state.enemy)}と戦わずに切り抜けた`); (state.fled ||= []).push(state.enemy.name); state.enemy = null; }
  if (checkEnemyDown()) ctx.progressed = true;
  renderDebug();

  // 開示済みのsecretへの再判定は振らせない(成功しても何も起きない空振りターンになる。2026-07-17(6) T20/T26)。
  // 「改めて確かめる」の再提示で応える
  if (r.check && r.check.targetEntity) {
    const already = SCENARIO.scenes[state.sceneIndex].secrets
      .find(s => revealed.has(s.id) && s.entity === r.check.targetEntity);
    if (already) {
      addGm("改めて確かめる。" + (already.playerText || already.text), "Neutral");
      r.check = null;
    }
  }

  if (r.check && r.check.difficulty) {
    const diff = Math.max(5, Math.min(18, r.check.difficulty));
    // 誰の判定か(同行者に任せた行動はLLMがcheck.actorで申告)。ダイスは名義を出してプレイヤーが振る
    const actor = normalizeWho(r.check.actor, "player");
    const actorName = actor === "player" ? "あなた" : CAST[actor].name;
    const reason = (actor === "player" ? "" : `${actorName}: `) + (r.check.reason || "判定");
    const roll = await requestPlayerRoll(reason, diff, actorName);
    const crit = roll === 20, fumble = roll === 1;
    const ok = crit || (!fumble && roll >= diff);
    await addDice(roll, diff, ok, crit, fumble, reason);

    let extra = "";
    // 識別は「敵への攻撃」の判定に限定する(戦闘状態が滞留した時に、無関係な調査判定で
    // 正体が判明してしまう誤爆があったため。クロニクル2026-07-12(1) T33)
    const attackIntent = /攻撃|斬|切りかか|殴|撃|叩|突|蹴|剣|斧|弓|矢/.test(text) ||
      (r.check.targetEntity && state.enemy &&
        (r.check.targetEntity === state.enemy.name || r.check.targetEntity === state.enemy.unknownName));
    if (state.enemy && attackIntent) extra += identifyEnemy(); // 攻撃して初めて正体が判明する(ウィザードリィ式)
    if (ok) ctx.progressed = true;
    if (!ok) state.pendingFailedCheck = { reason: r.check.reason || "判定", sceneIndex: state.sceneIndex };
    // 開示は攻撃判定以外なら戦闘中でも可(戦闘状態の滞留で探索judgが全て無駄になるのを防ぐ。
    // 開示対象は二段階マッチングで限定済みなので誤開示の危険はない)
    if (!attackIntent) {
      // 調べた対象に一致するsecretだけを開示する(一致しなければ開示なし)。
      // 判定の成否に関わらず、対象が特定できた時点でチップ化(失敗しても再挑戦を2タップに)
      const secret = resolveSecretTarget(SCENARIO.scenes[state.sceneIndex], r.check.targetEntity, r.check.reason, text, { revealed, inventory: state.inventory });
      if (secret) markExamined(secret.entity);
      if (ok && secret) {
        unlockSecret(secret);
        extra += `\n# 判定成功によりシステムが開示する新情報(これを語りに織り込め)\n・${secret.text}`;
      }
    }
    const outcome = crit ? "クリティカル(自動成功)" : fumble ? "ファンブル(自動失敗)" : ok ? "成功" : "失敗";
    const hint = crit ? "劇的な大成功として、効果を大きめに描写せよ。"
      : fumble ? "手痛い代償を必ず発生させよ(hp_delta可)。"
      : ok ? "" : "失敗は「手がかりが得られない」「状況がわずかに悪化する」ことで描け。戦闘中でない限り、負傷やhp_deltaを発生させるな。";
    let enemyDirective = "";
    let enemyAttackCause = null; // ダメージ通知に敵の攻撃のダイス結果を明示するため保持
    if (state.enemy) {
      const eRoll = rollD20();
      const eHit = eRoll >= 10;
      if (eHit) enemyAttackCause = `${enemyName(state.enemy)}の攻撃が命中(d20=${eRoll})`;
      addNote(`⚔ ${enemyName(state.enemy)}の行動: d20=${eRoll} → ${eHit ? "攻撃が届く" : "外れ/牽制"}`); // 未識別なら本名を出さない
      enemyDirective = eHit
        ? `戦闘中:判定成功なら enemy_hp_delta を提案してよい。さらに${state.enemy.name}も行動し、攻撃が届いた——反撃の描写と hp_delta(-1〜-2)を必ず含めよ。`
        : `戦闘中:判定成功なら enemy_hp_delta を提案してよい。${state.enemy.name}も行動したが攻撃は届かない——牽制や威嚇として描写せよ(hp_delta不要)。`;
    }
    setThinking("gm", true);
    const r2 = await callGm(
      `【システム】判定結果: d20=${roll}(DC${diff})→${outcome}。結果を描写せよ。${hint}${enemyDirective}`,
      extra
    );
    setThinking("gm", false);
    if (r2.narration) addGmNarration(trimNarration(r2.narration), r2.emotion);
    await revealTurnBeats(r2, false);
    // NPCの一言はメイン応答側(npcAgentReply)で1ターン1回だけ生成済み。r2側では発火しない
    maybeEngage(r2);
    applyUpdatesLogged(r2.state_updates, { allowEnemyDamage: ok, allowPlayerDamage: !!state.enemy || fumble }, enemyAttackCause);
    if (r2.flee_enemy && state.enemy) { addNote(`⚔ ${enemyName(state.enemy)}との戦闘を離脱`); logSceneEvent(`${enemyName(state.enemy)}と戦わずに切り抜けた`); (state.fled ||= []).push(state.enemy.name); state.enemy = null; }
    if (checkEnemyDown()) ctx.progressed = true;
    r.scene_complete = r.scene_complete || r2.scene_complete;
  }

  await revealGate;
  state.lastAction = { text: ctx.normalizedText, fingerprint: ctx.fp, hadCheck: !!(r.check && r.check.difficulty) };

  // LLMのscene_complete申告をシステム側で検証(条件未達なら却下)。
  // メタなシステムノートは興醒めなので、GMの語りとして「進めない」ことだけ伝える
  if (r.scene_complete && !sceneCompleteAllowed(SCENARIO.scenes[state.sceneIndex])) {
    r.scene_complete = false;
    state.blockedMove = true; // 次の手番のプロンプトで「先へ進んだ描写をするな」を注入
    // 通れる出口があるなら「進めない」は嘘になる。moveBlockedNoteが状態に合わせて出し分ける
    addGm(moveBlockedNote(SCENARIO.scenes[state.sceneIndex]));
  }

  if (inv.held(state.inventory).length > ctx.itemsBefore) ctx.progressed = true;
  if (state.enemy) ctx.progressed = true;
  if (r.scene_complete) ctx.progressed = true;
  state.noProgressTurns = ctx.progressed ? 0 : state.noProgressTurns + 1;

  renderDebug();

  if (state.hp <= 0) {
    addNote(gameOverText());
  } else if (r.scene_complete) {
    advanceScene();
    renderDebug();
  }
}

/* ---------------- 1ターンの流れ ---------------- */
export async function sendAction(text) {
  text = text.trim();
  if (!text || busy) return;
  if (state.hp <= 0) { addNote("倒れている。「最初から」でやり直そう。"); return; }
  // 終幕後も入力を受け付けてしまうと、最終シーン(報告等)の仕組みがそのまま動き続け、
  // マイラが際限なく聞き返すループになる(クロニクル2026-07-20 T27-30)。終幕後はここで止める
  if (state.chapterEnded) { addNote("物語は決着している。「最初から」で別の選択を試せる。"); return; }
  busy = true;
  setStore({ busy: true });
  state.turn++;
  addPlayer(text);
  recordVerb(text); // 述語を頻度辞書へ記録(動詞チップの学習)
  const previousAskedBack = !!state.unknownTarget?.lastTurnAskedBack;
  state.unknownTarget = { lastTurnAskedBack: false, candidates: [] };

  if (turnDialogueNodes(text)) return;

  applySceneStateUpdates(text); // 宣言文中の条件語句からflag_setを発火(プレイヤーの選択によるフラグ確定)

  const normalizedText = text.trim();
  const fp = stateFingerprint();
  if (turnRepeatGuard(normalizedText, fp)) return;

  const banterCue = takeBanterCue();
  const addressed = Object.values(CAST).some(c => text.includes(c.name));
  const stagnationCue = takeStagnationCue();
  const nudgeActive = state.noProgressTurns >= STAGNATION_SOFT;
  const injuryCue = takeInjuryCue();
  const concernActive = injuryCue !== "";
  const itemsBefore = inv.held(state.inventory).length;
  // progressed(前進したか)は turnFreeform 内でしか変わらないので、ctxのプロパティとして渡す

  // 戦闘中の宣言: 解決の間は全パネルを閉じて戦闘演出を見せる。ターン解決が終わったら
  // (finally)下パネルだけ開いて次の入力を促す。戦闘開始ターン(engageEnemy)も同じ流れ
  if (state.enemy) {
    setStore({ underPanelOpen: false, leftPanelOpen: false, rightPanelOpen: false });
    state.justEngaged = true; // 「ターン終了時に下パネルを開く」フラグとして共用
  }

  try {
    const scForEncounter = SCENARIO.scenes[state.sceneIndex];
    const ambushed = (Array.isArray(scForEncounter.encounters) && scForEncounter.encounters.length && !state.enemy)
      ? await resolveEncounterIfNeeded(text, scForEncounter)
      : await resolveAmbushIfNeeded(text);
    if (ambushed) {
      state.pendingFailedCheck = null; state.blockedMove = false;
      state.lastAction = { text: normalizedText, fingerprint: fp, hadCheck: true };
      state.noProgressTurns = 0;
      renderDebug();
      return;
    }

    // 戦闘中は全ての宣言を決定論の1ターンとして解決(BORG/TRPG/MockDocs/COMBAT_SPEC.md)。
    // 定型(攻撃・防御・逃走・弱点)以外は「工夫」として判定つきで試せる。LLMの自由裁量ルートは開かない
    if (state.enemy && await tryCombatTurn(text)) {
      state.pendingFailedCheck = null; state.blockedMove = false;
      state.lastAction = { text: normalizedText, fingerprint: fp, hadCheck: true };
      state.noProgressTurns = 0;
      if (state.hp <= 0) addNote(gameOverText());
      renderDebug();
      return;
    }

    // 発見済み・未交戦の敵(奇襲察知成功)への対応。仕掛ける/弱点で追い払う/やり過ごす を決定論で解決
    if (!state.enemy && state.spotted) {
      const sc = SCENARIO.scenes[state.sceneIndex];
      const foe = sc.enemy && sc.enemy.name === state.spotted ? sc.enemy : null;
      if (!foe) {
        state.spotted = null; // シーンが変わっていたら掃除するだけ
      } else {
        const dispName = foe.unknownName || foe.name;
        const w = foe.weakness;
        if (w && (w.triggers || []).some(t => text.includes(t))) {
          state.spotted = null;
          state.fled = state.fled || [];
          state.fled.push(foe.name);
          addNote(`⚔ ${w.text}`);
          addGm(`${w.text}。戦わずに済んだ。`, "Happy");
          logSceneEvent(`${dispName}を光で追い払った`);
          companionBattleEndLine("repelled");
          state.lastAction = { text: normalizedText, fingerprint: fp, hadCheck: false };
          renderDebug();
          return;
        }
        if (SCRIPTED_ATTACK_RE.test(text)) {
          state.spotted = null;
          engageEnemy(foe);
          addNote(`⚔ 先手:こちらから仕掛けた`);
          pushEncounterPopup();
          await tryCombatTurn(text);
          state.lastAction = { text: normalizedText, fingerprint: fp, hadCheck: true };
          if (state.hp <= 0) addNote(gameOverText());
          renderDebug();
          return;
        }
        if (MOVE_RE.test(text)) {
          // 気づかれないうちに静かに抜ける。再遭遇はさせない(ambushResolved済み+fled登録)
          state.spotted = null;
          state.fled = state.fled || [];
          state.fled.push(foe.name);
          addNote(`👣 ${dispName}に気づかれないまま、静かにやり過ごした`);
          logSceneEvent(`${dispName}をやり過ごした`);
          // returnしない: このまま通常の移動処理に流す
        }
        // 調査・会話など他の宣言は spotted のまま通常処理(敵は待っている)
      }
    }

    // 交戦中でないのに攻撃宣言をした場合: 隠れた敵がいるならLLMに委ねる(交戦開始しうる)が、
    // 敵がいない・退散済み・撃破済みなら決定論で返す(退散後の亡霊語りループ対策。2026-07-17(2) T15-18)
    if (!state.enemy && SCRIPTED_ATTACK_RE.test(text)) {
      const sc = SCENARIO.scenes[state.sceneIndex];
      const engageable = sc.enemy && !state.defeated.includes(sc.enemy.name) && !(state.fled || []).includes(sc.enemy.name);
      if (!engageable) {
        addGm("今は戦う相手がいない。");
        state.lastAction = { text: normalizedText, fingerprint: fp, hadCheck: false };
        renderDebug();
        return;
      }
    }

    // scripted解決(gmModeに応じて移動・調査・会話を決定論で処理)。処理できたらLLMを呼ばない
    if (await tryScripted(text)) {
      state.lastAction = { text: normalizedText, fingerprint: fp, hadCheck: true };
      renderDebug();
      return;
    }

    // 辞書に漏れた宣言はLLM分類器(穴埋め・列挙型)で意図と対象を読み取り、解決はシステムが行う
    // (BORG/TRPG/MockDocs/RULE_INVENTORY.md 意図分類表)。分類器が落ちたら従来のLLMルートへそのまま流す
    let gmDirectCue = "";
    const cls = confirmedTalkIntent(text) || await classifyIntent(text);
    if (cls) {
      const sc = SCENARIO.scenes[state.sceneIndex];
      const done = (hadCheck) => {
        state.lastAction = { text: normalizedText, fingerprint: fp, hadCheck };
        renderDebug();
      };
      // 聞き返しは take だけに使う。全intentへ広げると、行き先を名指しした移動(「左の坑道へ進む」)や
      // 報告シーンの会話(そこでは会話が本体)が聞き返しに乗っ取られて前へ進めなくなる。
      // 対象のないinvestigate(「金属音を聞く」「足元をよく見る」)は、情景の小物として
      // LLMが描写してよい領分なので従来どおり描写レーンへ流す(プロンプトの「情景の小物は自由に肉付けしてよい」)
      if (cls.extraSystem) gmDirectCue += cls.extraSystem;
      if (cls.intent === "investigate" && cls.target) {
        let hit = sc.secrets.find(s => s.entity === cls.target);
        // 分類器の対象幻覚ガード: 宣言が手持ちの道具に言及し、対象名/別名には触れていない場合は
        // 分類器のtargetを信用しない(「ロープを調べる」→作業札 のような誤紐付け対策)
        if (hit) {
          const mentionsTarget = text.includes(hit.entity) || (hit.aliases || []).some(a => text.includes(a));
          const mentionsItem = inv.held(state.inventory).some(i => text.includes(i));
          if (!mentionsTarget && mentionsItem) hit = null;
        }
        if (hit && revealed.has(hit.id)) {
          addGm("改めて確かめる。" + (hit.playerText || hit.text), "Neutral");
          done(false);
          return;
        }
        if (hit) { await scriptedExamine(hit, cls.actorName); done(true); return; }
        // secretのない対象の調査は描写レーン(下のLLM)へ
      } else if (cls.intent === "move") {
        scriptedMoveForward(text);
        done(false);
        return;
      } else if (cls.intent === "back") {
        addGm("今は戻らない。依頼がまだ残っている。", "Neutral");
        done(false);
        return;
      } else if (cls.intent === "take") {
        const unrevealedSecret = sc.secrets.find(s => s.entity === cls.target && !revealed.has(s.id));
        if (unrevealedSecret) {
          addGm("まだそれが何なのか分かっていない。まず確かめるべきだ。", "Neutral");
          done(false);
          return;
        }
        const allowed = availableLoot(sc);
        let item = allowed.find(i => text.includes(i) || (cls.target && (i === cls.target || i.includes(cls.target))));
        // 分類器の対象幻覚ガード(investigateと同様): 対象名が文中に一切現れず、既存の所持品への
        // 言及があるなら分類器のtargetを信用しない(「ロープを触る」→心石の欠片 のような誤紐付け対策)
        if (item && !text.includes(item) && inv.held(state.inventory).some(i => text.includes(i))) item = null;
        if (item && inv.give(state.inventory, item)) {
          logSceneEvent(`「${item}」を手に入れた`);
          addGm(`${item}を手に入れた。`, "Happy");
          done(false);
          return;
        }
        if (item) {
          addGm(`${item}はもう持っている。`, "Neutral");
          done(false);
          return;
        }
        // 手持ちの道具への言及(「ランタンをつける」等)は取得ではなく使用。LLM描写レーンに流す
        if (!inv.held(state.inventory).some(i => text.includes(i))) {
          // 拾おうとした物を認識できていないなら、嘘をつかずに聞き返す。
          // 「持ち出す価値のあるものではない」は、requires未達で門番されている品にも出てしまい事実と異なる
          // (2026-08-03のログT21: NPCが「拾ってくれ」と言った品をこの文で拒否した)。
          // ただしcls.targetが既に解決している(=対象は分かっている。ただ取得可能な品ではない)なら
          // 聞き返してはならない——それは「分からない」の嘘になる(2026-08-03の別ログT27で実際に出た。
          // 「古い木を剥がす」→分類器は「封鎖の木柵」と正しく解決していたのに「古い木が何か分からない」と聞き返した)
          if (!cls.target && cls.named) { askBackUnknownTarget(cls.named, sc, previousAskedBack); done(false); return; }
          addGm("持ち出す価値のあるものではないようだ。", "Neutral");
          done(false);
          return;
        }
      } else if (cls.intent === "talk_gm") {
        // GM(既定名はダイス先輩)への直接の話しかけ。人格で応えるが、状態は一切変更しない(state_updatesは下の共通ガードが遮断)
        gmDirectCue = `\n# GMへの直接の発言\nプレイヤーは物語の登場人物ではなく、GM(${GM.name})のあなたに話しかけている。${GM.name}自身として短く応えよ(${GM.persona})。${gmVoiceRule()}ルールや状態の変更を求められたら meta_request を使い、実行はしない。物語の未開示情報は明かさない。`;
      }
      // talk / other / 対象不明のinvestigate → 従来のLLMレーン(語りと会話の領分)
    }

    await turnFreeform(text, {
      cls, gmDirectCue, banterCue, stagnationCue, injuryCue,
      addressed, nudgeActive, concernActive, itemsBefore,
      progressed: false, normalizedText, fp
    });
  } catch (e) {
    addNote("通信エラー: " + e.message);
  } finally {
    // 戦闘ターンの後始末: このターンで戦闘演出のためにパネルを閉じていたら(戦闘開始・戦闘中の宣言)、
    // 解決が終わった今、下パネルだけ再度開いて次の入力を促す
    if (state.justEngaged) {
      state.justEngaged = false;
      setStore({ underPanelOpen: true });
    }
    // 「考え中」の掃除(通信エラー等で消し漏れた分)。NPC分は非同期のnpcAgentReplyが
    // ターン終了後も生成中のことがあるため、ここでは消さない(あちらのfinallyが消す)
    setStore(s => ({ thinking: s.thinking.npc ? { npc: true } : {} }));
    busy = false;
    setStore({ busy: false });
  }
}

// パネル開閉ルール: 3パネルとも独立に開閉できる(旧: 下パネルは左右と排他。
// Figma新レイアウトでは左右パネルの下端が下パネルの上端に揃い共存できるため撤廃)
export function toggleLeftPanel() {
  setStore(s => ({ leftPanelOpen: !s.leftPanelOpen }));
}
export function toggleRightPanel() {
  setStore(s => ({ rightPanelOpen: !s.rightPanelOpen }));
}
export function toggleUnderPanel() {
  // 下パネルを閉じる時は、開いている左右パネルも道連れで閉じる(下パネルタブ・
  // 下スワイプのどちらの経路でも同じ。左右パネル側の開閉に下パネルは連動させない)
  setStore(s => s.underPanelOpen
    ? { underPanelOpen: false, leftPanelOpen: false, rightPanelOpen: false }
    : { underPanelOpen: true });
}
