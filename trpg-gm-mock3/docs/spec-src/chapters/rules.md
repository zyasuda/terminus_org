# 坑道の向こう（trpg-gm-mock3 prototype）ゲームルール再実装仕様

対象: `trpg-gm-mock3/prototype`（HEAD 76dfd4a 時点、未コミット変更は docs/ のみ）。
行番号は `scenario.js` / `engine/*.js` の物理行。1行に多数の文がある（minified風）ため、行内の該当文を引用で特定する。
略記: `S`=scenario.js、`core`=engine/core.js、`items`=engine/items.js、`nav`=engine/navigation.js、`battle`=engine/battle.js、`ai`=engine/ai.js、`sheet`=engine/sheet.js、`view`=engine/view.js、`ui`=engine/ui.js。
「検証済み」= vm上でソースを読み込み実行して確認（作成時の検証スクリプト）。「不明」= ソースから確定できない。

---

## 0. 固定データ

### 0.1 人物 PEOPLE（S:3-8）
| id | name | hp | heightCm | 担当 |
|---|---|---|---|---|
| ines | イネス | 12 | 155 | 斥候。人間操作（core:3 `CONTROL={ines:'human',brom:'ai',gareth:'ai',lydia:'ai'}`） |
| brom | ブロム | 18 | 135 | 盾役 |
| gareth | ガレス | 15 | 184 | 盗賊 |
| lydia | マレン（内部IDはlydia） | 12 | 172 | 魔法使い |

`humanId()` = CONTROLが`human`の最初の人物、無ければPEOPLE[0]（core:7）。`aiPeople()`=PEOPLE順でAIの人物（brom,gareth,lydia）。

### 0.2 部屋 ROOMS（S:9）・通路 PASSAGES（S:11）・地図 MAPS（S:12）
- entry 坑道入口: targets `cart,rails`、links `hall,drain`、image `mine_entrance_unlit`
- hall 石扉の広間: targets `door,rune`、links `entry`、image `s2_junction`
- drain 排水室: targets `wheel,water`、links `entry`、image `s7_inner_chamber`
- PASSAGES: entry→hall `奥へ続く通路`、entry→drain `下りの通路`、hall→entry `入口へ戻る通路`、drain→entry `上りの通路`
- MAPS.lydia_map.rooms = `['entry','hall','drain']`、caption `古い地図の記載です。現在も同じ状態かどうかは、訪れて確かめます。`
- 戦闘・終了の背景 image は `s3_chamber_v2`（S:430）。

### 0.3 調査対象 TARGETS（S:13）
etching 壁の傷 / cache 隠し収納 / cart 古い台車 / rails 途切れたレール / door 石扉 / rune 壁の刻み / wheel 操作輪 / water 水溜まり（x,yは表示座標%）。

### 0.4 CLUES（S:42-46）
- `etching`: `壁の傷の中に、古い文字らしい刻みがある。`
- `darkness`: `刻みは「灯を伏せよ。蒼き塵は、隠された場所へ帰る」と読める。`
- `cache_lock`: `隠し収納には小さな錠前がある。錠前破りが使えそうだ。`

### 0.5 LABEL（S:14）・ACTION_TARGET（S:15）・ITEM_REQUIRED（S:36）
ACTION_TARGET: decode/inspect_etching→etching、inspect_cache/open_cache→cache、inspect/wedge/smash/crawl/unlock/support→door、inspect_cart/take→cart、inspect_rails→rails、inspect_rune/read→rune、inspect_wheel/pry/hold→wheel、inspect_water→water。
ITEM_REQUIRED: throw→rope、cover→shield、strike→hammer、smash→hammer、stab→dagger、unlock→picks、open_cache→picks、fire→staff、spark→staff、light→lantern、douse→lantern、use_stone→lampstone、pry→ironbar、wedge→ironbar。

---

## 1. 状態モデル（`initial()` S:19）

`state` はグローバル1個（core:28 `let state,...`）。リセットは `reset()`（ui:136）: `generation++; state=initial(); busy=false; target=null; chat=[]; plan=[]; actionHistory=[]; planReview=null;` ほか会話用一時変数（humanRequests, pendingTransfer, explorationOffers, latestProposal, announcedPoints, consents, recipient='all'）を初期化し、`introduceInventory()`（S:211）を実行。

| フィールド | 初期値 | 意味 | 書き込み元 | 不変条件・備考 |
|---|---|---|---|---|
| profiles.known[viewer][subject] | 全員について `['name','role']`、lydiaだけ `['name','role','item0']`（S:200） | viewerが知るsubjectの人物設定キー | `revealProfile`（sheet:14） | 一度知ったキーは消えない。`height`と本人は常に既知（sheet:12 knowsProfile）。revealは**全viewerに同時**に追加 |
| profiles.history | [] | 公開された設定の記録 {id,key,source,label,value} | revealProfile（name/role以外・重複なし） | |
| profiles.feedback[id] | {} | 人物別のGM注記文字列 | checkedReply/requestMap等 | 表示用 |
| items | 下記§3.1 | 品ごとの {owner,holder[,equipped][,drawn]} | equipItem/drawItem/transferItem/acquireItem | 品は増えるのみ（ironbar, lampstone）。削除なし |
| transfers | [] | 受け渡しイベント {item,from,to,mode,room} | transferItem（items:86） | 追記のみ |
| reports | [] | 共有済み報告 {id,target,room,version} または {id,target:null,room,knowledge:index} | publishReport（core:56-66） | 重複なし |
| navigation.known | ['entry'] | 地名を知っている部屋 | move（S:131）、readMap（nav:9） | 追加のみ |
| navigation.maps | [] | 広げた地図ID | readMap | |
| navigation.offer | null | AIの「地図を広げる」申し出 {holder,item,room} | rememberMapOffer（nav:18）、move/readMap/advanceでnull | currentMapOffer（nav:14）で room一致・explore・所持・未読 のときのみ有効 |
| phase | 'explore' | 'explore'→'battle'→'end' | advance（S:149）、resolve（S:360） | 逆遷移なし（resetのみ） |
| room | 'entry' | 現在地 | move | |
| lit | false | ランタン点灯 | light/douse（S:112,116）、equipItem（items:6） | **transferItemは変更しない**（検証済み: 点灯中にランタンを貸すと lit=true のまま、受取人は装備するまで douse不可） |
| everLit | false | 一度でも点灯したか | light | true→falseなし。blueDustの条件 |
| discovery.etching | false | 壁の傷を発見（etching対象出現） | scout（S:110） | |
| discovery.cache | false | 隠し収納の場所を発見 | find_cache（S:113） | |
| discovery.opened | false | 収納を開けた | open_cache（S:114） | true ⇒ items.lampstone存在 |
| discovery.stoneOn | false | 灯石を使用中 | use_stone（S:115） | 戻らない（一回限り） |
| discovery.cacheRetry | （初期値に無し=undefined） | 解錠失敗済み（再挑戦+2） | resolveCache失敗（S:381） | |
| discovery.clues[id] | 全員 [] | 本人が得たCLUESキー | learnClue（core:54） | learnClueは同時にknowledge[id]へCLUES本文を追加（未含有時） |
| discovery.shared | [] | 全員に共有されたCLUESキー | shareClue（core:69） | 本人がclues保持時のみ共有可。共有時 publishReport |
| discovery.proposals | [] | {id,action}。decode/open_cache の「本人の提案」記録 | propose（S:56） | decode/open_cacheは提案済みでないと実行不可（S:106, S:379） |
| discovery.hints | 0 | GMへのヒント要求回数 | scenarioGMHint（S:611） | |
| visited | ['entry'] | 訪問済み部屋 | move | |
| seen[id] | {}（キー無し） | 本人が調査済みのtarget配列 | inspect系（S:108） | 調べたtargetは本人のactionsForから消える |
| holding | false | ブロムが操作輪を支えている | hold（true）、pry（false） | 部屋を離れても維持される（moveで解除しない） |
| drained | false | 排水済み | pry | |
| observedDrain | false | 排水後に広間へ入った | move（S:132） | |
| locked | true | 石扉の鍵 | unlock（false） | |
| supported | false | ブロムが石扉を支えている | support | |
| opened | false | 石扉が開いた | crawl/wedge/smash | |
| noisy | false | 番人に気づかれた | smash、収納解錠の失敗/代償つき成功 | true⇒戦闘開始時 boss=30 |
| runes | false | マレンが広間の文字を読んだ | read | readの再表示を止めるだけ（他で未使用） |
| weak | false | 番人の弱点発見 | resolve の study 成功 | 戦闘中に一度trueになれば以後ずっとtrue |
| boss | 24 | 番人の枠HP | advance（24/30に再設定）、resolve | 0..max |
| round | 1 | 戦闘ラウンド | resolve（boss>0のとき++） | |
| fire | 2 | 火球残数 | resolve（fire使用で--） | |
| hp[id] | PEOPLE.hp | 現HP | resolve | 下限0、回復なし |
| knowledge[id] | 全員 [] | 本人が知る結果文（調査結果・CLUES本文） | applyAction inspect/read、learnClue | inspectは**重複チェックなしでpush**。重複は実際に起きる（検証済み）: ines が scout（learnClueでCLUES.etching追加、seenには入らない）→ inspect_etching で同文が2件。lydia が read → inspect_rune でも同文2件。`sharedKnowledge`/`publishOwnKnowledge` は indexOf で最初の要素を参照するので、再実装でも重複を再現すること |
| shared | [] | 公開ログ文字列 | publishReport、受け渡し・着脱結果、submitMessageBodyの発言記録（ai:271） | 表示・AI入力用 |
| outcome | （無し） | 'win' / 'retreat' | resolve | phase==='end' のときのみ設定 |

状態外のグローバル（core:28-35）: `generation`（reset毎に+1。非同期応答の陳腐化判定）、`busy`、`target`（選択中のtarget）、`chat`、`plan`（戦闘作戦 [{id,action}]）、`actionHistory`、`planReview`（{key,approved}）、`consents`、`pendingTransfer`、`explorationOffers`、`humanRequests`。

`apply(id,a,s,initiator)`（core:74-78）= `applyAction` を呼び、s===state のとき `actionHistory.push({id,action,initiator,room,result})` し、行動の議題（lantern）の consents を削除。

---

## 2. 行動カタログ

### 2.1 共通規則
- `actionsFor(id,s)`（S:75-91）が実行可能行動の唯一の判定。`applyAction`（S:105-127）は冒頭で
  1. a∈{decode,open_cache} かつ `canShowProposal` 偽 → throw `まず能力について相談し、提案を確かめてください。`（S:106）
  2. a∉actionsFor → throw `今はその行動を実行できません。`（S:107）
- `ownedActions`（core:51）: ITEM_REQUIRED[a] がある行動は「その品の holder が本人」かつ `items[item].equipped!==false`。equipフィールドを持たない品（rope,picks,lydia_map,ironbar,lampstone）は equipped===undefined なので所持だけで可。**装備品（hammer,shield,dagger,staff,lantern）は装備中であることが必要。**
- phase==='end' → []（S:76）。
- phase==='battle' → 戦闘行動のみ（§7）。部屋・lit無関係（S:77）。
- explore かつ !lit → `light`（ランタン所持者）、`find_cache`（ines かつ blueDust かつ !discovery.cache）、`use_stone`（灯石所持かつ !stoneOn）のみ（S:78）。
- explore かつ lit → 以下（S:79-89）:
  - 調査: `[...ROOMS[room].targets, ...discoveryTargets]` のうち本人の seen に無いもの → door は `inspect`、他は `inspect_<t>`。discoveryTargets = room==='entry' のとき `etching`(discovery.etchingなら)・`cache`(discovery.cacheなら)（S:53）。
  - `douse`: ランタン所持者。
  - 残りは §2.2 表の条件。
- 戻り値: `{private:true,text}`（本人だけの結果）または `{text}`（公開GM結果）。

### 2.2 探索行動（explore、lit=true が前提。例外は明記）

`text` は GM結果文（呼出側が `sayResult('GM',text)` で表示）。`private` の場合は呼出側の扱い §2.4。

#### entry（坑道入口）
| action | 実行者・条件（S行） | 効果 | 返却テキスト（逐語） |
|---|---|---|---|
| light | ランタンholder かつ lantern.equipped。lit=false時のみ（lit時は actionsFor に無い）S:78 | lit=true, everLit=true | `<名>がランタンを灯した。` + entryなら `岩肌が明るくなり、台車とレール、奥へ続く通路と下りの通路が浮かび上がった。` それ以外 `周囲が明るくなり、通路と調べられる場所が見える。`（S:116） |
| douse | ランタンholder かつ equipped、lit=true S:80 | lit=false | entry: `<名>がランタンを消した。暗闇に蒼白い塵が見え、壁の一角へ流れていく。` 他部屋: `<名>がランタンを消した。周囲は暗闇に戻った。`（S:112） |
| scout | ines、room=entry、!discovery.etching S:81 | discovery.etching=true、learnClue(ines,'etching') | private: CLUES.etching（S:110） |
| inspect_cart | 本人がcart未調査 | seen[id]+='cart'、knowledge[id]+=text | private: ironbar無し `空の台車に鉄の工具が残っている。引っ掛かったものを、てこの力で外せそうだ。` / 有り `台車は空だ。鉄の工具は<holder名>が持っている。`（S:95） |
| inspect_rails | rails未調査 | 同上 | private: `錆びたレールはここで途切れている。古い車輪の跡があるが、道や仕掛けは見つからない。`（S:96） |
| inspect_etching | discovery.etching、未調査 | 同上＋learnClue(id,'etching') | private: CLUES.etching（S:93） |
| decode | lydia、entry、discovery.etching、lydiaのclueにdarkness無し、knowsClue(lydia,'etching')（本人取得 or 共有）S:82。**かつ** proposals に {lydia,decode}（S:106） | learnClue(lydia,'darkness') | private: CLUES.darkness（S:111） |
| find_cache | ines、**lit=false**、blueDust（§4）、!discovery.cache S:78 | discovery.cache=true | `塵の集まる壁を確かめると、隠し収納を見つけた。場所を覚えた。`（S:113） |
| inspect_cache | discovery.cache、lit、未調査 | seen、knowledge、未開封なら learnClue(id,'cache_lock') | private: 未開封 CLUES.cache_lock / 開封済 `収納は空だ。灯石は<holder名>が持っている。`（S:94,108） |
| open_cache | gareth、entry、discovery.cache、!opened、knowsClue(gareth,'cache_lock')、picks所持 S:83。proposals に {gareth,open_cache}。**UI上は必ずダイス判定 resolveCache 経由**（ai:246, ai:95）§2.3 | opened=true、acquireItem(gareth,'lampstone') | `ガレスが収納の錠前を外した。古い包みの中から灯石を1つ手に入れた。`（S:114） |
| take | ines、entry、ironbar未存在、かつ（ines自身がcart調査済み、または他の誰かがcart調査済みでその結果を hasReport（§2.5）で共有済み）S:85 | acquireItem(ines,'ironbar') | `イネスが鉄の工具を拾い、持ち物に加えた。`（S:117） |
| use_stone | 灯石holder、!stoneOn（lit有無どちらでも可）S:78,84 | stoneOn=true | `<名>が灯石を掲げた。足元だけが淡く照らされる。蒼白い塵はまだ見える。`（S:115） |

#### drain（排水室）
| action | 条件 | 効果 | テキスト |
|---|---|---|---|
| inspect_wheel | 未調査 | seen/knowledge | private: brom `操作輪は逆戻りする。俺が支えている間なら、仲間が引っ掛かりを外せる。` / ines `操作輪の軸に鉄片が挟まっている。誰かに輪を支えてもらい、工具で外せば排水できそうだ。` / 他 `操作輪は固着し、手を離すと逆戻りする。軸に何か挟まっている。`（S:98） |
| inspect_water | 未調査 | 同上 | private: drained `水が引いて、排水口と古い泥の跡が見える。` / 未 `水路は広間の石扉の下まで続いている。操作輪で流れを変えられそうだ。`（S:97） |
| hold | brom、drain、!holding、!drained S:88（品不要） | holding=true | `ブロムが操作輪を支えた。仲間が軸の引っ掛かりを外せる。`（S:118） |
| pry | ines、drain、holding、!drained、ironbar所持 S:86 | drained=true、holding=false | `イネスが鉄の工具で引っ掛かりを外した。操作輪が回り、水が排水口へ流れ始めた。`（S:119） |

#### hall（石扉の広間）
| action | 条件（すべて !opened、S:87） | 効果 | テキスト |
|---|---|---|---|
| inspect（door） | 未調査 | seen/knowledge | private（S:100-103）: ines `内側に留め具がある。扉を支えてもらえば、隙間から外せる。`+(drained?`水の圧力はなくなっている。`:`水の圧力もかかっている。`) / gareth `古い錠前だ。錠前破りで外せる。`+(drained?`水の圧力もなくなっている。`:`ただし鍵を外しても、扉を押す水の圧力は残る。`) / brom drained `水の圧力がなくなった。鍵が外れれば、この扉を持ち上げて支えられる。` 未 `水の圧力がかかっている。先に水を引けば扉を支えられる。壊して進むなら大きな音が出る。` / lydia (drained?`石扉の下は乾いている。`:`石扉の下から水が染み出している。`)+`近くの刻みも確かめたい。` ※inspectはopened後も（未調査なら）可能（S:79はopened非依存） |
| inspect_rune | 未調査 | seen/knowledge | private: lydia `古い文字だ。「水を退け、石を戻せ」と読める。番人の胸の継ぎ目を開けば、心石を戻して鎮められる。` / 他 `煤の間に文字のような刻みが見える。古文字を読める仲間に頼めそうだ。`（S:99） |
| read | lydia、hall、!runes（S:89。opened無関係） | runes=true、knowledge[lydia]にlydia用rune文（未含有時） | private: lydia用rune文（S:125） |
| unlock | gareth、locked、picks所持 | locked=false | drained `鍵が外れた。扉を持ち上げて支えられる。` / 未 `鍵が外れた。だが水の圧力で石扉は動かない。`（S:120） |
| support | brom、!locked、drained、!supported | supported=true | `ブロムが石扉を支えた。人が入れる隙間ができた。`（S:121） |
| smash | brom、!locked、hammer所持**かつ装備**（drained不要） | opened=true、noisy=true | `ブロムが金槌で扉を壊した。大きな音が奥へ響いた。番人に気づかれたようだ。`（S:124）。人間がUIから依頼する時はブラウザ confirm `扉を壊すと大きな音が出て、番人が警戒します。ブロムに頼みますか？`（S:438） |
| crawl | ines、!locked、supported | opened=true | `イネスが内側の留め具を外した。石扉が開き、奥へ進める。`（S:122） |
| wedge | ines、!locked、supported、ironbar所持 | opened=true | `イネスが鉄の工具を扉の下へ差し込み、隙間を固定した。ブロムが手を離しても、皆が通れる。`（S:123） |

opened後は unlock/support/smash/crawl/wedge は出ない（S:87）。advance は §8。

#### 行動として列挙されない LABEL
- `map` 地図を広げる: actionsForに無い。navigation の readMap（§5）。
- `retreat`: 戦闘のみ（§7）。
- `cache_support` 収納の解錠を支援する: 判定ではなく記録用。ダイス画面のイネス支援チェック時に `recordAction('ines','cache_support',...,{text:'照明と見張りで解錠を支援した。'+結果})`（S:606）。
- `wait` 相談を続ける: AIの返答用（行動しない）。
- `inspect` は door の調査の正式ID。

### 2.3 収納の解錠判定 resolveCache（S:375-384、DICE_CONFIG S:561-578）
- 前提: n は整数1..20、でなければ throw `出目は1〜20です。`。`actionsFor('gareth')` に open_cache があり、かつ proposals に {gareth,open_cache}、でなければ throw `解錠の提案を確認してください。`
- bonus = cacheSkill 3 + (support?2:0) + (discovery.cacheRetry?2:0)。total=n+bonus。
- outcome: total≥10 → success、total≥5 → partial、それ以外 failure。
- failure: discovery.cacheRetry=true、noisy=true、text `錠前は開かなかったが、引っ掛かる構造が分かった。再挑戦に＋2。金属音が奥へ響いた。`
- success/partial: `apply('gareth','open_cache',s)`（S:114の効果とtext）。partialは追加で noisy=true、text += ` ただし錠前が軋み、大きな音が奥へ響いた。`
- 戻り record: `{id:'gareth',action:'open_cache',n,bonus,total,target:10,hit:outcome==='success',outcome,text,source}`、source=`錠前破り＋3`+(support?` / イネスの支援＋2`:'')+(retry?` / 構造の発見＋2`:'')。
- 支援: ダイス画面のチェックボックス `イネスが照明と見張りで支援（＋2）`（battle:56）。イネスの状態・位置の前提条件は無い。
- 確率表示 cacheOdds（S:376）: n=1..20で集計し各5%。基本: 成功70/代償25/失敗5。支援あり: 80/20/0。（check.cjs:51で failure=5 と 0 を確認）
- dicePlan文（S:605）: `収納の解錠：D20 ＋ <b> ／ 目標10。成功 <s>％・代償つき <p>％・失敗 <f>％。5〜9なら開くが音が響き、奥の敵が警戒します。4以下なら開かず、音が響きますが再挑戦に＋2。報酬は灯石1個です。`
- 判定後のガレス発言（diceFollowup S:607、話者表示 `ガレス`）: failure `仕組みは掴めた。次は開けられそうだ。` / partial `開いたけど、音を立てたな。奥に気をつけよう。` / success `静かに開いた。灯石を持っていこう。`
- 開封済みで再判定 → actionsFor に無いため throw（check.cjs:50）。

### 2.4 結果の伝達（private と公開）
- private結果（調査・scout・decode・read）は本人の knowledge / clues にだけ入る。人間本人のときは画面の「自分の発見 · 未共有N件」（view:107, core:79 privateSummary）。
- 共有: 人間は「皆に伝える」ボタン → `publishOwnClue`（core:91）または `publishOwnKnowledge`（core:92）。発言に `/文字|刻み|傷/` を含み本人がetching保持なら自動 shareClue、`/収納|錠前/` で cache_lock（S:442 shareMentionedClues、ai:272）。AIは返答の `share:true` で speech を publishReport、`shareClues` のキーを shareClue（ai:80）。
- AIが調査を実行した場合は reportInvestigation（ai:40、詳細は未精査）でAIの発言として返す。人間が他者の decode を request した場合は `<名>`話者で `調べました。分かったことを相談で伝えます。`（ai:246）。

### 2.5 報告の版（hasReport）
- `reportVersion(target,s)`（S:47-52）: door/water→`s.drained`、cart→`items.ironbar?.holder||null`、cache→opened?lampstone.holder:null、他→null。
- `publishReport(id,text)`（core:56-66）: `shared` に `<名>：<text>` を追加（deduplicate指定時は重複不可）。text が本人のknowledgeにあれば {knowledge:index}を記録。さらに全TARGETSについて、現在状態と drained反転状態（S:436 reportSnapshots）で `inspectText(id,target,snap)===text` なら {target,version} を記録。
- `hasReport(id,target,s,anyDrain)`（core:67）: 記録の version が現在の reportVersion と一致、または anyDrain かつ target∈{door,water}（S:612）。
- 用途: take の条件（S:85）、conversationProgress の「共有済み」（S:137-143）、wheelConversation。

### 2.6 人間の操作経路（UI）
- 地点ボタン（visibleTargets）を押して `target` を選ぶと、`actionsFor(humanId())` のうち `ACTION_TARGET[a]===target && canShowProposal` のものがボタン化（view:97）。`scout` は常設ツール欄（view:98）。蒼白い塵のスポット（blueDust かつ !cache）は `human('find_cache')`（S:600-603）。
- `human(a)`（ai:247）: explore では `apply(humanId(),a)`。公開結果なら `sayResult('GM',text)`、応答者 = requester または take/wedge/crawl（HUMAN_CONVERSATION_ACTIONS）なら brom が `humanActionReply`（S:439）: take `拾ってくれて助かる。どんな作業に使うか、相談しよう。` / wedge `助かった。これで`+(応答者brom?`俺`:`ブロム`)+`が手を離しても、皆が通れる。` / その他 `留め具が外れたな。ありがとう、皆で通れる。`。続いて cooperationFollowup（S:317）。
- `request(id,a)`（ai:246）: 他人の行動を依頼。lantern議題の行動は会話で `<名>、<LABEL>をお願い。` を送る。open_cache はダイス画面。decode は直接 apply。それ以外はAIの返答（checkedReply）を経て acceptAI。
- 会話: `submitMessageBody`（ai:270-297）が順に humanMessageIntent → equipmentIntent → navigationIntent → cooperationConversation → wheelConversation → shortApproval → 灯り議題の直接依頼 → transferIntent → … を判定。詳細は会話層であり本書の範囲外（判定結果は最終的に本書の apply/move/transfer/equip を呼ぶ）。
- AIが行動を実行するのは: (a) 人間の明示依頼（requested）で返答actionがそれと一致、(b) 本人が申し出た COOPERATION_ACTIONS（hold,support,unlock）を人間が了承、(c) 灯り議題の合意（settleConsent ai:203-240）。AIは依頼なしに探索行動を実行しない（acceptAI ai:76-86）。

---

## 3. 所持品

### 3.1 ITEM_DEFS（S:24-35）と初期所持（core:46 initialItems）
| id | name | start | slot | equip | handGroup | 初期 record |
|---|---|---|---|---|---|---|
| rope | 投げ縄 | ines | 0 | - | - | {owner,holder:ines} |
| hammer | 金槌 | brom | 0 | ✓ | - | equipped:false |
| shield | 盾 | brom | 1 | ✓ | - | equipped:false |
| picks | 錠前破り | gareth | 0 | - | - | |
| dagger | 片手剣（aliases 剣,短剣） | gareth | 1 | ✓ | - | equipped:false, drawn:false |
| lantern | ランタン | lydia | 0 | ✓ | maren-hand | **equipped:true** |
| staff | 記録板と杖（alias 杖） | lydia | 1 | ✓ | maren-hand | equipped:false |
| lydia_map | 古い坑道の地図 | lydia | 2 | - | - | |
| ironbar | 鉄の工具（工具,鉄の棒） | なし | - | - | - | take で生成 |
| lampstone | 灯石 | なし | - | - | - | open_cache で生成 |
initialItems: start を持つ品のみ。equip品は `equipped: id==='lantern'`、draw品は `drawn:false`。

### 3.2 生成 acquireItem（items:73）
既に存在すれば throw `その品はすでに入手されています。`。`s.items[item]={owner:who,holder:who}`（equippedなし）。revealItem で全員に `item_<id>` と `itemDetail_<id>` を公開（itemKey items:69: 本人のstart品は `item<slot>`、それ以外 `item_<id>`）。

### 3.3 装備 equipItem（items:2-9）
- 条件: ITEM_DEFS[item].equip かつ本人がholder かつ equipped がboolean。違反 throw `自分が持っている装備品だけを着脱できます。`
- 装備時 handGroup があれば、本人が持つ同groupの他の装備中品を equipped=false。外れた品が lantern なら消灯。
- lantern を外す、または持ち替えで外れた → `s.lit=false`。
- equipped を設定。外す時 drawn を持つ品は drawn=false。
- s===state なら `plan=[]; planReview=null;`（戦闘計画は無効化）。
- 戻り文: `<名>が<品名>を装備した。`/`外した。` + (消灯時 `ランタンを消灯して収納した。`)。
- 装備しても lantern は再点灯しない。phase制限なし（戦闘中も可。ダイス画面表示中のみ拒否 items:49 `判定が終わってから着脱してください。`）。
- AI本人の品は本人AIの accept/decline を経る（items:57-64）。人間本人の品は即時。
- 結果は `sayResult('GM',result)` と `state.shared.push(result)`（items:67）。

### 3.4 抜刀・納刀（items:10-25）
canDraw: ITEM_DEFS.draw あり（dagger のみ）、start===who、owner===holder===who、equipped===true。drawn をセット。文 `<名>が片手剣を抜いた。`/`鞘に納めた。`。**見た目のみ。判定・行動に影響なし。** 誤条件 throw `抜刀・納刀は、持ち主が自分の剣を装備している時だけできます。`

### 3.5 受け渡し（items:74-89, 114-162）
- mode: give（譲渡）/ lend（貸与）/ return（返却）。
- validateTransfer: item実在、from/to実在かつ異なる、mode有効。でなければ `受け渡す品と相手を確かめてください。`。holder!==from → `<from>は<品名>を持っていません。`
  - give/lend: owner===from 必須（借り物の譲渡・又貸し不可）→ 違反 `借りた品を譲ったり、又貸ししたりはできません。`
  - return: (owner!==holder かつ owner===to)［貸主へ返却］ または giveBack（owner===holder かつ その品の最後の give イベントが to→from）。違反 `返却先は貸主、または譲ってくれた人です。`
- transferItem: holder=to。give または giveBack なら owner=to。equip品は equipped=false、drawn は false。transfers に {item,from,to,mode,room}。revealItem(to)。s===state なら actionHistory に双方分の 'transfer' 記録、`plan=[]; planReview=null`、lantern 議題の consents 削除。**lit は変えない**（検証済み）。
- 同意: 候補は常に人間⇔AI 間（items:104 transferCandidates。from/to の一方は humanId）。AI↔AI の受け渡し経路は無い。相手AIが decision accept/decline/question を返す（items:151）。accept→実行し GM `<from> → <to>：<品名>を譲渡|貸与|返却。`+(lend?`所有者は<owner>のままです。`:`持ち物を更新しました。`)。question→ pendingTransfer={transfer,room,epoch}。次の短い了承（`うん/はい/いいよ/大丈夫/どうぞ/お願い`のみの文）で同じ transfer を再度 handleTransfer（=AIに再確認）。`やめ|取り消|キャンセル|渡さない|貸さない` で取消（GM `保留していた受け渡しを取り消しました。`）。room/generation 変化や validate 失敗で pendingTransfer は破棄（items:115-118）。
- 品の可視性の前提: transferCandidates は `knownItems(holder)`（items:70, 108）に含まれる品だけを候補にする。knownItems = holder が持ち、かつ人間（viewer）が `profiles.known` で holder の itemKey を知っている品。未公開の品は受け渡しを依頼できない。ironbar/lampstone は acquireItem 時に、受け取った品は transferItem 時に全員へ公開される。
- 貸与しても借り手の能力（actionsFor の人物別分岐）は変わらない。例: ironbar を brom に渡しても pry/wedge は ines 限定。

---

## 4. 灯り・暗闇・蒼白い塵

- 開始時 lit=false。lydia がランタン装備中なので light 可能。導入時 lydia AI が `ランタンと古い坑道の地図を持っています。ランタンを灯しましょうか？`（S:202-209。brom `金槌と盾を持っているぞ。必要なときは声をかけてくれ。`、gareth `俺は錠前破りと片手剣を持っている。必要なら声をかけてくれ。`）と申し出、`proposeConsent('lantern','lydia','light',…)`。
- 開始GM文（S:212）: `坑道は真っ暗だ。入る前に、役立つ持ち物を紹介しよう。イネスも自分のシートを見て、伝えたい品を話してみて。必要なものを頼んで進んでもいい。`
- !lit の間に隠れるもの:
  - 調査地点: visibleTargets（S:54）= lit なら部屋targets＋discoveryTargets、!lit なら entry で discovery.cache のとき `cache` のみ（見えるが inspect_cache は lit 必須）。
  - 出口: visibleExits は explore かつ lit のときのみ（nav:2）。move も lit 必須（S:129）。
  - 行動: §2.1 の暗闇時3種のみ。
  - 地図: lit または stoneOn が必要（nav:8, nav:31）。
- `blueDust(s)` = phase==='explore' && room==='entry' && everLit && !lit（S:57）。decode の有無とは無関係（一度灯して消せば見える）。
- 灯り議題の合意（CONSENT_TOPICS.lantern S:619-631）: actions light/douse、actor=ランタンholder、scope=`room:lit`。AIのランタン操作は「actor以外の誰かの request」が1種類だけあり、反対・疑問が無く、actorのAIが同意したときのみ実行（ai:195-201, 203-240）。人間が自分でランタンを持つなら直接実行。実行不可時の文（S:631）: 非所持 `ランタンは<holder>が持っています。先に受け渡しを相談しましょう。` / 未装備 `ランタンを装備してから灯りを操作してください。` / 非explore `今は灯りを操作できません。` / 既点灯 `ランタンはすでに灯っています。` / 既消灯 `ランタンはすでに消えています。`
- 手がかり連鎖（推奨順。強制ではない）:
  1. light（lydia）→ entry 照明。
  2. scout（ines）→ etching 地点出現、ines が etching clue。
  3. etching を共有 → AI lydia が decode を提案（cooperationFollowup S:319 は inspect_etching 後、cooperationAdvice S:276）→ propose → decode → lydia が darkness clue。
  4. darkness 共有後、ランタンholderが douse を提案（S:321-324 `「灯を伏せよ」なら、ランタンを消して見え方を確かめてみましょうか？`）。
  5. douse（entry）→ blueDust → ines が find_cache → discovery.cache。
  6. light → inspect_cache → cache_lock clue → 共有（または gareth 自身が調査）→ gareth が open_cache 提案 → ダイス → lampstone（gareth所持）。
  7. use_stone → stoneOn（暗闇で地図が読めるだけ。lit にはならない。進行必須ではない）。
- 収納・灯石は石扉ルートの進行に**不要**（ボスHPに影響するのは noisy のみ）。
- discoveryHint（S:58-70）: GMにentryで `/ヒント|次に|どうすれば|何をすれば/` を含む質問をすると hints++ してGMが以下の先頭一致文を言う（S:611）:
  1. !lit && !everLit `まず灯りを用意しよう。マレンの持ち物を確認できます。`
  2. blueDust && !cache `蒼白い塵が、同じ場所へ流れています。集まる先を目で追ってみよう。`
  3. opened `得た灯石は足元を照らせます。残る坑道も仲間と調べてみよう。`
  4. cache && !lit `場所は覚えました。灯りを戻すと、収納の細部を調べられます。`
  5. shared⊇cache_lock `錠前を扱える仲間はいましたね。能力を確認して相談してみよう。`
  6. cache `収納を調べ、分かったことを仲間に伝えてみよう。`
  7. shared⊇darkness `読めた言葉を、周囲の環境と結びつけてみよう。灯りも操作できます。`
  8. shared⊇etching: hints>1 `マレンは古い文字を読めます。刻みについて相談してみよう。` 他 `古い文字に詳しい仲間はいましたね。キャラクターシートを確認できます。`
  9. etching `気づいたことは、調べた本人だけが知っています。仲間に伝えたいことはありますか？`
  10. 既定 `景色の中の痕跡を探せる仲間はいましたね。キャラクターシートから能力を使えます。`
- 場面の目的文 sceneObjective（S:427）: end `仲間と一緒に、村へ帰ろう。` / battle `胸の枠を開き、心石を戻す。` / !lit: blueDust `蒼白い塵が、壁の一角へ流れている。` 他 `真っ暗だ。灯りがあれば、周囲を確かめられる。` / entry `ランタンの光に、古い道と道具が浮かぶ。` / drain: drained `水が引き、排水口が見えている。` 未(known⊇hall `足元の水が、広間へ流れている。` 他 `足元の水が、奥へ流れている。`) / hall: opened `石扉が開いた。先へ進める。` observedDrain `水が引いた。扉を動かせそうだ。` 他 `石扉の下から水が染み出している。`
- explorationBlockedReason（S:71-74）: !lit → `暗くて手元が見えず、調べられません。`+(holderが人間 `先にランタンを灯しましょう。` / 他 `<holder>にランタンを灯してもらいましょう。`)。

---

## 5. 移動・地図

- `visibleExits`（nav:2）: explore かつ lit のとき ROOMS[room].links を {id, passage, name: (known または visited) ? 部屋名 : null, visited}。UIは name があれば `<部屋名>へ`、無ければ passage を表示（view:93）。
- `move(to,s)`（S:128-135）: phase!=='explore' || !lit || to∉links → throw `今はその場所へ進めません。`。room=to、visited/known に追加、navigation.offer=null。text=`<部屋名>へ、仲間と移動した。`。
  - 例外: to==='hall' && drained && !observedDrain → observedDrain=true、text = (再訪 `広間へ戻ると、水の音が消えていた。` / 初訪 `広間に入ると、水は引いていた。`) + `石扉の下は乾き、扉を押していた水の圧力がなくなっている。`
  - s===state: humanRequests=[]、全員分 actionHistory 'move'。
  - 移動は常に全員一緒。部屋ごとの位置は持たない。holding/supported 等は保持。
- `travel(to)`（nav:46）: move → sayResult('GM') → target=null → cooperationFollowup(human,'move')（hall に observedDrain 済みで入ると brom が support を申し出 S:334 `水の圧力もなくなった。俺が石扉を支えようか？`）。
- 地図 readMap（nav:5-13）: 品が MAPS にあり holder が所持、でなければ `その地図を今持っている人に頼んでみましょう。`。phase!=='explore' → `今は地図を広げる余裕がありません。`。!lit && !stoneOn → `暗くて地図を読めません。先に灯りを用意しましょう。`。効果: navigation.known ∪= MAPS.rooms（全3部屋）、maps に追加、offer=null、holderの `item<slot>` を公開。GM文（nav:23）: `<holder>が古い坑道の地図を広げた。坑道入口・石扉の広間・排水室が記されている。未訪問の場所は、地図の記載として覚えておこう。`
  - AI holder の場合は本人に show/wait を確認（nav:30-45）。wait なら実行しない。
  - 地図の可視性: mapOptions（nav:3）は人間が knownItems で知っている地図だけ。navigationView の maps（nav:4）はさらに**全員**がその itemKey を知っている場合のみ。lydia_map は lydia の item2 で初期は未公開、導入（introduceInventory S:211-219 が OPENING_ITEMS の lantern,lydia_map を revealProfile）で公開される。
  - 地図を読むと未訪問の出口にも部屋名が付くだけ。移動可能性は変わらない。
- mapRecord（S:144）: visited∪known を一覧。note: hall訪問済み→ opened `石扉を開いた` / observedDrain `水圧が消えた` / 他 `石扉あり`。drain訪問済み→ drained `排水済み` / 他 `水が溜まっている`。
- 会話の移動指示 navigationIntent（S:153-179）は語句ルールで move/map/advance/route/clarify に分類（詳細は会話層）。`/石扉の奥|扉の先|扉の奥/` → advance（handleAdvance）。

---

## 6. 石扉と番人HP

開扉の全経路（すべて hall、lit、explore、!opened）:
| 経路 | 必要手順 | noisy | 開始boss |
|---|---|---|---|
| crawl | unlock(gareth,picks) → [drain: hold(brom) → pry(ines,ironbar)] → support(brom; !locked & drained) → crawl(ines) | 変化なし | 24（ただし収納解錠で noisy なら30） |
| wedge | crawl と同じ前提＋ines が ironbar 所持 → wedge(ines) | 同上 | 同上 |
| smash | unlock(gareth) → brom が hammer を**装備** → smash | true | 30 |
- unlock と排水の順序は任意。support は drained & !locked が必要（S:87）。drained前の support 案は会話層で拒否文（S:288 `水の圧力が残っているため、ブロムでも石扉を持ち上げて支えられません。ガレスが外せるのは錠前です。隙間へ入って内側の留め具を外すのはイネスの能力です。`）。
- ironbar 取得（take）は pry と wedge に必要。したがって crawl ルートも排水のために実質 ironbar が必要（pry は ines+ironbar 限定）。smash ルートは排水不要・ironbar 不要。
- noisy の発生源は3つのみ: smash、収納解錠 failure、収納解錠 partial。
- 戦闘開始時 `boss = noisy ? 30 : 24`（S:149）。表示 `番人の枠 <boss>/<noisy?30:24>`（S:428）。

---

## 7. 戦闘

### 7.1 定数 BATTLE_RULES（S:350-356）
target 10、studyBonus 5、weakBonus 5、aidBonus 5、damage {fire 6, spark 2, stabWeak 8, stab 3, strike 4, throw 3}、sweep 4、cover 6、beam 5、retreatDivisor 2。

### 7.2 行動可能集合（S:77）
基本集合 → ownedActions でフィルタ → 末尾に `retreat`（品不要、常に可）。
- ines: study, aid, throw(rope)
- brom: (round 奇数なら cover(shield装備)) , strike(hammer装備)
- gareth: stab(dagger装備)
- lydia: fire>0 なら fire, spark（staff装備）、fire=0 なら spark のみ
- 初期装備のままでは brom/gareth/lydia は retreat のみ（検証済み: `{"ines":["study","aid","throw","retreat"],"brom":["retreat"],"gareth":["retreat"],"lydia":["retreat"]}`）。advance のGM文が装備を促す。lydia が staff を装備すると lantern が外れ lit=false（戦闘には影響なし。表示上暗くなるかは stageSnapshot の lit が `state.lit||battlePreview` S:413）。
- battleBlockedActions（S:358）: 偶数ラウンドは `[{actor:'brom',action:'cover',reason:'今回の予告はマレンへの光線。かばうは前衛への薙ぎ払いだけを軽減し、光線はかばえないため、このラウンドは選べない。'}]`、奇数は []。

### 7.2b 戦闘行動表
| 実行者 | action | 必要品（装備要否） | ロール | 補正 | 命中時ダメージ | 副作用 |
|---|---|---|---|---|---|---|
| ines | study 弱点を見抜く | なし | D20 | +5 固定（weak/aidは乗らない） | なし | 成功で weak=true（永続） |
| ines | aid マレンを手助けする | なし | なし | - | - | aid=true（このresolve内で次のlydia攻撃に+5、lydia攻撃で消費） |
| ines | throw 投げ縄で攻撃する | rope（所持のみ） | D20 | weak+5 | 3 | - |
| brom | cover 前衛をかばう（奇数ラウンドのみ） | shield（装備） | なし | - | - | cover=true：薙ぎ払いをbromが6で受け、garethは無傷 |
| brom | strike 金槌で打つ | hammer（装備） | D20 | weak+5 | 4 | - |
| gareth | stab 急所を狙う | dagger（装備。drawn不問） | D20 | weak+5 | weak?8:3（判定時点のweak） | - |
| lydia | fire 火球（fire>0のみ） | staff（装備） | D20 | weak+5、aid+5 | 6 | 命中/外れに関係なく fire--、aid消費 |
| lydia | spark 石つぶて | staff（装備） | D20 | weak+5、aid+5 | 2 | aid消費 |
| 全員 | retreat 退路を確保する（撤退希望） | なし | なし | - | - | 自分への反撃 ceil(d/2)。全員なら即撤退 |
目標は全判定で合計10以上（≥）。攻撃外れはダメージ0。

### 7.3 予告（S:428）
奇数ラウンド `予告：前衛を薙ぎ払う（各4）`、偶数 `予告：魔法使いへ光線（5）`。

### 7.4 作戦の組み立てと確認
1. 人間が自分の行動を選ぶ → `human(a)`（ai:247）: `planReview=null; plan=[{id:human,action:a}]`、発言 `<LABEL>でいこう。`、`companions(true)` で各AIが allowed（=actionsFor）から1つ選び plan.push（ai:83, ai:88-）。順序は listeners（S:560）: lit なら aiPeople順 brom,gareth,lydia、!lit なら lydia を先頭。終了時 plan.length!==4 なら plan=[]。
2. UI で並べ替え（↑↓）・人間の行動変更・選び直し が可能。いずれも planReview=null（view:110-111）。
3. 「仲間と連携を調整」→ coordinatePlan（battle:6-22）: plan=arrangePlan(plan)、GM が planIssues の文（無ければ `各自の行動と順番を確認しよう。誰か一人が他の仲間の行動を決めることはありません。`）を言い、各AIに {speech, action, agrees} を問う。いずれかのAIが action を変えたら planReview=null、GM `本人が行動を変更しました。変更後の組み合わせを、もう一度短く確認できます。`。変更なしなら planReview={key:planKey(plan), approved:{id:agrees}}、GM: planReady なら `本人たちが了承しました。各自が選んだ行動で進められます。` 否なら `確認が残っています。各人の理由を聞いて、あなた自身の行動や順番を提案し直せます。`
4. `planReady()`（battle:5）すべて真で実行可:
   - plan.length===4、id が4人ユニーク
   - 各 action ∈ actionsFor(id)
   - planReview.key === planKey(plan)（=JSON [[id,action],...]、順序込み）
   - 全AI（brom,gareth,lydia）の approved===true（人間は確認不要）
   - planIssues に code 'support' も 'cover' も無い
5. 確認を無効にするもの: 並べ替え、人間の行動変更、選び直し、AIの行動変更、equipItem（plan=[]）、transferItem（plan=[]）、判定実行後（recordDiceActions で plan=[]）、reset。
- planIssues（S:361-368）:
  - code support: aid があり lydia が retreat、または aid の位置が lydia より後 → `イネスの支援を受けるには、マレンが支援の後に攻撃する必要があります。`（arrangePlan が lydia非撤退時は aid を lydia の直前へ移すので、残るのは lydia撤退の場合）
  - code cover: 偶数ラウンドに cover → battleBlockedActions の reason
  - code direction（実行は妨げない）: 撤退者が1〜3人 → `撤退希望と戦闘継続が分かれています。撤退希望者は退路を確保して身を守り、他の仲間は選んだ行動を実行します。全員が撤退を選ぶと撤退します。`
- arrangePlan（S:369-373）: aid の index > lydia の index かつ lydia が retreat でない → aid を取り出して lydia の位置に挿入（lydia の直前）。他は順序維持。

### 7.5 実行 resolve(s, items, roll, onCheck)（S:360）
UI では「この行動で進める」→ execute → openDice('battle') → 振るボタンで `state` の structuredClone に対し resolve(draft, plan, d20, push)、完了後 `state=draft`（battle:62-83）。
1. 検証: items 4件・id4種・各 action ∈ actionsFor(s) でなければ throw `4人分の実行可能な作戦を確認してください。`（偶数ラウンドの cover もここで弾かれる。check.cjs:17）
2. 全員 retreat → phase='end', outcome='retreat'、結果 `['全員が撤退を選んだ。互いに退路を確保し、坑道から撤退した。']`。ロールなし・反撃なし・round据え置き。
3. retreating = retreat を選んだ id の集合。aid=false, cover=false。items を**順に**処理:
   - retreat: `<名>が退路を確保して身を守る。`（ロールなし）
   - study: n=roll()、total=n+5、hit=total≥10。`s.weak = s.weak || hit`。文 `イネスの見抜く：<n>+5。` + (s.weak?`弱点を発見。`:`弱点は捉えられなかった。`)（※既に weak なら失敗でも「弱点を発見。」と出る）。onCheck {id,action,n,bonus:5,total,target:10,hit,source:'見抜く能力＋5'}
   - aid: aid=true。`イネスがマレンを支援。次の攻撃判定+5。`（ロールなし）
   - cover: cover=true。`ブロムが前衛をかばう。`（ロールなし）
   - 攻撃（throw/strike/stab/fire/spark）: n=roll()、bonus = (s.weak?5:0) + (id==='lydia' && aid ? 5 : 0)、hit = n+bonus ≥ 10。damage: fire 6 / spark 2 / stab = weak?8:3 / strike 4 / throw 3。fire なら hit/miss に関係なく s.fire--。id==='lydia' なら aid=false（消費）。`s.boss = max(0, boss - (hit?damage:0))`。文 `<名>の<LABEL>：<n>+<bonus>。` + (hit?`<damage>ダメージ。`:`外れた。`)。source = [weak?`弱点＋5`, lydia&&aid?`イネスの支援＋5`] を ` / ` 連結、空なら `補正なし`。
   - weak は study の直後から同ラウンド内の後続攻撃にも効く（順序依存）。study より前の攻撃には効かない（そのラウンドで初めて成功した場合）。
   - ボスが途中で0になっても残りの行動は処理・ロールされる（ダメージは0にクランプ）。
4. boss===0 → phase='end', outcome='win'、`胸の枠が外れた。心石を戻すと、番人は静かになった。`。反撃なし・round据え置き。
5. boss>0 → 反撃:
   - 奇数ラウンド: cover なら brom のみ `hp.brom -= rd(6, brom∈retreating)`（cover時 brom は retreat ではないので常に6）、文 `ブロムが薙ぎ払いを引き受け、盾で軽減。6ダメージ。`。cover 無しなら brom と gareth に各 rd(4,…)、文 `前衛へ薙ぎ払い。ブロムに<x>ダメージ、ガレスに<y>ダメージ。`
   - 偶数ラウンド: lydia に rd(5, lydia∈retreating)、文 `マレンに光線。<x>ダメージ。`
   - rd(d, r) = r ? ceil(d/2) : d（S:359）→ sweep 4→2、beam 5→3、cover 6→（発生しない）3。
   - hp は max(0, …)。ines は一切ダメージを受けない。
   - いずれかの hp===0 → phase='end', outcome='retreat'、`仲間が倒れた。全員で撤退し、今回の探索を終える。`
   - round++（hp0で終了した場合も加算される）。
6. 戻り値 results（文字列配列）。

検証例（check.cjs:52, 18, 22）: 全装備・round1・出目14固定で [study,stab,fire,cover] → boss 24→10、hp.brom 12、fire 1。throw/retreat(brom)/stab/fire を出目20 → brom 16（4/2切上げ=2）、gareth 11、ロール3回。aid,cover,stab,fire を出目5 → ロール2回、stab bonus0（外れ）、fire bonus5（10≥10命中）→ boss 18。

### 7.6 ダイス
- `d20()`（battle:2）: `crypto.getRandomValues(Uint32Array(1))` を 4294967280（=2^32−16、20の倍数）以上なら再抽選し `n%20+1`。一様分布。1判定に1回。
- 判定表示（battle:76,81）: ダイス欄 `<名>：<n> ＋ <bonus> ＝ <total> ／ 目標<target> · <成功|失敗|代償つき成功>`、GMログ `<名>の判定：<n>＋<bonus>＝<total>（<source> / 目標<target>）<代償つき成功|成功|失敗>`、続いて results を GM結果として出力。
- 色 DICE_COLORS（S:386）: ines 青緑 hue180 / brom 琥珀 35 / gareth 紫 280 / lydia 青 210 / gm 赤 0（フィルタなし）。各 record の id の色で振る。開始時の色は cache→gareth、battle→plan中で aid/cover 以外の最初の人物（無ければ gm）、demo→gm（battle:53）。出目20で `critical`、1で `low-roll` クラス（演出のみ）。
- dicePlan 戦闘文（S:605）: `<名>：<LABEL> → …。目標10。見抜く＋5、弱点発見後の攻撃＋5、支援後の次のマレンの攻撃＋5（支援は重複しません）。攻撃失敗はダメージ0。ラウンド後に敵が残れば反撃します。かばう・支援・退路の確保は振らずに実行します。撤退希望者は自分への反撃を半減。全員が撤退を選んだ場合は反撃なしで撤退します。`
- 判定後 AI 一言（S:607）: phase==='battle' のとき records 中最初の非人間の record について hit `手応えはあった。次の動きに備えよう。` / miss `捉えきれなかった。支援や順番を考え直そう。`（話者表示は名前のみ）。
- demo モード: D20補正なし目標10、状態変更なし。

### 7.7 BATTLE_ENEMY_ROUTE（S:374, battle:26-34）
`[5.5,2,-2,-5.5,-2,2]` は番人の舞台上の横位置（舞台座標x）。`moveEnemyForRound(round)` = ROUTE[(round−1)%6] × (battlePartySide==='right' ? −1 : 1)。判定後（round 加算後の値で）、3D舞台 stageView が存在し、かつ study 以外の外れが1つ以上あったときだけ移動し、位置が変われば results に `番人が左へ身をかわした。`/`右へ` を追加（S:606）。**ルール・数値には影響しない演出。ただしGMログ文が描画環境に依存する。**

### 7.8 終了
- phase='end' で actionsFor=[]、画面 actionIntro（S:429）: retreat `仲間を連れて坑道から撤退した。作戦を変えて、もう一度挑もう。` / win `胸の枠が外れた。心石を戻すと、番人はランタンを掲げ、坑道の灯りが戻った。`。sceneTitle（S:426）: retreat `坑道から撤退` / win `灯りが戻る`。
- 再挑戦は reset（初期状態から）のみ。

---

## 8. advance() とフェーズ遷移のGM文

- `advance()`（S:147-151）: phase!=='explore' || room!=='hall' || !opened || !lit → throw `まだ石扉の奥へは進めません。`。phase='battle'、navigation.offer=null、boss=noisy?30:24。GM:
  - noisy: `音に気づいた番人が身構えた。胸の枠が強く閉じている。`
  - 他: `番人が振り向いた。敵の予告を見て作戦を決めよう。金槌・盾・片手剣・杖は、装備を頼んでから使えます。`
- `handleAdvance()`（S:437、会話経由）: 条件不成立なら GM `まだ石扉の奥へは進めません。今いる場所と扉の状態を確かめよう。` で中止。成立なら advance。
- UIボタン `石扉の奥へ進む` は !battle && room==='hall' && opened で表示（S:433）、押下で advance() を直接呼ぶ（view:112）。!lit のときは throw（未捕捉。不具合候補）。
- 戦闘開始時 round=1・fire=2・hp は探索中に変化しないので初期値のまま（resetしない；探索中にこれらを書く処理は無い）。
- 戦闘終了文は §7.5/7.8。

---

## 9. 決定性

ゲーム状態に影響する乱数:
- `d20()` のみ（crypto.getRandomValues、battle:2）。戦闘判定と収納解錠で使用。
ゲーム状態に影響しない乱数:
- `makePlacement`（S:37）の Math.random（立ち位置）、stage.js:127 の後ろ向き演出、ui.js:43 の雷間隔、ai.js:18 の冗談許可（CHAT_JOKE_RATE=0.2、LLMプロンプト文言が変わる）。
- LLM応答（`ask` → `/api/gm`、ai:14）は非決定。AIの行動選択・同意・会話分類はここに依存。
テストでの固定方法:
- `resolve(s, items, ()=>n, onCheck)`／`resolveCache(s, n, support)` に出目を直接渡す（check.cjs:17-22,50-55、scenario-parity.cjs）。
- scenario-parity.cjs は vm に `Math.random=()=>.5` を注入。check.cjs:36 は makePlacement に `()=>0, ()=>.999, Math.random` を渡す。
- `ask` をスタブ（`ask=async(system,payload)=>JSON.stringify(...)`）。playtest-check.cjs は playtest-cases.json の実LLM応答ログを再生。
- 状態変更は `structuredClone(state)` に行ってから代入（battle:64,80）するため、判定中の reset/再開始（generation 変化）では結果を捨てる。

---

## 10. 既存検査の状況（2026-11-09 実行）

| 検査 | 結果 |
|---|---|
| check.cjs | PASS（exit 0） |
| exploration-check.cjs | PASS: 208 checks |
| inventory-check.cjs | PASS: 129 checks |
| lantern-check.cjs | PASS: 55 checks |
| navigation-check.cjs | PASS: 71 checks |
| opening-check.cjs | PASS: 35 checks |
| playtest-check.cjs | PASS: 7 件の場面で依頼どおりに状態が変わる / 方針で保留 1 件 |
| profile-check.cjs | PASS: 33 checks |
| roleplay-check.cjs | PASS: 32 checks |
| scenario-parity.cjs | **FAIL（exit 1）** |

scenario-parity.cjs の失敗（`node scenario-parity.cjs` 実出力の冒頭）:
```
AssertionError [ERR_ASSERTION]: actionsForの中身が変わった
+ actual - expected
+   " if(s.phase==='battle')return ownedActions(id,[...(id==='ines'?['study','aid','throw']:id==='brom'?[...(s.round%2?['cover']:[]),'strike']:id==='gareth'?['stab']:s.fire>0?['fire','spark']:['spark']),'retreat'],s);\n" +
-   " if(s.phase==='battle')return ownedActions(id,[...(id==='ines'?['study','aid','throw']:id==='brom'?['cover','strike']:id==='gareth'?['stab']:s.fire>0?['fire','spark']:['spark']),'retreat'],s);\n" +
```
原因: 比較元は `c36fc01:trpg-gm-mock3/prototype/game.js`（scenario-parity.cjs:3）。`unchangedBodies()` は最初の不一致で assert して止まるため、表示されるのは actionsFor だけ。比較対象の全39関数を assert せず集計した結果（作成時の検証スクリプト）、不一致は **4関数**:
- `actionsFor`・`planIssues`: commit ada84b5（2026-10-08「fix beam defense choices」）。brom の cover を奇数ラウンド限定にし、battleBlockedActions と planIssues の code 'cover' を追加（`git show ada84b5` の差分で確認）。旧仕様では偶数ラウンドでも cover を選べたが、resolve の偶数分岐は cover フラグを参照しないため効果ゼロだった。
- `advance`: commit e2835bb（「tell the party at battle start that weapons must be equipped first」）。非noisy時GM文に `金槌・盾・片手剣・杖は、装備を頼んでから使えます。` を追加。
- `stageSnapshot`: 装備・抜刀の表示フィールド（holdingLitLantern / equipment / drawn）追加。parity側の置換は旧 equipment 文字列しか除去しない。表示専用で、`drawn` を含む変更は 23ff9a9 で入ったことを `git log -S` で確認。
したがって「ada84b5 だけが原因」ではない。本文比較が止まるため、後続の振る舞いトレース（状態・結果文の digest 比較）は**一度も実行されていない**。トレースで他に差が出るかは不明。いずれも意図された変更とみられ、parity の比較元（c36fc01）が未更新。

---

## 11. 不明・注意点
- reportInvestigation（ai:40）・explorationIntent（ai:132）など会話層のAI発言文は本書では逐語化していない（ルール状態への作用は apply 経由のみ）。
- 点灯中にランタンを渡すと lit=true のまま holder の equipped=false になる（検証済み）。意図か不具合かはソースから判断できない。
- advance ボタンが !lit で例外を投げる点（view:112）は未捕捉。仕様意図は不明。
- study の結果文は既に weak のとき失敗でも `弱点を発見。` になる（S:360）。意図は不明。
- `discovery.cacheRetry` は initial() に無く、未定義で開始する（falsy 扱い）。
- inspect（door）は opened 後も未調査者は実行可能。
