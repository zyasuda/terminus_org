# 文字列リテラルのうち日本語を含むものを、ファイル:行つきで全部取り出す
import re, json, sys, os
os.chdir(sys.argv[1])
files = ['engine/core.js','engine/items.js','engine/navigation.js','engine/view.js','engine/sheet.js','engine/ai.js','engine/battle.js','engine/ui.js','scenario.js','stage.js','index.html']
jp = re.compile(r'[぀-ヿ一-鿿]')
lit = re.compile(r"'(?:[^'\\\n]|\\.)*'|\"(?:[^\"\\\n]|\\.)*\"|`(?:[^`\\]|\\.)*`")
out = []
for f in files:
    src = open(f, encoding='utf-8').read()
    if f.endswith('.html'):
        continue
    for m in lit.finditer(src):
        s = m.group(0)
        if jp.search(s) and not s.lstrip('\'"`').startswith('//'):
            line = src.count('\n', 0, m.start()) + 1
            out.append([f, line, s[1:-1]])
json.dump(out, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False)
print(len(out), sum(len(x[2]) for x in out))
