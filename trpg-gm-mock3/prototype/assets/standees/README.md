# 舞台のスタンディー

Standee-wiz/public/models/から既存のv64 GLBをそのままコピーしています。元プロジェクト・sources.jsonは変更していません。

- ines-v64.glb ← ines-standee-v64.glb
- brom-v64.glb ← dwarf-warrior-standee-v64.glb
- gareth-sheathed.glb ← 作者了承済みgareth-sheathed-painted-review.pngの納刀姿（旧gareth-v64.glbは保持）
- lydia-v64.glb ← lydia-standee-v64.glb

各モデルは表の印刷面・裏の印刷面・輪郭の側面の3メッシュ、元モデルの板厚は0.04舞台座標です。舞台では全軸に同じ倍率を使い、厚みを潰しません。印刷範囲の足裏をy=0へ合わせます。表・裏は印刷済みの陰影を保つMeshBasicMaterial、側面は透過率を調整してあります。

実モデルの解析：node prototype/standee-check.cjs。画像復号はこの検査では代替し、実ブラウザーで4体の読み込みと描画を確認しています。

ガレス納刀姿（2026-10-07）：Standee-wizの既存process-image.mjsと既存Blender板作成処理を利用。カラーグレード・ノーマルマップは本編に適用しない。正規化された背面テクスチャは既に反転済みなのでGLBのUVは再反転しない。PNGの背面フォールバックだけ自然な背面へ戻す。所持品の短剣・威力・貸与ルールは変更していない。装備着脱と表示の連動は未接続。
