# TAS専用作業ガイド

## 適用範囲

このファイルはTASフォルダ内の編集・検証作業に適用します。TAS専用Skillは、GlobalのSkillではなく、`.codex/skills/`に配置しています。

## 使用するSkill

### `tas-admin-ux`

シーン、シーン要素、出口、画像などの複雑な入力画面を改修するときに使用します。見た目の装飾より、次の3点を優先します。

- シーン・要素・詳細設定を段階的に見せる折りたたみ構造
- 誤ったキー、存在しない参照、重複アセットを入力時点で示すフィールド単位バリデーション
- 編集した結果をmock2で確認するプレビュー導線

実装の優先順位は、入力時バリデーション → シーン構造の折りたたみ → ライブプレビューです。ライブプレビューを実装する場合は、iframeや`postMessage`を先に決め打ちせず、mock2の受信・描画契約を確認します。

### mock2連携Skillの実行順序

mock2側のデータや画像に関係する作業では、次の順序を基本とします。

```text
read-consumer-before-edit
        ↓
minimal-schema-diff
        ↓
check-direction-contradictions（自由記述を変更する場合）
        ↓
実装・データ変更
        ↓
verify-tas-output
        ↓
check-scenario-assets
```

これらは過去のmock2連携不具合を防ぐためのTAS専用Skillです。

### `read-consumer-before-edit`

シナリオJSONへフィールドを追加・削除・変更する前に、mock2のエンジンがそのフィールドを実際に読んでいるか確認します。特に、挙動を止めるための新しい`useXxx: false`のようなフラグを追加する前に使用します。

### `minimal-schema-diff`

新しいフィールド、フラグ、`assets.json`エントリを追加する前に、既存の値を修正・削除するだけで解決できないか確認します。画像の拡張子変更では、同じ実体の別エントリを増やさず、既存エントリを更新します。

### `check-direction-contradictions`

シーンの`direction`、キャラクターの`trait`・`persona`など、AIへ直接渡される自由記述を変更するときに使用します。話す・話さない、敵対する・しない、正体を明かす・明かさない等の矛盾を、追記前後の全文で確認します。

### `verify-tas-output`

画像、パララックス、スプライト、シーンの視覚設定を変更した後に必ず使用します。画像単体の確認ではなく、mock2の実画面で単層画像・パララックス合成・スプライトのどの経路で表示されるかを確認します。

### `check-scenario-assets`

章JSON、`assets.json`、画像ファイルのいずれかを変更した後に必ず使用します。JSONの参照、`assets.json`の`file`・`usedBy`、ディスク上の実ファイル、重複エントリを突き合わせます。

### `tas-output-contract`

TASからmock2へ出力するデータ契約を確認するSkillです。

次の作業では必ず使用します。

- `campaign.json`、`chapter_*.json`、`campaigns.json`、`assets.json`の出力処理を変更するとき
- シーン、シーン要素、出口、遭遇、フラグ、キャラクター、画像の項目を変更するとき
- mock2側でデータが読めない、画像が表示されない、出力先が違うなどの問題を調べるとき
- 出力JSONを手編集せず、TASの保存・出力経路で確認するとき

確認する主な点：

- 同行者IDは登録順に`member_1`、`member_2`、`member_3`とする
- ID変更時は同じレコードの日本語名も同時に確認する
- 呼称は`addressTerm`に統一し、`addressing`を追加しない
- 画像JSONには絶対パス、`file://`、Object URL、Data URLを保存しない
- 画像が1枚だけの場合は前景画像として扱い、画像が0枚の場合に警告する
- パララックスを使う場合はmock2契約の`parallax.sky`、`parallax.fg`を使用し、`useParallax`を出力しない
- `scene.enemy`は実体、`encounters[]`は条件・任意・ランダム遭遇として分ける
- 出口の条件は、同じシーン内のシーン要素・秘密情報へ解決できるようにする
- `secretsAll`を意図せず`secretsAny`へ変換しない
- 削除済みの`campaignTheme`をAIプロンプトや出力へ復活させない

### `tas-ux-regression`

TASのブラウザ操作と作者向けUXを確認するSkillです。

次の作業では使用します。

- UI配置、文言、カード構成、レスポンシブ表示を変更したとき
- 画像選択・復元・再読み込みを変更したとき
- AI補助、保存、読込、プレビュー、mock2出力を変更したとき
- 「ボタンを押しても反映されない」「古い値が残る」などの報告を調査するとき

確認する代表的な操作：

1. キャンペーンを読み込む
2. シーンを選択する
3. シーン要素または画像を編集する
4. 保存する
5. 読み込み直す
6. プレビューを更新する
7. `mock側へ出力`を実行する
8. 出力ファイル名とエラー表示を確認する

通常幅と狭い画面幅の両方で確認します。ファイル選択欄の表示だけでなく、保存後に「現在使用中」の画像名とプレビューが一致することを確認します。

## ファイル構成

`index.html`はHTMLとCSSだけで約27,000字です。JavaScriptは`js/`配下の54ファイルに分かれています（2026-07-30に、元のインライン`<script>`42個を1対1で切り出し、そのうち最大だった`01-core.js`を関心事で13分割しました）。1ファイルは最大約15KBです。

- ファイル名の番号が読み込み順です。`index.html`の`<script src>`の並びと一致します
- **順序を入れ替えてはいけません。** 後続ファイルが`var base=fn; fn=function(){…}`で先行ファイルの関数を包む作りになっており、順序が変わると出力内容が変わります
- ファイルを追加する場合は末尾に置きます
- クラシックスクリプトなので、トップレベルの`function`と`var`は全ファイルで共有されます。`let`/`const`は先に読み込まれたファイルのものだけ参照できます

作業対象が分かっているときは、`index.html`全体ではなく該当ファイルだけを読みます。

| 探しているもの | ファイル |
|---|---|
| 状態を持つ変数、定数、見本シーン | `01a-state.js` |
| 正規化とラベル（`normalizeExit` / `normalizeDiscoveryFor` など） | `01b-normalize.js` |
| 下書きの保存・読込・キャンペーンの取り込み | `01c-draft.js` |
| 入力時検証・設計診断・補助AIのプロンプト | `01d-validation.js` |
| シーン一覧・世界設定・シーン構造の描画 | `01e-render-scenes.js` |
| 調査対象と演出の描画 | `01f-render-state.js` |
| キャスト・モンスター・アイテム・共通ルールの描画 | `01g-render-ledgers.js` |
| タブ・補助パネル・プレイテストの描画 | `01h-render-shell.js` |
| **ゲーム側への出力**（`mockCampaignPayload` / `exitRequires` / `terminalNodeOutput`） | `01i-output.js` |
| 出力画面と全体描画（`renderAll`） | `01j-render-export.js` |
| 入力欄のイベント接続、画像の受け取り | `01k-bind.js` |
| AIによるシーン生成 | `01l-generate.js` |
| 起動（`init`） | `01m-init.js` |
| 出口の編集 | `02-exit-editor-simple.js` |
| プレイテスト | `07-playtest-runtime.js` / `29-playtest-ai.js` |
| エンティティ台帳 | `13-entity-ledger.js` |
| 重要語・アイテム | `17-concepts-items.js` |
| キャンペーン構造 | `18-structure-chapters.js` |
| 画像フォルダ | `23-image-library.js` |
| 性別属性・発話指定 | `26-cast-attributes.js` |
| フラグ契約 | `27-flags-contract.js` |
| 遭遇 | `38-encounters.js` |
| 入力時検証・折りたたみ | `39-admin-ux.js` |
| 敵データ | `40-enemy-data.js` |
| トリガー語句のAI生成 | `42-match-words.js` |

## ローカルサーバー

実際のmock2へ出力して確認する場合は、TASフォルダで次を実行します。

```bash
MOCK2_DIR=/Users/yasuda_k/Desktop/Terminus/trpg-gm-mock2 node server.cjs
```

ブラウザURLは`http://localhost:8799/`です。

## 自動検証

**出力に関わる変更をしたら、報告の前に必ず実行します。**

```bash
cd TAS && npm test
```

依存は入っていません。ブラウザは`trpg-gm-mock2`の`node_modules`の`playwright`を借りるので、あちらで`npm install`が済んでいれば動きます。約3秒、131件です。

検査は4つに分かれています。

| 対象 | 内容 |
|---|---|
| 分割構造 | `index.html`の`<script src>`と`js/`の対応、読み込み順、`</script>`混入、ラッパー段数の上限 |
| 出力JSON | 5つの下書きから`mockCampaignPayload()`を作り、基準出力と**完全一致**するか |
| 取り込み（読込） | `gamePayloadToWorkspaceDraft()`がイントロ・アウトロの本文と背景を下書きへ入れるか |
| 出力API | `assets.json`のマージが人の書いた`status`/`notes`を壊さないか、べき等か、異常系で上書きしないか |

一部だけ回すとき、および基準を更新するとき：

```bash
node tests/run.mjs --only=structure   # ブラウザ不要
node tests/run.mjs --only=snapshot
node tests/run.mjs --only=import
node tests/run.mjs --only=export
node tests/run.mjs --verbose          # 通った項目も並べる
npm run test:update                   # 基準出力を作り直す（意図した仕様変更のときだけ）
npm run test:fixtures                 # 下書きフィクスチャを作り直す
```

### 下書きフィクスチャの役割

それぞれ通したい経路が違います。消したり作り直したりする前に、何を守っているか確認してください。

| 名前 | 通す経路 |
|---|---|
| `base` | 下書きなし。`TAS/data`だけから組み立てる |
| `authored` | イントロ・アウトロを画面で書いた状態。品物の必要条件、調査対象を参照する必要条件 |
| `fresh` | 新規キャンペーンを作った直後 |
| `outro-from-base` | アウトロの本文だけ書き、出口は元データのまま。**`01i-output.js`側の出口変換を通す唯一の入力**。イントロが文字列で流れる経路も通る |
| `outro-brief-only` | アウトロの本文だけ書き、画像は画面で選んでいない。**元データの背景が消えた事故の再現**。基準出力に`img`が残っていることが修正の証拠 |

守ること。

- **`tests/fixtures/golden/*.json` を手で編集しない。** 出力が変わったら、それが意図した変更かを判断してから`--update`する
- `--update`したときは、**基準出力の差分そのものを報告に貼る**。「更新しました」だけでは、意図しない変化を見逃す
- 基準出力は`TAS/data/*.json`に依存する。あちらを変えたら`--update`が必要
- テストは`MOCK2_DIR`を一時ディレクトリへ向けて動く。**実データに対して出力して検証しない**

自動テストが成功しても、ブラウザの表示や画像復元まで確認できたことにはしません。最終報告では、自動検証とブラウザ検証を分けて記載します。

### 出力パイプラインの現状と方針

`mockCampaignPayload`は`var base=fn; fn=function(){…}`で**11段に包まれています**。どの項目の正がどの段なのかコードから読み取れず、「空の値で既存データを黙って潰す」不具合が繰り返し出ています（2026-07-29以降で7件）。

- **段を増やさないこと。** 静的検査が11段を上限に落とします
- 1本化する場合は、`codex/tas-ollama-gemma4`ブランチに`mockCampaignPayloadUnified()`として実装済みの前例があります（未マージ、mainと大きく乖離）。設計の参考にはなりますが、そのまま持ってこられません
- 1本化したら`tests/run.mjs`の`WRAPPER_CEILING`を下げます

## 出力エラーの伝え方

内部キーだけを提示せず、作者が直す場所を日本語で示します。

例：

> `ch1_s1_item_1`が見つかりません。
> このシーンの「シーン要素」に、条件として使う要素を追加するか、出口の条件から削除してください。
