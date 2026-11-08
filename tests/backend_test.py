"""Exercise the real RPC shell script in a temporary router filesystem.

Only jshn, ubus, jsonfilter and procd are simulated; Caddy validation/adaptation
uses CADDY_BIN when supplied. No host /etc or service is changed.
"""
import hashlib
import json
import os
from pathlib import Path
import shlex
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
BINARY = os.environ.get('CADDY_BIN')


@unittest.skipUnless(BINARY, 'Set CADDY_BIN to test the RPC backend with real Caddy')
class BackendTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='caddy-rpc-')
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.config_dir = self.base / 'etc'
        self.config_dir.mkdir()
        (self.base / 'run').mkdir()
        self.config = self.config_dir / 'Caddyfile'
        self.socket = 'unix/' + str(self.base / 'run/caddy-luci/admin.sock')
        self.original = '{\n admin ' + self.socket + '\n}\n:8080 {\n respond "original"\n}\n'
        self.config.write_text(self.original)
        self.bin = self.base / 'bin'
        self.bin.mkdir()
        shim = self.base / 'json_shim.py'
        shim.write_text('''import json, sys, shlex
op, data, *args = sys.argv[1:]
obj = json.loads(data)
if op == 'get':
    value = obj.get(args[0], '')
    if isinstance(value, bool): value = int(value)
    print(args[1] + '=' + shlex.quote(str(value)))
elif op == 'add':
    obj[args[0]] = bool(int(args[1])) if args[2] == 'boolean' else args[1]
    print(json.dumps(obj))
''')
        jshn = self.base / 'jshn.sh'
        jshn.write_text(f'''
json_load() {{ __request=$1; }}
json_get_var() {{ eval "$(python3 {shim} get "$__request" "$2" "$1")"; }}
json_init() {{ __output='{{}}'; }}
json_add_string() {{ __output=$(python3 {shim} add "$__output" "$1" "$2" string); }}
json_add_boolean() {{ __output=$(python3 {shim} add "$__output" "$1" "$2" boolean); }}
json_dump() {{ printf '%s\\n' "$__output"; }}
''')
        self.script('ubus', f'''#!/usr/bin/env python3
import json, os
print(json.dumps({{'caddy-luci':{{'instances':{{'main':{{'running':os.path.exists('{self.base}/active')}}}}}}}}))
''')
        self.script('jsonfilter', '''#!/usr/bin/env python3
import json, sys
data = json.load(sys.stdin)
if sys.argv[-1] == '@.admin.listen': print(data.get('admin', {}).get('listen', ''))
else: print(str(data['caddy-luci']['instances']['main']['running']).lower())
''')
        self.script('logread', '#!/bin/sh\nprintf "caddy test log\\n"\n')
        service = self.script('service', f'''#!/bin/sh
case "$1" in
  enabled) test -f {self.base}/enabled ;;
  enable) touch {self.base}/enabled ;;
  disable) rm -f {self.base}/enabled ;;
  start|restart) touch {self.base}/active ;;
  stop) rm -f {self.base}/active ;;
  reload) if grep -q FAIL_RELOAD {self.config}; then echo 'reload rejected'; exit 1; fi ;;
esac
''')
        source = (ROOT / 'root/usr/libexec/rpcd/luci.caddy').read_text()
        replacements = {
            '/usr/share/libubox/jshn.sh': str(jshn),
            '/usr/bin/caddy': str(Path(BINARY).resolve()),
            '/etc/init.d/caddy-luci': str(service),
            '/etc/caddy-luci': str(self.config_dir),
            '/tmp/caddy-luci': str(self.base / 'tmp'),
            '/var/run/caddy-luci': str(self.base / 'run/caddy-luci'),
        }
        for old, new in replacements.items():
            source = source.replace(old, new)
        self.rpc = self.base / 'rpc'
        self.rpc.write_text(source)
        self.env = dict(os.environ, PATH=str(self.bin) + ':' + os.environ['PATH'])

    def script(self, name, content):
        target = self.bin / name
        target.write_text(content)
        target.chmod(0o755)
        return target

    def call(self, method, **params):
        result = subprocess.run(['sh', str(self.rpc), 'call', method],
                                input=json.dumps(params) + '\n', text=True,
                                capture_output=True, env=self.env, timeout=15)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(result.stdout.strip(), result.stderr)
        return json.loads(result.stdout)

    def revision(self):
        return hashlib.sha256(self.config.read_bytes()).hexdigest()

    def test_read_and_validation(self):
        result = self.call('read')
        self.assertTrue(result['ok'])
        self.assertEqual(result['revision'], self.revision())
        self.assertTrue(self.call('validate', content=self.original)['ok'])
        self.assertEqual(self.config.read_text(), self.original)
        self.assertFalse(list(self.config_dir.glob('.candidate.*')))

    def test_invalid_or_changed_admin_cannot_overwrite(self):
        for content in ['invalid {', self.original.replace(self.socket, 'off')]:
            result = self.call('save', content=content, revision=self.revision(), apply=False)
            self.assertFalse(result['ok'])
            self.assertEqual(self.config.read_text(), self.original)

    def test_save_and_apply_starts_service_and_creates_backup(self):
        content = self.original.replace('original', 'updated')
        result = self.call('save', content=content, revision=self.revision(), apply=True)
        self.assertTrue(result['ok'], result)
        self.assertEqual(self.config.read_text().strip(), content.strip())
        self.assertTrue((self.base / 'active').exists())
        self.assertEqual(self.config.with_suffix('.bak').read_text(), self.original)
        self.assertEqual(result['revision'], self.revision())

    def test_failed_reload_restores_previous_file(self):
        (self.base / 'active').touch()
        result = self.call('save', content=self.original + '# FAIL_RELOAD\n',
                           revision=self.revision(), apply=True)
        self.assertFalse(result['ok'])
        self.assertIn('restored', result['message'])
        self.assertEqual(self.config.read_text(), self.original)

    def test_stale_revision_and_lock_are_rejected(self):
        self.assertFalse(self.call('save', content=self.original, revision='stale', apply=False)['ok'])
        (self.base / 'run/caddy-luci.lock').mkdir()
        self.assertFalse(self.call('validate', content=self.original)['ok'])
        self.assertEqual(self.config.read_text(), self.original)

    def test_service_actions_are_whitelisted(self):
        self.assertFalse(self.call('action', name='start; touch /tmp/injected')['ok'])
        self.assertTrue(self.call('action', name='enable')['ok'])
        self.assertTrue(self.call('status')['enabled'])
        self.assertTrue(self.call('action', name='disable')['ok'])
        self.assertFalse(self.call('status')['enabled'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
