// 動詞チップの学習で「名詞+動詞」がまるごと1語として登録されてしまう不具合の回帰テスト。
// (チップ2連打で助詞なしの「見取り図調べる」が入力され、それが動詞として貯まっていた)
// 併せて「最初から」で学習辞書が初期化されることも見る(2026-08-21)。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = process.env.MOCK2_PUBLIC_DIR || path.join(HERE, "..", "..", "public");
const mem = new Map();
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k)
};
globalThis.location = { search: "" };
mem.set("terminus_gm_mode_v1", "scripted");
globalThis.fetch = async url => {
  const u = String(url);
  if (u.startsWith("/data/")) {
    const file = path.join(PUBLIC_DIR, u);
    if (!fs.existsSync(file)) return { ok: false, status: 404, json: async () => null };
    return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(file, "utf8")) };
  }
  return { ok: false, status: 503, json: async () => ({}) };
};

const eng = await import("./index.js");
const { extractVerb, joinParticle } = eng;
const { getSnapshot } = await import("./store.js");

let ng = 0;
const eq = (got, want, label) => {
  if (got !== want) { console.error(`NG ${label}: ${JSON.stringify(got)} != ${JSON.stringify(want)}`); ng++; }
};

eq(extractVerb("作業札を調べる"), "調べる", "助詞ありは従来どおり");
eq(extractVerb("見取り図調べる"), "調べる", "助詞なしでも既知動詞で切り出す");
eq(extractVerb("金属音よく見る"), "よく見る", "長い既知動詞を優先して後方一致");
eq(extractVerb("坑道の奥へ進む"), "進む", "助詞へ");
eq(extractVerb("扉をこじあける"), "こじあける", "未知動詞も5文字までは学習する");
eq(extractVerb("見取り図をじっくり観察してから動く"), null, "長すぎる未知語は学習しない");
eq(extractVerb("マイラ"), null, "動詞語尾でなければ学習しない");

eq(joinParticle("見取り図", "を"), "を", "名詞の後は助詞を挟む");
eq(joinParticle("坑道", "に"), "に", "動詞ごとに助詞が変わる");
eq(joinParticle("", "を"), "", "空欄には助詞を挟まない");
eq(joinParticle("扉を", "を"), "", "すでに助詞で終わっていれば挟まない");
eq(joinParticle("マイラ、", "に"), "", "読点の後には挟まない");

/* 「最初から」で学習した動詞を捨てる。この辞書はセーブとは別枠(localStorage)で7日間
   持つため、消さないと前の周の動詞が新しい周のチップに並ぶ。2026-08-21の実プレイ動画で、
   導入で使った「受け取る」がシーン1でも出ていて前の場面の残りに見えた */
const VERB_KEY = "terminus_verb_freq_v1";
const SEEDS = ["調べる", "よく見る", "話しかける", "進む", "戻る", "攻撃する"];
await eng.boot();
const chips = () => getSnapshot().verbChips.map(c => c.v);
mem.set(VERB_KEY, JSON.stringify({
  "受け取る": { n: 9, t: Date.now() },
  "嗅ぎ回る": { n: 8, t: Date.now() }
}));
eng.resetGame();
{
  const after = chips();
  eq(localStorage.getItem(VERB_KEY), null, "最初からで学習辞書そのものが消える");
  eq(after.includes("受け取る"), false, "最初からで学習した動詞がチップから消える");
  eq(after.includes("嗅ぎ回る"), false, "学習した動詞は1つも残らない");
  eq(JSON.stringify(after), JSON.stringify(SEEDS), "シードの6語に戻る");
}

console.log(ng ? `verbChip: NG ${ng}件` : "verbChip: OK（学習の切り出し + 最初からの初期化）");
process.exit(ng ? 1 : 0);
