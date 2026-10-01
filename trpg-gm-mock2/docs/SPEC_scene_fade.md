# 場面の切り替えの暗転(フェードイン/アウト) — 実装仕様

2026-08-21。この仕様書が正本。作者の指摘2件を直し、同時に暗転の設計を1つに揃える。

## 直す不具合(作者が実機で確認、こちらでコードから原因を特定済み)

### 不具合1: 「最初から」で、暗転する前に次の場面が見えてしまう

`resetGame()` は冒頭で `setSceneBackdrop(currentBackdropNode())` を呼び、**イントロの背景(マイラの部屋)を描いてから**、後段の `setStore` で幕を降ろしている。幕は `#curtain.quick` の `transition: opacity .6s` に従って透明→不透明へ0.6秒かけて変化するため、**プレイヤーには「マイラの部屋が表示され、それが0.6秒かけて暗くなり、また明るくなる」ように見える。** 暗転で隠すべき対象と、暗転で見せる対象が同じになっている。

正しい挙動は「今の画面(タイトルの問いかけ)を見せない。即座に黒へ落とし、黒から次の場面を明転させる」。

### 不具合2: 暗転の色が真っ黒でなく灰色

`#curtain` の `background: var(--frame-bg)`。`--frame-bg` は `styles.css:10` で `#24283a`(画面の枠の色)。場面の暗転は真っ黒でなければならない。

## 変更するファイル(この4つだけ)

| ファイル | 変更 |
|---|---|
| `src/engine/store.js` | `curtainQuick`(boolean)を `curtainFade`(文字列)へ置き換える |
| `src/App.jsx` | `#curtain` の className の組み立て |
| `src/styles.css` | 幕のルール |
| `src/engine/index.js` | 定数2つ、`fadeThroughBlack`、`advanceScene`、`resetGame` |

**これ以外のファイルには触らないこと。** 特に次は変更禁止:

- `src/engine/*.test.mjs`(検査はこちらで直す)
- `src/engine/progression.js`, `src/engine/scene-ui.js`, `src/engine/voice.js`, `src/state.js`
- `src/engine/panelTiming.test.mjs` が `#curtain.quick` と `SCENE_FADE_MS = 600` を文字列で検査している。**この2つの名前と値は変えないこと**
- `public/data/` 配下、`../scenario/` 配下、`server.cjs`
- `git commit` / `git push` は行わない(作業ディレクトリに他セッションの未コミット差分が23ファイルある)

## 1. store.js

`curtainQuick: false,` の行(47行目付近)を次へ置き換える。

```js
  /* 幕の速さと入り方。"" = 開幕の依頼ポップアップ用(1.2sで明転、色は枠の色)
     "quick"   = 場面の切り替え・アウトロ。0.6sで暗転→0.6sで明転、真っ黒
     "instant" = 「最初から」。暗転は遷移なし(今の画面を見せない)、明転だけ0.6s */
  curtainFade: "",
```

`curtainQuick` という名前はどこにも残さない。

## 2. App.jsx

現在(535行目付近):

```jsx
        <div id="curtain" className={(eng.curtain ? "" : "lifted") + (eng.curtainQuick ? " quick" : "")}></div>
```

置き換え後:

```jsx
        <div id="curtain" className={[eng.curtain ? "" : "lifted", eng.curtainFade].filter(Boolean).join(" ")}></div>
```

上のコメント(`{/* 幕: ... */}`)はそのまま残す。

## 3. styles.css

現在(956〜963行目付近):

```css
#curtain.lifted { opacity: 0; visibility: hidden; transition: opacity 1.2s ease, visibility 0s 1.2s; }
/* 場面の切り替え・アウトロの暗転。開幕の幕は1.2sのままにしたいので、継続時間だけを
   差し替えるクラスを足す。engine側の SCENE_FADE_MS と同じ値にすること
   (ずれると、暗転しきる前に背景が入れ替わって切り替えが見えてしまう)。visibilityの
   transitionは幕が上がる .lifted 側だけに置く。非lifted側にも置くと0.6s遅延で
   visibility:hiddenが残るバグになった (2026-08-21測定: transition-delayは"0s, 0.6s") */
#curtain.quick { transition: opacity .6s ease; }
#curtain.quick.lifted { transition: opacity .6s ease, visibility 0s .6s; }
```

`#curtain.lifted` の行は**変更しない**。その下のコメントとルール2行を、次のコメントとルール5行へ置き換える。

```css
/* 場面の切り替え・アウトロ・開幕の暗転。開幕の依頼ポップアップ用の幕(クラス無し)は
   1.2s・枠の色のままにしたいので、クラスで差し替える。

   色: 場面の暗転は真っ黒でなければならない。クラス無しの var(--frame-bg) は #24283a
   (枠の色)で、作者から「フェード中が灰色」という指摘になった(2026-08-21)。

   継続時間: engine側の SCENE_FADE_MS と同じ値にする。ずれると、暗転しきる前に背景が
   入れ替わって切り替えが素見えする。

   visibility: transitionは幕が上がる .lifted 側だけに置く。非lifted側にも置くと
   delay 0.6s のあいだ visibility:hidden が残り、暗転が一切描画されない
   (2026-08-21測定: transition-delay が "0s, 0.6s" になっていた)。

   instant: 「最初から」用。降りる側は遷移なしで即座に黒へ落とす。遷移させると、
   resetGameが既に差し替えた次の場面(マイラの部屋)が0.6秒かけて暗くなる様子が
   見えてしまう——暗転で隠すべき画面と、暗転の先に見せる画面が同じになる。
   上がる側(.lifted)は quick と同じ0.6sで明転させる。 */
#curtain.quick, #curtain.instant { background: #000; }
#curtain.quick { transition: opacity .6s ease; }
#curtain.quick.lifted { transition: opacity .6s ease, visibility 0s .6s; }
#curtain.instant { transition: none; }
#curtain.instant.lifted { transition: opacity .6s ease, visibility 0s .6s; }
```

順序は上記のとおり。`#curtain.instant` を `#curtain.instant.lifted` より前に置く(詳細度で後者が勝つが、読む順として揃える)。

## 4. index.js

### 4-1. 定数と `fadeThroughBlack`(206行目付近)

現在:

```js
const SCENE_FADE_MS = 600;
function fadeThroughBlack(swap) {
  setStore({ curtain: true, curtainQuick: true });
  setTimeout(() => {
    swap();
    setStore({ curtain: false }); // ここから明転(0.6s)。curtainQuickはresetGameまで立てたまま
  }, SCENE_FADE_MS);
}
```

置き換え後:

```js
const SCENE_FADE_MS = 600;  // 暗転・明転それぞれの長さ。styles.cssの .6s と必ず一致させる
/* 真っ黒で止める時間。背景の差し替えをこの中で行う。0にすると、暗転しきった
   まさにそのフレームで明転が始まるため、フレームの巡り合わせで差し替えが素見えする */
const SCENE_HOLD_MS = 200;
const SCENE_FADE_TOTAL_MS = SCENE_FADE_MS * 2 + SCENE_HOLD_MS; // 暗転→止め→明転の合計

function fadeThroughBlack(swap) {
  setStore({ curtain: true, curtainFade: "quick" });
  setTimeout(() => {
    swap(); // 真っ黒の中で差し替える
    setTimeout(() => setStore({ curtain: false }), SCENE_HOLD_MS); // ここから明転(0.6s)
  }, SCENE_FADE_MS);
}
```

`fadeThroughBlack` の上にある既存の説明コメント(`/* 場面の切り替えを黒でつなぐ ... */`)はそのまま残し、`curtainQuick` に言及している1文だけ `curtainFade` へ直す。

### 4-2. `advanceScene` の語り出しの待ち時間

現在:

```js
    /* 語り終わってから下パネルを開ける。待つのは暗転(0.6s)+明転(0.6s)のぶん。
       ここを短くすると、まだ真っ暗な画面に向かってGMが到着を告げることになる */
    setTimeout(() => runSpeechSequence(steps, openUnderPanel), SCENE_FADE_MS * 2);
```

置き換え後:

```js
    /* 語り出しは明転が終わってから。待つのは暗転(0.6s)+真っ黒(0.2s)+明転(0.6s)。
       ここを短くすると、まだ暗い画面に向かってGMが到着を告げることになる */
    setTimeout(() => runSpeechSequence(steps, openUnderPanel), SCENE_FADE_TOTAL_MS);
```

### 4-3. `resetGame`: 背景の差し替えを幕より後にする

現在、`resetGame` の冒頭付近(430行目付近)にこの2行がある。

```js
  state.pendingIntro = introIsObject; // currentBackdropNode()より先に立てる(この状態を見て背景を選ぶ)
  setSceneBackdrop(currentBackdropNode());
  clearChat();
```

`setSceneBackdrop(currentBackdropNode());` の行を**ここから削除**し、後段の大きな `setStore({ diceLog: [], popups, ... })` の**直後**へ移動する。`state.pendingIntro = ...` の行と `clearChat();` は動かさない。移動先には次のコメントを付ける。

```js
  /* 背景の差し替えは幕を降ろした後に行う。先に差し替えると、ストア上に
     「次の場面が幕なしで見えている」状態が一瞬できる。instantなら描画上は
     同じフレームに畳まれるが、順番を正しくしておく(検査もこの順番を見る) */
  setSceneBackdrop(currentBackdropNode());
```

移動しても間に `setSceneBackdrop` の結果を読むコードは無い(`clearChat()`・ポップアップの組み立て・`setSceneInfo` のみ)。

### 4-4. `resetGame`: 幕の入り方を instant にする

現在(472行目付近):

```js
    /* 幕は必ず降ろす。ポップアップがある章は「はじめる」で上がり(1.2s)、
       ポップアップの無い章(lanternhill)は直後のshowDialogueNodeが上げる。
       後者は場面の切り替えと同じ0.6sにする——showDialogueNodeが語り始めるまで
       待つのも0.6sなので、明転しきった瞬間にイントロの語りが始まる。
       以前はポップアップの無い章だけ幕を張らず、イントロが黒を経ずに現れていた */
    curtain: true, curtainQuick: popups.length === 0,
```

置き換え後:

```js
    /* 幕は必ず降ろす。ポップアップがある章は「はじめる」で上がる(1.2s、枠の色)。
       ポップアップの無い章(lanternhill)は "instant" ——「最初から」を押した瞬間に
       真っ黒へ落とし、直後のshowDialogueNodeが0.6sで明転させる。
       遷移させて暗転すると、この関数が差し替えた次の場面が暗くなっていく様子が
       見えてしまう(2026-08-21 作者の指摘「マイラの部屋が表示されてからフェードインが始まる」)。
       以前はポップアップの無い章だけ幕を張らず、イントロが黒を経ずに現れていた */
    curtain: true, curtainFade: popups.length === 0 ? "instant" : "",
```

### 4-5. `resetGame`: イントロを出すまでの待ち

現在(483行目付近):

```js
  if (introIsObject && popups.length === 0) setTimeout(() => showDialogueNode(intro), SCENE_FADE_MS);
```

`SCENE_FADE_MS` を `SCENE_FADE_MS + SCENE_HOLD_MS` に変え、コメントを次へ差し替える。

```js
  /* 新形式introにはポップアップを挟まない。既存の幕開けと同じく、説明を表示してから入力を受ける。
     真っ黒のまま少し止めてから明転する。同じフレームでshowDialogueNodeが幕を上げると、
     黒が一度も描画されずCSSの遷移が始まらない(実測: 降りると上がるの間が11msだった) */
  if (introIsObject && popups.length === 0) {
    setTimeout(() => showDialogueNode(intro), SCENE_FADE_MS + SCENE_HOLD_MS);
  }
```

### 4-6. `curtainQuick` の残りを消す

`grep -n curtainQuick src/` の結果が **0件** になること。`src/engine/index.js` の `fadeThroughBlack` 上のコメント内の言及も含めて `curtainFade` へ直す。

## 受け入れ条件(あなたが実行できるものだけ)

すべてリポジトリ直下の `trpg-gm-mock2` で実行する。コマンドと出力を報告に貼る。

1. `git diff --stat` に出る `trpg-gm-mock2/` 配下のファイルが、上の4つ **だけ** であること(他23ファイルは他セッション由来。触っていないことを示す)
2. `grep -rn "curtainQuick" src/` が **0件**
3. `grep -c "curtainFade" src/engine/store.js src/App.jsx src/engine/index.js` が3ファイルすべて1件以上
4. `grep -n "#curtain" src/styles.css` の出力全文。ルールが6つ(`#curtain`, `#curtain.lifted`, `#curtain.quick, #curtain.instant`, `#curtain.quick`, `#curtain.quick.lifted`, `#curtain.instant`, `#curtain.instant.lifted`)並んでいること
5. `grep -n "SCENE_FADE_MS\|SCENE_HOLD_MS\|SCENE_FADE_TOTAL_MS" src/engine/index.js` の出力全文
6. `grep -n "setSceneBackdrop(currentBackdropNode())" src/engine/index.js` が1件で、その行番号が `curtainFade: popups.length === 0` の行より **後** であること(両方の行番号を報告に書く)
7. `npx vite build` が成功(末尾3行)
8. `node src/engine/panelTiming.test.mjs` が「全て通過」で終わること。**落ちたら報告に出力全文を貼って止める。テストファイルは絶対に書き換えないこと**

## 報告に含めること

- 読んだファイルのパス
- 受け入れ条件1〜8の実行結果
- `git diff` の全文(4ファイル分)
- ブラウザでの見た目の確認は**実施していない**と明記する(こちらで行う)
- 仕様の穴に気づいたら、直さずに指摘だけする
