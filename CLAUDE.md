# trpg-gm-isometric 作業ガイド

作業ルールは [AGENTS.md](AGENTS.md) に1本化した。ClaudeとCodexで内容が分かれると
片方だけ古くなるため、このファイルからは参照だけにする。

共通ルールは [Terminus/CLAUDE.md](../CLAUDE.md) を参照する。

**要点だけ先に:**

- 章データの正本は `../scenario/lanternhill/` だけ。`public/data/` は配布された生成物なので直接編集しない
- 隣のプロジェクト(`trpg-gm-mock2` / `trpg-gamebook` / `trpg-rogue-map`)は読むだけ
- 遠征の判定で `Math.random` を使わない(seedで再現できることが前提)
- `npm test` は `&&` 連結。前の段が落ちると後ろが1件も走らない
- 2026-08-20時点で `playthrough` は落ちる。理由と扱いは [AGENTS.md](AGENTS.md) の「現状」を参照

---

以前このファイルにはBORG(Obsidian Vault)の設定が入っていた。プロジェクトの作業ルールが
1行も無く、上の4点がどのエージェントにも届いていなかった。BORGの設定はユーザ設定側
(`~/.claude/`)に置くものなので、ここからは外した(2026-08-20)。
