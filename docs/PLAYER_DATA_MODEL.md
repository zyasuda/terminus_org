# PLAYER_DATA_MODEL.md

Version 1.0

---

# Purpose

本ドキュメントは、Player Appが保持するデータモデルを定義する。

Player Appは単なるセーブデータ管理ではなく、

* プレイヤープロフィール
* キャンペーン
* キャラクター
* セッション
* プレイログ
* AI Memory

を管理する。

本ドキュメントは、それぞれの責務とライフサイクルを定義する。

---

# Design Principles

Player Appが保持するデータは、次の原則に従う。

* データはライフサイクルごとに分離する。
* キャンペーン単位で世界を管理する。
* キャラクターはキャンペーンに所属する。
* プレイヤーは複数のキャンペーンを持てる。
* AI Memoryはキャンペーン単位で保持する。
* プレイログはセッション単位で保存する。
* Chronicleはプレイログから生成される成果物である。

---

# Data Lifecycle

```text
Player
│
├── Profile
│
├── Campaigns
│     │
│     ├── Character
│     │
│     ├── World State
│     │
│     ├── AI Memory
│     │
│     ├── Sessions
│     │
│     └── Save Data
│
└── Settings
```

Playerを最上位とし、その配下に複数のCampaignを保持する。

---

# Profile

Player本人の情報を保持する。

例

* Player Name
* Icon
* Language
* Region
* Accessibility
* Audio Settings
* Notification Settings

Profileは全キャンペーン共通である。

---

# Campaign

Campaignは独立した世界を表す。

保持する情報

* Campaign ID
* Version
* Progress
* World State
* AI Memory
* Character
* Sessions
* Save Data

Campaign同士は互いに影響しない。

---

# Character

CharacterはCampaignに属する。

保持する情報

* Name
* Class
* Level
* Parameters
* Skills
* Inventory
* Equipment
* Status

Characterは他Campaignへ持ち込めない。

---

# World State

Campaign全体の状態を保持する。

例

* 開放済みScene
* NPC状態
* Quest状態
* フラグ
* 入手済み重要アイテム
* ワールドイベント

World StateはCharacterとは独立して管理する。

---

# AI Memory

AIが記憶する情報。

例

* プレイヤーとの会話
* NPCとの関係
* 過去の重要イベント
* AI冒険者との出来事
* 世界で起きた変化

AI MemoryはCampaign終了まで保持される。

---

# Session

1回のプレイをSessionと定義する。

保持する情報

* Session ID
* Date
* Participants
* Start Time
* End Time
* Chapter
* Scene
* Result

SessionはPlay Logを生成する。

---

# Play Log

Session中の出来事を時系列で保持する。

例

* Action
* Dialogue
* Battle
* Dice
* Quest
* Event

Play Logはゲームの進行記録であり、ゲーム本体の状態管理には使用しない。

---

# Save Data

ゲームの再開に必要な状態を保持する。

例

* Current Scene
* Current Position
* Current Chapter
* Character State
* World State

Save Dataはプレイの復元を目的とする。

---

# Chronicle

ChronicleはPlay Logから生成される成果物である。

内容例

* 冒険の概要
* プレイヤーの行動
* NPCとの出来事
* 戦闘結果
* AIによる要約

Chronicleはゲーム進行には利用しない。

---

# Settings

Player App全体の設定。

例

* Audio
* Speech
* Theme
* Font Size
* Input Mode
* Debug Mode

SettingsはCampaignとは独立して保持する。

---

# Data Ownership

各データの責務を以下のように定義する。

| Data        | Owner      |
| ----------- | ---------- |
| Profile     | Player App |
| Campaign    | Player App |
| Character   | Campaign   |
| World State | Campaign   |
| AI Memory   | Campaign   |
| Session     | Campaign   |
| Play Log    | Session    |
| Chronicle   | Session    |
| Settings    | Player App |

---

# Persistence Rules

各データの保持期間を定義する。

| Data        | Lifetime         |
| ----------- | ---------------- |
| Profile     | 永続               |
| Settings    | 永続               |
| Campaign    | キャンペーンクリアまで（削除可） |
| Character   | Campaignと同一      |
| World State | Campaignと同一      |
| AI Memory   | Campaignと同一      |
| Session     | 永続               |
| Play Log    | 永続               |
| Chronicle   | 永続               |

---

# Save Unit

Player Appの保存単位はCampaignとする。

Sessionは履歴として追加される。

Character・World State・AI MemoryはCampaign配下で管理される。

---

# Data Flow

```text
Profile
    │
    ▼

Campaign
    │
    ├── Character
    ├── World State
    ├── AI Memory
    ├── Save Data
    │
    ▼

Session
    │
    ▼

Play Log
    │
    ▼

Chronicle
```

---

# Summary

Player Appは「セーブデータ」を管理するだけのアプリではない。

Player・Campaign・Sessionという3つのライフサイクルを中心にデータを管理し、それぞれを独立させることで、複数キャンペーンへの対応、AI Memoryの継続、プレイログの保存、Chronicle生成などを一貫した設計で実現する。

本データモデルは、Player App・Conversation Engine・TRPG Authoring Studioの共通基盤として利用する。
