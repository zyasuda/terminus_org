# TAS — ストーリー制作ワークスペース

キャンペーン、チャプター、シーン、人物・モンスター・アイテムを編集し、mock2が読み込むキャンペーンJSONへ出力するローカル制作ツールです。

## 準備（初回のみ）

```bash
cd ~/Desktop/Terminus/TAS
cp .env.example .env
```

`.env`に利用するLLMのAPIキーを設定します。対応バックエンドは Anthropic、Gemini、OpenAI、Groq、OpenRouter です。mock2と同じキーを使う場合は、必要な行だけを`.env`へコピーしてください。

バックエンドを指定する場合は `.env` に設定します。

```env
LLM_BACKEND=groq
GROQ_API_KEY=gsk_...
LLM_MODEL=llama-3.3-70b-versatile
```

OpenRouterを使う場合は次のようにします。

```env
LLM_BACKEND=openrouter
OPENROUTER_API_KEY=sk-or-...
LLM_MODEL=google/gemini-2.5-flash
```

APIキーはブラウザへ渡さず、TASの中継サーバーから各社APIへ接続します。

## 起動

```bash
node server.cjs
```

ブラウザで http://localhost:8799 を開く。終了は `Ctrl + C`。

## 回帰テスト

同行者のID・発話属性・エンティティ台帳・画像参照が、TASの出力JSONで一致することを確認します。

```bash
node tests/tas-companion-output-contract.mjs
```

このテストは一時サーバーを起動して出力プレビューだけを確認します。`mock側へ出力`は押さないため、mock2のデータを書き換えません。

## 自動検証・コミット

互換性ハーネスを含む全検証は、`node scripts/tas-check-and-commit.mjs`でまとめて実行できます。通常実行ではコミットしません。

検証後にコミットする場合は`--commit`、pushまで行う場合は`--commit --push`を明示します。TAS以外の変更が作業ツリーにある場合は、巻き込み防止のため自動中止します。

新規キャンペーン作成後のデータ引き継ぎは、次のテストで確認できます。現在は、同行者・アイテム・初期所持品・フラグ宣言が出力に残ることを検査します。

```bash
node tests/tas-fresh-campaign-output-contract.mjs
```

シーン完了条件の`secretsAny`（OR）／`secretsAll`（AND）の維持は、次で確認できます。

```bash
node tests/tas-complete-requires-contract.mjs
```

11重の出力関数チェーンを統合する前後の互換性は、基準出力との比較ハーネスで確認します。
通常は基準を更新せずに実行し、仕様変更を承認した場合だけ`--update`を使用します。

```bash
node tests/tas-chain-compatibility-harness.mjs
node tests/tas-chain-compatibility-harness.mjs --update
```

起動時にコンテキスト（BORGの `CAMPAIGN_01.md` と `AI_DESIGN.md`）が自動で読み込まれ、画面左上に表示されます。

## 基本の流れ

1. 左ペインでキャンペーン、チャプター、イントロ、シーン、アウトロを選びます。
2. 「世界設定」「キャラクター」「モンスター」「アイテム」で、キャンペーン全体のデータを入力します。
3. 各シーンで背景、SKY画像（パララックス）、シーン要素、遭遇、分岐／接続先を設定します。
4. 「出力確認」で生成されるcampaign.jsonとchapter_XX.jsonを確認します。
5. 「mock側へ出力」で`trpg-gm-mock2/public/data/campaigns/<campaignId>/`へ書き出します。mock2側では再読み込みまたはビルドで反映を確認します。

`TAS/data/`は開発・回帰テスト用のフィクスチャです。実際にmock2が読む正本は、`trpg-gm-mock2/public/data/campaigns/<campaignId>/`です。

## よくある質問

- **出力先を変えたい** → `.env` の `CAMPAIGN_OUTPUT_DIR`、`MOCK_IMAGES_DIR`、`MOCKDOCS_DIR` を指定して再起動します。相対パスはTASフォルダ基準です。
- **モデルを変えたい** → `.env` に `LLM_MODEL=モデル名` を追記して再起動
- **コンテキストの読み込み元を変えたい** → `.env` に `MOCKDOCS_DIR=パス` を追記
- **「APIキーが見つかりません」と出る** → `.env` がこのフォルダにあるか確認（準備の手順を参照）
- **エラーが出て生成が止まる** → 画面下部のステータス欄にエラー内容が出る。429（レート制限）は自動で1回リトライされるので待つ
- **オフラインで使える？** → 画面表示は完全ローカル（Markdownプレビュー含む）。ただし生成・レビューはクラウドLLMを呼ぶため接続が必要

## 関連ドキュメント

- 仕様: `BORG/TRPG/TAS/MVP.md`（スコープ定義）
- フロー定義: `BORG/TRPG/MockDocs/IMPLEMENTATION_PLAN.md` 5章
- 引き継ぎ: `BORG/Inbox/TAS_MVP引き継ぎ_2026-07-11.md`
