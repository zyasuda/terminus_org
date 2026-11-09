import json, html, re, sys, os, subprocess
sys.path.insert(0, os.path.dirname(__file__))
from md2html import convert, inline
D = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(D, '..', '..'))
G = D + '/generated'
PROTO = REPO + '/prototype'
# 定数・初期状態・定型文は、毎回試作から取り出し直す
subprocess.run(['node', D + '/dump.cjs', PROTO, G], check=True)
subprocess.run([sys.executable, D + '/strings.py', PROTO, G + '/strings.json'], check=True)
OUT = REPO + '/docs/mock3-implementation-spec.html'

LETTER = {'rules': 'A', 'ai': 'B', 'ui': 'C', 'stage': 'D'}
def chapter(name):
    md = open(f'{D}/chapters/{name}.md', encoding='utf-8').read()
    md = re.sub(r'\A#\s[^\n]*\n', '', md)  # 章題は外側で付ける
    h = convert(md, name)
    # 章ごとに節番号が振り直されるので、章の記号を前に付ける(例: 7.2 → A-7.2)
    return re.sub(r'(<h[3-6] id="[^"]*">)(\d)', lambda m: m.group(1) + LETTER[name] + '-' + m.group(2), h)

def pre(obj):
    return '<pre><code>' + html.escape(json.dumps(obj, ensure_ascii=False, indent=1)) + '</code></pre>'

data = json.load(open(f'{G}/data.json', encoding='utf-8'))
initial = json.load(open(f'{G}/initial.json', encoding='utf-8'))
strings = json.load(open(f'{G}/strings.json', encoding='utf-8'))
cases = json.load(open(REPO + '/prototype/playtest-cases.json', encoding='utf-8'))

shots = [
 ('01_start_dark', '開始直後。坑道入口は暗く、人物と調査地点は隠れている。右は会話欄、下は4人の人物帯。'),
 ('02_entry_lit', 'ランタン点灯後の坑道入口。調査札「古い台車」「途切れたレール」と出口2つ、左下に「周囲の痕跡を探す」。'),
 ('03_sheet', '人物シート(イネス)。タブは人物・能力・持ち物・情報・履歴。下部は固定の発言欄。'),
 ('04_drain', '排水室。'),
 ('05_battle', '戦闘(灯りの番人)。仲間4人は左手前に背面、番人は右。下に予告・番人の枠・ラウンド、あなたの行動の候補。'),
 ('06_end', '結末(勝利)。'),
 ('07_mobile', '幅390pxの表示。舞台が上、会話欄が下に積まれる。'),
]
SHOTS = ''.join(f'<figure><img src="spec-img/{n}.png" alt="{html.escape(c)}" loading="lazy"><figcaption>{html.escape(c)}</figcaption></figure>' for n, c in shots)

INTRO = open(f'{D}/intro.html', encoding='utf-8').read()

chapters = [
 ('rules', 'A. ゲームルール', '状態・行動・所持品・灯り・移動・扉・戦闘・決定性。凡例: S=scenario.js、core/items/nav/battle/ai/sheet/view/ui=engine/*.js。'),
 ('ai', 'B. AIとの約束(指示文・応答形式・却下条件)', '通信、LLM呼び出し全13か所の原文、1発言の処理順、合意エンジン、装備依頼、情報の境界、話し方。'),
 ('ui', 'C. 画面と操作', '色と書体、DOM構成と寸法、全操作部品、描画規則、ダイスと天候、固定文言、アクセシビリティ。'),
 ('stage', 'D. 立体舞台', '描画設定、背景と床、カメラとドラッグ、回り舞台、照明、スタンディー、戦闘の構図、調整値、素材一覧。凡例: この章だけ S=stage.js、SC=scenario.js。'),
]
nav = ''.join(f'<a href="#{i}">{t}</a>' for i, t, _ in chapters)
body = ''.join(f'<section id="{i}" class="chapter"><h2>{t}</h2><p class="chap-lead">{html.escape(l)}</p>{chapter(i)}</section>' for i, t, l in chapters)

APPX = f'''<section id="data" class="chapter"><h2>E. 付録: 固定データの全量</h2>
<p class="chap-lead">試作をNodeのVMで読み込み、定数をそのまま書き出したもの(手写しではありません)。関数は <code>[fn]</code> の後に原文があります。</p>
<h3>E-1. シナリオ・エンジン定数</h3>{pre(data)}
<h3>E-2. 初期状態 <code>initial()</code></h3>{pre(initial)}
<h3>E-3. 試遊の再生ケース <code>playtest-cases.json</code></h3><p>実AIの応答を記録した8場面です。作り直した版に同じ応答を流し込み、状態が同じように変わる(7件)・保留になる(1件)ことを確かめる基準として使います。</p>{pre(cases)}
<h3>E-4. 日本語の定型文の全量</h3><p>エンジンとシナリオのソースにある、日本語を含む文字列を全部取り出したものです({len(strings)}件)。GMの文、AIの会話の定型文、画面の文言、AIへの指示文の断片が入っています。<code>${{...}}</code> はテンプレートの差し込み、文字列の途中で切れているものは、前後の変数と連結される断片です。</p>
<div class="tw"><table class="strings"><tr><th>場所</th><th>文字列(原文)</th></tr>{''.join(f'<tr><td>{html.escape(f)}:{l}</td><td><code>{html.escape(s)}</code></td></tr>' for f, l, s in strings)}</table></div></section>'''

CSS = open(f'{D}/spec.css', encoding='utf-8').read()
page = f'''<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>坑道の向こう 実装仕様</title><style>{CSS}</style></head><body>
<aside class="toc"><b>坑道の向こう</b><span>実装仕様</span><a href="#use">0. 読み方</a><a href="#what">1. 作るもの</a><a href="#shots">2. 画面写真</a><a href="#arch">3. 全体の構造</a>{nav}<a href="#data">E. 固定データ</a><a href="#accept">F. 受け入れ検査</a><a href="#quirks">G. 既知の挙動</a></aside>
<main>{INTRO.replace('<!--SHOTS-->', SHOTS).split('<!--CHAPTERS-->')[0]}{body}{APPX}{INTRO.split('<!--CHAPTERS-->')[1]}</main></body></html>'''
open(OUT, 'w', encoding='utf-8').write(page)
print(OUT, len(page))
