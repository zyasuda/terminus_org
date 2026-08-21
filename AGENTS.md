# trpg-gm-isometric — 作業ガイド

共通ルールは [Terminus/CLAUDE.md](../CLAUDE.md) を参照する。

このファイルは 2026-08-20 に書き直した。それ以前はBORG(Obsidian Vault)の設定が入っており、
このプロジェクトについて1行も書かれていなかった。そのため「作業開始時にまず
`/Users/yasuda_k/Downloads/BORG/INDEX.md` を読む」という無関係な指示から始まり、
下に書いた「章データの正本」の規則がどのエージェントにも届いていなかった。

## これは何か

mock2(会話エンジン)から派生した、**アイソメトリック表示と遠征モジュール**の試作。
このプロジェクト固有の中身は次の3つで、それ以外(`src/engine/`、`src/App.jsx` 等)は
mock2からの複製である。

| 場所 | 中身 |
|---|---|
| `src/expedition/` | 遠征。地図生成・階層・戦闘状態・宝箱・帰還 |
| `src/stage/` | 固定舞台(分かれ道、灯りの部屋) |
| `src/battle/` | 戦闘グリッド |

## 絶対に守ること

### 1. 章データを直接編集しない

正本は **`../scenario/lanternhill/`** だけ。`public/data/campaigns/` は配布された生成物である。

```
scenario/lanternhill/chapter_01.json      ← 直すのはここだけ
        ↓  node scripts/distribute-scenario.mjs --write   (リポジトリ直下で実行)
trpg-gm-isometric/public/data/campaigns/lanternhill/chapter_01.json
```

`public/data/` を直したものは、次の配布で黙って消える。詳細は親の `Terminus/CLAUDE.md`。

### 2. 隣のフォルダを書き換えない

| 場所 | 扱い |
|---|---|
| `../trpg-gm-mock2/` | **読むだけ。** 動いている作品 |
| `../trpg-gamebook/` | **読むだけ。** 動いている作品 |
| `../trpg-rogue-map/` | `src/expedition/mapgen.js` の上流。読むだけ |

### 3. 判定に `Math.random` を使わない

遠征は seed で再現できることが前提である。地図生成・遭遇・宝箱・障害物・ダイスはすべて
`makeRng(seed)` から引く。系列が重ならないようオフセットを分けてある
(`floor.seed+91`、`+441`、`+555`、`+777`)。演出(塵・雨・カメラ揺れ)だけは `Math.random` でよい。

## 足回り

```bash
npm test                  # 進行・通しプレイ・シナリオ・所持品・戦闘/遠征
npm run test:battle       # 戦闘と遠征だけ(速い)
npm run build
npm run check:assets
npm run dev               # vite
npm run smoke:expedition  # 別途 dev サーバが要る(https://127.0.0.1:5174)。npm test には入っていない
```

`npm test` は `&&` で連結しているので、**前の段が落ちると後ろは1件も走らない。**
2026-08-20 に `progression` が2件落ちていたため、戦闘と遠征のテストが全く動いていなかった。

そこで**このプロジェクト固有の検査(`test:battle`)を先頭に置いた。** mock2由来の
`playthrough` は下記の理由で落ちるので、後ろに置かないと本体の検査が隠れる。

- **緑であるべき門は `npm run test:battle`**(戦闘・遠征・固定舞台)。ここが落ちたら直す
- `npm test` 全体は `playthrough` のぶん赤いまま(exit 1)。これは既知で、下の「現状」の通り

## 現状(2026-08-20 時点。確認済みの事実)

- **`npm test` の通しプレイ(`playthrough`)は落ちる。** `src/engine/` がmock2の
  2026-08-05 時点の複製で止まっており、章データ(2026-08-20)が要求する挙動に追いついていない。
  mock2側にあってこちらに無い関数の例: `hiddenBubbles` `turnGuard` `exitDeclaration`
  `stagnationHint` `briefWord` `findableSecret` `examinable` `progressItems` `speakRecheck`。
  症状は3つ — イントロの秘密が開かない / シーン3で詰む / scriptedモードでLLMを152件呼ぶ。
  **同期しない(2026-08-21 作者の判断)。** isometricはmock2との連携を一旦止め、単独で
  動くように作っている方針のため、会話エンジンを追随させる必要が無い。
  したがってこの8件は**既知の赤**として残す。落ちていること自体が問題ではないので、
  直そうとしてmock2からコードを持ち込まないこと。
- `progression` と `test:battle` は緑。
- 遠征の判定コードに `Math.random` は無い(確認済み)。
- **同行者が倒れた後(HP0)の扱いは未実装。これは既知で、直さない(2026-08-21 作者の判断)。**
  HP0のまま遠征が続き、次の戦闘も0で始まって一度も行動できない。戻す手段は回復薬だけ。
  いま作者は遠征を単独で動作確認している段階なので、蘇生・戦闘不能の規則はまだ決めていない。
  ゲームの設計判断なので、コード側で勝手に補わないこと(`Math.max(1, hp)` で踏みとどまらせる、
  帰還時に全回復させる等は、どれも作者が決める話)。決めるときはブレストから始める。

## 書き方

- 判定と描画を混ぜない。`src/expedition/mapgen.js` は純関数、`RogueMap.jsx` は描画だけ
- **描画の途中で例外を投げない。** Reactツリーごと消えて白画面になる
  (2026-08-20: `rerouteCorridorsWithRetry` が throw していて、地図の約2%で遠征が完走不能だった)
- コメントは**なぜそうしたか**を書く。実測した数字を残す

## 報告

- 変更したファイルと、検証で実際に確かめたことを書く
- 確認できた事実と、推測で補った内容を混ぜない
- 未検証のまま「完了」と言わない
