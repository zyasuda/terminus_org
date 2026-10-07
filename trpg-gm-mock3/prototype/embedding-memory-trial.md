# EmbeddingGemma 2 会話検索の独立試験（2026-10-07）

本編未接続の独立試験です。EmbeddingGemma 2は検索用のモデルで、会話の生成はGemma 4などが担当します。実ゲームの会話品質やClaude課金トークンは未測定。

## 実行

既存Ollamaを使い、Python標準ライブラリだけでローカルAPIへ接続する。モデルはembeddinggemma-2:270m。既存のgemma4:e4bは保持。Ollamaサーバーは127.0.0.1:11434で今回起動したまま。

```sh
python3 prototype/embedding-memory-trial.py --self-check
python3 prototype/embedding-memory-trial.py > prototype/embedding-memory-trial-results.json
```

## 実測

合成会話10件・質問5件。古い記録4件を意図して直近6件の外へ置いた試験で、検索上位3件は4/4、直近6件は0/4。一般的な精度100%を意味しない。未共有情報の漏洩0/5。権限フィルターを埋め込み生成・ランキングの前に適用し、共有のACLを持たない行は除外する。

検索中央値18.2ms、最初のモデル読込508.4ms、最初の9件の文書登録2485.5ms。Ollama psは346MB・100%GPU・mlx。文書ベクトルは試験プロセス内で再利用する。これは全ゲームの応答時間ではない。

Embeddingモデルのprefix込みトークン合計は直近6件550→検索3件366（33.5%減）。ClaudeやGemma 4の実際の入力トークンではない。本文文字数は質問によって増える例もある（貸した道具の質問：87→94文字）。採用判断をトークン削減だけでしない。

## 残る課題

該当なしの質問にも無関係な3件を返す。スコアによる棄却は未調整。直近会話の維持と古い関連記憶の追加を実会話で比較する必要がある。検索結果は過去の発言であり、現在の所持・装備・行動可否を上書きしない。本編の秘密の閲覧権限を、試験用ACLへ置き換えたと誤認しない。

## 環境更新の結果

0.32.1でpullは終了コード1（モデルが新しいOllamaを要求）。brew upgrade ollamaで0.40.0本体と8依存が更新された：ca-certificates、openssl@3、readline、sqlite、xz、python@3.14、mlx、mlx-c。Homebrew自動更新に伴いportable-rubyも更新。最後のpkgconf再インストールはXcode26.5が古いとして失敗し、brew全体は終了コード1。Xcodeとpkgconfを変更して修復する作業は行っていない。Ollama0.40.0サーバー起動、モデル取得、比較試験はそれぞれ実行して成功。試験スクリプトと--self-checkはいずれも終了コード0。
