# ガレス：納刀姿の視認性調整（作者採用済み、2026-10-08）

## 生成由来

Codexの組み込みimage_gen（gpt-image）で、作者了承済みの `../gareth-equipment-study/gareth-sheathed-painted-review.png` を参照に1回編集した生成物を `review-v1.png`（1312×1199 RGBA、左=前面・右=自然な背面）として保存。指示は鞘と納めた片手剣だけを変更：鞘の幅を約35%広げ、明るい革色、鞘口・鞘尻の淡い鋼、鍔と柄の輪郭を明確化、左脚から少し離す。顔・衣装・ポーズ・長さ・取り付け位置は維持。プロンプト全文は `prompt.txt`。`comparison.png` は左=現行（gareth-sheathed）、右=本案を同じ縮尺で並べたもの。

## 作者採用

作者が `comparison.png` の右（`review-v1.png`）を採用し、本編への組み込みを承認（2026-10-08）。デザインはそのまま使い、加工以外の変更はしていない。

## 工程

ブロム金槌のみと同じ工程（`../brom-hammer-only-study/README.md`）。

1. `/private/tmp/brom-standee-tools/tools/standee-preview/process-image.mjs review-v1.png plate`（Node 24）。出力 `plate/`、ログ `plate-process.log`。はみ出し 前0.00%／背0.00%（上限3%）、余分な余白 前0.92%／背0.83%（上限5%）。
2. `plate/layout.json` に無い plate は `plate-mask.png` の白画素範囲（終端を含む、ブロム金槌のみと同じ数え方）から [113,30,715,1258] を追記。figure は [148,63,679,1225]。
3. `plate/build.py`：`../brom-hammer-only-study/plate/build.py` の写し。パス・`HEIGHT_U=1.2266666667`（184cm / 1.5）・scene名だけ変更。板厚0.06m/1.5=0.04、足元原点、ノーマルマップ無し、背面材質は直接UV。`Blender --background --factory-startup --python plate/build.py` で exit 0（`blender.log`、exporterの複数tex image警告2件は既存と同じ）。
4. 登録：`assets/standees/gareth-sheathed-visible.glb`（plate/のGLBと同一）、`art-preview/characters/gareth-sheathed-visible-front.png`（plate/front.png と同一）、`-back.png`（plate/back.png の左右反転＝自然な背面）。旧 `gareth-sheathed` 一式は比較・記録として保持。

## 検査

- `check-glb.cjs`（Node 24、`check-glb.log`）：身長1.29951（gareth-empty 1.30027）、足元 min.y −0.03695（同 −0.03733）、板厚0.04、z中心0、材質構成・ノーマルマップ無し、埋め込み画像と板テクスチャの画素一致、PNG表裏の規則（gareth-emptyも同規則）。全項目OK・PASS。
- 実ブラウザー（`browser-check.cjs`、`browser.log`、1440×900、既存の8797/8798サーバー、実AI）：チャット「ガレス、片手剣を腰に下げておいて」→本人了承→装備、「マレン、ランタンを点けて」→点灯。`gareth:gareth-sheathed-visible` を読み込み（GLB 200）、装備不足・読み込みエラーなし、調査札2枚と人物4体の画面範囲の重なり0件。画像 `browser-equipped-lit.png`（舞台）、`browser-equipped-lit-full.png`（全体）。コンソールはWebGLのReadPixels性能警告のみ。

見た目の最終確認は作者。未コミット・未push。
