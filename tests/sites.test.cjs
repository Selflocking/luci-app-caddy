const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const readSource = name => fs.readFileSync(path.join(__dirname, '../htdocs/luci-static/resources/', name), 'utf8');
const generator = new Function('baseclass', readSource('caddy/generator.js'))({ extend: value => value });
const initial = fs.readFileSync(path.join(__dirname, '../root/etc/caddy-luci/Caddyfile'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

function setup({ content = initial, readonly = false, failSave = false } = {}) {
  const dom = new JSDOM('<!doctype html><body></body>');
  const document = dom.window.document;
  const calls = [], notifications = [];
  let revision = 'initial-revision';
  function E(tag, attributes, children) {
    const node = document.createElement(tag);
    Object.entries(attributes || {}).forEach(([key, value]) => {
      if (typeof value === 'function') node.addEventListener(key, value);
      else if (value != null) node.setAttribute(key, value);
    });
    for (const child of Array.isArray(children) ? children : [children]) {
      if (child != null) node.append(child);
    }
    return node;
  }
  const rpc = { declare: ({ method }) => async (...args) => {
    calls.push({ method, args });
    if (method === 'read') return { ok: true, content, revision };
    if (method === 'save') {
      if (failSave) return { ok: false, message: 'Configuration changed. Reload the page before saving.' };
      assert.equal(args[1], revision);
      content = args[0]; revision = 'saved-revision';
      return { ok: true, revision };
    }
    return { ok: true };
  } };
  let modal;
  const ui = {
    addNotification: (_, node, kind) => notifications.push({ text: node.textContent, kind }),
    showModal: (title, children) => { modal = E('div', {}, children); document.body.append(modal); },
    hideModal: () => { if (modal) modal.remove(); }
  };
  const L = { bind: (fn, self) => fn.bind(self), hasViewPermission: () => !readonly, url: url => '/' + url };
  const view = new Function('view', 'rpc', 'ui', 'generator', 'L', 'E', readSource('view/caddy/sites.js'))(
    { extend: value => value }, rpc, ui, generator, L, E
  );
  const root = view.render({ ok: true, content, revision });
  document.body.append(root);
  return { view, root, calls, notifications, document, dom,
    button: label => Array.from(document.querySelectorAll('button')).find(b => b.textContent === label),
    change: (node, value) => { node.value = value; node.dispatchEvent(new dom.window.Event('input', { bubbles: true })); }
  };
}

test('visual page edits existing content, saves with revision and reloads persisted settings', async () => {
  const app = setup();
  assert.equal(app.root.querySelectorAll('.caddy-site').length, 1);
  assert.equal(app.view.dirty, false);
  assert.equal(app.root.querySelector('input[type="checkbox"]').checked, false);
  app.change(app.root.querySelector('textarea'), '可视化修改');
  assert.equal(app.view.dirty, true);
  assert.match(app.view.preview.textContent, /可视化修改/);
  app.button('保存并应用').click();
  await tick();
  const saved = app.calls.find(c => c.method === 'save');
  assert.equal(saved.args[2], true);
  assert.match(saved.args[0], /可视化修改/);
  assert.equal(app.view.revision, 'saved-revision');
  assert.equal(app.view.dirty, false);
  app.button('重新读取配置').click();
  await tick();
  assert.equal(app.root.querySelector('textarea').value, '可视化修改');
  app.dom.window.close();
});

test('visual page prevents incomplete saves and confirms deletion before changing the form', async () => {
  const app = setup();
  app.button('添加站点').click();
  await tick();
  assert.equal(app.root.querySelectorAll('.caddy-site').length, 2);
  assert.equal(app.button('保存并应用').disabled, true);
  app.button('删除站点').click();
  await tick();
  assert.equal(app.root.querySelectorAll('.caddy-site').length, 2);
  app.button('确认').click();
  await tick();
  assert.equal(app.root.querySelectorAll('.caddy-site').length, 1);
  assert.equal(app.calls.some(c => c.method === 'save'), false);
  app.dom.window.close();
});

test('unsupported Caddy directives cannot be overwritten through the visual page', () => {
  const app = setup({ content: initial.replace('respond', 'header X-Test value\n\trespond') });
  assert.ok(app.view.importError);
  assert.equal(app.button('保存并应用').disabled, true);
  assert.equal(app.button('添加站点').disabled, true);
  assert.equal(app.button('重新读取配置').disabled, false);
  assert.equal(app.view.preview.textContent.includes('header X-Test value'), true);
  app.dom.window.close();
});

test('read-only access disables editing while preserving configuration preview', () => {
  const app = setup({ readonly: true });
  assert.equal(app.root.querySelector('fieldset').disabled, true);
  assert.equal(app.button('保存并应用').disabled, true);
  assert.equal(app.button('重新读取配置').disabled, false);
  assert.match(app.view.preview.textContent, /Caddy is running/);
  app.dom.window.close();
});

test('failed saves keep form edits and the old revision for conflict recovery', async () => {
  const app = setup({ failSave: true });
  app.change(app.root.querySelector('textarea'), 'unsaved content');
  app.button('保存').click();
  await tick();
  assert.equal(app.view.dirty, true);
  assert.equal(app.view.revision, 'initial-revision');
  assert.equal(app.root.querySelector('textarea').value, 'unsaved content');
  assert.equal(app.notifications[0].kind, 'error');
  assert.equal(app.button('保存').disabled, false);
  app.dom.window.close();
});

test('applying without editing preserves existing comments and formatting', async () => {
  const app = setup({ content: '# keep this comment\n' + initial });
  app.button('保存并应用').click();
  await tick();
  assert.equal(app.calls.find(c => c.method === 'save').args[0], '# keep this comment\n' + initial);
  app.dom.window.close();
});
