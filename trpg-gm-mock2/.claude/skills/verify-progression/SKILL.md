---
name: verify-progression
description: Run the progression harness before claiming scenario data is correct. Use whenever exits, secrets, loot, completeRequires, encounters, or match words are changed, or when a player reports being stuck or unable to finish a chapter.
---

# Verify Progression

シナリオの進行が壊れていないことを、目で読むのではなく機械で確かめる。

進行の可否を決めるのは次の項目だけである（2026-08-03に実測）。

1. `exits[].match`（トリガー語句）
2. `exits[].to`（移動先）
3. `exits[].requires`（必要条件）
4. `secrets[].id`（`requires`の参照先）
5. `completeRequires`（**出口を持たないシードでのみ有効**。出口があると`sceneCompleteAllowed`が先にfalseを返し、一度も評価されない）
6. `loot[].name` / `loot[].requires`（品物を要求する出口があるため）

進行のゲートは「秘密」と「品物」の2系統だけである。world_flagsと戦闘結果は進行を止めない。

## Workflow

1. ハーネスを走らせる。

```bash
cd /Users/yasuda_k/Desktop/Terminus/trpg-gm-mock2
npm run test:progression
```

2. **元データにも必ず向ける。** 既定はmock2の複製を読むが、複製は古いことがある。作者が編集しているのは`TAS/data`側である。

```bash
CHAPTER=/Users/yasuda_k/Desktop/Terminus/TAS/data/chapter_01.json \
  node src/engine/progression.test.mjs
```

3. TAS側の出力契約も壊れていないことを確認する。

```bash
cd /Users/yasuda_k/Desktop/Terminus/TAS && npm test
```

4. 照合語（`match`）や別名（`aliases`）を変えたときは、ハーネス内のケース集（検査4・7）も追随させる。あれは対象データの語彙に依存する。

5. 基準出力（`tests/fixtures/golden/`）が変わる変更をしたときは、`npm run test:update`で更新し、**`git diff`で差分が意図した範囲だけか必ず確認する**。差分を見ずに更新すると、壊れた出力を基準として固定してしまう。

## 検査が捕まえるもの

| 検査 | 捕まえる不具合 |
|---|---|
| 1 | 開示条件が存在しないIDを参照（恒久的な進行不能） |
| 2 | 出口の移動先が実在しないシーン |
| 3 | 全知でも最終シーンへ到達できない／到達不能シーン |
| 4 | 想定した言い回しで出口が選べない |
| 5 | 進行に必要な秘密に開示手段が無い |
| 6 | 同一シーンで開示語が衝突（**エラーも出ず、ただ何も開示されない**） |
| 7 | 自然な言い回しで秘密を指せない |
| 8 | 出口が要求する品物が入手できない／品物の出現条件が未定義 |
| 9 | `completeRequires`だけが要求していて出口側に無い（作者の意図が黙って失われている） |
| 10 | 出口の照合語が他の出口に取られている（先着順のため後ろが選べない） |
| 11 | 遭遇の敵が解決できない／必要な調査対象がtypo（永久に発火しない） |

## 守ること

- **緑を目的にしない。** 落ちたら、まず「テストが正しいか」ではなく「データが正しいか」を疑う。過去に実際の欠陥（心石の欠片が永久に出現せず章をクリア不能）をこの検査が見つけた
- **複製が緑でも安心しない。** 2026-08-04、mock2の複製は緑なのに元データは章クリア不能だった
- 検査を追加したら、**故意に壊したデータを通して本当に落ちることを確認する**。落ちないテストは無意味である
- ロジックを複製しない。`resolveExit`・`requiresMet`・`uniqueBestSecretTextMatch`・`resolveEncounterFoe`など、mock2の実物の関数をimportして使う

## 関連

- `read-consumer-before-edit`（フィールドを足す前に消費側を読む）
- `verify-tas-output`（画像・描画の確認）
- ハーネス本体: `trpg-gm-mock2/src/engine/progression.test.mjs`
