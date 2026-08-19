import { held, has, byOwner, PLAYER } from "./inventory.js";
let SCENARIO, CAST, CAMPAIGN, state, chron, revealed;

export function bindChronicle(context) {
  SCENARIO = context.SCENARIO;
  CAST = context.CAST;
  CAMPAIGN = context.CAMPAIGN;
  state = context.state;
  chron = context.chron;
  revealed = context.revealed;
}

function baseItems() {
  const starting = SCENARIO.startingInventory;
  if (starting && typeof starting === "object") return [...new Set(Object.values(starting).flat())];
  return Array.isArray(CAMPAIGN?.initialInventory) ? CAMPAIGN.initialInventory : [];
}

/* ---------------- Chronicle Lite(D-015/D-016): 構造化ログの.md書き出し。LLM不使用 ----------------
   【日記の原則】クロニクルは「プレイヤーが実際に体験・知り得たこと」だけを載せる。
   源にしてよいのは: chron(実際に語られたログ)/ revealed(開示済み秘密)/ state(戦績・所持)/
   SCENARIOの公開フィールド(title・intro・brief・reference)のみ。
   触れてはならない: secrets[].text(未開示の正解)・direction(②層の演出指示)。
   → クリアや判定成功で開示が増えるほど、同じロジックのまま資料が自然に厚くなる(段階的開示)。 */

/* 訪問済みシーンのindex。state.visitedが正本。無い場合(旧セーブ)は0..sceneIndexで補う。
   sceneIndexを進捗として使うと、分岐する章では嘘になる(2026-08-19) */
function visitedIdx() {
  const v = Array.isArray(state.visited) ? state.visited : null;
  if (v && v.length) return [...new Set(v)].filter(i => i >= 0 && i < SCENARIO.scenes.length);
  return Array.from({ length: (state.sceneIndex ?? 0) + 1 }, (_, i) => i);
}
// 章を走り切ったか。「終端の出口へ到達した」= chronに決着の記録がある、が唯一の根拠。
// 場面番号では判定できない(結末へつながる場面が配列の最後とは限らない)
function isFinished() {
  return chron.some(e => e.kind === "sys" && /物語は決着した/.test(e.text || ""));
}

// プレイヤーの足跡・世界への影響を、実際の状態から導く(world-flags相当。diary基準)
function deriveFootprints() {
  const f = [];
  if (state.hp <= 0) { f.push("坑道の奥で力尽きた"); return f; }
  if (state.defeated.includes("錆喰い")) f.push("錆喰いとの戦いを制した");
  /* 番人の呼び名は章データが正本(2026-08-19)。ここに文字列で持つと表記が揺れる。
     silent:trueのNPCなので「対話で切り抜けた」とは書けない(会話は起こりえない)。
     判断はsceneIndexではなく、正体を実際に見たか(s3aの開示)で行う——分岐のある章では
     sceneIndexは「どこまで進んだか」を表さない */
  const keeper = SCENARIO.scenes.find(s => String(s.id) === "3")?.npc?.name;
  if (keeper && state.defeated.includes(keeper)) f.push(`${keeper}を退けた`);
  else if (keeper && revealed.has("s3a")) f.push(`${keeper}と刃を交えずに切り抜けた`);
  if (has(state.inventory, "心石の欠片")) f.push("心石の欠片を持ち帰った");
  const seen = visitedIdx().length;
  f.push(isFinished()
    ? "依頼を果たし、村へ帰還した"
    : `${SCENARIO.scenes.length}場面のうち${seen}場面を歩いた`);
  return f;
}

/* 年代記に残す所持品。誰が何を持っていたかまで残す。持ち物が空の同行者は出さない */
function inventoryLine() {
  const rows = byOwner(state.inventory, id => (id === PLAYER ? "あなた" : (CAST[id]?.name || id)))
    .filter(r => r.items.length);
  return rows.length ? rows.map(r => `${r.name}=${r.items.join("、")}`).join(" / ") : "なし";
}

// 発見したもの: 開示済み秘密(revealedのみ)と、物語上意味のある入手品から。未開示の真相は載せない
function deriveDiscoveries() {
  const d = [];
  SCENARIO.scenes.forEach(s => s.secrets.forEach(sec => {
    if (revealed.has(sec.id)) d.push(`**${sec.entity || "?"}** — ${sec.text}`);
  }));
  const startingItems = baseItems();
  held(state.inventory).filter(i => !startingItems.includes(i)).forEach(i => d.push(`**${i}** — 冒険で手に入れた品`));
  return d;
}

// Story Reference(AI Creator Pack): 二次創作の資料。すべて chron/state/公開情報から
function deriveStoryReference() {
  // 到達したシーンの一覧(brief=公開情報)
  // 実際に訪問した場面だけ。訪問順に並べる(配列順ではない——分岐で順路が変わる)
  const scenesSeen = visitedIdx()
    .map(i => SCENARIO.scenes[i])
    .filter(Boolean)
    .map(s => `${s.id}. ${s.brief.split("。")[0]}`);
  // 登場人物: 声のあった同行者 + 倒した/対峙した相手 + 報告に至れば依頼人
  const cast = ["冒険者(あなた)"];
  [...new Set(chron.filter(e => e.kind === "companion").map(e => e.who))]
    .forEach(w => { if (CAST[w]) cast.push(CAST[w].name + "(同行者)"); });
  state.defeated.forEach(n => cast.push(n + "(退けた相手)"));
  const keeper = SCENARIO.scenes.find(s => String(s.id) === "3")?.npc?.name;
  if (keeper && revealed.has("s3a") && !state.defeated.includes(keeper)) cast.push(`${keeper}(対峙した存在)`);
  // 依頼人は「実際に喋ったか」で判断する。場面番号では漏れる(結末の場面が配列の最後とは限らない)
  const clientName = SCENARIO.intro?.npc?.name || SCENARIO.ending?.npc?.name;
  if (clientName && chron.some(e => e.kind === "npc" && e.name === clientName)) {
    cast.push(`${clientName}(依頼人)`);
  }
  // 重要アイテム
  const startingItems = baseItems();
  const keyItems = ["ランタン", ...held(state.inventory).filter(i => !startingItems.includes(i))];
  // セリフ: 同行者の実際の言葉(chronから。最大4つ)。
  // 単純な先頭+末尾3件だと、間にしか喋らなかったキャラが picks から丸ごと消える
  // (2026-07-04プレイで実際に発生:ガレス3件・リディア5件のうちガレスが0件に)。
  // まず各キャラの最初と最後の発言を優先確保し、残り枠を新しい順で埋める。
  const companionLines = chron.filter(e => e.kind === "companion");
  const bySpeaker = {};
  companionLines.forEach(e => { (bySpeaker[e.who] = bySpeaker[e.who] || []).push(e); });
  const picks = [];
  Object.values(bySpeaker).forEach(arr => {
    picks.push(arr[0]);
    if (arr.length > 1) picks.push(arr[arr.length - 1]);
  });
  let uniquePicks = [...new Set(picks)];
  if (uniquePicks.length > 4) {
    // 発言数の少ないキャラを優先して残す(多いキャラの重複から間引く)
    uniquePicks.sort((a, b) => bySpeaker[a.who].length - bySpeaker[b.who].length);
    uniquePicks = uniquePicks.slice(0, 4);
  } else {
    companionLines.slice().reverse().forEach(e => {
      if (uniquePicks.length < 4 && !uniquePicks.includes(e)) uniquePicks.push(e);
    });
  }
  uniquePicks.sort((a, b) => a.t - b.t);
  const pickedLines = uniquePicks.map(e => `「${e.text}」— ${(CAST[e.who] && CAST[e.who].name) || "同行者"}`);
  const ref = SCENARIO.reference || {};
  return { scenesSeen, cast: [...new Set(cast)], keyItems, pickedLines, ref };
}

/* .mdの本文を組むだけの関数。ダウンロード(DOM依存)から分けてあるのは、
   出力の中身を検査できるようにするため(chronicle.test.mjsが直接呼ぶ) */
export function buildChronicleMarkdown() {
  const sc = SCENARIO.scenes[state.sceneIndex];
  const date = new Date().toISOString().slice(0, 10);
  const dice = chron.filter(e => e.kind === "dice");
  const okCount = dice.filter(d => d.ok).length;
  const crits = dice.filter(d => d.crit);
  const fumbles = dice.filter(d => d.fumble);
  const reveals = chron.filter(e => e.kind === "reveal");

  // 実プレイ時間: 隣接イベント間の間隔を合計する。長い放置(離席・翌日再開)は
  // プレイ時間としてカウントしない(1回のギャップ上限3分でクランプ)
  const PLAYTIME_GAP_CAP_MS = 3 * 60 * 1000;
  let playtimeMs = 0;
  for (let i = 1; i < chron.length; i++) {
    if (!chron[i].ts || !chron[i - 1].ts) continue; // 旧セーブ(ts未記録)との混在対策
    const gap = chron[i].ts - chron[i - 1].ts;
    if (gap > 0) playtimeMs += Math.min(gap, PLAYTIME_GAP_CAP_MS);
  }
  const playtimeMin = Math.round(playtimeMs / 60000);
  const playtimeLabel = playtimeMin < 1 ? "1分未満" : `約${playtimeMin}分`;

  const timeline = chron.map(e => {
    switch (e.kind) {
      case "player": return `- [T${e.t}] 🗣 宣言: ${e.text}`;
      case "gm": return `- [T${e.t}] GM: ${e.text.replace(/\n+/g, " ")}`;
      case "dice": return `- [T${e.t}] 🎲 ${e.reason}: d20=${e.roll} / DC${e.diff} → ${e.crit ? "クリティカル!" : e.fumble ? "ファンブル…" : e.ok ? "成功" : "失敗"}`;
      case "reveal": return `- [T${e.t}] 🔓 真相開示: ${e.text}`;
      case "companion": return `- [T${e.t}] ${(CAST[e.who] && CAST[e.who].name) || e.who}: 「${e.text}」`;
      case "npc": return `- [T${e.t}] ${e.name || "？？？"}: 「${e.text}」`;
      case "sys": return `- [T${e.t}] ⚙ ${e.text}`;
      case "hp": return `- [T${e.t}] ${e.to < e.from ? "💔" : "💚"} HP ${e.from}→${e.to}`;
    }
  }).join("\n");

  const highlights = [
    ...crits.map(d => `- T${d.t}: 「${d.reason}」で出目20のクリティカル!`),
    /* ファンブルの結末は判定の種類で違う。攻撃なら反撃を受けるが、調べる判定の失敗は
       次回の難易度が下がる(examineDifficulty)ので「代償」ではない。一律に代償と書くと
       ログと食い違う(2026-08-19のクロニクルで、調べる判定の失敗3件が代償と書かれていた) */
    ...fumbles.map(d => `- T${d.t}: 「${d.reason}」で出目1のファンブル。` +
      (/への攻撃/.test(d.reason) ? "手痛い代償を払った" : "だが、この粘りが次の糸口になった"))
  ].join("\n") || "- クリティカルもファンブルもない、手堅い冒険だった";

  const synopsis =
    (state.hp <= 0
      ? `冒険者は${sc.brief.slice(0, 20)}…で力尽きた。`
      : isFinished()
        ? `冒険者は依頼を果たし、村へ帰った(${SCENARIO.scenes.length}場面のうち${visitedIdx().length}場面を歩いた)。`
        : `冒険者は「${sc.brief.slice(0, 24)}…」まで進んだ(${SCENARIO.scenes.length}場面のうち${visitedIdx().length}場面)。`) +
    (state.defeated.length ? ` 道中、${state.defeated.join("、")}を退けた。` : "") +
    (reveals.length ? ` ${reveals.length}件の真相が明らかになった。` : "");

  const footprints = deriveFootprints();
  const discoveries = deriveDiscoveries();
  const ref = deriveStoryReference();
  const companionsSeen = [...new Set(chron.filter(e => e.kind === "companion").map(e => CAST[e.who] && CAST[e.who].name).filter(Boolean))];
  const partyLine = ["冒険者", ...companionsSeen].join("・") + "(AI同行者) + AI GM";
  const rf = SCENARIO.reference || {};
  const introText = typeof SCENARIO.intro === "string" ? SCENARIO.intro
    : (SCENARIO.intro && SCENARIO.intro.brief) || "";

  const md = `---
campaign: ${SCENARIO.title}
date: ${date}
genre: ${rf.genre || "-"}
theme: ${(rf.themes || []).join(" / ") || "-"}
mood: ${rf.mood || "-"}
party: ${partyLine}
main_characters: ${ref.cast.join(" / ")}
system: d20判定 / trpg-gm-mock2
progress: ${isFinished() ? "完走" : "未完"}(${SCENARIO.scenes.length}場面のうち${visitedIdx().length}場面を訪問)、HP ${state.hp}/${state.maxHp}
playtime: ${playtimeLabel}
---

# クロニクル: ${SCENARIO.title}

## 今日のあらすじ

${introText}

${synopsis}

## この冒険での足跡

${footprints.map(x => `- ${x}`).join("\n")}

## 出来事の時系列

${timeline}

## 名場面

${highlights}

## 戦績

- プレイ時間: ${playtimeLabel}(全${state.turn}ターン)
- 判定: ${dice.length}回中${okCount}回成功(クリティカル${crits.length}回 / ファンブル${fumbles.length}回)
- 倒した敵: ${state.defeated.join("、") || "なし"}
- 現在のHP: ${state.hp}/${state.maxHp} / 所持品: ${inventoryLine()}

## 発見したもの(この冒険で知り得たこと)

${discoveries.map(x => `- ${x}`).join("\n") || "- (この冒険では、確かな真相までは掴めなかった)"}

---

## Story Reference(二次創作の資料)

> ここに載るのは、あなたが実際に体験した範囲だけ。冒険を深く進めるほど、資料も厚くなる。

### シーン
${ref.scenesSeen.map(x => `- ${x}`).join("\n")}

### 登場人物
${ref.cast.map(x => `- ${x}`).join("\n")}

### 重要アイテム
${ref.keyItems.map(x => `- ${x}`).join("\n")}

### 同行者の言葉
${ref.pickedLines.map(x => `- ${x}`).join("\n") || "- (この冒険では、同行者は多くを語らなかった)"}

### テーマ
${(rf.themes || []).map(x => `- ${x}`).join("\n") || "- -"}

### 雰囲気
${rf.mood || "-"}${rf.palette ? "(" + rf.palette.join("・") + ")" : ""}

## このログの活用例(お好みのAIに渡してください)

- このクロニクルを、三人称の冒険小説(600字)にしてください
- このクロニクルから4コマ漫画のネーム(コマ割りとセリフ)を作ってください
- Story Referenceを使って、この冒険の動画の絵コンテ(シーン構成)を作ってください
- 名場面をもとに、SNS投稿用の戦果報告(140字)を書いてください
`;

  return { md, date };
}

export function exportChronicleFile() {
  const { md, date } = buildChronicleMarkdown();
  const blob = new Blob([md], { type: "text/markdown" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `chronicle_${date}.md`;
  a.click();
  URL.revokeObjectURL(a.href);
}
