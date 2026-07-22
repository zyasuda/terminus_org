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
      if (!sc.brief || !sc.goal) errs.push(`${label}: brief/goal が必要`);
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
  validate(campaign, chapter);
  CAMPAIGN = campaign;
  CONTENT_SELECTION = {
    catalog,
    campaignEntry,
    chapterEntry,
    campaignId: campaignEntry.id,
    chapterId: chapterEntry.id
  };

  // companions → CAST(id引きの人格・掛け合い設定)と BANTER(ペア単位のツッコミ定義)へ展開
  CAST = {};
  BANTER = [];
  campaign.companions.forEach(c => {
    CAST[c.id] = { name: c.name, persona: c.persona, gender: c.gender || "none",
      firstPerson: c.firstPerson || null, addressTerm: c.addressTerm || null,
      retortDrive: c.retortDrive || 3,
      quirks: c.quirks || [], battleMutters: c.battleMutters || [],
      agility: c.agility, battleEnd: c.battleEnd };
    (c.banter || []).forEach(b => BANTER.push({ from: c.id, ...b }));
  });

  SCENARIO = {
    title: chapter.title,
    quest: chapter.quest,
    intro: chapter.intro || null, // null/文字列(旧形式)/オブジェクト(新形式)のいずれか
    ending: chapter.ending || null, // 章末ノード。null運用(2026-07-22)
    reference: chapter.reference,
    scenes: chapter.scenes,
    flagRules: chapter.flagRules || {} // 章末のworldFlags導出ルール(BORG Inbox flags仕様調整依頼 2026-07-22)
  };
}
