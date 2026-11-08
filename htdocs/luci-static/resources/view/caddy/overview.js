'use strict';
'require view';
'require rpc';
'require ui';
'require poll';

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
			E('style', {}, '.caddy-page .caddy-toolbar{display:flex;flex-wrap:wrap;gap:.6em;margin:1em 0}'),
			E('h2', {}, 'Caddy · 高级配置与服务'),
			E('p', {}, [E('a', { 'href': L.url('admin/services/caddy/sites') }, '← 返回可视化站点配置')]),
			E('p', {}, '直接编辑完整 Caddyfile。配置文件：/etc/caddy-luci/Caddyfile'),
			this.status,
			E('div', { 'class': 'caddy-toolbar' }, [
				this.button('启动', function() { return action('start'); }),
				this.button('停止', function() { return action('stop'); }),
				this.button('重启', function() { return action('restart'); }),
				this.button('启用开机启动', function() { return action('enable'); }),
				this.button('禁用开机启动', function() { return action('disable'); })
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
		return result;
	},
	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
