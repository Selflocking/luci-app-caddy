# 开发与验证

## 目录结构

```text
Makefile                         LuCI 的 OpenWrt 包配方
htdocs/luci-static/resources/
  caddy/generator.js             受限 Caddyfile 解析、校验与生成
  view/caddy/sites.js            可视化站点配置
  view/caddy/overview.js         高级编辑、服务状态与日志
root/
  etc/caddy-luci/Caddyfile       默认配置
  etc/init.d/caddy-luci          procd 服务
  usr/libexec/caddy-luci-run     Caddy 工作目录和运行环境
  usr/libexec/rpcd/luci.caddy     固定路径、白名单 RPC 接口
  usr/share/luci/menu.d/         LuCI 菜单
  usr/share/rpcd/acl.d/           RPC 权限
packages/caddy/Makefile          可选的 Caddy 依赖包配方
scripts/build-ipk.py             ARM64 独立构建、opkg 打包
scripts/check.sh                 本地检查入口
tests/                          Node.js、DOM、RPC 和打包测试
docs/                           构建、配置、开发和实机验证记录
dist/                           安装包与本地部署产物，不纳入 Git
```

## 本地检查

需要 Node.js 18+、npm、Python 3、Git，以及本机可执行的 Caddy 2。npm 依赖仅用于开发测试，路由器不需要 Node.js。

```sh
npm ci --ignore-scripts
CADDY_BIN=/absolute/path/to/caddy npm run check
```

入口执行 JavaScript/shell 语法检查和全部测试。如果未设置 `CADDY_BIN`，会尝试查找 PATH 中的 Caddy；
均未找到时，会明确跳过真实 Caddy 集成和 RPC 后端测试，不能将跳过报告为全部实测通过。
使用源码生成的安装包不能在 x86 主机上直接作为 `CADDY_BIN`，需要主机架构的可执行文件。

可按改动范围分别执行：

```sh
npm test
CADDY_BIN=/absolute/path/to/caddy node --test tests/generator.test.cjs
node --test tests/sites.test.cjs
CADDY_BIN=/absolute/path/to/caddy python3 -m unittest discover -s tests -p 'test_backend.py' -v
python3 -m unittest discover -s tests -p 'test_packaging.py' -v
git diff --check
```

## 测试覆盖

- `generator.test.cjs`：生成、解析往返、拒绝未知指令、原样处理转义；真实 Caddy HTTP 反代/文件/文本与平滑加载。
- `sites.test.cjs`：DOM 表单回填、保存再读取、删除确认、只读权限、高级配置保护、失败后保留改动。
- `test_backend.py`：临时文件系统内运行实际 RPC shell，使用真实 Caddy 校验/适配；模拟 jshn、ubus、jsonfilter 和 procd。
- `test_packaging.py`：opkg 目录条目、控制文件、权限和确定性归档。

完整本地检查当前包含 20 项测试。模拟测试不证明实际 LuCI、rpcd 或固件行为一致，涉及这些接口的修改应在目标固件验证。
SDK 构建、原生 Go 交叉构建、本机测试、路由器安装、浏览器联调是不同证据，记录时分别说明。

## 实现约定

- Caddyfile 是配置来源，两个页面使用同一个 RPC 后端与版本检查，避免引入不同步的额外配置文件。
- 解析器只接受表单能重新表达的指令。新增指令需同时更新生成、读取、表单和往返测试。
- 保存前校验，使用临时文件、互斥锁与版本校验；失败保留原文件，应用失败恢复备份。
- Caddyfile 不是 JSON 字符串语法。修改引号、转义或多行文本时，用真实 Caddy 验证最终内容。
- LuCI `E()` 创建 HTML 属性时，`checked="false"` 仍视为勾选。布尔属性使用 DOM property 设置，测试替身需匹配实际行为。
- 实机部署需用户明确授权；不要因本地检查自行重启路由器、修改网络或替换其配置。

## 提交与发布

按功能拆分提交，每个 commit 使用 GPG 签名：

```sh
git commit -S -m 'docs: describe configuration workflow'
git verify-commit HEAD
```

签名超时或硬件密钥需要 PIN/触摸时保留更改并通知用户，不得关闭签名、切换到未签名提交或调整用户密钥策略。
推送前检查工作区、签名和目标分支；不使用 force push 覆盖远端历史。

升级应用版本更新根目录 `Makefile`；升级 Caddy 同步 `packages/caddy/Makefile` 的版本、哈希、构建说明和测试条件。
`dist/`、`node_modules/`、缓存、登录凭据、私钥、证书数据和本机部署报告均不提交。
