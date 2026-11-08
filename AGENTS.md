# 项目协作约定

## 项目边界

这是 OpenWrt 的 LuCI Caddy 2 插件。路由器端仅使用 LuCI JS、shell、rpcd 与 procd；
Node.js/jsdom 和 Python 测试依赖只在开发主机运行，不引入为路由器运行依赖。

修改前先读 `README.md` 和相关 `docs/` 文档；目录和检查说明见 `docs/development.md`。

## 代码位置

- `htdocs/luci-static/resources/caddy/generator.js`：受限 Caddyfile 读取与生成。
- `htdocs/luci-static/resources/view/caddy/sites.js`：独立可视化站点页面。
- `htdocs/luci-static/resources/view/caddy/overview.js`：高级编辑和服务管理。
- `root/usr/libexec/rpcd/luci.caddy`：RPC、版本检查、校验、保存与回滚。
- `root/etc/init.d/caddy-luci`、`root/usr/libexec/caddy-luci-run`：服务生命周期及运行环境。
- `root/usr/share/`：菜单与 ACL。新增 RPC 时同步审查权限范围。
- 根 `Makefile`、`packages/caddy/Makefile`：应用和可选 Caddy 包版本。
- `scripts/`、`tests/`：构建和本地检查。`dist/` 是忽略的本地产物目录。

## 实现要求

- 以 `/etc/caddy-luci/Caddyfile` 为唯一配置来源，两个页面共用 RPC 与版本检查。
- 不静默丢弃未知指令。可视化不能表达的配置须保留并交给高级编辑。
- 保留固定 Unix 管理 socket、保存前校验、互斥锁、版本冲突检测与失败回滚。
- RPC 继续使用固定路径和操作白名单，不添加任意 shell 或任意文件访问能力。
- 修改引号、转义或多行文本须用真实 Caddy 验证；不要把 Caddyfile 当 JSON 字符串语法。
- HTML 布尔属性使用 DOM property 设置，不把 `false` 输出成 `checked="false"` 等属性。
- 更改配置指令时同步更新生成、读取、表单、往返测试及支持范围文档。

## 验证

- 修改后执行与改动相关的检查。完整入口：`CADDY_BIN=/absolute/path/to/caddy npm run check`。
- 初次准备依赖：`npm ci --ignore-scripts`。
- 可用本机 Caddy 时，执行真实 Caddy 集成测试和 RPC 后端测试；不能为了测试方便跳过已有可用二进制。
- 缺少 Caddy 时如实报告跳过；不得把跳过或模拟测试报告为实机验证通过。
- 文档改动检查命令、相对链接和路径。推送前执行 `git diff --check`。
- 区分 SDK 编译、独立 Go 交叉编译、本机测试、路由器安装和浏览器联调，不夸大验证范围。

## 部署与文件

- 实机安装、服务操作和配置变更需要当前会话中的用户授权；文档修改或本地测试不隐含部署授权。
- 部署前检查固件、架构、包管理器、依赖、端口和空间，备份被修改的现有配置。
- 验证后恢复临时测试配置；不顺带修改网络、防火墙、DNS、登录凭据或管理端口。
- 不提交安装包、`node_modules/`、缓存、密码、令牌、私钥、证书数据、本机日志或未整理的部署产物。
- 应用版本以根 `Makefile` 为准；Caddy 升级需同步版本、源码哈希、构建说明和测试条件。

## Git 与 GitHub

- 按功能拆分提交，完成一个可检查模块后及时 commit。
- **所有 Git commit 必须使用 GPG 签名**：`git commit -S`，提交后使用 `git verify-commit` 检查。
- 签名超时或硬件密钥需要交互时，保留更改并告知用户；不得改用未签名提交。
- 不关闭签名、不替换用户签名身份、不擅自修改 PIN/触摸策略。PIN 只能由用户在系统弹窗输入。
- 推送前核对远端仓库、目标分支和已有历史；不使用 force push 覆盖远端内容。
- 只有用户要求时才推送、创建仓库或发布版本；创建仓库的可见性以用户明确要求为准。
