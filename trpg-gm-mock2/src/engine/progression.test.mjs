/* シナリオの「核」5項目だけを対象にした進行の検証ハーネス。
 *
 * 核 = exits[].match / exits[].to / exits[].requires / secrets[].id / completeRequires
 * (2026-08-03の実測。これ以外の項目は進行の可否に関与しない=BORGの分類表を参照)
 *
 * LLMは呼ばない。判定はすべて決定的で、実物の関数(resolveExit / requiresMet /
 * exitTargetIndexIn)をそのまま使う。ロジックを複製すると本体とテストがずれるため。
 *
 * 使い方: npm run test:progression
 */
import fs from "node:fs";
import { resolveExit, requiresMet, exitTargetIndexIn, uniqueBestSecretTextMatch,
  encounterRequiredElementsMet, resolveEncounterFoe, pickExamineSecret, resolveSecretTarget,
  examineDifficulty } from "./index.js";

/* CHAPTER=別の章.json で対象を差し替えられる。故意に壊したデータを通して
   「このハーネスが本当に落ちるか」を確かめるためにも使う */
const chapter = JSON.parse(fs.readFileSync(process.env.CHAPTER
  || new URL("../../public/data/campaigns/lanternhill/chapter_01.json", import.meta.url)));
const scenes = chapter.scenes;
/* intro / ending は scenes 配列の外にあり、それぞれ独自の exits を持つ(null運用)。
   endingの出口は品物を要求することがあり(章の完了条件)、ここを見落とすと
   「章が終われない」不具合を検査が素通りする。出口を持つノードとして同列に扱う */
const exitNodes = [
  ...(chapter.intro && typeof chapter.intro === "object" ? [{ label: "イントロ", node: chapter.intro }] : []),
  ...scenes.map(s => ({ label: `シーン${s.id}`, node: s })),
  ...(chapter.ending && typeof chapter.ending === "object" ? [{ label: "アウトロ", node: chapter.ending }] : [])
];

let failed = 0;
const results = [];
function ok(cond, label, detail) {
  results.push(`  ${cond ? "ok " : "NG "} ${label}${cond || !detail ? "" : `\n        ${detail}`}`);
  if (!cond) failed++;
}
function section(title) { results.push(`\n── ${title}`); }

/* すべての開示条件を満たした「全知」の状態。到達可能性の上限を見るために使う */
const allSecretIds = new Set(scenes.flatMap(s => (s.secrets || []).map(x => x.id)));
const omniscient = { revealed: allSecretIds, inventory: [] };

// ───────────────────────────────────────────────
section("1. 開示条件の参照先が存在する（typoは恒久的な進行不能になる）");
// ───────────────────────────────────────────────
const refs = [];
const itemRefs = [];
exitNodes.forEach(({ label, node }) => {
  const push = (ids, where) => (ids || []).forEach(id => refs.push({ id, where: `${label} ${where}` }));
  (node.exits || []).forEach(e => {
    push(e.requires?.secretsAll, `出口${e.id} requires.secretsAll`);
    push(e.requires?.secretsAny, `出口${e.id} requires.secretsAny`);
    [...(e.requires?.itemsAll || []), ...(e.requires?.itemsAny || [])]
      .forEach(name => itemRefs.push({ name, where: `${label} 出口${e.id}` }));
  });
  push(node.completeRequires?.secretsAny, "completeRequires.secretsAny");
  push(node.completeRequires?.secretsAll, "completeRequires.secretsAll");
});
for (const r of refs) {
  ok(allSecretIds.has(r.id), `${r.where} が参照する ${r.id} が定義されている`,
    `章内のどのシーンにも ${r.id} が無い。この出口は永久に開かない`);
}
ok(refs.length > 0, "開示条件の参照が1件以上ある（検査が空振りしていない）");

// ───────────────────────────────────────────────
section("2. 出口の移動先が実在するシーンを指している");
// ───────────────────────────────────────────────
for (const { label, node } of exitNodes) {
  for (const e of node.exits || []) {
    if (e.to === null || e.to === undefined) continue; // 行き止まりは意図的
    if (e.to === "end") continue; // 章の完了。シーンを指さない正当な行き先
    const idx = exitTargetIndexIn(scenes, e.to);
    ok(idx >= 0, `${label} 出口${e.id} の移動先 ${e.to} が実在する`,
      `該当するidのシーンが無い。移動しようとした瞬間に詰む`);
  }
}

// ───────────────────────────────────────────────
section("3. 全知の状態なら最終シーンへ到達できる");
// ───────────────────────────────────────────────
/* 出口を辿って到達できるシーンを集める。exitsを持たないシーンは
   completeRequires を満たせば配列の次へ進む(engine側のadvanceSceneの既定動作) */
const reached = new Set([0]);
const queue = [0];
while (queue.length) {
  const i = queue.shift();
  const s = scenes[i];
  const exits = (s.exits || []).filter(e => e.to !== null && e.to !== undefined);
  const nexts = [];
  if (exits.length) {
    for (const e of exits) {
      if (!requiresMet(e.requires, omniscient)) continue;
      const t = exitTargetIndexIn(scenes, e.to);
      if (t >= 0) nexts.push(t);
    }
  } else if (requiresMet(s.completeRequires && { secretsAny: s.completeRequires.secretsAny, secretsAll: s.completeRequires.secretsAll }, omniscient)) {
    if (i + 1 < scenes.length) nexts.push(i + 1);
  }
  for (const t of nexts) if (!reached.has(t)) { reached.add(t); queue.push(t); }
}
const unreachable = scenes.map((s, i) => ({ s, i })).filter(x => !reached.has(x.i));
ok(reached.has(scenes.length - 1),
  `最終シーン(${scenes[scenes.length - 1].name})へ到達できる`,
  `到達できたのは ${[...reached].map(i => scenes[i].name).join(" → ")} まで`);
ok(unreachable.length === 0, "到達できないシーンが無い",
  `到達不能: ${unreachable.map(x => `シーン${x.s.id} ${x.s.name}`).join(", ")}`);

// ───────────────────────────────────────────────
section("4. トリガー語句が想定の言い回しを拾える");
// ───────────────────────────────────────────────
/* [シーンid, 宣言文, 期待する出口id(nullは不一致)]。
   実プレイで詰まった言い回しが見つかったらここへ足す。それが回帰テストになる。
   注意: このケース集は対象データの照合語に依存する。作者が照合語を変えたらここも直す。
   データに依存しない衝突検査は検査10が担う */
const PHRASES = [
  [1, "奥へ進む", "to_scean02"],
  [1, "洞穴に入る", "to_scean02"],
  [1, "座って休む", null],
  [2, "右へ向かう", "to_scean03"],
  [2, "木柵を越えて進む", "to_scean03"],
  [2, "左の隙間をくぐる", "to_scene03_collapse"],
  [3, "村へ戻る", "to_cean04"],
];
for (const [sceneId, text, expected] of PHRASES) {
  const sc = scenes.find(s => String(s.id) === String(sceneId));
  const got = sc ? resolveExit(sc, text)?.id ?? null : "(シーンが無い)";
  ok(got === expected, `シーン${sceneId} 「${text}」→ ${got ?? "不一致"}`,
    `期待は ${expected ?? "不一致"}`);
}

// ───────────────────────────────────────────────
section("5. 進行に必要な秘密に、開示する手段が書かれている");
// ───────────────────────────────────────────────
/* 検査3は「全知なら到達できる」上限しか見ない。実際にはプレイヤーが秘密を開示できなければ
   出口は開かない。開示の入口は entity名・aliases・trigger の3つで、どれも無い秘密は
   (LLMがtargetEntityを正確に返す偶然を除けば)開示手段が無い */
const gateIds = new Set(refs.map(r => r.id));
for (const s of scenes) {
  for (const sec of s.secrets || []) {
    if (!gateIds.has(sec.id)) continue; // 進行に関与しない秘密は対象外(装飾情報)
    const hasWay = Boolean(sec.entity) || (sec.aliases || []).length > 0 || Boolean(sec.trigger);
    ok(hasWay, `シーン${s.id} ${sec.id}(${sec.entity || "名前なし"}) に開示の手がかりがある`,
      `entity・aliases・triggerのどれも無い。プレイヤーが指し示す語が存在しない`);
  }
}

// ───────────────────────────────────────────────
section("6. 同じシーン内で開示語が衝突していない");
// ───────────────────────────────────────────────
/* uniqueBestSecretTextMatch は候補が2つ以上に等しく当たると null を返す(誤った秘密を
   漏らすより開示なしを選ぶ設計)。つまり語彙が衝突すると、作者が用意した呼び方で
   調べても何も開示されない。実物の関数へ作者が書いた別名を1つずつ通して確かめる */
for (const s of scenes) {
  const pool = s.secrets || [];
  if (pool.length < 2) continue;
  for (const sec of pool) {
    for (const term of [sec.entity, ...(sec.aliases || [])].filter(Boolean)) {
      const hit = uniqueBestSecretTextMatch(pool, `${term}を調べる`);
      ok(hit === sec, `シーン${s.id} 「${term}」→ ${sec.id}(${sec.entity})`,
        hit ? `別の秘密 ${hit.id}(${hit.entity}) に取られた` :
          `どの秘密にも決まらない。同じ語を持つ秘密が同一シーンに複数ある`);
    }
  }
}

// ───────────────────────────────────────────────
section("7. 自然な言い回しで進行に必要な秘密を指せる");
// ───────────────────────────────────────────────
/* [シーンid, 宣言文, 期待する秘密id]。実プレイで「調べたのに何も出ない」が起きたらここへ足す */
const EXAMINE = [
  [1, "木の札を読む", "s1a"],
  [1, "標識に近づいて確かめる", "s1a"],
  [1, "線路を辿ってみる", "s1b"],
  [2, "木柵に触れてみる", "s2a"],
  [2, "油くさいにおいを確かめる", "s2b"],
  [3, "胸の青い光を見つめる", "s3b"],
];
for (const [sceneId, text, expected] of EXAMINE) {
  const sc = scenes.find(s => String(s.id) === String(sceneId));
  const hit = sc ? uniqueBestSecretTextMatch(sc.secrets || [], text) : null;
  ok(hit?.id === expected, `シーン${sceneId} 「${text}」→ ${hit ? hit.id : "開示なし"}`,
    `期待は ${expected}。この言い回しでは調べても何も出ない`);
}

// ───────────────────────────────────────────────
section("9. completeRequires が実際に参照される場所に書かれている");
// ───────────────────────────────────────────────
/* sceneCompleteAllowed は「exits[] を持つシーンでは即 false」を先に返すため、
   completeRequires は exits を持たないシーンでしか参照されない。
   ただし exits と併記されていても、要求する秘密が全ての出口の requires に含まれていれば
   結果は同じなので害はない(単なる冗長)。落とすべきは「completeRequires だけが要求していて、
   出口側は要求していない」場合——作者が書いた条件が黙って失われている状態だけ */
for (const { label, node } of exitNodes) {
  const req = node.completeRequires;
  if (!req) continue;
  const exits = (node.exits || []).filter(e => e.to !== null && e.to !== undefined);
  if (!exits.length) continue; // 出口が無ければ completeRequires は正しく参照される
  const idsOf = e => [...(e.requires?.secretsAll || []), ...(e.requires?.secretsAny || [])];
  /* secretsAll は「全部必要」なので、どの出口も全部要求していれば同じ意味になる。
     secretsAny は「どれか1つ」なので、どの出口も最低1つ要求していれば必ず満たされる。
     この条件を外れた分だけが、作者の意図が黙って失われている箇所 */
  const lostAll = (req.secretsAll || []).filter(id => !exits.every(e => idsOf(e).includes(id)));
  const anyIds = req.secretsAny || [];
  const anyCovered = !anyIds.length || exits.every(e => anyIds.some(id => idsOf(e).includes(id)));
  const lost = [...lostAll, ...(anyCovered ? [] : anyIds)];
  ok(lost.length === 0,
    `${label} の completeRequires が出口の条件に反映されている`,
    `exits があるため sceneCompleteAllowed は completeRequires を評価しない。` +
    `${[...new Set(lost)].join("・")} を要求しているが出口の requires では担保されていないので、` +
    `作者が書いた条件が黙って失われている。出口の requires 側へ書く必要がある`);
}

// ───────────────────────────────────────────────
section("10. 出口の照合語が、他の出口に取られていない");
// ───────────────────────────────────────────────
/* resolveExit は exits[] を先頭から見て最初に一致したものを返す。同じ語(または部分語)を
   2つの出口が持つと、後ろの出口はその語では永久に選べない。作者が書いた語をそのまま
   実物の resolveExit へ通して、書いた出口が選ばれることを確かめる。データに依存せず効く */
for (const { label, node } of exitNodes) {
  const exits = node.exits || [];
  if (exits.length < 2) continue; // 出口が1つなら衝突しない
  for (const e of exits) {
    for (const word of e.match || []) {
      const hit = resolveExit(node, word);
      ok(hit === e, `${label} 「${word}」→ 出口${hit ? hit.id : "なし"}`,
        `作者は出口${e.id}の語として書いたが、${hit ? `出口${hit.id}に先に取られる` : "どの出口にも一致しない"}。` +
        `この語では出口${e.id}へ行けない`);
    }
  }
}

// ───────────────────────────────────────────────
section("12. 作者が書いた開示方法(trigger)で、その秘密自身が開く");
// ───────────────────────────────────────────────
/* 2026-08-04の実プレイで見つけた欠陥の再発防止。プレイヤーが作者の書いた開示方法を
   そのまま打っても、別の秘密の1文字の別名に負けて狙った秘密が開かず、章が完了できなかった。
   実物の決定関数(pickExamineSecret と resolveSecretTarget)へ trigger の文をそのまま通す */
for (const s of scenes) {
  const unrevealed = { revealed: new Set() }; // まだ何も開示していない状態
  for (const sec of s.secrets || []) {
    for (const t of String(sec.trigger || "").split(/[,、]/).map(x => x.trim().replace(/[。.]$/, ""))) {
      if (t.length < 2) continue;
      const picked = pickExamineSecret(s, t, t, unrevealed).secret;
      ok(picked === sec, `シーン${s.id} 「${t}」→ ${picked ? picked.id : "対象なし"}（作者は${sec.id}のために書いた）`,
        picked ? `別の秘密 ${picked.id}(${picked.entity}) に取られる。この開示方法では${sec.id}が開かない`
          : `どの秘密にも決まらない`);

      /* LLM経由の経路も同じ結論になるか。reasonが別の対象を指していても、
         プレイヤーが打った言葉が作者の開示方法なら、そちらを尊重すべき */
      const viaLlm = resolveSecretTarget(s, null, "", t, unrevealed);
      ok(viaLlm === sec, `シーン${s.id} 「${t}」→ LLM経由でも ${viaLlm ? viaLlm.id : "対象なし"}`,
        `LLM経由の解決では ${viaLlm ? viaLlm.id : "決まらない"}。scriptedと食い違う`);
    }
  }
}

// ───────────────────────────────────────────────
section("14. 複数条件の出口に、専用の進めない理由が用意されている");
// ───────────────────────────────────────────────
/* moveBlockedNote は exit.blockedText が無いとシーン単位の sc.blockedText にフォールバックする。
   出口の requires が2つ以上の秘密を要求するのに専用の文言が無いと、シーン単位の文言が
   「特定の1つの秘密」だけを名指ししていた場合、他の秘密だけが未開示でも同じ文言が出て
   プレイヤーを混乱させる。2026-08-04の実プレイで実際に起きた
   (「あの人影の正体を確かめないまま」= s3a を名指しした文言が、s3a開示済み・s3b未開示でも
   そのまま出た。s3aを出口条件に足したことで露見した)。
   文章が特定の対象を名指ししているかは機械では判定できないので、この検査は
   「複数条件の出口に専用のblockedTextがあるか」という構造だけを見る。無ければ
   シーンのblockedTextが両方の場合に真であるかを人間が確認する必要がある、という注意 */
for (const { label, node } of exitNodes) {
  for (const e of node.exits || []) {
    const demanded = [...(e.requires?.secretsAll || []), ...(e.requires?.itemsAll || [])];
    if (demanded.length < 2) continue;
    ok(Boolean(e.blockedText), `${label} 出口${e.id} は${demanded.length}件の条件を要求するため専用のblockedTextがある`,
      `専用の文言が無いとシーン単位の${node.blockedText ? `blockedText("${node.blockedText}")` : "既定文言"}に` +
      `フォールバックする。それが${demanded.join("・")}のどれか1つだけを名指ししていると、` +
      `他の条件だけ未達の場合に誤った理由を告げる`);
  }
}

// ───────────────────────────────────────────────
section("13. 粘れば必ず開示に近づく（失敗が無駄にならない）");
// ───────────────────────────────────────────────
/* 進行必須の秘密がダイス運のゲートの奥にある問題への対処(examineDifficulty)。
   実測では s3a の開示に3回かかり、別の周では3連続失敗で1シーンも進めなかった。
   失敗するたび難易度が下がり、有限回で「自然な1以外は成功する」水準に到達することを保証する */
for (const s of scenes) {
  for (const sec of s.secrets || []) {
    const base = examineDifficulty(sec, 0);
    ok(base === (sec.dc || 12), `シーン${s.id} ${sec.id}: 初回は作者の難易度どおり(${base})`,
      `作者は ${sec.dc} を書いたのに初回が ${base} になっている`);

    /* 失敗を重ねるほど下がり、途中で上がらない */
    let prev = base;
    let reachedFloor = 0;
    for (let f = 1; f <= 10; f++) {
      const d = examineDifficulty(sec, f);
      ok(d <= prev, `シーン${s.id} ${sec.id}: ${f}回失敗後の難易度が上がらない(${prev}→${d})`);
      if (d === prev && !reachedFloor) reachedFloor = f;
      prev = d;
    }
    ok(prev <= 2, `シーン${s.id} ${sec.id}: 粘れば自然な1以外は成功する水準まで下がる(最終${prev})`,
      `10回失敗しても難易度 ${prev} のままでは、運が悪いと永久に開かない`);
    ok(examineDifficulty(sec, 99) >= 2, `シーン${s.id} ${sec.id}: 下限を下回らない（振る意味を残す）`,
      `難易度が ${examineDifficulty(sec, 99)} まで下がると自動成功になり、判定の意味が消える`);
  }
}

// ───────────────────────────────────────────────
section("11. 遭遇(encounters)が実際に発生できる");
// ───────────────────────────────────────────────
/* 遭遇は進行のゲートではないが、「設定したのに一度も起きない」は"mock2が回らない"感覚の
   もう一つの温床になる。resolveEncounterFoe/encounterRequiredElementsMetという実物の
   関数を通し、typoや名前の不一致で永久に発火しない遭遇を検出する */
const allEnemyNames = new Set(scenes.flatMap(s =>
  [s.enemy?.name, ...(s.encounters || []).map(e => e.enemy?.name)].filter(Boolean)));
for (const s of scenes) {
  for (const enc of s.encounters || []) {
    const foe = resolveEncounterFoe(enc, s);
    ok(Boolean(foe), `シーン${s.id} 遭遇${enc.id} の敵が解決できる`,
      `enc.enemy も無く、monsterName(${enc.monsterName}) が scene.enemy(${s.enemy?.name}) と食い違う。` +
      `この遭遇は永久に発火しない`);

    const entityLabels = s.secrets.flatMap(x => [x.entity, ...(x.aliases || [])]);
    for (const el of enc.requiredElements || []) {
      ok(entityLabels.includes(el), `シーン${s.id} 遭遇${enc.id} の必要な調査対象「${el}」が実在する`,
        `シーン内のどの秘密のentity・aliasesにも一致しない。typoなら永久に発火しない`);
    }

    for (const name of enc.blockedBy || []) {
      ok(allEnemyNames.has(name), `シーン${s.id} 遭遇${enc.id} の発生禁止条件「${name}」が実在する敵名`,
        `章内のどの敵名にも一致しない。書いた条件が何も禁止しない`);
    }

    if ((enc.requiredElements || []).length) {
      const met = encounterRequiredElementsMet(enc,
        { ...s, secrets: s.secrets }, { revealed: new Set(s.secrets.map(x => x.id)) });
      ok(met, `シーン${s.id} 遭遇${enc.id} は全知の状態なら必要条件を満たせる`,
        `secretsAll/any の判定に使う entity・aliases が requiredElements と食い違う`);
    }
  }
}

// ───────────────────────────────────────────────
section("8. 出口が要求する品物が、章内で必ず入手できる");
// ───────────────────────────────────────────────
/* アウトロの出口は requires.itemsAll で品物を要求することがある(章の完了条件)。
   その品物が章内のどこにも落ちていなければ、章は永久に終われない。
   さらに loot は {name, requires:"secretId"} 形式を取り、その秘密が開示されるまで
   「存在しない」扱いになる(availableLoot)。よって品物→秘密の連鎖まで辿る */
const lootIndex = new Map();
scenes.forEach(s => (s.loot || []).forEach(item => {
  const obj = typeof item === "string" ? { name: item } : item;
  lootIndex.set(obj.name, { ...obj, sceneId: s.id });
}));
/* 出口が addItems で渡す品物も入手経路になる(謝礼など) */
exitNodes.forEach(({ node }) => (node.exits || []).forEach(e =>
  (e.addItems || []).forEach(name => { if (!lootIndex.has(name)) lootIndex.set(name, { name, viaExit: true }); })));

for (const ref of itemRefs) {
  const found = lootIndex.get(ref.name);
  ok(Boolean(found), `${ref.where} が要求する「${ref.name}」が章内で入手できる`,
    `どのシーンのlootにも、どの出口のaddItemsにも無い。この出口は永久に開かない`);
  if (found && found.requires) {
    ok(allSecretIds.has(found.requires),
      `「${ref.name}」の出現条件 ${found.requires} が定義されている`,
      `シーン${found.sceneId}のlootが未定義の秘密を待っている。品物が永久に現れない`);
  }
}
ok(itemRefs.length > 0, "品物を要求する出口が1件以上ある（検査が空振りしていない）",
  "この章には品物条件が無い。検査8は実質何も見ていない");

// ───────────────────────────────────────────────
console.log(results.join("\n"));
const total = results.filter(r => r.startsWith("  ")).length;
console.log(`\n${failed ? `FAIL: ${failed}/${total} 件失敗` : `PASS: ${total}/${total} 件`}`);
process.exit(failed ? 1 : 0);
