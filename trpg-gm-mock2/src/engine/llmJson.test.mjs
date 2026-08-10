/* ローカルSLMが出すJSONの定型的な崩れを復元できることの回帰テスト。
   実行: npm run test:llmjson

   例文は2026-08-10の実プレイ(Qwen3.5-9B-Holodeck-Lounge)のログから採った、
   実際に解析に失敗した本物の出力。当時は救出処理がnarrationだけを拾ったため、
   同行者の台詞が7件失われた。 */
import { parseLlmJson } from "./index.js";

let ng = 0;
const eq = (got, want, label) => {
  if (got !== want) { console.error(`NG ${label}\n   got:  ${got}\n   want: ${want}`); ng++; }
};

// 実ログの破損1: オブジェクトを閉じた直後に新しい { を開く
{
  const raw = '{"narration":"人影はゆっくりとこちらへ近づいてくる。","companion":{"who":"member_1","say":"待って、急ぐなよ。挨拶くらいはするべきだろ？","aside":false},"npc":{"say":"……お帰りなさいませ。"},{"check":null,"state_updates":null,"engage_enemy":false,"flee_enemy":false,"scene_complete":false,"meta_request":null}';
  const j = parseLlmJson(raw);
  eq(j.narration, "人影はゆっくりとこちらへ近づいてくる。", "閉じ直後の{ : narrationが取れる");
  eq(j.companion.say, "待って、急ぐなよ。挨拶くらいはするべきだろ？", "閉じ直後の{ : 同行者の台詞が失われない");
  eq(j.check, null, "閉じ直後の{ : 後続フィールドも取れる");
}

// 実ログの破損2: 閉じ引用符が全角
{
  const raw = '{"who":"member_1","say":"なるほど…つまり、守るためにここにいるってことか？皮肉にも、平和な理由だぜ。”}';
  eq(parseLlmJson(raw).say, "なるほど…つまり、守るためにここにいるってことか？皮肉にも、平和な理由だぜ。", "全角の閉じ引用符");
}

// 正常なJSONは素通りする
{
  const raw = '{"narration":"扉が軋む。","companion":null,"check":null}';
  const j = parseLlmJson(raw);
  eq(j.narration, "扉が軋む。", "正常なJSONを壊さない");
  eq(j.companion, null, "正常なJSON: nullを保つ");
}

// コードフェンス付き・前後に余計な文字がある場合
{
  eq(parseLlmJson('```json\n{"say":"やあ。"}\n```').say, "やあ。", "コードフェンスを剥がす");
  eq(parseLlmJson('了解しました。{"say":"やあ。"}').say, "やあ。", "前置きがあっても本体を拾う");
}

// 復元不能なものは例外にする(黙って壊れた値を返さない)
{
  let threw = false;
  try { parseLlmJson("これはJSONではありません"); } catch (e) { threw = true; }
  if (!threw) { console.error("NG 復元不能なら例外を投げる"); ng++; }
}

console.log(ng ? `llmJson: NG ${ng}件` : "llmJson: OK");
process.exit(ng ? 1 : 0);
