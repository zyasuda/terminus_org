# TAS MVP — 使い方

第2章「心石の在処」の叩き台をAIに生成させ、人間がレビュー・承認するための最小アプリ。

## 準備（初回のみ）

```bash
cd ~/Desktop/Terminus/TAS
cp ../trpg-gm-mock2/.env .env
```

モック2で使っているAPIキーをそのまま流用します。対応バックエンドは Anthropic、Gemini、OpenAI、Groq、OpenRouter です。

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

起動時にコンテキスト（BORGの `CAMPAIGN_01.md` と `AI_DESIGN.md`）が自動で読み込まれ、画面左上に表示されます。

## 画面の見方

| 場所 | 名前 | 役割 |
|---|---|---|
| 左上 | Context | BORGから読み込んだ正式データの確認（編集不可） |
| 左中 | Prompt / Instruction | 第2章の狙い・必須world_flags・禁止事項を書く |
| 左下 | Review Notes | AIレビュー結果の表示 |
| 右 | Generated Draft | 生成された第2章。**手で直接編集できる** |

## 基本の流れ

0. **章を選ぶ** — 指示欄の右上のセレクタで対象章を選ぶ
   - **第2章（本番）**: 本来のMVPフロー
   - **第1章（答え合わせ）**: 生成時に公式の第1章詳細（3.1節）と伏線台帳（3.2節）をAIから隠して生成させ、レビューで公式版と比較する較正モード。第2章の本番前に生成品質を見積もるのに使う
1. **指示を書く** — 左中の欄に第2章の狙いを書く（例：「guardian_fate=対話 を主軸に、マイラの依頼が変質する導入にする」）
2. **「叩き台を生成」** — 右側にドラフトが出る（1〜2分かかることがある）
3. **「レビュー」** — AIが三層知識モデルの漏洩・伏線整合・world_flagsなど5観点で検査し、左下に指摘が出る
4. **直す** — 軽い修正は右側を直接編集。大きい修正は指示欄に修正要求を書いて**「差し戻して再生成」**
5. 3〜4を納得いくまで繰り返す
6. **「承認して保存」** — `TAS/output/CHAPTER_02_draft_日時.md` に保存される

## よくある質問

- **保存したファイルはどこ？** → `TAS/output/` フォルダ。BORG（MockDocs）への反映は手作業で行う（仕様どおり）
- **モデルを変えたい** → `.env` に `LLM_MODEL=モデル名` を追記して再起動
- **コンテキストの読み込み元を変えたい** → `.env` に `MOCKDOCS_DIR=パス` を追記
- **「APIキーが見つかりません」と出る** → `.env` がこのフォルダにあるか確認（準備の手順を参照）
- **エラーが出て生成が止まる** → 画面下部のステータス欄にエラー内容が出る。429（レート制限）は自動で1回リトライされるので待つ
- **オフラインで使える？** → 画面表示は完全ローカル（Markdownプレビュー含む）。ただし生成・レビューはクラウドLLMを呼ぶため接続が必要

## このアプリがやらないこと

Build Pipeline、Player App連携、画像生成、Git統合。スコープはD-023（第2章叩き台の生成レビュー）のみ。

## 関連ドキュメント

- 仕様: `BORG/TRPG/TAS/MVP.md`（スコープ定義）
- フロー定義: `BORG/TRPG/MockDocs/IMPLEMENTATION_PLAN.md` 5章
- 引き継ぎ: `BORG/Inbox/TAS_MVP引き継ぎ_2026-07-11.md`
