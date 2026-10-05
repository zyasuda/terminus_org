Three.js 0.185.1 (MIT)

mock2に導入済みの公式threeパッケージから、同じ版のブラウザー用ビルドをコピーしています。
ネットワーク/CDNへの依存を避け、mock3単体の静的配信で利用します。

- three.module.min.js
- three.core.min.js
- LICENSE（同梱ライセンス）

用途はprototype/stage.jsの描画だけです。ゲーム状態の更新は行いません。

GLTFLoader.js / BufferGeometryUtils.js / SkeletonUtils.jsも同じ導入済み0.185.1からコピー。bare importだけローカルのthree.module.min.jsへの相対参照に変更しています。新たなnpm依存・CDN通信はありません。
