# DATA_MODEL.md

# TRPG Authoring Studio (TAS)

Version 0.1

---

# 1. Purpose

本ドキュメントは、TRPG Authoring Studioで扱う制作データの構造を定義する。

データは人間が理解しやすく、AIが編集しやすく、Build Pipelineが変換しやすいことを目的とする。

編集データ（Markdown）とゲーム実行データ（JSON）は分離して管理する。

---

# 2. Design Principles

データ設計は以下を基本とする。

* Markdown First
* Asset Reference
* UUID管理
* BuildによるJSON生成
* Engine Independent
* AI Friendly
* Git Friendly

---

# 3. Project Hierarchy

```text
Project
│
├── Campaign
│
├── Chapter
│
├── Scene
│
├── Quest
│
├── NPC
│
├── Monster
│
├── Item
│
├── Dialogue
│
├── Assets
│
└── Build
```

Projectがすべてのルートとなる。

---

# 4. Campaign

Campaignは一つの世界・物語・キャラクター成長を管理する単位である。

保持する情報

* UUID
* Name
* Description
* World
* Chapters
* Start Scene
* Player Rules
* Character Rules
* Asset Pack

一つのCampaignが一つのセーブデータの単位となる。

---

# 5. Chapter

ChapterはCampaignを構成する物語の区切りである。

保持する情報

* UUID
* Name
* Description
* Scene List
* Chapter Goal
* Reward
* Unlock Condition

---

# 6. Scene

Sceneはゲーム進行の最小単位である。

保持する情報

* UUID
* Name
* Summary
* Background Asset
* NPC List
* Monster List
* Item List
* Dialogue List
* Trigger
* Next Scene

SceneはBuild後にPlayer Appで直接再生される。

---

# 7. Quest

Questはプレイヤーの目的を管理する。

保持する情報

* UUID
* Name
* Description
* Objective
* Progress
* Reward
* Failure
* Related Scene

Questは複数Sceneへまたがることができる。

---

# 8. NPC

NPCはゲーム内キャラクターである。

保持する情報

* UUID
* Name
* Race
* Job
* Personality
* Background
* Portrait
* Voice
* Parameters
* AI Profile
* Dialogue Group

NPCは固定人格を持つ。

プレイ中に経験値・友好度などの状態のみ変化する。

---

# 9. Monster

保持する情報

* UUID
* Name
* Species
* Portrait
* Battle Sprite
* Parameters
* Skill List
* Drop Item

---

# 10. Item

保持する情報

* UUID
* Name
* Category
* Icon
* Description
* Effect
* Price
* Stack Count

---

# 11. Dialogue

Dialogueは会話データを管理する。

保持する情報

* UUID
* Speaker
* Listener
* Text
* Emotion
* Conditions
* Next Dialogue

DialogueはSceneから参照される。

---

# 12. Assets

Assetはすべて共通管理する。

対象

* Background
* Portrait
* Sprite
* Icon
* Voice
* Music
* Sound Effect
* Movie

Asset情報

* UUID
* Name
* Type
* File Path
* Tags
* Prompt
* Version

Promptを保存することでAIによる再生成を容易にする。

---

# 13. Character Sheet

プレイヤーキャラクターはCampaign単位で保持する。

項目例

* Name
* Race
* Job
* Level
* Parameters
* Skills
* Inventory
* Equipment
* Status
* Story Flags

Campaign終了後も同一Campaign内で継続利用できる。

---

# 14. AI Memory

AI専用データは独立して保持する。

対象

* Known Players
* Previous Events
* Relationship
* Important Memories
* Story Flags

AI Memoryは人格データではなく、ゲーム進行用データである。

---

# 15. Play Log

Play Logはゲーム中に発生した出来事を記録する。

対象

* Dice Result
* Dialogue
* Battle
* Quest Progress
* Item Obtain
* AI Conversation
* Scene Transition

Play Logは以下へ利用される。

* Chronicle生成
* SNS共有
* リプレイ
* AIレビュー
* 動画生成
* 記事生成

Play Logはゲーム終了後も保存する。

---

# 16. Reference Rules

各データはUUIDで相互参照する。

例

Scene

↓

NPC UUID

↓

NPC

Scene

↓

Dialogue UUID

↓

Dialogue

Build時に参照を解決する。

---

# 17. Source of Truth

Markdownが正本(Source of Truth)である。

JSONはBuild成果物であり、直接編集しない。

Player AppはJSONのみ利用する。

---

# 18. Future Extensions

今後追加予定

* Localization
* Voice Script
* Camera Data
* Timeline
* Cutscene
* Visual Effects
* AI Behavior Tree
* Analytics
* DLC Metadata

これらは既存データモデルを壊さず拡張できる構造とする。

---

# 19. Data Flow

制作データは以下の流れで処理される。

Markdown

↓

Validation

↓

Reference Resolve

↓

Asset Link

↓

JSON Export

↓

Runtime Package

↓

Player App

---

# 20. Summary

TASのデータモデルは、

「ゲームを実装するためのデータ」

ではなく、

「ゲーム世界そのものを記述するデータ」

を管理する。

その世界をBuild Pipelineがゲーム実行形式へ変換し、

Player Appはその結果を再生する。

この分離により、

ゲームエンジン・AI・UIが変化しても、

制作資産は長期的に再利用可能となる。

---

# 21. 追加

ここまで書いていて、一つだけ設計を変更したい点が出てきました。

現在は

Campaign
↓
Chapter
↓
Scene

という階層構造ですが、私は将来的にはQuestを中心にしたいと思っています。

例えば、

Campaign
│
├── Quest
│     ├── Scene
│     ├── NPC
│     └── Dialogue
│
├── Quest
│
└── Quest

という形です。

理由は、TRPGではプレイヤーの体験は「章」ではなくクエストの積み重ねだからです。

チャプターは演出や区切りとして残しつつ、内部ではQuestを中心にデータを結び付ける方が、分岐シナリオやDLC、サイドクエストを扱いやすくなります。

これはまだVer.0.1では採用しませんが、Ver.0.2以降でぜひ検討したい設計案です。
