# マレンのランタン持ち姿（作者採用済み、2026-10-08）

通常は杖の装備状態に応じてmaren-v64／maren-empty。マレン本人がランタンを所持し、実際に点灯中ならmaren-lanternを優先表示します。消灯または貸与すると現在の杖装備に合う姿へ戻ります。杖の装備状態・魔法の可否は表示切替では変更しません。戦闘プレビューの擬似照明だけではランタン姿になりません。借り手用のランタン姿は未作成です。

採用画像maren-lantern-review.pngは、元マレンとリディアのランタンを参照。prompt.txtが生成指示。既存process-image.mjsとマレン素体build.pyの板生成処理を再利用。ノーマルマップは本編に適用しません。GLBの背面は板座標、PNG背面は自然な背面です。

登録：assets/standees/maren-lantern.glb、art-preview/characters/maren-lantern-{front,back}.png。中間出力はplate/。

板のはみ出し：前0.07%／背0.10%（上限3%）。余分な余白：前4.34%／背3.49%（上限5%）。plate-process.logに生出力。Blenderはサンドボックス内でexit139、権限承認付き再実行でexit0。

検証：lighting136（点灯・消灯・返却・貸与・杖未装備・プレビュー）、standee60、lantern55、inventory85、opening35、check。今回の検査生出力はintegration-check-results.txt。

実画面：起動済8797/prototypeの一時タブで、実AIへ「ランタンを灯してください」→本人了承・maren-lantern、続けて「ランタンを消してください」→本人了承・maren-v64に戻ることを確認。browser-lit.png／browser-doused.pngを保存。ブラウザconsole errorは0件。
