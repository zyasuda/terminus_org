import { normalizeInventory, held } from "./inventory.js";

export const STAGNATION_SOFT = 3;
export const STAGNATION_STRONG = 6;

export function initialState() {
  return { hp: 10, maxHp: 10,
           /* 所持品の正本。キャラクター別に持つ。平坦な一覧は inventory.js の held() で取る。
              旧セーブ（items が文字列配列）は normalizeInventory() が読み替える */
           inventory: normalizeInventory({ items: ["ランタン", "ロープ", "ナイフ"] }),
           sceneIndex: 0, turn: 0,
           enemy: null, defeated: [], lastCompanionTurnByWho: {},
           banterCharge: {},
           pendingRetort: null,
           tokens: { in: 0, out: 0, calls: 0 },
           lastAction: null,
           noProgressTurns: 0,
           pendingInjuryConcern: false,
           pendingFailedCheck: null,
           unknownTarget: { lastTurnAskedBack: false, candidates: [] }, // 直前の聞き返しと、入力チップへ出す安全な候補
           pendingRollOutcome: null, // "critical"|"fumble"。判定リアクション(style.rollReaction)を1手番だけ効かせる
           ambushResolved: [],
           spotted: null, // 奇襲察知に成功して「発見済み・未交戦」の敵名。次の宣言で仕掛ける/追い払う/やり過ごすを選ぶ
           fled: [], // 退散・逃走で戦闘を終えた敵名。再出現させない(「潜む敵」プロンプトからも除外)
           examined: [], // 一度でも判定を振った調査対象のentity名。開示前でも名詞チップに出す(2タップで再挑戦できるように)
           sceneLog: [], // {scene, turn, text}[] 各シーンで確定した出来事の記録。プロンプトに「これまでの経緯」として常時注入する長期記憶
           flags: {}, // プレイヤーの選択で確定したフラグ(scenes[].stateUpdatesのflag_set由来。例: heartstone_choice)
           flagsFired: [], // 発火済みのstateUpdates識別子("シーン番号:配列index")。onceの重複発火を防ぐ
           pendingIntro: false, // 導入ノード(intro)がオブジェクト形式の間、exits[]解決待ちであることを示す
           pendingEnding: false, // 終端ノード(ending)がオブジェクト形式の間、exits[]解決待ちであることを示す
           pendingCompanionConsents: null, // 導入受諾後の同行者ごとの応答待ち { who, response }[]
           pendingIntroTarget: null, // 同行者全員の応答後に進むintro.exitの行き先
           encounterCounts: {} // 発生済みエンカウント回数 {encounterId: count}。maxOccurrencesの上限判定に使う
         };
}

export function takeStagnationCue(state) {
  const n = state.noProgressTurns;
  if (n >= STAGNATION_STRONG) {
    return `\n# 停滞への対応(強・任意)\nプレイヤーは目立った前進のないまま${n}手番が過ぎている。同行者の一言(companion)で、次の具体的な一手をそれとなく示唆せよ(答えを断定するのではなく、視点を変える程度)。加えて、地の文で世界の側からささやかな圧力を加えてもよい(例:灯りの油の残りに触れる、物音が変化する、時間の経過を匂わせる)。新しい謎・通路・人物を捏造してはならない——既にある要素の描写を濃くするだけに留めよ。`;
  }
  if (n >= STAGNATION_SOFT) {
    return `\n# 停滞への対応(軽・任意)\nプレイヤーは目立った前進のないまま${n}手番が過ぎている。プレイヤーが迷っている可能性がある。同行者の一言(companion)で、状況を短く整理するか、依頼の目的をさりげなく思い出させよ。`;
  }
  return "";
}

/* 判定リアクション。作者がcampaign.style.rollReactionへ書いた「クリティカル/ファンブルに
   GMがどう反応するか」を、その手番だけプロンプト末尾へ足す。未設定なら何も足さない(現行の挙動)。
   takeStagnationCue/takeInjuryCueと同じ「一度だけ効かせて落とす」作法に揃えてある。
   プロンプト前半(styleBlock)へ入れてはならない——手番ごとに変わるのでKVキャッシュを壊す */
export function takeRollReactionCue(state, style) {
  const outcome = state.pendingRollOutcome;
  if (!outcome) return "";
  state.pendingRollOutcome = null;
  const note = ((style || {}).rollReaction || {})[outcome] || "";
  if (!note) return "";
  const label = outcome === "critical" ? "出目20(クリティカル)" : "出目1(ファンブル)";
  return `\n# 判定への反応(この手番のみ)\n直前の判定は${label}である。次の方針でGMとして反応せよ(判定の成否そのものはシステムが伝えるので、結果の数値を繰り返す必要はない)。\n${note}`;
}

export function takeInjuryCue(state) {
  if (!state.pendingInjuryConcern) return "";
  state.pendingInjuryConcern = false;
  return `\n# 気遣いの機会(この手番のみ・任意)\nプレイヤーは直前のターンで負傷した。同行者の誰か(companion)が、短く様子を尋ねるか気遣ってよい。深刻すぎる怪我でなければ軽口でもよい。場面が急を要し、気遣う余裕がないなら無理に入れず companion は null でよい。`;
}

export function stateFingerprint({ SCENARIO, state, revealed }) {
  const sc = SCENARIO.scenes[state.sceneIndex];
  const revealedInScene = sc.secrets.filter(s => revealed.has(s.id)).map(s => s.id).sort();
  return JSON.stringify({
    scene: state.sceneIndex,
    hp: state.hp,
    items: held(state.inventory).sort(),
    enemy: state.enemy ? { name: state.enemy.name, hp: state.enemy.hp } : null,
    revealed: revealedInScene
  });
}
