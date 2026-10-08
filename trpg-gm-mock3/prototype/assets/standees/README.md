# 舞台のスタンディー

Standee-wiz/public/models/から既存のv64 GLBをそのままコピーしています。元プロジェクト・sources.jsonは変更していません。

- ines-v64.glb ← ines-standee-v64.glb
- brom-v64.glb ← dwarf-warrior-standee-v64.glb
- gareth-sheathed.glb ← 作者了承済みgareth-sheathed-painted-review.pngの納刀姿（旧gareth-v64.glbは保持）
- lydia-v64.glb ← lydia-standee-v64.glb

各モデルは表の印刷面・裏の印刷面・輪郭の側面の3メッシュ、元モデルの板厚は0.04舞台座標です。舞台では全軸に同じ倍率を使い、厚みを潰しません。印刷範囲の足裏をy=0へ合わせます。表・裏は印刷済みの陰影を保つMeshBasicMaterial、側面は透過率を調整してあります。

実モデルの解析：node prototype/standee-check.cjs。画像復号はこの検査では代替し、実ブラウザーで4体の読み込みと描画を確認しています。

ガレス納刀姿（2026-10-07）：Standee-wizの既存process-image.mjsと既存Blender板作成処理を利用。カラーグレード・ノーマルマップは本編に適用しない。正規化された背面テクスチャは既に反転済みなのでGLBのUVは再反転しない。PNGの背面フォールバックだけ自然な背面へ戻す。所持品の短剣・威力・貸与ルールは変更していない。装備着脱と表示の連動は未接続。

ガレス素体（2026-10-08）：作者了承済みgareth-empty-review.png（正面＋自然な背面）を同じprocess-image.mjsと同じBlender板作成処理（作業用sceneはfactory-startupの一時scene、既存sceneは未変更）でgareth-empty.glbへ。はみ出し0.00%/0.00%、余分な余白1.06%/0.68%。PNG代替はart-preview/characters/gareth-empty-front.png（板の表と同一）とgareth-empty-back.png（板の裏を自然な背面へ戻したもの）。figure・plateはscenario.jsのSCENARIO_STANDEE_VARIANTSに記載。

装備連動：scenario.jsのSCENARIO_STANDEE_VARIANTSが、本人の装備中の品（stageSnapshotのequipment）と一致する全身差分を選ぶ。ガレスは片手剣を本人が装備中→sheathed、外す・貸与→empty。ブロムは金槌と盾を両方装備中→hammer-shield、何も装備していない→empty。一致する絵が無いとき（ブロムの金槌のみ・盾のみ、借り手の装備）は現行姿のまま舞台のdata-stage-equipment-missingへ「id:装備」を出す。開始時は全員未装備なので、ガレス・ブロムとも素体で登場する。

ブロム素体（2026-10-08）：作者採用済みのart-preview/brom-equipment-study/empty-plate/brom-empty.glbを変更せずbrom-empty.glbへ複製（4267764バイト、1ノード・1メッシュ・材質3、厚み0.04、背面材質は直接UV＝既存の反転規約どおり）。PNG代替はbrom-empty-front.png（板の表と画素一致）とbrom-empty-back.png（板の裏を左右反転して自然な背面へ戻したもの、反転後に画素一致）。empty-plate/layout.jsonに無かったplateはplate-mask.pngの白画素の範囲[125,41,825,1056]から算出して同ファイルへ追記。figureは同layout.jsonの[154,69,798,1028]。板の縦横比は画素0.6897・GLB0.6893で一致。金槌のみ・盾のみの差分は未作成。

イネス・マレン・リディア素体（2026-10-08）：作者採用済みのbody-study-2026-10-08の各review.pngを、ガレス素体と同じprocess-image.mjsとBlender板作成処理（factory-startupの一時scene、ノーマルマップなし）でines-empty.glb・maren-empty.glb・lydia-empty.glbへ。はみ出しは3体とも0.00%、余分な余白はイネス0.97%/0.50%、マレン3.44%/2.72%、リディア1.82%/0.70%。PNG代替はart-preview/characters/<id>-empty-front.png（板の表）と-back.png（板の裏を自然な背面へ戻したもの）。背面材質は直接UV（既存の反転規約どおり）。イネスは常に素体（棒はアイテムではないため装備条件を作らない）、マレン（内部ID lydia）は杖staffを装備中ならmaren-v64、それ以外は素体。独立したリディアは未登場で、SCENARIO_STANDEE_VARIANTSには入れていない。

作者了承後の杖着脱：staffを装備可能にし、開始時は未装備。本人了承で装備するとmaren-v64へ、外すとmaren-emptyへ切替。外している間はfire/spark不可。

2026-10-08 作者指定：開始時はマレンのみ杖を装備し、杖あり姿で登場。他の3人は素体。再開始でも同じ初期状態に戻る。杖を外す・貸与すると素体になり、杖の魔法は使用不可。

2026-10-08 ランタン点灯表示：マレンが本人のランタンを所持し実点灯中の場合、採用済みmaren-lantern姿を優先表示。通常は杖姿、消灯・貸与後は現在の杖装備に応じた姿へ戻る。装備状態・魔法ルールは変えない。詳細 art-preview/maren-lantern-study/README.md。
