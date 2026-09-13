#!/usr/bin/env python3
"""Offline checks for quota-only polling and Codex response framing."""
import argparse
import ast
from contextlib import redirect_stdout
import datetime as dt
import io
import json
import os
from pathlib import Path
import select
import subprocess
import sys
import time
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]


def function(provider, name, overrides=None):
    path = ROOT / 'gnome/collectors' / ('omarchy-agent-usage-' + provider)
    tree = ast.parse(path.read_text())
    tree.body = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == name]
    scope = dict(globals(), **(overrides or {}))
    exec(compile(tree, str(path), 'exec'), scope)
    return scope[name]


class RpcTests(unittest.TestCase):
    def setUp(self):
        self.rpc = function('codex', 'rpc_request')

    def child(self, program):
        process = subprocess.Popen([sys.executable, '-c', program], stdin=subprocess.PIPE,
                                   stdout=subprocess.PIPE, text=True)
        def cleanup():
            if process.poll() is None:
                process.kill()
            process.wait()
            process.stdin.close()
            process.stdout.close()
        self.addCleanup(cleanup)
        return process

    def test_notification_and_response_in_one_write(self):
        proc = self.child('import sys,time; sys.stdin.readline(); '
                          'sys.stdout.write(\'[]\\n{"method":"notice"}\\n{"id":1,"result":{}}\\n\'); '
                          'sys.stdout.flush(); time.sleep(3)')
        self.assertEqual(self.rpc(proc, 1, 'initialize', timeout=1)['id'], 1)

    def test_response_split_across_reads(self):
        proc = self.child('import sys,time; sys.stdin.readline(); '
                          'sys.stdout.write(\'{"id":\'); sys.stdout.flush(); time.sleep(.05); '
                          'sys.stdout.write(\'1,"result":{}}\\n\'); sys.stdout.flush(); time.sleep(3)')
        self.assertEqual(self.rpc(proc, 1, 'initialize', timeout=1)['id'], 1)

    def test_unterminated_response_has_deadline(self):
        proc = self.child('import sys,time; sys.stdin.readline(); '
                          'sys.stdout.write(\'{"id":\'); sys.stdout.flush(); time.sleep(3)')
        started = time.monotonic()
        with self.assertRaises(TimeoutError):
            self.rpc(proc, 1, 'initialize', timeout=.2)
        self.assertLess(time.monotonic() - started, 1)

    def test_response_size_is_bounded(self):
        proc = self.child('import sys,time; sys.stdin.readline(); '
                          'sys.stdout.write("x" * 1100000); sys.stdout.flush(); time.sleep(3)')
        with self.assertRaisesRegex(ValueError, 'size limit'):
            self.rpc(proc, 1, 'initialize', timeout=2)


class LimitsOnlyTests(unittest.TestCase):
    def test_neither_provider_scans_history(self):
        def forbidden(*args):
            raise AssertionError('Quota polling scanned local history')
        for provider in ('claude', 'codex'):
            with self.subTest(provider=provider):
                called = []
                def limits(*args):
                    called.append(True)
                    return dict(limits=[], usageStatusText='', authHelpText='')
                scope = dict(AGENT_ID=provider, AGENT_NAME=provider,
                             config_dir=lambda: Path('/nonexistent'), number=lambda n: n or 0,
                             cached_scan=forbidden, stats_cache_fallback=forbidden,
                             today_prompts_from_history=forbidden, scan_pi_usage=forbidden,
                             scan_opencode_usage=forbidden, cached_local_stats=forbidden,
                             oauth_login=lambda path: ('synthetic-token', 0, ''),
                             collect_limits=limits, fetch_codex_rpc=limits,
                             SCAN_REUSE_SECONDS=20,
                             datetime=dt.datetime, timezone=dt.timezone)
                main = function(provider, 'main', scope)
                output = io.StringIO()
                with patch.object(sys, 'argv', ['collector', '--limits-only']), redirect_stdout(output):
                    main()
                self.assertEqual(len(called), 1)
                self.assertEqual(json.loads(output.getvalue())['id'], provider)


if __name__ == '__main__':
    unittest.main()
