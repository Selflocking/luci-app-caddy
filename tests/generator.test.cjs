const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync, spawn } = require('node:child_process');
const http = require('node:http');
const net = require('node:net');

const source = fs.readFileSync(path.join(__dirname, '../htdocs/luci-static/resources/caddy/generator.js'), 'utf8');
const generator = new Function('baseclass', source)({ extend: value => value });
const site = extra => ({ address: ':8080', type: 'proxy', upstream: '127.0.0.1:3000', ...extra });

test('generates multiple sites, upstreams, TLS, compression and access logs', () => {
  const result = generator.generate([
    site({ address: 'app.example.com, app2.example.com', upstream: '127.0.0.1:3000 https://backend.example.com:443', internal: true, compress: true, log: true }),
    site({ address: ':8081', type: 'files', root: '/srv/my site', browse: true }),
    site({ address: '[::1]:8082', type: 'respond', body: '你好 "Caddy"' })
  ], 'admin@example.com');
  assert.match(result, /admin unix\/\/var\/run\/caddy-luci\/admin.sock/);
  assert.match(result, /email "admin@example.com"/);
  assert.match(result, /tls internal\n\tencode zstd gzip\n\tlog/);
  assert.match(result, /reverse_proxy 127.0.0.1:3000 https:\/\/backend.example.com:443/);
  assert.match(result, /root \* "\/srv\/my site"\n\tfile_server browse/);
  assert.match(result, /respond "你好 \\"Caddy\\"" 200/);
});

test('rejects malformed values, duplicate addresses and directive injection', () => {
  for (const address of ['', ':0', ':65536', 'example.com {', 'a\nb', 'example.com/path', 'a,b,'])
    assert.throws(() => generator.generate([site({ address })]));
  for (const upstream of ['', '127.0.0.1:0', '127.0.0.1:65536', 'x:80\n}\n:90 {', 'http://a:80/path'])
    assert.throws(() => generator.generate([site({ upstream })]));
  assert.throws(() => generator.generate([site(), site()]));
  assert.throws(() => generator.generate([]));
  assert.throws(() => generator.generate([site()], 'a@example.com\nadmin off'));
  assert.throws(() => generator.generate([site({ type: 'files', root: 'relative' })]));
});

async function port() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const value = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return value;
}

test('real Caddy serves proxy, files and text, then reloads without losing service', {
  skip: !process.env.CADDY_BIN, timeout: 20000
}, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'luci-caddy-'));
  const binary = process.env.CADDY_BIN;
  const upstream = http.createServer((req, res) => res.end('upstream:' + req.url));
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const ports = [await port(), await port(), await port()];
  const configPath = path.join(directory, 'Caddyfile');
  const socket = 'unix/' + path.join(directory, 'admin.sock');
  fs.writeFileSync(path.join(directory, 'index.html'), 'static content');
  const config = generator.generate([
    site({ address: 'http://127.0.0.1:' + ports[0], upstream: '127.0.0.1:' + upstream.address().port }),
    site({ address: 'http://127.0.0.1:' + ports[1], type: 'files', root: directory }),
    site({ address: 'http://127.0.0.1:' + ports[2], type: 'respond', body: '你好 "Caddy"' })
  ]).replace('unix//var/run/caddy-luci/admin.sock', socket);
  fs.writeFileSync(configPath, config);
  const env = { ...process.env, XDG_DATA_HOME: directory, XDG_CONFIG_HOME: directory };
  const cli = args => execFileSync(binary, args, { env, stdio: 'pipe' });
  cli(['validate', '--config', configPath, '--adapter', 'caddyfile']);
  const child = spawn(binary, ['run', '--config', configPath, '--adapter', 'caddyfile'], { env, stdio: 'ignore' });
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try { await fetch('http://127.0.0.1:' + ports[2]); ready = true; break; }
      catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert.ok(ready, 'Caddy must start');
    assert.equal(await (await fetch('http://127.0.0.1:' + ports[0] + '/hello')).text(), 'upstream:/hello');
    assert.equal(await (await fetch('http://127.0.0.1:' + ports[1])).text(), 'static content');
    assert.equal(await (await fetch('http://127.0.0.1:' + ports[2])).text(), '你好 "Caddy"');
    fs.writeFileSync(configPath, config.replace('你好', '已更新'));
    cli(['reload', '--address', socket, '--config', configPath, '--adapter', 'caddyfile']);
    assert.equal(await (await fetch('http://127.0.0.1:' + ports[2])).text(), '已更新 "Caddy"');
    fs.writeFileSync(configPath, 'invalid {');
    assert.throws(() => cli(['reload', '--address', socket, '--config', configPath, '--adapter', 'caddyfile']));
    assert.equal(await (await fetch('http://127.0.0.1:' + ports[2])).text(), '已更新 "Caddy"');
  } finally {
    child.kill('SIGTERM');
    await new Promise(resolve => child.once('exit', resolve));
    await new Promise(resolve => upstream.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
