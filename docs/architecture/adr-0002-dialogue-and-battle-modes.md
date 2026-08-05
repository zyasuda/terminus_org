# ADR-0002: 会話モードとバトルモードを分離する

## Status

Accepted

## Date

2026-08-05

## Context

### Problem Statement

敵の表示トグルで探索と戦闘を兼用すると、会話中にも手番・HP・攻撃UIが残り、何の状態か分かりにくい。

### Constraints

- 同じ3D舞台とユニット配置を再利用する。
- 現在の決定論的な戦闘コアを変えない。
- 現行mock2は変更しない。

### Requirements

- 会話中は戦闘UIと敵行動を起動しない。
- 戦闘開始時に舞台や人物位置を再生成しない。

## Decision

画面状態を`dialogue`と`battle`に分ける。`dialogue`では味方・調査・会話カードのみを表示し、敵、手番、HP、移動・攻撃UIを表示しない。`battle`で既存の戦闘コア、敵、戦術UIを有効にする。

```text
dialogue ── 調査・会話カード ──> battle
    ^                               │
    └──── 同じ舞台・同じ配置 ───────┘
```

## Alternatives Considered

### 敵表示トグルを探索モードとして使う

- **Pros**: 実装量が少ない。
- **Cons**: 戦闘UIと会話UIが混在する。
- **Rejection Reason**: プレイヤーに見せる状態として不明瞭である。

## Consequences

### Positive

- 会話と戦闘の目的が画面上で明確になる。
- 将来の会話カメラを`dialogue`へ限定できる。

### Negative

- 遭遇発火と戦闘後復帰の遷移規則を後から接続する必要がある。

## Validation Criteria

- 会話モードでは敵・手番・HP・攻撃UIが表示されない。
- 戦闘モードでは既存の戦闘操作が可能である。

## Related Decisions

- [ADR-0001: アイソメトリック常設舞台の独立試作](adr-0001-isometric-stage-prototype.md)
