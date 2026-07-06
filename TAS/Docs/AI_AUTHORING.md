# AI_AUTHORING.md

# AI Authoring Pipeline

Version 0.1

---

# 1. Purpose

AI Authoring Pipelineは、TRPGコンテンツ制作を支援するためのAIワークフローを定義する。

目的は、

AIにゲームを作らせることではない。

人間とAIが共同でゲームを育てる制作プロセスを実現することである。

---

# 2. Basic Philosophy

ゲーム制作は、

「Generate」

では終わらない。

Generate

↓

Review

↓

Improve

↓

Review

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

この循環を高速化することが目的である。

---

# 3. AI Authoring Flow

制作工程は以下の順番で進む。

```text id="p7r2vq"
Idea

↓

World

↓

Campaign

↓

Chapter

↓

Quest

↓

Scene

↓

NPC

↓

Dialogue

↓

Assets

↓

Review

↓

Build

↓

Play Test
```

AIは各工程で支援を行う。

---

# 4. Stage 1 : Idea

入力

人間のアイデア

AI支援

・企画整理

・競合分析

・リスク分析

・アイデア展開

成果物

PROJECT.md

---

# 5. Stage 2 : World

世界観を制作する。

AI支援

・歴史

・文化

・宗教

・国家

・地理

・勢力

成果物

World Database

---

# 6. Stage 3 : Campaign

Campaignを設計する。

AI支援

・物語構成

・主人公

・敵勢力

・目的

・エンディング候補

成果物

Campaign.md

---

# 7. Stage 4 : Quest

Questを設計する。

AI支援

・導線

・難易度

・報酬

・分岐

・失敗条件

成果物

Quest Database

---

# 8. Stage 5 : Scene

Sceneを制作する。

AI支援

・イベント

・会話

・演出

・背景

・マップ候補

成果物

Scene.md

---

# 9. Stage 6 : NPC

NPCを制作する。

AI支援

・人格

・口調

・職業

・プロフィール

・立ち絵Prompt

・Voice設定

成果物

NPC Database

---

# 10. Stage 7 : Dialogue

Dialogueを制作する。

AI支援

・通常会話

・イベント

・戦闘

・失敗

・雑談

・リアクション

Dialogueは状況別に分類する。

---

# 11. Stage 8 : Asset

Asset生成

AI支援

・背景画像

・立ち絵

・アイコン

・マップ

・アイテム画像

・モンスター画像

Promptも同時保存する。

---

# 12. Stage 9 : Review

ReviewはGenerateより重要である。

AIは

・設定矛盾

・伏線

・世界観

・バランス

・未使用Asset

・会話不足

などを確認する。

---

# 13. Stage 10 : Build

Build Pipelineが

Markdown

↓

JSON

へ変換する。

AIはBuildそのものは担当しない。

---

# 14. Stage 11 : Play Test

Player Appで確認する。

Play Logを取得する。

プレイログは

制作資産

として保存する。

---

# 15. Stage 12 : Feedback

Feedbackは

Issue化される。

例

・Dialogue不足

・Quest長すぎ

・NPC印象が弱い

・画像不足

IssueはAIへ渡される。

---

# 16. Stage 13 : Improve

Issueから

改善案を生成する。

改善後は再びReviewへ戻る。

---

# 17. AI Review Priority

Generateより

Reviewを重視する。

AIは

Reviewer

として利用する時間を最も長くする。

---

# 18. Batch Pipeline

大量生成はJob Queueへ送る。

例

・Dialogue 500件

・Goblin 200体

・画像100枚

・アイテム300件

夜間Buildも可能とする。

---

# 19. Human Approval

AIは制作する。

人間は承認する。

すべての成果物は

Approve

されるまで正式データにならない。

---

# 20. Final Goal

AI Authoring Pipelineの目的は、

ゲームを量産することではない。

制作速度と品質を同時に向上させることである。

AIは制作を自動化するためではなく、

制作を加速するために存在する。

---

# 21. 追加

実は、TASはゲーム制作ツールというより「知識管理システム」でもあります。

世界観、NPC、会話、画像、プレイログ、レビュー結果……すべてがプロジェクトの知識として蓄積されます。

だから私は、将来的にTASへ追加したい機能があります。

Knowledge Graph

例えば、

このNPCはどのQuestに登場する？
この設定はどのDialogueで使われている？
このアイテムは何人のNPCが言及している？

こうした関係を自動で可視化できます。

これは一般的なゲームエディタにはほとんどありませんが、AIと共同制作する環境では非常に価値が高い機能です。
