#!/usr/bin/env python3
"""Assemble the GNOME artifact; append ESM exports only to logic copies."""
from pathlib import Path
import json
import re
import shutil
import tempfile
import subprocess
import zipfile

root = Path(__file__).resolve().parents[1]
source = root / 'gnome'
uuid = json.loads((source / 'metadata.json').read_text())['uuid']
assert re.fullmatch(r'[a-z0-9@.-]+', uuid)
output = root / 'build'
output.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(prefix='assemble-', dir=output) as temporary:
    stage = Path(temporary) / uuid
    stage.mkdir()
    for name in ('extension.js', 'UsageService.js', 'prefs.js', 'stylesheet.css', 'metadata.json'):
        shutil.copy2(source / name, stage / name)
    (stage / 'schemas').mkdir()
    shutil.copy2(source / 'schemas/org.gnome.shell.extensions.headroom.gschema.xml', stage / 'schemas/org.gnome.shell.extensions.headroom.gschema.xml')
    subprocess.run(['glib-compile-schemas', '--strict', str(stage / 'schemas')], check=True)
    for name in ('providers.json', 'LICENSE', 'NOTICE'):
        shutil.copy2(root / name, stage / name)
    for directory, names in {'assets': ('claude.svg', 'openai.svg'),
                             'runtime': ('package.json', 'bun.lock', 'config.json')}.items():
        (stage / directory).mkdir()
        for name in names:
            shutil.copy2(root / directory / name, stage / directory / name)
    for icon in ('claude', 'openai'):
        svg = (root / 'assets' / (icon + '.svg')).read_text()
        svg = re.sub(r'#[0-9a-fA-F]{6}\b', '#2e3436', svg)
        (stage / 'assets' / (icon + '-symbolic.svg')).write_text(svg)
    (stage / 'collectors').mkdir()
    for name in ('headroom-collect', 'omarchy-agent-usage-claude', 'omarchy-agent-usage-codex'):
        shutil.copy2(source / 'collectors' / name, stage / 'collectors' / name)
    (stage / 'bin').mkdir()
    shutil.copy2(root / 'bin/setup-costs', stage / 'bin/setup-costs')
    for name in ('Model', 'Pace', 'Costs', 'Wire', 'Providers'):
        text = (root / (name + '.js')).read_text()
        functions = re.findall(r'^function ([A-Za-z][A-Za-z0-9_]*)\(', text, re.M)
        if not functions:
            raise ValueError('No exports found in ' + name)
        (stage / (name + '.js')).write_text(text + '\nexport { ' + ', '.join(functions) + ' };\n')
    archive = output / (uuid + '.zip')
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as bundle:
        for path in sorted(stage.rglob('*')):
            if path.is_file():
                bundle.write(path, path.relative_to(stage))
    shutil.copy2(root / 'install.py', output / 'install.py')
    print(archive)
