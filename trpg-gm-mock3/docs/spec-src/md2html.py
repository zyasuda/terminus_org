# ponytail: 仕様書の4章だけを変換する最小のMarkdown変換。見出し・表・入れ子リスト・フェンス・インライン装飾のみ。
import re, html, sys

def inline(t):
    out, i = [], 0
    while i < len(t):
        if t[i] == '`':
            n = len(t[i:]) - len(t[i:].lstrip('`'))
            tick = '`' * n
            j = t.find(tick, i + n)
            while j != -1 and t[j + n:j + n + 1] == '`':
                j = t.find(tick, j + 1)
            if j != -1:
                out.append('<code>' + html.escape(t[i + n:j].strip() if n > 1 else t[i + n:j]) + '</code>')
                i = j + n
                continue
        out.append(t[i]); i += 1
    codes = [p for p in out if p.startswith('<code>')]
    s = deco(''.join('\x00' if p.startswith('<code>') else p for p in out))
    it = iter(codes)
    return re.sub('\x00', lambda _: next(it), s)

def deco(t):
    t = html.escape(t, quote=False)
    t = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', t)
    t = re.sub(r'\[([^\]]+)\]\(([^)\s]+)\)', r'<a href="\2">\1</a>', t)
    return t

def convert(md, idp):
    lines = md.split('\n'); i = 0; o = []; stack = []; para = []
    def flush():
        nonlocal para
        if para: o.append('<p>' + inline(' '.join(para)) + '</p>'); para = []
    def close_lists(to=0):
        while len(stack) > to:
            o.append('</li></%s>' % stack.pop()[1])
    while i < len(lines):
        l = lines[i]
        m = re.match(r'^(\s*)(```+|~~~+)(.*)$', l)
        if m:
            flush(); fence = m.group(2); body = []; i += 1
            while i < len(lines) and not lines[i].strip().startswith(fence):
                body.append(lines[i]); i += 1
            i += 1
            o.append('<pre><code>' + html.escape('\n'.join(body)) + '</code></pre>')
            continue
        if not l.strip():
            flush(); i += 1
            # 空行の次がリストでなければリストを閉じる
            nxt = next((x for x in lines[i:] if x.strip()), '')
            if stack and not re.match(r'^\s*([-*]|\d+[.)])\s', nxt) and not (nxt.startswith(' ' * (stack[-1][0] + 2))):
                close_lists()
            continue
        h = re.match(r'^(#{1,6})\s+(.*)$', l)
        if h:
            flush(); close_lists()
            lv = min(len(h.group(1)) + 1, 6)
            o.append('<h%d id="%s-%d">%s</h%d>' % (lv, idp, i, inline(h.group(2)), lv)); i += 1; continue
        if re.match(r'^\s*(---+|\*\*\*+)\s*$', l):
            flush(); close_lists(); o.append('<hr>'); i += 1; continue
        if l.lstrip().startswith('|') and i + 1 < len(lines) and re.match(r'^\s*\|?\s*:?-{2,}', lines[i + 1]):
            flush(); close_lists()
            cells = lambda r: [c.strip() for c in re.split(r'(?<!\\)\|', r.strip().strip('|'))]
            o.append('<div class="tw"><table><tr>' + ''.join('<th>%s</th>' % inline(c) for c in cells(l)) + '</tr>')
            i += 2
            while i < len(lines) and lines[i].lstrip().startswith('|'):
                o.append('<tr>' + ''.join('<td>%s</td>' % inline(c.replace('\\|', '|')) for c in cells(lines[i])) + '</tr>'); i += 1
            o.append('</table></div>'); continue
        li = re.match(r'^(\s*)([-*]|\d+[.)])\s+(.*)$', l)
        if li:
            flush(); ind = len(li.group(1)); kind = 'ol' if li.group(2)[0].isdigit() else 'ul'
            while stack and stack[-1][0] > ind:
                o.append('</li></%s>' % stack.pop()[1])
            if stack and stack[-1][0] == ind:
                if stack[-1][1] != kind:
                    o.append('</li></%s>' % stack.pop()[1]); o.append('<%s><li>' % kind); stack.append((ind, kind))
                else:
                    o.append('</li><li>')
            else:
                o.append('<%s><li>' % kind); stack.append((ind, kind))
            o.append(inline(li.group(3))); i += 1; continue
        if stack and l.startswith(' '):
            o.append('<br>' + inline(l.strip())); i += 1; continue
        if l.startswith('>'):
            flush(); close_lists(); o.append('<blockquote>' + inline(l.lstrip('> ')) + '</blockquote>'); i += 1; continue
        close_lists(); para.append(l.strip()); i += 1
    flush(); close_lists()
    return '\n'.join(o)

if __name__ == '__main__':
    print(convert(open(sys.argv[1], encoding='utf-8').read(), sys.argv[2]))
