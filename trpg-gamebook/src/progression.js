import * as inv from "./inventory.js";

/* EXAMINE_REは「調べる」系の汎用動詞の辞書。index.jsのtryScriptedと、テストの検査16が
   同じ判定を共有するためここに置く(複製すると本体とテストがずれる)
   語幹で照合するので活用は書かない(「調べ」が調べる/調べた/調べて/調べようを拾う)。
   「触」は触る/触れる/触った/触れてみるを1語でまとめている——作者がsecret.triggerへ
   「木柵に触れてみる」と書いているのに、動詞辞書側が触れる系を持っておらず
   「柵を触る」がLLM分類器送りになっていた(実プレイの宣言5件が該当)。
   語を足す時は npm run test:dictlane で実プレイ545種のレーン変化を確認する */
export const EXAMINE_RE = /調べ|よく見|見る|見て|読|観察|探|嗅|眺め|確かめ|触/;

// 何手番ごとに敵が一段近づくか。実プレイ後に調整する前提の値。
// ponytail: 定数2つ。作者ごとに変えたくなったら章JSONへ出す
export const APPROACH_TURNS = 3;
export const APPROACH_MAX = 3;

/* シーンへ入ってから(または前の遭遇を終えてから)時間をかけるほど、次の遭遇の
   初撃が重くなる。「安全に全部調べる」が無料でなくなることが狙い(BORG §4.2)。
   基準点(sceneEnteredTurn)は交戦のたびに巻き戻す——さもないと、同じシーンに
   複数の遭遇があるとき、2つ目以降が「シーン全体で使った手番」を引き継いで
   毎回ほぼ最大値の初撃を受け、被弾が積み重なる(2026-08-12実測: HP10の
   通しテストが2遭遇目で0まで落ちた)。時間の代償は遭遇ごとに1回だけ払う */
export function approachLevel(turn, sceneEnteredTurn) {
  const spent = Math.max(0, turn - sceneEnteredTurn);
  return Math.min(APPROACH_MAX, Math.floor(spent / APPROACH_TURNS));
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

// 候補表示と実際の遭遇判定で、発火可能な遭遇の条件を共用する。
export function availableEncounters(sc, ctx) {
  return (sc.encounters || []).flatMap(enc => {
    const foe = resolveEncounterFoe(enc, sc);
    if (!foe) return [];
    if ((ctx.defeated || []).includes(foe.name) || (ctx.fled || []).includes(foe.name)) return [];
    if ((enc.blockedBy || []).some(name => (ctx.defeated || []).includes(name) || (ctx.fled || []).includes(name))) return [];
    const count = (ctx.encounterCounts || {})[enc.id] || 0;
    if (enc.maxOccurrences != null && count >= enc.maxOccurrences) return [];
    if (!encounterRequiredElementsMet(enc, sc, ctx)) return [];
    return [{ enc, foe }];
  });
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

// GM候補は既存の秘密・出口から導出する。候補ボタンも自由入力も、同じinputを既存の
// 決定論的な解決経路へ渡すため、ここでは状態を変更しない。
export function actionCandidates(sc, ctx, labelOverrides = {}) {
  const secretCandidates = (sc.secrets || [])
    .filter(s => !ctx.revealed.has(s.id) && (s.trigger || (s.aliases || []).length))
    .map(s => ({
      id: `secret:${s.id}`,
      label: labelOverrides[`secret:${s.id}`] || `${s.entity}を調べる`,
      input: `${s.entity}を調べる`
    }));
  const exitCandidates = (sc.exits || [])
    .filter(e => e.to !== null && e.to !== undefined && requiresMet(e.requires, ctx))
    .map(e => {
      const destination = (e.match || [])[0] || "先";
      return {
        id: `exit:${e.id}`,
        label: labelOverrides[`exit:${e.id}`] || `${destination}へ進む`,
        input: `${destination}へ進む`
      };
    });
  const enemyCandidates = ctx.enemy ? [
    { id: "combat:attack", label: labelOverrides["combat:attack"] || `${ctx.enemy.name}を攻撃する`, input: "攻撃する" },
    { id: "combat:defend", label: labelOverrides["combat:defend"] || "防御する", input: "防御する" },
    { id: "combat:flee", label: labelOverrides["combat:flee"] || "逃げる", input: "逃げる" }
  ] : [];
  const encounterCandidates = availableEncounters(sc, ctx).map(({ enc, foe }) => {
    const input = (enc.triggerTerms || [])[0] || `${foe.unknownName || foe.name}に近づく`;
    return {
      id: `encounter:${enc.id}`,
      label: labelOverrides[`encounter:${enc.id}`] || input,
      input
    };
  });
  // 調査で場を理解してから、交戦・遭遇・出口の順に進める。3件を超えた分は出さない。
  return [...secretCandidates, ...enemyCandidates, ...encounterCandidates, ...exitCandidates].slice(0, 3);
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

/* 決断イベント(scene.decision)のchoices[].inputが、既存の確定処理(遭遇/調査/出口)の
   どれかへ解決できるかを見る。作者がinputを打ち間違えると、chooseDecisionは選択を
   自由入力として送るだけなので、何にも解決できずに黙って何も起きない
   (候補外の未知入力と同じ扱いになる)。これを作者に気付かせるための検査専用ヘルパー */
export function decisionInputResolves(sc, text) {
  const ctx = { revealed: new Set(), inventory: [], enemy: null, defeated: [], fled: [], encounterCounts: {} };
  if (availableEncounters(sc, ctx).some(({ enc }) => (enc.triggerTerms || []).some(t => text.includes(t)))) return true;
  if (pickExamineSecret(sc, text, text, ctx).secret) return true;
  return Boolean(resolveExit(sc, text));
}
