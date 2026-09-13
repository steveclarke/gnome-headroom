#!/usr/bin/env python3
"""Exercise vendored cache permissions and OAuth redirect refusal offline."""
import ast
import json
import os
from pathlib import Path
import stat
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
import urllib.request
import urllib.error
from typing import Any

root = Path(__file__).resolve().parents[2]

def definitions(provider, names):
    path = root / 'gnome/collectors' / ('omarchy-agent-usage-' + provider)
    tree = ast.parse(path.read_text())
    tree.body = [n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.ClassDef)) and n.name in names]
    assert len(tree.body) == len(names)
    scope = dict(globals())
    exec(compile(tree, str(path), 'exec'), scope)
    return scope

with tempfile.TemporaryDirectory() as directory:
    for provider in ('claude', 'codex'):
        path = Path(directory) / provider
        definitions(provider, {'write_json'})['write_json'](path, {'sample': True})
        assert stat.S_IMODE(path.stat().st_mode) == 0o600
        assert json.loads(path.read_text()) == {'sample': True}

received = []
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        received.append(self.path)
        self.send_response(302)
        self.send_header('Location', '/redirected')
        self.end_headers()
    def log_message(self, *_):
        pass

server = HTTPServer(('127.0.0.1', 0), Handler)
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
try:
    handler = definitions('claude', {'NoRedirect'})['NoRedirect']
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), handler())
    try:
        opener.open(urllib.request.Request(f'http://127.0.0.1:{server.server_port}/usage',
                    headers={'Authorization': 'Bearer synthetic-test-value'}), timeout=2)
        raise AssertionError('Redirect unexpectedly accepted')
    except urllib.error.HTTPError as error:
        assert error.code == 302
    assert received == ['/usage'], received
finally:
    server.shutdown()
    server.server_close()
    thread.join()
print('PASS: owner-only caches and no OAuth redirect requests')
