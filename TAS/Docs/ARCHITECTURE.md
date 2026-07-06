# ARCHITECTURE.md

# TRPG Authoring Studio (TAS)

Version 0.1

---

# 1. Overview

TRPG Authoring Studio（TAS）は、AIと共同でTRPGコンテンツを制作するためのWebベースのオーサリング環境である。

TASはゲームエンジンではない。

TASはゲームデータを制作・管理・レビュー・ビルドする制作環境である。

Player AppはTASが生成したデータを再生する。

---

# 2. High Level Architecture

```text
                   Human Creator
                         │
                         ▼
                TRPG Authoring Studio
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
 Project Manager     Game GPT      Asset Manager
        │                │                │
        └────────────────┼────────────────┘
                         ▼
                  Build Pipeline
                         ▼
                 Runtime Data(JSON)
                         ▼
                    Player App
```

---

# 3. Major Components

TASは以下のコンポーネントで構成される。

## Project Manager

プロジェクト全体を管理する。

対象

* Campaign
* Chapter
* Scene
* NPC
* Item
* Monster
* Quest
* Dialogue
* Assets

Project Managerは制作データの正本(Source of Truth)を保持する。

---

## Editor

各コンテンツを編集する。

例

* Campaign Editor
* Scene Editor
* NPC Editor
* Dialogue Editor
* Item Editor

全Editorは共通UIを採用する。

---

## Game GPT

AI支援機能。

役割

* Generate
* Review
* Improve
* Summarize
* Explain
* Translate
* Refactor

Game GPTはプロジェクト全体を参照できる。

---

## Asset Manager

画像・音声・BGM・動画などを管理する。

対象

* Background
* Portrait
* Sprite
* Icon
* Voice
* Music
* Sound Effect

AssetはUUIDで管理される。

---

## Build Pipeline

制作データをゲーム実行形式へ変換する。

入力

Markdown

画像

設定

出力

JSON

Asset Index

Localization

Runtime Package

---

# 4. Layer Structure

```text
UI Layer

↓

Application Layer

↓

Game GPT Layer

↓

Project Layer

↓

Storage Layer
```

各Layerは独立して設計する。

---

# 5. Storage

制作データ

Markdown

設定

YAML

画像

WebP

音声

ogg

設定JSON

JSON

すべてGit管理可能な構成を目指す。

---

# 6. AI Architecture

AIは直接Editorを変更しない。

```text
Human

↓

Request

↓

Game GPT

↓

Suggestion

↓

Human Review

↓

Apply
```

Apply操作は必ず人間が行う。

---

# 7. Build Architecture

Buildは複数段階で行う。

Stage 1

Validation

↓

Stage 2

Reference Resolve

↓

Stage 3

Asset Link

↓

Stage 4

JSON Export

↓

Stage 5

Runtime Package

---

# 8. Validation

Build前にAIとは独立したValidationを実施する。

対象

* Broken Link
* Missing Asset
* Duplicate ID
* Invalid Reference
* Circular Reference

ValidationはBuild失敗理由を明確に表示する。

---

# 9. AI Provider

Game GPTはProvider Interface経由で利用する。

```text
Game GPT

↓

Provider Interface

├── OpenAI

├── Anthropic

├── Gemini

├── Local LLM

└── Future Provider
```

Providerは交換可能とする。

---

# 10. Asset Pipeline

AssetはEditorから直接利用しない。

```text
Asset

↓

Asset DB

↓

Asset Index

↓

Build

↓

Runtime
```

Asset管理を一元化する。

---

# 11. Runtime Independence

Player AppはMarkdownを読まない。

Player AppはBuild成果物のみを利用する。

これにより

* Unity版
* Web版
* Mobile版

すべて同じデータを利用できる。

---

# 12. Project Structure

```text
Project/

PROJECT.md

DESIGN_PILLARS.md

Campaign/

NPC/

Dialogue/

Item/

Monster/

Assets/

Build/

Logs/

Export/
```

すべてProject単位で管理する。

---

# 13. Future Architecture

将来的には以下を追加予定。

* Multi User Editing
* Git Integration
* AI Review Pipeline
* Image Generation
* Voice Generation
* Storyboard Generation
* Localization Pipeline
* Analytics

これらは独立モジュールとして追加できる構成を維持する。

---

# 14. Design Principles

TASは以下を守る。

・EditorはMarkdownを編集する。

・Game GPTは提案のみ行う。

・Buildのみがゲームデータを生成する。

・Player AppはBuild成果物のみ読む。

・Assetは一元管理する。

・AI Providerを固定しない。

・Gitを第一級市民とする。

・ゲームエンジンへ依存しない。

---

# 15. Architecture Summary

TASは

「AI付きエディタ」

ではない。

Projectを中心に、

AI

Asset

Build

Editor

を統合する制作環境である。

ゲームデータの正本はProjectに存在し、

Player AppはBuild成果物のみを実行する。

この分離により、

制作環境とゲーム実行環境は独立して進化できる。

---

# 16. 追加

今は

Editor
↓
Markdown
↓
Build

という発想ですが、私は将来的には

Editor
↓
Project Graph
↓
Markdown
↓
Build

という構成にしたいです。

つまり、内部では「SceneとNPCがどうつながっているか」「QuestがどのSceneを参照しているか」をグラフ構造として保持します。

すると、

「このNPCを削除すると、どのSceneに影響する？」
「このQuestはどのアイテムを参照している？」
「未使用アセットは？」

といった分析が非常に簡単になります。

これはMVPでは不要ですが、Ver.2以降ではかなり強力な機能になると思います。
