#!/usr/bin/env python3
"""作業中のファイルをブラウザに握らせないための開発用サーバー。

python3 -m http.server は Last-Modified を返すので、ブラウザが src/*.js を
キャッシュし続ける。編集した分が反映されないまま作者がプレイしてしまい、
何度も検証を無駄にした。ここでは毎回 no-store を返して、それを起こさない。
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import sys

class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
print(f"http://localhost:{port}/  （キャッシュ無効）")
ThreadingHTTPServer(("127.0.0.1", port), partial(NoCache, directory=".")).serve_forever()
