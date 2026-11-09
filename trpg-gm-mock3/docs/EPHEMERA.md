# EPHEMERA — 世界観と Standee-wiz から流用できるもの(2026-11-09)

mock3 と Standee-wiz(1人用のダンジョン探索、`~/Desktop/Standee-wiz`)は、同じ世界観 **EPHEMERA** のゲームです。
作者の了承(2026-11-09): ゲーム性は別にして、世界観・デザイン・素材・スタンディーは流用してよい。

## 取り込んだもの

| もの | mock3 の場所 | 元 |
|---|---|---|
| タイトル画面(暗い水面に沈む紙片のロゴ、雨粒の波紋、PRESS START) | `prototype/title.html` | `Standee-wiz/title-prototype.html`(3c3db17)。変えたのは three.js と画像の読み込み先だけ |
| タイトルの紙片の画像 | `prototype/assets/title/ephemera-title-restored.png` | `Standee-wiz/public/title/` |
| タイトルの後に黒地へ出す一言(30文) | `prototype/index.html` の起動部分 | `Standee-wiz/src/expedition/aphorisms.js`(オリジナルの文) |

起動の流れ: タイトル → PRESS START → 黒地に一言(2秒) → ゲーム。Standee-wiz の `main.jsx` と同じ流れです。
- URLに `?…` が付いているとき(検査・録画・開発)は、タイトルを通さずにゲームへ直行します。
- ゲームはタイトルの裏で先に組み立てます。立体舞台が、組み立て済みの状態を前提に起動するためです。後にすると、舞台が従来の平面表示に落ちることを実測しました。

## 世界観の用語(Standee-wiz の資料で確認できたもの)

| 用語 | 中身 | 確認した場所 |
|---|---|---|
| EPHEMERA / 儚きもの | 題名。ロゴの添え書きは「SMALL JOURNEYS / LASTING STORIES」 | タイトルの画像、`docs/README.md` |
| 燈火の街 | 冒険の拠点の街。ギルド・宿屋・パブ・道具商・魔法商・噴水・凱旋門・神殿がある | `docs/CODE_MAP_2026-09-30.md` |
| 灯石 | 青い塵が集まった石。Standee-wiz では袋の通常の品で、精製して照明弾やMP回復品にする | `docs/BATTLE_ABILITY_PROGRESSION_DESIGN.md` |
| 青い塵 | 灯りを消すと、暗闇の中で集まる場所が見える | `docs/README.md`(地下1階の案内文) |
| 往還石 | 3回分使える、街へ帰る石 | `docs/README.md` |

mock3 の灯石の決定(`SPEC.md` 5.8)とは、使い方が少し違います。mock3 では、照らすのは何度でもでき、MPを回復すると塵に還ります。どちらに揃えるかは未決です。

## 取り込んでいないが、使えるもの

必要になった時点で写します。今は写していません。

- **キャスト(スタンディーGLB、`Standee-wiz/public/models/`):** ヴェスパー、ゴブリン、スライム、ウィスプ、錆喰い(rust-eater)、ドワーフの戦士(ブロムの元)。
- **イネス・ガレス・マレン・リディアのGLB:** Standee-wiz 側は 2026-10-20 版で、mock3 にある 10-01〜10-08 版とは中身が違います。mock3 の版は装備の差分と対になっているので、上書きしていません。
- **顔画像(`Standee-wiz/assets/portraits/`):** 上の6人分。
- **街の背景(`Standee-wiz/public/town/`):** 城・石畳・遠景・噴水・各施設の11枚。
- **開発用MCP(`Standee-wiz/docs/MCP_DEV_TOOL.md`):** ゲームを実際の処理のまま操作し、行動の前後を記録する仕組みです。mock3 で「席の窓口」とMCPを作るときの手本になります。
