# AI_SYSTEM.md

# TRPG Authoring Studio (TAS)

Version 0.1

---

# 1. Purpose

本ドキュメントは、TRPG Authoring StudioにおけるAIシステムの役割と設計方針を定義する。

AIはコンテンツを自動生成するためだけの仕組みではない。

TASでは、AIを制作チームの一員として位置付ける。

---

# 2. AI Philosophy

AIはゲームデザイナーではない。

AIはプログラマーでもない。

AIは制作者の共同作業者（Copilot）である。

AIは提案する。

人間は判断する。

この役割分担をすべての機能で維持する。

---

# 3. Core Principles

AIは以下を遵守する。

・勝手にプロジェクトを書き換えない

・必ず提案として返す

・理由を説明できる

・プロジェクト全体を考慮する

・Design Pillarsを守る

・長期的な整合性を維持する

---

# 4. Game GPT

TASが提供するAI機能の総称を「Game GPT」とする。

Game GPTは単一のLLMではなく、AIサービス全体を抽象化した名称である。

Game GPTは以下の機能を提供する。

・Generate

・Review

・Improve

・Summarize

・Search

・Explain

・Translate

・Analyze

・Build Support

・Documentation

---

# 5. AI Provider Layer

Game GPTはAI Provider Interfaceを経由して利用する。

```text
Game GPT
     │
Provider Interface
     │
 ├── OpenAI
 ├── Anthropic
 ├── Gemini
 ├── Local LLM
 └── Custom Provider
```

Providerは交換可能とする。

Game GPTはProviderに依存しない。

---

# 6. AI Roles

AIは役割単位で利用する。

代表例

## Reviewer

品質レビュー

---

## Writer

文章生成

---

## Designer

ゲームデザイン支援

---

## Dialogue Writer

会話生成

---

## World Builder

世界設定支援

---

## Image Assistant

画像生成支援

---

## Documentation Assistant

設計書生成

---

## Build Assistant

Buildエラー解析

---

## QA Assistant

矛盾検出

---

## Translation Assistant

多言語対応

役割は今後追加可能である。

---

# 7. Context System

AIは現在編集中のファイルだけではなく、

Project Contextを利用する。

Context例

PROJECT.md

↓

GDD

↓

Campaign

↓

Scene

↓

NPC

↓

Dialogue

↓

Design Pillars

↓

Meeting Notes

↓

Git History

AIは必要最小限のContextを取得する。

---

# 8. Prompt Pipeline

ユーザー入力は直接LLMへ送信しない。

```text
User Request

↓

Context Builder

↓

Prompt Builder

↓

LLM

↓

Post Processor

↓

Suggestion
```

Prompt生成はTASが担当する。

---

# 9. Suggestion System

AIは編集ではなくSuggestionを返す。

Suggestionには以下を含める。

・理由

・影響範囲

・変更内容

・対象ファイル

・信頼度

ユーザーが適用を決定する。

---

# 10. Review Pipeline

ReviewはGenerateより重要である。

Review対象

・世界観

・設定矛盾

・Quest

・Scene

・Dialogue

・NPC

・Item

・Monster

・画像不足

・未使用データ

ReviewはBuild前にも実施できる。

---

# 11. AI Memory

AIは人格を保持しない。

保持するのは制作情報のみである。

例

・最近編集したScene

・レビュー履歴

・採用された提案

・プロジェクト方針

・禁止事項

これらはProject単位で保持する。

---

# 12. AI Cost Strategy

AI利用は用途ごとに最適化する。

### 高品質LLM

利用例

・世界観

・重要Dialogue

・レビュー

・設計相談

---

### ローカルLLM

利用例

・要約

・タグ付け

・大量生成

・整形

・リファクタリング

---

### AI未使用

利用例

・検索

・Validation

・Build

・Asset管理

AIを使わない方が適切な処理は積極的に非AI化する。

---

# 13. Batch Generation

大量生成はバックグラウンド処理とする。

例

・Goblin 100体

・Dialogue 500件

・Quest生成

・画像生成

ジョブキューに登録し、非同期で実行する。

---

# 14. Human Review

AI生成物は必ずレビュー可能である。

レビュー操作

・Accept

・Reject

・Edit

・Regenerate

・Compare

AI生成物を直接保存しない。

---

# 15. AI Independence

AI機能は独立モジュールとして設計する。

AIが利用できない場合でも、

Editor

Build

Asset管理

Project管理

は動作する。

AIは必須機能ではなく、

制作支援機能である。

---

# 16. Future Expansion

将来的な機能

・複数AIによるレビュー

・AI同士の議論

・専門AIの自動選択

・画像AIとの連携

・音声AIとの連携

・動画Storyboard生成

・プレイログ解析

・SNS記事生成

・マーケティング支援

---

# 17. Success Criteria

Game GPTが成功した状態とは、

「AIが多く生成した」

ことではない。

制作者が、

・迷う時間が減る

・品質が向上する

・レビューが速くなる

・アイデアが広がる

と感じられることである。

---

# 18. Summary

Game GPTは、LLMを呼び出すAPIではない。

プロジェクト全体を理解し、

制作者と共同でゲームを育てるための制作支援システムである。

AIは創造性を代替しない。

AIは創造性を支援する。

TASは、この思想を中心に設計される。

---

# 19. 追加

私は、AI_SYSTEM.mdをさらにもう一段階分割した方が良いと考えるようになりました。

具体的には、将来的に次の2つへ分離します。

AI_SYSTEM.md
    │
    ├── AI_RUNTIME.md
    │      （Game GPTの実装）
    │
    └── AI_AUTHORING.md
           （AIオーサリングパイプライン）

その理由は、今までの議論で明確になったように、ゲーム内AIとゲーム制作AIは目的もコスト構造も異なるからです。

AI_AUTHORINGは、ローカルLLMも含めて大量のコンテンツ生成・レビュー・改善を行う「開発用AI」。
AI_RUNTIMEは、Player AppでGMやAI冒険者を支える「運営用AI」で、できるだけLLM利用を抑え、事前生成データやルールベースと組み合わせる。

この分離は、あなたが以前提案した「オーサリング時にDBを作り、ランタイムでは極力そのデータを使う」という思想とも一致しています。

私としては、この2本立てがTAS全体のアーキテクチャを支える重要な設計になると考えています。
