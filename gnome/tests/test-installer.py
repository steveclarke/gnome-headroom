#!/usr/bin/env python3
"""Exercise install integrity, settings preservation, and dependency selection offline."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('installer', Path(__file__).resolve().parents[2] / 'install.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class InstallerTests(unittest.TestCase):
    def test_checksum_failure_stops_install(self):
        with tempfile.TemporaryDirectory() as temporary:
            p = Path(temporary) / 'archive'
            p.write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError, 'checksum'):
                installer.verify(p, hashlib.sha256(b'original').hexdigest())

    def test_downloads_use_one_release_tag(self):
        urls = []
        def download(url, target, *args):
            urls.append(url)
            if target.name == 'release.json':
                target.write_text(json.dumps({'tag_name': 'v1.2.3'}))
            elif target.name == 'SHA256SUMS':
                target.write_text(hashlib.sha256(b'archive').hexdigest() + '  ' + installer.UUID + '.zip')
            else:
                target.write_bytes(b'archive')
        with tempfile.TemporaryDirectory() as temporary, patch.object(installer, 'download', download):
            self.assertEqual(installer.release_archive(Path(temporary)).read_bytes(), b'archive')
        self.assertTrue(all('/v1.2.3/' in url for url in urls[1:]))

    def test_enable_preserves_other_extensions(self):
        enabled = ['existing@example.com']
        def read(*args, **kwargs):
            return json.dumps(enabled)
        def run(command, **kwargs):
            enabled[:] = json.loads(command[-1])
        with patch.object(installer.subprocess, 'check_output', read), patch.object(installer.subprocess, 'run', run):
            installer.enable_after_login()
            installer.enable_after_login()
        self.assertEqual(enabled, ['existing@example.com', installer.UUID])

    def test_dependencies_only_install_missing_packages(self):
        with patch.object(installer.shutil, 'which', return_value=None), patch.object(installer.os, 'access', return_value=False), patch.object(installer.subprocess, 'run') as run:
            installer.install_dependencies(True)
            self.assertEqual(run.call_args.args[0][-2:], ['gnome-shell-extension-prefs', 'nodejs'])
        with patch.object(installer.shutil, 'which', return_value='/bin/tool'), patch.object(installer.subprocess, 'run') as run:
            installer.install_dependencies(False)
            run.assert_not_called()

    def test_refuses_root(self):
        with patch.object(installer.os, 'geteuid', return_value=0):
            with self.assertRaisesRegex(ValueError, 'without sudo'):
                installer.check_desktop()

    def test_refuses_unsupported_shell(self):
        with patch.object(installer.os, 'geteuid', return_value=1000), patch.object(installer.shutil, 'which', return_value='/bin/tool'), patch.object(installer.subprocess, 'check_output', return_value='GNOME Shell 47.0'):
            with self.assertRaisesRegex(ValueError, 'GNOME 46'):
                installer.check_desktop()


if __name__ == '__main__':
    unittest.main()
