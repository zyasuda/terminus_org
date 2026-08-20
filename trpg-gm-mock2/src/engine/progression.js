import * as inv from "../inventory.js";

/* EXAMINE_REは「調べる」系の汎用動詞の辞書。index.jsのtryScriptedと、テストの検査16が
   同じ判定を共有するためここに置く(複製すると本体とテストがずれる)
   語幹で照合するので活用は書かない(「調べ」が調べる/調べた/調べて/調べようを拾う)。
   「触」は触る/触れる/触った/触れてみるを1語でまとめている——作者がsecret.triggerへ
   「木柵に触れてみる」と書いているのに、動詞辞書側が触れる系を持っておらず
   「柵を触る」がLLM分類器送りになっていた(実プレイの宣言5件が該当)。
   語を足す時は npm run test:dictlane で実プレイ545種のレーン変化を確認する */
export const EXAMINE_RE = /調べ|よく見|見る|見て|読|観察|探|嗅|眺め|確かめ|触/;

/* 移動・引き返しの動詞辞書。index.jsのtryScriptedがレーンを選ぶのに使い、下の
   exitDeclaration が「この語が既に入っているか」を見るのに使う。両者が別の辞書を
   持つと、画面が出す文が移動レーンに入らない事故が起きるため、ここに1つだけ置く。
   語幹で照合するので活用は書かない。語を増やす時は dictLane.test.mjs のゴールデンを
   必ず確認する——MOVE_REは一致するとscriptedMoveForwardがシーンを進めるため、
   機械的に語を足すと意図しない遷移が起きる */
export const MOVE_RE = /進む|進も|向かう|向かお|入る|入ろ|行く|行こ|降り|登る|渡る/;
export const BACK_RE = /戻る|戻ろ|引き返|退く/;

/* その出口へ行くための宣言文を、作者が書いた照合語から組み立てる。
 *
 * なぜ必要か: mock2の移動は2つの関門を続けて通る。
 *   (1) MOVE_RE / BACK_RE に一致して移動レーンへ入る
 *   (2) resolveExit(部分一致)で出口が決まる
 * 画面のチップは「名詞」+「動詞」を組み立てるため、(1)は通っても(2)を外しうる。
 * 2026-08-20の実プレイで、チップが作った「奥に進む」が作者の「奥へ進む」に
 * 一致せず、シーン6から先へ進めなくなった(助詞1文字)。
 * ここで作った文は、必ず照合語を含み、必ず移動の動詞を含む。画面・エンジンの
 * 聞き返し・通しプレイ検査の3者が同じ文を使うことで、「画面が出せない操作を
 * 作者が書ける」状態をなくす。回帰検査: moveChip.test.mjs
 */
export function exitDeclaration(exit) {
  const word = ((exit && exit.match) || []).find(Boolean) || "";
  if (!word) return "";
  if (MOVE_RE.test(word) || BACK_RE.test(word)) return word; // 「奥へ進む」「戻る」はそのままで通る
  return /[へにをのと]$/.test(word) ? `${word}進む` : `${word}へ進む`;
}

// TASの「エンカウンター設定」用の、開示済み要素の判定。
export function encounterRequiredElementsMet(enc, sc, ctx) {
  const need = enc.requiredElements || [];
  if (!need.length) return true;
  const revealedLabels = sc.secrets.filter(s => ctx.revealed.has(s.id)).flatMap(s => [s.entity, ...(s.aliases || [])]);
  const hit = label => revealedLabels.includes(label);
  return enc.requiredOperator === "any" ? need.some(hit) : need.every(hit);
}

// enc.enemy優先、無ければsc.enemyへフォールバックし、名前の不一致は「解決できない」として返す。
export function resolveEncounterFoe(enc, sc) {
  const foe = enc.enemy && enc.enemy.name ? enc.enemy : sc.enemy;
  if (!foe) return null;
  if (enc.monsterName && enc.monsterName !== foe.name) return null;
  return foe;
}

/* テキストとsecretのentity/aliasesの照合(開示済み/未開示を指定)。複数ヒットは曖昧なのでnull。
   minTermLength: これより短い語での一致を無視する。作者が明示したaliasesは「光」「石」等の
   1文字も有効にしているが、1文字は当たりやすく、作者が書いたtriggerの一文に勝ってしまう */
export function uniqueBestSecretTextMatch(candidates, text, minTermLength = 1) {
  let bestLength = 0;
  let hits = [];
  candidates.forEach(s => {
    const terms = [...s.entity.split(/[・()()]/).filter(t => t.length >= 2), ...(s.aliases || [])]
      .filter(t => t && t.length >= minTermLength);
    const length = Math.max(0, ...terms.filter(t => text.includes(t)).map(t => t.length));
    if (length > bestLength) { bestLength = length; hits = [s]; }
    else if (length && length === bestLength) hits.push(s);
  });
  return hits.length === 1 ? hits[0] : null;
}

export function matchSecretByText(sc, text, wantRevealed, minTermLength, ctx) {
  const pool = sc.secrets.filter(s => ctx.revealed.has(s.id) === wantRevealed);
  return uniqueBestSecretTextMatch(pool, text, minTermLength);
}

// 作者がsecret.triggerへ書いた発火条件との照合。複数の秘密が該当したら曖昧なので決めない。
export function matchSecretByTrigger(sc, text, ctx) {
  const hits = (sc.secrets || []).filter(s => {
    if (ctx.revealed.has(s.id) || !s.trigger) return false;
    return String(s.trigger).split(/[,、]/)
      .map(t => t.trim().replace(/[。.]$/, ""))
      .filter(t => t.length >= 2)
      .some(t => text.includes(t));
  });
  return hits.length === 1 ? hits[0] : null;
}

/* 調べる宣言に対して、どの秘密を対象にするかを1箇所で決める。
   対象の特定はentity/aliasesを優先する。ただし1文字の別名一致は例外で、
   作者が明示したtriggerに劣後させる。 */
export function pickExamineSecret(sc, triggerText, entityText, ctx) {
  const triggerHit = matchSecretByTrigger(sc, triggerText, ctx);
  // trigger・aliasesを両方持たない秘密は「調べる」では絶対に開かない(revealOnDefeat等、
  // 別の決定論的な経路だけが開示手段だという作者の意図をここで守る。entityだけを持たせて
  // いるのはチップ・reveal表示用の名称であって、examineの入口にはしない)
  const pool = (sc.secrets || []).filter(s =>
    !ctx.revealed.has(s.id) && (s.trigger || (s.aliases || []).length));
  const textHit = uniqueBestSecretTextMatch(pool, entityText, triggerHit ? 2 : 1);
  return { secret: textHit || triggerHit, triggerHit, textHit };
}

export function examineDifficulty(secret, failures = 0) {
  const base = secret.dc || 12;
  return Math.max(2, base - 2 * Math.max(0, failures));
}

// requires: completeRequiresと同じ語彙(secretsAny/secretsAll)をexits単位でも使う
export function requiresMet(requires, ctx) {
  if (!requires) return true;
  if (requires.secretsAny && !requires.secretsAny.some(id => ctx.revealed.has(id))) return false;
  if (requires.secretsAll && !requires.secretsAll.every(id => ctx.revealed.has(id))) return false;
  if (requires.itemsAny && !requires.itemsAny.some(n => inv.has(ctx.inventory, n))) return false;
  if (requires.itemsAll && !requires.itemsAll.every(n => inv.has(ctx.inventory, n))) return false;
  return true;
}

// TASの出力は到達時説明を exit.text として出すため、mock2の契約(arrivalText)へ正規化する。
export function normalizeExit(exit) {
  if (exit && !exit.arrivalText && exit.text) exit.arrivalText = exit.text;
  return exit;
}

/* 照合の前に助詞「に」「へ」を1つに寄せる。移動チップ(exitDeclaration)で画面からは
   必ず通るようにしたが、音声入力や手打ちでは「奥に進む」「奥へ進む」の揺れが残る。
   作者が両方を書き並べなくても、どちらでも通るようにする保険(2026-08-20)。
   寄せるのは移動の助詞2つだけ。「を」「が」まで潰すと別の対象に誤って一致しうる */
const normalizeParticles = t => String(t == null ? "" : t).replace(/[にへ]/g, "へ");

// 宣言文とexits[].matchの部分一致で出口を選ぶ。配列の先頭から順に評価し、最初に一致したものを採用
export function resolveExit(sc, text) {
  const hay = normalizeParticles(text);
  return normalizeExit((sc.exits || [])
    .find(e => (e.match || []).some(m => hay.includes(normalizeParticles(m)))) || null);
}

// TASの移動先表記("scene:1"、数値、文字列id)をシーン配列のindexに解決する。
export function exitTargetIndexIn(scenes, to) {
  const key = String(to).replace(/^scene:/, "");
  return scenes.findIndex(s => String(s.id) === key);
}

/* 開示対象のマッチング。0件・複数件なら開示しない。 */
export function resolveSecretTarget(sc, targetEntity, reason, playerText, ctx) {
  const candidates = (sc.secrets || []).filter(s => !ctx.revealed.has(s.id));
  if (!candidates.length) return null;
  if (targetEntity) {
    const exact = candidates.filter(s => s.entity === String(targetEntity).trim());
    if (exact.length === 1) return exact[0];
  }
  const hay = [targetEntity, reason, playerText].filter(Boolean).join(" ");
  const authored = playerText ? matchSecretByTrigger(sc, playerText, ctx) : null;
  const byText = uniqueBestSecretTextMatch(candidates, hay, authored ? 2 : 1);
  return byText || authored;
}
