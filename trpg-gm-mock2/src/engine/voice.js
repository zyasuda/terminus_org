import { GM } from "../scenario.js";

/* 語尾の規則。禁止形だけを並べた旧版は、ローカルSLM(gemma4:e4b)が守り切れなかった。
   2026-08-07に実プレイのログ(logs/llm.jsonl)から女性キャラの台詞52件を数えたところ
   13件(25%)が男性的語尾だった。実ログのsystemプロンプトをそのまま再生するA/Bで、
   「使うべき語尾」を先に示す肯定形へ変えると 10/21件 → 3/21件 に減ることを確認した。
   男性側は実ログで 2/11件 と低く、変更しても測っていないので旧文面のままにしている */
export function genderToneRule(gender) {
  if (gender === "male") return " 「〜わ」「〜のよ」「〜かしら」「〜ね」等の女性的な語尾は使わない。";
  if (gender === "female") return " 女性の話し方をする。文末は「〜ね」「〜わ」「〜のよ」「〜かしら」「〜だわ」等の女性的な語尾か、丁寧な言い切りにせよ。「〜だぜ」「〜だろ」「〜だぞ」「〜だな」「〜からな」「〜ぜ」「〜ぞ」等の男性的・乱暴な語尾は使ってはならない。";
  return "";
}

export function firstPersonRule(c) {
  if (c.firstPerson) return ` 一人称は「${c.firstPerson}」で統一せよ。`;
  if (c.gender === "male") return " 一人称は男性的なもの(俺・僕等)。";
  if (c.gender === "female") return " 一人称は女性的なもの(私・あたし等)。";
  return "";
}

export function addressTermRule(c) {
  return c.addressTerm ? ` プレイヤーを二人称で呼ぶ時は「${c.addressTerm}」で統一せよ(名前で呼ぶ場面ではそちらでもよい)。` : "";
}

export function voiceRule(c) {
  return firstPersonRule(c) + genderToneRule(c.gender) + addressTermRule(c);
}

export function gmVoiceRule() {
  const voice = voiceRule(GM);
  if (!voice && !GM.speechRules) return "";
  const scope = (GM.firstPerson || GM.addressTerm)
    ? " これらはプレイヤーへ直接語りかける時だけ使う。情景を語る地の文では使わない。"
    : "";
  return voice + scope + (GM.speechRules ? ` ${GM.speechRules}` : "");
}

export function gmGreeting() {
  return GM.isDefaultName
    ? "今回のGMを担当するダイス先輩です。よろしくぅ"
    : `今回のGMを担当する${GM.name}だ。よろしく`;
}
