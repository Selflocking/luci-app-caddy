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

// Deliberately accept only directives the form can reproduce. Unknown Caddy
// syntax must never disappear merely because the user opened the visual view.
function tokens(line) {
	const values = [];
	let rest = line.trim();
	while (rest && rest[0] !== '#') {
		let value;
		if (rest[0] === '"') {
			const match = rest.match(/^"(?:[^"\\]|\\.)*"/);
			if (!match) throw new Error('字符串未闭合');
			value = JSON.parse(match[0]);
			rest = rest.slice(match[0].length);
			if (rest && !/^\s/.test(rest)) throw new Error('字符串后缺少空格');
		} else {
			const match = rest.match(/^\S+/)[0];
			if (match !== '{' && match !== '}' && /[{}"`\\#]/.test(match))
				throw new Error('包含暂不支持的语法');
			value = match;
			rest = rest.slice(match.length);
		}
		values.push(value);
		rest = rest.trimStart();
	}
	return values;
}

return baseclass.extend({
	parse: function(content) {
		const result = { email: '', sites: [] };
		let global = false, globalDone = false, admin = false, site = null;
		let seen = new Set();
		String(content).split(/\r?\n/).forEach(function(line, index) {
			try {
				const t = tokens(line);
				if (!t.length) return;
				if (!global && !site) {
					if (!globalDone && !result.sites.length && t.length === 1 && t[0] === '{') {
						global = true;
						return;
					}
					if (!globalDone || t.length < 2 || t[t.length - 1] !== '{')
						throw new Error('需要全局选项块或站点地址');
					site = { address: t.slice(0, -1).join(' '), type: '', internal: false, compress: false, log: false, browse: false };
					seen = new Set();
					return;
				}
				if (t.length === 1 && t[0] === '}') {
					if (global) {
						if (!admin) throw new Error('缺少插件需要的 admin 设置');
						global = false; globalDone = true; seen = new Set();
					} else {
						if (!site.type || (seen.has('root') && site.type !== 'files') || (site.type === 'files' && !seen.has('root')))
							throw new Error('站点需要一个完整的代理、文件服务或文本响应配置');
						result.sites.push(site); site = null;
					}
					return;
				}
				if (seen.has(t[0])) throw new Error('重复配置项：' + t[0]);
				seen.add(t[0]);
				if (global) {
					if (t.length === 2 && t[0] === 'admin' && t[1] === 'unix//var/run/caddy-luci/admin.sock') admin = true;
					else if (t.length === 2 && t[0] === 'email') result.email = t[1];
					else throw new Error('全局选项暂不支持：' + t[0]);
					return;
				}
				switch (t[0]) {
				case 'tls':
					if (t.length !== 2 || t[1] !== 'internal') throw new Error('暂只支持自动证书或内部 CA');
					site.internal = true; break;
				case 'encode':
					if (t.join(' ') !== 'encode zstd gzip') throw new Error('暂只支持 zstd gzip 压缩组合');
					site.compress = true; break;
				case 'log':
					if (t.length !== 1) throw new Error('暂不支持自定义日志选项');
					site.log = true; break;
				case 'root':
					if (t.length !== 3 || t[1] !== '*') throw new Error('暂不支持带匹配条件的网站目录');
					site.root = t[2]; break;
				case 'reverse_proxy':
				case 'file_server':
				case 'respond':
					if (site.type) throw new Error('暂不支持同一站点组合多个处理器');
					if (t[0] === 'reverse_proxy') {
						site.type = 'proxy'; site.upstream = t.slice(1).join(' ');
					} else if (t[0] === 'file_server') {
						if (t.length > 2 || (t.length === 2 && t[1] !== 'browse')) throw new Error('暂不支持该文件服务选项');
						site.type = 'files'; site.browse = t[1] === 'browse';
					} else {
						if (t.length !== 3 || t[2] !== '200') throw new Error('暂只支持状态码 200 的文本响应');
						site.type = 'respond'; site.body = t[1];
					}
					break;
				default: throw new Error('配置项暂不支持：' + t[0]);
				}
			} catch (error) {
				throw new Error('第 ' + (index + 1) + ' 行：' + error.message);
			}
		});
		if (global || site || !globalDone) throw new Error('配置块不完整');
		// Apply the same value restrictions to imported and newly entered data.
		this.generate(result.sites, result.email);
		return result;
	},

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
