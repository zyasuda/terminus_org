# mock3 prototype UI 再構築仕様（坑道の向こう）

対象: `trpg-gm-mock3/prototype`。引用は `ファイル:行`。CSSは `index.html` 5〜76行の1つの `<style>` 内。1行に多数の規則があるため `index.html:56 (.scene)` の形で規則名を併記する。
凡例: 【実測】= 2026-11-09 に静的サーバ + ブラウザで `getComputedStyle`/`getBoundingClientRect` を測った値（API未接続状態）。【不明】= ソースから確定できない。無印 = ソース記述をカスケード（詳細度→出現順）で手計算で解決した値。

読み込み順: `engine/core.js → items.js → navigation.js → view.js → sheet.js → ai.js → battle.js → ui.js → scenario.js → bootGame()`、その後 `<script type="module">` で `stage.js`（three.js 立体舞台）を起動（index.html:91-110）。`stage.js` は対象外ファイルだが、探索画面の見た目を決めるため UI 接点だけ §2.6 に記す（3D描画内部は対象外）。

---

## 1. デザイントークン

### 1.1 CSS カスタムプロパティ（:root）
`:root` は2回定義。後勝ちの L52 が有効値。

| 変数 | 有効値 (index.html:52) | 旧値・上書き済 (index.html:5) | 用途 |
|---|---|---|---|
| `--bg` | `#101718` | `#121c24` | body背景、入力背景、dice-plan背景 |
| `--panel` | `#182324` | `#192630` | 会話欄・dialog・queue背景 |
| `--line` | `#405052` | `#3d5059` | 罫線・ボタン枠 |
| `--text` | `#e9e5db` | `#f0f2ed` | 本文色 |
| `--dim` | `#b5c0bd` | `#b0bec4` | 補助文字 |
| `--amber` | `#d9b875` | `#e9bb70` | 見出し・GM・強調・primary背景 |
| `--blue` | `#a6d0d1` | `#8bd6dd` | 話者名・選択状態・focus輪郭 |
| `--red` | `#ee9b92` | `#ff9a87` | エラー・マイク録音中 |

要素ローカル変数:
| 変数 | 既定 | 定義 | 操作元 |
|---|---|---|---|
| `--conversation-width` | `340px` | index.html:21 (.layout) | ui.js:93 setWidth（240〜420） |
| `--stage-aspect` | `1.6` | index.html:56 (.layout) | index.html:95 スライダー `stageAspect` |
| `--gm-stage-height` | `160px`（ただし L65 で `.gm-stage{height:166px}` が直接上書き、変数は未使用化） | index.html:16 | なし |
| `--gm-walk-time` | `.32s` | index.html:16 | なし |
| `--gm-blink-time` | `4.8s` | index.html:16 | なし |
| `--dice-roll-time` | 未設定時 `1250ms` | index.html:33 (.die.rolling) | battle.js:44 `DICE_CONFIG.duration+'ms'` |
| `--lightning-flash` | 0 | index.html:26 | ui.js:58（0〜1の実数） |

`:root` その他 (index.html:5): `color-scheme:dark; font-family:"Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif; font-size:15px`【実測 15px】。

### 1.2 書体
| 用途 | family | 出典 |
|---|---|---|
| 本文・UI | `"Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif` | index.html:5 (:root) |
| h1/h2/h3 | `"Hiragino Mincho ProN","Yu Mincho",serif`, weight 500 | index.html:5 (h1,h2,h3) |
| 役の下書き `#roleDraft` | `'Hiragino Mincho ProN','Yu Mincho',serif` | index.html:74 |
| 地図SVG | `'Yu Kyokasho','Hiragino Mincho ProN','Yu Mincho',serif` italic | index.html:23 (.paper-map svg) |
| クロニクル textarea | `12px/1.7 monospace` | index.html:30 |
| button/input/textarea | `font:inherit` | index.html:5, 53 |

### 1.3 主要寸法・色（面ごと、有効値）
| 面 | 背景 | 枠 | 角丸 | 影 | 出典 |
|---|---|---|---|---|---|
| body | `var(--bg)` | — | — | — | index.html:5 |
| button 既定 | none | `1px solid var(--line)` | 6px | — | index.html:5; hover `#ffffff0a` (L53 が L5 `#31444e` を上書き) |
| button:disabled | opacity .45, cursor default | | | | index.html:5 |
| focus-visible (button/textarea) | outline `2px solid var(--blue)` offset 3px（L53）。input は L5 の `3px solid var(--blue)` offset 3px のまま | | | | index.html:5,53 |
| .scene | `#182324` + 画像 center/cover | `1px solid #ffffff0b` | 10px | — | index.html:5,56 |
| .scene:after グラデ | `linear-gradient(0deg,#101a24 0%,transparent 55%,#101a2455)`；`.drained` 時 `linear-gradient(0deg,#40382a99,transparent 60%)` | | | | index.html:5,8 |
| .side 会話欄 | `var(--panel)` | `1px solid #ffffff12` | 10px | — | index.html:5,56 |
| .person | `#182324` | `1px solid transparent`／自分は `#a6d0d155` | 7px | — | index.html:57 |
| .target 調査札 | `#0e191b8c`；hover/押下 `#142326e8` | transparent／hover・押下 `#d9b87566` | 20px | none, text-shadow `0 1px 4px #000` | index.html:58 |
| .actions.contextual | `#172627f5` + `backdrop-filter:blur(8px)` | `1px solid #d9b87566` | 9px | `0 10px 28px #0008` | index.html:60 |
| .private | `#192d2e` | `1px solid #a6d0d130` | 7px | — | index.html:61 |
| .bubble | `#253638`（自分 `#304246`） | `1px solid #e8eee4bf` | 12px | — | index.html:62 |
| .entry.result | `#d9b87508` | left `2px solid var(--amber)` | — | — | index.html:62 |
| .conversation-state | `#111c1d` | top `1px solid #ffffff12` | — | — | index.html:63 |
| compose textarea | `#101e20` | `1px solid #6f858466` | 7px | — | index.html:64 |
| dialog 共通 | `var(--panel)` | `1px solid var(--line)` | 12px | — | index.html:5；backdrop `#071017b8` |
| .system-panel | 同上 | | | `0 12px 60px #0008`；backdrop `#07101735` | index.html:29-30 |
| .character-sheet | `linear-gradient(135deg,#25323a,#192630 65%)` | `#796443` | 12px | — | index.html:36 |
| .sheet-contact | `#111e26` | top `1px solid #796443` | | | index.html:37 |
| .paper-map | 多重 radial/linear グラデ（index.html:23 全文参照）、文字 `#4b321d`/`#4d351e`、枠 `#725024`、`clip-path` 多角形、`rotate(-.6deg)` | | 0 | inset `0 0 22px 8px #54311260, 0 0 80px #744a2350` | index.html:23 |
| primary ボタン | `var(--amber)` 背景、文字 `#17232b`（.choices）/`var(--bg)`（.dice-buttons） | | | | index.html:5,33 |
| .choices button | — | `#917548`、文字 amber | | | index.html:5 |

---

## 2. レイアウト

### 2.1 DOM 木（index.html:78-90、動的生成は ← で注記）
```
header                                        :78
  h1 "坑道の向こう"
  span "あなたと、3人のAIの仲間"
main.layout                                   :79
  section.world
    div#scene.scene  (+ .dark .drained .stage-ready .revolving .revolve-swapped .lightning-flash .battle-scene を動的付与)
      canvas.stage-canvas        ← stage.js が prepend（tabIndex=0）
      nav#stageLook.stage-look [hidden] aria-label="舞台の左右を見渡す"
        button[data-look=left]  "<<" aria-label="左を向く"
        button[data-look=right] ">>" aria-label="右を向く"
      div.scenehead
        div > h2#place "封じられた石扉"(初期) , p#objective
        span#phase.phase "探索"
      canvas#sceneEffects.scene-effects aria-hidden=true
      div#points                 ← button.target[data-target] ×n , button#dustspot.dust-discovery
      div#sceneTools.scene-tools aria-label="自分の能力と道具"  ← button[data-act=scout]
      div#figures.figures        ← span.scene-actor > img
      img#bossimg.boss [hidden] alt="灯りの番人" src=../replay/img/guardian_rampage.webp
      nav#exits.exits aria-label="シーンの出口"  ← button[data-room]
      section#actions.actions.contextual   ← 調査地点選択時のみここへ移動（view.js:103）
    nav#party.party aria-label="仲間の能力"   ← button.person[data-person] ×4
    div#tele.tele [hidden]
    section#actions.actions (.idle)          ← 非選択時の定位置（#private の直前、view.js:104）
    div#private.private [hidden]
  div#conversationResize.conversation-resize role=separator tabindex=0
  aside#conversation.side
    div.sidehead
      h2 "仲間との会話"
      button#conversationToggle ">>" aria-controls=conversation aria-expanded=true
      (畳み時: button#systemOpen がここへ移動 ui.js:29)
    div#log.log role=log aria-live=polite aria-relevant=additions
    div#conversationState.conversation-state role=status [hidden]
    div.compose
      div.compose-heading
        label#messageLabel[for=message] "全員に話しかける"
        button#systemOpen.gm-settings (歯車SVG) aria-label="GMのシステム設定を開く" title="システム設定"
      fieldset#recipients.recipients  ← legend + label.recipient-choice ×5 (ui.js:28)
      p.recipient-note (display:none)
      div.compose-body
        form#chat
          textarea#message rows=3 maxlength=500 required placeholder="自分の言葉で話す…"
          button.send[type=submit] "話す"
          button#mainMic.mic-button[type=button] (マイクSVG) aria-label="音声で話す" title="押して音声入力"
          div.compose-assist
            button#roleOpen.role-help "セリフの生成するよ"
            span#mainVoiceStatus.voice-status role=status
        div#gmstage.gm-stage      (畳み時は aside#conversation 直下へ移動 ui.js:29)
          div#gmguide.gm-guide
            button#gmdrag.gm-drag aria-label="GMの位置を動かす"
              span.gm-art > img[src=images/gm_mascot.png alt=GM draggable=false], i.gm-eye, i.gm-eye.second
            div#gmbubble.gm-bubble [hidden] > strong "GM", span#gmspeech
    div#status.status role=status "AIの接続を確認しています…"
dialog#sheet                (人物シート/地図を同じ要素で切替、innerHTMLを毎回再生成)
dialog#rolePanel.role-panel :80
dialog#systemPanel.system-panel :81-88
svg(0×0) > defs#diceColorFilters  :89 ← filter#dice-color-<id>（battle.js:59）
dialog#dicePanel.dice-panel :90
```
注: 依頼文の「セリフの下書き」ボタンの実際の文言は `セリフの生成するよ`（index.html:79, sheet.js:110）。

### 2.2 グリッド・フレックス（有効値）
- `header`: flex, align center, gap 16px, max-width 1480px, margin auto, padding `12px 24px`, height 58px（index.html:5,54）【実測 1440幅: h58】。h1 21px margin 0、span dim 11px。header 内にボタンは無い（`header button` 規則 index.html:5 は死にCSS）。
- `.layout`: `display:grid; grid-template-columns:minmax(0,1fr) 8px var(--conversation-width); gap:6px; max-width:1480px; margin:auto; padding:0 24px 16px; height:calc(100svh - 58px)`（index.html:5,21,56。gap は L21 の 5px を L56 が上書き）【実測 1440×900: `1032px 8px 340px`, gap 6px, height 842px】。
- 畳み時 `.layout.conversation-folded`: `grid-template-columns:minmax(0,1fr) 84px; gap:18px`（index.html:21。詳細度0,2,0で L56 の gap に勝つ）。分割線は `display:none`【実測 `1290px 84px`, gap 18px】。
- `.world`: `min-width:0; min-height:0; display:flex; flex-direction:column; gap:10px`（index.html:5,56）。
- `.scene`: `position:relative; overflow:hidden; flex:none; width:100%; height:auto; aspect-ratio:var(--stage-aspect,1.6); min-height:320px; max-height:min(560px,calc(100svh - 220px))`（index.html:56。L5 の clamp 高さは上書き済）【実測 1440×900: 1032×560（max-height で頭打ち、比率は崩れる）】。
- `.scenehead`: absolute, `top:24px;left:24px;right:24px`, flex space-between, align start, z-index 5（index.html:5,26）。子 div `flex:1;min-width:0;padding-right:14px`。h2 30px margin `0 0 4px`；p 12px, max-width 520px, line-height 1.7, text-shadow `0 1px 4px black`（index.html:56）。
- `.exits`: absolute, z-index 4, `bottom:18px; right:18px; max-width:calc(100% - 170px)`, flex wrap, gap 8px, justify flex-end（index.html:23,59）。button: `border-color:#ffffff20; background:#101b1cbb; font-size:11px; padding:8px 12px`（L23 の13pxをL59が11pxに）。
- `.scene-tools`: absolute, `bottom:18px; left:18px; right:18px`, z-index 5, flex wrap gap 6px, pointer-events none（子ボタンのみ auto）。button 11px, padding `7px 10px`, bg `#152326e8`, border `#a6d0d13d`（index.html:59）。
- `.stage-look` button: absolute, top 50% translateY(-50%), bg `#101c20b8`, padding `10px 8px`, 15px, min-width 34px, border `#d9b87544`, left/right 10px（index.html:74）。
- `.figures`: absolute inset 0, z1, pointer-events none, `transition:opacity 1.2s`。`.scene-actor`: absolute, translateX(-50%), width 26%（戦闘 20%）。影 `:before` 幅60%高4% `#060b0bd0` blur 4px（index.html:5）。
- `.party`: `display:grid; grid-template-columns:repeat(4,1fr); gap:6px; padding:0; border:0; flex-shrink:0`（index.html:5,57）【実測 253.5px×4】。`.person`: flex, gap 9px, padding `7px 8px`, img 30×45 `object-fit:contain`（index.html:57）。
- `.tele`: `flex-shrink:0; margin:0; padding:8px 12px; font-size:12px; line-height:1.65; border-left:3px solid var(--amber); background:#14232beb`（index.html:5,60）。
- `.actions`（定位置）: `flex-shrink:0; padding:0`。`.idle` は h3 非表示、p `margin:0;font-size:12px`（index.html:60）【実測 idle 高さ19px】。
- `.actions.contextual`: absolute（#scene内）, z-index 7, `width:min(300px,calc(100% - 32px)); max-height:calc(100% - 32px); overflow:auto; padding:14px`（index.html:60）。位置は JS（§4.6）。
- `.target-portrait`: block, width 100%, `height:clamp(80px,12svh,120px)`, cover, border `1px solid #d9b87530`, radius 5px, margin `10px 0 12px`；`.night` は `brightness(.45)`（index.html:60）。
- `.context-close`: absolute `right:7px;top:7px`, border 0, padding `4px 8px`, 18px（index.html:60）。
- `.private`: `flex-shrink:0; display:flex; align-items:center; gap:10px; padding:10px 12px; font-size:12px`。strong 10px nowrap、`.private-preview` 1行省略、button 11px padding `6px 8px`（index.html:61）。
- `.side`: flex column, `height:auto; min-height:0; max-height:none; min-width:0`（L52/L25 の値は L56 が上書き）。grid stretch で行高いっぱい【実測 1440×900: 340×826】。
- `.sidehead`: flex, space-between, gap 8px, wrap, padding `14px 16px`, border-bottom line。h2 18px `flex:1;min-width:140px`；button 12px padding `6px 9px`（index.html:5,21,56）。
- `.log`: `flex:1; min-height:0; overflow:auto; padding:16px; display:flex; flex-direction:column; gap:18px; overflow-anchor:none; container-type:inline-size`（index.html:5,62）。`.log>.entry{flex-shrink:0}`、`.log>.entry:first-child{margin-top:auto}` → 少数時は下寄せ（index.html:17）【実測 log 338×445】。
- `.conversation-state`: flex-shrink 0, 11px, padding `9px 13px`, max-height 74px, overflow auto, line-height 1.7, 文字 amber（strong は dim）（index.html:63）。
- `.compose`: flex-shrink 0, padding 12px, border-top `#ffffff12`（index.html:63）。`.compose-heading`: flex space-between gap 6px margin-bottom 8px；label 11px dim margin 0（index.html:5,63）。`#systemOpen`（見出し内）: static, 28×28, padding 0, 透明背景, 文字 amber, svg 16×16（index.html:28,63,64）。
- `.recipients`: fieldset, border 0, padding 0, `display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:4px; margin:0 0 10px`；legend は視覚的に隠す（1px clip）（index.html:25,64）【実測 1枚71px幅 ×5（420幅時）】。カード: flex column center, gap 2px, padding `5px 1px`, border `#52656555`, bg `#172628`, 10px dim, img/svg 23×26（index.html:25,64）。input は透明で card 全面に重ねる（index.html:25）。
- `.compose-body`: `display:grid; grid-template-columns:minmax(0,1fr) 92px; gap:8px; align-items:center`（index.html:64）。左=form、右=GMステージ。
- `form#chat`: `display:grid; grid-template-columns:1fr 38px; gap:6px`。textarea `grid-column:1/-1; height:82px; resize:none; padding:10px; font-size:13px; line-height:1.6`；送信ボタン=2行目左, `.mic-button` 2行目右 38px幅 padding 7px；`.compose-assist` 3行目 `grid-column:1/-1` flex space-between gap 6px（index.html:64,74）。`.send`: bg `#d9b87515`, amber, border `#d9b87555`, padding 8px（index.html:5,64）。
- `.status`: 10px dim, min-height 22px, padding `0 12px 8px`（index.html:64）。
- `.gm-stage`: `position:relative; width:92px; height:166px; flex-shrink:0; overflow:hidden; border:0; background:transparent`（index.html:16,65）【実測 92×166】。`.gm-guide`: absolute, width 76px（left/bottom は JS）。`.gm-bubble`: L65 で `display:none` → **最終カスケードでは決して表示されない**。`speakGM` は hidden 属性とクラスを切り替えるだけ（core.js:49）。

### 2.3 会話欄の幅・畳み（ui.js:88-100, 29）
- 既定 340px、min 240、max 420（ui.js:91-92）。再読込で初期化。
- 分割線 `#conversationResize`: 8px 列、`cursor:col-resize`、中央 2px 線（top/bottom 40%、`var(--line)`、hover/focus で `var(--blue)`）（index.html:21）。
- ポインタ: 左ボタンで capture、`width = 開始幅 + 開始X − 現在X`（左へ動かすと広がる）（ui.js:94-95）。
- キー: ArrowLeft +10px（広がる）、ArrowRight −10px、Home=240、End=420（ui.js:97）。`aria-valuenow` を丸めて更新（ui.js:93）。
- 畳む: `#conversationToggle` クリック → `conversationFolded` 反転。開く時 未読 0、`#log` を最下部へスクロール（ui.js:98）。
- 畳み時の表示（index.html:21,29,65）: side 背景透明 + `1px solid var(--line)`、sidehead は縦並び中央寄せ `padding:8px 4px`、h2/log/compose/status/conversation-state 非表示、トグルは 11px `white-space:pre-line` padding `8px 5px` 幅100% 枠 blue、`#systemOpen` を sidehead へ移動（margin-top 8px, 20px）、`#gmstage` を aside 直下へ移動し absolute 下端 `width:100%; height:166px; pointer-events:none`、`#gmdrag` disabled（opacity 1）【実測 1440: side 84×826, gmstage 82×166】。
- トグル文言: 開 `>>`／畳 `<<` + 未読があれば `\n未読 N`（ui.js:29）。

### 2.4 z-index（#scene 内、有効値）
| z | 要素 | 出典 |
|---|---|---|
| 1 | `canvas.stage-canvas`、`.figures`、`.boss` | index.html:74,5 |
| 2 | `.scene-effects`（canvas）。`.scene.dark` 時 4 | index.html:24,26 |
| 3 | `.scene:before`（暗幕） | index.html:24 |
| 4 | `.target`、`.exits`、`.dust-discovery` | index.html:8,23,26 |
| 5 | `.scenehead`、`.scene-tools` | index.html:26,59 |
| 6 | `.stage-look` | index.html:74 |
| 7 | `.actions.contextual` | index.html:60 |
| (actor) | `.scene-actor` は inline `z-index:round((1-z)*100)` | view.js:4,10 |
| 6 | `.gm-settings` absolute 版（実際は static で使用） | index.html:28 |
| 1 | `.system-head` sticky | index.html:30 |
dialog は top layer（showModal）。

### 2.5 スクロール領域・固定
- ページ: ≥901px は `.layout` 高さ `100svh-58px` で通常ページスクロール無し【実測 1440×900】。≤900px は `height:auto` でページが縦スクロール【実測 900×900: layout 1245px】。
- `.log`（縦）、`.conversation-state`（max 74px）、`.actions.contextual`（max-height）、`.world.battle-world`（≥901px のみ `overflow:auto; scrollbar-gutter:stable` index.html:66）、各 dialog（`.map-content`, `.sheet-content`, `.system-panel`, `.dice-panel`, `.role-panel`）。
- `.system-panel`: `position:fixed; inset:16px 16px 16px auto; width:min(440px,calc(100vw - 32px)); max-height:calc(100svh - 32px); overflow:auto; padding:0 20px 20px`、`.system-head` sticky top 0（index.html:29-30）。

### 2.6 立体舞台（stage.js の UI 接点のみ）
- `index.html:93` で `createStage($('scene'),$('stageLook'),cb)`。成功時 `#scene.stage-ready`、`#stageLook` 表示（stage.js:177）。`.stage-ready .figures,.stage-ready #bossimg{opacity:0;visibility:hidden}`（index.html:74）→ DOM立ち絵は非表示、3D に置換。
- canvas: `class="stage-canvas" tabIndex=0 aria-label="舞台。ドラッグで上下と左右を見渡す。左右の矢印キーで左右を向く"`（stage.js:13）。`cursor:grab`/`:active grabbing`, `touch-action:none`（index.html:74）。
- ポインタ左ドラッグでパン（stage.js:172-174）。キー: フィルタは `ArrowLeft/ArrowRight/Home` のみ。Home=正面(0,0)、左右 ±1。ArrowUp/Down の分岐は記述されているがフィルタで弾かれ発火しない（stage.js:175、記述どおり）。
- `[data-look]` ボタン: 端まで `slidePan`（stage.js:171）。パン限界に達した側のボタンは `hidden`（stage.js:116）。
- 既定値（scenario.js:445-507 `SCENARIO_STAGE_DEFAULTS`）: `scrollSeconds .45`, `revolveSeconds 3`, `spotHoldSeconds 7`, `spotFadeSeconds .65`, `panX 6`, `panY 5`, `frontRow 2.2`, `rowGap 1.07`, `inwardAngle 12`, `fov 65`, `horizon 54`, `spotStrength .7`, `spotWidth 3.4`, `spotColor 'warm'`, `battlePartySide 'left'`, `battlePartyX 0`, `battlePartyForward 2.5`, `battlePartyScale .85`, `battleFacing 25`, `battleEnemyX 5.5`, `battleEnemyScale 1.7` ほか。
- 失敗時: `webglcontextlost` で `stage-ready` 除去・canvas/controls hidden（stage.js:176）。起動例外時 `#stageLook` hidden、canvas 除去、`#status`=「立体舞台を起動できないため、従来のシーン表示を使います。」（index.html:110）→ DOM 立ち絵（§4.3）にフォールバック。

### 2.7 @media / @container（統合後の差分）
**(max-width:900px)**（index.html:5,21,25,67 を統合、後勝ち解決済）
- header: `height:auto; min-height:54px; padding:12px 16px; flex-wrap:wrap`；span max-width none。
- `.layout`, `.layout.conversation-folded`: `grid-template-columns:1fr; height:auto; min-height:calc(100svh - 54px); padding:0 12px 16px; gap:12px`【実測 900: 1列 861px, gap 12】。分割線 `display:none`。
- `.world` gap 9px。`.scene` `max-height:540px`（他は同じ）【実測 861×538】。
- `.scenehead` `left:16px; top:16px`；h2 26px；p max-width 78%；`.tele` 12px；`.target` padding `8px 10px`。
- `.party` `repeat(4,minmax(0,1fr))` gap 4px；`.person` gap 4px padding `6px 4px`；img 24×36；strong 11px；small 9px。
- `.private` wrap；`.private-preview` flex-basis 60%、2行クランプ。
- `.actions.contextual` `max-height:50%; width:min(260px,calc(100% - 24px))`。
- `.side` `height:580px; min-height:0; max-height:none`【実測 580】；畳み時 `height:190px`【実測 190】。
- 畳み時: sidehead `flex-direction:column; align-items:center; justify-content:flex-start; padding:12px 100px 12px 12px`；トグル `width:auto`；`.gm-stage` `left:auto; width:92px`【実測 92】。
**(min-width:901px)**（index.html:66）: `.world.battle-world{overflow:auto;scrollbar-gutter:stable}`、`.battle-world .scene{min-height:320px;flex:none}`、`.battle-world .actions{padding-bottom:8px}`。
**(max-width:600px)**（index.html:9,24,37,39,47,71,75）
- `.scenehead p` max-width 220px（ただし後方の ≤900 規則 78% が勝つ。実効 78%）。`.choices button` 13px（`.actions .choices button` 12px が詳細度で勝つため #actions 内は12px）。`.map`/`.mapline` 規則は該当要素なし（死にCSS）。
- `.effect-fields` 1列。`.queue div` wrap、`.queue select` max-width 100%。
- 人物シート: header padding `42px 38px 16px` gap 10px（L47 が L37 を上書き）；portrait width 55px（高さ 110px L37）；h2 23px；nav/content/contact padding `12px 16px`；`.sheet-two` 1列 gap 18px；table セル padding `7px 6px`；`.sheet-input` basis 100%；`.sheet-close` absolute `top:8px; right:38px` padding 7px；nav ボタン `flex:1; padding:8px 5px`；人物切替 28px幅 17px、left/right 6px；`.sheet-vital` cols `20px minmax(0,1fr) 50px` gap 6px 10px。
- アイテム詳細 1列 gap 10px padding 12px、img 高150px、h3 margin-bottom 6px。
- `.stage-look` left/right 6px；`.role-panel` padding 16px；`.compose-assist` wrap。
**(max-width:420px)**（index.html:68）: `.party` 2列【実測 196px×2】；`.person img` 28×36 block、padding `8px 6px`；`.private strong` 改行可；`.scenehead` left 16 top 18；p 11px；`.exits` `bottom:12px; right:12px; max-width:calc(100% - 140px)`、button padding `7px 8px`；`.target` 11px padding 8px；`.scene-tools` left 12 bottom 12。
**(max-height:650px)**（index.html:38,48）: 人物シート header padding `8px 64px` gap 12px、portrait 45×60、h2 22px margin `2px 0`、nav padding `6px 16px`、contact padding `8px 16px`、contact p margin-bottom 4px、quick margin-top 6px。
**(max-width:600px) and (max-height:650px)**（index.html:49）: header padding `38px 38px 8px`、portrait width 45px。
**@container (max-width:300px)**（.log がコンテナ, index.html:62）: `.face` 32×32。
**(prefers-reduced-motion)**: §7。

---

## 3. 操作部品

### 3.1 会話入力（ui.js:140-141, ai.js:252-299）
- `textarea#message`: maxlength 500, required。`Enter`（Shift なし・IME 変換中でない）→ preventDefault、busy でなければ `requestSubmit()`。Shift+Enter は改行（ui.js:141）。
- `form#chat` submit: trim、空 or busy なら無視、欄を空にして `submitMessage(text)`（ui.js:140）。宛先は現在の `recipient`。
- 無効条件: `busy || battlePreview` で textarea・送信 disabled、`battlePreview` で `#mainMic`・`#roleOpen` disabled（view.js:118）。
- 送信時ログ: who=`イネス（あなた）→<宛先名>`、kind `you`（ai.js:271）。

### 3.2 宛先選択 `#recipients`（ui.js:26-28）
- 5枚: `全員`（人型3つのSVG）、AI仲間3人（ブロム／ガレス／マレン、画像 `../replay/img/<id>.webp`、lydia→maren）、`GM`（`images/gm_mascot.png`）。radio `name=recipient`。
- 変更→ busy でなければ `recipient=value`、`#messageLabel`=`<名>に話しかける`（全員/GM/人物名）。`busy||battlePreview` で全 radio disabled（ui.js:27）。
- 送信先は AI 返答者を決める。`reset()` で `'all'` に戻る（ui.js:136）。

### 3.3 マイク `#mainMic`（ui.js:121-134）
- Web Speech API（`SpeechRecognition||webkitSpeechRecognition`）、`lang='ja-JP'`, continuous false, interimResults false。押すたびに開始/停止トグル。録音中 `.listening`（red 枠, bg `#ee9b9218`）、`aria-pressed=true`。
- 認識結果は自動送信しない。元の入力に空白区切りで追記（500字で切詰め）。編集されていたら上書きしない。
- 状態文は `#mainVoiceStatus`（§6.3）。タブ非表示・シート close（sheetMessage時）で停止。busy 中は開始不可。

### 3.4 セリフ補助 `#roleOpen` / `dialog#rolePanel`（ai.js:296-311, index.html:80）
- `#roleOpen`「セリフの生成するよ」→ `openRoleHelp('message', recipient)`。人物シートにも同ボタンを動的追加（sheet.js:110、対象 `sheetMessage`、宛先は自分なら all、他人ならその人）。
- 開く: busy なら無視。`#roleIntent` に元入力欄の文をコピー、`#roleDraft` 空、`#roleStatus`=「下書きは演技のきっかけです。どう話すかはあなたが決めます。」、`showModal()`、`#roleIntent` に focus。
- 見出し `#roleTitle`「イネスとして、どう話そう？」、閉じる `#roleClose` 「×」 aria-label「演技のメモを閉じる」。
- `#roleGenerate`「言葉を手伝ってもらう」: 意図が空 or 生成中なら無視。生成中 disabled、状態「言葉のきっかけを考えています…」。AI 応答（500字以内）を `#roleDraft` へ。途中で下書きが編集されていたら上書きしない。場面・意図が変わっていたら破棄。
- `#roleUse`「入力欄に写す」: 場面（generation/room）が変わっていれば拒否、元入力欄が変更されていれば拒否、それ以外は入力欄へ写し `input` イベント発火、閉じて入力欄に focus。
- `#roleBack`「閉じて、自分の言葉で話す」/`#roleClose`/Esc: 閉じて進行中リクエスト破棄。
- 生成は発言にならない（`#roleStatus` 初期文 index.html:80）。

### 3.5 調査札・行動パネル（view.js:88-110, scenario.js:429,433）
- `#points` に `button.target[data-target]`（`aria-pressed`、文言 `pointLabel(t)`）。探索かつ非戦闘・非結末のみ。表示条件 `visibleTargets()`（scenario.js:54: 点灯中は部屋の targets + 発見済み、未点灯は入口で cache 発見済みなら cache のみ）。
- 札クリック: `target=t; render()`、contextual になったら最初の `[data-act]`→`#investigationResult`→`#contextClose` の順で focus（view.js:90）。
- 文言: `TARGETS` 名、変化後は `開いた収納`/`開いた石扉`/`乾いた排水口`（scenario.js:432）。
- 蒼い塵 `#dustspot.dust-discovery`: 58×58 円、`left:82%;top:44%`、radial `#b6edff55`（hover `99`）。条件 `!battle && blueDust() && !cache発見`。aria-label「蒼白い塵が集まる場所を調べる」。押下 `human('find_cache')`（scenario.js:600-602, index.html:26）。
- 行動パネル `#actions`（探索）: h3 = 未点灯→「暗闇の中を探る」/「灯りを用意する」、札選択→札名、他→「周囲を見渡す」。p は scenario.js:429。札選択時 own 行動（`ACTION_TARGET[a]===target && canShowProposal`）を `button[data-act]`（文言 `LABEL[a]`）で列挙、無ければ説明文を置換（view.js:98）。
- 調査済み記録があれば `button#investigationResult`「調査結果を見る」→ 人物シート notes タブを開き該当 `li[data-history-index]` を中央へスクロール・focus（view.js:47-51,101）。
- contextual 時: 先頭に `button#contextClose.context-close`「×」（aria-label「調査地点の操作を閉じる」）、h3 直後に寄り絵 `img.target-portrait`（`images/investigation/<t>-v1.png` 272×120、未点灯 `.night`、変化後は caption「最初に見えた外観」）（scenario.js:180-184, view.js:103）。
- Esc（#actions 内、contextClose があるとき）: 閉じる。閉じると札へ focus を戻す（view.js:107）。
- 進行ボタン: 広間で扉が開いたら `button#advance.primary`「石扉の奥へ進む」→ `advance()`（scenario.js:433, view.js:110）。
- `#sceneTools`: 探索中、自分の `scout` 行動があれば `button[data-act=scout]`「周囲の痕跡を探す」（view.js:99）。
- 全 `[data-act]` は busy 時 disabled、押下 `human(a)`。

### 3.6 出口 `#exits`（view.js:93, navigation.js:2,46）
- 条件: 探索 && 点灯（`visibleExits`）。戦闘・結末・未点灯では `hidden`。
- 文言: `<span aria-hidden="true">↗</span> ` + 既知/訪問済みなら `<部屋名>へ`、未知なら通路名（`PASSAGES`: 奥へ続く通路／下りの通路／入口へ戻る通路／上りの通路）。busy 時 disabled。
- 押下 `travel(id)`: 移動、結果をログ（result）、target 解除、シートを閉じる、render、見えた札を AI が告知。
- 部屋転換演出は §4.7。

### 3.7 地図ダイアログ（`dialog#sheet.map-sheet`、navigation.js:21-29, scenario.js:641,145）
- 開く経路: 人物シート持ち物タブの地図「使う」→ `requestMap(holder,item)`。自分所持なら即 `showMap`、他人なら AI に可否を問い `show` のとき表示（navigation.js:30-45）。前提: 探索中、点灯 or 灯石点灯中。
- 構成: `.map-toolbar`（`button#mapback`「<所持者>の持ち物へ」→ `sheet(holder,'items')`、`button#closesheet`「閉じる」）、`.map-content`（`h2#mapHeading` 品名、`p.map-caption`「<所持者>が持つ地図を、仲間と広げています。」+ MAPS caption、`.paper-map` > SVG）、`.sheet-contact`（label「地図を見ながら皆に話してみる」、`p#mapStatus`、`form#mapChat` > `input#mapMessage` maxlength 500 placeholder「排水室へ行こう」 + `button[type=submit]`「話す」→ `submitMessage(text,'all')`）。
- 寸法: `width:min(760px,94vw); max-height:90svh; padding:0; display:flex column`（index.html:23）。
- SVG viewBox `0 0 600 465`、`role=img aria-labelledby="maptitle mapdesc"`、フィルタ `#map-ink`（feTurbulence .025/2/seed17 + displacement 1.7）。各部屋: 輪郭 path + 記号 path、現在地は楕円 `rx69 ry53`（`.map-current` stroke `#476261` dasharray `100 3 30 5`）、名前・状態（ここにいる／訪問済み／地図の記載・未訪問）・注記。経路は訪問済み実線、未訪問 `.unseen`（dasharray `7 6` opacity .65）。凡例「実線：通った道　点線：地図の記載　青い印：現在地」（scenario.js:145）。
- busy 中は `#mapChat` の input/button disabled、`#mapStatus`=「仲間が考えています…」/通常「行き先を選んで、仲間に伝えられます。」（sheet.js:117）。

### 3.8 人物シート `dialog#sheet.character-sheet`（sheet.js:70-121）
- 開く: 仲間ストリップの人物ボタン（view.js:94）、`#privateDetails`（notes）、調査結果、地図から戻る。開く/人物が変わる時 `stageView.focusActor(id)`（sheet.js:71）。毎回 innerHTML を再生成。render ごとに `refreshOpenSheet()` で再生成し、本文スクロール位置・入力中の文・話し方欄・focus を保持（sheet.js:116-121）。
- 寸法: `width:min(840px,94vw); height:min(900px,90svh); padding:0; display:grid; grid-template-rows:auto auto minmax(0,1fr) auto`（index.html:36-37）。
- ヘッダー `.sheet-header`（flex gap 20px, padding `20px 64px`, border-bottom `#796443`）:
  - `button#sheetPrevious.sheet-person-switch.previous`「◀」 aria-label「前のキャラクター：<名>」 title「<名>へ」、`#sheetNext`「▶」同様。32×44、透明、amber 19px、left/right 16px、縦中央。PEOPLE 順で循環。押下後同じタブで再描画し同じボタンへ focus（sheet.js:93）。
  - `img.sheet-portrait` 105×145 contain。`h2#sheetTitle` 名前 28px、`p` role（例「あなた・斥候」）。
  - `.sheet-vitals`（max-width 330px）: HP 行 `grid 24px minmax(30px,1fr) 58px`、メーター 9px 高 `#55272b` 地に `#e46169`、右に `n / max`。MP 行は `#244a69` 地 `#427ca5` 枠、文字 `#a0caee`、値「未設定」（MP は未実装）。
  - `button#closesheet.sheet-close`「閉じる」。
- タブ `nav.sheet-nav` aria-label「記録の分類」: `人物`(person) `能力`(ability) `持ち物`(items) `情報・履歴`(notes)。`aria-pressed` で選択表示（bg `#30474d`, blue）。
- 本文 `.sheet-content` tabindex 0 role=region aria-label「キャラクターの記録内容」、縦スクロール、`scrollbar-gutter:stable`。
- **人物タブ**: 注記（自分「あなた自身の設定です。これをもとに仲間へ話せます。」/他人「呼び名と役割以外は、本人が話して確認できた情報だけを記録します。」）。2列 `.sheet-two`:
  - 左「基本情報」表（項目/記録）: 呼び名、身長（`cm`）、正式な名前、年齢、種族、出身地、役割（role 全文）。未開示は「まだ聞いていない」。
  - 右: 人物像、生い立ち・学び、これまでの経験、冒険の理由（各 h3 + p）、「得意なこと」（開示済み技能を `ul.sheet-notes`、詳細未開示は「詳しい使い方はまだ聞いていない」、全未開示は「まだ聞いていない。得意なことを尋ねてみましょう。」）。
  - 「人物の経歴は今回の試作用設定です。」
  - 「話し方」節 `.sheet-voice`（max 460px）: 注記「次の発言から反映。再読み込みで戻ります。空欄は既定、呼称は名前。語尾・演じ方は傾向です。」。入力 `voiceFirst`（表示ラベル「自分の呼び方」, max 8）、`voiceCall`「相手の呼び方」(11, placeholder「例：君、お前」)、`voiceEnding`「語尾」(12)、`voiceManner`「演じ方」(25, 2列幅, placeholder「例：少し消極的で、控えめに話す」)。一人称・語尾の placeholder は `VOICE_DEFAULT`（scenario.js:18）。3列グリッド。`button#voiceApply`「適用」→ `setVoice`、`#voiceStatus`=「<名>の話し方を適用しました。」（core.js:14, sheet.js:77,100）。
- **能力タブ**: 左「基本能力の試案」表（能力 / 値（3〜18））: 筋力・生命力・器用さ・敏捷性・知力・精神力。開示済みのみ `<strong>値</strong>`、他「まだ聞いていない」。注「表示用の試案です。現在のダイス判定には未連動です。」。右「知っている技能」表（技能 / 用途・制約）、無ければ「どんなことが得意か、本人に聞いてみましょう。」。マレンで skill2 開示時「火球の残り：<strong>N回</strong>」（scenario.js:434）。下に `.sheet-quick`: 探索中かつ自分のとき scout ボタン（`LABEL.scout`）→ シートを閉じ `human`。
- **持ち物タブ**:
  - 選択品詳細 `section#sheetItemDetail.sheet-item-detail`（aria-label「<品名>の外観」）: 画像 `images/items/<id>-v1.png` 240×160、h3 品名、説明、「所持：<名>」(+「 · <owner>から借りている」)、閉じる `#itemDetailClose`「×」aria-label「アイテムの画像を閉じる」。2列 `minmax(0,240px) minmax(0,1fr)`。
  - 「装備品」「使用アイテム」各表（持ち物 / 状態・用途 / 操作）。空は「知られている品はありません。」。
  - 品名: 地図はテキスト、他は `button.sheet-item-link[data-item-view]`「<品名> ↗」（`aria-expanded`, `aria-controls=sheetItemDetail`）→ 詳細を開閉し、開いたら `#itemDetailClose`、閉じたらリンクへ focus。
  - 状態・用途: 詳細既知なら detail、未知「詳しい用途はまだ聞いていない」。装備品は `<small>`「装備中」/「外して携行中」+ 剣の抜刀可なら「・抜刀中」/「・納刀中」。借用は「<owner>から借りている」。
  - 操作（装備品）: `button[data-equip-item]`「外す」/「装備する」/（杖を未装備でランタン装備中なら）「杖に持ち替える」+ 注「ランタンを消灯して収納」。他人のシートでは各文言に「よう頼む」を付加。抜刀可能品（ガレスの片手剣）に `button[data-draw-item]`「納める」/「抜く」。busy・プレビュー中 disabled。自分→即 `handleEquipment`、他人→会話で依頼「<名>、<品名>を装備して/外して/抜いて/鞘に納めてください。」（sheet.js:105-107）。
  - 操作（使用品・ランタン）: 使い方が複数なら `select[data-item-use-choice]`（aria-label「<品名>の使い方」）、`button[data-item-use]`「使う」/「使うよう頼む」。下に小注（地図: 「探索中に地図を開けます」/「先に灯りを用意してください」/「地図を開く」、他: 行動名/「今は使える場面ではありません」/「使い方を選ぶ」）。有効条件 `uses.length && !busy && !battlePreview && (地図なら探索中かつ(点灯||灯石))`。押下: 地図→`requestMap`、他→閉じて `human` or `request`（sheet.js:104）。
  - 「貸している品」表（持ち物 / 借りている人）（該当時のみ）。「受け渡しの記録」`ul.sheet-notes` or「まだありません。」。
  - Esc: 詳細が開いていれば詳細だけ閉じる（dialog close を止める）（sheet.js:97）。
- **情報・履歴タブ**: 「本人について知ったこと」（`<small>ラベル · 出典</small>値`、空「まだ聞き取った記録はありません。」）。自分: 「あなたが得た情報」`ol`（`発見 N · 共有済み/自分の記録`、未共有は `button.private-note-share`「この発見を皆に伝える」or「皆に伝える」）、空「まだ発見はありません。」。他人: 「本人から聞き取る情報」+「未共有の記録：N件。内容は本人に相談して聞き取ります。」。「共有済みの手がかり」（空「まだありません。」）。「行動履歴」+注「本人が実行した行動と、その結果を記録します。」、`ol > li[data-history-index][tabindex=-1]`（`N · 部屋名 · 自発/<名>の依頼`、行動名、「結果：…」）、空「まだ行動していません。」。focus 時 amber 輪郭（index.html:76）。
- 連絡欄 `.sheet-contact`: label（自分「皆に話してみる」/他人「<名>に話しかけてみる」）、`p role=status`（busy「返答と人物設定を確認しています…」/フィードバック/同意状況/既定「全員に聞こえる会話です。選んだ相手が返答します。」）、`form#sheetChat`: `input#sheetMessage` maxlength 500 required（placeholder: notes「調べて分かったことを教えて」/ability「この能力で何を調べられそう？」/他「出身や得意なことを尋ねてみる」）、マイク（初期 disabled「音声入力は準備中」→ JS で有効化し aria-label「音声で話す」）、送信「全員に話す」/「<名>に話す」、`button[data-gm=true]`「GMに尋ねる」、`p#sheetMicNote`「マイクを押して話し、聞き取った文を確認してから送信できます。」、末尾に「セリフの生成するよ」。送信中は入力・ボタン全 disabled。行動が実行されたらシートを閉じる、それ以外は同タブで再描画しスクロール保持（sheet.js:108-109）。下書きは人物ごとに `sheetDrafts` に保持。

### 3.9 GMのシステム設定 `dialog#systemPanel`（index.html:81-88, ui.js:3-25,32-40）
- 開: `#systemOpen`（クロニクル更新、確認欄を隠して `showModal`）。閉: `#systemClose`「×」aria-label「システム設定を閉じる」。右寄せ固定パネル（§2.5）。
- **ゲーム管理**: `#reset`「最初から」+「現在の進行を消します。実行前に確認します。」→ `#resetConfirm`（role=alert）表示、`#resetCancel` へ focus。`#resetAccept`「進行を消して開始」→ `reset()`、パネルを閉じる。`#resetCancel`「キャンセル」→ 隠して `#reset` へ focus（ui.js:17-19）。
  - `reset()`（ui.js:136）: プレビュー解除、照明 auto、音声停止、役パネル閉、依頼・下書き・受け渡し・申し出・同意を破棄、宛先 all、未読 0、generation++、`state=initial()`、busy false、target null、chat/plan/履歴クリア、`#log` 空、`introduceInventory()`（GM導入 + AI 3人の持ち物紹介 4件【実測】）、render。
  - `details#chronicleControls` summary「クロニクル」: 説明、`textarea#chroniclePreview` readonly（aria-label「クロニクルの内容」, 高220px）、`#chronicleExport`「Markdownで出力」→ `mock3_chronicle_YYYY-MM-DD.md` をダウンロード、`#chronicleStatus`「Markdownファイルを出力しました。」。内容 = `CHRONICLE_HEADER` + error 以外の各発言 `## N. 話者\n\n本文`（ui.js:2, scenario.js:441）。開くたび更新。
- **AIの比較**: `select#aiConnection`（`default`「Claude Haiku 4.5」/`cloud-gemma` disabled「クラウドGemma（確認中）」初期）。`/api/model-info` 応答で option0=`<Claude|ローカル|既存接続> · <model>`、option1=`クラウド · <cloudModel|Gemma>`、`disabled = !cloudConfigured || !cloudModelAccepted`。使用フィールド: `backend`('anthropic'|'ollama'|他), `model`, `comparison.cloudModel/cloudConfigured/cloudModelAccepted`（ui.js:5）。busy 中 disabled・変更不可。`#aiModelStatus`, `#aiTiming`, `#aiFallbacks` の文言は §6.5。
- **この試作について**: 説明文（§6.5）。**音声設定**: 説明のみ（操作なし）。
- **開発・調整**: `#debugEnabled`「演出の調整を有効にする」→ オンで `#effectControls #diceDemo #stageTuning #battleTuning #stageLightTuning #battlePreviewRow #battlePreviewNote` を表示。オフ時プレビュー中なら解除（ui.js:21）。
  - `#battlePreview`「戦闘画面を表示する」: busy または戦闘中は拒否。オンでパネルを閉じ戦闘レイアウトのプレビュー（§4.1）。注「表示だけを切り替えます。戦闘の操作と会話はできません。」。
  - `#diceDemo`「ダイス演出を試す」→ パネルを閉じ `openDice('demo')`。
  - `details#effectControls` summary「演出テスト・調整」（ui.js:34 生成）。range（`input[type=range]` accent amber, output amber tabular）:
    | id | ラベル | min | max | 既定 |
    |---|---|---|---|---|
    | fx-dust | 漂う塵 | 0 | 60 | 28 |
    | fx-flame | ランタンの揺らぎ | 0 | 100 | 35 |
    | fx-fog | 霧の濃さ | 0 | 100 | 22 |
    | fx-rain | 雨の量 | 0 | 100 | 32 |
    | fx-wind | 風の向き・強さ | -100 | 100 | 25 |
    | fx-lightning | 雷光の強さ | 0 | 100 | 55 |
    | depth-shrink | 奥の縮小率（出力 `%`） | 0 | 60 | 25 |
    | depth-rise | 奥の足元の高さ（`%`） | 0 | 28 | 16 |
    | depth-size | 人物の基準サイズ（`%`） | 30 | 60 | 46 |
    ボタン「雷光を試す」（即時落雷）、「立ち位置を配置し直す」（placementKey 破棄→再抽選）、チェック「霧は入口（屋外）のみ」既定 on、「動きを停止して比較」既定 off、「演出を初期値へ」（FX_DEFAULT/DEPTH_DEFAULT 復元）。注記文あり。システムパネル内では1列（index.html:31）。
  - `details#stageTuning` summary「舞台の視線」（index.html:87, 95-101）:
    | id | ラベル | min | max | step | 既定 | 表示 |
    |---|---|---|---|---|---|---|
    | stageAspect | 舞台の横長比率 | 1.3 | 2.2 | 0.05 | 1.6 | toFixed(2) |
    | stagePanX | 左右に向く範囲 | 2 | 10 | 0.5 | 6 | |
    | stagePanY | 上への移動範囲 | 1 | 8 | 0.5 | 5 | |
    | stageFrontRow | 人物の手前位置 | 1 | 3 | 0.1 | 2.2 | |
    | stageFov | 視野角（縦・度） | 35 | 75 | 1 | 65 | |
    | stageDepth | 奥行き4段階の間隔 | 0.6 | 1.6 | 0.01 | 1.07 | |
    | stageInward | 人物の内向き角度（度） | 0 | 25 | 1 | 12 | `°` |
    | stageHorizon | 消失点の高さ（上端から%） | 42 | 62 | 1 | 54 | `%` |
    | sceneFade | 場面転換の長さ | 0 | 1200 | 100 | 600 | `(ms/1000).toFixed(1)+'秒'` |
    注「消失点は舞台側の投影です。背景画に描かれた遠近は画像自体に含まれます。」、`#stageCameraReset`「舞台の初期値に戻す」。
  - `details#battleTuning` summary「戦闘の構図」: `battlePartySide` select（left「左側」/right「右側」）、range `battlePartyX` 仲間の左右位置 -2〜2 step .1 既定0、`battlePartyForward` 仲間の手前位置 0〜3.5 .1 既定2.5、`battlePartyScale` 仲間の大きさ .65〜1 .05 既定.85（`倍`）、`battleFacing` 背面斜めの角度 10〜40 step5 既定25（`°`）、`battleEnemyX` 番人の左右位置（仲間が向きを追う）-8〜8 .1 既定5.5、`battleEnemyScale` 番人の大きさ 1〜3 .1 既定1.7（`倍`）。注「戦闘画面だけの調整です。進行や判定には影響しません。」、`#battleTuningReset`「戦闘構図の初期値に戻す」。
  - `details#stageLightTuning` summary「舞台照明・ピンスポット」: 注「発言した人物を7秒間照らします。消灯中は止まり、手がかりの発見条件は変わりません。」、`stageLightMode` select（auto「発言した人物に合わせる」/off「照明なし」/ines「イネス」/brom「ブロム」/gareth「ガレス」/lydia「マレン」/guardian_rampage「番人（戦闘中）」）、`stageLightColor`（warm「琥珀色」/cool「月光色」）、`stageSpotStrength` 明るさ 0〜100 既定70（`%`）、`stageSpotWidth` 光の広がり 1.8〜6 .1 既定3.4、`#stageLightReset`「照明の初期値に戻す」、注「変更はこのプレイ中だけ有効です。」。
  - `.stage-tuning` label は `grid 1fr auto`、select/input は全幅（index.html:74）。

### 3.10 戦闘の作戦 UI（view.js:96-109, battle.js:4-23, scenario.js:428-429）
- 戦闘開始: 広間の `#advance` → `advance()` で phase `battle`（scenario.js:147-151）。
- 計画前: h3「あなたの行動」+ p「敵の予告を見て、自分の行動を選べます。固定のリーダーはいません。」、自分の戦闘行動 `button[data-act]`（LABEL: 弱点を見抜く／マレンを手助けする／投げ縄で攻撃する／退路を確保する（撤退希望） 等、`actionsFor`）。押下 → 自分の計画を作り AI 3人に計画参加を依頼（`companions(true)`）。4件揃わなければ破棄（ai.js:247）。
- 計画後（plan.length>0）: h3「作戦の順番」+ p「各自が自分の行動を選び、順番を提案します。実行前に本人たちが連携を確認します。」。`.queue` に各行 `div`: `<b>N</b>`、`<span>名前：行動<small.plan-vote>…</small></span>`、自分の行には `select#ownBattleAction`（aria-label「イネス自身の行動」、候補 `actionsFor(human)`）、`button[data-move="i,-1"]`「↑」(aria-label「N番の行動を上へ」, 先頭 disabled)、`button[data-move="i,1"]`「↓」(「N番の行動を下へ」, 末尾 disabled)。票の文言: 自分「あなたが選んだ行動」/了承「本人が了承」/否「本人が再相談を希望」/未「本人の確認待ち」。
  - 並べ替え・自分の行動変更 → `planReview=null`（再確認が必要）。
  - `.plan-coordination`: `<strong>GM：連携の確認</strong>` + `planIssues` の各文 or「現在の行動と順番に、ルール上の食い違いはありません。」+「順番や行動を変えると、本人の確認を取り直します。1回の調整で各AIが1回ずつ返答します。」
  - `.choices`: `#coordinate`「仲間と連携を調整」（plan 4件でないと disabled）→ `run(coordinatePlan)`；`#execute.primary`「この行動で進める」（`planReady()` 偽で disabled）→ `openDice('battle')`；`#cancelplan`「選び直す」→ plan 破棄。全て busy で disabled。
  - `planReady()`（battle.js:5）: 4件・全員異なる・行動妥当・review キー一致・AI 全員 approved=true・`support`/`cover` 系 issue なし。
- 予告 `#tele`（戦闘時のみ表示）: `<strong>予告：前衛を薙ぎ払う（各N）|魔法使いへ光線（N）</strong>番人の枠 boss/24|30　ラウンド N`（奇数ラウンド=薙ぎ払い）（scenario.js:428）。
- 番人移動: 判定後に外れがあれば `BATTLE_ENEMY_ROUTE` に沿い 450ms smoothstep で `battleEnemyX` を補間（reduced-motion は即時）、結果に「番人が左/右へ身をかわした。」（battle.js:26-34, scenario.js:606）。

### 3.11 ダイス `dialog#dicePanel`（battle.js:36-89, index.html:90, scenario.js:604-605）
- モード: `battle`（作戦実行）、`cache`（ガレスの隠し収納解錠）、`demo`（設定から）。`openDice` はリセット後 `showModal()`。
- 構成: `.dice-head`（GM画像 52×92、`h2#diceTitle`「GMの判定」、`p#diceIntro`）、`.dice-plan#dicePlan`（判定式・確率説明）、`label#diceSupportLabel`（cache のみ）`input#diceSupport`「イネスが照明と見張りで支援（＋2）」（`DICE_CONFIG.support`）、`label#diceColorLabel`（demo のみ）「色のプレビュー」+ `select#diceColorActor`（aria-label「ダイスの色」、`GM · 赤`, `イネス · 青緑` …）、`.dice-table`（`span.dice-label`「D20 · 20面ダイス」、`div#die.die` 180×180 > `img#diceSprite`）、`#diceRecords`（role=status aria-live=polite）、`.dice-buttons`（`#diceClose`「キャンセル」、`#diceRoll.primary`「GMに判定を頼む」）。
- 寸法: `width:min(500px,92vw); max-height:90svh; overflow:auto; padding:22px`（index.html:33）。
- `#diceRoll`: busy=true、各操作 disabled。draft に対し判定（battle: `resolve`、cache: `resolveCache(d20, support)`、demo: d20 目標10）。各記録ごとに色設定 → 回転演出 → 記録行 `名前：n ＋ bonus ＝ total ／ 目標T · 成功|代償つき成功|失敗` + `<small>source</small>`。demo 以外は state 確定・ログへ GM 判定行と結果（result）・追随台詞。最後に `#diceIntro`=「GM：判定が終わりました。」/demo「演出テスト完了。ゲーム状態は変更していません。」、`#diceRoll` hidden、`#diceClose`「閉じる」。例外時はメッセージを records に。
- busy 中は Esc（cancel）を抑止（battle.js:60）。close で session++、busy 解除、render。
- 乱数: `crypto.getRandomValues` の棄却法で 1〜20（battle.js:2）。
- 実行中の `#status`=「GMが判定しています…」（view.js:118）。

### 3.12 GM マスコット `#gmdrag`（ui.js:101-108, core.js:44-49）
- 開いた会話欄の `.gm-stage`（92×166）内をドラッグ移動（左ボタン、pointer capture）。座標 gmX（左）/gmY（下）を 8px マージン内にクランプ。移動中 `.walking`（200ms 後に解除）。
- キー: 矢印 ±10px（Up で上へ）（ui.js:106）。畳み時 disabled、中央下 8px 固定、`.right`。
- 中心が右半分なら `.right`（画像反転なし `scaleX(1)`、通常 `.gm-art{transform:scaleX(-1)}`）（index.html:18）。
- GM 発言（kind gm）で `speakGM`: 吹き出しテキスト設定・`.talking` 10000ms（`GM_SPEECH_MS`）。吹き出しは CSS で常時非表示（§2.2）。アニメは §5.4。

### 3.13 結末画面（scenario.js:426-429, view.js:81-118）
- phase `end`: `#phase`「結末」、`#place` 撤退なら「坑道から撤退」/他「灯りが戻る」、`#objective`「仲間と一緒に、村へ帰ろう。」、背景 `s3_chamber_v2`、`#figures` hidden、札・出口・sceneTools なし、`#actions` に `<div class="end">`（撤退「仲間を連れて坑道から撤退した。作戦を変えて、もう一度挑もう。」/勝利「胸の枠が外れた。心石を戻すと、番人はランタンを掲げ、坑道の灯りが戻った。」）。`.end`: padding 18px, border-left `3px solid var(--blue)`, bg panel, line-height 1.8（index.html:5）。行動ボタンなし。再開は設定の「最初から」のみ。

---

## 4. 描画規則

### 4.1 フェーズ別の各領域（view.js:78-119）
`battle = phase==='battle' || battlePreview`、`end = phase==='end' && !battlePreview`。
| 領域 | 探索・未点灯 | 探索・点灯 | 戦闘 | 結末 |
|---|---|---|---|---|
| `#phase` | 探索 | 探索 | 連携戦 | 結末 |
| `#place` | 部屋名 | 部屋名 | 灯りの番人 | 坑道から撤退 / 灯りが戻る |
| `#objective` | 塵あり「蒼白い塵が、壁の一角へ流れている。」/なし「真っ暗だ。灯りがあれば、周囲を確かめられる。」 | 部屋・状態別（scenario.js:427） | 胸の枠を開き、心石を戻す。 | 仲間と一緒に、村へ帰ろう。 |
| 背景 | `ROOMS[room].image`（entry `mine_entrance_unlit` / hall `s2_junction` / drain `s7_inner_chamber`） | 同左 | `s3_chamber_v2` | `s3_chamber_v2` |
| `.scene.dark` | あり（暗幕 .94、立ち絵 .12） | なし | なし（プレビューも外す） | lit 依存 |
| 札 `#points` | 入口で cache 発見済みなら cache のみ + 塵 | 部屋 targets + 発見 | なし | なし |
| `#exits` | hidden | 表示 | hidden | hidden |
| `#sceneTools` | scout | scout | なし | なし |
| `#tele` / `#bossimg` | hidden | hidden | 表示 | hidden |
| `#actions` | 灯り用意の案内 | 周囲/札の行動 | 作戦 UI | `.end` |
| `.world.battle-world` | — | — | 付与 | — |
`.scene.drained`: 点灯・排水室・排水済み（scenario.js:431）。`.scene.battle-scene` は付与のみで CSS 規則なし。
`battlePreview`: h3「あなたの行動 · 表示確認」+ p「戦闘画面のプレビューです。進行状態や持ち物は変わりません。」+ disabled ボタン（study/aid/throw/retreat の所持分）。会話状態行は空、入力類 disabled、`#status`=プレビュー文言。

### 4.2 仲間ストリップ `#party`（view.js:94）
- PEOPLE 順に4人（イネス、ブロム、ガレス、マレン）。`button.person[data-person]`、自分に `.mine`。
- 内容: 立ち絵縮小 img（alt 空）、`strong` 名前、`small` `<role 末尾（斥候/盾役/盗賊/魔法使い）> · <現HP>/<最大HP>`、HP メーター（3px、`role=progressbar` aria-label「<名>のHP」 valuemin 0 valuemax 最大 valuenow 現在、幅 = clamp(0..100%)）、MP メーター（`role=img` aria-label「<名>のMP：数値未設定」、中身なし）。
- 押下で人物シート。最大HP: イネス12・ブロム18・ガレス15・マレン12（scenario.js:4-7）。

### 4.3 立ち絵（DOM フォールバック、view.js:3-15, scenario.js:37-41, 637-640）
- 探索: 自分以外の3人。x スロット `[30,51,73]` をシャッフル + ±3 の揺らぎ、z = .1〜.85 乱数。戦闘: 4人 `[26,52,40,13]` ±1.5、z 固定 `{ines:.3, brom:.08, gareth:.2, lydia:.5}`。部屋/フェーズが変わる時のみ再抽選。
- 投影: `scale=1-z*shrink/100`、`bottom=4+z*rise (%)`、`height=size*scale*(heightCm/172) (%)`、`z-index=round((1-z)*100)`。身長 イネス155・ブロム135・ガレス184・マレン172。
- 番人 `#bossimg`: z .8, x 80 → `left:x%`, `bottom:(bottom+10)%`, `height:height*1.28%`。
- 立体舞台有効時は `.stage-ready` で DOM 立ち絵は非表示（§2.6）。探索中の 3D 側には自分（x42, z.03）も加える（scenario.js:413）。

### 4.4 会話ログ（core.js:50-52）
- `say(who,text,kind,result)` が `chat` に push し `#log` に追記（DOM 直接、再描画しない）。
- kind: `''`(AI/人物)、`you`（自分）、`gm`、`error`、`private`（定義上はあるがログ呼出元なし）。`result=true` は `.result` + `b` 内に `span.entry-tag`「実行結果」。
- 顔アイコン: result でなく、kind が you（→自分）または who が人物名で始まる（`名前` or `名前（…`）かつ kind が error/private/gm でない場合。`.talk` = 丸顔 40px（画像を CSS で拡大・オフセットして顔だけ表示, index.html:62 `.face-<id> img`）+ `.bubble`（中に `b` 話者、本文）。you は右寄せ（row-reverse）。それ以外は `b` + テキスト。
- GM 発言は `.entry.gm`（左 amber 線、名前 amber）+ マスコットが話すアニメ（吹き出しは非表示）。舞台上の吹き出しは無い。人物発言は `stageView.speak(id)` でピンスポットのみ（core.js:51）。→ 発言の全文はログだけに出る（重複表示なし）。
- エラー: who「接続・応答の確認」、本文 `<message> ゲームの状態は保持しています。`、kind error（赤）（ai.js:245）。
- 畳み時 kind≠you で未読 +1 → トグルに反映。
- 初期ログ【実測】: GM 導入1件（`entry gm`）+ AI 3件（`entry  talk`）。

### 4.5 自動スクロール
- `say`: kind `you` は常に最下部へ。それ以外は追記前に「最下部から 80px 以内」なら追従（core.js:51）。
- `renderNow`: 開始時に同条件（≤80px）を記録し、終了時に追従（会話欄が開いている時のみ）（view.js:79,118）。
- 畳み→開く時は常に最下部（ui.js:98）。
- `.log{overflow-anchor:none}`。

### 4.6 busy 状態
- `run(task)`（ai.js:245）: busy 中は無視。busy=true → render → 実行 → 例外はエラーログ → busy=false → render。generation が変わっていたら後処理しない。
- busy 時 disabled: 送信・textarea・宛先 radio・出口・`[data-act]`・作戦ボタン群・select・↑↓・共有ボタン・シートの入力/ボタン/装備/使用・地図チャット・`#aiConnection`・`#battlePreview`。マイク開始・役パネル開始も拒否。
- `#status`: プレビュー中 >（busy かつダイス開→「GMが判定しています…」／busy→「AIの仲間が考えています…」）> API 可「AI接続済み。仲間に話しかけてみてください。」> 不可「AI未接続。GMを選んで相談すると再試行できます。」。初期 HTML「AIの接続を確認しています…」。`apiReady = (GET /api/model-info).ok`（ui.js:142）。

### 4.7 調査札の配置と衝突回避（view.js:16-42, 52-61, ui.js:110-120）
- `TARGET_CLEARANCE = 8`（px, view.js:17）。
- `freeLabelPosition(origin,size,bounds,obstacles)`: 候補 = origin + 12px 格子（x,y ともに 12〜bounds−size−12）。距離 `dx²*1.5 + dy²` 昇順に並べ、外周 8px 内に収まり、どの障害物とも `TARGET_CLEARANCE` を足した矩形で重ならない最初の点。無ければ origin（view.js:19-24）。
- DOM モード（`placeTargetLabels`）: 障害物 = 各 `.scene-actor` の img の実描画矩形（contain 比率で縮めた下揃え矩形）+ `.scenehead` + `#exits`（hidden/高さ0は除外）。origin = `TARGETS[t].x%,y%` を px 化。配置した札は順に障害物へ追加（後の札は前の札を避ける）。
- 3D モード（`placeStagePoints`）: origin = `stageView.project(target)` の x を札幅で中央寄せ（8px 内にクランプ）、y はそのまま。障害物 = `stageView.actorRects()` + scenehead/exits。投影不可視なら札 hidden。塵ボタンも投影位置へ。選択中の札が見えなければ `#actions` hidden。
- 行動パネル（contextual）: origin = 札の左端 x、札下端 +8px（12px マージンでクランプ）。障害物 = `.scene-actor,.scenehead,[data-target],#exits,#sceneTools`。同じ freeLabelPosition（view.js:52-61）。
- 再配置トリガ: render 毎、立ち絵 img onload、`#sceneEffects`/`#scene` の ResizeObserver（ui.js:48,107）、stage のコールバック（index.html:93）。

### 4.8 場面転換（view.js:62-77）
- キー `phase:room:outcome:battlePreview` が変わったとき。初回・`sceneFadeMs=0`・reduced-motion は即時描画。
- 探索→探索の部屋移動（プレビューなし）: `stageView.revolve()` が使えれば背景板の半回転（`revolveSeconds 3`）。`.revolving` 中は旧札と出口を `visibility:hidden`（差替後 `.revolve-swapped` で札は表示、出口は回転中ずっと隠す）、札は pointer-events none（index.html:12-13）。
- それ以外: 暗転。`out = round(sceneFadeMs*0.42)` ms で `filter:brightness(0)` ease-in → 描画 → `back = sceneFadeMs−out` ms で brightness(1) ease-out。既定 600ms → 252/348ms。転換中の render は保留し終了後に1回実行。

---

## 5. 演出

### 5.1 ダイス（DICE_CONFIG scenario.js:561-578, battle.js:37-49, index.html:33）
| 項目 | 値 |
|---|---|
| duration（転がり） | 1250 ms |
| landedDuration（出目表示） | 1050 ms（reduced-motion 80 ms） |
| frameInterval（回転画像切替） | 55 ms |
| cacheSkill / support / retry | 3 / 2 / 2 |
| target / partial | 10 / 5 |
- 画像: 回転 `images/d20/d20-red-00..15.png`（16枚循環）、停止 `d20-stop-01..20.png`。全36枚を事前 decode、失敗時「ダイス画像を読み込めませんでした。再度お試しください。」。
- 手順: クラス除去 → red-00 → `.rolling` 付与（`d20-jump` 1250ms `cubic-bezier(.2,.8,.15,1)`、影 `d20-shadow` ease-out）、55ms ごとに画像送り → 終了で `.landed`（`d20-land` .42s ease-out）、20 で `.critical`（drop-shadow `0 0 14px #ffd13f`, `0 0 22px #ff7900`）、1 で `.low-roll`（`0 0 16px #e22525`）→ landedDuration 待機。
- keyframes: `d20-jump` 0% none / 20% translateY(-52px) scale(.94) / 62% −12px scale(1.07) / 82% 0 scale(.96) / 100% none。`d20-shadow` 0,100% scaleX(1) op .48 / 22% scaleX(.5) op .16 / 82% scaleX(1.3) op .62。`d20-land` 0% translateY(-8px) scale(1.06) → none。
- 転がり中: GM マスコット `.dice-throw`（`gm-talk .2s` 無限）、`.dice-panel:has(.die.rolling) .dice-head img` 同アニメ。
- 色（DICE_COLORS scenario.js:386）: ines hue180「青緑」、brom 35「琥珀」、gareth 280「紫」、lydia 210「青」、gm 0「赤」。hue≠0 は `#die{filter:url(#dice-color-<id>)}`。フィルタ = 赤成分マスク `feColorMatrix` alpha 行 `3 -4 -1 0 0` → その部分だけ `hueRotate(hue)`、他は原色で合成（battle.js:59）。
- 色の選択: cache→gareth、battle→最初の非 aid/cover 行動者（なければ gm）、demo→gm（select で変更）。判定ごとに `setDiceActor(r.id)`。sprite alt「<色名>の20面ダイス[：出目]」。

### 5.2 天候・光（FX_DEFAULT scenario.js:579, LIGHTNING_CONFIG 581-583, ui.js:41-85, scenario.js:585-599）
- 既定: dust 28, flame 35, fog 22, rain 32, wind 25, lightning 55, outdoorsOnly true, paused false。値は再読込で戻る。
- canvas `#sceneEffects`: DPR 上限 1.5、描画上限 30fps（33.3ms）、`time` は秒（1フレーム最大 .1s 加算、`fx.paused` または reduced-motion で停止、タブ非表示で描画しない）。ResizeObserver で再サイズ。疑似乱数 `noise(i)=fract(sin(i*127.1+311.7)*43758.5453)`。
- 屋外 = `room==='entry' && phase==='explore' && !battlePreview`。天候描画は `!outdoorsOnly || 屋外`（霧）、雨と雷は屋外のみ。
- 描画順: シナリオ効果 → 霧 → 塵 → 雨 → 雷。
  - 蒼い塵（`blueDust()` 時）: 48粒、周期 `time*.12`、ランダム位置→cache 投影点（3Dなし時 w*.82,h*.44）へ収束、`rgba(177,226,255,.25+t*.65)`、半径 1〜2.5、shadow `#9cdfff` blur 7。
  - 灯石: `(w*.4,h*.9)` 半径 `h*.28` の radial `rgba(166,223,255,.25)`→0。
  - ランタン（lit && flame>0）: マレン（3D 投影 or DOM 立ち絵の 62%/77% 位置）中心、flicker = `(sin(8.7t)*.35+sin(13.1t)*.18+sin(2.9t)*.47)*flame/100`、半径 `min(w,h)*(.58+flicker*.07)`、stops `rgba(255,175,62,.2+f*.08)` / .35 `rgba(235,135,36,.1+f*.04)` / 1 透明。
  - 霧: 全面 `rgba(177,195,195,amount*.08)` + 6 個の楕円（scaleY .45）radial `rgba(191,207,207,amount*.26)`、x 速度 `.006+wind*.00008`、半径 `w*(.28..44)`。
  - 塵（lit）: `fx.dust` 粒、`rgba(249,222,164,.12..57)`、半径 .7〜2.2。
  - 雨（屋外）: 本数 `round(rain*2.4)`、slant `wind*.18`、線幅 .8、長さ 9〜24、落下速度 `.65..1.1`/s（画面比）、`rgba(186,212,224,.15..45)`。波紋 `round(rain/12)` 個、下端 90〜98%、楕円 2+8age × 1+2age、`rgba(186,212,224,(1-age)*.24)`。
- 雷（LIGHTNING_CONFIG）: firstDelay 3.5s、間隔 7〜15s 一様乱数、減衰 .75s。`lightningLevel(age)=(1-age/.75)²`（範囲外0）。自動落雷条件: 屋外 && rain>0 && lightning>0 && !paused && !reduced。部屋/状態が変わるとタイマーをリセット。flash = level*lightning/100（reduced は ×.35）。描画: 全面 `rgba(207,227,255,flash*.3)`、稲妻 7 節（起点 x `w*(.08..33)`、長さ `h*.34`、線幅2、`rgba(230,244,255,min(1,flash*2))`、shadow `#bce3ff` blur 12）+ 枝1本（線幅1）。同時に `#scene` に `--lightning-flash` と `.lightning-flash`、暗幕 opacity `.94 − flash*.82`（暗時のみ、transition なし）（index.html:26）。「雷光を試す」は reduced 時 .75s 後に手動で消す（ui.js:44）。

### 5.3 暗幕・転換
- `.scene:before` `#020609` opacity 0→.94（`.dark`）`transition:opacity 1.2s ease`；`.figures` opacity .12 `transition 1.2s`（index.html:7-8）。
- `.dark` 時 `.scene-effects` z-index 4（暗幕の上に塵・灯石を描く）（index.html:26）。

### 5.4 GM マスコット・ログのアニメ
- 待機 `gm-idle 3.6s ease-in-out infinite`（50%: translateY(-2px) rotate(1deg)）、発話 `gm-talk .65s`（50%: −3px rotate(-2deg)）、歩行 `gm-walk .32s`（0/100% rotate(-4deg)、50% −5px rotate(4deg)）、瞬き `gm-blink 4.8s infinite`（92%/96% scaleY(0)、94% scaleY(1)。目は `.gm-eye` 位置 top15.2% left42%/61.5% 幅5.8% 高2.5% `#efb573`）（index.html:16）。
- ログ新規 `.entry` `appear .2s ease-out`（opacity 0, translateY(4px) から）— no-preference 時のみ（index.html:5）。

---

## 6. 固定文言（UI）
AI 生成の発言・プロンプト本文（`ask(...)` の system 文字列、`ROLE_PROMPT`、`EXPLORATION_INTENT_PROMPT` 等）と、GM がログへ出す進行メッセージ（ai.js/battle.js/scenario.js の `say('GM',…)`）は除外。抽出は literal を正規表現で機械抽出し照合済（`spec/strings.txt` 453行）。

### 6.1 ページ・ヘッダー・舞台
- `<title>`: 坑道の向こう — 連携プレイ試作（index.html:3）
- h1: 坑道の向こう ／ span: あなたと、3人のAIの仲間（index.html:78）
- 初期 `#place` 封じられた石扉、`#objective` 扉の先から、重い金属音がする。、`#phase` 探索（index.html:79。render で即上書き）
- `#phase`: 探索／連携戦／結末（view.js:83）
- aria: 舞台の左右を見渡す／左を向く／右を向く／自分の能力と道具／シーンの出口／仲間の能力（index.html:79）、`<<` `>>`
- 番人 alt: 灯りの番人（index.html:79）
- 部屋名: 坑道入口／石扉の広間／排水室（scenario.js:9）
- 札: 壁の傷／隠し収納／古い台車／途切れたレール／石扉／壁の刻み／操作輪／水溜まり（scenario.js:13）、変化後 開いた収納／開いた石扉／乾いた排水口（scenario.js:432）
- 出口: `<部屋名>へ`／奥へ続く通路／下りの通路／入口へ戻る通路／上りの通路（scenario.js:11, view.js:93）
- 寄り絵 alt `<札名>の外観`、caption 最初に見えた外観（scenario.js:183）
- 塵 aria: 蒼白い塵が集まる場所を調べる（scenario.js:601）
- 舞台 canvas aria: 舞台。ドラッグで上下と左右を見渡す。左右の矢印キーで左右を向く（stage.js:13）
- 舞台失敗: 立体舞台を起動できないため、従来のシーン表示を使います。（index.html:110）
- 見出し・目的文: scenario.js:426-427（§4.1 表）。予告: `予告：前衛を薙ぎ払う（各N）`／`魔法使いへ光線（N）`／`番人の枠 a/b　ラウンド N`（scenario.js:428）

### 6.2 行動パネル（scenario.js:429,433, view.js:96-112）
- h3: 暗闇の中を探る／灯りを用意する／周囲を見渡す／<札名>／あなたの行動／作戦の順番／あなたの行動 · 表示確認
- p: 塵の流れを目で追い、気になる場所を調べられます。／手元のランタンを灯して、周囲を確かめましょう。／灯りを持つ仲間に話しかけてみましょう。／自分でできる行動を選べます。仲間への依頼は会話で伝えます。／調べたい場所を選ぶか、仲間に行き先を話して進めます。／敵の予告を見て、自分の行動を選べます。固定のリーダーはいません。／各自が自分の行動を選び、順番を提案します。実行前に本人たちが連携を確認します。／戦闘画面のプレビューです。進行状態や持ち物は変わりません。
- 置換文: イネスができること／今、自分でできる操作はありません。仲間に相談できます。／調査した結果を記録から確認できます。仲間への相談もできます。（view.js:98,101）
- ボタン: 調査結果を見る／石扉の奥へ進む／仲間と連携を調整／この行動で進める／選び直す／↑／↓／× ; aria: 調査地点の操作を閉じる／N番の行動を上へ／N番の行動を下へ／イネス自身の行動
- 票: あなたが選んだ行動／本人が了承／本人が再相談を希望／本人の確認待ち
- 連携欄: GM：連携の確認／現在の行動と順番に、ルール上の食い違いはありません。／順番や行動を変えると、本人の確認を取り直します。1回の調整で各AIが1回ずつ返答します。
- 結末: 仲間を連れて坑道から撤退した。作戦を変えて、もう一度挑もう。／胸の枠が外れた。心石を戻すと、番人はランタンを掲げ、坑道の灯りが戻った。
- 行動名 `LABEL`（scenario.js:14）: map 地図を広げる, retreat 退路を確保する（撤退希望）, cache_support 収納の解錠を支援する, wait 相談を続ける, scout 周囲の痕跡を探す, douse ランタンを消す, decode 壁の傷の文字を解読する, find_cache 塵が集まる場所を調べる, inspect_etching 壁の傷を調べる, inspect_cache 隠し収納を調べる, open_cache 隠し収納の錠前を外す, use_stone 灯石で足元を照らす, inspect 石扉を調べる, inspect_cart 台車を調べる, inspect_rails レールを調べる, inspect_rune 刻みを調べる, inspect_wheel 操作輪を調べる, inspect_water 水溜まりを調べる, take 鉄の工具を拾う, wedge 工具で石扉の隙間を固定する, pry 工具で操作輪の引っ掛かりを外す, light ランタンを灯す, hold 操作輪を支える, smash 金槌で石扉を壊す, crawl 隙間に入り、留め具を外す, unlock 鍵を外す, support 石扉を支える, read 壁の文字を読む, study 弱点を見抜く, aid マレンを手助けする, throw 投げ縄で攻撃する, cover 前衛をかばう, strike 金槌で打つ, stab 急所を狙う, fire 火球, spark 石つぶて
- `confirm()`: 扉を壊すと大きな音が出て、番人が警戒します。ブロムに頼みますか？（scenario.js:438、ブラウザ標準ダイアログ）

### 6.3 仲間・未共有・会話欄
- 人物: イネス／ブロム／ガレス／マレン、役割 `あなた|AI・斥候|盾役|盗賊|魔法使い`（scenario.js:4-7）
- aria: `<名>のHP`／`<名>のMP：数値未設定`（view.js:94）
- 未共有: `自分の発見 · 未共有N件`／記録を見る／皆に伝える（view.js:112）
- 会話状態: `<名>の申し出：<行動>`／`<名>からあなたへ：<行動>`／（保留中）／`<名>の申し出：地図を広げる`／受け渡しの確認待ち／同意保留文 `<label>の操作は保留です。<名>の反対や疑問を確認しましょう。`（core.js:85-89, ai.js:173）
- h2: 仲間との会話；トグル `>>`/`<<`(+`\n未読 N`)、aria 会話欄を畳む／会話欄を開く(、未読N件)、title 会話欄を畳む／会話欄を開く（ui.js:29）
- 分割線 aria: 会話欄の幅（index.html:79）
- label: `<全員|GM|名>に話しかける`（初期 全員に話しかける）；legend 呼びかけ先；`.recipient-note`（非表示）全員に聞こえ、選んだ相手が返答します。
- 宛先カード: 全員／ブロム／ガレス／マレン／GM
- textarea placeholder: 自分の言葉で話す…；送信 話す；マイク aria 音声で話す／title 押して音声入力；歯車 aria GMのシステム設定を開く／title システム設定；GM aria GMの位置を動かす；吹き出し見出し GM
- 補助: セリフの生成するよ
- 音声状態: このブラウザーは音声入力に未対応です。文字で自由に話せます。／聞いています。もう一度押すと停止します。／編集中の文を残しました。／聞き取った言葉を確認し、自由に直してから「話す」を押してください。／マイクが許可されていません。文字入力で続けられます。／音声を聞き取れませんでした。文字入力で続けられます。／音声入力を開始できませんでした。文字入力で続けられます。（ui.js:126-132）
- `#status`: AIの接続を確認しています…／戦闘画面のプレビュー中。設定のスイッチを切ると元の場面に戻ります。／GMが判定しています…／AIの仲間が考えています…／AI接続済み。仲間に話しかけてみてください。／AI未接続。GMを選んで相談すると再試行できます。
- ログ: 話者接尾 `（あなた）`、`（あなた）→<宛先>`、`（AI）`；タグ 実行結果；エラー話者 接続・応答の確認、接尾 ` ゲームの状態は保持しています。`（core.js:51, ai.js:245,271）

### 6.4 人物シート・地図（sheet.js:3-4,77-112, scenario.js:641,145, navigation.js:117）
- 切替 aria `前のキャラクター：<名>`／`次のキャラクター：<名>`、title `<名>へ`、◀ ▶；閉じる；HP／MP／未設定；aria HP／MP：数値未設定
- タブ: 人物／能力／持ち物／情報・履歴；aria 記録の分類／キャラクターの記録内容
- PROFILE_LABELS: 正式な名前／年齢／種族／出身地／人物像／生い立ち・学び／これまでの経験／冒険の理由；他 呼び名／身長／役割／得意なこと／`<技能>の使い方`／持ち物／`<品>の用途`；STAT_NAMES 筋力／生命力／器用さ／敏捷性／知力／精神力（`（表示用試案）`）
- 人物タブ: あなた自身の設定です。これをもとに仲間へ話せます。／呼び名と役割以外は、本人が話して確認できた情報だけを記録します。／基本情報／項目／記録／まだ聞いていない／得意なこと／詳しい使い方はまだ聞いていない／まだ聞いていない。得意なことを尋ねてみましょう。／人物の経歴は今回の試作用設定です。／話し方／次の発言から反映。再読み込みで戻ります。空欄は既定、呼称は名前。語尾・演じ方は傾向です。／自分の呼び方／相手の呼び方／語尾／演じ方／例：君、お前／例：少し消極的で、控えめに話す／適用／`<名>の話し方を適用しました。`
- 能力タブ: 基本能力の試案／能力／値（3〜18）／表示用の試案です。現在のダイス判定には未連動です。／知っている技能／技能／用途・制約／どんなことが得意か、本人に聞いてみましょう。／火球の残り：N回；クイック `<行動>`(+よう頼む)
- 技能 `SHEET_ABILITIES`（scenario.js:186-191）: ines 痕跡調査「足跡や仕掛け、景色の違和感を探します。」/潜入・工具「狭い隙間に入り、手に入れた工具を使います。」/弱点の観察・支援「敵の弱点を見抜き、仲間の攻撃を助けます。」; brom 力仕事「重い扉や操作輪を支えます。」/破壊「金槌で障害を壊します。大きな音が出ることがあります。」/盾による防護「戦闘で前衛をかばい、受ける被害を軽減します。」; gareth 解錠「鍵や収納の錠前を外します。収納には判定が必要です。」/急所への攻撃「見つかった敵の弱点を狙います。」; lydia 灯りの操作「ランタンを灯す・消すことで、見え方を変えます。」/古代文字の解読「古い文字や魔法の記号を読み解きます。」/攻撃魔法「火球を使います。使い切った後も石つぶてを使えます。」
- 能力値 `SHEET_STATS`（scenario.js:185）: ines 10,11,16,15,13,12 / brom 17,16,10,9,10,13 / gareth 11,12,17,16,12,10 / lydia 8,10,12,11,17,16
- 持ち物タブ: 装備品／使用アイテム／持ち物／状態・用途／操作／知られている品はありません。／詳しい用途はまだ聞いていない／装備中／外して携行中／・抜刀中／・納刀中／`<名>から借りている`／外す／装備する／杖に持ち替える／ランタンを消灯して収納／納める／抜く／使う／使うよう頼む／`<品>の使い方`／探索中に地図を開けます／先に灯りを用意してください／地図を開く／今は使える場面ではありません／使い方を選ぶ／貸している品／借りている人／受け渡しの記録／まだありません。／`<品>の外観`／`所持：<名>`／アイテムの画像を閉じる／×／↗
- 品名 `ITEM_DEFS.name`（scenario.js:24-35）: 投げ縄／金槌／盾／錠前破り／片手剣／ランタン／記録板と杖／古い坑道の地図／鉄の工具／灯石（detail は同所）
- 情報タブ: 本人について知ったこと／まだ聞き取った記録はありません。／あなたが得た情報／本人から聞き取る情報／`発見 N · 共有済み|自分の記録`／この発見を皆に伝える／皆に伝える／まだ発見はありません。／`未共有の記録：N件。内容は本人に相談して聞き取ります。`／共有済みの手がかり／行動履歴／本人が実行した行動と、その結果を記録します。／`N · <部屋> · 自発|<名>の依頼`／`<部屋>へ移動`／`結果：…`／まだ行動していません。／まだ本人から聞いていない調査結果です。（sheet.js:59）
- 連絡欄: 皆に話してみる／`<名>に話しかけてみる`／返答と人物設定を確認しています…／全員に聞こえる会話です。選んだ相手が返答します。／placeholder 調べて分かったことを教えて／この能力で何を調べられそう？／出身や得意なことを尋ねてみる／全員に話す／`<名>に話す`／GMに尋ねる／音声入力は準備中／音声で話す／マイクを押して話し、聞き取った文を確認してから送信できます。
- 地図: `<名>の持ち物へ`／閉じる／`<名>が持つ地図を、仲間と広げています。`／古い地図の記載です。現在も同じ状態かどうかは、訪れて確かめます。／地図を見ながら皆に話してみる／行き先を選んで、仲間に伝えられます。／仲間が考えています…／placeholder 排水室へ行こう／話す；SVG: 坑道見取図／`<名>の携行図　—　坑道の略図`／ここにいる／訪問済み／地図の記載・未訪問／石扉を開いた／水圧が消えた／石扉あり／排水済み／水が溜まっている／実線：通った道　点線：地図の記載　青い印：現在地；desc `…：現在地、訪問済み|地図の記載、未訪問…。行き先は会話で伝えられます。`

### 6.5 システム設定（index.html:82-87, ui.js:5-8,24,34）
- GMのシステム設定／× aria システム設定を閉じる
- ゲーム管理／最初から／現在の進行を消します。実行前に確認します。／今の進行を消して、最初から始めますか？／進行を消して開始／キャンセル
- クロニクル／この卓で交わした会話とGMの記録です。未共有の個別情報は含みません。／aria クロニクルの内容／Markdownで出力／Markdownファイルを出力しました。；ヘッダー `# クロニクル：坑道の向こう` + `この卓で交わした会話とGMの記録（mock3簡易版）。`
- AIの比較／会話に使う接続先／Claude Haiku 4.5／クラウドGemma（確認中）／ClaudeはAnthropicへ、GemmaはGoogleへ会話と判断用の情報を送信します。進行を保ったまま切り替えられ、選択は再読み込みで既定に戻ります。／接続先を確認しています…；動的: `<Claude|ローカル|既存接続> · <model>`／`クラウド · <model>`／`Google API · <model>`／`…で試遊中。`+`Gemmaへ切り替えられます。`|`GemmaはAPIキー未設定です。`／`直近のAI通信：<Gemma|Claude|既存接続> · N ms · 応答あり|通信エラー · 入力 N / 出力 N トークン`／`形式違反で読み飛ばした回数：N回 · 直近の発言：N呼出 · 合計 N ms`
- この試作について／UIと連携の試作です。あなたはイネスを操作します。仲間の名前を押すと能力を確認できます。AIは発言と行動を選び、結果はゲームのルールで確定します。進行はこの画面内だけで共有され、再読み込みすると戻ります。
- 音声設定／サウンド・音量・TTS（読み上げ）・STT（音声入力）／音声入力は対応ブラウザーのマイクボタンから使えます。通話・TTS・サウンドは未接続です。
- 開発・調整／演出の調整を有効にする／戦闘画面を表示する／表示だけを切り替えます。戦闘の操作と会話はできません。／ダイス演出を試す
- 演出: 演出テスト・調整／漂う塵／ランタンの揺らぎ／霧の濃さ／雨の量／風の向き・強さ／雷光の強さ／奥の縮小率／奥の足元の高さ／人物の基準サイズ／雷光を試す／立ち位置を配置し直す／霧は入口（屋外）のみ／動きを停止して比較／演出を初期値へ／塵とランタンの光は点灯後に表示。雨のある入口では雷光が時折走ります。坑道内では雷光を表示しません。天候はゲーム進行を変えません。値は再読み込みで戻ります。
- 舞台・戦闘・照明: §3.9 の表のラベル、`秒`/`°`/`%`/`倍` 接尾、注記3文、リセット3種、select 選択肢

### 6.6 ダイス（index.html:90, battle.js, scenario.js:604-605）
- GMの判定／alt GM／D20 · 20面ダイス／alt 赤い20面ダイス／色のプレビュー／aria ダイスの色／`<名> · <色名>`／イネスが照明と見張りで支援（＋2）／キャンセル／GMに判定を頼む／閉じる
- intro: 演出テスト · ゲーム進行には影響しません。／ガレスが挑戦します。支援するか決めてください。／決めた作戦の順に判定します。／GM：ダイスを振ります。／`GM：<名>の判定です。`／GM：判定が終わりました。／演出テスト完了。ゲーム状態は変更していません。
- plan（cache）: `収納の解錠：D20 ＋ b ／ 目標10。成功 s％・代償つき p％・失敗 f％。5〜9なら開くが音が響き、奥の敵が警戒します。4以下なら開かず、音が響きますが再挑戦に＋2。報酬は灯石1個です。`
- plan（battle）: `<名>：<行動> → …。目標T。見抜く＋a、弱点発見後の攻撃＋b、支援後の次のマレンの攻撃＋c（支援は重複しません）。攻撃失敗はダメージ0。ラウンド後に敵が残れば反撃します。かばう・支援・退路の確保は振らずに実行します。撤退希望者は自分への反撃を半減。全員が撤退を選んだ場合は反撃なしで撤退します。`（値は `BATTLE_RULES` scenario.js:350）
- plan（demo）: D20、補正なし、目標10。出目と計算・結果の表示を試します。
- 記録: `<名>：n ＋ b ＝ t ／ 目標T · 成功|代償つき成功|失敗`、source 補正なし（demo）；alt 20面ダイスを振っています／`<色名>の20面ダイス：n`
- エラー: ダイス画像を読み込めませんでした。再度お試しください。

### 6.7 役の下書き（index.html:80, ai.js:300-310）
- イネスとして、どう話そう？／× aria 演技のメモを閉じる／言葉に迷ったときの下書きです。崩しても、冗談を足しても、全部言い換えても大丈夫。／言いたいこと・今の気分／placeholder ブロムに扉を支えてほしい。少し茶化しながら頼みたい／言葉を手伝ってもらう／演技の下書き · 自由に書き直せます／placeholder ここに自分で書いても大丈夫です／生成しても、仲間への発言や行動にはなりません。／入力欄に写す／閉じて、自分の言葉で話す
- 状態: 下書きは演技のきっかけです。どう話すかはあなたが決めます。／言葉のきっかけを考えています…／意図が変わったため、古い下書きは使いません。もう一度頼めます。／途中からアドリブしても、全部言い換えても大丈夫です。／編集中の下書きを残しました。必要ならもう一度頼めます。／`下書きを作れませんでした。<msg> 自分で書いて続けられます。`／場面が変わりました。今の場面から開き直してください。／元の入力欄が変更されています。下書きを手で写すか、開き直してください。

---

## 7. アクセシビリティ

### 7.1 ARIA
- `html lang="ja"`（index.html:2）。
- `#log` role=log aria-live=polite aria-relevant=additions；`#status`, `#conversationState`, `#mainVoiceStatus`, `#aiModelStatus`, `#aiTiming`, `#aiFallbacks`, `#chronicleStatus`, `#roleStatus`, `#voiceStatus`, シート連絡欄 p, `#sheetMicNote`, `#mapStatus` は role=status；`#diceRecords` role=status aria-live=polite；`#resetConfirm` role=alert。
- `#conversationResize` role=separator aria-orientation=vertical aria-valuemin 240 max 420 now（動的）tabindex 0。
- `#conversationToggle` aria-controls=conversation aria-expanded（動的）。`#systemOpen` aria-controls=systemPanel。
- 調査札 aria-pressed、シートタブ aria-pressed、マイク aria-pressed（録音中）。アイテムリンク aria-expanded + aria-controls。
- dialog: `#rolePanel` aria-labelledby=roleTitle、`#systemPanel`=systemTitle、`#dicePanel`=diceTitle、`#sheet` は人物時 sheetTitle／地図時 mapHeading を動的設定。
- 装飾: `#sceneEffects` aria-hidden、SVG アイコン aria-hidden、↗ aria-hidden、目 aria-hidden、人物ストリップ・宛先 img alt 空。
- progressbar（HP）/img（MP 未設定）。地図 SVG role=img aria-labelledby。
- `.recipients legend` は視覚的非表示（スクリーンリーダー用に残す）。

### 7.2 フォーカス
- `:focus-visible` 輪郭: button/textarea 2px blue offset 3（index.html:53）、input 3px blue offset 3（index.html:5）、宛先カード 2px blue offset 2、シート切替 2px blue offset 2、`.sheet-content` 2px blue offset -3、話し方 input `:focus` 2px amber offset 1、履歴 li `:focus` 2px amber offset 5。
- 移動/復帰: 札選択→パネル内先頭操作；パネル閉→元の札；人物切替→同ボタン；詳細開→`#itemDetailClose`、閉→リンク；調査結果→履歴 li（preventScroll 後 center scroll）；役パネル開→`#roleIntent`、写す→元入力欄；リセット確認→`#resetCancel`、キャンセル→`#reset`；refreshOpenSheet は入力欄 focus を維持。dialog は `showModal` のネイティブ focus 管理（他は【不明: 明示 focus 指定なし】）。
- Esc: シートの詳細を先に閉じる（sheet.js:97）、contextual パネルを閉じる（view.js:107）、dicePanel は busy 中 cancel を抑止（battle.js:60）、rolePanel cancel でリクエスト破棄（ai.js:309）。他 dialog はネイティブ。
- キー操作: 分割線（←→ Home End）、GM（矢印）、舞台 canvas（←→ Home）、textarea Enter 送信。

### 7.3 reduced-motion
CSS:
- `prefers-reduced-motion:no-preference` のときだけ `.entry` 出現アニメ（index.html:5）。
- reduce: `.scene:before,.figures{transition:none}`（index.html:10）；`.gm-drag,.gm-eye{animation:none!important}`（index.html:16）；`.die.rolling img, .die.rolling:before, .die.landed img, .gm-guide.dice-throw .gm-drag, .dice-panel .dice-head img{animation:none!important}`（index.html:33）。
JS（`matchMedia('(prefers-reduced-motion: reduce)')`）:
- 場面転換フェード・回転を行わず即時（view.js:68）。
- 演出の時計停止（静止画）、自動落雷なし、雷強度 ×.35、手動雷は .75s 後に消去（ui.js:44,56-57,84）。
- ダイス: 転がり省略、着地表示 80ms（battle.js:45,48）。
- 番人移動 即時（battle.js:31）。舞台パン・注目は即時（stage.js:152,170）、照明フェード即時（stage.js:56）。

---

## 付記: 不明点・注意
- `.gm-bubble` は最終 CSS で非表示。GM の吹き出しを出す意図か否かは【不明】。記述どおり非表示で再現する。
- 死にCSS（該当要素なし）: `header button`、`#door`、`#rune`、`.map`、`.mapline`、`.sheetimg`、`.exploration-basics`、`.proposed-actions`。（`.note` は「この試作について」の `p.note` で使用中、index.html:86。）
- 画像パス: 人物 `../replay/img/<ines|brom|gareth|maren>.webp`、背景 `../replay/img/<image>.webp`、番人 `../replay/img/guardian_rampage.webp`、GM `images/gm_mascot.png`、寄り絵 `images/investigation/<target>-v1.png`、品 `images/items/<id>-v1.png`、ダイス `images/d20/…`。
- 寸法の【実測】は API 未接続・初期状態・Chrome 系（Claude Browser）で取得。≤900px ではページが縦スクロールし、表示幅はスクロールバー分（15px）狭くなる。
