# 実装の依頼: ランタンの合意処理を、エンジンの汎用の「合意」に置き換える

この文書が正本です。書かれていないことは推測で決めず、報告の「分からなかったこと」に書いてください。

## 作業する場所
- リポジトリ: `/Users/yasuda_k/Desktop/Terminus/trpg-gm-mock3/.claude/worktrees/borg-inbox-mock3-engine-scenario-352cc0`
- 対象: `trpg-gm-mock3/prototype/game.js` と `trpg-gm-mock3/prototype/scenario.js` の2つだけ
- ブランチ: `mock3-consent`。**コミット・push はしないでください。** 変更は作業ツリーに残したまま報告してください

## 最初に読むファイル(読んだら報告の冒頭に一覧で書く)
- `/Users/yasuda_k/Desktop/Terminus/AGENTS.md`
- この文書
- `trpg-gm-mock3/prototype/game.js` の601〜674行(現在の合意処理)と、下の「呼び出し箇所」に挙げた行
- `trpg-gm-mock3/prototype/scenario.js` の150〜156、194〜215、310〜320、376〜390、526〜534、600〜603行
- `trpg-gm-mock3/prototype/lantern-check.cjs`(新しい名前で書き換え済み。これが通ることが受け入れ条件)

## 背景
mock3 は「共通の手順(game.js)」と「シナリオ1本分(scenario.js)」に分けてあります。読み込み順は `game.js → scenario.js` です。
いまの game.js には、ランタンの点灯・消灯について「仲間の依頼・反対・疑問・撤回を集め、反対が無く、持ち主以外の依頼があるときだけ、持ち主本人に判断させて実行する」処理があります。この仕組みはどの章でも使えますが、ランタン・灯り・リディア・`lit` などの章に固有な語が混ざっています。
作者の決定(2026-10-07): **汎用の合意の仕組みをエンジンに作り、章は「何についての合意か」を渡す。**

**プレイヤーから見た動きは1つも変えません。** 例外は下の「意図して変える動き」の1点だけです。表示する文、LLMへ渡すプロンプトと入力JSONのキー名・値、行動履歴も、ランタンについては今と1文字も違わないようにしてください。

## 作るもの

### 1. scenario.js に議題の定義 `CONSENT_TOPICS` を置く

```js
const CONSENT_TOPICS={lantern:{
 actions:['light','douse'],                 // 互いに排他な操作。合意の対象
 actor:s=>s.items.lantern.holder,           // 判断して実行する本人
 scope:s=>s.room+':'+s.lit,                 // これが変わったら相談を破棄する
 item:'lantern',                            // この品が受け渡されたら相談を破棄する
 mentions:/ランタン|灯り|明かり|あかり|明る|暗|点灯|消灯/, // 相談がまだ無い時、これに当たる発言が無ければ何もしない(今のsettleLanternの判定をそのまま)
 label:'灯り',                              // エラー文に入る語
 signalsPrompt:LANTERN_SIGNALS_PROMPT,
 decisionPrompt:lanternDecisionPrompt,
 conflict:'点灯と消灯の案が食い違っています。どちらを試すか相談しましょう。',
 already:s=>s.lit?'ランタンはすでに灯っているよ。':'ランタンはすでに消えているよ。',
 direct:(text,to)=>{const action=lanternRequest(text,to);return action?{actor:lanternActor(text,to),action}:null;},
 unavailable:(actor,action,s)=>/* 今の game.js:896 の文の組み立てをそのまま移す */,
}};
```

- `LANTERN_SIGNALS_PROMPT`・`lanternDecisionPrompt`・`lanternRequest`・`lanternActor` は**中身を変えずに**そのまま使う。定義の場所も変えない
- `CONSENT_TOPICS` は、`LANTERN_SIGNALS_PROMPT` と `lanternDecisionPrompt` の定義より後に置く(const の参照順)

### 2. game.js の公開関数(名前と引数はこのとおり。検査がこの名前で呼ぶ)

`topic` は `CONSENT_TOPICS` のキー(文字列)です。

| 関数 | 置き換える現在の関数 | 振る舞い |
|---|---|---|
| `let consents={}` | `let lanternDiscussion=null` | 議題ごとの相談。`consents[topic]` は `{scope, voices}`。相談が無ければキーごと無い |
| `currentConsent(topic)` | `currentLanternDiscussion()` | 相談の `scope` が `CONSENT_TOPICS[topic].scope(state)` と違うか、`state.phase!=='explore'` なら `delete consents[topic]`。結果を返す。無ければ `null` |
| `consentBlocked(topic)` | `lanternBlocked()` | 同じ判定 |
| `consentStatus(topic)` | `lanternStatus()` | 同じ文。食い違いの文は `conflict` から取る |
| `validateConsentSignals(topic,r,lines)` | `validateLanternSignals(r,lines)` | 同じ検査。許す行動は `actions`。エラー文の「灯り」は `label` から作る(ランタンでは今と同じ文になること) |
| `mergeConsentSignals(topic,previous,signals,s=state)` | `mergeLanternSignals(previous,signals,s)` | 返り値は `{scope:CONSENT_TOPICS[topic].scope(s),voices}` |
| `consentCandidate(topic,d,s=state)` | `lanternCandidate(d,s)` | `d.room/d.lit` の比較を `d.scope!==scope(s)` に、`s.items.lantern.holder` を `actor(s)` に |
| `settleConsent(topic,start)` | `settleLantern(start)` | 同じ手順。`actor` は `actor(state)`、待った後の確認は `scope` の比較、`ask` の第1引数は `signalsPrompt` / `decisionPrompt(name)`、入力JSONのキー(`public,actor,addressedTo,voices,lines` と `selfProfile,public,proposal,voices,conversation`)は今と同じ。「リディアの判断を…」の文は `personName(actor)` と `label` から作る。「すでに灯っている」の文は `already(state)`。完了・破棄は `delete consents[topic]` |
| `proposeConsent(topic,id,action,quote)` | (新規) | `consents[topic]=mergeConsentSignals(topic,currentConsent(topic),[{id,action,stance:'request',quote}])` |
| `consentTopicOf(action)` | (新規) | `actions` に `action` を含む議題のキー。無ければ `null` |
| `consentVoiced(stances)` | (新規) | どれかの議題の今の相談に、`stances` のどれかの意見があれば `true` |
| `anyConsentBlocked()` | (新規) | どれかの議題が `consentBlocked` なら `true` |

古い名前(`lanternDiscussion` ほか上の表の左から2列目)は**残さない**。別名・互換用の関数も作らない。

### 3. 呼び出し箇所の置き換え(行番号は今の版)

| 場所 | 今 | 置き換え後 |
|---|---|---|
| game.js:50 `transferItem` | `if(t.item==='lantern')lanternDiscussion=null` | 品が `item` に一致する議題の相談を消す |
| game.js:198 `apply` | `['light','douse'].includes(a)` なら破棄 | `consentTopicOf(a)` があればその相談を消す |
| game.js:267 状態の行 | `lanternStatus()` | 各議題の `consentStatus` を順に足す(空文字は足さない) |
| game.js:539 `companions` | `await settleLantern(start)` | `CONSENT_TOPICS` の各議題について順に `await settleConsent(topic,start)`。各回の後に `epoch!==generation` なら止める |
| game.js:577-578 `explorationIntent` | `lanternBlocked()` / `voices` に `request` があるか | `anyConsentBlocked()` / `consentVoiced(['request'])` |
| game.js:675 `request` | `id==='lydia'&&['light','douse'].includes(a)&&lanternBlocked()` | `consentTopicOf(a)` があり、`actor(state)===id` で、`consentBlocked` のとき(下の「意図して変える動き」) |
| game.js:676 `human` | `['light','douse'].includes(a)&&lanternBlocked()` → `lanternStatus()` | `consentTopicOf(a)` の議題で同じ判定と文 |
| game.js:894-897 直接の依頼 | `lanternRequest`/`lanternActor` と直書きの文 | 各議題の `direct(text,to)` が `{actor,action}` を返し、その議題が `consentBlocked` でなければ今と同じ処理。実行できない時の文は `unavailable(actor,action,state)`。`announceVisiblePoints()` も今どおり呼ぶ |
| scenario.js:153 `navigationIntent` | `currentLanternDiscussion()?.voices` に `request` | `consentVoiced(['request'])` |
| scenario.js:211 `introduceInventory` | `lanternDiscussion=mergeLanternSignals(null,[...])` | `consents.lantern=mergeConsentSignals('lantern',null,[...])`(前の相談を捨てて作り直す点を今と同じにする) |
| scenario.js:239 `dialogueInput` | `lanternDiscussion:currentLanternDiscussion()` | `lanternDiscussion:currentConsent('lantern')`。**キー名 `lanternDiscussion` は変えない**(LLMへの入力のため) |
| scenario.js:314-316 `cooperationFollowup` | `state.items.lantern.holder` と `mergeLanternSignals(currentLanternDiscussion(),…)` | 持ち主の取得はそのまま、記録は `proposeConsent('lantern',actor,'douse',speech)` |
| scenario.js:531 `humanMessageIntent` | `currentLanternDiscussion()?.voices` の判定 | `consentVoiced(['request','oppose','question'])` |

### 意図して変える動き(1点だけ)
`request()` は今、`id==='lydia'` のときだけ合意の保留を確かめます。ランタンをリディア以外へ渡した後は、保留中でも合意を通さずに実行されます。置き換え後は「その議題の今の持ち主」で判定してください。リディアが持っている間の動きは変わりません。

## 触ってはいけないもの
- `*.cjs` すべて(検査は Claude が書き換え済み。落ちたら実装側を直す。検査を直したくなったら直さずに報告へ書く)
- `stage.js`、`index.html`、`trpg-gm-mock3/prompts/`、`SCENARIO_LANTERN_ACTOR`(舞台の照明用。合意とは別)
- `LANTERN_SIGNALS_PROMPT`・`lanternDecisionPrompt`・`EXPLORATION_INTENT_PROMPT` の文面
- `lanternRequest`・`lanternActor` の本文
- 合意に関係しない関数。とくに `apply` の行動記録、`transferItem` の受け渡し記録、`companions` の他の処理、`render`
- game.js / scenario.js 以外のファイル(この文書を含む)

## 終わったら確かめること(`trpg-gm-mock3/prototype` で実行。npm は使わず node を直接)
1. `git -C /Users/yasuda_k/Desktop/Terminus/trpg-gm-mock3/.claude/worktrees/borg-inbox-mock3-engine-scenario-352cc0 diff --stat` を貼る(game.js・scenario.js と、Claude が書き換えた `*.cjs` 6本以外が出ていないこと)
2. `node --check game.js; node --check scenario.js` の終了コード
3. `grep -nE "lantern|ランタン|灯り|'light'|'douse'|'lydia'" game.js` の出力(**何も出ないこと**が目標。出たら行ごとに理由を書く)
4. 次の検査をそれぞれ実行し、終了コードと出力の末尾10行を貼る:
   `lantern-check.cjs`、`opening-check.cjs`、`exploration-check.cjs`、`navigation-check.cjs`、`inventory-check.cjs`、`scenario-parity.cjs`、`check.cjs`、`ui-check.cjs`、`profile-check.cjs`、`roleplay-check.cjs`、`lighting-check.cjs`
   - `scenario-parity.cjs` は分離前(c36fc01)と状態・結果文・会話入力・プロンプトの一致を比べます。**ここが落ちたら動きが変わっている**ので、原因を直してください
   - ブラウザやネットワークを使う検査(`cloud-gemma-check.cjs`、`lighting-visual-check.cjs`、`standee-check.cjs`、`preview.cjs`)は**実行しない**

## 報告の形
- 読んだファイル
- 変えたファイルと、変えた理由を1行ずつ
- 上の確認の生の出力(合否の要約はしない)
- 分からなかったこと・依頼文と食い違っていたこと
- サンドボックスの外で実行し直した場合はその旨
