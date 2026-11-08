# luci-app-caddy

在 OpenWrt 的 LuCI 页面中配置 Caddy 2，支持可视化管理站点，也保留完整 Caddyfile 编辑入口。
路由器端使用 LuCI JavaScript、rpcd 和 procd，无需安装 Node.js 或 Lua。

## 功能

- **可视化站点配置**：读取已有配置，添加、修改、删除反向代理、静态网站和文本响应站点。
- **HTTPS 与站点选项**：公有域名自动 HTTPS、内部 CA、多个代理上游、压缩、访问日志和可选目录浏览。
- **实时预览与应用**：自动生成 Caddyfile，保存前调用 Caddy 校验，支持仅保存或保存并应用。
- **配置保护**：文件版本检查防止覆盖其他页面的修改；应用失败恢复先前的配置文件。
- **高级配置与服务**：完整 Caddyfile 编辑、启动/停止/重启、开机启动、服务状态和最近日志。

## 安装

先按[构建说明](docs/building.md)获得与固件匹配的安装包，确保 Caddy 架构与目标设备一致。
使用 opkg 的设备可将包上传到 `/tmp/`，然后安装：

```sh
opkg install /tmp/caddy_2.11.9-r1_aarch64_cortex-a53.ipk
opkg install /tmp/luci-app-caddy_1.1.0-r1_all.ipk
/etc/init.d/rpcd reload
```

上例 Caddy 包用于 `aarch64_cortex-a53`，不适合其他 CPU 架构。APK 固件须使用对应 SDK 生成的 `.apk`。
依赖包括 `luci-base`、`rpcd`、`jshn`、`jsonfilter` 和 `ca-bundle`，缺少时先从固件匹配的软件源安装。
源码仓库不提交预编译二进制，独立构建的本地产物位于 `dist/`。

安装后刷新 LuCI，进入 **服务 → Caddy → 站点配置**。
服务默认启动并启用开机启动，在 **8080** 提供测试响应，不自动修改 uhttpd、防火墙、DNS 或网络配置。

## 使用

1. 在“站点配置”填写域名或 `:8080`，选择站点类型和上游地址、网站目录或响应内容。
2. 按需配置证书、压缩、访问日志；展开预览查看生成的 Caddyfile。
3. 点击“校验配置”，然后“保存并应用”。“保存”只写入文件，删除站点也需保存才生效。
4. 复杂指令和服务管理使用“高级配置与服务”页面。

域名默认启用自动 HTTPS；`:8080` 或 `http://` 地址使用 HTTP。
公网证书需要正确的 DNS 和可访问的验证端口，80/443 可能已被 LuCI 或其他服务占用。

**可视化页面支持常用配置，不是任意 Caddyfile 的通用编辑器。**
遇到 `handle`、`import`、嵌套块或自定义证书等暂不支持的内容时，会禁用可视化保存并提示使用高级编辑，避免丢弃已有配置。
修改表单后保存会统一排版并移除原有注释，未修改表单直接应用会保留原始内容。

配置文件为 `/etc/caddy-luci/Caddyfile`，服务为 `/etc/init.d/caddy-luci`。
请保留全局 `admin unix//var/run/caddy-luci/admin.sock` 设置，用于平滑加载。
Caddy 以 root 运行，配置权限只应授予可信管理员。

## 文档

| 文档 | 内容 |
| --- | --- |
| [构建与安装](docs/building.md) | OpenWrt/SDK、ARM64 独立构建、依赖和安装包 |
| [配置与排障](docs/configuration.md) | 支持指令、配置示例、运行路径和常见问题 |
| [开发与验证](docs/development.md) | 目录结构、检查入口、测试与实现约定 |
| [实机验证记录](docs/deployments/2026-11-08.md) | 已验证设备、构建方式和测试范围 |
| [协作约定](AGENTS.md) | 代码修改、部署和 GPG 签名要求 |

## 开发检查

主机需要 Node.js 18+、npm、Python 3，以及本机架构的 Caddy 2：

```sh
npm ci --ignore-scripts
CADDY_BIN=/absolute/path/to/caddy npm run check
```

完整检查包含 JavaScript/shell 语法与 20 项测试；缺少 Caddy 时会明确跳过相关集成测试。
npm 依赖仅用于开发，不打包到路由器。

已在 GL.iNet GL-MT3600BE、Kwrt 25.12-SNAPSHOT、ARM64/opkg 上完成交叉编译、安装和浏览器保存应用验证。
尚未进行完整 OpenWrt SDK 构建、设备重启验证或公网 ACME 签发测试；其他固件需要另行验证。

## 参考与许可证

- [LuCI JavaScript API](https://openwrt.github.io/luci/jsapi/)
- [Caddy 命令行](https://caddyserver.com/docs/command-line)
- [Caddy 自动 HTTPS](https://caddyserver.com/docs/automatic-https)

本项目采用 [Apache-2.0](LICENSE) 许可证。
