# SYSTEM_WORKFLOW.md

Version 1.0

---

# Purpose

本ドキュメントは、本プロジェクト全体のワークフローを定義する。

Player App・TRPG Authoring Studio（TAS）・Conversation Engine・Build System の責務と、それぞれがどのように連携してゲーム体験を構成するかを示す。

本システムは「ゲームを作る」「ゲームを遊ぶ」「プレイ結果を残す」の3つのライフサイクルを持つ。

---

# Design Philosophy

本プロジェクトは、

**「リアルの卓上ゲームをAIが支援するプラットフォーム」**

として設計する。

紙マップ・フィギュア・ダイスなどの卓上要素を尊重し、AIはそれらを置き換えるのではなく、物語とゲーム進行を支援する役割を担う。

設計原則は以下とする。

* 人間は盤面を管理する。
* AIはストーリーを管理する。
* Player Appは卓上ゲームのコントローラーとして機能する。
* TASはコンテンツ制作環境である。
* Build Systemは制作物を実行可能な形へ変換する。

---

# System Overview

```text
                ┌──────────────────────┐
                │ TRPG Authoring Studio│
                └──────────┬───────────┘
                           │
                           ▼
                     Build System
             ┌─────────┴─────────┐
             │                   │
             ▼                   ▼
      Runtime Package      Print Package
             │                   │
             │                   ▼
             │             プレイヤー準備
             │
             ▼
         Player App
             │
             ▼
   Conversation Engine
             │
             ▼
         AI Provider
```

---

# Lifecycle

本プロジェクトは3つのライフサイクルで構成される。

## 1. Authoring Lifecycle

ゲームを制作する工程。

```text
企画

↓

Campaign制作

↓

Scene制作

↓

NPC制作

↓

Dialogue制作

↓

Build
```

担当

* TAS
* Build System

成果物

* Runtime Package
* Print Package

---

## 2. Play Lifecycle

プレイヤーが実際に遊ぶ工程。

```text
Campaign選択

↓

印刷物準備

↓

卓上準備

↓

Session開始

↓

ゲームプレイ

↓

Session終了

↓

Save
```

担当

* Player App
* Conversation Engine

---

## 3. Chronicle Lifecycle

プレイ結果を記録する工程。

```text
Play Log

↓

整理

↓

Chronicle

↓

保存
```

Chronicleはゲーム進行とは独立した成果物である。

---

# Responsibility

## TAS

担当

* コンテンツ制作
* AI支援
* Build
* Validation

担当しない

* プレイ
* セーブ
* AI会話

---

## Build System

担当

* Runtime Package生成
* Print Package生成
* Validation

Buildは唯一の変換工程とする。

---

## Player App

担当

* Session管理
* Action入力
* 演出
* セーブ
* 卓上補助
* ゲーム情報表示

担当しない

* コンテンツ制作
* Prompt生成
* LLM管理

---

## Conversation Engine

担当

* Intent解析
* Prompt生成
* LLM通信
* 応答生成
* 音声認識連携
* 音声合成連携

担当しない

* 戦闘処理
* シナリオ制作
* UI

---

# Preparation Workflow

ゲーム開始前の準備工程。

```text
Campaign選択

↓

必要素材確認

↓

Print Package印刷

↓

紙マップ配置

↓

フィギュア配置

↓

キャラクターシート準備

↓

Player App接続

↓

Session開始
```

Player Appは準備を支援するが、印刷物はBuild Systemが生成する。

---

# Play Workflow

ゲームプレイ中の流れ。

```text
プレイヤー相談

↓

フィギュア移動

↓

重要なAction入力

↓

Conversation Engine

↓

Game Runtime

↓

演出

↓

AI応答

↓

次の行動
```

重要なActionのみをアプリへ入力する。

盤面そのものは人間が管理する。

---

# Human Responsibilities

プレイヤーが管理する。

* 紙マップ
* フィギュア
* ダイス
* キャラクターシート
* HPメモ
* プレイヤー同士の相談

---

# AI Responsibilities

AIが管理する。

* シナリオ
* Scene
* NPC
* AI冒険者
* Quest
* Dialogue
* Event
* プレイログ

---

# Data Flow

```text
Player

↓

Player App

↓

Conversation Engine

↓

Game Runtime

↓

Response

↓

Player App

↓

Player
```

ゲームロジックと会話処理は分離する。

---

# Save Flow

Session終了時

```text
Session

↓

Save Data

↓

Play Log

↓

AI Memory更新
```

必要に応じてChronicle生成へ利用する。

---

# Design Principles

本プロジェクトでは以下を設計原則とする。

* 紙をゲームの中心とする。
* AIは物語を担当する。
* Player Appは卓上ゲームを補助する。
* ゲームロジックと会話処理を分離する。
* Buildを唯一の変換工程とする。
* データはライフサイクルに従って管理する。

---

# Future Compatibility

本ワークフローは以下の拡張を考慮して設計する。

* 音声認識
* 音声合成
* ローカルLLM
* AI Provider切替
* AIオーサリング支援
* プレイログ解析
* Chronicle生成

これらは既存ワークフローを変更することなく追加できることを目標とする。
