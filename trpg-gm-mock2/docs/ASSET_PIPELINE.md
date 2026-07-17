# mock2 アセット生成・確認・反映パイプライン

## 目的

画像を生成する場所、採用を判断する場所、ゲームが実際に読む場所を分離する。
生成途中の候補を実運用画像として誤って使わないこと、シナリオの秘密を画像が先に開示しないことを優先する。

## 正本と役割

- BORG `TRPG/MockDocs/WIP/ASSET_LIST.md`: 素材の目的、仕様、優先度、未決事項。
- BORG `TRPG/TAS/ASSET_PIPELINE.md`: 生成・レビュー・承認の運用仕様。
- `public/data/assets.json`: mock2が参照する機械可読な素材台帳。
- `public/data/chapter_01.json`: シナリオ上の表示用途と開示タイミング。
- `images/`: 承認済み素材のみ。実行時に`/images/`で配信する。
- `assets/_staging/`: 生成候補・比較画像。Git管理対象外。

## 状態

`pending` → `candidate` → `approved` → `implemented`

採用しない候補は`rejected`、判断保留は`hold`とする。`approved`の素材は必ず`images/`に存在させる。

## 1素材の手順

1. ASSET_LISTから素材IDを1つ選ぶ。
2. 用途、構図、解像度、透過、開示条件、禁止事項をプロンプトに含める。
3. 生成結果を`assets/_staging/<asset-id>/`へ保存する。
4. 候補を確認する。背景は16:9とUIの文字領域、スプライトは透過境界と正体の早期開示、ポップアップは内容の読みやすさを確認する。
5. `assets.json`の`status`を`candidate`にし、候補名とプロンプト版を記録する。
6. 承認した候補だけを`images/<file>`へ配置し、`status`を`approved`にする。
7. `npm run check:assets`を実行する。
8. 実機またはブラウザで表示を確認し、問題がなければ`implemented`にする。

## 実装上の契約

- `chapter_01.json`に登場する`img`、`bg`、`sprite`、`parallax.sky`、`parallax.fg`は、すべて`assets.json`へ登録する。
- `approved`の素材が不足している場合、アセット検査は失敗する。
- `pending`・`hold`・`rejected`の未配置は警告に留める。これにより画像生成前でもmockのビルドを止めない。
- 画像ファイル名はシナリオJSONの参照と一致させる。候補のバージョン名はステージング内だけで使い、採用時に正式名へコピーする。

## 開発コマンド

```bash
npm run check:assets
npm run build
```

## 初回生成の順番

1. `s2_junction.jpg`
2. `s2_barrier.jpg`
3. `s3_chamber.jpg`
4. `s3_guardian.png`
5. `s4_village.jpg`
6. `s1_sky.jpg`
7. `s1_foreground.png`
8. `s2_rust_eater.png`

`s2_barrier.jpg`は現行データが「木柵」であるため、既存の`locked_iron_gate.jpg`を自動採用しない。
