# 2026-11-08 实机部署记录

## 目标设备

- 地址：`192.168.99.1`。
- 型号：GL.iNet GL-MT3600BE。
- 固件：Kwrt / op 25.12-SNAPSHOT，`mediatek/filogic`。
- CPU / 包架构：ARM64 / `aarch64_cortex-a53`。
- 内核：6.12.115；libc：musl 1.2.5。
- 包管理器：opkg；LuCI：27.307。

## 构建和安装

Caddy 2.11.9 源码由官方 tag 压缩包获取，SHA-256 与仓库 `PKG_HASH` 一致。
使用 Go 1.26.0、`GOOS=linux GOARCH=arm64 CGO_ENABLED=0` 交叉编译，
通过 `scripts/build-ipk.py` 生成标准 opkg 包。这次没有使用完整 OpenWrt SDK。

安装的软件包：

- `caddy`：`2.11.9-r1`，架构 `aarch64_cortex-a53`。
- `luci-app-caddy`：`1.1.0-r1`，架构 `all`。

安装前的软件包清单已保存在设备 `/root/caddy-install-backup/packages-before.txt`。
原有 80/443 服务保留；Caddy 使用默认 8080，服务 `caddy-luci` 已启动并启用开机启动。
未修改网络、防火墙、DNS 或登录凭据。

## 实机验证

- opkg 正常安装、管理两个包，保留 Caddyfile 为配置文件。
- `/usr/bin/caddy version` 返回 `v2.11.9`。
- procd 状态为运行中，管理接口使用权限受限的 Unix socket。
- LuCI 可视化站点页面加载成功，默认表单回填准确，压缩和访问日志初始未勾选。
- 在真实 LuCI 页面修改文本响应，点击“保存并应用”，页面提示成功；HTTP 8080 立即返回修改后的内容。
- 测试结束后通过页面恢复默认响应 `Caddy is running on OpenWrt`。
- 真实 rpcd 拒绝无效 Caddyfile 和过期配置版本，磁盘配置保持不变。
- 服务重启正常；可读取服务状态与日志。
- 本地 12 项 JavaScript/DOM/真实 Caddy 测试、6 项 RPC 后端测试和 2 项打包测试通过。

本次发现并修复了 LuCI HTML 布尔属性的实际行为差异、procd 未命名实例警告，
以及 opkg 安装包必须包含父目录项的问题，并增加或修正了对应测试。

没有测试路由器重启后的启动过程、公网 ACME 签发、第三方 DNS 模块或所有 Caddy 指令。
本机生成的安装包与构建信息位于 `dist/`；实机页面截图为 `dist/router-sites.jpg`。
