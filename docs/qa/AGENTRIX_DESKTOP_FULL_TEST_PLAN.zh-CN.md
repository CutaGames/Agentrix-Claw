# Agentrix 桌面端完整测试计划

更新时间：2026-04-25

## 1. 测试目标

桌面端本轮目标是验证 Windows/macOS 桌面应用从 Web 层到 Tauri 安装包的核心可用性，优先覆盖 Windows 本机 `.exe` 构建、启动、登录入口、Guest 模式、聊天面板、桌面同步 API、Agent Presence API、更新接口和本地工具调用 API base。

## 2. 测试范围

| 层级 | 覆盖项 | 当前自动化入口 | 阻断标准 |
| --- | --- | --- | --- |
| D0 | TypeScript + Vite build | `cd desktop; npm run build` | 任一失败阻断 |
| D1 | Windows Tauri package | `cd desktop; npm run tauri -- build` | 无法生成主 `.exe` 或安装包阻断 |
| D2 | 桌面 API smoke | `npm run test:desktop:api` | 生产 API 5xx 或认证边界异常阻断 |
| D3 | 桌面 UI smoke | `npm run test:desktop:ui` | 登录页、QR、邮箱、OAuth、Guest、聊天面板无法访问阻断 |
| D4 | 桌面完整自动化 | `npm run test:desktop:full` | API 或 UI 核心路径失败阻断 |
| D5 | 安装包手工验收 | 运行 NSIS/MSI 安装包 | 安装失败、启动闪退、WebView 缺失阻断 |

## 3. 自动化测试用例

| 用例 ID | 用例 | 覆盖文件 | 期望 |
| --- | --- | --- | --- |
| DESK-001 | 后端 health | `desktop-smoke.spec.ts` | 非 5xx |
| DESK-002 | 邮箱验证码接口 | `desktop-smoke.spec.ts` | 200/201/400/429 均可接受 |
| DESK-003 | desktop pair create/poll | `desktop-smoke.spec.ts` | create 非 5xx，poll 返回 200/204/404 |
| DESK-004 | 模型接口认证保护 | `desktop-smoke.spec.ts` | 401/403 |
| DESK-005 | search/skills/update endpoint | `desktop-smoke.spec.ts` | 非 5xx |
| DESK-006 | 登录页三类入口 | `desktop-smoke.spec.ts` | QR、邮箱、第三方入口可见 |
| DESK-007 | Guest onboarding 到聊天面板 | `desktop-smoke.spec.ts` | 能看到 textarea 聊天输入 |
| DESK-008 | slash command `/help` | `desktop-smoke.spec.ts` | 能显示命令帮助 |
| DESK-009 | desktop-sync 未登录保护 | `desktop-sync-approval-agent.spec.ts` | 401/403/404 符合预期 |
| DESK-010 | agent-presence 未登录保护 | `desktop-sync-approval-agent.spec.ts` | 401/403/404 符合预期 |

## 4. 本机 Windows 验收步骤

1. 构建 Web 层：`cd desktop; npm run build`。
2. 构建 Windows 桌面包：`cd desktop; npm run tauri -- build`。
3. 确认可执行文件存在：`desktop/src-tauri/target/release/agentrix-desktop.exe`。
4. 确认安装包存在：`desktop/src-tauri/target/release/bundle/nsis/Agentrix Desktop_0.1.1_x64-setup.exe`。
5. 跑完整桌面自动化：`npm run test:desktop:full`。
6. 如安装包验收，运行 NSIS 安装包后确认首次启动不闪退、浮球可见、双击可打开聊天面板。

## 5. 后续补全

- 接入 Tauri driver 或 Windows UI Automation，覆盖真实安装包启动、托盘、快捷键、窗口置顶和自动更新。
- 为本地 llama sidecar 增加可控 mock server，验证端口 `8787`、本地模型选择、工具调用和错误回退。
- 在 macOS 环境补跑 `npm run tauri -- build`，验证 `.dmg/.app` 包、系统权限弹窗和签名策略。