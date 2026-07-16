/* DATA_EXCHANGE.md準拠の最小Validation(AIを使わない検査。BUILD_PIPELINE.md Stage2の最小形)
   使い方: node validate.cjs */
const fs = require("fs");
const path = require("path");
const campaign = JSON.parse(fs.readFileSync(path.join(__dirname, "campaign.json"), "utf-8"));
const errors = [];

for (const f of fs.readdirSync(__dirname).filter(n => /^chapter_\d+\.json$/.test(n))) {
  const ch = JSON.parse(fs.readFileSync(path.join(__dirname, f), "utf-8"));
  const secretIds = new Set(ch.scenes.flatMap(s => s.secrets.map(x => x.id)));
  const sceneIds = ch.scenes.map(s => s.id);

  // secrets ID重複
  if (secretIds.size !== ch.scenes.flatMap(s => s.secrets).length) errors.push(`${f}: secrets IDが重複`);
  // 伏線のpayloadが実在するsecretを指すか(nullはpayloadNote必須)
  for (const fo of ch.foreshadow || []) {
    if (fo.payload === null && !fo.payloadNote) errors.push(`${f}: ${fo.id} payloadがnullなのにpayloadNoteがない`);
    if (fo.payload !== null && !secretIds.has(fo.payload)) errors.push(`${f}: ${fo.id} payload "${fo.payload}" が存在しない`);
    if (fo.due.chapter === ch.id && fo.due.scene !== null && !sceneIds.includes(fo.due.scene))
      errors.push(`${f}: ${fo.id} due.scene ${fo.due.scene} が存在しない`);
  }
  // flagsOutがcampaign.flagsで宣言済みか
  for (const flag of ch.flagsOut || []) {
    if (!(flag in campaign.flags)) errors.push(`${f}: flagsOut "${flag}" がcampaign.jsonで未宣言`);
  }
  // 敵とlootの正名がエンティティ台帳にあるか(正名の原則)
  const names = new Set(campaign.entities.map(e => e.ja));
  for (const sc of ch.scenes) {
    if (sc.enemy && !names.has(sc.enemy.name)) errors.push(`${f}: sc${sc.id} 敵 "${sc.enemy.name}" が台帳にない`);
    for (const raw of sc.loot) {
      const item = typeof raw === "string" ? raw : raw.name; // lootは文字列または{name, requires}(mock2 v0.1スキーマ)
      // ponytail: 「心石の欠片」のような派生名は先頭一致で台帳照合する。厳密な派生ルールは台帳粒度の議論(CAMPAIGN_01 5章-5)待ち
      if (![...names].some(n => item.startsWith(n) || n.startsWith(item))) errors.push(`${f}: sc${sc.id} loot "${item}" が台帳にない`);
    }
  }
}

if (errors.length) { console.error("NG:\n" + errors.map(e => "・" + e).join("\n")); process.exit(1); }
console.log("OK: campaign.json + 章データの整合性に問題なし");
