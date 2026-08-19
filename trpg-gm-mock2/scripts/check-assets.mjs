// TAS出力(public/data/*.json + images/*)の検証ツール。
// TAS側が出した章データ・素材台帳と、mock2の実参照・実ファイルの整合を機械チェックする。
// (Inbox/TAS連携とmock2実装手順_2026-07-14 の依頼: npcSprite参照、usedBy不一致、
//  approved未配置、参照済み未登録、approved未使用の検出)
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const imageDir = join(root, "images");
const manifestPath = join(root, "public/data/assets.json");
const catalogPath = join(root, "public/data/campaigns.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const campaignEntry = catalog.campaigns?.find(c => c.id === catalog.defaultCampaign) || catalog.campaigns?.[0];
if (!campaignEntry) throw new Error("campaigns.json にキャンペーンがありません");
const chapterId = campaignEntry.defaultChapter || campaignEntry.chapters?.[0]?.id;
const chapterEntry = campaignEntry.chapters?.find(c => c.id === chapterId) || campaignEntry.chapters?.[0];
if (!chapterEntry?.file) throw new Error(`${campaignEntry.id} に章ファイルがありません`);
const chapterPath = join(root, "public/data", chapterEntry.file);
const chapter = JSON.parse(readFileSync(chapterPath, "utf8"));
const errors = [];
const warnings = [];

// ---- 参照収集 ----
// usedByと同じ表記(chapter_01.scenes.<sceneId>.… / secrets.<secretId>.…)で
// 実参照を集める。配列indexではなくidを使うことでusedByと突き合わせできる。
const refs = new Map(); // file -> Set<path>
function addRef(file, path) {
  if (!refs.has(file)) refs.set(file, new Set());
  refs.get(file).add(path);
  checkRef(file, path);
}
// イントロ・アウトロもシーンと同じ項目を持つので、走査は1つの関数にまとめる。
// scenesしか見ていなかったため、イントロ・アウトロの画像を「未参照」と誤判定していた(2026-07-30)。
function scanNode(node, base) {
  if (!node || typeof node !== "object") return;
  if (typeof node.img === "string") addRef(node.img, `${base}.img`);
  if (typeof node.npcSprite === "string") addRef(node.npcSprite, `${base}.npcSprite`);
  if (node.parallax && typeof node.parallax === "object") {
    if (typeof node.parallax.sky === "string") addRef(node.parallax.sky, `${base}.parallax.sky`);
    if (typeof node.parallax.fg === "string") addRef(node.parallax.fg, `${base}.parallax.fg`);
  }
  if (node.enemy) {
    if (typeof node.enemy.img === "string") addRef(node.enemy.img, `${base}.enemy.img`);
    if (typeof node.enemy.sprite === "string") addRef(node.enemy.sprite, `${base}.enemy.sprite`);
  }
  /* encounters[].enemy.sprite も実際に画面へ出る絵。ここを見ていなかったため、
     場面直下のenemyから同じ絵が参照されている間だけ偶然検査が通っており、
     場面3の敵を廃止した途端に「使われていない」と誤報した(2026-08-19)。
     遭遇でしか使われないスプライトは、欠落しても検査を素通りしていた */
  for (const enc of node.encounters || []) {
    const e = enc.enemy || {};
    const at = `${base}.encounters.${enc.id}.enemy`;
    if (typeof e.img === "string") addRef(e.img, `${at}.img`);
    if (typeof e.sprite === "string") addRef(e.sprite, `${at}.sprite`);
  }
  for (const s of node.secrets || []) {
    if (typeof s.img === "string") addRef(s.img, `${base}.secrets.${s.id}.img`);
    if (typeof s.bg === "string") addRef(s.bg, `${base}.secrets.${s.id}.bg`);
  }
}
for (const sc of chapter.scenes) scanNode(sc, `${chapterId}.scenes.${sc.id}`);
scanNode(chapter.intro, `${chapterId}.intro`);
scanNode(chapter.ending, `${chapterId}.ending`);

// キャンペーン画像・同行者の立ち絵も台帳のusedByに書かれているので、実参照として集める。
const campaignPath = join(root, "public/data", `campaigns/${campaignEntry.id}/campaign.json`);
if (existsSync(campaignPath)) {
  const campaign = JSON.parse(readFileSync(campaignPath, "utf8"));
  if (typeof campaign.image === "string") addRef(campaign.image, "campaign.image");
  for (const c of campaign.companions || []) {
    if (typeof c.sprite === "string") addRef(c.sprite, `campaign.companions.${c.id}.sprite`);
  }
}

// 参照されているのに未登録 / approvedなのに未配置
function checkRef(file, usage) {
  const entry = Object.values(manifest.assets).find(item => item.file === file);
  if (!entry) {
    errors.push(`${usage}: ${file} がassets.jsonに登録されていません`);
    return;
  }
  if (!existsSync(join(imageDir, file))) {
    const message = `${usage}: images/${file} が未配置です (status=${entry.status})`;
    if (entry.status === "approved") errors.push(message);
    else warnings.push(message);
  }
}

// ---- 台帳側の検査 ----
for (const [id, entry] of Object.entries(manifest.assets)) {
  const actual = [...(refs.get(entry.file) || [])].sort();
  // usedByのうち "ui." で始まるものはコード直参照(App.jsx等)の手動登録なので突き合わせ対象外
  const declared = (entry.usedBy || []).filter(u => !u.startsWith("ui.")).sort();

  // status=archived は images-unused/ へ退避した素材。未配置でもエラーにしない。
  // 実際に参照されていればcheckRef側でエラーになるので、取り違えは検出できる。
  if (entry.status === "archived") {
    if (actual.length) errors.push(`${id}: archivedなのに参照されています 実参照=[${actual}]`);
    continue;
  }
  if (entry.status === "approved" && !existsSync(join(imageDir, entry.file))) {
    errors.push(`${id}: approvedなのにimages/${entry.file}がありません`);
  }
  if (entry.status === "approved" && actual.length === 0 && (entry.usedBy || []).length === 0) {
    warnings.push(`${id}: approvedなのにどこからも使われていません(usedByも空)`);
  }
  if (JSON.stringify(actual) !== JSON.stringify(declared)) {
    warnings.push(`${id}: usedByと実参照が食い違っています usedBy=[${declared}] 実参照=[${actual}]`);
  }
}

console.log(`Asset check: ${Object.keys(manifest.assets).length} manifest entries, ${refs.size} referenced files`);
for (const warning of warnings) console.warn(`WARN ${warning}`);
for (const error of errors) console.error(`ERROR ${error}`);
if (errors.length) process.exit(1);
console.log(warnings.length ? `Asset check passed (${warnings.length} warnings).` : "Asset check passed.");
