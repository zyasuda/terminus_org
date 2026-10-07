# 舞台の小道具

mine-cart-v1.png：imagegenで生成した古い木製台車。1536×1024、RGBA。完全透明画素41.9245%、不透明な輪郭の範囲x91〜1464／y34〜958。足元は画像下端の透明66pxを引いて接地させます。生成元：/Users/yasuda_k/.codex/generated_images/01a0fbf5-9adf-7df0-a172-c31129aee059/exec-aee4dee5-e983-4673-8f0f-9be298827508.png

前景の岩 art-preview/scenery/foreground-rock-v02.png は、配置の不自然さを避けるため舞台から一旦外しています。生成済み素材の原画像は保管しています。

sky-dusk-v1.jpg：夕暮れの空と山並み。2000×900、透過なし。作者が仮素材として渡した画像（2026-10-07）。坑道入口の背景の透明な空の部分から見せる奥の層。mock2 の `images/s1_sky_parallax.png`（1870×841）と同系統の絵とみられるが未確認。

ground-coal-gravel-v1.png：床の地面（踏み固めた土に石炭くずと砂利）。1024×1024、継ぎ目なく繰り返せる真上からの絵。Codexが image_gen で生成（2026-10-07、依頼文 `prompts/floor-painted-ground.v1.txt`）。1枚が約70cm＝舞台1.94で、床へ36回繰り返す。3案（湿った泥・石炭くずと砂利・露出した頁岩）から作者が選んだ。継ぎ目の色差は内側の隣り合う画素差の1.3〜1.6倍、外周の明るさは中央の1.00倍。
ground-coal-gravel-v1-normal.png：上の絵の明るさを高さとみなし、端を回り込ませた Sobel で作ったノーマルマップ（Blender の Python で計算、強さ4）。今は全部の部屋で同じ絵を使い、部屋ごとの色（`SCENARIO_PALETTES`）で明るさと色味を変えている。
