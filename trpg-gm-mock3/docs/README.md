# mock3 docs

2026-11-06 から、mock3 の仕様・決定・実装状況の正本はこのフォルダ。BORG(Obsidian)の `TRPG/Mock3/` は 2026-10-30 に使用を止めた。そこにある12本(2026-10-02〜10-16)の内容をここへ再構築した。

| ファイル | 中身 |
|---|---|
| [SPEC.md](SPEC.md) | 企画の芯、人物、シナリオの流れ、機能ごとの決定・撤回・未決 |
| [STATUS.md](STATUS.md) | どこまで完成したか、検査の実測、作業途中の項目 |
| [CLIENT_PLATFORM.md](CLIENT_PLATFORM.md) | 先方から受け取った資料(コンセプト・技術スタック・遊び方の流れ…)。受け取るたびに追記 |
| [PLATFORM_FIT.md](PLATFORM_FIT.md) | 先方資料と mock3 の対応、先方に確かめたいこと |
| [mock3-guide.html](mock3-guide.html) | 人向けの紹介ページ。遊び方・画面例・実装済み/未実装を図入りで説明 |
| [mock3-implementation-spec.html](mock3-implementation-spec.html) | ソースを見ずに再制作するための実装仕様(ルール・AIへの指示文の原文・画面・立体舞台・固定データ・受け入れ検査)。`spec-src/` から `python3 docs/spec-src/build.py` で作る。HTMLを直接直さない |
| [EPHEMERA.md](EPHEMERA.md) | 同じ世界観のゲーム(Standee-wiz)から取り込んだもの(タイトル画面・一言)と、流用できる素材・用語 |
| [spec-src/](spec-src/README.md) | 実装仕様の組み立て一式(章の本文・取り出しと組み立てのスクリプト・画面写真の撮影) |
| [SPEC_consent.md](SPEC_consent.md) | Codexへの実装依頼書(汎用の合意)。実装済み: e9efb0e |
| [SPEC_playtest-fixes.md](SPEC_playtest-fixes.md) | Codexへの実装依頼書(試遊で止まった2件)。実装済み: fd3c2a5 |

- 経緯の詳しい記録は `prototype/README.md`(作業ログ)にある。ここには写さない。
- 決定が変わったら SPEC.md を直し、STATUS.md の実測と日付を更新する。

## 元にした BORG の資料

企画書 第1章の骨組み、企画書の裏付け、リプレイ「灯りの番人」、協議の引き継ぎ(10-02〜10-05)、コード健全性レビュー(10-05)、エンジンとシナリオの分離(10-06)、戦闘画面と坑道内天候(10-06)、ジオラマ舞台の演出拡張(10-06〜10-09)、灯石の設定と仕様(10-07〜10-08)、EmbeddingGemma 2 の会話検索試験(10-07)、スタンディー着せ替え工房(10-09〜10-16)。

企画書の出典一覧(11件)とリプレイ本文は BORG 側にだけある。必要になったら、その時点で該当部分をここへ移す。
