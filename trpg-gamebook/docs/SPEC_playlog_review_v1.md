# 遊んだ記録を読み込んで直す（v1）

## 目的

作者が遊んで書き出した記録（`playlog.md`）に「」で書き込んだ注文を、エディタが読み込み、AIが章データの書き換え案を出す。作者は案ごとに採用か破棄を選ぶ。

7周ぶんのプレイで出た注文13件を数えた結果、10件は章データの文字列を書き換えるだけで済んだ。3件はエンジン側の不具合で、データでは直せない。v1はこの10件を対象にする。

## 手数

```
1. 遊ぶ                        既存（index.html）
2. 「記録を書き出す」            既存（index.html）
3. 記録に「」で書き込む          既存・作者の手作業
4. 「遊んだ記録を読み込む」       ★新規・1手（editor.html）
5. 提案カードを「採用」          既存の仕組みを流用
```

新しい手は4だけ。`CLAUDE.md` の3手ルールを満たす。

## やらないこと

- 新しい要素（秘密・出口・遭遇・決断）を**足す**提案。v1は**既存の文字列の書き換えだけ**。足す作業は既存の「シナリオ補完」タブが担当する
- `entity` / `aliases` / `match` / `triggerTerms` の書き換え。これらは照合キーで、変えると他の参照が黙って壊れる
- PDFの読み込み
- 記録の自動送信。読み込みは作者が押したときだけ

## 記録の形

`src/ui.js` が書き出す。1行目に章題と版が入る。

```
# 廃坑の灯 のプレイ記録（ch2 codex 2026-08-13）

気づいたことは、その場所へそのまま書き込んでください。

---

夕暮れの村。マイラ・ヴェインは机に「坑道」の古い「見取り図」を広げ、…

マイラの表情を見る — d20 2 / 難度 2 · 成功
```

作者の注文は本文中に「」で直接書き込まれる。形式は決まっていない。**AIに読ませて解釈させる。パーサを書かない。**

## 新規ファイル `src/playlog.js`

DOM非依存。すべて純関数。テストはここに当てる。

### `revisionOf(markdown)`

1行目 `# <なにか>（<版>）` から `<版>` を返す。全角括弧と半角括弧の両方を受ける。取れなければ `""`。

### `FIX_FIELDS`

書き換えてよい場所の一覧。ここに無い組み合わせは拒否する。

| target | 使える field |
|---|---|
| `""`（場面そのもの） | `name` `brief` `blockedText` `greeting` |
| `secret:<id>` | `text` `surface` |
| `exit:<id>` | `text` `blockedText` `npcSay` `arrivalText` |
| `encounter:<id>` | `onsetText` |
| `decision` | `prompt` |

### `locate(chapter, fix)`

`fix` は `{ scene, target, field }`。

- `scene`: `"intro"` / `"ending"` / 場面の `id`（数値または数値文字列）
- 見つからなければ `null`

返り値は `{ node, holder, label }`。`holder` が実際に書き換える対象のオブジェクト（場面そのもの、または秘密・出口・遭遇・決断）。`label` は作者に見せる場所の名前（例: `シーン2 / 坑道（調べられるもの）`）。

### `currentText(chapter, fix)`

書き換え前の文字列。無ければ `""`。

### `applyFix(chapter, fix)`

検証してから書き換える。次のいずれかなら**何もせず `false` を返す**。

- `fix.kind !== "data"`
- `FIX_FIELDS` に無い `target` / `field` の組み合わせ
- `locate` が `null`
- `fix.after` が文字列でない

成功したら書き換えて `true`。

### `parseFixes(raw)`

AIの返事から ```` ```json ```` ブロックを取り出し、`{fixes:[...]}` の配列を返す。`src/ai.js` の `parseReply` と同じ作りにする（失敗しても例外を投げず空配列）。上限20件。

各要素の形:

```json
{
  "kind": "data",
  "scene": 2,
  "target": "secret:sc2_a",
  "field": "text",
  "after": "直した文",
  "why": "作者の「ここ分かりづらい」に対応"
}
```

エンジン側の不具合と判断したものは:

```json
{ "kind": "engine", "why": "満タンでも回復薬が飲めて消える", "where": "シーン3" }
```

## `src/ai.js` への追加

### `reviewPlaylog({ chapter, playlog, onChunk, onStatus, transport })`

既存の `ask()` と同じ経路（`/v1/interactions`、ストリーム、404で `backupModel` へ退避）を使う。`ask()` を書き換えず、**共通部分を小さな内部関数へ切り出して両方から呼ぶ**。切り出しが難しければ複製してよい。既存の `ask()` の挙動を変えないことを優先する。

`input` は章のJSON全体（`JSON.stringify(chapter)`）と記録の全文。実測で1回のやり取りは上限の0.1%未満なので分割しない。

`system_instruction` に必ず入れる指示:

1. 作者の書き込みは「」で囲まれている。それ以外は遊びの記録であって注文ではない
2. データの書き換えで直せるものと、エンジン（プログラム）側の不具合を**必ず分ける**。判定に迷ったら `engine` にする
3. `scene` / `target` / `field` は、渡した章のJSONに実在するものだけを使う。`id` を作らない
4. `entity` `aliases` `match` `triggerTerms` は変更対象にしない
5. 作者が書いた文章を、注文が無いのに書き換えない
6. 提案は最大10件。返事は3文以内。評価語を書かない

返り値は `{ reply, fixes, raw }`。

## `editor.html` への追加

ヘッダに1つだけ足す。

```html
<button id="playlog" type="button">遊んだ記録を読み込む</button>
<input type="file" id="playlog-file" accept=".md,.txt,text/plain,text/markdown" hidden>
```

置き場所は `.jsonを読み込む` の隣。

提案の表示は `<dialog id="playlog-review">`。`#ai-settings` と同じ見た目の規則に従う（`::backdrop`、`var(--soot)` の背景、閉じるボタン）。新しい色を作らない。

## `src/editor.js` への追加

- `#playlog` を押す → `#playlog-file` を開く
- ファイルを読む → 版を突き合わせる → AIへ送る → `<dialog>` を開いて結果を出す
- キーが無ければ `openSettings()` を呼んで終わる

### 版の突き合わせ

`revisionOf(記録)` と `chapter.revision` が違う場合、dialogの冒頭に警告を出す。**止めない**。

> この記録は「ch2 codex 2026-08-13」の版です。いま開いているのは「ch2 rev3」です。直す場所がずれているかもしれません。

同じなら何も出さない。

### 提案カード

`data` のものだけ。1件につき次を出す。

```
シーン2 / 坑道（調べられるもの）の「調べたときに分かること」
今:  「もう何十年も使われていない、捨てられた坑道だわ」
案:  「もう三十年、誰も入っていない。落盤で半分は埋まっているはず」
理由: 作者の「短すぎる」に対応
      [採用] [捨てる]
```

「今」と「案」は必ず両方出す。片方だけでは作者が判断できない。

採用したら:

1. `inspect(chapter)` を採用前に取る
2. `applyFix` する。`false` が返ったら「この案は適用できませんでした」と出してカードを残す
3. `inspect(chapter)` を採用後に取る
4. 既存の `inspectProposal` と同じ考え方で、**増えたエラーだけ**を報告する（採用と無関係の既存エラーを採用のせいにしない）
5. `save()` して `paintInspection()` と `renderEditor()` を呼ぶ
6. カードを「採用しました」に変え、`[採用を取り消す]` を出す。取り消したら書き換え前の文字列へ戻す

### エンジン側の報告

`engine` のものは dialog の末尾にまとめる。採用ボタンは付けない。

> ここから先はプログラム側の問題です。データでは直せません。
> ・満タンでも回復薬が飲めて消える（シーン3）

## テスト

`test/playlog.test.mjs` を新規に作り、`package.json` の `test` へ連結する。DOMは使わない。

1. `revisionOf` が全角括弧・半角括弧の両方から版を取る。1行目が `#` で始まらなければ `""`
2. `parseFixes` が ```` ```json ```` ブロックから配列を取り、壊れたJSONでも例外を投げず `[]` を返す
3. `applyFix` が `secret:<id>` の `text` を書き換える
4. `applyFix` が `entity` の書き換えを**拒否**する（`false` が返り、章が変わっていない）
5. `applyFix` が実在しない `scene` / `target` / `id` を**拒否**する
6. `applyFix` が `kind:"engine"` を**拒否**する
7. `applyFix` の前後で `inspect(chapter)` の error が増えない（`data/chapter_01.json` を `structuredClone` して使う）

**`data/chapter_01.json` を変更しない。** テストは必ず複製に対して行う。

## 触ってはいけないもの

- `src/progression.js` — mock2からの無改変移植
- `src/inventory.js` — 同上
- `data/chapter_01.json`
- `src/gamebook.js` — v1では触らない

## 検証

```
npm test          # 既存18件 + 新規7件がすべて緑
npm run serve     # http://localhost:8123/editor.html
```

実ブラウザで、次を**実際に押して**確かめる。セレクタで直接叩くのは検証ではない。

1. `drafts/lanternhill_ch2.json` を `.jsonを読み込む` で開く
2. `遊んだ記録を読み込む` を押し、`~/Downloads/playlog (7).md` を選ぶ
3. 版がずれている警告が出ること
4. 提案カードに「今」と「案」の両方が出ていること
5. 1件採用し、右の検査でエラーが増えないこと
6. 採用を取り消すと元の文字列へ戻ること
