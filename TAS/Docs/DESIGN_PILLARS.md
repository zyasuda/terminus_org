# DESIGN_PILLARS.md

# TRPG Authoring Studio (TAS)

Version 0.1

---

# 1. Purpose

Design Pillarsは、TRPG Authoring Studioを設計・開発する上での基本理念を定義する。

新機能の追加や仕様変更を検討する際は、本ドキュメントを判断基準とする。

---

# Pillar 1 : Human Creates, AI Supports

AIはゲームを作るための代替者ではない。

ゲームを作るのは常に人間である。

AIは以下の役割を担当する。

* アイデア生成
* ドラフト作成
* レビュー
* 改善提案
* 品質チェック
* ドキュメント整理

最終決定は必ず制作者が行う。

**設計指針**

* AIが勝手に完成品を作らない
* AIは提案する
* 人間が採用を決める

---

# Pillar 2 : AI First Workflow

AIは最後に使うツールではない。

制作開始から完成まで常に利用できる。

制作工程の全てでAIが利用可能であることを目標とする。

例

* 世界観設計
* NPC作成
* Dialogue作成
* Quest作成
* Review
* Build

---

# Pillar 3 : Review Before Generate

大量生成よりレビューを優先する。

生成AIは便利であるが、

品質向上に最も貢献するのはレビュー機能である。

AIは

「何を作るか」

より

「何が問題か」

を指摘できることを重視する。

レビュー対象

* 世界観
* ストーリー
* NPC
* Quest
* Dialogue
* Battle
* Asset
* UI

---

# Pillar 4 : Improve Loop

制作は一回で完成しない。

Generate

↓

Review

↓

Improve

↓

Review

↓

Approve

この改善ループを最短距離で回せることを目標とする。

TASは生成ツールではなく、

改善ツールである。

---

# Pillar 5 : Project Context

AIは単独の文章ではなく、

プロジェクト全体を理解する。

AIが参照する情報例

* PROJECT.md
* GDD
* Campaign
* Scene
* NPC
* Item
* Dialogue
* Design Pillars
* Meeting Notes
* Git History

これらを踏まえて提案を行う。

---

# Pillar 6 : Markdown First

人間が編集するデータはMarkdownを基本とする。

理由

* Git管理しやすい
* AIが理解しやすい
* 差分レビューが容易
* エディタを選ばない
* 将来の移行が容易

Markdownは制作データの正本（Source of Truth）とする。

---

# Pillar 7 : Build Everything

ゲームはMarkdownを直接読むものではない。

Build Pipelineにより、

ゲーム実行形式へ変換する。

例

Markdown

↓

JSON

↓

Asset Index

↓

Localization

↓

Player App

Build処理は自動化される。

---

# Pillar 8 : Asset Centric

画像は最後に追加するものではない。

Scene

NPC

Monster

Item

Quest

Dialogue

すべてがAssetと関連付けられる。

Assetは制作初期から管理対象とする。

---

# Pillar 9 : Engine Independent

TASはゲームエンジンに依存しない。

Unity対応は重要である。

しかし、

Unity専用ツールにはしない。

将来的には

* Unity
* Web
* Unreal
* Godot

などへの対応を可能とする。

---

# Pillar 10 : AI Independent

AI Providerを固定しない。

Game GPTは抽象インターフェースであり、

内部実装は交換可能とする。

対応例

* OpenAI
* Anthropic
* Google
* Local LLM
* Future AI Models

これにより、

コスト

品質

速度

利用規約

に応じて柔軟に切り替えられる。

---

# Pillar 11 : Collaboration First

少人数開発を前提とする。

一人でも利用できる。

チームでも利用できる。

将来的には

* 同時編集
* コメント
* Pull Request
* AI Review

を支援する。

---

# Pillar 12 : Continuous Evolution

AIは日々進化している。

TASも固定されたツールではない。

Build Pipeline

AI

Asset管理

UI

Review機能

すべて継続的な改善を前提とする。

---

# Non Goals

TASは以下を目的としない。

* 完全自動ゲーム生成
* AIのみでゲーム完成
* ノーコードゲームエンジン
* Unity代替エンジン

TASは

「ゲーム制作をAIと共同で行うためのオーサリング環境」

である。

---

# Success Criteria

TASが成功したと言える条件

・AIとの共同制作が自然に行える。

・プロジェクト全体をAIが理解している。

・レビューによって品質が向上する。

・Markdownだけでゲームを制作できる。

・Buildによってゲームデータを生成できる。

・ゲームエンジンを変更しても制作データを再利用できる。

・制作者が「AIと一緒にゲームを作っている」と自然に感じられる。

---

# Final Statement

TRPG Authoring Studioは、

AIでゲームを作るツールではない。

人間とAIが共同でゲームを育てていくための制作環境である。

AIは創造性を置き換えない。

AIは創造性を拡張する。

そのため、TASは「生成」よりも「改善」を重視し、

人間の意思決定を中心に据えた設計を採用する。

---

# 追加

次の版（Ver.0.2）では、おそらく新たに

Pillar : Data Never Dies（制作データは資産である）

を追加すると思います。

これは、あなたが以前から話している

プレイログを資産化する
AIに再学習させる
SNS記事や動画に活用する
キャンペーンを育て続ける

という思想につながるものです。
