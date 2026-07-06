# UI_DESIGN.md

# TRPG Authoring Studio (TAS)

Version 0.1

---

# 1. Purpose

本ドキュメントは、TRPG Authoring Studio（TAS）のユーザーインターフェース設計方針を定義する。

UIはAIとの共同制作を前提とし、

「編集」「レビュー」「改善」を高速に繰り返せることを最優先とする。

---

# 2. Design Philosophy

TASは一般的なゲームエディタとは異なる。

目的は

「ゲームを実装する」

ではなく

「ゲームを設計する」

ことである。

UIは以下を重視する。

・情報を探しやすい

・AIが常に利用できる

・Markdown編集が快適

・画像確認が容易

・レビュー結果が分かりやすい

---

# 3. Main Layout

基本画面は4ペイン構成とする。

```text
+-----------------------------------------------------------+
| Toolbar                                                   |
+-----------------------------------------------------------+
| Project Tree | Editor | Preview | AI Assistant            |
|              |        |         |                         |
|              |        |         |                         |
|              |        |         |                         |
+-----------------------------------------------------------+
| Status Bar                                                |
+-----------------------------------------------------------+
```

---

# 4. Toolbar

主な機能

・Project

・Build

・Search

・Review

・Asset

・Git

・Settings

・AI

---

# 5. Project Tree

左ペインはプロジェクト構造を表示する。

例

```text
Campaign

├── Chapter 1

│    ├── Scene 01

│    ├── Scene 02

│    └── Scene 03

├── NPC

├── Monsters

├── Items

├── Dialogue

└── Assets
```

ドラッグ＆ドロップで並び替え可能。

---

# 6. Editor

中央左ペイン。

Markdown編集を基本とする。

対象

・Scene

・NPC

・Item

・Quest

・Dialogue

・Campaign

リアルタイム保存を行う。

---

# 7. Preview

中央右ペイン。

編集内容を視覚化する。

表示例

・背景画像

・NPC立ち絵

・アイテム画像

・Scene構成

・Dialogueプレビュー

・Battleイメージ

プレビューはBuild不要で更新される。

---

# 8. AI Assistant

右ペイン。

Game GPTとの共同制作を行う。

AIは現在開いている編集対象を理解している。

利用例

・改善提案

・レビュー

・会話生成

・NPC追加

・Scene追加

・画像生成

AIは提案のみを行い、

編集内容は人間が確認して反映する。

---

# 9. Suggestion Panel

AI Assistantはチャットだけではない。

改善候補を自動表示する。

例

・Dialogueが短い

・NPCが未使用

・伏線未回収

・画像未設定

・Quest導線不足

ユーザーは

・適用

・却下

・後で確認

を選択できる。

---

# 10. Search

プロジェクト全体を検索できる。

対象

・名前

・タグ

・本文

・UUID

・AI Memory

・Play Log

・Asset

---

# 11. Asset Browser

Assetを一覧表示する。

カテゴリ

・Background

・Portrait

・Monster

・Item

・Icon

・Voice

・Music

・Movie

AI生成画像もここで管理する。

---

# 12. Review Window

レビュー結果を一覧表示する。

カテゴリ

・Error

・Warning

・Suggestion

・AI Review

対象クリックで該当箇所へ移動する。

---

# 13. Build Window

Build結果を表示する。

内容

・Build成功

・Build失敗

・Validation

・JSON生成

・Assetリンク

・出力サイズ

---

# 14. Version Control

Gitを前提とする。

将来的には以下を追加予定。

・Commit

・Branch

・History

・Diff

・AIレビュー付きCommit

---

# 15. Multi Selection

複数データを同時編集できる。

例

NPCを10人選択

↓

画像生成

↓

一括更新

---

# 16. Context Menu

すべてのオブジェクトに共通メニューを持つ。

例

・Open

・Rename

・Duplicate

・Move

・Delete

・Review

・Improve

・Generate

---

# 17. Keyboard First

主要操作はショートカット対応。

例

Ctrl + S

保存

Ctrl + P

検索

Ctrl + Shift + G

Game GPT

Ctrl + B

Build

---

# 18. Responsive Design

将来的に以下へ対応する。

・Desktop

・Tablet

ブラウザを基本とし、

モバイル編集は対象外とする。

---

# 19. MVP UI

MVPでは以下のみ実装する。

・Project Tree

・Markdown Editor

・AI Assistant

・Preview

・Build

その他は段階的に追加する。

---

# 20. UI Principles

TASのUIは、

「AIチャット」

ではない。

制作画面のすべてがAIと接続され、

必要なタイミングで自然にAI支援を受けられる環境を提供する。

制作者は常に制作対象へ集中でき、

AIはその作業を支援する存在である。

---

# 21. 追加

私は、UIをもう一歩進化させたいと思っています。

「Project Tree」を「Project Graph」にする構想です。

例えば左側が単なるツリーではなく、

Campaign
   │
   ├── Scene 01
   │      ├── NPC: Lily
   │      ├── Item: Potion
   │      └── Quest: Rescue
   │
   └── Scene 02
          └── Goblin

のように関係性を視覚化できます。

さらに将来的には、

NPCの登場回数
Questの流れ
Scene同士の接続
伏線の関係

をグラフビューで表示できるようにしたい。

これは通常のゲームエディタにはあまりない機能ですが、シナリオ中心のゲームでは非常に価値があると思います。
