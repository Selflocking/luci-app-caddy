# luci-app-caddy

面向 OpenWrt 的 Caddy 2 LuCI 配置插件，使用现代 JavaScript LuCI，无需 Lua。

## 功能

- 中文管理页面：**服务 → Caddy**。
- 独立可视化站点页面：读取已有站点，使用表单添加、修改、删除反向代理（多个上游）、静态文件和文本响应。
- 自动 HTTPS、内部 CA、压缩、访问日志、可选目录浏览。
- 表单实时预览 Caddyfile，直接校验、保存或保存并应用；高级页面保留完整 Caddyfile 编辑。
- 保存前使用 Caddy 校验；保存并应用时平滑加载，服务未启动则启动。
- 应用失败恢复之前的配置文件；通过 SHA-256 版本检查避免覆盖其他页面的修改。
- 服务启停、重启、开机启动控制、每 5 秒更新状态、最近 100 条日志。
- 独立 rpcd 接口和权限声明，不授予网页任意文件读写或 shell 执行权限。

## 编译

需要已配置目标架构的 OpenWrt 源码或 SDK，以及 `luci`、`packages` feeds。
推荐使用支持现代 LuCI JS 的固件（23.05 及以后）。已在 GL-MT3600BE 的 Kwrt 25.12-SNAPSHOT 上完成安装与实机联调，详见[部署记录](docs/deployment-2026-11-08.md)。
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
`caddy` 必须匹配路由器 CPU 架构。Git 仓库不提交二进制，本地构建产物保存在 `dist/`。

### ARM64 独立构建（opkg）

对于使用 opkg 的 ARM64 固件，也可以直接用 Go 交叉编译 Caddy，再用 Python 打包；
这条路径不使用 OpenWrt SDK，不适用于 APK 固件。LuCI JavaScript 无需本地代码编译。

先从 Caddy 官方获取与 `packages/caddy/Makefile` 一致的源码，校验 `PKG_HASH` 后解压，然后运行：

```sh
python3 scripts/build-ipk.py --caddy-source /absolute/path/to/caddy-2.11.9
# 可选：--arch aarch64_generic，默认 aarch64_cortex-a53
```

脚本自动设置 `GOOS=linux GOARCH=arm64 CGO_ENABLED=0`，通过 Go toolchain 自动下载所需编译器。
输出 `dist/caddy_2.11.9-r1_aarch64_cortex-a53.ipk`、`dist/luci-app-caddy_1.1.0-r1_all.ipk`
和含 SHA-256 校验值的 `dist/build-info.json`。
如果已有静态 ARM64 二进制，可以改用 `--caddy-binary /absolute/path/to/caddy`；此选项只打包，不编译。

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

1. 进入 **服务 → Caddy → 站点配置**，已有配置会自动回填到表单。
2. 添加或修改站点，填写域名或 `:8080`、站点类型和上游/网站目录。展开“查看生成的 Caddyfile”可查看实时预览。
3. 点击“校验配置”，再“保存并应用”。“保存”只写入配置文件；删除站点也需保存后才会生效。
4. 配置域名时，确认 DNS 指向路由器，所需验证端口可达，并处理 uhttpd 的端口占用。

**高级配置与服务**页面可直接编辑原始文件，也提供服务启停、开机启动和日志查看。
两个页面操作同一配置文件，使用版本检查防止相互覆盖。若提示配置已改变，先保留本页改动，再重新读取配置。

可视化页面可读取本插件生成的配置和默认配置，支持全局 `admin`、`email`，站点 `reverse_proxy`、
`root *`、`file_server [browse]`、`respond ... 200`、`tls internal`、`encode zstd gzip` 和默认 `log`。
它不承担任意 Caddyfile 语法的无损解析：遇到 `handle`、`import`、自定义证书、嵌套块等暂不支持的配置，
会禁用可视化保存并提示使用高级页面，避免丢弃已有设置。
修改表单并保存会统一排版、移除注释；未修改表单直接应用时保留原始注释与排版。
删除最后一个站点后，需添加至少一个站点才能保存。

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

需要 Node.js 18+、Python 3 和本机可执行的 Caddy 2。jsdom 仅用于开发测试，路由器上无需 Node.js 或 npm：

```sh
node --check htdocs/luci-static/resources/view/caddy/overview.js
node --check htdocs/luci-static/resources/view/caddy/sites.js
node --test tests/generator.test.cjs
npm ci --ignore-scripts
CADDY_BIN=/absolute/path/to/caddy npm test
CADDY_BIN=/absolute/path/to/caddy python3 tests/backend_test.py
python3 tests/packaging_test.py
```

集成测试启动本机临时 Caddy 和 HTTP 上游，验证反代、文件服务、文本响应、平滑加载与错误加载。
DOM 交互测试验证表单回填、保存再读取、删除确认、只读权限、高级配置保护和保存冲突后的改动保留。
后端测试在临时目录运行实际 RPC shell 脚本，使用真实 Caddy 校验与适配；
`jshn`、`ubus`、`jsonfilter`、procd 由测试替身模拟，不操作主机系统服务。
本地测试不能代替目标固件的安装和联调。当前已验证的设备与构建方法见部署记录，尚未执行完整 OpenWrt SDK 构建。

## 参考

- [LuCI JavaScript API](https://openwrt.github.io/luci/jsapi/)
- [Caddy 命令行：校验与加载](https://caddyserver.com/docs/command-line)
- [Caddy 自动 HTTPS](https://caddyserver.com/docs/automatic-https)
- [Caddy 2.11.9](https://github.com/caddyserver/caddy/releases/tag/v2.11.9)

许可证：Apache-2.0。
