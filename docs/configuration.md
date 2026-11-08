# 配置与排障

## 可视化页面

入口为 **服务 → Caddy → 站点配置**。页面读取 `/etc/caddy-luci/Caddyfile` 并回填支持的站点。

1. 修改或添加站点，选择反向代理、静态文件或文本响应。
2. 配置地址、上游/目录/响应内容，按需启用内部 CA、压缩、访问日志或目录浏览。
3. 展开“查看生成的 Caddyfile”检查预览。
4. 点击“校验配置”，再点击“保存”或“保存并应用”。删除站点也需保存才生效。

`example.com` 默认使用自动 HTTPS；`:8080` 或 `http://example.com:8080` 使用 HTTP。
公有证书依赖正确的 DNS、可达的验证端口和准确的系统时间。内部 CA 根证书需要客户端信任。
启用目录浏览后，访客可以看到目录内容，默认不启用。

## 支持范围

| 范围 | 支持的指令 |
| --- | --- |
| 全局 | `admin` 固定 Unix socket、`email` |
| 站点处理 | `reverse_proxy`、`root *` + `file_server [browse]`、`respond ... 200` |
| 附加选项 | `tls internal`、`encode zstd gzip`、默认 `log` |

可视化页面支持本插件生成的配置和默认配置，不是任意 Caddyfile 的通用解析器。
`handle`、`import`、嵌套块、自定义证书、复杂匹配器或传输参数需在 **高级配置与服务** 页面编辑。
遇到不支持的指令时，可视化保存会禁用，原文件保留。

修改表单后保存会统一排版并移除注释；未修改表单直接应用时保留原始排版和注释。
同时包含反引号与换行/反斜杠的文本需使用高级编辑。至少保留一个站点才能通过表单保存。

## Caddyfile 示例

```caddyfile
{
    admin unix//var/run/caddy-luci/admin.sock
    email admin@example.com
}

app.example.com {
    encode zstd gzip
    reverse_proxy 192.168.1.100:3000
}

:8080 {
    root * /srv/www
    file_server
}
```

请保留固定的 `admin` Unix socket，保存校验会检查它，服务通过该接口平滑加载配置。
管理 API 不监听 TCP。Caddy 以 root 运行，配置权限应只授予可信管理员。

## 路径与服务

| 项目 | 路径 |
| --- | --- |
| Caddyfile | `/etc/caddy-luci/Caddyfile` |
| 上次保存前的备份 | `/etc/caddy-luci/Caddyfile.bak` |
| 证书和持久数据 | `/etc/caddy-luci/data/caddy/` |
| 临时配置缓存 | `/tmp/caddy-luci/config/` |
| 管理接口 | `/var/run/caddy-luci/admin.sock` |
| procd 服务 | `/etc/init.d/caddy-luci` |

SDK 配方声明 `/etc/caddy-luci/` 为配置目录；独立打包器将 Caddyfile 列入 opkg conffiles。
证书和运行时数据不是打包文件，需自行备份，并确认固件升级时的保留策略。

```sh
/etc/init.d/caddy-luci start
/etc/init.d/caddy-luci stop
/etc/init.d/caddy-luci restart
/etc/init.d/caddy-luci reload
/etc/init.d/caddy-luci enable
ubus call luci.caddy status
logread -e caddy
```

服务通过 procd 输出到系统日志，页面显示包含 `caddy` 的最近 100 条日志。
访问日志默认同样写入系统日志，受环形缓冲区大小限制。

## 常见问题

- **安装后菜单没出现**：确认 `opkg status luci-app-caddy` 为已安装，reload rpcd 后刷新 LuCI。
- **配置已保存但未生效**：“保存”只写文件，需要“保存并应用”。
- **提示配置已改变**：其他页面或 SSH 修改了文件。先复制本页未保存内容，再重新读取配置。
- **配置通过校验但服务无法启动**：检查端口占用、路径权限和服务日志；校验无法保证端口可绑定或上游可连接。
- **80/443 无法监听**：检查是否被 LuCI/uhttpd 或其他服务占用。插件不自动修改管理页面端口。
- **HTTPS 上游失败**：确认证书受信任，复杂的传输设置使用高级编辑。
- **应用失败**：插件恢复先前的磁盘配置；已运行的 Caddy 在加载失败时保留先前运行配置。修复问题后重新读取页面再保存。
- **保存中断线**：先重新读取当前配置确认结果，再继续编辑，避免使用过期版本覆盖。
