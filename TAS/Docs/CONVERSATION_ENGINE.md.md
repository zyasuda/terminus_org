# CONVERSATION_ENGINE.md

Version 0.1

---

# Purpose

Conversation Engine（CE）は、プレイヤーとAIの会話を管理する独立コンポーネントである。

CEはゲームロジックを持たない。

自然言語をゲームコマンドへ変換し、ゲームイベントから自然な会話を生成する役割を持つ。

Player App・Mock・TRPG Authoring Studio(TAS)から共通利用できることを目的とする。

---

# Design Principles

Conversation Engineは以下を遵守する。

* ゲームルールを持たない
* UIを持たない
* LLMに依存しない
* Providerを交換可能
* 音声入力を前提としない
* 音声出力を前提としない
* APIとして利用できる

Conversation Engineは純粋な会話エンジンとして設計する。

---

# Responsibilities

Conversation Engineが担当する。

* Speech To Text
* Text Input
* Intent解析
* Command生成
* Prompt生成
* LLM呼び出し
* 応答生成
* Emotion生成
* Tone生成
* Text To Speech用文章生成

担当しない。

* 戦闘
* マップ
* キャラクター管理
* アイテム
* セーブ
* ダイス
* Quest管理
* ゲーム状態管理

---

# System Architecture

```text
                  Player

                     │

      Text / Speech Input

                     │

                     ▼

        Conversation Engine

 ┌───────────────────────────────────┐

 Speech To Text

 Intent Parser

 Context Builder

 Prompt Builder

 LLM Provider

 Response Generator

 Emotion Generator

 Voice Formatter

 └───────────────────────────────────┘

          │                │

          ▼                ▼

 Game Command        Response Text

          │                │

          ▼                ▼

      Game Runtime      Text To Speech
```

---

# Input

Conversation Engineは以下を受け取る。

Player Input

```text
店主に話しかける
```

または

Speech

```text
音声データ
```

Runtime Event

```text
Battle Started

NPC Joined

Quest Updated
```

---

# Output

Conversation Engineは2種類の出力を返す。

## Game Command

```json
{
  "command":"Talk",
  "target":"Innkeeper"
}
```

## AI Response

```json
{
  "speaker":"GM",
  "text":"店主はこちらを見て笑った。"
}
```

---

# Intent Parser

自然言語をゲームコマンドへ変換する。

例

```text
攻撃する
```

↓

```text
Attack
```

---

```text
店主に聞く
```

↓

```text
Talk
```

---

```text
ポーションを飲む
```

↓

```text
UseItem
```

Intent Parserは辞書方式とLLM方式を切り替え可能とする。

---

# Context Builder

Conversation Engineは必要最小限のContextを取得する。

例

現在Scene

現在NPC

Player情報

Quest状態

最近の会話

Design Rules

ContextはRuntimeから取得する。

---

# Prompt Builder

Prompt Builderは内部でPromptを構築する。

ユーザー入力をそのままLLMへ送信しない。

Promptには以下を含める。

* 世界観
* NPC情報
* Scene情報
* 最近の会話
* 発言者
* 会話目的

---

# LLM Provider

Provider Interfaceを採用する。

対応予定。

* OpenAI
* Anthropic
* Gemini
* Local LLM
* Custom Provider

Conversation EngineはProviderへ依存しない。

---

# Response Generator

LLMの結果をゲーム向けへ整形する。

生成内容

* 会話
* 地の文
* 感情
* 演出タグ

必要に応じて文字数制限を行う。

---

# Emotion

感情は別データとして保持する。

例

```json
{
  "emotion":"Happy"
}
```

Player Appは

Happy

Angry

Fear

Sad

Neutral

などを演出へ利用できる。

---

# Voice Formatter

Text To Speech向け文章を生成する。

例

画面表示

```text
（店主は苦笑しながら肩をすくめた。）

「それは困った話だ。」
```

音声読み上げ

```text
それは困った話だ。
```

地の文とセリフを分離する。

---

# Runtime API

Mockから利用するAPI例

```text
POST

/conversation/player
```

Request

```json
{
    "player":"Player01",
    "text":"店主に話しかける"
}
```

Response

```json
{
    "command":"Talk",
    "response":"店主は笑顔で迎えた。"
}
```

---

# Runtime Event API

ゲーム側から通知する。

例

```text
Battle Started

Battle Finished

Quest Updated

Scene Changed

NPC Joined

NPC Left
```

Conversation EngineはこれをContextへ反映する。

---

# Speech Interface

Speech To Text

↓

Conversation Engine

↓

Response Text

↓

Text To Speech

Speech実装はConversation Engine外部で交換可能とする。

初期実装では

* iOS Speech Framework
* AVSpeechSynthesizer

を想定する。

---

# Logging

Conversation Engineは会話ログを保存する。

例

```text
Time

Speaker

Intent

Command

Response

Latency
```

ログはデバッグおよびプレイログ生成に利用する。

---

# Debug Mode

開発用に以下を表示可能とする。

* 認識テキスト
* Intent
* Context
* Prompt
* Provider
* LLM応答時間
* Game Command

MockではDebug表示を有効にできる。

---

# Future

将来的に対応予定。

* Speaker Identification
* 複数人同時会話
* Voice Emotion
* Voice Clone
* Streaming Response
* NPC同士の会話
* AI Party Member

---

# Summary

Conversation Engineはゲームロジックを持たない。

Conversation Engineは

「自然言語」と「ゲームシステム」を接続するための共通レイヤーである。

Player App・Mock・TASはConversation Engineを共通利用し、それぞれの役割に応じてUIやゲームロジックを実装する。

Conversation Engineを独立コンポーネントとして設計することで、LLM・音声認識・音声合成・AI Providerの変更に柔軟に対応できる。

---

# 追加

現時点では Mock、Player App、TAS の3つを考えていますが、共通基盤としてもう一つリポジトリを設けると整理しやすくなります。

foundation/
│
├── player-app/
├── mock/
├── tas/
└── conversation-engine/

conversation-engine は、会話処理・LLM・音声認識・音声合成・Intent解析などをまとめた独立ライブラリ（またはサービス）です。

こうしておくと、

Mockは会話実験に利用
Player Appはゲームプレイに利用
TASは制作支援に利用

と、同じ基盤を共有できます。

以前あなたが話していた「ゲーム用GPT」を、プロダクト横断で使える共通エンジンとして育てていける構成になるため、長期的にも保守しやすい設計になると考えています。
