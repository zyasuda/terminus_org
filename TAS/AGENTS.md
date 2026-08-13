# TAS専用作業ガイド

## 適用範囲

このファイルはTASフォルダ内の編集・検証作業に適用します。実装経緯、設計判断、未完了事項は `BORG/Inbox/TAS引き継ぎ.md` を参照します。

## 基本姿勢

- 複雑な内容は、関係が理解しやすくなる場合に図や表で示す
- 簡潔かつ直接的に書き、確認できた事実と推測を区別する
- 調査が必要な場合は、実コードと一次情報源を優先する
- ユーザーの目標と制約から逸脱しない。不用意に質問しない
- 子Agentは必要な場合だけ使い、無意味な並列作業をしない
- 依頼と無関係なリファクタリング、抽象化、データ変更をしない
- 既存のコード、下書き、JSON、画像、他者の変更を保護する
- 実際にテスト・出力・画面確認を行い、見た目だけで完了と判断しない
- 重要な判断、変更、検証結果だけを報告する

## mock2連携の必須手順

シナリオJSON、画像、出力処理を変更する場合は、次の順で確認します。

```text
read-consumer-before-edit
        ↓
minimal-schema-diff
        ↓
check-direction-contradictions（AIへ渡す自由記述を変更する場合）
        ↓
実装・データ変更
        ↓
verify-tas-output（画像・視覚設定を変更した場合）
        ↓
check-scenario-assets（画像・JSON・assets.jsonを変更した場合）
```

UI、保存、読込、画像選択、プレビュー、mock側出力を変更した場合は、`tas-admin-ux`の方針に従い、通常幅と狭い画面幅で操作を確認します。

## 出力契約の絶対ルール

- JSONの項目を追加・削除・意味変更する前に、mock2が実際に読む箇所を確認する
- 出力の入口は `js/43-output-pipeline.js` の `OUTPUT_STEPS` のみとする。`mockCampaignPayload`を包む実装を追加しない
- 同行者IDは登録順に `member_1`、`member_2`、`member_3` とする。ID変更時は、日本語名・画像・発話属性も同じレコードで確認する
- 呼称は `addressTerm` に統一し、`addressing`を追加しない
- 画像JSONにはファイル名だけを保存する。絶対パス、`file://`、Object URL、Data URLを保存しない
- 画像が1枚だけの場合は前景画像として扱う。0枚の場合は警告する
- パララックスには `parallax.sky` と `parallax.fg` を使う。`useParallax`を出力しない
- `scene.enemy`は敵の実体、`encounters[]`は条件付き・任意・ランダム遭遇の条件として分ける
- 出口の条件は、同じシーン内のシーン要素・秘密情報へ解決できるようにする
- `secretsAll`を意図せず`secretsAny`へ変換しない
- 削除済みの`campaignTheme`をAIプロンプトや出力へ復活させない
- 出力JSONを手編集して確認しない。TASの保存・出力経路で確認する

## 主なファイル

| 対象 | ファイル |
|---|---|
| 出力処理の順番 | `js/43-output-pipeline.js` |
| 状態・見本データ | `js/01a-state.js` |
| 下書き保存・読込 | `js/01c-draft.js` |
| 入力検証・AI補助プロンプト | `js/01d-validation.js` |
| シーン・世界設定の描画 | `js/01e-render-scenes.js` |
| キャラクター・モンスター・アイテムの描画 | `js/01g-render-ledgers.js` |
| mock2用JSONの土台 | `js/01i-output.js` |
| 入力イベント・画像受け取り | `js/01k-bind.js` |
| 出口 | `js/02-exit-editor-simple.js` |
| 画像フォルダ | `js/23-image-library.js` |
| 性別・発話属性 | `js/26-cast-attributes.js` |
| フラグ契約 | `js/27-flags-contract.js` |
| 遭遇 | `js/38-encounters.js` |
| 入力時検証・折りたたみ | `js/39-admin-ux.js` |

`index.html`のJavaScript読み込み順は変更しません。クラシックスクリプトのため、番号順が依存関係になっています。新規ファイルは末尾へ追加します。

## 検証

出力に関わる変更後は必ず実行します。

```bash
npm test
```

基準JSONを更新するのは、意図した仕様変更の場合だけです。

```bash
npm run test:update
```

画面・操作に関わる変更後は、少なくとも次を確認します。

1. キャンペーンを読み込む
2. 対象のシーンを選ぶ
3. 編集して保存する
4. 読み込み直す
5. プレビューを更新する
6. `mock側へ出力`を実行する
7. 出力ファイル名、エラー、画像の「現在使用中」を確認する

自動テストと、ブラウザ・mock2での実表示確認は別に報告します。

## ローカルサーバー

```bash
MOCK2_DIR=/Users/yasuda_k/Desktop/Terminus/trpg-gm-mock2 node server.cjs
```

ブラウザURLは `http://localhost:8799/` です。

## エラーの伝え方

内部キーだけで終わらせず、作者が直す場所を日本語で示します。

例:

> `ch1_s1_item_1`が見つかりません。\
> このシーンの「シーン要素」に条件として使う要素を追加するか、出口の条件から削除してください。
