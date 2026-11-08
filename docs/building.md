# 构建与安装

支持两种构建路径。完整 OpenWrt/SDK 构建适用于目标固件的包格式；独立构建只生成 ARM64 的 opkg `.ipk`。
已验证的是后者，环境见[实机部署记录](deployments/2026-11-08.md)。

## OpenWrt 源码或 SDK

需要配置好目标设备及 `luci`、`packages` feeds。附带的 Caddy 2.11.9 配方需要 Go 1.26 或更新的 golang feed，旧 SDK 需要更新 Go 工具链或使用已有的兼容 Caddy 2 包。

在 OpenWrt/SDK 根目录执行，将第一行改成项目的绝对路径：

```sh
CADDY_PLUGIN_SOURCE='/absolute/path/to/luci-app-caddy'
./scripts/feeds update -a
./scripts/feeds install -a
mkdir -p package/custom/luci-app-caddy
cp "$CADDY_PLUGIN_SOURCE/Makefile" package/custom/luci-app-caddy/
cp -a "$CADDY_PLUGIN_SOURCE/htdocs" "$CADDY_PLUGIN_SOURCE/root" package/custom/luci-app-caddy/
```

如果 feeds 没有提供 `caddy`，再复制附带配方；已有同名包时跳过此步，避免重复定义：

```sh
cp -a "$CADDY_PLUGIN_SOURCE/packages/caddy" package/custom/caddy
```

选择 `LuCI → Applications → luci-app-caddy`，编译依赖和应用：

```sh
make menuconfig
make package/caddy/compile V=s
make package/luci-app-caddy/compile V=s
```

输出在 `bin/packages/`。包格式、CPU 架构和 ABI 必须匹配目标固件。
本项目尚未执行完整 OpenWrt SDK 构建，不能把独立构建通过等同于所有 SDK/架构均通过。

## ARM64 独立构建

主机需要 Git、Go、Python 3、curl、tar、sha256sum。Go 的自动工具链下载需要网络；`go.mod` 指定了 Go 1.26.0。
在项目根目录获取并验证官方固定版本源码：

```sh
CADDY_BUILD_DIR=$(mktemp -d)
curl -fL https://codeload.github.com/caddyserver/caddy/tar.gz/v2.11.9 \
  -o "$CADDY_BUILD_DIR/caddy.tar.gz"
printf '%s  %s\n' \
  'fefbe1f72b7a7e244f348c20eba377bb1e6964f51594229d2f38c49eaa2aa9a4' \
  "$CADDY_BUILD_DIR/caddy.tar.gz" | sha256sum -c -
tar -xzf "$CADDY_BUILD_DIR/caddy.tar.gz" -C "$CADDY_BUILD_DIR"
python3 scripts/build-ipk.py --caddy-source "$CADDY_BUILD_DIR/caddy-2.11.9"
```

版本和校验值以 `packages/caddy/Makefile` 为准，升级时同步更新。
脚本设置 `GOOS=linux GOARCH=arm64 CGO_ENABLED=0`，编译标准模块 Caddy 并生成：

```text
dist/
├── caddy_2.11.9-r1_aarch64_cortex-a53.ipk
├── luci-app-caddy_1.1.0-r1_all.ipk
└── build-info.json
```

可使用 `--arch aarch64_generic` 改变 ARM64 包架构标签；不支持任意 CPU 交叉编译。
`--output /path/to/output` 可指定输出目录。已有静态 ARM64 Caddy 时可改用 `--caddy-binary /path/to/caddy`，此时只打包，不编译。
脚本检查 ELF 架构，调用者仍需确保传入的二进制是可信且适合目标系统的静态构建。

包内含 opkg 控制文件、配置文件清单和安装/卸载钩子。`build-info.json` 记录源码提交、工作区状态与安装包 SHA-256。
这些本地安装包没有仓库签名，不等同于 Git commit 的 GPG 签名。

## 安装到 opkg 固件

先确认路由器的架构、空间和依赖：

```sh
ssh root@ROUTER_IP 'opkg print-architecture; df -h /overlay /tmp'
```

将 `ROUTER_IP` 替换为实际管理地址。`luci-app-caddy` 的依赖为 `luci-base`、`caddy`、`rpcd`、`jshn`、`jsonfilter`；Caddy 依赖 `ca-bundle`。
如果尚未安装，应先从与固件匹配的软件源安装依赖。随后上传安装包：

```sh
scp -O dist/caddy_2.11.9-r1_aarch64_cortex-a53.ipk \
  dist/luci-app-caddy_1.1.0-r1_all.ipk root@ROUTER_IP:/tmp/
ssh root@ROUTER_IP
opkg install /tmp/caddy_2.11.9-r1_aarch64_cortex-a53.ipk
opkg install /tmp/luci-app-caddy_1.1.0-r1_all.ipk
/etc/init.d/rpcd reload
```

默认监听 8080，安装过程会启动服务并启用开机启动。插件不会修改 uhttpd、防火墙、DNS 或网络配置。
使用其他 feed 的 Caddy 包时，避免其自带服务与 `caddy-luci` 重复监听端口。
附带 Caddy 仅含官方标准模块，没有第三方 DNS provider。

已有修改的 Caddyfile 由 opkg 作为配置文件保留；出现 `Caddyfile-opkg` 时先对比再合并，勿直接覆盖现有配置。
升级前应另外备份 `/etc/caddy-luci/`，其中可能包含证书私钥。

APK 固件须使用对应 SDK 生成 `.apk`，通过固件自带 `apk` 安装；上述独立构建的 `.ipk` 不能用于 APK。
