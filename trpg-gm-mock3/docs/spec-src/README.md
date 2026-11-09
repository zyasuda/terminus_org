# 実装仕様書の組み立て一式

`../mock3-implementation-spec.html` はここから作る。HTMLを直接直さない(次の組み立てで消える)。

```bash
python3 docs/spec-src/build.py          # 仕様書を作り直す(リポジトリ直下から)
node docs/spec-src/shots.cjs            # 画面写真を撮り直す(先に node prototype/preview.cjs を起動)
```

| ファイル | 中身 | 手で直すか |
|---|---|---|
| `chapters/rules.md` `ai.md` `ui.md` `stage.md` | A〜D章の本文。2026-11-09 にコードを読んで書いた | **直す**。コードを変えたら該当箇所を書き直す |
| `intro.html` | 0〜3章とF・G章 | 直す |
| `spec.css` | 見た目 | 直す |
| `generated/` | 定数・初期状態・日本語の定型文。組み立てのたびに試作から取り出し直す | 直さない |
| `dump.cjs` `strings.py` `md2html.py` `build.py` `shots.cjs` | 取り出し・変換・組み立て・撮影 | 仕組みを変えるときだけ |

E章(付録)は毎回コードから作り直すので、自動で最新になる。A〜D章と F章の検査件数は手で書いたものなので、コードを変えたら合っているか確かめる。
