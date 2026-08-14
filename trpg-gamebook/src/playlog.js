export const FIX_FIELDS = Object.freeze({
  "": new Set(["name", "brief", "blockedText", "greeting"]),
  secret: new Set(["text", "surface"]),
  exit: new Set(["text", "blockedText", "npcSay", "arrivalText"]),
  encounter: new Set(["onsetText"]),
  decision: new Set(["prompt"])
});

export function revisionOf(markdown) {
  const first = String(markdown ?? "").split(/\r?\n/, 1)[0];
  return first.match(/^# .*?[（(]([^（）()]*)[）)]\s*$/)?.[1].trim() || "";
}

const nodeFor = (chapter, scene) => scene === "intro" ? chapter?.intro : scene === "ending" ? chapter?.ending : (chapter?.scenes || []).find(node => String(node.id) === String(scene));
const sceneLabel = (chapter, node, scene) => scene === "intro" ? "イントロ" : scene === "ending" ? "エンディング" : `シーン${(chapter?.scenes || []).indexOf(node) + 1}`;
const targetLabel = { secret:"調べられるもの", exit:"行き先", encounter:"遭遇", decision:"決断" };
/* AIは "secret:s1a" と書くよう指示しても "s1a" とだけ返してくる(実測4件中4件)。
   IDそのものは正しいので、頭書きが無ければ場面の中から探して補う。
   同じIDが2種類にまたがる場合だけ、どれか決められないので諦める */
function targetIn(node, target) {
  if (target === "" || target === undefined) return ["", node];
  if (target === "decision") return node.decision ? ["decision", node.decision] : [];
  const [, prefix, rest] = /^(secret|exit|encounter):(.+)$/.exec(target) || [];
  const id = prefix ? rest : target;
  const found = ["secret", "exit", "encounter"]
    .filter(kind => !prefix || kind === prefix)
    .flatMap(kind => (node[`${kind}s`] || []).filter(item => String(item.id) === String(id)).map(item => [kind, item]));
  return found.length === 1 ? found[0] : [];
}

export function locate(chapter, fix = {}) {
  const node = nodeFor(chapter, fix.scene);
  if (!node) return null;
  const [kind, holder] = targetIn(node, fix.target);
  if (!holder) return null;
  // 場面名だけでは、秘密が5つある場面でどれの話か分からない。対象そのものの名前を出す
  const own = holder.entity || holder.enemy?.name || (holder.match || [])[0] || "";
  const label = `${sceneLabel(chapter, node, fix.scene)} / ${own || node.name || "名前のない場面"}${targetLabel[kind] ? `（${targetLabel[kind]}）` : ""}`;
  return { node, holder, kind, label };
}

export function currentText(chapter, fix) {
  const found = locate(chapter, fix);
  return typeof found?.holder?.[fix?.field] === "string" ? found.holder[fix.field] : "";
}

export function applyFix(chapter, fix = {}) {
  if (fix.kind !== "data" || typeof fix.after !== "string") return false;
  const found = locate(chapter, fix);
  // 書き換えてよい欄かは、見つけた対象の種類で決める(entity や match はここに無い)
  if (!found || !FIX_FIELDS[found.kind]?.has(fix.field)) return false;
  found.holder[fix.field] = fix.after;
  return true;
}

export function parseFixes(raw) {
  try {
    const match = String(raw ?? "").match(/```json\s*([\s\S]*?)\s*```/i);
    const fixes = match && JSON.parse(match[1]).fixes;
    return Array.isArray(fixes) ? fixes.filter(item => item && typeof item === "object").slice(0, 20) : [];
  } catch {
    return [];
  }
}
