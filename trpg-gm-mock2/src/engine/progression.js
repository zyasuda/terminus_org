import * as inv from "../inventory.js";

// EXAMINE_REは「調べる」系の汎用動詞の辞書。index.jsのtryScriptedと、テストの検査16が
// 同じ判定を共有するためここに置く(複製すると本体とテストがずれる)
export const EXAMINE_RE = /調べ|よく見|見る|見て|読|観察|探|嗅|眺め|確かめ/;

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
  const pool = (sc.secrets || []).filter(s => !ctx.revealed.has(s.id));
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

// 宣言文とexits[].matchの部分一致で出口を選ぶ。配列の先頭から順に評価し、最初に一致したものを採用
export function resolveExit(sc, text) {
  return normalizeExit((sc.exits || []).find(e => (e.match || []).some(m => text.includes(m))) || null);
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
