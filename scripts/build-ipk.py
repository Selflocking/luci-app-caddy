#!/usr/bin/env python3
"""Build opkg packages for the JS-only LuCI app and a static ARM64 Caddy.

This is a standalone packaging path, not an OpenWrt SDK build. Go compiles the
provided, verified Caddy source; Python creates the standard ipkg tar layout.
"""
import argparse
import gzip
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def version(makefile):
    source = makefile.read_text()
    values = dict(re.findall(r'^(PKG_(?:VERSION|RELEASE))\s*:?=\s*(\S+)', source, re.M))
    return values['PKG_VERSION'] + '-r' + values['PKG_RELEASE']


def archive(entries, epoch):
    buffer = io.BytesIO()
    with gzip.GzipFile(fileobj=buffer, mode='wb', mtime=epoch) as compressed:
        with tarfile.open(fileobj=compressed, mode='w', format=tarfile.GNU_FORMAT) as tar:
            directories = {str(parent) for name, _, _ in entries for parent in PurePosixPath(name).parents if str(parent) != '.'}
            contents = [(name, data, mode, False) for name, data, mode in entries]
            contents += [(name, b'', 0o755, True) for name in directories]
            for name, data, mode, directory in sorted(contents):
                item = tarfile.TarInfo('./' + name)
                if directory:
                    item.type = tarfile.DIRTYPE
                item.size = len(data)
                item.mode = mode
                item.uid = item.gid = 0
                item.uname = item.gname = 'root'
                item.mtime = epoch
                tar.addfile(item, io.BytesIO(data))
    return buffer.getvalue()


def collect(directory, prefix=''):
    return [(prefix + str(path.relative_to(directory)), path.read_bytes(), path.stat().st_mode & 0o777)
            for path in sorted(directory.rglob('*')) if path.is_file()]


def package(output, name, package_version, arch, description, depends, data, epoch, conffiles=None):
    control = (f'Package: {name}\nVersion: {package_version}\nArchitecture: {arch}\n'
               f'Depends: {depends}\nSection: net\nPriority: optional\nLicense: Apache-2.0\n'
               f'Installed-Size: {sum(len(item[1]) for item in data)}\nDescription: {description}\n')
    postinst = '''#!/bin/sh
[ -n "$IPKG_INSTROOT" ] || {
    . /lib/functions.sh
    default_postinst "$0" "$@"
    exit $?
}
exit 0
'''
    prerm = '''#!/bin/sh
[ -n "$IPKG_INSTROOT" ] || {
    . /lib/functions.sh
    default_prerm "$0" "$@"
    exit $?
}
exit 0
'''
    controls = [('control', control.encode(), 0o644), ('postinst', postinst.encode(), 0o755), ('prerm', prerm.encode(), 0o755)]
    if conffiles:
        controls.append(('conffiles', ('\n'.join(conffiles) + '\n').encode(), 0o644))
    target = output / f'{name}_{package_version}_{arch}.ipk'
    target.write_bytes(archive([
        ('debian-binary', b'2.0\n', 0o644),
        ('control.tar.gz', archive(controls, epoch), 0o644),
        ('data.tar.gz', archive(data, epoch), 0o644)
    ], epoch))
    return target


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    inputs = parser.add_mutually_exclusive_group(required=True)
    inputs.add_argument('--caddy-source', type=Path, help='Extracted, verified Caddy source directory')
    inputs.add_argument('--caddy-binary', type=Path, help='Already cross-compiled static ARM64 Caddy binary')
    parser.add_argument('--arch', default='aarch64_cortex-a53', choices=['aarch64_cortex-a53', 'aarch64_generic'])
    parser.add_argument('--output', type=Path, default=ROOT / 'dist')
    args = parser.parse_args()
    epoch = int(os.environ.get('SOURCE_DATE_EPOCH') or subprocess.check_output(
        ['git', 'show', '--no-show-signature', '-s', '--format=%ct', 'HEAD'], cwd=ROOT, text=True).strip())
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    caddy_version = version(ROOT / 'packages/caddy/Makefile')
    with tempfile.TemporaryDirectory(prefix='caddy-ipk-') as temporary:
        binary = args.caddy_binary
        if args.caddy_source:
            binary = Path(temporary) / 'caddy'
            env = dict(os.environ, GOOS='linux', GOARCH='arm64', CGO_ENABLED='0', GOTOOLCHAIN='auto')
            subprocess.run(['go', 'build', '-p', '4', '-trimpath', '-ldflags',
                            '-s -w -X github.com/caddyserver/caddy/v2.CustomVersion=v' + caddy_version.split('-r')[0],
                            '-o', str(binary), './cmd/caddy'], cwd=args.caddy_source.resolve(), env=env, check=True)
        data = binary.read_bytes()
        if data[:6] != b'\x7fELF\x02\x01' or int.from_bytes(data[18:20], 'little') != 183:
            raise SystemExit('Expected a little-endian ARM64 ELF executable')
        caddy = package(output, 'caddy', caddy_version, args.arch, 'Caddy 2 web server', 'ca-bundle',
                        [('usr/bin/caddy', data, 0o755)], epoch)
        app = package(output, 'luci-app-caddy', version(ROOT / 'Makefile'), 'all', 'LuCI support for Caddy 2',
                      'luci-base, caddy, rpcd, jshn, jsonfilter', collect(ROOT / 'root') +
                      collect(ROOT / 'htdocs', 'www/') + [('usr/share/licenses/luci-app-caddy/LICENSE', (ROOT / 'LICENSE').read_bytes(), 0o644)],
                      epoch, ['/etc/caddy-luci/Caddyfile'])
    metadata = {
        'method': 'Go cross-compile and standalone ipkg packaging; no OpenWrt SDK',
        'architecture': args.arch,
        'git_commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        'git_dirty': bool(subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT, text=True).strip()),
        'files': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in (caddy, app)}
    }
    (output / 'build-info.json').write_text(json.dumps(metadata, indent=2) + '\n')
    for target in (caddy, app):
        print(target)


if __name__ == '__main__':
    main()
