'use strict';
'require view';
'require rpc';
'require ui';
'require poll';
'require caddy.generator as generator';

const readConfig = rpc.declare({ object: 'luci.caddy', method: 'read', expect: {} });
const getStatus = rpc.declare({ object: 'luci.caddy', method: 'status', expect: {} });
const getLogs = rpc.declare({ object: 'luci.caddy', method: 'logs', expect: {} });
const validate = rpc.declare({ object: 'luci.caddy', method: 'validate', params: ['content'], expect: {} });
const saveConfig = rpc.declare({ object: 'luci.caddy', method: 'save', params: ['content', 'revision', 'apply'], expect: {} });
const serviceAction = rpc.declare({ object: 'luci.caddy', method: 'action', params: ['name'], expect: {} });

function checked(result) {
	if (!result || !result.ok)
		throw new Error(result && result.message || '操作失败');
	return result;
}

function field(label, input) {
	return E('label', { 'class': 'caddy-field' }, [E('span', {}, label), input]);
}

return view.extend({
	load: function() {
		return Promise.all([readConfig().then(checked), getStatus().then(checked)]);
	},

	notifyError: function(error) {
		ui.addNotification(null, E('pre', { 'style': 'white-space:pre-wrap' }, error.message), 'error');
	},

	busy: function(task) {
		if (this.working) return Promise.resolve();
		this.working = true;
		this.buttons.forEach(function(b) { b.disabled = true; });
		return Promise.resolve().then(task).catch(this.notifyError).finally(L.bind(function() {
			this.working = false;
			this.buttons.forEach(L.bind(function(b) { b.disabled = this.readonly; }, this));
		}, this));
	},

	button: function(text, action, primary) {
		const button = E('button', {
			'class': 'cbi-button ' + (primary ? 'cbi-button-action important' : 'cbi-button-neutral'),
			'click': L.bind(function() { this.busy(action); }, this),
			'disabled': this.readonly
		}, text);
		this.buttons.push(button);
		return button;
	},

	updateStatus: function(status) {
		this.status.textContent = (status.running ? '● 运行中' : '○ 已停止') +
			'　|　开机启动：' + (status.enabled ? '已启用' : '已禁用') +
			'　|　' + status.version;
		this.status.style.color = status.running ? 'var(--success-color, #27834a)' : '';
	},

	newSite: function() {
		const text = function(value, placeholder) {
			return E('input', { 'class': 'cbi-input-text', 'value': value || '', 'placeholder': placeholder || '' });
		};
		const address = text(':8080', 'example.com 或 :8080');
		const type = E('select', { 'class': 'cbi-input-select' }, [
			E('option', { 'value': 'proxy' }, '反向代理'),
			E('option', { 'value': 'files' }, '静态文件'),
			E('option', { 'value': 'respond' }, '文本响应')
		]);
		const upstream = text('127.0.0.1:3000');
		const root = text('/www');
		const body = text('Hello from Caddy');
		const internal = E('input', { 'type': 'checkbox' });
		const compress = E('input', { 'type': 'checkbox', 'checked': true });
		const log = E('input', { 'type': 'checkbox' });
		const browse = E('input', { 'type': 'checkbox' });
		const upstreamField = field('上游地址（含端口）', upstream);
		const rootField = field('网站目录', root);
		const bodyField = field('响应文本', body);
		const browseField = field('允许目录浏览', browse);
		const toggle = function() {
			upstreamField.hidden = type.value !== 'proxy';
			rootField.hidden = browseField.hidden = type.value !== 'files';
			bodyField.hidden = type.value !== 'respond';
		};
		type.addEventListener('change', toggle);
		toggle();
		const card = E('div', { 'class': 'caddy-site cbi-section' }, [
			E('div', { 'class': 'caddy-grid' }, [
				field('站点地址（多个用逗号分隔）', address), field('站点类型', type),
				upstreamField, rootField, bodyField,
				field('使用内部 CA 证书', internal), field('启用压缩', compress),
				field('记录访问日志', log), browseField
			]),
			E('button', { 'class': 'cbi-button cbi-button-remove', 'click': function() { card.remove(); } }, '删除站点')
		]);
		card.getSite = function() {
			return { address: address.value, type: type.value, upstream: upstream.value, root: root.value,
				body: body.value, internal: internal.checked, compress: compress.checked, log: log.checked, browse: browse.checked };
		};
		this.sites.appendChild(card);
	},

	render: function(data) {
		this.buttons = [];
		this.readonly = !L.hasViewPermission();
		this.revision = data[0].revision;
		this.savedContent = data[0].content;
		this.status = E('p', { 'role': 'status', 'aria-live': 'polite' });
		this.updateStatus(data[1]);
		this.editor = E('textarea', { 'class': 'cbi-input-textarea', 'rows': 23, 'spellcheck': 'false',
			'aria-label': 'Caddyfile', 'readonly': this.readonly, 'style': 'width:100%;font-family:monospace;tab-size:4' });
		this.editor.value = data[0].content;
		this.editor.addEventListener('keydown', function(event) {
			if (event.key === 'Tab' && !event.shiftKey && !event.target.readOnly) {
				event.preventDefault();
				const target = event.target;
				target.setRangeText('\t', target.selectionStart, target.selectionEnd, 'end');
			}
		});
		this.sites = E('div');
		this.newSite();
		const email = E('input', { 'class': 'cbi-input-text', 'placeholder': 'admin@example.com（可选）' });
		const generate = L.bind(function() {
			const config = generator.generate(Array.from(this.sites.children).map(function(card) { return card.getSite(); }), email.value.trim());
			ui.showModal('生成 Caddyfile', [
				E('p', {}, '生成器不会读取已有配置。使用此配置会替换编辑器内容，之后仍需保存。'),
				E('pre', { 'style': 'max-height:45vh;overflow:auto;white-space:pre-wrap' }, config),
				E('div', { 'class': 'right' }, [
					E('button', { 'class': 'cbi-button', 'click': ui.hideModal }, '取消'), ' ',
					E('button', { 'class': 'cbi-button cbi-button-action', 'click': L.bind(function() {
						this.editor.value = config; ui.hideModal(); this.editor.focus();
					}, this) }, '替换编辑器内容')
				])
			]);
		}, this);
		const save = L.bind(function(apply) {
			return saveConfig(this.editor.value, this.revision, apply).then(checked).then(L.bind(function(result) {
				this.revision = result.revision;
				this.savedContent = this.editor.value;
				ui.addNotification(null, E('p', {}, apply ? '配置已保存并应用。' : '配置已保存，应用后生效。'), 'info');
				return getStatus().then(checked).then(L.bind(this.updateStatus, this));
			}, this));
		}, this);
		const action = L.bind(function(name) {
			return serviceAction(name).then(checked).then(function() { return getStatus(); }).then(checked).then(L.bind(this.updateStatus, this));
		}, this);
		const logs = E('pre', { 'style': 'max-height:24em;overflow:auto;white-space:pre-wrap', 'aria-live': 'polite' }, '点击“刷新日志”查看最近 100 条 Caddy 日志。');
		poll.add(L.bind(function() {
			return getStatus().then(checked).then(L.bind(this.updateStatus, this)).catch(function() {});
		}, this), 5);
		const result = E('div', { 'class': 'caddy-page' }, [
			E('style', {}, '.caddy-page .caddy-toolbar{display:flex;flex-wrap:wrap;gap:.6em;margin:1em 0}.caddy-page .caddy-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1em}.caddy-page .caddy-field{display:flex;flex-direction:column;gap:.4em}.caddy-page .caddy-field[hidden]{display:none}.caddy-page .caddy-site{padding:1em;border:1px solid #aaa6;margin:1em 0}.caddy-page input[type=checkbox]{align-self:flex-start}.caddy-page details{margin:1em 0}'),
			E('h2', {}, 'Caddy'),
			E('p', {}, '配置反向代理、静态网站与自动 HTTPS。配置文件：/etc/caddy-luci/Caddyfile'),
			this.status,
			E('div', { 'class': 'caddy-toolbar' }, [
				this.button('启动', function() { return action('start'); }),
				this.button('停止', function() { return action('stop'); }),
				this.button('重启', function() { return action('restart'); }),
				this.button('启用开机启动', function() { return action('enable'); }),
				this.button('禁用开机启动', function() { return action('disable'); })
			]),
			E('details', {}, [
				E('summary', {}, '站点配置生成器'),
				E('p', {}, '域名默认使用自动 HTTPS；:8080 使用 HTTP。公有证书需要正确的 DNS、可访问的验证端口和准确的系统时间。内部 CA 证书需要客户端信任。'),
				field('ACME 邮箱', email), this.sites,
				E('div', { 'class': 'caddy-toolbar' }, [this.button('添加站点', L.bind(this.newSite, this)), this.button('生成配置预览', generate)])
			]),
			E('h3', {}, 'Caddyfile'),
			E('p', {}, '保存前会调用 Caddy 校验。请保留全局 admin Unix socket 设置，用于平滑加载配置。80/443 端口可能已由 LuCI/uhttpd 占用。'),
			this.editor,
			E('div', { 'class': 'caddy-toolbar' }, [
				this.button('校验配置', L.bind(function() {
					return validate(this.editor.value).then(checked).then(function(r) {
						ui.showModal('校验通过', [E('pre', { 'style': 'white-space:pre-wrap' }, r.message), E('button', { 'class': 'cbi-button', 'click': ui.hideModal }, '关闭')]);
					});
				}, this)),
				this.button('保存', function() { return save(false); }),
				this.button('保存并应用', function() { return save(true); }, true)
			]),
			E('h3', {}, '服务日志'),
			E('button', { 'class': 'cbi-button', 'click': L.bind(function(event) {
				const button = event.currentTarget;
				button.disabled = true;
				getLogs().then(checked).then(function(r) { logs.textContent = r.content || '暂无 Caddy 日志'; })
					.catch(this.notifyError).finally(function() { button.disabled = false; });
			}, this) }, '刷新日志'), logs
		]);
		if (this.readonly)
			result.querySelectorAll('input, select, .caddy-site button').forEach(function(el) { el.disabled = true; });
		return result;
	},
	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
