#!/usr/bin/env python3
"""Assemble the COSMIC applet's data folder; append ESM exports only to logic copies.

The same idea as gnome/build.py: the shared modules stay as they are in the repository, and the
copies that ship get their exports. Output: build/cosmic/headroom/ (install.sh puts it in
~/.local/share/headroom-cosmic and builds the applet itself with cargo).
"""
from pathlib import Path
import re
import shutil

root = Path(__file__).resolve().parents[1]
source = root / 'cosmic'
stage = root / 'build' / 'cosmic' / 'headroom'
if stage.exists():
    shutil.rmtree(stage)
stage.mkdir(parents=True)

for name in ('providers.json', 'LICENSE', 'NOTICE'):
    shutil.copy2(root / name, stage / name)
shutil.copy2(root / 'gnome' / 'UsageService.js', stage / 'UsageService.js')
shutil.copy2(source / 'headroom-view.js', stage / 'headroom-view.js')

(stage / 'collectors').mkdir()
for name in ('headroom-collect', 'omarchy-agent-usage-claude', 'omarchy-agent-usage-codex'):
    shutil.copy2(root / 'gnome' / 'collectors' / name, stage / 'collectors' / name)

# Symbolic icons: one flat colour, which the applet recolours to the panel's text colour.
(stage / 'assets').mkdir()
for icon in ('claude', 'openai'):
    svg = (root / 'assets' / (icon + '.svg')).read_text()
    svg = re.sub(r'#[0-9a-fA-F]{6}\b', '#2e3436', svg)
    (stage / 'assets' / (icon + '-symbolic.svg')).write_text(svg)

modules = {name: root / (name + '.js') for name in ('Model', 'Pace', 'Costs', 'Wire', 'Providers')}
modules['ViewModel'] = source / 'ViewModel.js'
for name, path in modules.items():
    text = path.read_text()
    functions = re.findall(r'^function ([A-Za-z][A-Za-z0-9_]*)\(', text, re.M)
    if not functions:
        raise ValueError('No exports found in ' + name)
    (stage / (name + '.js')).write_text(text + '\nexport { ' + ', '.join(functions) + ' };\n')

print(stage)
