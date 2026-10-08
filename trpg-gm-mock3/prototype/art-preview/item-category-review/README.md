# 持ち物分類・操作の検証（2026-10-08）

実装条件はprototype/README.mdの最新「持ち物の分類」を参照。

実ブラウザ8797/prototypeで、マレンに杖の所持を質問してから持ち物シートを開き、装備品・使用アイテムの分類を確認。ランタンの使うよう頼むボタン→実AI了承で点灯。地図の使うよう頼むボタン→実AI了承で地図表示（map-open.png）。

杖への持ち替えボタンは最初の2回、設定照合保留・本人拒否で未実行（状態保持）。依頼に含む品が選択済みであり、外す品と消灯は同時処理することをAIの入力へ明示するよう修正。新しい初期状態（ランタン装備・未点灯）で杖装備を依頼し、実AI了承→杖装備・ランタン未装備・杖姿を確認（staff-swapped.png）。点灯中の了承から消灯までと本人拒否で状態を保持する経路はinventory-checkの模擬返答による状態検査で確認しています。

items.png/use-items.pngはスクロール位置を変えた持ち物欄。未開示品は本人に聞くまで非表示。地図の使用は探索中で明かりがある場合のみ有効。状態表示と操作は別列。

check-results.txtはinventory91・ui76・lighting136・lantern55・navigation71の生出力。check・opening35・exploration208・profile33・roleplay32も実行して終了コード0。git diff --check終了コード0。全体の既知scenario-parity/playtest失敗は今回の範囲外で未修正。
