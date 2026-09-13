#!/usr/bin/env python3
"""Validate the exact distributable inventory, modes, and shared ESM imports."""
import json
from pathlib import Path
import subprocess
import tempfile
import zipfile

root = Path(__file__).resolve().parents[2]
metadata = json.loads((root / 'gnome/metadata.json').read_text())
expected = set('extension.js UsageService.js prefs.js stylesheet.css metadata.json providers.json LICENSE NOTICE'.split())
expected.update('assets/' + name for name in ('claude.svg', 'openai.svg', 'claude-symbolic.svg', 'openai-symbolic.svg'))
expected.update('runtime/' + name for name in ('package.json', 'bun.lock', 'config.json'))
expected.update(('schemas/org.gnome.shell.extensions.headroom.gschema.xml', 'schemas/gschemas.compiled', 'bin/setup-costs'))
expected.update('collectors/' + name for name in ('headroom-collect', 'omarchy-agent-usage-claude', 'omarchy-agent-usage-codex'))
modules = ('Model', 'Pace', 'Costs', 'Wire', 'Providers')
expected.update(name + '.js' for name in modules)
with zipfile.ZipFile(root / 'build' / (metadata['uuid'] + '.zip')) as bundle:
    assert set(bundle.namelist()) == expected
    assert len(bundle.namelist()) == len(expected)
    assert bundle.testzip() is None
    assert json.loads(bundle.read('metadata.json')) == metadata
    assert metadata['shell-version'] == ['46']
    for name in expected:
        if name.startswith(('collectors/', 'bin/')):
            assert (bundle.getinfo(name).external_attr >> 16) & 0o100, name
    with tempfile.TemporaryDirectory() as directory:
        for name in modules:
            content = bundle.read(name + '.js')
            assert content.startswith((root / (name + '.js')).read_bytes())
            path = Path(directory) / (name + '.mjs')
            path.write_bytes(content)
            subprocess.run(['node', str(path)], check=True)
print(f'PASS: exact {len(expected)}-file package, executable helpers, GNOME 46 metadata and five ESM modules')
