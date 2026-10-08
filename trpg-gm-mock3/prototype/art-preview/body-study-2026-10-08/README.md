# 装備なし素体の採用前レビュー（2026-10-08）

比較画像は左2体が既存素材、右2体が素体案。各組は正面・自然な背面。暗色背景、同じ表示枠、足元基準で比較しています。元素材の透明なプレート縁を含むため、厳密な身長比較には使いません。

- マレン：杖を除去。服、ベルト、ポーチを保持する依頼。
- イネス：手の棒を除去。服、ベルト、ポーチを保持する依頼。生成背面が板座標の反転を保持したため、背面だけ水平反転して自然な背面に修正。generatedが生成原本、reviewが補正後。
- リディア：独立したlydia-v64素材を参照。ランタン（持ち手含む）と外付けの縄を除去。服、革ベルト、ポーチ、腿のストラップを保持する依頼。現在マレンとして表示される内部ID lydiaとは別素材です。

画像編集指示：元の顔・髪・衣服・姿勢・画風を保ち、上記の持ち物だけを外す。空の手を自然に補完する。正面左、自然な背面右、透過RGBA、文字・床影・青いプレート輪郭・新しい持ち物なし。

生成による顔・体格・衣服の細部変化は採用時に作者が確認します。ゲーム登録・GLB作成・開始時表示の変更はしていません。

検査：`node prototype/art-preview/body-study-2026-10-08/check-bodies.cjs`。check-results.txtは生出力。透明画素と左右の非空像を確認する技術検査で、見た目や同一人物性の合否は判断しません。

## ゲーム登録（2026-10-08、作者採用後）

3体ともreview（正面左・自然な背面右。イネスはgeneratedではなくreview）を、ガレス素体と同じ`/private/tmp/brom-standee-tools/tools/standee-preview/process-image.mjs`へ入力し、`/private/tmp/gareth-empty-build.py`のパス・身長・scene名だけ替えたBlender処理（`--factory-startup`の一時scene、ノーマルマップ不使用）でGLB化。各`<id>-plate/`に中間素材・`layout.json`・`build.py`・GLBを保存。生出力は`plate-process.log`。

| 素材 | はみ出し 前/背 | 余分な余白 前/背（上限5%） | figure | plate |
|---|---|---|---|---|
| ines-empty | 0.00%/0.00% | 0.97%/0.50% | [301,82,676,1179] | [272,50,709,1212] |
| maren-empty | 0.00%/0.00% | 3.44%/2.72% | [126,64,685,1232] | [92,29,722,1264] |
| lydia-empty | 0.00%/0.00% | 1.82%/0.70% | [201,74,680,1234] | [164,40,717,1267] |

plateはplate-mask.pngの128以上の範囲。lydiaの身長はマレン（lydia-v64系）と同じ172cm相当で仮置き（舞台ではfigure/plateで正規化）。

登録先：`assets/standees/{ines,maren,lydia}-empty.glb`、`art-preview/characters/{ines,maren,lydia}-empty-{front,back}.png`。front.pngは板の表と画素一致、back.pngは板の裏を左右反転した自然な背面（反転後に画素一致）。開始時の舞台へ接続したのはイネスとマレンのみ。独立リディアは未登場のため素材登録だけ。

実ブラウザー（8797）：`browser-start-front.png`（開始時4体とも素体・正面）、`browser-start-maren-back.png`（ランダムな後ろ向きでマレン背面）、`browser-battle-back.png`（戦闘プレビューで4体の背面）。`browser.log`に舞台の差分・読み込んだGLB/PNG・HTTP失敗なしを記録。

作者了承後の杖着脱：staffを装備可能にし、開始時は未装備。本人了承で装備するとmaren-v64へ、外すとmaren-emptyへ切替。外している間はfire/spark不可。

2026-10-08 作者指定：開始時はマレンのみ杖を装備し、杖あり姿で登場。他の3人は素体。再開始でも同じ初期状態に戻る。杖を外す・貸与すると素体になり、杖の魔法は使用不可。
