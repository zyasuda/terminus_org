作者承認済みの落ち着いた原画の質感を、ブロム全6状態×前後12姿へ反映。Codexがassets/brom/muted-{axe-shield,axe,hammer-shield,hammer,shield,empty}-v1.pngを用意。まず全6枚があること確認。
読む: wardrobe.js,app.js,index.html,measure-brom.cjs,check.cjs,browser-check.cjs,README.md。編集standee-workshopのみ。mock3/旧tool/既存未コミット変更保護。秘密/.env/Terminus外/BORG読取禁止、commit/push/公開/新依存/新抽象/保存禁止。元画像編集禁止。
既存6状態と操作を保ち、全12姿のsrc/crop/頭足中心/握りと盾中心を新素材に差替え。α128でmeasure-brom計測、既存TOP450/FOOT1140/X328へ揃える。頭足位置やサイズを勝手に変えない。左右はみ出しは数値報告。盾中心が変わるので当たり位置を元絵の見える部分に合わせる。appプリロード/棚サムネも新素材に全差替え。古い素材は削除しない。READMEへ作者承認の落ち着いた色味反映と生成による細部差が残る旨、現行だけ簡潔に記載。
全12姿の状態/前後/右手武器排他/盾独立/持替え/取り消し/キャラ保持/舞台袖/390px/ガレスマレン既存回帰。既存check/browser-checkの固定測定値や旧素材assertは新実測へ更新し、測った結果を報告する。検査閾値を緩めて通さない。スクリーンショットbrom-muted-{empty,hammer,shield,both,axe,axeShield}-{front,back}.png とbrom-muted-390.pngを保存。ノイズ不要の同条件比較HTML(brom-muted-preview.html)へ12画像を並べる。Codexが視認判断する。
表示色の方向はCodex指定：生成時に色が少し強くなったため、新ブロムの人物層に共通canvas filter='brightness(0.86) saturate(0.72)'を掛け、暗く低彩度に寄せる。drawLayerのsave/restore内でlayer.filterがあれば適用する最小変更でよい。BROMの全layersで同じfilter指定、ガレスマレン影響なし。棚サムネにも同値適用。寸法やalpha検査は変わらない。作者判断用の見た目画像にはフィルタ反映。スライダー不要。
Node24。変更ファイル、コマンド/終了コード/生出力最後30行、描画後頭足xと左右範囲、未確認事項を報告。見た目合否は決めない。
