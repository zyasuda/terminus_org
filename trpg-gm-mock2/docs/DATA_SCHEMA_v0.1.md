# TAS↔mock2 データ契約 v0.1

mock2が実際に読んでいる `public/data/*.json` の現行フィールドを、TAS出力の基準スキーマとして記録する。
**正本はmock2側の実データ**(`public/data/campaign.json` / `chapter_01.json` / `assets.json`)であり、
本書はその書き起こしである。実データと食い違ったら実データが正しい。

- 対象バージョン: v0.1(2026-07-16時点の現行フィールド)
- 検証ツール: `npm run check:assets`(`scripts/check-assets.mjs`)が素材参照の整合を機械チェックする
- 経緯: BORG `Inbox/TAS連携とmock2実装手順_Claude共有用_2026-07-14` の優先順位2

表記: **必須** = mock2が無いと壊れる/意味をなさない。**任意** = 無ければ機能ごと無効になるだけ。

## campaign.json

| フィールド | 型 | 説明 |
|---|---|---|
| `meta.id` / `meta.title` / `meta.version` | string | キャンペーン識別情報 |
| `style` | object | LLMの語り口指定。`narration` `readingLevel` `goodExample` `badExample` `extra[]` `forbiddenWords[]` `world` |
| `flags` | object | 章をまたぐフラグの宣言。キー=フラグ名、値=取りうる値の配列(例 `"guardian_fate": ["対話","撃破","回避"]`)。章の`flagsOut`はここで宣言済みであること |
| `cast[]` | object[] | NPC。`id` `name` `nameEn` `public`(公開プロフィール) `direction`(GM演出指示) |
| `companions[]` | object[] | 同行者。`id` `name` `persona` `retortDrive` `quirks[]{tag,mutter}` `banter[]{to,retortEvery,tsukkomi[],ignore[]}` `sprite`(立ち絵PNG。無ければ枠ごと非表示。配列順に 右手前→左手前→右奥→左奥 の最大4枠に配置) |
| `companionsHint` | string | 同行者の使い分け指示 |
| `gmSprite` | string | GMペット(ダイス先輩)の画像。省略時は `gm_mascot.png` |
| `player` | object | プレイヤーのパラメータ。`agility`(戦闘の行動順、既定6) |
| `entities[]` | object[] | 正名台帳。`ja`(正名・必須) `en` `kind` `surface` `visual`。敵名・lootはこの台帳の`ja`と照合される |

`companions[]` には戦闘用に `agility`(行動順、既定5)と `battleEnd`(戦闘終了時の一言。`{win[], fled[], repelled[]}` からランダム)も持てる。

## chapter_XX.json

### 章トップレベル

| フィールド | 型 | 説明 |
|---|---|---|
| `id` | number | 章番号 |
| `title` | string | 章タイトル |
| `quest` | string | 依頼内容(依頼人名を含める) |
| `intro` | string | 章開始時のナレーション |
| `flagsOut[]` | string[] | この章が確定させるフラグ名。campaign.jsonの`flags`で宣言済みであること |
| `reference` | object | 制作向けトーン指定。`genre` `themes[]` `mood` `palette[]`(mock2実行時は未使用、TAS/生成向け) |
| `scenes[]` | object[] | 下記 |

### scenes[] (シーン)

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `id` | number | 必須 | シーン番号(遷移は配列順) |
| `name` | string | 必須 | シーン名(左パネル表示) |
| `brief` | string | 必須 | シーン開始時にプレイヤーへ見せる説明 |
| `img` | string | 必須 | 背景画像ファイル名(`images/`直下、パスなし) |
| `goal` | string | 必須 | GM向けのシーン完了条件の文章 |
| `direction` | string | 必須 | GM向け演出指示 |
| `completeRequires` | object | 任意 | シーン遷移の機械条件。`{"secretsAny": [...]}`(指定secretのどれかが開示済み)、`{"talkTurnsMin": n}`(このシーンで会話をnターン以上。報告シーン用)。併記時は全条件が必要。無い場合は無条件で遷移可 |
| `blockedText` | string | 任意 | `completeRequires`不成立時に先へ進もうとした場合の定型ナレーション |
| `parallax` | object | 任意 | `{sky, fg}` 2層パララックス背景(屋外シーン用)。`sky`=横スクロールする空(横リピート可能な画像。複数シーンで共用してよい)、`fg`=**空の部分を透過にした**シーン前景PNG。両方必須。指定時は`img`の上に重なる(`img`は素材404時のフォールバックとして残す) |
| `npcSprite` | string | 任意 | シーンに常駐表示するNPC立ち絵(透過PNG) |
| `enemy` | object/null | 任意 | 下記 |
| `secrets[]` | object[] | 必須(空可) | 下記 |
| `loot[]` | (string \| object)[] | 必須(空可) | このシーンで入手するアイテム。文字列、または `{name, requires: "<secretId>"}`。`requires`付きはそのsecret開示まで存在扱いしない(プロンプトにも正名を出さない)。名前はcampaign.jsonの`entities`正名と(先頭一致で)照合される |
| `noBanter` | bool | 任意 | 同行者の掛け合いを止める(報告シーン等) |
| `report` | bool | 任意 | 依頼人への報告シーン |

### scenes[].enemy (敵)

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `name` | string | 必須 | 正名(entities台帳と照合) |
| `unknownName` | string | 任意 | 未識別時の表示名(例「不気味な影」)。Wizardry式敵ID(D-029) |
| `hp` / `maxHp` | number | 必須 | 敵HP |
| `surface` | string | 任意 | 未識別段階でも語ってよい見た目情報 |
| `trait` | string | 必須 | GM向けの敵の性質(弱点等を含む) |
| `img` | string | 任意 | 図鑑・開示用画像 |
| `sprite` | string | 任意 | 戦闘中の立ちスプライト(透過PNG)。未識別時は黒シルエット表示 |
| `ambush` | bool | 任意 | 奇襲の有無 |
| `ambushDc` | number | ambush時 | 奇襲回避の難易度 |
| `ambushTrigger` | string | ambush時 | 奇襲が発生する条件の文章(GM判断用) |
| `presence` | bool | 任意 | シーン開始時から存在を明示する(隠れていない) |
| `agility` | number | 任意 | 戦闘の行動順(既定5)。高い順に行動(docs/COMBAT_SPEC.md) |
| `atk` | number | 任意 | 命中時のダメージ(既定1) |
| `defenseDc` | number | 任意 | この敵への攻撃判定DC(既定12) |
| `fleeDc` | number | 任意 | この敵からの逃走判定DC(既定10) |
| `weakness` | object | 任意 | `{triggers[], effect:"flee"|"stun", text}` 弱点行動。triggersに一致する宣言で判定なしで発動 |
| `identifySecret` | string | 任意 | この敵の正体に対応するsecret id。presence敵のスプライト実体化(シルエット解除)の判定に使う(このsecretが開示済みなら実体表示)。secret自体の開示は通常の調査判定で行う |
| `revealOnDefeat` | string | 任意 | 撃破時に自動開示するsecret id |

### scenes[].secrets[] (発見項目)

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `id` | string | 必須 | 章内で一意(例 `s2a`) |
| `entity` | string | 必須 | 調査対象の名前(人間可読。入力補助チップにも使う) |
| `surface` | string | 必須 | 未開示でも見えている表層描写 |
| `text` | string | 必須 | 開示時にGMが得る確定事実 |
| `playerText` | string | 任意 | プレイヤーに直接見せる開示文(textがGM向け表現の場合に使用。D-028) |
| `aliases[]` | string[] | 任意 | プレイヤー入力との照合語(例「柵」「木柵」)。表記ゆれ対策 |
| `img` | string | 任意 | 開示時に見せる画像 |
| `bg` | string | 任意 | 開示時に差し替える背景 |

## assets.json (素材台帳)

トップレベル: `version`(number)、`updated`(YYYY-MM-DD)、`assets`(object)。

`assets`はキー=素材ID、値=以下:

| フィールド | 型 | 説明 |
|---|---|---|
| `file` | string | `images/`直下のファイル名 |
| `kind` | string | `background` / `sprite` / `portrait` 等 |
| `status` | string | `pending` → `candidate` → `approved` → `implemented`(ASSET_PIPELINE.md参照) |
| `size` | string | `1376x768` 形式 |
| `usedBy[]` | string[] | 使用箇所。`chapter_01.scenes.<sceneId>.img` / `...secrets.<secretId>.bg` の形式。コード直参照は `ui.` プレフィックスで手動登録(検証対象外) |
| `notes` | string | 備考 |

`check-assets.mjs`が検出するもの:
- 参照されているのに台帳未登録 → ERROR
- approvedなのに`images/`未配置 → ERROR
- `usedBy`と実参照の食い違い → WARN
- approvedなのにどこからも未使用 → WARN

## 既知の拡張予定(v0.1には含めない)

- `completeRequires`のAND/OR式と「行動時遷移/条件成立時自動遷移」の区別
  (BORG `Inbox/TAS_条件と遷移モデル再整理_セッション引き継ぎ_2026-07-15` — 仕様合意が先)
- TAS編集UIの保存形式(独自ドラフトJSON)から本スキーマへのエクスポート
