// 動詞チップの学習で「名詞+動詞」がまるごと1語として登録されてしまう不具合の回帰テスト。
// (チップ2連打で助詞なしの「見取り図調べる」が入力され、それが動詞として貯まっていた)
import { extractVerb, joinParticle } from "./index.js";

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

console.log(ng ? `verbChip: NG ${ng}件` : "verbChip: OK");
process.exit(ng ? 1 : 0);
