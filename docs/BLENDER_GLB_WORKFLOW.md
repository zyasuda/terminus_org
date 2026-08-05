# Blenderからゲームへ入れる最小手順

1. `assets/blender/<asset>-v01.blend`をBlenderで編集する。原点は足元、Z軸を上、前方は-Yにする。
2. ライト・カメラは原本に残してよいが、ゲーム用GLBにはメッシュだけを書き出す。
3. 次を実行する。

```bash
'/Applications/Blender.app/Contents/MacOS/Blender' --background assets/blender/rust-eater-v01.blend --python tools/blender/export_glb.py
```

4. `public/models/rust-eater-v01.glb`をゲームで確認する。採用前のモデルは置換せず、`v02`として増やす。

味方の初期モデルを作り直す時は次を実行する。

```bash
'/Applications/Blender.app/Contents/MacOS/Blender' --background --python tools/blender/create_low_poly_party.py
```

坑道蝙蝠を作り直す時は次を実行する。

```bash
'/Applications/Blender.app/Contents/MacOS/Blender' --background --python tools/blender/create_mine_bat.py
```

灯りの番人を作り直す時は次を実行する。

```bash
'/Applications/Blender.app/Contents/MacOS/Blender' --background --python tools/blender/create_guardian.py
```

会話用のバストショットが必要になった場合だけ、同じ`.blend`から別カメラでPNGをレンダーする。3D舞台のモデルと2D画像を別々に作らない。
