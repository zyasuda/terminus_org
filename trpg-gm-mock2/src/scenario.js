/* =========================================================
   シナリオデータのローダー(TAS ↔ mock データ交換仕様: BORG/TRPG/TAS/DATA_EXCHANGE.md v0.2)。

   データ本体は public/data/campaign.json(キャンペーン共通)と
   public/data/chapter_01.json(章データ)にあり、コードには置かない。
   TASの成果物をpublic/data/に置くだけで、コードに触れず差し替えられる。

   このモジュールは 取得 → 検証 → 旧来のexport形状(SCENARIO/CAST/BANTER)への
   組み立て だけを行う。エンジン側の消費コードは従来のまま動く(ESモジュールの
   ライブバインディングにより、loadScenarioData()後は値が入っている)。

   R3-2: モック段階の割り切りとして、状態管理・ダイス・開示制御は
   フロントエンド側に置いている(製品化時はバックエンドへ移す前提)。
   ========================================================= */

export let CAMPAIGN = null; // campaign.json全体(styleやcompanionsHintをsystemPromptが参照)
export let SCENARIO = null;
export let CAST = null;
export let GM = null; // GM自身の人格。campaign.gmが無い既存キャンペーンでは下のGM_DEFAULTで動く
export let BANTER = null;
export let CONTENT_SELECTION = null; // {campaignId, chapterId, campaign, chapter}

async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} の取得に失敗した (HTTP ${res.status})`);
  try {
    return await res.json();
  } catch (e) {
    throw new Error(`${path} がJSONとして読めない: ${e.message}`);
  }
}

/* GMの既定値。campaign.gm を持たない既存キャンペーンはこれで従来どおり動く。
   nameは画面とプロンプトの両方に出る名前で、TAS側のDEFAULT_GM_NAMEと一致させてある */
const GM_DEFAULT = {
  name: "ダイス先輩",
  persona: "結果を簡潔に説明し、プレイヤーの選択を尊重して案内する。"
};

/* 同行者の演出フィールドの既定値。TASに専用の入力欄がまだ無く(2026-08-04時点)、
   キャラクター固有の口調ではなく、誰にでも当てはまる中立の一言にしてある。
   quirksはscriptedモード専用(LLM呼び出しをゼロに保つ契約があるため、実行時に
   生成せず固定文をここに置く)。3つとも同じ理由でLLMを介さない静的な文言 */
const DEFAULT_COMPANION_QUIRKS = [
  { mutter: "ふむ、そうか。" },
  { mutter: "さて、どうする?" },
  { mutter: "気をつけていこう。" }
];
const DEFAULT_BATTLE_MUTTERS = ["油断するなよ。", "まだ終わっていない。", "ここが踏ん張りどころだ。"];
/* 立ち絵タップの既定応答。TASにまだ入力欄が無いので、作者が書いた一人称から
   口調を寄せる(「俺」なら短く硬い返し)。idleLineを書けばそちらが優先される */
const DEFAULT_IDLE_LINE = { "俺": "なんだ?", "オレ": "なんだ?", "僕": "なに?", "私": "何?", "わたし": "何?" };
const FALLBACK_IDLE_LINE = "…どうした?";
const DEFAULT_BATTLE_END = {
  win: ["ふぅ、なんとかなったな。"],
  fled: ["ここは退くのが得策だ。"],
  repelled: ["追い払えたか。"]
};

// 手作業変換のJSONを想定した最小バリデーション(TASのBuild Pipelineができたら本検証はそちらへ移す)
function validate(campaign, chapter) {
  const errs = [];
  const st = campaign.style || {};
  if (!st.narration || !st.readingLevel || !st.world) errs.push("campaign.style に narration/readingLevel/world が必要");
  if (!Array.isArray(campaign.companions) || campaign.companions.length === 0) {
    errs.push("campaign.companions が空");
  } else {
    campaign.companions.forEach((c, i) => {
      if (!c.id || !c.name || !c.persona) errs.push(`companions[${i}] に id/name/persona が必要`);
    });
  }
  if (!chapter.quest) errs.push("chapter.quest がない");
  // intro/endingはnull運用(TAS_導入終端ノード出力仕様_null運用_2026-07-22): 未作成ならnullでよく、
  // 文字列(旧形式)またはオブジェクト(id/name/brief/goal/npc/exits、新形式)のどちらでも受け付ける
  if (!Array.isArray(chapter.scenes) || chapter.scenes.length === 0) {
    errs.push("chapter.scenes が空");
  } else {
    const ids = new Set();
    chapter.scenes.forEach((sc, i) => {
      const label = `scene ${sc.id ?? i + 1}`;
      if (!sc.brief) errs.push(`${label}: brief が必要`);
      if (!Array.isArray(sc.secrets)) errs.push(`${label}: secrets は配列(空でも可)が必要`);
      (sc.secrets || []).forEach(s => {
        if (!s.id || !s.entity || !s.text) errs.push(`${label}: secret に id/entity/text が必要`);
        if (ids.has(s.id)) errs.push(`secret id が重複: ${s.id}`);
        ids.add(s.id);
      });
      if (sc.enemy && (!sc.enemy.name || typeof sc.enemy.hp !== "number" || typeof sc.enemy.maxHp !== "number")) {
        errs.push(`${label}: enemy に name/hp/maxHp が必要`);
      }
    });
  }
  if (errs.length) throw new Error("シナリオデータの検証エラー:\n・" + errs.join("\n・"));
}

// campaign.entities はTASの共通台帳。個別シーンのsecretへ別名を足して、
// 既存の秘密照合・LLM後処理を同じ経路で効かせる。秘密側で書いた別名は残す。
export function applyCampaignEntityAliases(chapter, entities) {
  if (!Array.isArray(entities) || entities.length === 0) return chapter;

  const aliasesByName = new Map();
  entities.forEach(entity => {
    const name = String(entity?.ja || "").trim();
    if (!name) return;
    const aliases = (Array.isArray(entity.aliases) ? entity.aliases : [])
      .map(alias => String(alias).trim())
      .filter(Boolean);
    if (aliases.length) aliasesByName.set(name, [...new Set([...(aliasesByName.get(name) || []), ...aliases])]);
  });
  if (aliasesByName.size === 0) return chapter;

  return {
    ...chapter,
    scenes: (chapter.scenes || []).map(scene => ({
      ...scene,
      secrets: (scene.secrets || []).map(secret => {
        const ledgerAliases = aliasesByName.get(secret.entity) || [];
        if (ledgerAliases.length === 0) return secret;
        return { ...secret, aliases: [...new Set([...(secret.aliases || []), ...ledgerAliases])] };
      })
    }))
  };
}

export async function loadScenarioData() {
  const catalog = await fetchJson("/data/campaigns.json");
  if (!Array.isArray(catalog.campaigns) || catalog.campaigns.length === 0) {
    throw new Error("/data/campaigns.json にキャンペーンがありません");
  }

  const params = new URLSearchParams(location.search);
  const requestedCampaign = params.get("campaign") || catalog.defaultCampaign || catalog.campaigns[0].id;
  const campaignEntry = catalog.campaigns.find(c => c.id === requestedCampaign);
  if (!campaignEntry) throw new Error(`キャンペーンが見つかりません: ${requestedCampaign}`);

  const requestedChapter = params.get("chapter") || campaignEntry.defaultChapter || campaignEntry.chapters?.[0]?.id;
  const chapterEntry = (campaignEntry.chapters || []).find(c => c.id === requestedChapter);
  if (!chapterEntry) throw new Error(`章が見つかりません: ${requestedChapter}`);

  const [campaign, chapter] = await Promise.all([
    fetchJson(`/data/${campaignEntry.campaign}`),
    fetchJson(`/data/${chapterEntry.file}`)
  ]);
  const resolvedChapter = applyCampaignEntityAliases(chapter, campaign.entities);
  validate(campaign, resolvedChapter);
  CAMPAIGN = campaign;
  CONTENT_SELECTION = {
    catalog,
    campaignEntry,
    chapterEntry,
    campaignId: campaignEntry.id,
    chapterId: chapterEntry.id
  };

  /* GM自身の人格。TASは未入力の項目を空文字列で出すので、スプレッドだけでは既定値が空で潰れる。
     項目ごとに || で埋める。campaign.gm を持たない既存キャンペーンは全項目が既定値になる
     (validate()にgmの必須チェックを足してはならない。goal必須で起動不能にした事故がある) */
  const gmRaw = (campaign.gm && typeof campaign.gm === "object") ? campaign.gm : {};
  GM = {
    id: "gm",
    name: gmRaw.name || GM_DEFAULT.name,
    persona: gmRaw.persona || GM_DEFAULT.persona,
    gender: gmRaw.gender || "",
    firstPerson: gmRaw.firstPerson || "",
    addressTerm: gmRaw.addressTerm || "",
    speechRules: gmRaw.speechRules || "",
    sprite: gmRaw.sprite || "",
    /* 作者が名前を変えていないか。既定GM固有の口調(「よろしくぅ」)を使ってよいかの判断に使う。
       TASは未変更でも gm.name="ダイス先輩" を必ず出力するので、キーの有無では判定できない。
       既定名と一致するかで見る(名前の文字列比較を呼び出し側へ散らさない) */
    isDefaultName: !gmRaw.name || gmRaw.name === GM_DEFAULT.name
  };

  // companions → CAST(id引きの人格・掛け合い設定)と BANTER(ペア単位のツッコミ定義)へ展開
  CAST = {};
  BANTER = [];
  campaign.companions.forEach(c => {
    CAST[c.id] = { name: c.name, persona: c.persona, gender: c.gender || "none",
      firstPerson: c.firstPerson || null, addressTerm: c.addressTerm || null,
      speechFrequency: c.speechFrequency || "standard",
      retortDrive: c.retortDrive || 3,
      /* quirks/battleMutters/battleEndはTASにまだ専用の入力欄が無く、常に無言に
         フォールバックしていた(2026-08-04、progression検査15で発見)。agility・
         retortDriveと同じく、数値ではなく文言の既定値で埋める。「in」でキーの有無を
         見るのは、作者が明示的に[]/{}を書いた「意図的な沈黙」と、単に未記入で
         あることを区別するため(空配列を書く手間を作者に強制しない設計と対) */
      quirks: "quirks" in c ? c.quirks : DEFAULT_COMPANION_QUIRKS,
      battleMutters: "battleMutters" in c ? c.battleMutters : DEFAULT_BATTLE_MUTTERS,
      agility: c.agility,
      battleEnd: "battleEnd" in c ? c.battleEnd : DEFAULT_BATTLE_END,
      idleLine: c.idleLine || DEFAULT_IDLE_LINE[c.firstPerson] || FALLBACK_IDLE_LINE };
    (c.banter || []).forEach(b => BANTER.push({ from: c.id, ...b }));
  });

  SCENARIO = {
    title: resolvedChapter.title,
    quest: resolvedChapter.quest,
    intro: resolvedChapter.intro || null, // null/文字列(旧形式)/オブジェクト(新形式)のいずれか
    ending: resolvedChapter.ending || null, // 章末ノード。null運用(2026-07-22)
    reference: resolvedChapter.reference,
    scenes: resolvedChapter.scenes,
    flagRules: resolvedChapter.flagRules || {}, // 章末のworldFlags導出ルール(BORG Inbox flags仕様調整依頼 2026-07-22)
    /* 章開始時の所持品 { 所有者ID: [品名, …] }。無ければ campaign.initialInventory を使う */
    startingInventory: resolvedChapter.startingInventory || null
  };
}
