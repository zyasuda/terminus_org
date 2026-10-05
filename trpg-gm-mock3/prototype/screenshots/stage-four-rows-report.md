# 4段階・内向きの検証

2026-10-05。1280×720、入口点灯・会話欄を畳んだ状態。同じ配置で角度のみ変更。

- stage-facing-zero.png: 0度
- stage-four-rows.png: 最大12度
- 実画面: lydia:middle,ines:front,brom:back,gareth:front
- 角度: lydia:12.0,ines:4.8,brom:-0.9,gareth:-11.4
- GMのスライダーをHomeで0度へ変更し全員0度を確認。初期値復帰で12度へ戻る。
- 4人のGLB読み込み。JavaScriptエラー0件。
- 戦闘の配置は実際のThreeオブジェクトを検査用状態で確認。今回の実戦闘プレイは未実施。

## 検査の生出力

```text
$ node --check prototype/stage.js
exit code: 0
```

```text
$ node prototype/lighting-check.cjs
{"heightCm":[["ines",155],["brom",135],["gareth",184],["lydia",172]],"upperPan":3.04,"bustEdge":-1}
{"battleRows":[{"id":"ines","row":"middle","z":1.1300000000000001,"angle":4.623429314509847},{"id":"brom","row":"front","z":2.2,"angle":10.85721530745104},{"id":"gareth","row":"middle","z":1.1300000000000001,"angle":-3.688285342745076},{"id":"lydia","row":"back","z":0.06000000000000005,"angle":-12.000000000000002},{"id":"guardian_rampage","row":"farthest","z":-1.0099999999999998,"angle":0}]}
{"characterHeightAt700px":{"before":428.78,"after":312.83},"depthWidth":{"before":4.5,"after":2.6},"horizonPercent":54}
PASS: 42 checks — 発言者追従 / 7秒後の消灯 / 手動照明 / 色・広がり / 不在の人物 / 暗闇の保護 / 再点灯 / 明るさ0 / シーン移動 / 入力状態の保護 / 人物縮小・消失点・平行移動・回転の固定・4段階の立ち位置・内向きの角度・狭い画面での調査 / スタンディー・足元の影・床の質感
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

