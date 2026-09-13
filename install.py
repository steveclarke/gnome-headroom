#!/usr/bin/env python3
"""Install Headroom for the current Ubuntu desktop user, optionally with costs."""
import argparse
import ast
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile

REPOSITORY = 'https://github.com/steveclarke/gnome-headroom'
UUID = 'headroom@steveclarke.github.io'
BUN_VERSION = 'bun-v1.4.2'
BUN_BUILDS = {
    'x86_64': ('bun-linux-x64-baseline', 'c678040f14fe0440eb839d37cbd0ce4c051a32da72806ac97de6a6aab6bf728f'),
    'aarch64': ('bun-linux-aarch64', '54328bbc2d9c8e0c9f892c544d66c57a83b84139e34909e5ee81758f1ac8fda7'),
}


def download(url, target, limit=256 * 1024 * 1024):
    request = urllib.request.Request(url, headers={'User-Agent': 'Headroom-installer'})
    with urllib.request.urlopen(request, timeout=60) as response, target.open('wb') as output:
        total = 0
        while chunk := response.read(1024 * 1024):
            total += len(chunk)
            if total > limit:
                raise ValueError('Download exceeded its size limit')
            output.write(chunk)


def verify(path, expected):
    if not re.fullmatch('[a-f0-9]{64}', expected) or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise ValueError('Download checksum did not match: ' + path.name)


def check_desktop():
    if os.geteuid() == 0:
        raise ValueError('Run this as your normal desktop user, without sudo.')
    if not shutil.which('gnome-shell') or not shutil.which('gnome-extensions'):
        raise ValueError('This installer needs an Ubuntu GNOME desktop.')
    version = subprocess.check_output(['gnome-shell', '--version'], text=True)
    if not re.search(r'\b46(?:\.|\s|$)', version):
        raise ValueError('Headroom currently supports GNOME 46 (Ubuntu 24.04).')
    if not os.environ.get('DBUS_SESSION_BUS_ADDRESS'):
        raise ValueError('Run this in a terminal inside your logged-in Ubuntu desktop.')


def install_dependencies(costs):
    packages = []
    if not shutil.which('gnome-extensions-app'):
        packages.append('gnome-shell-extension-prefs')
    if costs and not os.access('/usr/bin/node', os.X_OK):
        packages.append('nodejs')
    if packages:
        print('Installing required Ubuntu packages: ' + ', '.join(packages) +
              '. Ubuntu may ask for your password.', flush=True)
        subprocess.run(['sudo', 'apt-get', 'install', '-y', *packages], check=True)


def release_archive(directory):
    release = directory / 'release.json'
    download('https://api.github.com/repos/steveclarke/gnome-headroom/releases/latest', release, 1024 * 1024)
    tag = json.loads(release.read_text())['tag_name']
    if not re.fullmatch(r'v[0-9]+\.[0-9]+\.[0-9]+', tag):
        raise ValueError('Unexpected release version')
    base = REPOSITORY + '/releases/download/' + tag + '/'
    archive = directory / (UUID + '.zip')
    checksum = directory / 'SHA256SUMS'
    download(base + archive.name, archive)
    download(base + checksum.name, checksum, 65536)
    sums = {parts[1].lstrip('*'): parts[0] for line in checksum.read_text().splitlines()
            if len(parts := line.split()) == 2}
    verify(archive, sums.get(archive.name, ''))
    return archive


def enable_after_login():
    command = ['gsettings', 'get', 'org.gnome.shell', 'enabled-extensions']
    raw = subprocess.check_output(command, text=True).strip()
    enabled = ast.literal_eval(raw.removeprefix('@as '))
    if not isinstance(enabled, list) or any(not isinstance(item, str) for item in enabled):
        raise ValueError('Could not read the enabled extensions setting')
    if UUID not in enabled:
        subprocess.run(['gsettings', 'set', 'org.gnome.shell', 'enabled-extensions',
                        json.dumps(enabled + [UUID])], check=True)
    saved = subprocess.check_output(command, text=True)
    if UUID not in ast.literal_eval(saved.strip().removeprefix('@as ')):
        raise ValueError('Headroom could not be enabled for the next login')


def install_costs(directory):
    build = BUN_BUILDS.get(platform.machine())
    if not build:
        raise ValueError('Automatic cost setup supports x86_64 and aarch64. Quota installation succeeded.')
    name, checksum = build
    archive = directory / (name + '.zip')
    print('Downloading the temporary cost setup tool…', flush=True)
    download('https://github.com/oven-sh/bun/releases/download/' + BUN_VERSION + '/' + archive.name, archive)
    verify(archive, checksum)
    executable = directory / 'bun'
    with zipfile.ZipFile(archive) as bundle:
        # Read only the expected executable; never extract archive paths.
        executable.write_bytes(bundle.read(name + '/bun'))
    executable.chmod(0o700)
    data = Path(os.environ.get('XDG_DATA_HOME', str(Path.home() / '.local/share')))
    setup = data / 'gnome-shell/extensions' / UUID / 'bin/setup-costs'
    env = dict(os.environ, PATH=str(directory) + os.pathsep + os.environ.get('PATH', '/usr/bin:/bin'))
    subprocess.run(['/usr/bin/python3', '-I', str(setup)], env=env, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--costs', action='store_true', help='also set up local cost estimates')
    args = parser.parse_args()
    check_desktop()
    install_dependencies(args.costs)
    with tempfile.TemporaryDirectory(prefix='headroom-install-') as temporary:
        directory = Path(temporary)
        print('Downloading and verifying Headroom…', flush=True)
        archive = release_archive(directory)
        subprocess.run(['gnome-extensions', 'install', '--force', str(archive)], check=True)
        enable_after_login()
        if args.costs:
            install_costs(directory)
    print('Headroom is installed and enabled for your next login. Log out and back in.')
    print('Make sure Claude Code and/or Codex are already logged in on this computer.')
    print('If extensions are globally disabled, turn them on in the Extensions app.')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, subprocess.SubprocessError, zipfile.BadZipFile) as error:
        sys.exit('Setup did not finish: ' + str(error))
