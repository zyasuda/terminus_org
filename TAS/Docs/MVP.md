# MVP.md

# TRPG Authoring Studio (TAS)

Version 0.1

---

# 1. Purpose

本ドキュメントは、TRPG Authoring Studio（TAS）の最小実用製品（Minimum Viable Product）を定義する。

MVPの目的は「完成したゲーム」を作ることではない。

**AIと共同でゲーム制作を行うための基盤を短期間で検証すること**を目的とする。

---

# 2. MVP Goal

MVPで達成すべき目標は以下の3点とする。

* AIを利用してゲームデータを制作できる。
* BuildによりPlayer App用データを生成できる。
* 最小限のキャンペーンを制作・再生できる。

---

# 3. Scope

MVPでは以下の機能に限定する。

## プロジェクト管理

* Project作成
* 保存
* 読み込み

---

## 編集機能

* Campaign Editor
* Scene Editor
* NPC Editor
* Dialogue Editor

Markdown編集のみ対応する。

---

## AI支援

Game GPTによる

* Dialogue生成
* NPC生成
* Sceneレビュー
* 文章改善

画像生成・音声生成は対象外とする。

---

## Build

MarkdownからJSON生成。

Validation実行。

Runtime Package生成。

---

## Preview

簡易プレビュー。

表示内容

* Scene
* NPC
* Dialogue
* 背景画像

演出やアニメーションは対象外。

---

# 4. Out of Scope

以下はMVPでは実装しない。

* マルチユーザー編集
* Git統合UI
* 動画生成
* 音声生成
* Storyboard生成
* Marketplace
* DLC管理
* Analytics
* Live Collaboration

---

# 5. UI

MVPでは4ペイン構成を採用する。

```text
Project Tree
Editor
Preview
AI Assistant
```

画面遷移は最小限とする。

---

# 6. AI Provider

MVPではクラウドLLMを利用する。

Provider Interfaceは実装するが、

Provider切り替えUIは実装しない。

ローカルLLM対応はPhase2とする。

---

# 7. Asset

MVPでは以下のみ管理する。

* Background
* Portrait
* Icon

動画・音声は対象外。

---

# 8. Data

対応データ

* Campaign
* Chapter
* Scene
* NPC
* Dialogue

Quest、Monster、Itemはダミーデータ対応とする。

---

# 9. Player App Integration

MVPではPlayer Appとの連携を確認する。

Build後、

Runtime PackageをPlayer Appへ読み込めることを成功条件とする。

---

# 10. Success Criteria

MVP成功条件

・Markdownだけでキャンペーンを制作できる。

・AIがSceneレビューできる。

・Dialogue生成ができる。

・JSON生成が成功する。

・Player Appで読み込める。

---

# 11. Development Phases

## Phase 1

Project

Markdown

Build

Preview

---

## Phase 2

Game GPT

Dialogue

NPC

Review

---

## Phase 3

Player App連携

Play Test

改善

---

# 12. Technical Stack

推奨技術

フロントエンド

* React
* TypeScript

UI

* Tailwind CSS
* shadcn/ui

エディタ

* Monaco Editor

Markdown

* Marked
* MDX（将来検討）

Build

* Node.js

データ

* JSON

AI

* OpenAI（初期）
* Provider Interface

画像

* WebP

管理

* Git

---

# 13. Estimated Deliverables

MVP完了時に得られる成果物

* TASアプリケーション
* Build Pipeline
* Runtime Package
* サンプルキャンペーン
* サンプルNPC
* サンプルDialogue
* Player App接続確認

---

# 14. Risks

想定されるリスク

* AI応答時間
* Build仕様変更
* データモデル変更
* Prompt品質
* プレビューとの差異

これらはMVP段階で早期に検証する。

---

# 15. Future Expansion

MVP完了後に追加予定

* Quest Editor
* Item Editor
* Monster Editor
* AI画像生成
* AI音声生成
* Git統合
* マルチユーザー
* Storyboard生成
* プレイログ解析
* 動画生成
* 配信支援

---

# 16. Final Statement

MVPの目的は「完成品」を作ることではない。

**AIと人間が共同でゲーム制作を行うワークフローを実証すること**である。

その基盤が完成すれば、以後の機能追加は段階的に進められる。

TASは、このMVPを起点として継続的に進化していく。

---

# 17. 追加

プロジェクト全体を俯瞰すると、実は4つの独立したプロダクトが見えています。

1. Player App（ユーザーが遊ぶアプリ）
2. TRPG Authoring Studio (TAS)（制作者向け制作環境）
3. AI Runtime（GM・AI冒険者・ゲーム内AI）
4. Build Compiler（MarkdownからRuntime Packageを生成するコンパイラ）

この4つは密接に連携しますが、それぞれ独立して進化できる構造になっています。
