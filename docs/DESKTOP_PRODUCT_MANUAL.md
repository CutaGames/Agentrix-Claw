# Agentrix Desktop — 产品技术手册

**版本**: v0.1.0  
**日期**: 2026-03-13  
**状态**: Beta (内测阶段)

---

## 一、产品概述

Agentrix Desktop 是基于 Tauri 2.0 构建的桌面端 AI Agent 入口。以悬浮球为核心交互形态，提供语音对话、文本聊天、文件分析、工作区代码操作等能力，与移动端 (ClawLink) 和 Web 端形成多端协同闭环。

| 属性 | 值 |
|------|---|
| 产品名 | Agentrix Desktop |
| 版本 | 0.1.0 |
| 标识符 | `top.agentrix.desktop` |
| 技术栈 | Tauri 2.10 (Rust) + React 18 + TypeScript 5.6 + Vite 6 |
| 安装包体积 | NSIS: ~4.3 MB / MSI: ~6.1 MB / 运行时: ~17 MB |
| 内存占用 | 30-80 MB (取决于对话长度) |
| 平台 | Windows 10+ / macOS 12+ / Ubuntu 22.04+ |
| 后端 | `https://api.agentrix.top/api` (NestJS, AWS Singapore) |

---

## 二、系统架构

```
┌──────────────────────────────────────────────┐
│             Agentrix Desktop App             │
│                                              │
│  ┌─────────────────┐  ┌──────────────────┐   │
│  │  Rust Backend   │  │  WebView (React) │   │
│  │                 │  │                  │   │
│  │  • 窗口管理      │  │  • LoginPanel    │   │
│  │  • 系统托盘      │  │  • ChatPanel     │   │
│  │  • 全局热键      │  │  • FloatingBall  │   │
│  │  • 边缘吸附      │  │  • SettingsPanel │   │
│  │  • 文件系统      │  │  • OnboardingPanel│  │
│  │  • IPC Bridge   │  │  • MessageBubble │   │
│  └────────┬────────┘  └────────┬─────────┘   │
│           │   Tauri IPC        │             │
│           └────────────────────┘             │
└──────────────────┬───────────────────────────┘
                   │ HTTPS / SSE / WebSocket
                   ▼
          ┌────────────────────┐
          │  api.agentrix.top  │
          │  (NestJS Backend)  │
          │                    │
          │  • Auth (QR/Email/ │
          │    OAuth/JWT)      │
          │  • Claude/Bedrock  │
          │  • Voice (STT/TTS) │
          │  • OpenClaw Proxy  │
          │  • Desktop Sync    │
          │  • File Upload     │
          │  • Auto-Updater    │
          └────────────────────┘
```

---

## 三、Tauri 插件清单

| 插件 | 版本 | 用途 |
|------|------|------|
| `tauri-plugin-shell` | 2 | OAuth 浏览器跳转 |
| `tauri-plugin-notification` | 2 | 桌面消息通知 |
| `tauri-plugin-global-shortcut` | 2 | 全局快捷键 (Ctrl+Shift+A/S) |
| `tauri-plugin-autostart` | 2 | 开机自启 |
| `tauri-plugin-store` | 2 | 加密凭证存储 |
| `tauri-plugin-http` | 2 | HTTP 请求 (tauriFetch) |
| `tauri-plugin-dialog` | 2 | 文件/文件夹选择对话框 |
| `tauri-plugin-updater` | 2 | 自动更新 |
| `tauri-plugin-process` | 2 | 应用退出/重启 |

Rust 侧还启用: `tray-icon`, `devtools`, `custom-protocol`。

---

## 四、核心模块说明

### 4.1 认证模块 (LoginPanel)

**文件**: `desktop/src/components/LoginPanel.tsx`

支持 3 种登录方式:

| 方式 | 流程 | 后端接口 |
|------|------|---------|
| **QR 扫码** | 生成 sessionId → `/auth/desktop-pair/create` → 展示 QR → 轮询 `/auth/desktop-pair/poll` → 获取 JWT | `/auth/desktop-pair/*` |
| **邮箱验证码** | 输入邮箱 → `/auth/email/send-code` → 输入验证码 → `/auth/email/verify-code` → 获取 JWT | `/auth/email/*` |
| **OAuth** | 点击 Google/Discord → shell.open 打开系统浏览器 → 后端回调写入 token → 桌面端轮询获取 | `/auth/google`, `/auth/discord` |

**Token 存储**: 优先使用 Tauri 加密 Store (Windows Credential Manager / macOS Keychain / Linux Secret Service)，浏览器环境 fallback 到 localStorage。

### 4.2 对话模块 (ChatPanel)

**文件**: `desktop/src/components/ChatPanel.tsx`

- **流式输出**: SSE 连接到 `/openclaw/proxy/{instanceId}/stream`，逐字渲染 AI 回复
- **直连 Claude**: 当无 OpenClaw 实例时，fallback 到 `/claude/chat`
- **消息渲染**: Markdown (react-markdown) + 代码高亮 (highlight.js) + 思维链折叠
- **斜杠命令**: `/help`, `/search`, `/skill`, `/ls`, `/new`, `/clear`, `/model`
- **文件上传**: 拖拽或点击附件按钮，POST 到 `/upload/chat-attachment`
- **后台通知**: 窗口失焦时 AI 回复完成自动发送系统通知

### 4.3 悬浮球 (FloatingBall)

**文件**: `desktop/src/components/FloatingBall.tsx`

| 交互 | 行为 |
|------|------|
| 单击 | 展开/收起对话面板 |
| 长按 | 进入语音录制模式 |
| 右键 | 弹出菜单 (新对话/设置/模型切换/退出) |
| 拖拽 | 移动位置，松手吸附到最近屏幕边缘 |
| 空闲 30s | 自动降低透明度至 40% |
| 首次使用 | 显示引导气泡 "点击我开始对话 👋" |

**Rust 侧命令**:
- `desktop_bridge_snap_ball_to_edge` — 吸附到最近边缘
- `desktop_bridge_get_ball_position` / `save_ball_position` — 位置记忆
- `desktop_bridge_set_panel_position_near_ball` — 面板靠近悬浮球弹出

### 4.4 语音模块

**文件**: `desktop/src/services/voice.ts`, `AudioQueuePlayer.ts`

| 功能 | 实现 |
|------|------|
| **录音** | Web Audio API (MediaRecorder)，启用回声消除 + 降噪 |
| **STT** | POST `/voice/transcribe` (multipart/form-data) → AWS Transcribe |
| **TTS** | GET `/voice/tts?text=...&lang=...` → AWS Polly (Neural) |
| **播放** | AudioQueuePlayer 顺序播放 TTS 音频片段 |
| **中文** | STT 自动检测，TTS 使用 Zhiyu 语音 |
| **英文** | TTS 使用 Matthew 语音 |

### 4.5 工作区模块

**文件**: `desktop/src/services/workspace.ts`

| API | 功能 |
|-----|------|
| `setWorkspaceDir(path)` | 设置工作目录 |
| `getWorkspaceDir()` | 获取当前工作目录 |
| `listWorkspaceDir(rel)` | 列出文件/子目录 (含大小、目录标志) |
| `readWorkspaceFile(rel)` | 读取文件内容 |
| `writeWorkspaceFile(rel, content)` | 写入文件 |
| `pickWorkspaceFolder()` | 弹出原生文件夹选择器 |

所有操作沙盒化到用户选定的目录内，AI Agent 可在对话中引用和操作代码文件。

### 4.6 设置模块 (SettingsPanel)

**文件**: `desktop/src/components/SettingsPanel.tsx`

- 检查更新 (触发 Tauri Updater)
- 工作区路径选择
- TTS 开关
- 开机自启开关
- 退出应用

### 4.7 消息渲染 (MessageBubble)

**文件**: `desktop/src/components/MessageBubble.tsx`

- Markdown 渲染 (标题、列表、链接、图片)
- 代码块语法高亮 (支持 20+ 语言)
- 一键复制代码
- 思维链 (Thinking) 折叠展示
- 用户/AI 消息气泡差异化样式

---

## 五、API 接口清单

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/auth/desktop-pair/create` | 创建桌面配对会话 |
| GET | `/auth/desktop-pair/poll?session=` | 轮询配对结果 |
| POST | `/auth/email/send-code` | 发送邮箱验证码 |
| POST | `/auth/email/verify-code` | 验证邮箱验证码 |
| GET | `/auth/google?desktop_session=` | Google OAuth 跳转 |
| GET | `/auth/discord?desktop_session=` | Discord OAuth 跳转 |

### 对话

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/claude/chat` | Claude 直连对话 (SSE) |
| GET | `/openclaw/models` | 获取可用模型列表 |
| POST | `/openclaw/proxy/{id}/stream` | OpenClaw 流式代理 |
| GET | `/openclaw/proxy/{id}/history` | 会话历史 |

### 语音

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/voice/transcribe` | 语音转文字 (Whisper) |
| GET | `/voice/tts?text=&lang=` | 文字转语音 (Polly) |

### 桌面同步

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/desktop-sync/heartbeat` | 心跳 |
| GET | `/desktop-sync/tasks` | 获取待处理任务 |
| POST | `/desktop-sync/approvals` | 提交审批 |
| GET | `/desktop-sync/state` | 同步状态 |

### 其他

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/upload/chat-attachment` | 上传文件附件 |
| GET | `/search?q=` | 搜索 |
| GET | `/skills` | 技能列表 |
| POST | `/skills/{name}/activate` | 激活技能 |
| GET | `/desktop/update/{target}/{arch}/{ver}` | 检查更新 |
| GET | `/health` | 健康检查 |

---

## 六、构建与发布

### 6.1 本地开发

```bash
cd desktop
npm install
npm run dev          # 启动 Vite dev server (port 1420)
npx tauri dev        # 启动 Tauri 开发窗口
```

### 6.2 生产构建

```bash
cd desktop

# Windows (NSIS + MSI)
npx tauri build

# 需要设置签名密钥环境变量 (CI/CD 中自动设置)
$env:TAURI_SIGNING_PRIVATE_KEY = "..."
npx tauri build
```

**产物**:
| 平台 | 格式 | 路径 |
|------|------|------|
| Windows | NSIS (.exe) | `src-tauri/target/release/bundle/nsis/` |
| Windows | MSI | `src-tauri/target/release/bundle/msi/` |
| macOS | DMG | `src-tauri/target/release/bundle/dmg/` |
| macOS | App Bundle | `src-tauri/target/release/bundle/macos/` |
| Linux | AppImage | `src-tauri/target/release/bundle/appimage/` |
| Linux | deb | `src-tauri/target/release/bundle/deb/` |

### 6.3 CI/CD

**工作流文件**: `.github/workflows/build-desktop.yml`

| 触发条件 | 说明 |
|----------|------|
| `desktop-v*` tag | 推送版本 tag 触发 |
| `workflow_dispatch` | 手动触发 |

**构建矩阵**:

| 环境 | 平台 | 架构 |
|------|------|------|
| `windows-latest` | Windows | x64 (MSVC) |
| `macos-latest` | macOS | aarch64 (Apple Silicon) |
| `macos-13` | macOS | x86_64 (Intel) |
| `ubuntu-22.04` | Linux | x86_64 |

构建产物自动上传到 GitHub Releases (Draft)。

### 6.4 自动更新

| 配置 | 值 |
|------|---|
| 检查端点 | `https://api.agentrix.top/api/desktop/update/{{target}}/{{arch}}/{{current_version}}` |
| 公钥 | `RWTg+R2wzh3NbTwmHgiB/g4+cL0C76DKvu1RnLccTxVFq/A+EQpFO3jX` |
| 私钥 | GitHub Secrets: `TAURI_SIGNING_PRIVATE_KEY` |

更新流程: 应用启动/用户点击检查更新 → 请求端点 → 比对版本 → 下载 + 验证签名 → 用户确认 → 安装重启。

---

## 七、测试

### 7.1 E2E 烟雾测试

**配置**: Playwright + Chromium

**API 测试 (7 项)**:
- 后端健康检查
- 邮箱验证码接口
- 桌面配对创建/轮询
- 模型列表鉴权
- 搜索接口
- 技能接口
- 更新端点

**前端测试 (7 项)**:
- 登录页渲染 (3 个标签页)
- QR 码展示
- 邮箱输入和发送按钮
- OAuth Google/Discord 按钮
- 访客模式
- 完整引导流程
- 斜杠命令帮助

**运行**:
```bash
cd /path/to/Agentrix-website
npx playwright test -c tests/e2e/playwright.config.ts tests/e2e/desktop-smoke.spec.ts --project=chromium
```

### 7.2 类型检查

```bash
cd desktop
npx tsc --noEmit          # 0 errors
```

### 7.3 Rust 编译检查

```bash
cd desktop/src-tauri
cargo check               # 0 errors, 9 warnings (unused functions)
```

---

## 八、安全设计

| 领域 | 措施 |
|------|------|
| **CSP** | 严格 Content-Security-Policy，仅允许 `api.agentrix.top` |
| **Token** | OS 密钥链加密存储 (不使用 plaintext) |
| **IPC** | Tauri Permission 系统，精确控制 WebView→Rust 调用权限 |
| **文件系统** | 沙盒化到用户选定目录，不可逃逸 |
| **更新** | Ed25519 签名验证，防止中间人攻击 |
| **无硬编码密钥** | 所有密钥通过环境变量/Secrets 注入 |
| **HTTPS** | 所有 API 通信强制 TLS |

---

## 九、目录结构

```
desktop/
├── src/
│   ├── App.tsx                    # 主路由 (窗口分发)
│   ├── components/
│   │   ├── LoginPanel.tsx         # 认证 UI
│   │   ├── ChatPanel.tsx          # 对话面板
│   │   ├── FloatingBall.tsx       # 悬浮球
│   │   ├── SettingsPanel.tsx      # 设置
│   │   ├── OnboardingPanel.tsx    # 首次引导
│   │   └── MessageBubble.tsx      # 消息气泡
│   ├── services/
│   │   ├── store.ts               # 认证状态管理 (Zustand)
│   │   ├── voice.ts               # 语音录制/转写
│   │   ├── workspace.ts           # 工作区文件操作
│   │   └── AudioQueuePlayer.ts    # TTS 播放队列
│   ├── styles/
│   │   └── global.css             # 全局样式 + 动画
│   └── assets/
│       └── agentrix-logo.png      # 应用 Logo
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs                 # Tauri 应用入口 + 插件注册
│   │   └── commands.rs            # Rust IPC 命令 (40+ 命令)
│   ├── tauri.conf.json            # Tauri 配置
│   ├── Cargo.toml                 # Rust 依赖
│   ├── icons/                     # 应用图标 (所有平台)
│   ├── keys/                      # 签名密钥 (pubkey only in git)
│   └── permissions/               # IPC 权限配置
├── package.json                   # Node 依赖
└── vite.config.ts                 # Vite 构建配置
```

---

## 十、已知限制

| 限制 | 说明 | 计划 |
|------|------|------|
| 无 Windows 代码签名 | SmartScreen 警告 "Unknown publisher" | 购买 EV 证书 |
| 无 macOS 公证 | Gatekeeper 阻止运行 | 注册 Apple Developer 配置 notarization |
| 更新清单未部署 | 更新端点存在但无实际版本数据 | 后端实现 update manifest 服务 |
| 无崩溃上报 | 生产错误不可追踪 | 接入 Sentry |
| 无下载页 | 用户无法找到安装包 | 建设 download.agentrix.top |
| 无 LICENSE | 法律风险 | 选择并添加开源/商业许可证 |
