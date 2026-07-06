# AUTHORING_PIPELINE.md

# TRPG Authoring Studio (TAS)

Version 0.1

---

# 1. Purpose

本ドキュメントは、TRPG Authoring StudioにおけるAIオーサリングパイプラインを定義する。

TASでは、ゲームを直接制作するのではなく、ゲームを構成するデータを段階的に構築していく。

AIは各工程で制作を支援し、人間がレビューを行いながら品質を高める。

---

# 2. Basic Philosophy

ゲーム制作は、一度に完成するものではない。

アイデアからゲームデータまでを、小さなステップに分けて改善を繰り返す。

```
Idea
 ↓
Draft
 ↓
Review
 ↓
Improve
 ↓
Approve
 ↓
Build
```

AIは各工程で支援を行う。

---

# 3. Pipeline Overview

TASでは制作を以下のフェーズに分割する。

```
Project

↓

World

↓

Campaign

↓

Chapter

↓

Scene

↓

Quest

↓

NPC

↓

Dialogue

↓

Assets

↓

Validation

↓

Build
```

各フェーズは独立して改善可能である。

---

# 4. Phase 0 : Project

制作するゲーム全体を定義する。

対象

・コンセプト

・Design Pillars

・ターゲット

・世界観

AI支援

・企画レビュー

・不足要素抽出

・競合作品比較

---

# 5. Phase 1 : World

ゲーム世界を構築する。

対象

・歴史

・国家

・宗教

・種族

・文化

AI支援

・設定生成

・矛盾検出

・年表作成

---

# 6. Phase 2 : Campaign

長編ストーリーを設計する。

対象

・メインストーリー

・チャプター構成

・分岐

・エンディング

AI支援

・構成レビュー

・テンポ分析

・伏線確認

---

# 7. Phase 3 : Scene

ゲーム進行をSceneへ分割する。

対象

・背景

・登場人物

・イベント

・遷移

AI支援

・Scene追加

・導線改善

・演出提案

---

# 8. Phase 4 : Quest

Questを構築する。

対象

・目的

・報酬

・条件

・失敗

AI支援

・難易度分析

・報酬バランス

・導線確認

---

# 9. Phase 5 : NPC

NPCを制作する。

対象

・性格

・立場

・会話

・画像

AI支援

・人格設計

・立ち絵生成

・Dialogue生成

---

# 10. Phase 6 : Dialogue

会話を制作する。

対象

・イベント

・通常会話

・戦闘

・感情

AI支援

・口調統一

・感情分析

・文章改善

---

# 11. Phase 7 : Assets

画像・音声を制作する。

対象

・背景

・立ち絵

・モンスター

・アイコン

・音楽

AI支援

・画像生成

・タグ付け

・プロンプト管理

---

# 12. Phase 8 : Review

プロジェクト全体をレビューする。

レビュー対象

・設定矛盾

・未使用Asset

・未接続Scene

・Quest漏れ

・会話不足

・テンポ

AIは改善案を提示する。

---

# 13. Phase 9 : Validation

Build前に自動検証を行う。

例

・UUID重複

・Broken Link

・Asset不足

・循環参照

・未設定項目

ValidationはAIを利用しない。

---

# 14. Phase 10 : Build

Markdownからゲームデータを生成する。

生成物

・JSON

・Asset Index

・Localization

・Runtime Package

Player AppはBuild成果物のみ利用する。

---

# 15. Human Approval Gate

各フェーズには承認ステップを設ける。

```
Generate

↓

Review

↓

Improve

↓

Approve

↓

Next Phase
```

承認前のデータは次工程へ進めない。

---

# 16. AI Learning

AIは学習モデルを更新しない。

代わりに、制作プロジェクト内の情報を参照して提案を改善する。

利用する情報

・PROJECT.md

・GDD

・Design Pillars

・レビュー履歴

・採用履歴

・プレイテスト結果

---

# 17. Batch Pipeline

大量生成はバックグラウンドで実行する。

例

・NPC 100人

・Dialogue 500件

・画像200枚

・Quest 50件

ジョブ管理により進行状況を確認できる。

---

# 18. Continuous Improvement

ゲーム完成後もパイプラインは終了しない。

プレイログ

↓

レビュー

↓

改善案

↓

修正

↓

Build

↓

配信

TASはライブ運営にも対応する。

---

# 19. Pipeline Principles

AIは各工程で支援する。

工程を飛ばさない。

レビューを重視する。

人間が承認する。

Markdownを正本とする。

Buildだけが実行データを生成する。

---

# 20. Summary

AIオーサリングパイプラインは、

ゲームを自動生成する仕組みではない。

人間が設計し、

AIが支援し、

レビューを繰り返しながら、

ゲームデータを成熟させる制作フレームワークである。

TASは、このパイプラインを中心として設計される。

---

# 21. 追加

これまで私は「TASはゲーム制作ツール」だと考えていました。

しかし、このパイプラインを書いてみると、実態は少し違います。

TASは、

ゲーム制作のIDE（統合開発環境）

です。

プログラマーが

VS Code
Visual Studio
Cursor

を使うように、

ゲームデザイナーは

TRPG Authoring Studio

を使う。

つまり、**「AI時代のゲーム制作IDE」**という位置付けです。

この視点で今後の設計を進めると、UIや機能の優先順位も整理しやすくなると思います。
