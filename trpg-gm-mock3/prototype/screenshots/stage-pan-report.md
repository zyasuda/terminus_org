# 舞台の平行移動・3段階の立ち位置

2026-10-05。前後の画面は926×914、点灯した入口・会話欄を畳んだ状態。

- 正面: stage-pan-front.png
- 上方向: stage-pan-upper.png
- 狭い表示枠での調査: stage-pan-mobile.png
- 縦ドラッグ: panX=0.00 / panY=4.12
- 横ドラッグ: panX=-3.91 / panY=0.00
- 上限: panY=5.00
- 狭い画面の台車操作: panX=-6.00。調査パネルの画像・操作ボタンが表示。
- 4モデル読み込み。ブラウザーJSエラー0件。
- 戦闘配置はテスト用状態で検証。今回、戦闘を実際に通して遊ぶ検証は未実施。

## 検査コマンドの生出力

```text
$ node prototype/lighting-check.cjs
{"characterHeightAt700px":{"before":475.81,"after":347.14},"depthWidth":{"before":4.5,"after":2.6},"horizonPercent":54}
PASS: 34 checks — 発言者追従 / 7秒後の消灯 / 手動照明 / 色・広がり / 不在の人物 / 暗闇の保護 / 再点灯 / 明るさ0 / シーン移動 / 入力状態の保護 / 人物縮小・消失点・平行移動・回転の固定・3段階の立ち位置・狭い画面での調査 / スタンディー・足元の影・床の質感
exit code: 0
```

```text
$ node prototype/standee-check.cjs
{"id":"ines","bytes":3222196,"meshes":3,"printedSurfaces":2,"plateThickness":0.04}
{"id":"brom","bytes":3707932,"meshes":3,"printedSurfaces":2,"plateThickness":0.04}
{"id":"gareth","bytes":4375992,"meshes":3,"printedSurfaces":2,"plateThickness":0.04}
{"id":"lydia","bytes":3684140,"meshes":3,"printedSurfaces":2,"plateThickness":0.04}
PASS: 24 checks — 実GLBの解析 / 表・裏・側面 / アクリル板の厚み / 有効な寸法
exit code: 0
```

```text
$ node prototype/ui-check.cjs
PASS: 33 checks — 発見の重複整理・本人限定 / 未共有と共有済み / 現在の申し出・保留 / 古い申し出の除外 / 実結果の表示と会話形式維持 / 本人の情報共有 / 寄り絵の発見条件・状態保護 / 持ち物の画像・用途開示・所有追従
exit code: 0
```

```text
$ git diff --check
exit code: 0
```

