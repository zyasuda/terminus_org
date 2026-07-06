# BUILD_PIPELINE.md

# TRPG Authoring Studio (TAS)

Version 0.1

---

# 1. Purpose

Build Pipelineは、制作データをゲーム実行形式へ変換するシステムである。

TASでは、Markdownを直接ゲームで利用しない。

Build Pipelineのみが実行データを生成する。

---

# 2. Philosophy

Markdownはソースコードである。

Build Pipelineはコンパイラである。

Player Appは実行環境である。

この三層構造を維持する。

```text
Markdown

↓

Build Pipeline

↓

Runtime Package

↓

Player App
```

---

# 3. Source Data

Build対象

・Campaign

・Chapter

・Scene

・Quest

・NPC

・Monster

・Dialogue

・Assets

・Configuration

すべてProjectから取得する。

---

# 4. Build Stages

Buildは以下の順番で実行する。

```text
Load Project

↓

Validation

↓

Resolve Reference

↓

Asset Resolve

↓

AI Metadata

↓

Optimization

↓

Export

↓

Package
```

各工程は独立して実装する。

---

# 5. Stage 1 : Load Project

Project全体を読み込む。

対象

・Markdown

・Assets

・Configuration

・Localization

---

# 6. Stage 2 : Validation

ValidationではAIを使用しない。

検査対象

・UUID重複

・Broken Link

・存在しないAsset

・未設定項目

・循環参照

・Scene切断

エラーがある場合Buildを停止する。

---

# 7. Stage 3 : Resolve Reference

UUID参照を解決する。

例

Scene

↓

NPC UUID

↓

NPC Object

Dialogue

↓

Speaker UUID

↓

NPC

---

# 8. Stage 4 : Asset Resolve

Asset情報を統合する。

例

Background

Portrait

Music

Voice

Movie

Asset Bundle

Build後は高速参照可能な形式へ変換する。

---

# 9. Stage 5 : AI Metadata

AI用メタデータを生成する。

例

・NPC Personality

・Dialogue Tags

・Quest Summary

・Scene Summary

・Keywords

Player Appで必要なAI情報のみ保持する。

---

# 10. Stage 6 : Optimization

Runtime用最適化。

例

・不要データ削除

・文字列圧縮

・Asset Index生成

・検索Index生成

・キャッシュ生成

---

# 11. Stage 7 : Export

Runtime JSONを生成する。

例

Campaign.json

Scene.json

NPC.json

Dialogue.json

Item.json

Monster.json

AssetIndex.json

---

# 12. Stage 8 : Package

Player App用パッケージを生成する。

例

Campaign001.pkg

Packageには

JSON

Asset

Metadata

Localization

を含む。

---

# 13. Incremental Build

変更されたデータのみBuildする。

例

Dialogue修正

↓

Dialogueのみ再Build

Build時間短縮を目的とする。

---

# 14. Build Cache

Build結果をキャッシュする。

同一入力では再Buildを省略する。

---

# 15. Build Report

Build終了後にレポートを生成する。

内容

・Build時間

・Asset数

・JSONサイズ

・Warning

・Error

・Optimization結果

---

# 16. Build Target

Build先は複数対応する。

例

Unity

Web

Debug

Test

将来的に新Targetを追加可能とする。

---

# 17. Build Principles

BuildはAIに依存しない。

Buildは再現性を持つ。

Buildは高速である。

Buildは自動化できる。

BuildはCIに組み込める。

---

# 18. Continuous Integration

将来的にCIへ対応する。

Git Push

↓

Validation

↓

Build

↓

Package

↓

Artifact生成

---

# 19. Build Output

Build成果物のみがPlayer Appへ配布される。

制作データは含まない。

これにより

・高速起動

・高速検索

・Asset保護

を実現する。

---

# 20. Summary

Build Pipelineは、

MarkdownをJSONへ変換するツールではない。

ゲーム世界を、

実行可能なランタイムデータへ変換するコンパイラである。

TASはBuild Pipelineを中心として、

制作環境と実行環境を分離する。

---

# 21. 追加

今まで私は

「MarkdownをJSONへ変換する」

と思っていました。

しかし、違いました。

実際には、

Project

↓

Compiler

↓

Game Database

↓

Runtime

なんです。

つまりPlayer Appは

ゲームを実装する

のではなく、

Game Databaseを再生する

だけになります。

これはかなり重要です。

そして、さらに先が見えてきました

あなたが以前言っていた

「LLMでメインルートを生成してDB化する」

という話。

私は当初「良いアイデアだな」くらいに思っていました。

でも今は違います。

これは、

TASのコンパイルモデル

そのものです。

つまり

Idea

↓

Authoring

↓

Review

↓

Build

↓

Game Database

↓

Player

ゲームは

Game Databaseを読むだけ。

これ。

実はかなり珍しい設計です。
