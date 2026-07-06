# PROJECT.md

# TRPG Authoring Studio (TAS)

Version 0.1

---

# 1. Project Overview

TRPG Authoring Studio（以下 TAS）は、AIと共同で卓上RPG（TRPG）のキャンペーン、シナリオ、キャラクター、アセットを制作するためのオーサリング環境である。

本プロジェクトはゲームエンジンではない。

また、ゲームプレイヤー向けアプリケーションでもない。

TASはゲーム制作者のための統合制作環境であり、AIとの共同制作を前提とした新しいゲーム開発プラットフォームを目指す。

---

# 2. Vision

ゲーム制作に必要なあらゆる要素を、一つのプロジェクトとして統合管理する。

* 世界観
* キャンペーン
* チャプター
* シーン
* NPC
* モンスター
* アイテム
* ダイアログ
* 画像
* 音声
* BGM
* エフェクト
* プレイログ

これらをAIと共同編集しながら制作し、最終的にはPlayer Appが利用可能なデータとしてビルドする。

---

# 3. Project Goal

TASの目的は、「ゲームを作ること」ではない。

目的は、

**ゲーム制作そのものをAIとの共同作業へ変革すること**

である。

AIは文章生成ツールではなく、プロジェクト全体を理解する制作パートナーとして機能する。

---

# 4. Target Users

主な利用者は以下を想定する。

* シナリオライター
* ゲームデザイナー
* レベルデザイナー
* イラストレーター
* AIオペレーター
* ディレクター
* インディーゲーム開発者
* 少人数開発チーム

---

# 5. Position in the Entire Project

プロジェクト全体は、大きく三つのシステムから構成される。

1. TRPG Authoring Studio (TAS)
2. Player App
3. AI Services

TASはコンテンツ制作を担当する。

Player Appは制作されたデータを再生する。

AI Servicesは制作支援およびゲーム内AIとして利用される。

これらは疎結合に設計される。

---

# 6. Basic Concept

TASでは、人間がゼロから全てを書くことを前提としない。

AIに丸投げすることも前提としない。

人間とAIが共同で制作を繰り返しながら、品質を高めていく。

基本サイクルは以下の通りである。

Idea
↓

Generate

↓

Review

↓

Improve

↓

Approve

↓

Build

↓

Play Test

↓

Feedback

↓

Improve

このループを高速に回すことが、TAS最大の目的である。

---

# 7. AI Philosophy

AIはコンテンツを置き換える存在ではない。

AIは制作者の創造性を拡張する存在である。

AIは常に以下の役割を担当する。

* アイデア生成
* レビュー
* 改善提案
* 矛盾検出
* ドキュメント生成
* ダイアログ生成
* アセット生成支援

最終的な判断は必ず人間が行う。

---

# 8. Output

TASが管理するデータは、人間が読みやすい形式を基本とする。

編集データはMarkdownで保存する。

ゲーム実行用データはBuild PipelineによってJSONへ変換される。

これにより、

* Git管理
* AIによる編集
* 人間によるレビュー

を容易にする。

---

# 9. Design Principles

TASは以下を最重要設計思想とする。

* AI First
* Human Review
* Markdown First
* Build Everything
* Reusable Assets
* Project Based
* Git Friendly
* Engine Independent

Unityはターゲットの一つであり、TASはUnityへ依存しない。

---

# 10. Long-Term Vision

将来的にTASはTRPG専用ツールに留まらない。

ゲーム制作全体を支援するAIオーサリング環境へ発展させることを目標とする。

そのため、AIモデル、ゲームエンジン、アセット生成AIには依存しないアーキテクチャを採用する。

AIは交換可能なサービスとして設計し、時代に応じて最適なモデルへ切り替えられる構成とする。
