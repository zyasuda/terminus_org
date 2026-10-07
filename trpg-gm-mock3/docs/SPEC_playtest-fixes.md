# 実装の依頼: 試遊で止まった2件(操作輪を支える・ランタンを消す)を直す

この文書が正本です。書かれていないことは推測で決めず、報告の「分からなかったこと」に書いてください。

## 作業する場所
- リポジトリ: `/Users/yasuda_k/Desktop/Terminus/trpg-gm-mock3/.claude/worktrees/borg-inbox-mock3-engine-scenario-352cc0`
- 変えてよいのは `trpg-gm-mock3/prototype/game.js` だけ
- ブランチ: `mock3-consent`。**コミット・push はしないでください。**

## 最初に読むファイル(読んだら報告の冒頭に一覧で書く)
- `/Users/yasuda_k/Desktop/Terminus/AGENTS.md`
- この文書
- `trpg-gm-mock3/prototype/README.md` の「試遊で止まった場面の再現(2026-10-07)」の節
- `trpg-gm-mock3/prototype/game.js` の `validateExplorationIntent`(562行付近)と `settleConsent`(639行付近)
- `trpg-gm-mock3/prototype/playtest-check.cjs` と `playtest-cases.json`(試遊の記録から抜き出した実際のLLM応答で、同じ場面を再生する検査)
- `trpg-gm-mock3/prototype/exploration-check.cjs` と `lantern-check.cjs` の末尾(2026-10-07 の注記がある検査。今は先頭の1件で落ちます)

## 直すこと(作者の承認済みの方針。これ以外は直さない)

### 1. 合意の相談に、本人が今できない操作の依頼を残さない(`settleConsent`)
起きていること: ランタンが点いている時、持ち主のリディアが「ランタンの光を当てて見てみましょう」と言うと、GMの整理で「点灯の依頼」として相談に残ります。後で消灯の提案が出ると点灯と消灯が「食い違い」と判定されて保留になり、「リディア、ランタンを消してみて」が実行されません。

直し方: `settleConsent` で `validateConsentSignals` の結果を相談へ入れる前に、**話者が議題の本人(`CONSENT_TOPICS[topic].actor(state)`)で、stance が `request` で、その操作が今の本人に実行できない(`!actionsFor(actor).includes(action)`)** 意見を取り除く。

- 本人以外の仲間の依頼は今どおり残す(今できない操作を仲間が頼んだら「ランタンはすでに灯っているよ。」と答えて相談を消す、今の動きを保つ)
- 反対・疑問・撤回は今どおり

### 2. 了承(approval)と判定された依頼の相手を、宛先・名指しで決める(`validateExplorationIntent`)
起きていること(どちらも、GMが「直前の申し出への了承」と判定したことが原因):
- (b) 全員宛ての「ブロム、操作輪を支えて」:3人に申し出があると、名指しされたブロムを選べず「どの仲間の、どの調査を頼みますか？」と聞き返す
- (c) ブロム宛ての「操作輪を支えて」:ブロムの申し出が無いと「了承と直前の提案が一致しません」で却下される

直し方:
- (b) `r.kind==='approval'` で申し出の候補 `eligible` を絞るとき、`to==='all'` で、発言が名指しする仲間(`mentionsActor(p,text)` が真の `aiPeople()`)が**ちょうど1人**なら、その人の申し出だけを候補にする。2人以上・0人なら今どおり
- (c) `r.kind==='approval'` で、ジョブが**1件だけ**、その相手が**宛先そのもの**(`to===j.id`)か、全員宛てで**ちょうど1人だけ名指しされた仲間**で、その相手の申し出(`currentOffers()[j.id]`)が**無い**とき、`r.kind='request'` に読み替えてから今どおり検査する。申し出があるときは読み替えない(今の了承の経路で実行される)
- 引用(`quote`)が発言に含まれることの検査は**緩めない**。宛先も名指しも無い了承は今どおり実行しない

## 触ってはいけないもの
- `*.cjs`・`*.json`・`scenario.js`・`stage.js`・`index.html`・`prompts/`・`docs/`
- プロンプトの文面(`EXPLORATION_INTENT_PROMPT` ほか)
- `checkedReply` の `conversation-action-as-proposal`(依頼でない返答の行動を提案に置き換える処理)
- 引用の照合(`text.includes(j.quote)`)

## 終わったら確かめること(`trpg-gm-mock3/prototype` で。npm は使わず node を直接)
1. `git diff --stat`(game.js だけが出ること。Claude が先に書き換えた `exploration-check.cjs`・`lantern-check.cjs`・`playtest-check.cjs`・`playtest-cases.json` は未コミットの差分として出てよい)
2. `node --check game.js`
3. 次をそれぞれ実行し、終了コードと出力の末尾8行を貼る:
   `playtest-check.cjs`(目標: PASS 4件・PENDING 1件・終了コード0)、`exploration-check.cjs`(目標 189件)、`lantern-check.cjs`(目標 44件)、`opening-check.cjs`、`navigation-check.cjs`、`inventory-check.cjs`、`scenario-parity.cjs`、`check.cjs`、`ui-check.cjs`、`profile-check.cjs`、`roleplay-check.cjs`、`lighting-check.cjs`
   - `scenario-parity.cjs` が落ちたら、分離前と動きが変わっています。原因を書いてください(直せない場合は直さず報告)
   - ブラウザ・ネットワークを使う検査(`cloud-gemma-check.cjs`・`lighting-visual-check.cjs`・`standee-check.cjs`・`preview.cjs`)は実行しない

## 報告の形
- 読んだファイル
- 変えた関数と、変えた理由を1行ずつ
- 上の確認の生の出力(合否の要約はしない)
- 分からなかったこと・依頼文と食い違っていたこと
- サンドボックスの外で実行し直した場合はその旨
