export const STAGNATION_SOFT = 3;
export const STAGNATION_STRONG = 6;

export function initialState() {
  return { hp: 10, maxHp: 10, items: ["ランタン", "ロープ", "ナイフ"], sceneIndex: 0, turn: 0,
           enemy: null, defeated: [], lastCompanionTurn: -9,
           banterCharge: {},
           pendingRetort: null,
           tokens: { in: 0, out: 0, calls: 0 },
           lastAction: null,
           noProgressTurns: 0,
           pendingInjuryConcern: false,
           pendingFailedCheck: null,
           ambushResolved: [],
           spotted: null, // 奇襲察知に成功して「発見済み・未交戦」の敵名。次の宣言で仕掛ける/追い払う/やり過ごすを選ぶ
           fled: [], // 退散・逃走で戦闘を終えた敵名。再出現させない(「潜む敵」プロンプトからも除外)
           examined: [], // 一度でも判定を振った調査対象のentity名。開示前でも名詞チップに出す(2タップで再挑戦できるように)
           sceneLog: [], // {scene, text}[] 各シーンで確定した出来事の記録。プロンプトに「これまでの経緯」として常時注入する長期記憶
           flags: {}, // プレイヤーの選択で確定したフラグ(scenes[].stateUpdatesのflag_set由来。例: heartstone_choice)
           flagsFired: [], // 発火済みのstateUpdates識別子("シーン番号:配列index")。onceの重複発火を防ぐ
           pendingIntro: false, // 導入ノード(intro)がオブジェクト形式の間、exits[]解決待ちであることを示す
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
    items: [...state.items].sort(),
    enemy: state.enemy ? { name: state.enemy.name, hp: state.enemy.hp } : null,
    revealed: revealedInScene
  });
}
