リディアのワイン衣装を作者添付 `aurora_6b4dd1a6.png` を元に作った新版 `assets/lydia/wine-empty-v3.png` へ置換する。ランタンと腰のロープは削除し、両手を素手にした。画像生成と素材配置は済み。旧wine-empty-v1/v2やdesigns候補は保存し、通常衣装/他キャラ/mock3既存変更/直前の全差分を保護。編集範囲standee-workshopのみ。commit/push/依存追加/画像の再加工/生成/ブラウザ操作禁止。
読む: wardrobe.js app.js index.html check.cjs measure-lydia.cjs README.md。新画像のブロンド編みポニーテール、ワイン色キルトベスト、黒緑ショーツ、素脚・長ブーツを登録する。手持ち機能は追加しない。
新画像の実寸・alpha128で前後のheadTop/headX/footYを測りLYDIA_WINE_SRCと画像srcを更新、172cm・足裏1140維持。measure-lydia.cjsもv3を測る。画像寸法が違う場合は左右境界を実寸から導く。LYDIA outfitLabel wineは『ワインの旅装・素手』のまま。canvas aria-label/棚説明の素手表記を維持。衣装切替、undo、前後、キャラ切替の動作を壊さない。
index.htmlのscript2つの?v=lydia-wine-v2をv3へ。READMEの現行衣装と測定値を更新。check.cjsの旧wine寸法・測定値・v2指定をv3の実測値へ更新、旧v1/v2は保持確認。衣装切替状態検査は維持。
Node24でnode check.cjs / node --check app.js / node measure-lydia.cjs / git diff --check -- standee-workshopを実行し、終了コードと生出力を報告。sharpは測定のみ。秘密情報を読まない。
