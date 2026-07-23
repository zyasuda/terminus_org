# trpg-data-model

TAS、mock2、Bevyゲームで共有するTRPGキャンペーンJSONのRustデータモデルです。

## 目的

- `campaign.json`と`chapter_XX.json`を同じ型で読み込む
- TASから出力されたJSONをBevy側で扱う
- 敵・loot・flagsOutなどの参照整合性を共通検証する
- 未知の追加項目を無視し、段階的な仕様拡張を可能にする

## Bevy側での利用例

```toml
[dependencies]
trpg-data-model = { path = "../TAS/rust/trpg-data-model" }
```

```rust
use std::fs;
use trpg_data_model::CampaignBundle;

let campaign = fs::read_to_string("data/campaign.json")?;
let chapter = fs::read_to_string("data/chapter_01.json")?;
let bundle = CampaignBundle::from_json(&campaign, &chapter)?;

for issue in bundle.validate() {
    eprintln!("データ警告: {}", issue.message);
}
```

このcrateはBevyに依存しない純粋なデータ層です。Bevy側では読み込み結果をECSのリソースやコンポーネントへ変換します。

## 検証

```bash
cargo test --manifest-path TAS/rust/trpg-data-model/Cargo.toml
```
