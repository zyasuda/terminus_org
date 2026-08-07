import { GM, CAST } from "../scenario.js";

export function genderToneRule(gender) {
  if (gender === "male") return " 「〜わ」「〜のよ」「〜かしら」「〜ね」等の女性的な語尾は使わない。";
  if (gender === "female") return " 「〜だぜ」「〜だろ」等の乱暴な男性的語尾は使わない。";
  return "";
}

/* 語尾の後始末。プロンプトで禁止しても、ローカルSLM(gemma4:e4b)は女性キャラに
   「〜だぜ」「〜だぞ」を喋らせてくる。2026-08-07の実プレイのログ(logs/llm.jsonl)では
   リディアの台詞74件中20件(27%)が男性的語尾だった。プロンプト側を肯定形に書き換える案も
   測ったが(違反 10/21→3/21)、代わりに「進みましょうわ」のような不自然な付け足しが増えたため
   採らず、生成後にこちらで直す方式にした。同じログで 20件→1件、書き換えは24件。

   文末(。！？で区切った各文の末尾)だけを見る。文の途中は触らない。
   男性キャラに当てると「最後の手段だぞ」→「最後の手段だわよ」と壊すので、genderで門番する。 */
const FEMALE_HEADS = [[/^おい[、！]?/, "ちょっと、"], [/^おお[、！]?/, "あら、"], [/^やめとけ(?=[。！])/, "やめておきなさい"]];
const FEMALE_ENDINGS = [
  [/^待て$/, "待って"], [/^やめとけ$/, "やめておきなさい"],
  [/べきだぜ$/, "べきね"], [/べきだぞ$/, "べきよ"], [/べきだ$/, "べきね"],
  [/かもしれんぞ$/, "かもしれないわよ"], [/かもしれないぞ$/, "かもしれないわよ"],
  [/ないぞ$/, "ないわよ"],
  [/だろう$/, "でしょう"], [/だろ$/, "でしょう"],
  [/だぜ$/, "だわ"], [/(.)ぜ$/, "$1わ"],
  [/だぞ$/, "だわよ"], [/(.)ぞ$/, "$1わよ"],
  [/からな$/, "からね"], [/ようだな$/, "ようね"],
  [/(.)だな$/, "$1ね"], [/(.)たな$/, "$1たわね"], [/(.)いな$/, "$1いわね"],
  [/(.)のか$/, "$1のかしら"]
];
export function toFemaleVoice(text) {
  let t = String(text || "");
  for (const [re, to] of FEMALE_HEADS) t = t.replace(re, to);
  return t.replace(/[^。！？]+/g, seg => {
    for (const [re, to] of FEMALE_ENDINGS) { const next = seg.replace(re, to); if (next !== seg) return next; }
    return seg;
  });
}
/* LLMが生成した同行者の台詞にだけ掛ける。章データや既定文(battleMutters等)は
   作者・既定値の責任なので通さない(「油断するなよ」を壊さないため) */
export function fixCompanionVoice(text, who) {
  return CAST && CAST[who] && CAST[who].gender === "female" ? toFemaleVoice(text) : text;
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
