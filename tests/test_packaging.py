"""Check opkg archives include parent directories and reproducible metadata."""
import importlib.util
import io
from pathlib import Path
import tarfile
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('build_ipk', ROOT / 'scripts/build-ipk.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class PackagingTest(unittest.TestCase):
    def test_parent_directories_and_modes_are_explicit(self):
        content = builder.archive([('etc/caddy-luci/Caddyfile', b'example', 0o600),
                                   ('usr/libexec/rpcd/luci.caddy', b'#!/bin/sh\n', 0o755)], 1234567890)
        with tarfile.open(fileobj=io.BytesIO(content), mode='r:gz') as archive:
            names = archive.getnames()
            self.assertTrue(archive.getmember('./etc/caddy-luci').isdir())
            self.assertLess(names.index('./etc/caddy-luci'), names.index('./etc/caddy-luci/Caddyfile'))
            self.assertEqual(archive.getmember('./etc/caddy-luci/Caddyfile').mode, 0o600)
            for member in archive.getmembers():
                self.assertEqual((member.uid, member.gid, member.mtime), (0, 0, 1234567890))
        self.assertEqual(content, builder.archive([('etc/caddy-luci/Caddyfile', b'example', 0o600),
                                                ('usr/libexec/rpcd/luci.caddy', b'#!/bin/sh\n', 0o755)], 1234567890))

    def test_opkg_control_and_payload_layout(self):
        with tempfile.TemporaryDirectory() as directory:
            target = builder.package(Path(directory), 'test', '1-r1', 'all', 'test package', 'rpcd',
                                     [('etc/caddy-luci/Caddyfile', b'example', 0o644)], 1234567890,
                                     ['/etc/caddy-luci/Caddyfile'])
            with tarfile.open(target, 'r:gz') as archive:
                self.assertEqual(archive.extractfile('./debian-binary').read(), b'2.0\n')
                control = archive.extractfile('./control.tar.gz').read()
                with tarfile.open(fileobj=io.BytesIO(control), mode='r:gz') as controls:
                    self.assertIn(b'Depends: rpcd\n', controls.extractfile('./control').read())
                    self.assertEqual(controls.extractfile('./conffiles').read(), b'/etc/caddy-luci/Caddyfile\n')
                    self.assertEqual(controls.getmember('./postinst').mode, 0o755)


if __name__ == '__main__':
    unittest.main(verbosity=2)
