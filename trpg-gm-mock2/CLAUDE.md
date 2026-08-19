# mock2専用作業ガイド

共通ルールは [Terminus/CLAUDE.md](../CLAUDE.md) を参照する。

## 適用範囲

このファイルは `trpg-gm-mock2` 内の編集・検証作業に適用します。実装経緯、個別シナリオ、設計の背景はBORGまたは `docs/` を参照します。

## 基本姿勢

- 複雑な内容は、関係が理解しやすくなる場合に図や表で示す
- 簡潔かつ直接的に書き、確認できた事実と推測を区別する
- 調査が必要な場合は、実コードと一次情報源を優先する
- ユーザーの目標と制約から逸脱しない。不用意に質問しない
- 子Agentは必要な場合だけ使い、無意味な並列作業をしない
- 依頼と無関係なリファクタリング、抽象化、データ変更をしない
- 既存のセーブデータ、シナリオJSON、画像、他者の変更を保護する
- 実際にテスト・実プレイ・画面確認を行い、見た目だけで完了と判断しない
- 重要な判断、変更、検証結果だけを報告する

## データ読込・TAS連携

**`public/data/campaigns/` 配下の章データは正本ではありません。配布された生成物です。**(2026-08-19に方針変更)

正本は `Terminus/scenario/<キャンペーンID>/` のみ。詳細は [Terminus/CLAUDE.md](../CLAUDE.md) の「シナリオデータの正本」を参照します。

```text
scenario/lanternhill/chapter_01.json   ← 直すのはここだけ
        ↓  node scripts/distribute-scenario.mjs --write   (リポジトリ直下で実行)
public/data/campaigns/lanternhill/chapter_01.json
```

`public/data/` を直接編集しないでください。直しても次の配布で消えます。TASの「mock側へ出力」も同じ場所へ書くため、**TASから出力したら、その内容を正本へ戻してから配布し直します**(戻さないと次の配布で消えます)。

実行時の読込経路は次の通りです。

```text
public/data/campaigns.json
        ↓
campaigns/<campaignId>/campaign.json
        ↓
campaigns/<campaignId>/chapter_XX.json
```

- TAS出力の項目を追加・削除・意味変更する場合は、TAS側の出力処理とmock2側の読込・利用箇所を両方確認する
- `public/data/`直下の古いJSONを正式な読込元として復活させない
- `campaigns.json`のカタログ、`defaultCampaign`、`defaultChapter`、実ファイルの参照先を常に一致させる
- シナリオJSONを手編集して挙動だけを直さない。TASの保存・出力経路で再現・確認する
- 同行者IDは `member_1`、`member_2`、`member_3` を登録順に使う
- `addressTerm`を呼称の唯一のキーとし、`addressing`を追加しない
- 出口・秘密・所持品・遭遇の参照は、実在する同一シーンまたは章のデータへ解決できることを確認する

## 状態・セーブ・進行

- 状態変更は `src/engine/index.js` と `src/state.js` の責務を確認してから変更する
- セーブキー、セーブ形式、ワールドフラグを変える場合は、既存セーブの移行または安全なフォールバックを用意する
- シーン遷移、秘密開示、戦闘結果、所持品変更を変えた場合は、通常ルートと既存セーブ再開の両方を確認する
- LLMの返答はゲーム状態を直接信用しない。解析・検証・既存の進行条件を通して反映する

## 画像・パララックス

- `parallax`があるシーンは `parallax.sky` と `parallax.fg` の2層で表示する
- `img`はパララックスがない場合の単層背景である。パララックス使用中に`img`だけを変更しても見た目は変わらない
- パララックスを使わない場合は、`parallax`キーを省略する。 `useParallax`のような未使用フラグを追加しない
- 画像、`assets.json`、章JSON、ディスク上の素材ファイルを一緒に確認する
- 画像の変更後は、実際のゲーム画面で単層・パララックス・スプライトの該当経路を確認する

## 主なファイル

| 対象 | ファイル |
|---|---|
| キャンペーン・章の読込 | `src/scenario.js` |
| ゲーム進行・セーブ・戦闘開始 | `src/engine/index.js` |
| 状態の初期化・正規化 | `src/state.js` |
| 進行条件 | `src/engine/progression.js` |
| LLM接続 | `src/llm.js`、`server.cjs` |
| 画面 | `src/App.jsx`、`src/engine/scene-ui.js` |
| 所持品 | `src/inventory.js` |
| 戦闘ロジック | `src/battle/core.js` |
| 素材検証 | `scripts/check-assets.mjs` |
| TAS連携時のパララックス契約 | `scripts/_tas_prompt.md` (注記あり↓) |

`scripts/_tas_prompt.md` は元々TASへ一度渡すための連絡メモとして書かれ、冒頭に
「内容をコピーしたら削除してください」と書かれている。しかしその後この表からパララックス契約の
参照先として指され、実質的に契約の正本になっている。**冒頭の記述に従って削除しないこと。**
契約として使い続けるなら `docs/` へ移して名前と冒頭を書き換えるべきで、それは未実施(2026-08-19)。

## 検証

変更内容に応じて、少なくとも関係する検証を実行します。

```bash
npm test
npm run check:assets
npm run build
```

- 進行、出口、秘密、戦闘、所持品を変更した場合: `npm test`
- 画像、章JSON、`assets.json`を変更した場合: `npm run check:assets`
- 画面やビルド設定を変更した場合: `npm run build`
- LLM、会話、セーブ、遷移の変更後: 実プレイで開始・行動・保存・再開を確認する

自動テストと実プレイ確認を分けて報告します。

## BORGへの記録

BORGへ保存するよう依頼された場合だけ、BORG側の保存ルールとテンプレートを確認します。BORGに書かれていない仕様は推測で確定しません。
