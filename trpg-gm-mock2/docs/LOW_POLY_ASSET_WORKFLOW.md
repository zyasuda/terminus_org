# mock2 3Dローポリアセット制作フロー

## 結論

Blenderで**1体または1背景を完成品としてレンダーし、既存のPNG/JPEGアセットとして使う**方法を採用します。ゲーム実装を3D化しないため、現行の`assets.json`・シーンJSON・表示コードを変えずに画風だけ検証できます。

最初の試作対象は`錆喰い`です。背景・パララックスを先に変えず、1体でシルエット、配色、光、透過PNGの品質を決めます。

## 一回の制作手順

1. `assets/blender/<asset>-v01.blend`を作る。単位はm、モデルは原点付近、命名は英小文字とハイフンを使う。
2. 形をキューブ、Icosphere、円柱だけで作り、Shade Smoothは使わない。最初は1モデルあたり3材質以内にする。
3. カメラを固定する。背景は16:9、敵・人物は縦長で、ゲーム内の既存表示と同じ向き・余白にする。
4. Eeveeで透明PNGをレンダーする。背景はJPEG、スプライトはRGBA PNGにする。
5. `assets/_staging/<asset>/`で実物を開いて確認する。合格したものだけを`images/`へコピーして台帳とJSON参照を更新する。
6. `npm run check:assets`を実行する。シーン1を変える場合だけは、2400×1080の継ぎ目なし`sky`と1920×1080透明PNGの`fg`を同時に作る。

## 固定するルック

- 色: 鉱山は濃い青灰、錆は赤茶、重要物だけ黄橙か青白にする。
- 光: 暖色のキーライト1灯、寒色のフィルライト1灯。画面が暗くてもシルエットを失わない。
- 密度: 小さなノイズや傷をテクスチャで増やさず、面の角度と大きな色面で読ませる。
- UI: 背景の下3割は暗く平坦にする。敵スプライトは被写体の周囲に余白を残し、地面を描かない。

## このリポジトリの最小構成

```text
assets/blender/                 # 編集可能なBlender原本（採用版を保存）
assets/_staging/<asset>/        # レンダー候補と比較用。ゲームから参照しない
images/                         # 承認済みのゲーム用書き出し
public/data/assets.json         # 実ファイル・用途・状態の台帳
```

`tools/blender/create_low_poly_rust_eater.py`は、Blender 5.2 LTSで試作モデル、カメラ、2灯ライティング、透過PNGを一度に作る学習用の最小例です。

```bash
'/Applications/Blender.app/Contents/MacOS/Blender' --background --python tools/blender/create_low_poly_rust_eater.py
```

出力先は次です。

- `assets/blender/rust-eater-v01.blend`
- `assets/_staging/low-poly-rust-eater/low-poly-rust-eater-v01.png`

## 採用判定

- 128px程度まで縮小しても敵種別が分かる。
- 背景との明暗差があり、黒シルエット化しても形が読める。
- PNGの透明背景に黒縁・床・不要な影がない。
- 同じカメラ、ライト、配色で次の敵も作れる。

レンダー候補を採用するまでは`images/`、`assets.json`、キャンペーンJSONを変更しません。
