# ゲームブック進行エンジン v1 仕様

作業対象: `/Users/yasuda_k/Desktop/Terminus/trpg-gamebook`

## 目的

`data/chapter_01.json` を、選択肢だけで最初から最後まで通せるテキストゲームブックとして進行させる、純粋なエンジンを作る。DOM・React・LLM・fetch に一切依存しない。UI は別担当が作る。

## 作るファイル

| ファイル | 内容 |
|---|---|
| `src/gamebook.js` | 進行エンジン本体（新規） |
| `test/playthrough.test.mjs` | 章を通しで完走させる検査（新規） |

**既存の `src/progression.js` と `src/inventory.js` は書き換えない。** mock2 から移植済みで、254件超の検査で担保されたロジック。判定はすべてこれらを呼んで行い、同じ判定を再実装しない。

## 依存できる既存関数（`src/progression.js`）

```
approachLevel(turn, sceneEnteredTurn)   -> 0..3
availableEncounters(sc, ctx)            -> [{enc, foe}]
pickExamineSecret(sc, triggerText, entityText, ctx) -> {secret, triggerHit, textHit}
examineDifficulty(secret, failures)     -> DC
requiresMet(requires, ctx)              -> boolean
resolveExit(sc, text)                   -> exit | null
exitTargetIndexIn(scenes, to)           -> index | -1
actionCandidates(sc, ctx, labelOverrides) -> [{id, label, input}]（最大3件）
```

`ctx` の形は既存関数が期待する通り: `{ revealed: Set, inventory, enemy, defeated: [], fled: [], encounterCounts: {} }`

`src/inventory.js` は `normalizeInventory` / `has` / `give` / `take` / `held` / `startingInventory` を持つ。

## 公開API（これだけ）

```js
export function newGame(chapter, opts = {})  // opts.rng?: () => number(0..1)
export function candidates(state)            // -> [{id, label, input}]
export function act(state, input)            // -> events[]（stateは破壊的に更新する）
```

`act` の戻り値 `events` は、UIがそのまま描画に使える配列。

```js
{type:"narrate", text}                       // 地の文
{type:"reveal",  text, entity}               // 秘密の開示
{type:"roll",    label, roll, dc, ok}        // ダイス結果
{type:"combat",  text}                       // 戦闘の一手
{type:"item",    text, name, count}          // 入手・消費
{type:"move",    text, to}                   // 場面遷移
{type:"blocked", text}                       // 条件未達で進めない
{type:"unknown", text}                       // どの経路にも解決しなかった（状態は変えない）
{type:"end",     text}                       // 章の終わり
```

## 状態

```js
{
  chapter,
  node: "intro" | "scene" | "ending" | "done",
  sceneIndex: 0,          // node==="scene" のときだけ意味を持つ
  turn: 0,
  sceneEnteredTurn: 0,
  revealed: Set<string>,
  inventory,              // inventory.js の形式
  hp: 10, maxHp: 10,
  enemy: null,            // 交戦中は {...foe, hp, openingDanger}
  defeated: [], fled: [],
  encounterCounts: {},
  failures: {},           // secretId -> 失敗回数（examineDifficulty へ渡す）
  flags: {},
  guard: false            // 直前に「防御する」を選んだか
}
```

初期所持品は `chapter.startingInventory.player`（`["ランタン","ナイフ"]`）を `inventory.js` の関数で作る。

## 現在のノード（intro / scene / ending）の取り方

`node === "intro"` なら `chapter.intro`、`"ending"` なら `chapter.ending`、`"scene"` なら `chapter.scenes[sceneIndex]`。intro と ending も `exits` を持つので、同じ「場面オブジェクト」として扱ってよい（`secrets` / `encounters` が無いだけ）。

## candidates(state)

- `actionCandidates(node, ctx, node.authoring?.actionCandidateLabels || {})` を呼ぶ
- `node.decision` があり、かつ `state.flags["decision:" + decision.id]` が未設定なら、**通常候補の代わりに** decision の `choices` を `{id, label, input}` として返す（決断は割り込みで、他の選択より優先する）
- 交戦中（`state.enemy`）で、敵に `weakness.triggers` があり、その語を含む持ち物を持っているなら、弱点を突く候補を1件足してよい。ラベルは `weakness.hint` があればそれ、無ければ「ランタンで照らす」等の素直な文言

## act(state, input) の解決順

**この順で最初に当たったものを実行する。** 新しい解決経路を作らない。

1. **決断イベント**: 現ノードに未選択の `decision` があり、`input` がその `choices[].input` と一致するなら、`state.flags["decision:"+id] = choiceId` を立て、そのまま `choice.input` を 2 以降へ流して続行する
2. **交戦中の行動**（`state.enemy` がある場合、ここで打ち切る）
   - `weakness.triggers` のいずれかを含み、かつその語を含む持ち物を持っている → 弱点処理（後述）
   - 「攻撃」を含む → 攻撃
   - 「防御」を含む → `state.guard = true`、敵の反撃だけ受ける
   - 「逃げ」を含む → d20 が `foe.fleeDc || 10` 以上で離脱（`fled` へ追加）。失敗なら敵の反撃
   - どれでもない → `{type:"unknown"}` で状態を変えない
3. **遭遇の発火**: `availableEncounters(node, ctx)` のうち、`enc.triggerTerms` のいずれかが `input` に含まれるもの → 交戦開始（後述）
4. **調査**: `pickExamineSecret(node, input, input, ctx)` が秘密を返したら判定（後述）
5. **出口**: `resolveExit(node, input)` が出口を返したら、`requiresMet(exit.requires, ctx)` で分岐
   - 満たす → 遷移（後述）
   - 満たさない → `{type:"blocked", text: exit.blockedText || node.blockedText}`。**手番は進めない**
6. どれにも当たらない → `{type:"unknown"}`。状態を変えない

**手番（`state.turn`）は、1〜5 のいずれかで実際に何かが起きたときだけ +1 する。** `unknown` と `blocked` では進めない。

## 調査の判定

```
dc   = examineDifficulty(secret, state.failures[secret.id] || 0)
roll = d20
ok   = roll === 20 || (roll !== 1 && roll >= dc)
```

- 成功 → `revealed.add(secret.id)`、`{type:"reveal", text: secret.text, entity: secret.entity}`
- 失敗 → `state.failures[secret.id]++`、`{type:"roll", ok:false}` と `{type:"narrate"}`（失敗しても DC が 2 ずつ下がるので、繰り返せば必ず開く）
- どちらも `{type:"roll", label:`${secret.entity}を調べる`, roll, dc, ok}` を先に積む
- 成功時、現シーンの `loot` に `requires === secret.id` の品があれば `inv.give` して `{type:"item"}` を積む

## 遭遇の開始

```
foe   = resolveEncounterFoe が返した foe（availableEncounters の戻り値に入っている）
state.enemy = { ...foe, hp: foe.hp ?? foe.maxHp ?? 6,
                openingDanger: approachLevel(state.turn, state.sceneEnteredTurn) }
state.sceneEnteredTurn = state.turn     // 交戦のたびに基準点を巻き戻す
state.encounterCounts[enc.id] = (…||0) + 1
```

`{type:"combat", text: enc.onsetText}` を積む。

## 戦闘

- **攻撃**: d20 が `foe.defenseDc || 12` 以上 → 与ダメージ `d6`。`enemy.hp` を減らす
- **敵の反撃**（攻撃・防御・逃走失敗のあと、敵が生きていれば毎回）:
  ダメージ = `(foe.atk || 1) + (最初の1回だけ enemy.openingDanger)`。`state.guard` が立っていれば 1 減らす（最低0）。適用後 `guard = false`、`openingDanger = 0`
- `state.hp <= 0` → `{type:"end", text:"力尽きた"}`、`node = "done"`
- **撃破**（`enemy.hp <= 0`）→ 後述の撃破後処理
- **弱点**: `{type:"combat", text: weakness.text}` を積み、`weakness.effect === "flee"` なら敵は退く。**このとき撃破後処理も同じように行う**（後述の理由）

### 撃破後処理（撃破・弱点による撃退の両方で行う）

```
foe.revealOnDefeat があれば、その秘密を revealed へ入れて {type:"reveal"} を積む
foe.itemOnDefeat があれば、inv.give を (foe.itemOnDefeatCount || 1) 回して {type:"item"} を積む
撃破なら defeated へ、弱点による撃退なら fled へ foe.name を追加
state.enemy = null
```

**重要**: mock2 では弱点で撃退したとき `revealOnDefeat` が発火せず、シーン2で「ランタンで照らす」を選ぶと `s2a_gap` が永久に開かず出口が開かない詰みになる（2026-08-12にコードで確認）。v1 ではこれを踏まない。撃退でも道は開く。

## 遷移

```
to = exit.to
"end"                        -> node = "done"、{type:"end"}
"ending"                     -> node = "ending"
"scene:N" / 数値 / 文字列id  -> exitTargetIndexIn(chapter.scenes, to) が 0 以上なら node="scene", sceneIndex=その値
解決できない                 -> {type:"blocked"}（黙って壊れない）
```

遷移時:
- `exit.addItems` / `exit.removeItems` を `inv.give` / `inv.take` で適用し `{type:"item"}` を積む
- `state.sceneEnteredTurn = state.turn`
- `{type:"move", text: exit.arrivalText || exit.text, to}` と、遷移先の `brief` を `{type:"narrate"}` で積む

## 乱数

`newGame(chapter, {rng})` で差し替えられること。既定は `Math.random`。テストは必ず固定 seed の rng を渡す。エンジン内で `Math.random` を直接呼ばない。

## 検査（`test/playthrough.test.mjs`）

Node で直接動かす（`node --test` でも素の assert でもよい。既存のテストフレームワークは無い）。**次の3つを必ず含める。**

1. **完走**: 固定 seed で `newGame` → 各手番で `candidates(state)` を取り、**候補の中からしか選ばずに** `act` を繰り返し、`node === "done"` に到達する。上限200手番。到達したこと、および `revealed` に `s1a` `s2a` `s2a_gap` `s3a` `s3b` が入っていることを確認する
   - 候補の選び方は決め打ちでよい（先頭から順、など）。ただし**自由入力を作らない**こと。UIに出ない文字列を送って通す検査は無意味
2. **弱点で撃退しても詰まない**: シーン2で錆喰いに対して弱点（ランタン）を使い、その後 `s2a_gap` が開示され、出口 `to_scean03` が `requiresMet` を満たすことを確認する
3. **解決しない入力は状態を変えない**: `act(state, "壁を殴る")` が `{type:"unknown"}` を返し、`turn` / `revealed` / `hp` / `sceneIndex` が変わらないことを確認する

`package.json` に `"test": "node test/playthrough.test.mjs"` を用意する（`package.json` が無ければ `{"type":"module"}` 付きで新規作成する）。

## やらないこと

LLM、GM の会話、NPC の雑談、同行者、画像、セーブ／ロード、自由入力欄、Lorebook、エディタ。UI（HTML/CSS）は別担当が作るので触らない。`index.html` を作らない。

## 完了の報告に含めること

- `npm test` の実際の出力（3件すべての結果）
- 完走テストが辿った手順（選んだ候補ラベルの並び）
- 仕様どおりに書けなかった箇所と、その理由
