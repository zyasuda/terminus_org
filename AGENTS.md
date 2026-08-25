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

### 4. スタンディー(アクリル板の駒)を作るとき

**正本は [`docs/STANDEE_TURNAROUND_SPEC.md`](docs/STANDEE_TURNAROUND_SPEC.md)。作業前に全文読む。**

板の外形は前後で1つしか作れないので、**前後のシルエットが食い違うとその差が
そのまま「人物のいない余白」になる。** 板の作り方(和・距離場の平均など)をどう
工夫しても消えない。2026-08-24に3通り試して、いずれも解決しなかった(仕様書 第1節)。

**前面と背面は必ず1回の生成で1枚の横長画像として描かせる。** 別々に生成して
言葉でポーズを合わせる方法は3回試して一度も収束しなかった(余白5.09%/4.21%、XOR 20%台)。
1枚生成は1回目で合格した(余白2.50%、XOR 11.81%)。2026-08-25に実測で決着している。

手順はこれだけ。**検査に合格するまで3D化へ進んではならない。**

```bash
# 1. 依頼文は docs/STANDEE_GENERATION_BRIEF_TEMPLATE.md の【】だけ埋めて使う
#    (それ以外の条項は毎回同じ。すべて実際の失敗から出たもの)

# 2. 受け入れ検査。切り分け・余白・色・アルファ・穴を一度に見る
npm run accept:standee assets/standee/<name>-standee-<版>-turnaround.png

# 3. output/<name>-standee-<版>-review.png を必ず目で見る
#    検査は余白と素性しか測らない。構図が成立しているかは測らない(仕様書 第8.7節)

# 4. 採用。板テクスチャ・外形マスク・GLB・ゲーム側の参照までまとめて更新される
npm run ship:standee <name> assets/standee/...-front.png assets/standee/...-back.png

# 5. 実画面(別途 dev サーバが要る)
npm run test:battle && npm run build
STANDEE_ONLY=1 SMOKE_URL="http://127.0.0.1:5174/expedition?standee=1" node src/expedition/smoke.mjs
```

**表裏は人が目で見る。** 数値の検査は板の余白と絵の素性しか測らない。
`ship:standee` が毎回 `output/<キャラ名>-standee-<版>-front.png` / `-back.png` を
出すので、まずそれを見る。回して確かめたいときは
`assets/blender/<キャラ名>-standee-<版>.blend` を開く。手順は仕様書 第6.1節。
**開いたら最初にビューポートを「マテリアルプレビュー」にすること**(既定のソリッド
表示では灰色の板にしか見えない)。前面はテンキー`1`、背面は`Ctrl`+テンキー`1`。

**版番号をコードに書かない。** 元絵と板の版の正本は `assets/standee/sources.json`。
`ship:standee` だけが版を上げ、`src/battle/standeeVersion.js` を書き出す。
view3d.js と smoke.mjs はそこを読む。手で3箇所に書いていた頃、更新漏れで
「テクスチャを作り直しても画面が変わらない」事故が起きた(仕様書 第8.4節)。

合否を決めるのは**板に出る余白**である(上限5%)。輪郭のずれやシルエットの食い違いは
参考値で、余白が超えたときに原因の部位を探すために使う。
原因の部位は `npm run diff:standee <name>` で出る。

2026-08-25時点で、リディア(v16-front + v28-back)・ガレス(v37)とも**合格**している。
板とGLBは v43。**スタンディは本番のバトルの既定**で、`?standee=1` のような
URLフラグは廃止した。表示するモデルは `battleConfig.js` の `units.*.modelId` が正本。

板の余白は `standee-lib.mjs` の `MARGIN_RATIO`(3%)、余白のうっすらした色は
`build-standee-acrylic.mjs` の `PLATE_ALPHA`(0.05)で決める。0.05 は
`view3d.js` の `alphaTest`(0.04)があるため実質の下限である。

背面画像が無い場合、正面画像や白いシルエットから推測して3D化しない。

#### Skillについて

`sprite-pipeline` はアニメーションスプライトの連番生成用で、**前後2面図の対応付けは
扱っていない。** 2026-08-24までこれを必須としていたが、タスクに合っていなかった。
二面図については上記の仕様書に従う。

- **条件付き: `web-3d-asset-pipeline`** — Blenderのメッシュ・法線・材質・GLB出力を検査する場合
- **条件付き: `game-playtest`** — Blender確認とThree.js実画面をスクリーンショットで検証する場合
- **条件付き: `imagegen`** — 背面設定画などの2D画像を新規作成・修正する場合

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
