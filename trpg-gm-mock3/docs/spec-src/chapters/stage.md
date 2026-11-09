# mock3 立体舞台 再構築仕様(stage.js と関連定数)

対象: `trpg-gm-mock3/prototype/`。行番号はファイル行(1行に多数の文がある圧縮形式)。
略記: S=stage.js, SC=scenario.js, IX=index.html, V=engine/view.js, U=engine/ui.js, B=engine/battle.js, C=engine/core.js, SH=engine/sheet.js。
「未確認」は読んで確定できなかった点。推測は書かない。

---

## 0. 全体構造と橋渡し

- S は描画とカメラ操作のみ。進行はengine/*、章固有の描画指定は SC(S:3-4, SC:444)。
- S はグローバル(SC 側の `const`/`function`)を直接参照: `SCENARIO_STAGE_DEFAULTS, SCENARIO_ANCHORS, SCENARIO_SHEETS, SCENARIO_BATTLE_X, SCENARIO_PALETTES, SCENARIO_PALETTE_FALLBACK, SCENARIO_ENEMY, SCENARIO_ENEMY_WIDTH, SCENARIO_ENEMY_HEIGHT, SCENARIO_LANTERN_ACTOR, scenarioGroundTexture, setupScenarioProps, scenarioStageActors, scenarioBattleRow, scenarioShadowWidth, scenarioPropsVisible, scenarioStandeeVariant`。
- 起動(IX:92-93): `<script type=module>` 内で `import {createStage,STAGE_DEFAULTS} from './stage.js'` → `stageView=createStage($('scene'), $('stageLook'), changed)`、`changed = ()=>{placeStagePoints(); redrawEffects();}` → 直後に `stageView.sync(stageSnapshot())`。全体を try/catch(IX:110、§7)。
- `createStage(host, controls, changed)` の戻り値(S:180): `{sync, project, projectActor, actorRects, setPan, focusActor, revolve, config, resize, speak, setLight, refreshLight, refreshLayout}`。`config` は `{...SCENARIO_STAGE_DEFAULTS}` の可変コピー(S:9)。`STAGE_DEFAULTS` は凍結原本(S:7)。`STAGE_FACINGS` も export(S:5, 本体未使用。lighting-check.cjs が参照)。
- 状態→舞台: `render()`(V:65) → 暗転/回り舞台制御(V:66-77) → `renderNow()`(V:78〜) の末尾 `if(stageView)stageView.sync(stageSnapshot())`(V:117)。
- 舞台→DOM: `changed()` 呼び出しで `placeStagePoints()`(U:110-119) が `stageView.project(anchorId)` と `actorRects()` で調査札ボタン(#points)と塵ボタン(#dustspot)を画面座標に置く。`redrawEffects()` は2D演出キャンバスの再描画(U:83)。
- 発言→照明: `say(who,text,kind)`(C:51) で `stageSpeaker()`(C:50: kind が error/private/gm なら null、`who===p.name` か `who` が `p.name+'（'` で始まる人物の id) → `stageView?.speak(id)`。
- 人物シート→注目: SH:71 シートを開くとき `stageView?.focusActor(id)`。
- 部屋移動→回り舞台: V:70 `stageView?.revolve?.(apply, done)`。
- 戦闘の敵移動: SC:606 → `moveEnemyForRound()`(B:26-34) が `stageView.config.battleEnemyX` を書き換え `refreshLayout()`。
- リセット(U:136): `stageView.setLight('auto')`。

### stageSnapshot()(SC:413) が返すもの
```
room:  state.room                        ('entry'|'hall'|'drain')
phase: battlePreview ? 'battle' : state.phase   ('explore'|'battle'|'end')
image: (state.phase==='explore' && !battlePreview) ? ROOMS[state.room].image : 's3_chamber_v2'
lit:   state.lit || battlePreview
end:   state.phase==='end' && !battlePreview
battle:state.phase==='battle' || battlePreview
actors: 元配列 =
   battlePreview        → previewPlacement || makePlacement(true)
   phase==='explore'    → [{id:humanId(), x:42, z:.03}, ...(placement||[])]
   それ以外             → placement || []
  各要素 p → {...p,
     heightCm: PEOPLE[id].heightCm,
     holdingLitLantern: state.lit && hasItem(id,'lantern') && state.items.lantern.equipped,
     equipment: ITEM_DEFS[item].equip かつ item!=='lantern' かつ本人所持かつ equipped の品ID配列,
     drawn: 本人所持・equipped・drawn の品ID配列 }
depth: {...depth}   (DEPTH_DEFAULT の可変コピー。S は depth.size のみ使用)
blueDust: !battlePreview && blueDust()   (S 未使用。2D演出側が使う)
cache: state.discovery.cache             (S 未使用)
```
- ROOMS.image(SC:9): entry=`mine_entrance_unlit`, hall=`s2_junction`, drain=`s7_inner_chamber`。戦闘/終了は `s3_chamber_v2`。
- PEOPLE.heightCm(SC:4-7): ines 155, brom 135, gareth 184, lydia(表示名マレン) 172。
- placement の生成(V:5-8): `placementState!==state || placementKey!==room+':'+phase` のとき `placement=makePlacement(state.phase==='battle')`。battlePreview 用は `previewPlacement=makePlacement(true)`。

### makePlacement(battle, random=Math.random)(SC:37-41)
```
slots = battle ? [26,52,40,13] : [30,51,73]
探索時のみ Fisher–Yates で slots をシャッフル
対象 = battle ? PEOPLE(4人) : PEOPLE から humanId() を除く(3人)
p_i = { id, x: slots[i] + (random()-.5)*(battle?3:6),
        z: battle ? {ines:.3, brom:.08, gareth:.2, lydia:.5}[id] : .1 + random()*.75 }
```
x,z は0–100/0–1 の舞台外座標(DOM版の名残)。立体では探索時 x→stageX, z→前後列の順位付けのみに使う。戦闘時 x,z は立体配置に使われない(SCENARIO_BATTLE_X と scenarioBattleRow で決まる)。

---

## 1. レンダラー

| 項目 | 値 | 出典 |
|---|---|---|
| ライブラリ | three 0.185.1 `./vendor/three/three.module.min.js`、`./vendor/three/loaders/GLTFLoader.js` | S:1-2 |
| 生成 | `new THREE.WebGLRenderer({antialias:true, alpha:false, preserveDrawingBuffer:true})` | S:12 |
| pixelRatio | `Math.min(devicePixelRatio, 1.5)` | S:12 |
| outputColorSpace | `THREE.SRGBColorSpace` | S:12 |
| toneMapping | 未設定(three既定 NoToneMapping) | S全体 |
| 影 | shadowMap 未使用。接地影は板(§4.7) | S全体 |
| canvas | `renderer.domElement`, class `stage-canvas`, `tabIndex=0`, aria-label「舞台。ドラッグで上下と左右を見渡す。左右の矢印キーで左右を向く」, `host.prepend(canvas)` | S:13 |
| CSS | `.stage-canvas{position:absolute;inset:0;width:100%;height:100%;z-index:1;touch-action:none;cursor:grab}` `:active{cursor:grabbing}` | IX:74 |
| サイズ | `renderer.setSize(host.clientWidth, host.clientHeight, false)`、`camera.aspect=w/h`、`camera.fov=config.fov`、ResizeObserver(host) | S:149-150 |
| host(#scene) 寸法 | `aspect-ratio:var(--stage-aspect,1.6)`, `min-height:320px`, `max-height:min(560px,calc(100svh - 220px))`(IX:56)/≤900px時 `max-height:540px`(IX:67)。背景色 `#182324` | IX:56,67 |
| 描画ループ | rAF。`document.hidden||lost||now-last<33` なら飛ばす(≒30fps上限)。`dirty` のときだけ `renderer.render` | S:178 |
| 起動後 | `host.classList.add('stage-ready')`, `host.dataset.stageRenderer='three'`, `controls.hidden=false`, `orient()`, `resize()` | S:179 |
| scene.background | 初期 `#101c20`、sync毎にパレット[1](§2.6) | S:10,145 |

テクスチャ読込 `texture(url)`(S:18): TextureLoader、URL毎にキャッシュ、`colorSpace=SRGB`、読込完了で `dirty=true; sync(snap)` 再実行、失敗で `host.dataset.stageAssetError='true'`。

---

## 2. 舞台構成

### 2.1 座標系と奥行き圧縮
- 右手系、y上、カメラは +z 側から −z を見る。単位は「舞台座標」(SC:503 床の注記で 70cm≒1.94)。
- `stageZ(z) = 1 + (z-1)*config.depthSpan/4.5`(S:105)。背景・小道具・anchor の z は sync 毎にこれで圧縮(S:129, S:118)。人物の z は圧縮しない。
  - 例(depthSpan 2.6): 背景 z=-15 → -8.2444、荷車 -10 → -5.3556、刻み -12 → -6.5111。

### 2.2 背景板(S:28-37, S:127)
- `flat(null, 0, -2, -15, 64, 25)`: PlaneGeometry(64,25)、MeshBasicMaterial `{transparent:true, alphaTest:.1, side:DoubleSide}`、position=(0, -2+25/2=10.5, -15)、`userData.stageZ=-15`、`renderOrder=-3`。
- 折り返し(既定): URL `?background=flat` でなければ有効(S:30)。PlaneGeometry(64,25,3,1) に作り直し、4列の頂点 x=[-32,-hinge,hinge,32]、`hinge=32-64*.18=20.48`、`wing=max(0,|x|-hinge)`、角度25°:
  - `x' = sign(x)*(min(|x|,hinge) + wing*cos25°)`, `z' = wing*sin25°`(客席側へ折る)、UV.x = [0,.18,.82,1]。法線・境界球再計算。→ 端 x=±30.920, z=+4.869。
  - `host.dataset.stageBackground='folded'|'flat'`(S:37)。`back.geometry.computeBoundingBox()` は §2.4 の左右限界に使う。
- 画像: `../replay/img/<snapshot.image>.webp`(S:127)。画像読込後 `back.scale.y = 64*imgH/imgW/25`(縦横比保持、横は64固定)。1100×619 の場合 scale.y=1.4405 → 高さ36.01、中心 y=10.5 のまま上下に伸びる。
- z は sync で `stageZ(-15)`。

### 2.3 床(S:21-24, SC:503-506)
- PlaneGeometry(70,70)、`rotation.x=-π/2`、`position.y=-.04`、`renderOrder=-2`。
- MeshStandardMaterial `{map, normalMap, alphaMap:groundFade, transparent:true, depthWrite:false, roughness:.96, metalness:0, color:'#747166'}`(color/roughness は sync でパレット値に上書き)。
- map=`./assets/scenery/ground-coal-gravel-v1.png`、normalMap=`./assets/scenery/ground-coal-gravel-v1-normal.png`(colorSpace=NoColorSpace)。両方 RepeatWrapping、repeat(36,36)、anisotropy 4。
- alphaMap(奥を背景になじませる): canvas 4×512、線形グラデ y=185 で `#000000` → y=265 で `#ffffff`、上下はそれぞれ単色。CanvasTexture(flipY既定) → canvas上端=床の奥(world z=-35)。結果: world z ≲ -9.67 で完全透明、z ≳ +1.26 で不透明、その間を線形。

### 2.4 カメラ(S:11, S:106-116)
- PerspectiveCamera(fov=config.fov=65, aspect=1, near .1, far 100)。初期 position(0,3.8,10)。
- `orient()`(S:108):
  ```
  camera.position = (0, 3.8+panY, 10)
  y = camera.position.y + 20*2*(horizon/100 - .5)*tan(fov°/2)
  camera.lookAt(0, y, -10)
  camera.rotateOnWorldAxis(UP, -atan2(panX, ahead()))     // ahead() = 10 - frontRow (=7.8)
  ```
  x 位置は常に0。左右は「その場で首振り」、上下はカメラの平行移動(注視点も同量上下)。horizon=54, fov=65 で注視点はカメラより +1.019 上(=見上げ、消失点が画面中央より下)。
- `panLimits()`(S:109-114):
  ```
  distance = camera.position.z - back.position.z           // 10 - stageZ(-15)
  tangent  = tan(fov°/2);  halfY = distance*tangent
  box = back.geometry.boundingBox
  edge = atan2(box.max.x - 1, distance - box.max.z) - atan(tangent*camera.aspect)
  tilt = atan(2*(horizon/100-.5)*tangent);  bottomSlope = tan(tilt - fov°/2)
  bustLimits = 表示中かつ actorId!==SCENARIO_ENEMY の各人物:
       a.y + a.scale.y*bustLine - 3.8 - (10 - a.z)*bottomSlope
  x    = max(0, min(config.panX, ahead()*tan(max(0,edge))))
  up   = max(0, min(config.panY, back.y + 25*back.scale.y/2 - halfY - 3.8 - 2, ...bustLimits))
  down = .8   (固定)
  ```
  意味: 左右は画面端の視線が背景(折り返し端)より1内側まで。上は背景上端−2、かつ全人物の胸元(bustLine)が画面下端に残る位置まで。
- `setPan(x,y)`(S:116): 上記でクランプ → orient → dataset `stagePanX/stagePanY`(toFixed 2)、`stageDirection`(|panX|>.05 で 左/右、|panY|>.05 で 上/下、「・」連結、無ければ「正面」)。`[data-look]` ボタンは端に達した側を `hidden`。`changed()`。

### 2.5 見渡し操作(S:152, S:171-175, IX:79, IX:74-75)
- ドラッグ(左ボタンのみ): pointerdown で `panSlide=null`、focus、pointerCapture、
  `units = 2*(10-frontRow)*tan(fov°/2)/host.clientHeight*sensitivity`。
  move(ボタン押下中): `setPan(startX - dx*units, startY + dy*units)`(つかんで動かす向き)。慣性・減衰なし。離しても戻らない。
- 中央へ戻るのは: 部屋またはフェーズが変わった sync(`setPan(0,0)`、S:127)、Home キー、GM設定のリセット(IX:101)。
- キー(canvas focus): ArrowLeft/ArrowRight で panX ±1、Home で (0,0)。ArrowUp/Down を扱う式はあるが受付配列が `['ArrowLeft','ArrowRight','Home']` のため上下キーは無効(S:175、現状の挙動)。
- « » ボタン: `<nav id="stageLook" class="stage-look" hidden>` に `<button data-look="left">&lt;&lt;</button>` `<button data-look="right">&gt;&gt;</button>`(IX:79)。押すと `slidePan(±panLimits().x)`(S:171)。
  - `slidePan(x)`(S:152): 目標をクランプ。reduced-motion または scrollSeconds≤0 なら即時、他は `panSlide={from,to,y,start}` を frame で smoothstep `t²(3-2t)`、所要 `scrollSeconds`(.45s)(S:178)。
  - CSS: 縦中央、左右10px(≤600pxで6px)、背景 `#101c20b8`、padding 10px 8px、font 15px、min-width 34px、枠 `#d9b87544`、z-index 6(IX:74-75)。
- `focusActor(id)`(S:170): 戦闘中・非表示・GLB板でない(Sprite)なら無視。`dataset.stageFocus=id`、faceFront に追加、`slidePan(a.x*ahead()/(camera.z - a.z))`(その人物が画面中央に来る角度)、同時に正面(0)へ回転(§3.5 の turn、所要 scrollSeconds)。

### 2.6 部屋ごとの差(S:145-146, SC:516-521)
| room | 床 color(地面絵への乗算) | scene.background | 床 roughness | 背景画像 | 小道具 |
|---|---|---|---|---|---|
| entry | #b6c0dc | #182027 | .96 | mine_entrance_unlit | 表示(探索中のみ) |
| hall | #8793a7 | #151b20 | .94 | s2_junction | 非表示 |
| drain | #4c7197 | #111d22 | .7 | s7_inner_chamber | 非表示 |
| 戦闘/終了 | 部屋のパレット(該当なしは hall) | 同左 | 同左 | s3_chamber_v2 | 非表示 |
- パレット未定義の room は `SCENARIO_PALETTE_FALLBACK='hall'`。
- 小道具可視: `scenarioPropsVisible(next) = room==='entry' && !battle && !end`。

### 2.7 小道具(S:73-74, SC:507-511)
`prop(id,map,pos,w,h)`: PlaneGeometry(w,h)、MeshBasicMaterial `{transparent, alphaTest:.1, DoubleSide}`、position=(pos.x, pos.y+h/2, pos.z)、userData.stageZ/stageX 保持(z は sync で stageZ())。
- `cart`: `./assets/scenery/mine-cart-v1.png`、pos [-11.3, -3*66/1024(=-.1934), -10]、4.5×3。
- `etching`: canvas 512×384 手続き生成(線色 #a3a697、幅3、影 #050a0b blur6、7本の折れ線: (130+30i, 110+(i%3)*12)→(138+30i,176)→(120+30i,212))、pos [11.5,3.4,-12]、3×2.2。

### 2.8 調査地点 anchor(SC:512, S:117-118)
`{cart:[-11.3,1.7,-10], rails:[1,1.3,-4], etching:[11.5,4.5,-12], cache:[11.5,3,-12], door:[0,4,-7], rune:[-8,3.8,-6], wheel:[-4,2.8,-6], water:[5,1,-4]}`。
`project(id)` = 投影 `[x, y, stageZ(z)]` → `{x,y(px, host左上基準), visible}`、visible = 視点空間 z<0 かつ |ndc.x|<.92 かつ |ndc.y|<.86。DOM の札ボタンをここへ置く(U:116、重なり回避は freeLabelPosition)。塵ボタンは `SCENARIO_DUST_TARGET='cache'`(SC:613, U:117)。
`projectActor(id)` = 人物足元 + `scale.y*.77` の高さ(ランタン位置、SC:594 の炎の揺らぎに使用)。
`actorRects()` = 表示中人物の画面上外接矩形(S:122-126)。

### 2.9 回り舞台(S:154-169, V:62-77, IX:12-13)
- 発動条件(V:64,70): 前後の sceneKey が `phase:room:outcome:battlePreview` で、両方 `explore`、room が異なり、両方 battlePreview=false。かつ V:68 の即時条件(初回・同一key・`sceneFadeMs==0`・reduced-motion)に該当しないこと。
- `revolve(apply,done)`(S:156): `lost||revolving||!snap||snap.battle||snap.end||!(revolveSeconds>0)` なら false → 呼び出し側は暗転(下記)。
- 手順:
  1. `revolving={start: now + max(0,scrollSeconds)*1000, ...}`、`allBack=true`、`stageFocus=''`。
  2. 表示中の GLB 人物全員: faceFront から外し facing='back'、`turn(id, π)`(近回り、smoothstep、scrollSeconds=0.45s)(S:158, S:153)。
  3. 0.45s 後から背景回転開始。`t=(now-start)/(revolveSeconds*1000)` ∈[0,1]、`e = t³(t(6t−15)+10)`(smootherstep)。
  4. `back.rotation.y = -(e<.5 ? π·e : π·(e−1))`(上から見て時計回り、右端が客席へ出る。前半 0→−90°、後半 +90°→0 で裏面を見せない)(S:165)。
  5. `e≥.5`(=t≥.5、開始+1.5s)で一度だけ `apply()` → V側で `renderNow()`(新部屋の sync)と `#scene.revolve-swapped` 付与。
  6. 小道具も背景の中心線(x=0, z=back.z)を軸に同角度で公転・自転(S:167)。
  7. t≥1 で rotation 0、`revolving=null`、`done()` → `.revolving/.revolve-swapped` 除去、保留 render 実行。
- 総所要: 0.45s(振り向き) + 3.0s(回転)。タブ非表示でも終わるよう setTimeout で `wait+ms/2+50` と `wait+ms+50` に強制ステップ(S:160)。
- CSS: 回転中 `#exits` 非表示、`#points` は差し替えまで非表示、ポインタ無効(IX:12-13)。
- 回転後: allBack=true のまま次の部屋でも全員背面。apply 時の sync は `revolving` 中なので allBack を落とさない(S:127)。話した人だけ正面へ(§3.5)。回り舞台以外の場面変更で allBack=false。
- 暗転(回せないとき/戦闘・終了への遷移, V:71-76): `out=round(sceneFadeMs*.42)`, `back=sceneFadeMs-out`。`#scene` に `filter:brightness(0)` を `out`ms ease-in → renderNow → `brightness(1)` を `back`ms ease-out → 後始末。既定 sceneFadeMs=600(V:62)→252ms/348ms。

---

## 3. 照明

注意: 人物・背景・小道具・光芒はすべて MeshBasicMaterial / SpriteMaterial(非照明)。three のライトが効くのは床(MeshStandardMaterial)だけ。

### 3.1 ライト一覧
| 名前 | 型 | 色 | 強度 | その他 | 出典 |
|---|---|---|---|---|---|
| ambient | HemisphereLight | sky #a9bac6 / ground #51412e | 点灯時1.2 / 消灯時0.2 | — | S:25, S:145 |
| lantern | PointLight | #ffcc86 | 8 | distance 22, decay 1。position=(マレン(lydia)の x, 3, マレンの z)、不在時 (2,3,2)。`visible=snap.lit` | S:26, S:145, SC:517 |

### 3.2 点灯/消灯(暗い状態)
- 立体側(lit=false または end): lantern 非表示、ambient 0.2、ピンスポット(pool/beam)非表示、全人物の色を白へ(S:128, S:64)。
- DOM 側: `#scene.dark`(V:87: `!state.lit && !battlePreview`)→ `.scene:before{background:#020609;opacity:.94;z-index:2;transition:opacity 1.2s ease}`(IX:7-8)。canvas(z1)を覆う。reduced-motion で transition なし(IX:10)。`.scene.dark .scene-effects{opacity:1;z-index:4}`(2D演出は暗幕の上、IX:26)。
- ランタン点灯の人物差分は §4.5。

### 3.3 ピンスポット(S:40-69)
- テクスチャ `lightTexture(beam)` canvas 256×512:
  - pool(beam=false): `scale(1,2)` 後 中心(128,128) 半径128 の放射グラデ `#ffffffaa`(0)→`#ffffff66`(.4)→透明(1)。
  - beam(true): 各行 y∈[0,512): 横幅 `spread=8+.24y`、中心128で 透明→`#ffffffaa`(.4–.6)→透明、行アルファ `sin(y/512·π)*.45`。
  - いずれも CanvasTexture, sRGB。材質 `MeshBasicMaterial{transparent, depthWrite:false, DoubleSide, AdditiveBlending}`。
- pool: Plane(1,1), rotation.x=-π/2, y=-.015, scale=(spotWidth, spotWidth), opacity=level*.65。
- beam: Plane(1,1), position=(Lx, 4.8, Lz-.1)、quaternion=カメラと同じ(ビルボード)、scale=(spotWidth*1.2, 9.6)、opacity=level*.32。
- 色: spotColor 'warm'→#ffe0a0 / 'cool'→#acd9ff(three.Color 経由=線形化される)。
- 対象 id: lightMode 'auto' なら `now<until ? speaker : ''`、'off' なら ''、他は固定 id。
- enabled = `snap.lit && !snap.end && 対象表示中 && spotStrength>0`。target=enabled?spotStrength:0。
- 補間係数 `k = reducedMotion ? 1 : 1-exp(-dt*5/spotFadeSeconds)`(dt≤.1s)。level→target、光の位置 L は対象 sprite 位置へ lerp(初回/消えかけ時は瞬間移動)。
- 人物の色(全員, S:62-65): weight を同じ k で 0/1 へ補間。
  `ambient = 1 - level*.32`, `boost = weight*level*.65`, `color = (ambient+boost*c.r, ambient+boost*c.g, ambient+boost*c.b)`。
  GLB の各メッシュは `baseColor × この色`。既定(level=.7)で非対象 .776倍、対象は +.455×色。lit=false なら白。
- `speak(id)`(S:49): `scenarioStageActors()`(ines, brom, gareth, lydia, guardian_rampage)に含まれる id のみ。`until = now + spotHoldSeconds*1000`(7s)。
- `setLight(mode)`: 'auto'|'off'|上記 id。auto に戻すと speaker/until をクリア。
- `host.dataset.stageSpot` = 照らしている id。

### 3.4 背面の人物と「話した人だけ正面」
- 部屋/フェーズ変更時、非戦闘かつ人物がいれば確率 `backFacingRate`(.35)で1人を無作為に背面(backFacing)(S:127)。
- 回り舞台後は全員背面(allBack)。`speak(id)` で `allBack && !battle && 未正面 && 表示中 && GLB板` なら faceFront に加え `turn(id,0)`(S:51)。focusActor でも正面化。faceFront/turns は部屋/フェーズ変更でクリア。

### 3.5 回転アニメ turn(S:153, S:178)
from=現在角を(−π,π]へ正規化、delta=最短差、smoothstep `t²(3-2t)`、所要 scrollSeconds。完了時 `final` に揃える。scrollSeconds≤0 なら即時。`dataset.stageFacing` に「id:角度(度)」。

### 3.6 蒼い塵・雷・雨・霧(2D 演出キャンバス、WebGL 外)
- `<canvas id="sceneEffects" class="scene-effects">`(IX:79)、`position:absolute;inset:0;z-index:2;pointer-events:none`(IX:24)。dpr≤1.5、30fps 上限(U:45-48, U:84)。時間は reduced-motion または paused で停止。
- 疑似乱数 `noise(i)=fract(sin(i*127.1+311.7)*43758.5453)`、`wrap(n)=((n%1)+1)%1`(U:50-51)。
- 描画順(U:52-81): ①章演出 drawScenarioEffects → ②霧 → ③漂う塵 → ④雨 → ⑤雷光。
- ① SC:585-599:
  - 蒼い塵: `blueDust() = phase==='explore' && room==='entry' && everLit && !lit`(SC:57)。48粒、`t=wrap(time*.12+noise(i+900))`、位置 = 乱数点(noise(i+910)*w, noise(i+920)*h) と目標(cache anchor 投影、無ければ (w*.82,h*.44))の線形補間、色 `rgba(177,226,255,.25+.65t)`、半径 1+1.5·noise(i+930)、shadow #9cdfff blur7。DOM ボタン `.dust-discovery`(58px 円、`radial-gradient(#b6edff55,transparent 70%)`、z4)を投影位置に(IX:26, SC:601-602, U:117)。
  - 灯石: `state.discovery.stoneOn` で (w*.4,h*.9) 半径 h*.28、rgba(166,223,255,.25)→0。
  - ランタンの揺らぎ(lit && fx.flame): 中心=projectActor('lydia')、`flicker=(sin(8.7t)*.35+sin(13.1t)*.18+sin(2.9t)*.47)*flame/100`、半径 `min(w,h)*(.58+.07flicker)`、`rgba(255,175,62,.2+.08f)`→`rgba(235,135,36,.1+.04f)`@.35→0。
- ② 霧: `weather = !fx.outdoorsOnly || outside`、`outside = isOutsideScene() = room==='entry' && phase==='explore' && !battlePreview`(SC:387)。全面 rgba(177,195,195,fog/100*.08)+6つの楕円(縦.45)放射グラデ rgba(191,207,207,amount*.26)、横流れ `time*(.006+wind*.00008)`。
- ③ 漂う塵: lit 時、fx.dust 粒(既定28)、rgba(249,222,164,.12+.45n)、半径 .7–2.2。
- ④ 雨(outside のみ): 線 `round(rain*2.4)` 本、傾き `wind*.18`、長さ 9–24、rgba(186,212,224,.15–.45)、幅.8。足元の波紋 `round(rain/12)` 個、楕円 y=h*(.9–.98)。
- ⑤ 雷: `LIGHTNING_CONFIG={firstDelay:3.5, minInterval:7, maxInterval:15, duration:.75}`(SC:581-583)。outside && rain>0 && lightning>0 && !paused && !reduced で自動。初回 3.5s、以降 7–15s 一様乱数。部屋・state・屋外判定が変わるとリセット。
  `level = (1-age/.75)²`(0≤age<.75) × lightning/100 × (reduced ? .35 : 1)。全面 rgba(207,227,255,level*.3) + 稲妻(上端 x=w*(.08+.25n) から7折れ線で h*.34、2px、shadow #bce3ff blur12、枝1本)。`#scene` に `--lightning-flash` と `.lightning-flash`、暗転中は暗幕 opacity を `.94 - flash*.82` へ(IX:26)。テストボタン `#fx-lightning-test`。
  立体舞台(Three.js)には雷・雨は一切影響しない。

---

## 4. スタンディー(人物)

### 4.1 生成 actor(id)(S:79-86)
- `SCENARIO_SHEETS[id]` がある(ines/brom/gareth/lydia) → `THREE.Group`(GLB/PNG板の入れ物)。`sprite.material={color:Color(1,1,1)}` という擬似プロパティを持たせ照明色の受け皿にする。
- ない(guardian_rampage) → `THREE.Sprite(SpriteMaterial{map:'../replay/img/<id>.webp', alphaTest:.08})`、`center=(.5,0)`(足元基準)。常にカメラを向く。
- 各人物に接地影1枚(§4.7)。

### 4.2 シート矩形の意味(SC:513, 526-527)
`{width,height}` = 元画像(PNG)の画素寸法。`figure:[x0,y0,x1,y1]` = 人物の描かれた範囲(y1=足裏、y0=頭頂)。`plate:[x0,y0,x1,y1]` = 板(GLB の切り抜き外形)の範囲。単位は画素、y下向き。body = figure[3]-figure[1](=人物の高さ px)。
```
SCENARIO_SHEETS(既定):
 ines  {793×1251, figure[261,65,615,1177], plate[233,33,639,1208]}
 brom  {862×1118, figure[63,101,810,988],  plate[42,74,832,1012]}
 gareth{766×1309, figure[148,63,675,1224], plate[113,29,710,1257]}
 lydia {778×1442, figure[95,126,686,1355], plate[78,91,721,1387]}
```

### 4.3 差分選択 scenarioStandeeVariant(p)(SC:528)
```
if (p.id==='lydia' && p.holdingLitLantern) return MAREN_LANTERN_VARIANT   // missing:''
list = SCENARIO_STANDEE_VARIANTS[p.id];  if(!list) return null
worn  = p.equipment.map(i => p.drawn.includes(i) ? i+':drawn' : i).sort().join('+')
match = list.find(v => [...v.equipment].sort().join('+') === worn)
v = match || list[0]
return { file:v.file, sheet: v.sheet || SCENARIO_SHEETS[p.id],
         missing: match ? '' : p.id+':'+(worn||'none') }
```
- 一致が無ければ先頭(現行姿)を表示し、`missing` を `host.dataset.stageEquipmentMissing` に出す(借りた武器の絵を勝手に付けない)。抜刀(`dagger:drawn`)の絵は未登録 → gareth は先頭の納刀姿 + missing `gareth:dagger:drawn`。
- equipment は lantern を除く(SC:413)。
```
SCENARIO_STANDEE_VARIANTS:
 ines:  [ {ines-empty, [], sheet{793×1251, fig[301,82,676,1179], plate[272,50,709,1212]}} ]
 brom:  [ {brom-hammer-shield, [hammer,shield]}                      // 既定 sheet
          {brom-hammer-only, [hammer], sheet{862×1118, fig[63,101,763,989], plate[39,74,793,1014]}}
          {brom-shield-only, [shield], sheet{862×1118, fig[183,101,810,988], plate[155,75,834,1014]}}
          {brom-empty, [], sheet{866×1122, fig[154,69,798,1028], plate[125,41,825,1056]}} ]
 gareth:[ {gareth-sheathed-visible, [dagger], sheet{766×1309, fig[148,63,679,1225], plate[113,30,715,1258]}}
          {gareth-empty, [], sheet{766×1309, fig[167,74,680,1224], plate[132,40,714,1257]}} ]
 lydia: [ {maren-v64, [staff]}                                          // 既定 sheet(778×1442)
          {maren-empty, [], sheet{766×1309, fig[126,64,685,1232], plate[92,29,722,1264]}} ]
MAREN_LANTERN_VARIANT = {file:'maren-lantern', sheet{766×1302, fig[193,64,700,1213], plate[161,31,732,1231]}, missing:''}
```
- 装備可能品(SC:26-31): hammer, shield(brom 想定)、dagger(内部ID、表示名片手剣)、lantern、staff。ines は装備品を持たない想定のため常に ines-empty(standees/README)。

### 4.4 着せ替え dress(a,p)(S:89-101)
- 同じ file なら何もしない。読込済みの姿へ戻る場合は進行中の要求を捨てるだけ。
- 初回(子が無い)のみ PNG 板を即時表示(GLB 到着まで):
  ```
  body = fig[3]-fig[1];  w = width/body;  h = height/body
  front/back 2枚: PlaneGeometry(w,h),
     MeshBasicMaterial{map:'./art-preview/characters/<file>-front|back.png', transparent, alphaTest:.04, depthWrite:true, side:FrontSide}
     position = ((width/2 - (fig[0]+fig[2])/2)/body, (fig[3]-height/2)/body, front +.008 / back -.008)
     back は rotation.y=π
  ```
  → 人物の横中心が x=0、足裏が y=0、人物高さ=1。
- GLB `./assets/standees/<file>.glb` を GLTFLoader で読込。後発要求が来ていたら破棄(release)。
  ```
  B = Box3(model);  H = B.max.y-B.min.y
  bodyFraction = body / (plate[3]-plate[1])
  unit = 1 / (H*bodyFraction)                       // 人物高さを1に正規化(全軸等倍、板厚を潰さない)
  foot = (plate[3]-fig[3])/(plate[3]-plate[1]) * H  // 板下端→足裏の距離(モデル単位)
  model.scale = unit
  model.position = ( -(B.min.x+B.max.x)/2*unit,  -(B.min.y+foot)*unit,  0 )
  ```
  x は板の境界中心で揃える(figure 中心ではない)。
- 全メッシュの材質を `MeshBasicMaterial{map:old.map, color:old.color, opacity:old.opacity, transparent:true, alphaTest: map?.04:0, depthWrite:true, side:old.side}` に置換。map の無い材質(側面)は opacity .2。`userData.baseColor` 保存。旧材質 dispose。
- 置換完了で PNG 子を除去・解放、`standeeLoaded=true`、report、changed。失敗時は今の姿を残し `host.dataset.stageAssetError='standee:<id>:<file>'`。
- release: GLB 由来の map は破棄、PNG(`userData.sharedMap`)はキャッシュ共有なので残す(S:103)。
- GLB 構造(assets/standees/README.md): 表・裏・側面の3メッシュ、板厚0.04、足元原点。

### 4.5 ランタン差分
`holdingLitLantern = state.lit && マレン(lydia)本人がランタン所持 && lantern.equipped` のとき maren-lantern(杖の装備状態を無視)。消灯・貸与で装備に応じた差分へ戻る。

### 4.6 大きさと配置(S:132-141)
```
actorHeight(p) = 4.8 * (battle ? battlePartyScale : 1) * (p.heightCm||172)/172 * snapshot.depth.size/46
GLB板:  sprite.scale.setScalar(actorHeight)   // 正規化済みなので人物(足裏→頭頂)= actorHeight 舞台単位
Sprite: scale = (actorHeight*imgW/imgH(未読込時 .5), actorHeight, 1)
halfWidth = sheet ? (fig[2]-fig[0])/(fig[3]-fig[1]) * actorHeight/2 : actorHeight*.25
```
既定(探索): ines 4.326、brom 3.767、gareth 5.135、lydia 4.8。戦闘は ×.85。(sheet は SCENARIO_SHEETS の既定値を使う。差分の sheet ではない)

探索時:
```
stageX = (p.x-50)*.22 → stageX 昇順ソート
重なり回避: stageX[i] = max(stageX[i], stageX[i-1] + halfW[i-1] + halfW[i] + actorGap)
center = (先頭の左端 + 末尾の右端)/2
depthOrder = p.z 昇順; frontCount = ceil(n/2)
row = 順位 < frontCount ? 0 : min(2, 順位-frontCount+1)
position = (stageX-center, 0, frontRow - row*rowGap)
```
(4人なら 手前2・中間1・奥1。userData.depthRow = ['front','middle','back','farthest'][row])
戦闘時:
```
compact = host.clientWidth < 600
stageX = SCENARIO_BATTLE_X[id] * (battlePartySide==='right' ? -1 : 1) * (compact ? .75 : 1) + battlePartyX
SCENARIO_BATTLE_X = {ines:-5.5, brom:.2, gareth:-1.8, lydia:-3.2};  center=0
row = scenarioBattleRow(id): brom,gareth→2 / lydia→0 / ines→1
position = (stageX, 0, frontRow + battlePartyForward - row*rowGap)
```
- 表示: `visible = !end`。

### 4.7 接地影(S:77-78, S:85, S:141-142)
canvas 128² 放射グラデ (64,64) r5→64: `#000000cc`→`#00000066`@.35→透明。Plane(1,1) 水平、MeshBasicMaterial `{color:#10100d, transparent, opacity:.55, depthWrite:false}`、y=.005、x,z=人物。scale=(scenarioShadowWidth: brom 1.8 / 他 1.25, .65)。番人の影は scale 未設定(1×1)。

### 4.8 向き(S:6, S:141)
```
facingAngle(dir, deg): front 0, front-left -deg, front-right +deg, back π, back-left π+deg, back-right π-deg   (rotation.y, rad)
facing =
  faceFront に含む            → 'front'
  戦闘: dx = battleEnemyX - x;  dx>1 'back-right' / dx<-1 'back-left' / else 'back'
  探索: allBack または backFacing 本人 → 'back'
        x-center < -.25 → 'front-right' / > .25 → 'front-left' / else 'front'
rotation.y = facingAngle(facing, battle ? battleFacing : inwardAngle)
           + (battle && facing!=='front' ? atan2(camera.x - x, camera.z - z) : 0)   // 戦闘では斜め視線を補正
```
回転アニメ中(turns に存在)の人物は上書きしない。Sprite(番人)は向き概念なし。

---

## 5. 戦闘の構図と敵の移動

- 仲間: §4.6 の戦闘配置。既定は画面左寄り・手前(frontRow 2.2 + 2.5 = z 4.7 が最前列、lydia)、背面を敵の方向へ 25° 振る。足元が見切れる構図(SC:468 注記)。
- 番人(S:142-144):
  ```
  overlap = clamp(battleEnemyX * (side==='right' ? 1 : -1) / 5.5, 0, 1)   // 仲間側へ来た度合い
  position = (battleEnemyX, 0, frontRow - 3*rowGap - overlap*battleEnemyOverlapDepth)
  scale = (4.5*battleEnemyScale, 6*battleEnemyScale, 1) * (1 - overlap*(1-battleEnemyOverlapScale))
  visible = battle;  depthRow='farthest'
  battleEnemyX<0 のとき map.repeat.x=-1, offset.x=1(左右反転。左向き専用絵が無いため)
  ```
  既定: x 5.5, z = 2.2-3.21 = -1.01, 7.65×10.2。
- パンの上限計算(bustLimits)から番人は除外。
- 敵の移動(B:26-34, SC:374, SC:606):
  - 発火: 戦闘のダイス結果記録時、`state.phase==='battle' && stageView && 記録のうち (!hit && action!=='study') が1件以上`。
  - `target = BATTLE_ENEMY_ROUTE[(state.round-1) % 6] * (side==='right' ? -1 : 1)`、`BATTLE_ENEMY_ROUTE=[5.5, 2, -2, -5.5, -2, 2]`。
  - 450ms smoothstep で `config.battleEnemyX` を補間、毎フレーム GM 設定のスライダー値も更新し `refreshLayout()`(= sync 再実行。仲間の向きも追随)。reduced-motion か同値なら即時。state/世代/フェーズが変わったら停止。
  - 位置が変わればログに「番人が左へ/右へ身をかわした。」。
  - `state.round` の増分(SC:360)との前後関係: 未確認。
- 戦闘への遷移は回り舞台ではなく暗転(§2.9)。戦闘開始は lit 必須(SC:149 advance())。戦闘中の消灯可否は未確認。
- 戦闘プレビュー(GM設定 battlePreview): lit=true 扱い、placement は previewPlacement。

---

## 6. 調整パラメータ

### 6.1 SCENARIO_STAGE_DEFAULTS(SC:445-502)→ stageView.config
| key | 既定 | 意味 | GM設定 UI(IX:87) |
|---|---|---|---|
| panX | 6 | 左右に向く範囲上限(手前列の奥行きで測った注視点のずれ。実効は背景端で自動制限、既定画面で約30°) | 「左右に向く範囲」2–10 step.5 |
| scrollSeconds | .45 | « » スライド・振り向き・回り舞台前の待ち | なし |
| revolveSeconds | 3 | 回り舞台の回転秒数 | なし |
| backFacingRate | .35 | 探索で1人だけ背面になる確率 | なし |
| panY | 5 | 上への移動上限 | 「上への移動範囲」1–8 step.5 |
| bustLine | .64 | 上限時に画面下端に残す体の位置(足裏0・頭頂1) | なし |
| frontRow | 2.2 | 手前列の z | 「人物の手前位置」1–3 step.1 |
| rowGap | 1.07 | 列の間隔 | 「奥行き4段階の間隔」.6–1.6 step.01 |
| inwardAngle | 12 | 探索時に端の人物を内側へ向ける角度(度) | 「人物の内向き角度」0–25 |
| battlePartyX | 0 | 戦闘時の仲間の左右ずらし | 「仲間の左右位置」-2–2 step.1 |
| battlePartySide | 'left' | 仲間の配置側 | select left/right |
| battlePartyForward | 2.5 | 戦闘時に仲間をカメラへ寄せる量 | 「仲間の手前位置」0–3.5 step.1 |
| battlePartyScale | .85 | 戦闘時の仲間倍率 | 「仲間の大きさ」.65–1 step.05 |
| battleFacing | 25 | 戦闘時の背面斜め角(度) | 「背面斜めの角度」10–40 step5 |
| battleEnemyX | 5.5 | 番人の x(敵移動で書き換わる) | 「番人の左右位置」-8–8 step.1 |
| battleEnemyScale | 1.7 | 番人倍率 | 「番人の大きさ」1–3 step.1 |
| battleEnemyOverlapDepth | 1.6 | 仲間側に来た番人を奥へ逃がす距離 | なし |
| battleEnemyOverlapScale | .84 | 同・縮小率 | なし |
| fov | 65 | 縦視野角(度) | 「視野角（縦・度）」35–75(→resize) |
| depthSpan | 2.6 | 背景・小道具・anchor の奥行き圧縮 | なし |
| horizon | 54 | 消失点の高さ(上端から%) | 「消失点の高さ」42–62 |
| sensitivity | 1 | ドラッグ倍率 | なし |
| actorGap | .35 | 人物の輪郭間の最小間隔 | なし |
| spotStrength | .7 | ピンスポット強度(0で消灯) | 「明るさ」0–100(%→/100) |
| spotWidth | 3.4 | 足元の光の直径 | 「光の広がり」1.8–6 step.1 |
| spotHoldSeconds | 7 | 発言後に照らし続ける秒数 | なし |
| spotFadeSeconds | .65 | 光の移動・明暗の時定数 | なし |
| spotColor | 'warm' | warm(#ffe0a0)/cool(#acd9ff) | 「光の色」琥珀色/月光色 |
| (lightMode) | 'auto' | 照らす対象(config 外) | 「照らす対象」auto/off/ines/brom/gareth/lydia/guardian_rampage |

### 6.2 舞台外の関連値
| 名前 | 既定 | 用途 | UI |
|---|---|---|---|
| `--stage-aspect`(CSS) | 1.6 | #scene の縦横比 | 「舞台の横長比率」1.3–2.2 step.05(IX:95) |
| sceneFadeMs(V:62) | 600 | 暗転の長さ。0 で回り舞台も無効 | 「場面転換の長さ」0–1200 step100(U:23) |
| DEPTH_DEFAULT.size(SC:642-649) | 46 | 3Dでは人物高さ係数 size/46。DOM版では人物高さ% | 「人物の基準サイズ」30–60(U:34) |
| DEPTH_DEFAULT.shrink / rise | 25 / 16 | DOM 版のみ(V:4) | 「奥の縮小率」0–60 /「奥の足元の高さ」0–28 |
| FX_DEFAULT(SC:579) | dust 28, flame 35, fog 22, rain 32, wind 25, lightning 55, outdoorsOnly true, paused false | 2D 演出 | dust 0–60、wind -100–100、他 0–100、「霧は入口（屋外）のみ」「動きを停止して比較」(U:34-40) |
| LIGHTNING_CONFIG(SC:581) | firstDelay 3.5, min 7, max 15, duration .75 | 雷 | なし(テストボタンのみ) |
| URL `?background=flat` | 折り返し | 背景板を平面に | URL のみ |

- UI の所在: システム設定パネル「開発・調整」節。`#debugEnabled`「演出の調整を有効にする」をオンにすると #effectControls, #stageTuning(舞台の視線), #battleTuning(戦闘の構図), #stageLightTuning(舞台照明・ピンスポット), 戦闘プレビュー行が表示(U:21)。
- リセット: 「舞台の初期値に戻す」= panX, panY, frontRow, rowGap, inwardAngle, fov, horizon + aspect 1.6 + sceneFade 600、setPan(0,0)(IX:101)。「戦闘構図の初期値に戻す」(IX:104)。「照明の初期値に戻す」= auto, spotColor, spotStrength, spotWidth(IX:109)。
- スライダー変更は `refreshLayout()`(sync 再実行 + resize)、fov は `resize()`、照明は `refreshLight()`(dirty のみ)。

---

## 7. 劣化・代替経路
- WebGL 起動失敗(createStage 例外): `#stageLook` 非表示、`#scene.stage-ready` 除去、`.stage-canvas` 削除、`#status` に「立体舞台を起動できないため、従来のシーン表示を使います。」(IX:110)。以後 DOM 版(#figures の画像人物、#bossimg、V:4 の projectActor で shrink/rise/size 配置)が表示される(`.stage-ready .figures,.stage-ready #bossimg{opacity:0;visibility:hidden}` が外れるため、IX:74)。placeStagePoints も stage-ready 無しなら札を DOM 既定位置へ(U:112)。
- WebGL コンテキスト喪失(S:176-177): preventDefault、`lost=true`、canvas 非表示、stage-ready 除去(DOM 版が出る)、操作ボタン非表示。復帰で逆。lost 中は描画・回り舞台(false 返却→暗転)停止。
- 画質: pixelRatio≤1.5、描画30fps上限、dirty 時のみ描画、タブ非表示で停止。2D 演出も dpr≤1.5・30fps。
- 素材失敗: テクスチャ失敗 → `data-stage-asset-error="true"`。GLB 失敗 → PNG 板のまま `standee:<id>:<file>`。
- reduced-motion: ピンスポット即時、スライド即時、敵移動即時、回り舞台・暗転なし(V:68)、雷は自動発生せず手動時 .35 倍。
- 画面幅<600px かつ戦闘: 仲間の x を .75 倍。
- 検査用 dataset(host): stageRenderer, stageBackground, stagePanX, stagePanY, stageDirection, stageSpot, stageFocus, stageFacing, stageRows, stageStandees, stageVariants, stageEquipmentMissing, stageAssetError。

---

## 8. 素材一覧(実際に参照されるもの)

パスは prototype/ 基準。

| パス | 種類 | 用途 | 参照元 |
|---|---|---|---|
| `../replay/img/mine_entrance_unlit.webp` | WebP 1100×614 | 背景(entry) | SC:9, S:127 |
| `../replay/img/s2_junction.webp` | WebP 1100×619 | 背景(hall) | SC:9 |
| `../replay/img/s7_inner_chamber.webp` | WebP 1100×619 | 背景(drain) | SC:9 |
| `../replay/img/s3_chamber_v2.webp` | WebP 1100×619 | 背景(戦闘・終了) | SC:413 |
| `../replay/img/guardian_rampage.webp` | WebP 507×760 | 番人 Sprite(立体)/#bossimg(DOM版) | S:80, IX:79 |
| `./assets/scenery/ground-coal-gravel-v1.png` | PNG 1024² RGB | 床の色 | SC:504 |
| `./assets/scenery/ground-coal-gravel-v1-normal.png` | PNG 1024² RGB | 床ノーマル | SC:504 |
| `./assets/scenery/mine-cart-v1.png` | PNG 1536×1024 RGBA | 小道具「荷車」 | SC:509 |
| `./assets/standees/{ines-empty, brom-hammer-shield, brom-hammer-only, brom-shield-only, brom-empty, gareth-sheathed-visible, gareth-empty, maren-v64, maren-empty, maren-lantern}.glb` | glTF バイナリ(表・裏・側面3メッシュ、厚0.04) | 人物板の本体 | S:94, SC:526-527 |
| `./art-preview/characters/<同10件>-front.png` / `-back.png` | PNG(各 sheet の width×height と一致を確認: ines-empty 793×1251, brom-* 862×1118, brom-empty 866×1122, gareth-* 766×1309, maren-v64 778×1442, maren-empty 766×1309, maren-lantern 766×1302) | GLB 到着前の仮表示 | S:93 |
| `./vendor/three/three.module.min.js`, `./vendor/three/loaders/GLTFLoader.js` | JS | three 0.185.1 | S:1-2 |
| 手続き生成 | canvas | 床フェード、刻み(etching)、光(pool/beam)、接地影 | S:23,40-43,77; SC:507 |

参照されないがフォルダにあるもの: `assets/scenery/sky-dusk-v1.jpg`(.js/.html から参照なし)、`assets/standees/{brom-v64, gareth-sheathed, gareth-v64, ines-v64, lydia-empty, lydia-v64}.glb` と対応 PNG(比較・記録用、standee-check.cjs の解析対象)。
舞台外の画像(ログの顔 `../replay/img/<id|maren>.webp`(C:51)、images/**)は立体舞台では使わない。
