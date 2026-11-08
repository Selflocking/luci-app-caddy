# luci-app-caddy

面向 OpenWrt 的 Caddy 2 LuCI 配置插件，使用现代 JavaScript LuCI，无需 Lua。

## 功能

- 中文管理页面：**服务 → Caddy**。
- 多站点生成器：反向代理（多个上游）、静态文件、文本响应。
- 自动 HTTPS、内部 CA、压缩、访问日志、可选目录浏览。
- 完整 Caddyfile 编辑；生成器预览确认后替换编辑器，不会解析或自动覆盖已有文件。
- 保存前使用 Caddy 校验；保存并应用时平滑加载，服务未启动则启动。
- 应用失败恢复之前的配置文件；通过 SHA-256 版本检查避免覆盖其他页面的修改。
- 服务启停、重启、开机启动控制、每 5 秒更新状态、最近 100 条日志。
- 独立 rpcd 接口和权限声明，不授予网页任意文件读写或 shell 执行权限。

## 编译

需要已配置目标架构的 OpenWrt 源码或 SDK，以及 `luci`、`packages` feeds。
推荐使用支持现代 LuCI JS 的固件（23.05 及以后）；尚未在路由器实机验证。
附带的 Caddy 2.11.9 构建配方需要 **Go 1.26 或更新版本的 OpenWrt golang feed**。
旧 SDK 可使用已有、兼容目标系统的 Caddy 2 软件包，或升级 golang feed；不能直接用旧版 Go 编译本配方。

在 OpenWrt/SDK 根目录执行，替换第一行中的项目路径：

```sh
CADDY_PLUGIN_SOURCE='/absolute/path/to/luci-app-caddy'
./scripts/feeds update -a
./scripts/feeds install -a
mkdir -p package/custom
cp -a "$CADDY_PLUGIN_SOURCE" package/custom/luci-app-caddy

# 如果 feeds 已有 caddy 包，使用已有包，不要再复制同名包。
# 如果没有，使用本仓库附带的配方：
cp -a "$CADDY_PLUGIN_SOURCE/packages/caddy" package/custom/caddy

make menuconfig
# LuCI → Applications → luci-app-caddy
make package/luci-app-caddy/compile V=s
```

输出在 `bin/packages/` 内；具体包格式由 SDK 决定。`luci-app-caddy` 与架构无关，
`caddy` 必须匹配路由器 CPU 架构。仓库没有附带已编译安装包。

附带的 `caddy` 包仅安装官方标准模块二进制，不含第三方 DNS provider。
如果使用其他 feed 的 Caddy 包，该包自己的服务与本插件的 `caddy-luci` 服务需要避免同时监听相同端口。

## 安装和首次使用

先将依赖及编译产物放到路由器，使用对应固件的包管理器安装：

```sh
# opkg 固件：先安装匹配架构的 caddy，再安装 LuCI 包
opkg install /tmp/caddy_*.ipk
opkg install /tmp/luci-app-caddy_*.ipk
/etc/init.d/rpcd restart
```

APK 固件使用 `apk add` 安装相应 `.apk` 文件；本地未签名软件包的安装策略由固件决定。
安装后刷新 LuCI，进入 **服务 → Caddy**。

OpenWrt 的标准安装流程会启动并启用服务。默认配置在 **8080** 上提供测试文本，
不占用 LuCI 常见的 80/443 端口。可在页面中停止服务或禁用开机启动。
插件不会修改 uhttpd、防火墙或 DNS。

1. 展开“站点配置生成器”，填写域名或 `:8080`、站点类型和上游/网站目录。
2. 点击“生成配置预览”，确认后替换编辑器内容；也可直接编辑 Caddyfile。
3. 点击“校验配置”，再“保存并应用”。“保存”只写入配置文件。
4. 配置域名时，确认 DNS 指向路由器，所需验证端口可达，并处理 uhttpd 的端口占用。

公有域名默认由 Caddy 自动申请和续期证书。`http://example.com:8080` 或 `:8080` 使用 HTTP。
内部 CA 适合局域网域名，需要在客户端信任其根证书。
生成器的 HTTPS 上游需要上游证书正常受信任；更复杂的传输设置可直接写 Caddyfile。

## 配置示例

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

请保留上面的 `admin` Unix socket：插件通过此 socket 平滑加载，保存校验会检查该设置。
管理 API 不监听 TCP。Caddy 以 root 运行，配置界面应只授予可信管理员。
`file_server browse` 会展示目录内容，默认不启用。

| 项目 | 路径 |
| --- | --- |
| 配置 | `/etc/caddy-luci/Caddyfile` |
| 上次保存前的备份 | `/etc/caddy-luci/Caddyfile.bak` |
| 证书和 Caddy 持久数据 | `/etc/caddy-luci/data/caddy/` |
| 临时配置缓存 | `/tmp/caddy-luci/config/` |
| 管理 socket | `/var/run/caddy-luci/admin.sock` |
| procd 服务 | `/etc/init.d/caddy-luci` |

`/etc/caddy-luci/` 已声明为包配置目录，含证书私钥，备份时应妥善保管。
运行日志通过 procd 输出到系统日志，页面只展示包含 `caddy` 的最近 100 条。
访问日志默认发送到系统日志，受系统日志环形缓冲区大小限制。

```sh
/etc/init.d/caddy-luci start
/etc/init.d/caddy-luci stop
/etc/init.d/caddy-luci reload
/etc/init.d/caddy-luci enable
logread -e caddy
ubus call luci.caddy status
```

校验成功不保证端口可绑定或远程上游可访问。启动失败后查看日志。
应用失败会恢复磁盘配置；对已运行服务，Caddy 的加载失败保留先前运行配置。
如果浏览器在保存期间断线，重新加载页面再继续编辑，以重新取得配置版本。

## 本地验证

需要 Node.js 18+、Python 3 和本机可执行的 Caddy 2：

```sh
node --check htdocs/luci-static/resources/view/caddy/overview.js
node --test tests/generator.test.cjs
CADDY_BIN=/absolute/path/to/caddy node --test tests/generator.test.cjs
CADDY_BIN=/absolute/path/to/caddy python3 tests/backend_test.py
```

集成测试启动本机临时 Caddy 和 HTTP 上游，验证反代、文件服务、文本响应、平滑加载与错误加载。
后端测试在临时目录运行实际 RPC shell 脚本，使用真实 Caddy 校验与适配；
`jshn`、`ubus`、`jsonfilter`、procd 由测试替身模拟，不操作主机系统服务。
这些测试不能代替 OpenWrt SDK 编译及 LuCI/rpcd/procd 实机联调。

## 参考

- [LuCI JavaScript API](https://openwrt.github.io/luci/jsapi/)
- [Caddy 命令行：校验与加载](https://caddyserver.com/docs/command-line)
- [Caddy 自动 HTTPS](https://caddyserver.com/docs/automatic-https)
- [Caddy 2.11.9](https://github.com/caddyserver/caddy/releases/tag/v2.11.9)

许可证：Apache-2.0。
