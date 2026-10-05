# 視点UI・身長の調整

2026-10-05。実ブラウザー1280×720、入口を点灯して会話欄を畳んだ状態。

- stage-simple-controls.png: 正面。左右の2ボタン。
- stage-bust-limit.png: ドラッグで上限panY=3.40まで移動。胸元が画面下端に残る。
- sheet-height.png: イネス155cmの表示。
- シートを順に切り替えて135・184・172cmも確認。
- 左ボタンでpanX=-1.00、上下位置3.40を維持。
- JavaScriptエラー0件。高さは試作値、イネス以外は既存素材の設定。
- 戦闘は自動検査用状態で確認。実戦闘の通しプレイは今回未実施。

## 検査の生出力

```text
$ node --check prototype/stage.js
exit code: 0
```

```text
$ node prototype/lighting-check.cjs
{"heightCm":[["ines",155],["brom",135],["gareth",184],["lydia",172]],"upperPan":3.04,"bustEdge":-1}
{"characterHeightAt700px":{"before":428.78,"after":312.83},"depthWidth":{"before":4.5,"after":2.6},"horizonPercent":54}
PASS: 36 checks — 発言者追従 / 7秒後の消灯 / 手動照明 / 色・広がり / 不在の人物 / 暗闇の保護 / 再点灯 / 明るさ0 / シーン移動 / 入力状態の保護 / 人物縮小・消失点・平行移動・回転の固定・3段階の立ち位置・狭い画面での調査 / スタンディー・足元の影・床の質感
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

