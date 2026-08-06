import { GM } from "../scenario.js";

export function genderToneRule(gender) {
  if (gender === "male") return " 「〜わ」「〜のよ」「〜かしら」「〜ね」等の女性的な語尾は使わない。";
  if (gender === "female") return " 「〜だぜ」「〜だろ」等の乱暴な男性的語尾は使わない。";
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
