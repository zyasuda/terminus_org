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

## 2種類のハーネス

| | `progression` | `playthrough` |
|---|---|---|
| 見るもの | データの整合と到達可能性 | 実物の`sendAction`が本当に章を終わらせるか |
| 動かし方 | 純関数をimportして評価 | 1手番ずつ実際に回す（LLMゼロのscriptedモード） |
| 元データを直接見れる | できる（`CHAPTER=`） | できない（mock2の複製経由のみ） |
| 捕まえられないもの | エンジン側の欠陥 | LLM経路（hybrid/llm）の挙動 |

**両方要る。** 2026-08-04、scriptedモードに品物の取得レーンが無く、品物を要求する出口がある章は完了不能だった。`progression`は213件すべて緑のまま気づかなかった。逆に「出口の移動先が実在しない」は`progression`しか見ていない。

## Workflow

1. ハーネスを走らせる。`npm test`に両方入っている。

```bash
cd /Users/yasuda_k/Desktop/Terminus/trpg-gm-mock2
npm run test:progression
npm run test:playthrough
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
| 12 | 作者が書いた開示方法(trigger)が、別の秘密の短い別名に負けて別の対象が開く |
| 13 | 進行必須の秘密が、粘っても開かない（難易度が下がらない／下限で自動成功にならない） |
| 14 | 複数条件の出口に、専用の進めない理由が用意されていない |

### playthrough が捕まえるもの

台本は書かない。章データから「そのシーンの秘密を全部開き、置かれた品を全部拾い、出口へ進む」を機械的に導き、実物の`sendAction`を回す。台本を書くとデータが変わったとき台本が腐る。

| 捕まえる不具合 |
|---|
| データは正しいのに、エンジンがそのデータで進めない |
| 作者の`trigger`でも`〜を調べる`でも秘密が開かない（8回×全候補を試して落ちる） |
| 開示条件は満たしているのに品物が入手できない |
| 出口の条件を満たしたのにシーンが変わらない（拒否文言つきで報告） |
| 章が最後まで終わらない／どこで詰まったか |
| scriptedモードなのにLLMを呼んでいる（`/api/gm`のスタブが例外を投げる） |

出目は種付き乱数で固定する。`SEED=`で変えられる。**落ちたときは種を変えて再実行し、運の問題かデータの問題かを切り分ける**（現状は種1・42・777・99999で通る）。

```bash
SEED=42 npm run test:playthrough
CAMPAIGN=lanternhill CHAPTER_ID=chapter_01 npm run test:playthrough
```

## ハーネスが届かない層: 実プレイでしか見つからない不具合

ハーネスはデータの整合と到達可能性を保証するが、**LLMの解釈を経た実際の開示・判定**は保証しない。2026-08-04の実プレイで、データは検査5〜7を全て通過していたのに、作者の`trigger`が別の秘密の1文字の別名に負けて開かない不具合（検査12として固定）が見つかった。実プレイでしか出ない層が確かにある。

実プレイの進め方:

1. `.env`のバックエンドを確認する（複数行あると最後が採用される）。ローカルLLM（ollama等）ならAPI費用がかからない
2. Playwrightでイントロ→各シーン→アウトロまで通す。判定要求（「ダイスを振る!」）とポップアップ（`#popupOverlay`）はプレイヤー操作として自動で処理する必要がある。入力は`p.fill`（`value`の直接代入はReactの`onChange`を素通りする）
3. **判定は失敗しうる。固定1回で諦めず、開示されるまで再挑戦する。** 開示の判定は「🔓の総数が増えたか」で見る（直近数件を見る方式は前ターンの開示を誤検出する）
4. 想定外の言い回し・照合語に無い曖昧な宣言も混ぜて、意図分類とGMの反応を見る
5. **GMの語りは`#chat`のメインリストには出ない。** `App.jsx`が`cls==="gm"`のメッセージを意図的に`#chat`から除外し、`id="gmBubble"`という別要素（吹き出し）に表示する設計。GMの応答を検証するときは`document.getElementById("gmBubble").textContent`を読む。`#chat`の子要素だけを見ると「GMが応答していない」という誤検知になる（2026-08-04に実際に30分近く不具合調査をした後で気づいた）

## 実データを書き換える危険（重要）

**TASの`MOCK2_DIR`の既定値は実データを指す。** ブラウザ自動操作でTASの出力・簡単作成・保存系のボタンに触れると、意図せず実データへ書き込む。2026-08-04、原因を特定できないまま実データに見知らぬキャンペーン（`campaigns.json`に架空のtitleを持つエントリ、`campaigns/campaign/`ディレクトリの再生成）が混入した事故が実際に起きた。

- TASをPlaywright等で自動操作するときは、**必ず`MOCK2_DIR`を一時ディレクトリへ向ける**（`MOCK2_DIR=/tmp/xxx node server.cjs`）
- 作業の前後で`git status --short -- trpg-gm-mock2/public/data/`を確認し、意図しない差分が無いか見る
- 混入に気づいたら、削除ではなく**退避**（別ディレクトリへ移動）してから調べる。原因が確定するまで確証のない推測を報告に書かない

## 守ること

- **緑を目的にしない。** 落ちたら、まず「テストが正しいか」ではなく「データが正しいか」を疑う。過去に実際の欠陥（心石の欠片が永久に出現せず章をクリア不能）をこの検査が見つけた
- **複製が緑でも安心しない。** 2026-08-04、mock2の複製は緑なのに元データは章クリア不能だった
- 検査を追加したら、**故意に壊したデータを通して本当に落ちることを確認する**。落ちないテストは無意味である
- ロジックを複製しない。進行の核は`src/engine/progression.js`に純関数として切り出してある（`resolveExit`・`requiresMet`・`uniqueBestSecretTextMatch`・`resolveEncounterFoe`・`pickExamineSecret`・`examineDifficulty`）。これらは`ctx`（`{revealed, inventory}`）だけに依存し、モジュール内の共有可変状態を見ない
- **`playthrough`に台本を書き足したくなったら止まる。** データから導けない台本は、データが変わった瞬間に嘘になる
- **進行必須の情報をダイス運のゲートの奥に置かない。** 設計メモ3節が「初期モックの失敗」と名指しした構造。失敗を許容するなら、`examineDifficulty`のように失敗を無駄にしない設計（粘れば必ず近づく）とセットにする

## 関連

- `read-consumer-before-edit`（フィールドを足す前に消費側を読む）
- `verify-tas-output`（画像・描画の確認）
- ハーネス本体: `trpg-gm-mock2/src/engine/progression.test.mjs`
