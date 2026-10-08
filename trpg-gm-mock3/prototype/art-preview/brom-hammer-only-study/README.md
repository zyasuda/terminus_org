# ブロム：盾なし・金槌のみ（作者採用済み、2026-10-08）

採用画像 review-v1.png（左=前面・右=背面）から、既存の process-image.mjs と Blender の板生成（maren-lantern の build.py を写し、パス・HEIGHT_U=0.9・シーン名だけ変更）で GLB を作成。ノーマルマップは適用しない。GLBの背面は板座標（直接UV）、PNG背面は自然な背面（板背面の左右反転）で、既存 brom-empty と同じ規則。

登録：assets/standees/brom-hammer-only.glb、art-preview/characters/brom-hammer-only-{front,back}.png。中間出力は plate/、記録は manifest.json。

板：はみ出し 前0%／背0%（上限3%）、余分な余白 前1.42%／背0.79%（上限5%）。plate-process.log。Blenderは権限承認付きでexit0（blender.log）。

検査：check-glb.cjs（Node 24）。身長・足元・板厚・材質構成・ノーマルマップ無し・埋め込み画像と板テクスチャの画素一致・PNG表裏の規則を確認、全項目OK（check-glb.log）。既存ブロム2体のGLBはノーマルマップ入りのため、材質の比較相手はノーマルマップ無しの maren-lantern。

未実施：scenario.js への variant 登録・standee-check.cjs への追加・ブラウザー表示確認（別担当）。見た目の最終確認は作者。
