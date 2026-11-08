'use strict';
'require view';
'require rpc';
'require ui';
'require caddy.generator as generator';

const readConfig = rpc.declare({ object: 'luci.caddy', method: 'read', expect: {} });
const saveConfig = rpc.declare({ object: 'luci.caddy', method: 'save', params: ['content', 'revision', 'apply'], expect: {} });
const validate = rpc.declare({ object: 'luci.caddy', method: 'validate', params: ['content'], expect: {} });

function checked(result) {
	if (!result || !result.ok) throw new Error(result && result.message || '操作失败');
	return result;
}

function field(label, control, help) {
	return E('label', { 'class': 'caddy-field' }, [E('span', {}, label), control,
		help ? E('small', { 'class': 'description' }, help) : '']);
}

function text(value, placeholder) {
	return E('input', { 'class': 'cbi-input-text', 'value': value || '', 'placeholder': placeholder || '' });
}

function confirmAction(title, message) {
	return new Promise(function(resolve) {
		ui.showModal(title, [E('p', {}, message), E('div', { 'class': 'right' }, [
			E('button', { 'class': 'cbi-button', 'click': function() { ui.hideModal(); resolve(false); } }, '取消'), ' ',
			E('button', { 'class': 'cbi-button cbi-button-action', 'click': function() { ui.hideModal(); resolve(true); } }, '确认')
		])]);
	});
}

return view.extend({
	load: function() { return readConfig().then(checked); },

	run: function(task) {
		if (this.working) return Promise.resolve();
		this.working = true;
		this.refresh();
		return Promise.resolve().then(task).catch(function(error) {
			ui.addNotification(null, E('pre', { 'style': 'white-space:pre-wrap' }, error.message), 'error');
		}).finally(L.bind(function() { this.working = false; this.refresh(); }, this));
	},

	button: function(label, task, kind) {
		return E('button', {
			'class': 'cbi-button ' + (kind === 'save' ? 'cbi-button-action important' : 'cbi-button-neutral'),
			'data-kind': kind || 'write',
			'click': L.bind(function() { this.run(task); }, this)
		}, label);
	},

	model: function() {
		return { email: this.email.value.trim(), sites: Array.from(this.cards.children).map(function(card) { return card.getSite(); }) };
	},

	refresh: function() {
		if (!this.root) return;
		let valid = !this.importError;
		if (valid) {
			try {
				const model = this.model();
				this.generated = generator.generate(model.sites, model.email);
				this.dirty = this.generated !== this.baseline;
				this.preview.textContent = this.generated;
				this.message.textContent = model.sites.length + ' 个站点 · ' + (this.dirty ? '有未保存的修改' : '已读取当前配置');
			} catch (error) {
				valid = false; this.dirty = true;
				this.message.textContent = error.message;
				this.preview.textContent = '请先完善表单，配置预览将在这里显示。';
			}
		}
		this.form.disabled = this.readonly || this.working || !!this.importError;
		this.root.querySelectorAll('button[data-kind]').forEach(L.bind(function(button) {
			const kind = button.getAttribute('data-kind');
			button.disabled = this.working || (kind !== 'read' && (this.readonly || !!this.importError)) || (kind === 'save' && !valid);
		}, this));
		this.message.setAttribute('role', valid ? 'status' : 'alert');
	},

	addSite: function(site) {
		site = site || { address: '', type: 'proxy', upstream: '127.0.0.1:3000', compress: true };
		const address = text(site.address, 'example.com 或 :8080');
		const type = E('select', { 'class': 'cbi-input-select' }, [
			E('option', { 'value': 'proxy' }, '反向代理'), E('option', { 'value': 'files' }, '静态文件'), E('option', { 'value': 'respond' }, '文本响应')
		]);
		type.value = site.type;
		const upstream = text(site.upstream, '127.0.0.1:3000');
		const directory = text(site.root, '/srv/www');
		const body = E('textarea', { 'class': 'cbi-input-textarea', 'rows': 3 });
		body.value = site.body || '';
		const tls = E('select', { 'class': 'cbi-input-select' }, [
			E('option', { 'value': 'auto' }, '自动（域名自动申请公有证书）'), E('option', { 'value': 'internal' }, '内部 CA（局域网证书）')
		]);
		tls.value = site.internal ? 'internal' : 'auto';
		const compress = E('input', { 'type': 'checkbox' });
		const log = E('input', { 'type': 'checkbox' });
		const browse = E('input', { 'type': 'checkbox' });
		compress.checked = !!site.compress;
		log.checked = !!site.log;
		browse.checked = !!site.browse;
		const upstreamField = field('上游服务', upstream, '多个上游用空格分隔，例如 192.168.1.10:3000。');
		const directoryField = field('网站目录', directory, '填写路由器上的绝对路径。');
		const bodyField = field('响应内容', body);
		const browseField = field('允许目录浏览', browse, '启用后，访客可以查看目录内文件列表。');
		const title = E('h3', {}, site.address || '新站点');
		const card = E('section', { 'class': 'caddy-site' }, [title,
			E('div', { 'class': 'caddy-grid' }, [
				field('站点地址', address, '多个地址用逗号分隔。使用 :8080 或 http:// 开头可提供 HTTP。'),
				field('站点类型', type), upstreamField, directoryField, bodyField,
				field('证书方式', tls, '内部 CA 证书需在客户端手动信任。'),
				field('启用压缩', compress), field('记录访问日志', log), browseField
			]),
			this.button('删除站点', L.bind(function() {
				return confirmAction('删除站点', '删除后需保存才会生效。确定移除“' + (address.value || '新站点') + '”？').then(function(confirmed) {
					if (confirmed) card.remove();
				});
			}, this))
		]);
		card.getSite = function() {
			return { address: address.value, type: type.value, upstream: upstream.value, root: directory.value,
				body: body.value, internal: tls.value === 'internal', compress: compress.checked, log: log.checked, browse: browse.checked };
		};
		const changed = L.bind(function() {
			upstreamField.hidden = type.value !== 'proxy';
			directoryField.hidden = browseField.hidden = type.value !== 'files';
			bodyField.hidden = type.value !== 'respond';
			title.textContent = address.value || '新站点';
			this.refresh();
		}, this);
		card.addEventListener('input', changed);
		card.addEventListener('change', changed);
		this.cards.appendChild(card);
		changed();
		return address;
	},

	populate: function(data) {
		this.revision = data.revision;
		this.original = data.content;
		this.cards.replaceChildren();
		this.importError = null;
		this.dirty = false;
		try {
			const model = generator.parse(data.content);
			this.baseline = generator.generate(model.sites, model.email);
			this.email.value = model.email;
			model.sites.forEach(L.bind(this.addSite, this));
			this.warning.hidden = true;
		} catch (error) {
			this.importError = error;
			this.warning.hidden = false;
			this.warning.textContent = '当前配置包含可视化页面尚不支持的内容，请使用高级配置编辑，现有文件不会被覆盖。' + error.message;
			this.message.textContent = '请切换到高级配置';
			this.preview.textContent = data.content;
		}
		this.refresh();
	},

	save: function(apply) {
		// Keep original comments/formatting when applying without form edits.
		const content = this.dirty ? this.generated : this.original;
		return saveConfig(content, this.revision, apply).then(checked).then(L.bind(function(result) {
			this.revision = result.revision;
			this.original = content;
			this.baseline = this.generated;
			this.dirty = false;
			ui.addNotification(null, E('p', {}, apply ? '站点配置已保存并应用。' : '站点配置已保存，应用后生效。'), 'info');
		}, this));
	},

	render: function(data) {
		this.readonly = !L.hasViewPermission();
		this.email = text('', 'admin@example.com（可选）');
		this.cards = E('div');
		this.message = E('p', { 'aria-live': 'polite' });
		this.warning = E('p', { 'class': 'alert-message warning', 'role': 'alert', 'hidden': true });
		this.preview = E('pre', { 'style': 'max-height:28em;overflow:auto;white-space:pre-wrap' });
		this.form = E('fieldset', { 'style': 'border:0;padding:0;margin:0;min-width:0' }, [
			field('证书通知邮箱', this.email, '用于接收 ACME 证书通知，可留空。'), this.cards
		]);
		this.email.addEventListener('input', L.bind(this.refresh, this));
		this.root = E('div', { 'class': 'caddy-visual' }, [
			E('style', {}, '.caddy-visual .caddy-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:1.2em}.caddy-visual .caddy-field{display:flex;flex-direction:column;gap:.4em}.caddy-visual .caddy-field[hidden],.caddy-visual [hidden]{display:none}.caddy-visual .caddy-site{padding:1.4em;border:1px solid #aaa6;border-radius:6px;margin:1.2em 0}.caddy-visual .caddy-toolbar{display:flex;flex-wrap:wrap;gap:.6em;margin:1.2em 0}.caddy-visual input[type=checkbox]{align-self:flex-start}.caddy-visual small{font-weight:normal;opacity:.8}.caddy-visual textarea{width:100%}'),
			E('h2', {}, 'Caddy · 站点配置'),
			E('p', {}, '通过表单管理站点，无需手写 Caddyfile。保存前自动校验，保存并应用后生效。'),
			E('p', {}, [E('a', { 'href': L.url('admin/services/caddy/advanced') }, '高级配置与服务管理 →')]),
			this.warning, this.message, this.form,
			E('div', { 'class': 'caddy-toolbar' }, [
				this.button('添加站点', L.bind(function() { this.addSite().focus(); }, this)),
				this.button('重新读取配置', L.bind(function() {
					const decision = this.dirty ? confirmAction('重新读取配置', '将放弃本页尚未保存的修改，是否继续？') : Promise.resolve(true);
					return decision.then(function(confirmed) { return confirmed ? readConfig().then(checked) : null; }).then(L.bind(function(result) {
						if (result) this.populate(result);
					}, this));
				}, this), 'read')
			]),
			E('details', {}, [E('summary', {}, '查看生成的 Caddyfile'),
				E('p', {}, '修改表单后保存会统一配置排版，原有注释不会保留。'), this.preview]),
			E('div', { 'class': 'caddy-toolbar' }, [
				this.button('校验配置', L.bind(function() {
					return validate(this.generated).then(checked).then(function() { ui.addNotification(null, E('p', {}, '配置校验通过。'), 'info'); });
				}, this), 'save'),
				this.button('保存', L.bind(function() { return this.save(false); }, this), 'save'),
				this.button('保存并应用', L.bind(function() { return this.save(true); }, this), 'save')
			])
		]);
		this.populate(data);
		return this.root;
	},
	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
