# Agentrix 全端软件测试检验方案

更新时间：2026-04-25

## 1. 范围与目标

本方案覆盖当前优先级内的非可穿戴主线：移动端 Android/iOS、桌面端 Windows/macOS、网页端、后端与跨端同步。Wear OS、AI 眼镜等可穿戴设备先保留独立专项，不作为本轮阻断项。

目标是建立一套可以逐层执行的验证体系：先保证构建和类型基线，再用 Playwright/API/设备脚本模拟真实用户路径，最后在发版前跑安装包级验收。

## 2. 测试分层

| 层级 | 名称 | 运行频率 | 覆盖内容 | 阻断标准 |
| --- | --- | --- | --- | --- |
| L0 | 构建与类型基线 | 每次提交前 | 移动端 TypeScript、后端 build、桌面 Web build、网页 Next build | 任一失败即阻断 |
| L1 | API 与 Web 自动化 | 每日/发版前 | 生产或测试 API、网页关键路由、Expo Web 用户旅程 | P0/P1 失败阻断 |
| L2 | 移动端真机模拟 | 发版前 | 安装、启动、登录、聊天、语音、多模态、支付、市场、设置 | 闪退/核心路径失败阻断 |
| L3 | 桌面安装包验收 | 发版前 | Tauri 打包、安装、登录、QR 绑定、本地模型 sidecar、工具调用 | 核心路径失败阻断 |
| L4 | 生产回归 | 部署后 | PM2/API health、OpenClaw 云端对话、支付回调、跨端记忆同步 | P0 失败立刻回滚或热修 |

## 3. P0-P2 功能矩阵

| 模块 | P0 必测 | P1 必测 | P2 扩展 |
| --- | --- | --- | --- |
| 后端 | `/api/health`、登录、JWT、`/agents/unified`、`/openclaw/proxy/:id/stream`、`/claude/chat` | 记忆槽、Agent Account、支付 intent、marketplace、skills install | 分佣、社交监听、任务市场、资源市场 |
| 移动端 Android/iOS | 冷启动不闪退、登录/恢复会话、云端聊天、端侧模型状态、文字/图片/音频/视频附件、语音输入输出 | Checkout、WalletConnect、Agent Team、Agent 权限、社交/私信、OTA 更新 | 离线/弱网、后台唤醒、长会话稳定性、内存压力 |
| 桌面 Windows/macOS | 启动、登录、实例选择、云端聊天、桌面同步、API base 正确带 `/api` | 本地 llama sidecar、工具调用、截图/文件权限、自动更新、悬浮球 | 快捷键、系统托盘、崩溃恢复、离线缓存 |
| 网页端 | 首页、登录、agent builder、marketplace、pay checkout、admin login、agent team studio | 钱包支付、Stripe/Transak、developer console、工作台 | SEO、性能预算、错误边界、埋点 |
| 跨端协同 | 同一账号登录、多端实例列表一致、记忆共享、会话同步 | Agent Account 绑定、OpenClaw instance 绑定、权限同步 | 多设备并发、冲突合并、通知同步 |

## 4. 用户旅程验收用例

| 用例 ID | 用户旅程 | 自动化入口 | 手工补充 |
| --- | --- | --- | --- |
| UJ-001 | 新用户注册/登录后创建或选择 Agent，发送第一条云端消息 | API E2E + Expo Web | Android/iOS 真机确认键盘、权限弹窗 |
| UJ-002 | 同一账号在移动端与桌面端看到同一 Agent/实例并共享上下文 | API E2E + Desktop smoke | 双端并行操作确认同步延迟 |
| UJ-003 | 移动端选择本地模型，下载/检测模型包，执行端侧文本与多模态轮次 | Expo Web local-ai UI + Android 设备 | 真机模型下载、内存和发热 |
| UJ-004 | 图片、音频、视频附件进入多模态对话路径，不能静默回退到错误模型 | Expo Web local-ai UI | 真机拍照/相册/录音/视频选择 |
| UJ-005 | 购买 skill 或服务：marketplace -> checkout -> payment intent -> success | API E2E + Web route smoke | 钱包/Stripe 沙盒支付 |
| UJ-006 | Agent 权限、预算和工具策略保存后回读一致 | API E2E | 移动端权限页逐项保存 |
| UJ-007 | 桌面端本地模型 sidecar 调用工具，skills search/get installed 使用统一 API base | Desktop build + desktop smoke | Windows/macOS 实机 sidecar |
| UJ-008 | 后端两条聊天路径 `/openclaw/proxy/:id/stream` 与 `/claude/chat` 工具能力一致 | API E2E | 生产账号抽样对话 |
| UJ-009 | OTA 更新检查、下载提示、重启后版本与状态正确 | 移动端设备脚本 | EAS update 沙盒发布 |
| UJ-010 | 错误态：无网络、token 过期、支付取消、模型缺失、权限拒绝均有可恢复 UI | 设备脚本 + 手工 | 弱网和系统权限面板 |

## 5. 自动化脚本

主入口：`scripts/test/run-full-app-validation.ps1`

常用命令：

```powershell
# L0：默认 smoke，跑本机稳定基线
npm run test:full:smoke

# L0 + API E2E
npm run test:full:api

# L0 + Expo Web 用户旅程 Playwright
npm run test:full:expo-web

# L0 + API + Expo Web
npm run test:full:full

# Android 真机启动/闪退 smoke
powershell -ExecutionPolicy Bypass -File scripts/test/run-full-app-validation.ps1 -RunAndroidDevice

# iOS 模拟器启动 smoke，需在 macOS 上执行
powershell -ExecutionPolicy Bypass -File scripts/test/run-full-app-validation.ps1 -RunIosSimulator

# 桌面 Tauri 安装包构建，需本机 Rust/Tauri 环境完整
powershell -ExecutionPolicy Bypass -File scripts/test/run-full-app-validation.ps1 -RunDesktopPackage
```

每次运行会在 `tests/reports/full-app-validation-*` 生成日志、JSON 结果和 Markdown 摘要。

## 6. 设备级执行要求

Android：

- 连接至少一台 Android 12+ 真机，执行 `adb devices` 显示 `device`。
- 安装当前候选 APK，确认包名为 `app.agentrix.claw`。
- 执行脚本的 `-RunAndroidDevice` 后检查启动日志，若出现 `FATAL EXCEPTION`、`AndroidRuntime` 或进程 crash，即判定 P0 失败。

iOS：

- 在 macOS 上安装 Xcode Command Line Tools。
- 至少启动一个 iOS Simulator，或连接真机并使用 Xcode 运行候选包。
- 执行 `-RunIosSimulator` 只能覆盖启动 smoke；登录、支付和权限弹窗仍需补充人工验收或 Detox/Appium。

桌面：

- Windows 需要 WebView2 Runtime、Rust、Tauri CLI；macOS 需要 Xcode Command Line Tools。
- 默认 `desktop npm run build` 只验证 Web 层；`-RunDesktopPackage` 才构建 Tauri 安装包。
- 本地模型 sidecar 需要单独准备 llama.cpp 服务或随包 sidecar，再执行桌面 smoke。

## 7. 发布准入标准

发版前至少满足：

- `npm run typecheck:root` 通过。
- `backend npm run build` 通过。
- `desktop npm run build` 通过。
- `frontend npm run build` 通过。
- API E2E 中 health/auth/agent/marketplace/payment/openclaw smoke 通过。
- Android 候选 APK 启动无闪退，核心聊天和支付入口可用。
- Windows 桌面候选包启动无闪退，登录和聊天可用。

可以暂不阻断但必须登记：

- Next.js `react-hooks/exhaustive-deps` 警告。
- Vite chunk 体积警告。
- 需要真实支付沙盒或真实模型大文件的长耗时测试。

## 8. 后续自动化补全计划

| 优先级 | 工作项 | 说明 |
| --- | --- | --- |
| P0 | 将 `tests/e2e/cross-platform-regression.spec.ts` 固定为每日 API smoke | 覆盖后端和跨端核心合同 |
| P0 | 为 Expo Web 增加导航覆盖清单 | 每个主 tab、每个关键页面至少加载一次并检查无 blank/error |
| P1 | 接入 Maestro 或 Detox 覆盖 Android/iOS 真机旅程 | 登录、聊天、附件、支付、设置、模型页 |
| P1 | 接入 Tauri driver 覆盖 Windows/macOS 桌面包 | 登录、QR 绑定、聊天、sidecar、文件权限 |
| P1 | 为支付/分佣/marketplace 建沙盒数据工厂 | 避免 E2E 依赖生产脏数据 |
| P2 | 性能与稳定性长跑 | 30 分钟语音/本地模型/多端同步压力测试 |