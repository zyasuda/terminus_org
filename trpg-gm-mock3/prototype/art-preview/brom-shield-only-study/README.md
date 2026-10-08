# ブロム：金槌なし・盾のみ（作者採用済み、2026-10-08）

採用画像 review-v1.png（左=前面・右=背面）から、brom-hammer-only-study と同じ工程（process-image.mjs → plate/build.py → check-glb.cjs）で GLB を作成。build.py と check-glb.cjs は hammer-only の写しで、パス・シーン名・IDだけ置換。HEIGHT_U=0.9、板厚0.04、ノーマルマップなし。GLBの背面は板座標、PNG背面は自然な背面（板背面の左右反転）で、既存 brom-empty と同じ規則。

登録：assets/standees/brom-shield-only.glb、art-preview/characters/brom-shield-only-{front,back}.png。中間出力は plate/、記録は manifest.json。

板：はみ出し 前0%／背0%（上限3%）、余分な余白 前1.18%／背1.43%（上限5%）。plate-process.log。Blender exit0（blender.log）。

検査：check-glb.cjs（Node 24）全項目OK・PASS（check-glb.log）。

未実施：scenario.js への variant 登録・standee-check.cjs への追加・ブラウザー表示確認（別担当）。見た目の最終確認は作者。
