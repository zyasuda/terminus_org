# 舞台のスタンディー

Standee-wiz/public/models/から既存のv64 GLBをそのままコピーしています。元プロジェクト・sources.jsonは変更していません。

- ines-v64.glb ← ines-standee-v64.glb
- brom-v64.glb ← dwarf-warrior-standee-v64.glb
- gareth-v64.glb ← gareth-standee-v64.glb
- lydia-v64.glb ← lydia-standee-v64.glb

各モデルは表の印刷面・裏の印刷面・輪郭の側面の3メッシュ、元モデルの板厚は0.04舞台座標です。舞台では全軸に同じ倍率を使い、厚みを潰しません。印刷範囲の足裏をy=0へ合わせます。表・裏は印刷済みの陰影を保つMeshBasicMaterial、側面は透過率を調整してあります。

実モデルの解析：node prototype/standee-check.cjs。画像復号はこの検査では代替し、実ブラウザーで4体の読み込みと描画を確認しています。
