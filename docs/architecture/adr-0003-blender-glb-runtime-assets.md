# ADR-0003: Blender原本からGLBを実行時に読み込む

## Status

Accepted

## Date

2026-08-05

## Context

現行mock2ではBlender作品を透過PNGへレンダーする方針だった。一方、この試作は同じモデルを会話と戦闘で異なる距離から見る常設3D舞台である。

## Decision

Blenderの`.blend`を編集原本、`public/models/*.glb`をゲーム実行用ファイルとする。最初の導入対象は錆喰いである。PNGレンダーは会話用立ち絵が必要になった時だけ、同じ`.blend`から別途書き出す。

## Consequences

- 同じ敵モデルを会話・戦闘で共有できる。
- Blender原本と実行用GLBの両方を更新する手順が必要になる。

## Validation Criteria

- 錆喰いのGLBがThree.js上で読み込まれる。
- GLB未読込時も仮フィギュアで戦闘が継続する。

## Related Decisions

- [ADR-0001: アイソメトリック常設舞台の独立試作](adr-0001-isometric-stage-prototype.md)
- [ADR-0002: 会話モードとバトルモードを分離する](adr-0002-dialogue-and-battle-modes.md)
