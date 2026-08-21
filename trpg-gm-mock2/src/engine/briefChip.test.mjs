/* 場面説明(brief)に書かれた語がチップになり、書かれていない語は漏れないことの検査。
 *
 * 2026-08-20: シーン1の場面説明に「レール」があるのに、一度手で打つまでチップにならず、
 * 読んだものに触れられなかった。未開示の秘密でもチップに出すよう変えたが、出すのは
 * 「作者が場面説明へ書いた語」だけに限る。entity名やaliasesをそのまま並べると、
 * 「柵の内側」「灯りの番人の正体」のように場面説明より踏み込んだ名前が漏れる。
 *
 * ここは語の選び方(純関数briefWord)だけを見る。「いつチップに出すか」——導入では出さず、
 * 場面へ入ってから出す、場面が変わったら落とす——は stagnationHint.test.mjs で見る。
 *
 * 使い方: node src/engine/briefChip.test.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = process.env.MOCK2_PUBLIC_DIR || path.join(HERE, "..", "..", "public");
const campaign = process.env.CAMPAIGN || "lanternhill";
const chapterId = process.env.CHAPTER_ID || "chapter_01";

// index.js はブラウザAPIを触るので、最小の代役を置いてから読み込む
const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
globalThis.location = { search: "" };
mem.set("terminus_gm_mode_v1", "scripted");
globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
const { briefWord } = await import("./index.js");

const chapter = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, "data", "campaigns", campaign, `${chapterId}.json`), "utf8"));

let fail = 0;
function check(label, cond, detail) {
  if (cond) { console.log("  ok  " + label); return; }
  console.log("  NG  " + label);
  if (detail) console.log("        " + detail);
  fail++;
}

console.log(`章: ${chapter.title || chapterId}\n`);

// 作者が場面説明に書いた語だけが出ること。全シーン・全秘密で確かめる
for (const scene of chapter.scenes || []) {
  const brief = scene.brief || "";
  const rows = (scene.secrets || []).map(s => [s, briefWord(s, brief)]);
  console.log(`── シーン${scene.id} 「${brief}」`);
  for (const [secret, word] of rows) {
    if (!word) { console.log(`  --  ${secret.entity}: 場面説明に無いのでチップにしない`); continue; }
    check(`${secret.entity} → チップ「${word}」`, brief.includes(word),
      `「${word}」は場面説明に無い(これが出ると未読の情報が漏れる)`);
    const vocab = [secret.entity, ...(secret.aliases || [])];
    check(`${secret.entity} → 「${word}」はその秘密を指す語である`, vocab.includes(word),
      `照合辞書 ${JSON.stringify(vocab)} に無い語を出している`);
  }
}

// 具体例。作者が今日挙げた「レール」と、漏れてはいけない「柵の内側」
{
  console.log("\n── 具体例");
  const s1 = (chapter.scenes || []).find(s => String(s.id) === "1");
  const rail = (s1?.secrets || []).find(s => s.entity === "レール");
  check("シーン1「レール」がチップになる", rail && briefWord(rail, s1.brief) === "レール");

  const s6 = (chapter.scenes || []).find(s => String(s.id) === "6");
  const inside = (s6?.secrets || []).find(s => s.entity === "柵の内側");
  const w = inside ? briefWord(inside, s6.brief) : "";
  check(`シーン6「柵の内側」は場面説明の語「${w}」で出す(entity名を出さない)`, w === "柵",
    `実際: 「${w}」`);

  const s3 = (chapter.scenes || []).find(s => String(s.id) === "3");
  const keeper = (s3?.secrets || []).find(s => s.entity === "灯りの番人の正体");
  const kw = keeper ? briefWord(keeper, s3.brief) : "";
  check(`シーン3「灯りの番人の正体」に「番人」を出さない(実際: 「${kw}」)`, !kw.includes("番人"));

  const s7 = (chapter.scenes || []).find(s => String(s.id) === "7");
  const rock = (s7?.secrets || []).find(s => s.entity === "青白い岩肌");
  const rw = rock ? briefWord(rock, s7.brief) : "";
  check(`シーン7「青白い岩肌」は主名詞側の「岩肌」にする(実際: 「${rw}」)`, rw === "岩肌");

  // 場面説明が空なら何も出さない(漏れの逆方向の安全確認)
  check("場面説明が空ならチップにしない", briefWord({ entity: "レール", aliases: ["軌道"] }, "") === "");
  /* 修飾語より主名詞を選ぶ(entityの末尾一致を優先する規則そのものの確認)。
     entityがそのまま場面説明に書かれている時は、それが一番具体的な語なので採る
     (作者が書いた語であり、何も隠していない) */
  const gear = { entity: "錆びついた歯車", aliases: ["歯車", "錆びついた"] };
  check("修飾語より主名詞を選ぶ", briefWord(gear, "歯車が転がっている。錆びついた音がする。") === "歯車");
  check("entityが場面説明にそのまま書かれていればそれを使う",
    briefWord(gear, "錆びついた歯車が転がっている。") === "錆びついた歯車");
}

console.log(fail ? `\n${fail}件 失敗` : "\n全て通過");
process.exit(fail ? 1 : 0);
