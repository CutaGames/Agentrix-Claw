# Agentrix Desktop 上线验证报告

日期：2026-04-26

分支：`build142-phase0-hardening`

基线提交：`be9ae707 feat: harden wearable bridge and chat streaming`

桌面版本：`0.1.1`
产品标识：`top.agentrix.desktop`

## 结论

桌面端核心功能链路已完成一轮上线前自动化验证：前端 TypeScript/Vite 构建通过，Playwright 桌面完整套件 44 个用例中 30 个通过、0 个失败、14 个因缺少真实/开发认证 token 或 OTP 条件跳过；Tauri release 打包通过并生成 EXE、MSI、NSIS 三类产物。

当前不建议直接公开发布为正式生产安装包，原因是 Windows 产物未签名、Tauri updater 未启用、干净 Windows 机器安装/卸载/升级仍需人工验收，且部分 authenticated desktop-sync/agent-presence 分支缺少真实 token 环境验证。

## 上线工作清单与验证状态

| 模块 | 上线要求 | 本轮验证方式 | 状态 | 结果 |
| --- | --- | --- | --- | --- |
| 前端构建 | TypeScript 与 Vite 构建通过 | `desktop/npm run build` | 通过 | 构建成功；存在既有 circular/static-dynamic import 与 chunk size 警告 |
| 登录入口 | QR、邮箱、OAuth、guest 入口可用 | `npm run test:desktop:full` | 通过 | Playwright 覆盖登录页、QR、邮箱 tab、OAuth tab、guest mode |
| 新手引导与聊天入口 | Guest onboarding 后进入聊天 | `npm run test:desktop:full` | 通过 | Playwright 覆盖 guest onboarding to chat |
| 聊天基础功能 | slash help 与能力问答可响应 | `npm run test:desktop:full` | 通过 | 覆盖 `/help` 与 capability question local answer |
| 流式输出与输入性能 | Streaming UI 不逐 token 重渲染 markdown，输入不被 chunk 更新拖慢 | 代码实现 + 构建 + E2E smoke | 通过 | `ChatPanel` 做 50ms chunk batching；streaming message 先纯文本，结束后 markdown 渲染 |
| 后端桌面 API | health、pair、models、search、skills、updater 端点可达或按权限拒绝 | `npm run test:desktop:full` | 通过 | API smoke 通过；需认证接口按预期要求 auth |
| Desktop sync | heartbeat/state/tasks/approvals/sessions/commands 权限与主链路 | `npm run test:desktop:full` | 部分通过 | 未认证保护通过；authenticated 分支因无 token/OTP 条件跳过 |
| Agent presence | agent/channel/dashboard/stats 相关接口 | `npm run test:desktop:full` | 部分通过 | 未认证保护通过；authenticated 创建/列表分支因无 token/OTP 条件跳过 |
| 工具权限/Tauri capability | 桌面命令权限文件存在并被 default capability 引用 | 静态检查 `src-tauri/capabilities` 与 `permissions` | 通过 | `desktop-commands` 权限文件存在并纳入 default capability |
| CSP/网络安全 | 限定 API、WebSocket、本地 sidecar 等允许来源 | 静态检查 `tauri.conf.json` | 通过 | CSP 已定义，包含 `api.agentrix.top`、`agentrix.top`、`127.0.0.1:8787`、`wss://api.agentrix.top` |
| 安装包构建 | 生成 Windows EXE、MSI、NSIS setup | `desktop/npm run tauri -- build` | 通过 | release build 完成，生成 3 个产物 |
| Windows 签名 | EXE/MSI/NSIS 具备 Authenticode 签名 | `Get-AuthenticodeSignature` | 阻塞 | 三个产物均为 `NotSigned`；`certificateThumbprint` 为空 |
| 自动更新 | Updater 配置启用并可发布更新元数据 | 静态检查 `tauri.conf.json` | 阻塞 | updater 当前未启用，不能作为正式自动更新链路 |
| 干净机安装 | 全新 Windows 用户可安装、启动、卸载、升级 | 当前环境无法无副作用完整执行 | 待人工验收 | 需用签名产物在干净 Windows/VM 验证 |

## 本轮命令结果

### 1. 桌面前端构建

命令：`npm run build`，工作目录：`desktop/`

结果：通过。Vite build 阶段耗时约 5.70s。警告项为既有依赖/代码拆包问题：Tauri API 与本地服务存在 circular/static-dynamic import warning，主 bundle 存在 large chunk warning。该类警告不阻塞本轮上线功能验证，但建议后续拆分大模块。

### 2. 桌面完整 Playwright

命令：`npm run test:desktop:full`，工作目录：仓库根目录。

结果：44 total，30 passed，0 failed，14 skipped。

跳过原因来自测试环境条件：缺少 Email OTP 或 auth token 时，authenticated desktop-sync 与 agent-presence 分支会跳过。未认证保护、登录入口、guest/onboarding/chat、能力问答、桌面 API smoke 均通过。

### 3. Tauri release 打包

命令：`npm run tauri -- build`，工作目录：`desktop/`

结果：通过。Rust release build 完成，耗时约 10m18s。警告项为未使用代码：`APP_COMMANDS`、`set_clipboard_text`、`get_selected_text`、`open_spotlight`、`close_spotlight`。

生成产物：

| 产物 | 大小 | 状态 |
| --- | ---: | --- |
| `desktop/src-tauri/target/release/agentrix-desktop.exe` | 18.48 MB | 已生成，未签名 |
| `desktop/src-tauri/target/release/bundle/msi/Agentrix Desktop_0.1.1_x64_en-US.msi` | 7.25 MB | 已生成，未签名 |
| `desktop/src-tauri/target/release/bundle/nsis/Agentrix Desktop_0.1.1_x64-setup.exe` | 5.39 MB | 已生成，未签名 |

## 正式上线前剩余工作

1. 配置 Windows 代码签名证书，并在 Tauri Windows bundle 中填入 `certificateThumbprint` 或等效签名配置。
2. 启用并验证 Tauri updater，包括更新 manifest、签名、公网下载地址、版本升级路径与失败回滚策略。
3. 在干净 Windows 10/11 VM 上验证 NSIS/MSI 安装、首次启动、登录/guest、退出、卸载、覆盖升级。
4. 准备可用的开发/测试 auth token 或 OTP 自动化环境，补跑 authenticated desktop-sync 与 agent-presence 分支。
5. 对 large chunk warning 做发布后性能优化：拆分编辑器、markdown、高亮、截图/系统命令等低频模块。
6. 对 Rust 未使用命令做清理或补齐调用入口，减少后续权限审计噪音。

## 发布判定

当前版本可作为内部 QA/灰度候选包继续验收；若要对外正式上线，签名、更新器、干净机安装验证和 authenticated 桌面协同链路必须补齐后再发布。