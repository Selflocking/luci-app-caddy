'use strict';
'require baseclass';

// Values are emitted as single Caddyfile tokens, never as raw directives.
function quote(value) {
	return JSON.stringify(String(value));
}

function address(value) {
	value = String(value || '').trim();
	if (!/^(?:(?:https?:\/\/)?(?:\[[0-9a-fA-F:]+\]|[a-zA-Z0-9_*.-]+)(?::[0-9]{1,5})?|:[0-9]{1,5})$/.test(value))
		throw new Error('站点地址无效：' + value);
	const port = value.match(/:([0-9]+)$/);
	if (port && (+port[1] < 1 || +port[1] > 65535))
		throw new Error('端口必须在 1–65535 之间');
	return value;
}

return baseclass.extend({
	generate: function(sites, email) {
		if (!sites.length)
			throw new Error('请至少添加一个站点');
		const lines = ['{', '\tadmin unix//var/run/caddy-luci/admin.sock'];
		if (email) {
			if (!/^[^\s@{}"\\]+@[^\s@{}"\\]+\.[^\s@{}"\\]+$/.test(email))
				throw new Error('请输入有效的 ACME 邮箱');
			lines.push('\temail ' + quote(email));
		}
		lines.push('}', '');
		const used = new Set();
		sites.forEach(function(site) {
			const addresses = String(site.address || '').split(',').map(address);
			addresses.forEach(function(a) {
				if (used.has(a.toLowerCase()))
					throw new Error('站点地址重复：' + a);
				used.add(a.toLowerCase());
			});
			lines.push(addresses.join(', ') + ' {');
			if (site.internal) lines.push('\ttls internal');
			if (site.compress) lines.push('\tencode zstd gzip');
			if (site.log) lines.push('\tlog');
			switch (site.type) {
			case 'proxy': {
				const upstreams = String(site.upstream || '').trim().split(/\s+/);
				if (upstreams.some(function(u) {
					return !/^(?:(?:https?|h2c):\/\/)?(?:\[[0-9a-fA-F:]+\]|[a-zA-Z0-9_.-]+):[0-9]{1,5}$/.test(u) || +u.match(/:([0-9]+)$/)[1] < 1 || +u.match(/:([0-9]+)$/)[1] > 65535;
				})) throw new Error('上游格式：127.0.0.1:3000 或 https://example.com:443，多个上游用空格分隔');
				lines.push('\treverse_proxy ' + upstreams.join(' '));
				break;
			}
			case 'files':
				if (!site.root || site.root[0] !== '/' || /[\x00-\x1f{}]/.test(site.root))
					throw new Error('网站目录必须是绝对路径，不能包含控制字符或花括号');
				lines.push('\troot * ' + quote(site.root), '\tfile_server' + (site.browse ? ' browse' : ''));
				break;
			case 'respond':
				lines.push('\trespond ' + quote(site.body || '') + ' 200');
				break;
			default:
				throw new Error('未知站点类型');
			}
			lines.push('}', '');
		});
		return lines.join('\n');
	}
});
