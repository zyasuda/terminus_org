/* 画面が出せる移動の操作が、必ずその出口へ通ることの検査。
 *
 * 2026-08-20の実プレイで、シーン6から先へ進めなくなった。チップが作った
 * 「奥に進む」が作者の照合語「奥へ進む」に一致せず(助詞1文字)、しかも
 * 移動は2つの関門を続けて通る作りだったため、片方だけ通って詰んでいた。
 *   (1) MOVE_RE / BACK_RE に一致 → 移動レーンへ入る
 *   (2) resolveExit(部分一致) → 出口が決まる
 *
 * ゲームブックは候補ボタンなので、この穴が原理的に出ない。mock2の通しプレイ検査も
 * 「作者の語をそのまま打つ」ため見逃していた。ここでは exitDeclaration が作る文
 * ——画面のチップ・GMの聞き返し・通しプレイ検査が共有する、唯一の移動の文——が
 * 両方の関門を通ることを、章データの全出口について確かめる。
 *
 * 使い方: node src/engine/moveChip.test.mjs
 *         MOCK2_PUBLIC_DIR=... CAMPAIGN=lanternhill CHAPTER_ID=chapter_01 node ...
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MOVE_RE, BACK_RE, exitDeclaration, resolveExit } from "./progression.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = process.env.MOCK2_PUBLIC_DIR || path.join(HERE, "..", "..", "public");
const campaign = process.env.CAMPAIGN || "lanternhill";
const chapterId = process.env.CHAPTER_ID || "chapter_01";
const chapter = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, "data", "campaigns", campaign, `${chapterId}.json`), "utf8"));

let fail = 0, checked = 0;
function check(label, cond, detail) {
  checked++;
  if (cond) { console.log("  ok  " + label); return; }
  console.log("  NG  " + label);
  if (detail) console.log("        " + detail);
  fail++;
}

console.log(`章: ${chapter.title || chapterId} / シーン${(chapter.scenes || []).length}件\n`);

for (const scene of chapter.scenes || []) {
  const exits = (scene.exits || []).filter(e => (e.match || []).some(Boolean));
  if (!exits.length) { console.log(`── シーン${scene.id} ${scene.name}: 出口なし`); continue; }
  console.log(`── シーン${scene.id} ${scene.name}`);
  for (const exit of exits) {
    const decl = exitDeclaration(exit);
    const where = `シーン${scene.id} → ${exit.to}`;
    check(`${where}: チップの文がある（「${decl}」）`, Boolean(decl),
      `match=${JSON.stringify(exit.match)}`);
    if (!decl) continue;
    // (1) 移動レーンへ入るか。入らないと調査や分類器へ流れ、シーンは動かない
    check(`${where}: 移動の動詞を含む`, MOVE_RE.test(decl) || BACK_RE.test(decl),
      `「${decl}」に ${MOVE_RE.source} も ${BACK_RE.source} も無い`);
    // (2) その出口に解決するか。他の出口に吸われる(照合語の被り)のもここで落ちる
    const hit = resolveExit(scene, decl);
    check(`${where}: その出口に解決する`, hit === exit,
      hit ? `「${decl}」が別の出口(to ${hit.to} / match ${JSON.stringify(hit.match)})に吸われている`
          : `「${decl}」がどの出口にも一致しない`);
    /* 助詞の揺れ(手打ち・音声入力)でも同じ出口に着くこと。resolveExitが「に」「へ」を
       寄せてから照合する保険が効いているかを見る。2026-08-20に詰まった実入力がこれ */
    const swapped = decl.replace(/へ/g, "に");
    if (swapped !== decl) {
      const hit2 = resolveExit(scene, swapped);
      check(`${where}: 助詞を替えた「${swapped}」でも同じ出口`, hit2 === exit,
        hit2 ? `to ${hit2.to} に行った` : "どの出口にも一致しない");
    }
  }
}

/* 実プレイで詰まった組み合わせ。作者の語が「奥へ進む」だけの時、チップが
   組み立てる「奥に進む」では通らない——これは仕様として受け入れる(だから
   移動チップは組み立てさせず、上のexitDeclarationの文を丸ごと入れる)。
   ここではその前提が変わっていないことだけ確認しておく */
{
  const scene6 = (chapter.scenes || []).find(s => String(s.id) === "6");
  if (scene6) {
    console.log("\n── 2026-08-20に詰まった場面(前提の確認)");
    check("シーン6: チップの文なら通る", resolveExit(scene6, exitDeclaration(scene6.exits[0])) === scene6.exits[0]);
  }
}

console.log(`\n${fail ? `${fail}件 失敗` : "全て通過"}（${checked}件）`);
process.exit(fail ? 1 : 0);
