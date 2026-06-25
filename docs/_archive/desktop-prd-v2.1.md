# Agentrix Desktop — 产品需求文档 (PRD)

**版本**: v2.0  
**日期**: 2026-04-01 (v1.0: 2026-03-08)  
**产品名**: Agentrix Desktop (代号: ClawBall)  
**定位**: 语音优先的双模 AI 入口 — 跨设备 Agent 经济平台的桌面支点

---

## 一、产品愿景

> **你的 Agent，无处不在，跨设备无缝衔接——手机开始的任务，桌面继续；桌面发起的指令，手表提醒；Agent 的记忆跟着你走，不跟着设备走。**

### 1.1 Agentrix 全端矩阵

| 端 | 形态 | 核心场景 | 独特能力 |
|---|------|---------|---------|
| **移动端** | ClawLink App (Expo) | 随身携带，外出场景，碎片时间 | 相机/GPS/生物识别，推送通知，扫码配对 |
| **桌面端** | ClawBall (Tauri 2.0) | 工作场景，深度任务，专业开发 | 全局热键，文件系统，终端命令，屏幕截图 |
| **Web 端** | 管理控台 (Next.js) | 配置管理，数据分析，商户后台 | 无需安装，管理面板，支付仪表盘 |
| **可穿戴** | 手环/戒指/Clip (BLE) | 健康监测，情境感知，触发规则 | 生物信号（心率/SpO₂），自动化触发 |

### 1.2 为什么桌面端是关键支点

```
                    ┌────────────────┐
                    │  共享 Agent 大脑 │  ← 后端 OpenClaw Instance
                    │  共享记忆/偏好   │     (统一 session, memory, skills)
                    │  共享经济账户    │     AgentAccount + 钱包
                    └───────┬────────┘
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                  │
    ┌────▼─────┐     ┌─────▼──────┐    ┌─────▼──────┐
    │  📱 移动端 │     │  💻 桌面端  │    │  ⌚ 可穿戴  │
    │  碎片输入  │     │  深度执行   │    │  情境感知   │
    │  审批确认  │ ←─→ │  生产力核心 │ ←→ │  自动触发   │
    │  通知接收  │     │  专业工作台 │    │  健康数据   │
    └──────────┘     └────────────┘    └────────────┘
         ↑                  ↑                  ↑
    移动 = 确认中心     桌面 = 执行中心      可穿戴 = 感知中心
```

桌面端是用户**工作日使用时间最长**的端。但桌面端不是另一个聊天窗口——
- **语音模式**：像 heylemon.ai 一样，按键说话，即用即走，不打断工作流
- **专业模式**：像 VS Code Copilot 一样，多 Agent 编排、代码 diff、终端执行
- **协同模式**：手机开始的任务桌面继续，可穿戴触发桌面 Agent 执行

### 1.3 核心差异化：不是另一个 ChatGPT Desktop

| 竞品 | 定位 | Agentrix Desktop 的差异 |
|------|------|----------------------|
| ChatGPT Desktop | 独立聊天窗口 | 我们是**操作系统级悬浮入口**，语音唤醒，不需要切换窗口 |
| heylemon.ai | 语音快捷助手 | 我们还有**专业工作台模式**，支持复杂编排和代码任务 |
| Cursor / Copilot | IDE 级 Agent | 我们是**产品级**，支持商业技能市场、支付、多端协同 |
| Siri / Cortana | 系统助手 | 我们的 Agent 有**经济账户**，能自主交易、赚钱、雇佣其他 Agent |
| Rewind.ai | 记忆搜索 | 我们的记忆**跨设备同步**，Agent 记住你而非你的屏幕 |

**一句话版**：**Agentrix Desktop = heylemon 的语音极简 + Cursor 的专业深度 + Agent 经济身份 + 跨设备无缝协同**

---

## 二、用户画像

### 2.1 个人用户 — "碎片指令者"
- **核心诉求**: 工作中随时给 Agent 下指令，不打断心流
- **使用场景**:
  - 按快捷键→说"帮我查一下上海飞北京明天的航班"→听到结果→继续写代码
  - 选中网页一段英文→悬浮球弹出"翻译"→3秒后结果卡片显示
  - 回到电脑，发现手机上让 Agent 搜集的资料已经在桌面端等着了
  - 手环心率异常→Agent 自动提醒"该休息了，上次你说下午要开会"
- **期望体验**: 像跟助手说话一样自然，**零切换成本**

### 2.2 专业用户 — "深度创作者"
- **核心诉求**: 完整的 Agent 工作台，编排复杂任务
- **使用场景**:
  - 多 Agent 编排: 研究 Agent → 写作 Agent → 审核 Agent 流水线
  - 代码任务: "帮我重构 auth 模块"→看到代码 diff→一键批准
  - 技能开发: 本地调试技能→发布到 Marketplace→赚取佣金
  - 私有 RAG: 上传公司文档，Agent 记住但数据不出域
- **期望体验**: 专业、高效、可控，**一个面板解决从指令到执行的全链路**

### 2.3 Agent 经济参与者 — "Agent 雇主/打工者"
- **核心诉求**: 通过 Agent 参与经济活动
- **使用场景**:
  - 查看 Agent 账户余额和收入统计
  - 在技能市场搜索/购买技能，给 Agent 安装
  - Agent 自动接单执行任务市场的 bounty 任务
  - 审批 Agent 高额消费(>$5)请求
- **期望体验**: 透明、安全、**Agent 替我赚钱我审批就行**

---

## 三、产品架构

### 3.1 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                   Agentrix Desktop                      │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │              Tauri 2.0 Shell                     │   │
│  │         (Rust 后端 + WebView 前端)                │   │
│  │                                                  │   │
│  │  ┌────────────┐  ┌──────────────────────────┐   │   │
│  │  │  悬浮球     │  │  按需弹出的功能窗口        │   │   │
│  │  │  56×56     │  │                          │   │   │
│  │  │  Always    │  │  🎙️ 语音模式：原位结果卡片  │   │   │
│  │  │  On Top   │  │  💻 专业模式：480×640面板   │   │   │
│  │  │           │  │  🔍 Spotlight：600×400     │   │   │
│  │  │ 状态指示   │  │  📱 跨设备面板             │   │   │
│  │  │ 语音唤醒   │  │  ⚙  设置面板              │   │   │
│  │  └────────────┘  └──────────────────────────┘   │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │              Rust Native Layer                   │   │
│  │  • 全局热键 (global-shortcut)   • mDNS 局域网发现  │   │
│  │  • 系统托盘                     • 屏幕截图         │   │
│  │  • 窗口置顶 & 动态 resize      • 终端命令执行      │   │
│  │  • 文件系统访问 (沙箱+工作区)   • Git 操作          │   │
│  │  • 活动窗口检测                 • 密钥安全存储      │   │
│  │  • 自动更新 (Updater)          • BLE (未来)       │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │              共享后端 (单一真相)                    │   │
│  │  REST:  https://api.agentrix.top/api              │   │
│  │  WS:    wss://api.agentrix.top/ws (session sync)  │   │
│  │         wss://api.agentrix.top/presence (devices)  │   │
│  │  SSE:   /openclaw/proxy/{id}/stream               │   │
│  │  Voice: /voice/transcribe + /voice/tts            │   │
│  │  Sync:  /desktop-sync/* (remote commands, state)  │   │
│  │  Agent: /agent-presence/* (timeline, approvals)   │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 3.2 技术选型: Tauri 2.0

| 项目 | 说明 | 已实现 |
|------|------|-------|
| **体积小** | 安装包 8-15 MB (vs Electron 150+ MB) | ✅ |
| **性能好** | Rust 后端，内存常驻 30-50 MB | ✅ |
| **系统集成** | 全局热键、托盘、窗口管理、文件系统 | ✅ |
| **安全** | Rust 内存安全，CSP 策略，IPC 权限 ACL | ✅ |
| **自动更新** | 内置 Updater 插件 | ✅ |
| **多窗口** | main(球), chat-panel, spotlight 独立窗口 | ✅ |
| **前端复用** | React 18 + TS + Zustand + Vite | ✅ |

### 3.3 已实现基础 (v1.0 回顾)

截至 v1.0，已完成的基础设施：

| 基础能力 | 状态 | 实现位置 |
|---------|------|---------|
| 悬浮球 + 状态动画 | ✅ | FloatingBall.tsx, global.css |
| ChatPanel + 多 Tab | ✅ | ChatPanel.tsx |
| SSE 流式对话 | ✅ | store.ts `streamChat()` |
| 语音 PTT + TTS | ✅ | voice.ts, VoiceButton.tsx, AudioQueuePlayer.ts |
| 唤醒词 (Picovoice) | ✅ | wakeWord.ts |
| 全局热键 | ✅ | main.rs, lib.rs |
| 文件系统 + Git | ✅ | commands.rs (40+ IPC commands) |
| 终端命令执行 | ✅ | commands.rs `run_command()` |
| 远程任务执行 + 审批 | ✅ | TaskTimeline.tsx, ApprovalSheet.tsx |
| 跨设备 session 同步 | ✅ | sessionSync.ts, agentPresence.ts |
| 剪贴板监听 | ✅ | clipboard.ts |
| Spotlight (Cmd+K) | ✅ | SpotlightPanel.tsx |
| 多模型切换 | ✅ | ChatPanel.tsx 模型下拉 |
| QR/Email/OAuth 登录 | ✅ | LoginPanel.tsx |
| mDNS 设备发现 | ✅ | mdns.rs |

---

## 四、双模交互设计 (核心重构)

### 4.1 设计理念：语音模式是默认，专业模式按需

```
┌─────────────────────────────────────────────────────────────┐
│                       🔮 悬浮球                              │
│                    (始终存在的入口)                            │
│                                                             │
│    ┌─────────────────────┐       ┌─────────────────────┐    │
│    │   🎙️ 语音模式 (默认)  │       │   💻 专业模式 (按需)  │    │
│    │                     │       │                     │    │
│    │ • 单击/热键/唤醒词   │       │ • 双击/Ctrl+Shift+S │    │
│    │ • 悬浮球原位交互     │       │ • 独立面板窗口      │    │
│    │ • 语音输入为主       │       │ • 多Tab + 代码     │    │
│    │ • 浮动结果卡片       │       │ • 完整Agent工作台   │    │
│    │ • TTS 播报          │       │ • 任务编排+审批     │    │
│    │ • 即用即走           │       │ • 技能市场+经济     │    │
│    │                     │       │                     │    │
│    │  90% 日常交互       │       │  10% 深度工作       │    │
│    └─────────────────────┘       └─────────────────────┘    │
│                                                             │
│    语音结果卡片点击「展开详情」→ 自动切换到专业模式              │
│    专业模式面板关闭 → 回到悬浮球 → 依然可以语音交互             │
└─────────────────────────────────────────────────────────────┘
```

---

### 4.2 语音模式 (Voice Mode) — 参考 heylemon.ai

> **核心原则**: 所有语音交互在悬浮球上完成，不打开任何面板

#### 交互流程

```
🟣 平时状态:
   悬浮球安静待在屏幕边缘（40%透明度，半隐藏）

🟢 唤醒 (任选一种):
   ① 单击悬浮球
   ② 全局热键 Ctrl+Shift+A
   ③ 唤醒词 "Hey Agentrix"
   ④ 长按悬浮球（直接进入录音）

   悬浮球变形为胶囊：
   ┌─────────────────────────────────────────┐
   │  ◉ ≋≋≋≋≋≋≋≋  正在聆听...                │  ← 绿色胶囊 230px
   └─────────────────────────────────────────┘

🎤 用户说话 → 实时转写:
   ┌─────────────────────────────────────────┐
   │  ◉ ≋≋≋  "帮我查一下今天上海天气"          │  ← 波形 + 实时转写
   └─────────────────────────────────────────┘

⏳ 松开/停顿 → 处理中:
   ┌─────────────────────────────────────────┐
   │  ◉ ⟳ 正在思考...                        │  ← 琥珀色旋转
   └─────────────────────────────────────────┘

🔵 回复到达 → 语音播报 + 浮动结果卡片:
   ┌─────────────────────────────────────────────────┐
   │  ◉ 🔊                                          │
   │  ┌───────────────────────────────────────────┐  │
   │  │ 上海今天 23°C，多云转晴，东风3-4级           │  │  ← 浮动结果卡片
   │  │ 明天降温到 18°C，建议带外套                  │  │     自动消失或
   │  │                                           │  │     4秒后收起
   │  │              [展开详情]  [复制]  [发到手机]  │  │
   │  └───────────────────────────────────────────┘  │
   └─────────────────────────────────────────────────┘

🟣 播报完毕 → 5秒窗口期 (可继续说话追问):
   5秒无交互 → 自动收回悬浮球 → 回到 idle
```

#### 语音模式规格

| 项目 | 规格 |
|------|------|
| **形态** | 不打开任何面板窗口，所有交互在主窗口内完成 |
| **窗口自适应** | idle: 56×56 → 胶囊: 460×56 → 结果态: 460×auto(最大320px) |
| **输入** | 语音为主，胶囊态可点击切换快捷文字输入 |
| **输出** | TTS 语音播报 + 浮动结果卡片 (简洁摘要，非完整 Markdown) |
| **流式播报** | Agent 回复边生成边播报（分句 TTS），不等全部完成 |
| **持续对话** | 回复后悬浮球保持活跃 5 秒，用户可继续说话 |
| **退出** | 5 秒无交互自动收回 / Esc 键 / 点击其他区域 |
| **结果操作** | 右键结果卡片: 复制、发送到手机、展开详情(→专业模式)、重新回答 |
| **Duplex模式** | 可选的连续对话: 不需要按住，自动检测语音起止 |
| **Barge-in** | 用户说话时自动中断 TTS 播放 |
| **上下文注入** | 自动附加当前活动窗口标题 + 剪贴板预览到 prompt |

#### 语音模式状态机

```
              ┌──────────┐
              │   idle   │ ←── 紫色呼吸，40% 透明
              └────┬─────┘
                   │ 单击/热键/唤醒词/长按
                   ▼
              ┌──────────┐
              │recording │ ←── 绿色胶囊，波形 + 实时转写
              └────┬─────┘
                   │ 松开/静默检测
                   ▼
              ┌──────────┐
              │ thinking │ ←── 琥珀色旋转，STT → Agent
              └────┬─────┘
                   │ 首chunk到达
                   ▼
              ┌──────────┐      5秒无操作
              │ speaking │ ──────────────→ idle
              │ + result │ ←── 蓝色脉冲 + 结果卡片
              └────┬─────┘
                   │ 用户再次说话 (barge-in)
                   ▼
              ┌──────────┐
              │recording │ ←── 中断 TTS，继续录音
              └──────────┘

  任何状态下双击悬浮球 → 打开专业模式面板
  结果卡片点击「展开详情」→ 专业模式面板 (携带当前会话)
```

---

### 4.3 专业模式 (Pro Mode) — Agent 工作台

> **核心原则**: 给深度工作提供完整视觉反馈——代码 diff、任务计划、审批流

#### 入口方式

| 方式 | 操作 |
|------|------|
| 快捷键 | Ctrl+Shift+S |
| 双击 | 双击悬浮球 |
| 语音 | 说 "打开工作台" / "专业模式" |
| 结果卡片 | 点击「展开详情」 |
| 托盘 | 右键 → "打开工作台" |
| Spotlight | Ctrl+K → 输入复杂指令 |

#### 专业面板布局

```
┌──────────────────────────────────────────────────┐
│ 🤖 Agent Name  ▼Model  📂Workspace  📱Sync  ⚙ ✕ │ ← 顶栏: 实例 + 模型 + 项目 + 同步 + 设置
├──────┬───────────────────────────────────────────┤
│ Tab1 │ Tab2 │ Tab3+                              │ ← 多 Tab 独立会话
├──────┴───────────────────────────────────────────┤
│                                                  │
│  🧑 帮我重构 auth 模块的登录逻辑                    │
│                                                  │
│  🤖 好的，我来帮你重构。                            │
│                                                  │
│  ┌─ 📋 执行计划 ──────────────── [展开详情 ▼] ─┐  │
│  │ ✅ 1. 分析现有代码结构                        │  │ ← 高层任务计划
│  │ ⏳ 2. 重构 auth.service.ts                   │  │    (默认折叠底层操作)
│  │ ○  3. 更新测试用例                            │  │
│  │ ○  4. 验证编译通过                            │  │
│  └──────────────────────────────────────────────┘  │
│                                                  │
│  📝 正在修改 auth.service.ts...                    │
│  ┌──────────────────────────────────────────┐    │
│  │ -  const token = jwt.sign(payload)       │    │ ← 代码 Diff 预览
│  │ +  const token = await this.jwtSign()    │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  💭 思考中... (3.2s)  ████████░░  Step 2/4       │ ← Thinking 进度
│                                                  │
├──────────────────────────────────────────────────┤
│ ┌─────────────────────────────┐ 🎤 📎 ➤        │ ← 输入区
│ │ 输入消息...                  │                  │
│ └─────────────────────────────┘                  │
│  [Ask]  [Agent]  [Plan]        ▒░░░ 2.1k tokens │ ← 模式 + Token 进度条
└──────────────────────────────────────────────────┘
```

#### 三种工作模式

| 模式 | 用途 | 行为 |
|------|------|------|
| **Ask** | 快速问答 | 直接 Claude 对话，无工具调用，最快响应 |
| **Agent** | 自动执行任务 | 完整 Agent 编排，工具调用，审批流，任务时间线 |
| **Plan** | 先规划后执行 | Agent 先生成执行计划 → 用户审批/编辑 → 按计划执行 |

#### 专业模式关键增强 (vs v1.0)

| 能力 | v1.0 现状 | v2.0 目标 |
|------|----------|----------|
| **任务展示** | Runtime Timeline 显示底层操作 (Read file、List dir) | **分层计划视图**: 高层任务摘要 + 可展开底层详情 |
| **代码变更** | 无 Diff 渲染 | **diff2html** 侧对比视图，一键批准/拒绝 |
| **思考展示** | 静态折叠的 `<think>` 块 | **动画 Thinking 指示器**: "思考中 (3.2s) Step 2/4" |
| **终端输出** | 纯文本 | **ANSI 颜色支持**的流式终端输出 |
| **工具进度** | 静态文本 chips | **动画旋转**的工具执行指示器 + 参数/结果预览 |
| **Plan 模式** | PlanPanel 存在但未接入 | 完整的**计划审批 UI**: 编辑步骤 → 批准 → 监控执行 |
| **Token 感知** | 无 | 输入框下方 **Token 消耗进度条** + 上下文窗口警告 |

---

## 五、跨设备协同 — Agentrix 核心壁垒

> **竞品只有单端。我们的 Agent 在所有设备之间无缝流转。**

### 5.1 共享 Agent 大脑

所有端共用同一个 OpenClaw Instance + AgentAccount：

```
                  ┌──────────────────┐
                  │  OpenClaw Instance│ ← 统一 AI 运行时
                  │  (Cloud/Local)   │
                  ├──────────────────┤
                  │  AgentAccount    │ ← 统一经济身份
                  │  (Wallet/Credit) │
                  ├──────────────────┤
                  │  Agent Memory    │ ← 统一记忆
                  │  (session/agent/ │
                  │   user/shared)   │
                  ├──────────────────┤
                  │  Installed Skills│ ← 统一技能
                  │  (25 preset +    │
                  │   marketplace)   │
                  └────────┬─────────┘
                           │
           全端共享同一 Agent 实例
                           │
          ┌────────────────┼────────────────┐
          │                │                │
     📱 Mobile        💻 Desktop       ⌚ Wearable
   instanceId 相同    instanceId 相同    通过 Mobile 桥接
```

**关键设计**: 用户不需要"创建桌面端 Agent"——登录即获得移动端已有的 Agent 及全部历史。

### 5.2 会话无缝衔接 (Session Continuity)

```
场景: 早上手机上让 Agent 调研"AI Agent 竞品分析"

手机端:
  09:00 🧑 "帮我做一个 AI Agent 桌面端产品的竞品分析"
  09:01 🤖 "好的，我开始调研..." (Agent 开始工作)
  09:05 🤖 "初步找到了 5 个竞品..." (手机推送通知)
  
到达办公室，打开桌面端:
  09:15 桌面端自动显示: "📱 手机上有一个进行中的任务"
        [继续在桌面查看] [忽略]
  09:16 点击继续 → 桌面专业模式打开，完整对话历史已在
  09:17 🧑 "把分析结果整理成表格，再对比下价格"
  09:18 🤖 (桌面端执行，Markdown 表格实时渲染)
```

**实现机制** (已有基础):
- WebSocket `/ws` namespace: 实时 session sync (max 80 messages)
- REST fallback: `/desktop-sync/sessions` 离线同步
- Clipboard sync: `agentrix:clipboard-sync-out/in` 自定义事件
- 统一 sessionId 跨设备

### 5.3 设备间 Handoff

```
桌面端发起 → 手机审批确认:

  💻 桌面: "帮我付 $15 买 web-scraper 技能"
  🤖 Agent: "需要支付 $15，发送审批到你的手机..."
  
  📱 手机: 🔔 推送通知 "Agent 请求支付 $15"
  📱 点击 → 审批页面 → 指纹确认 → ✅ 批准
  
  💻 桌面: "✅ 支付已完成，技能已安装"
```

**实现机制** (已有基础):
- `/presence` WebSocket namespace: 设备在线状态 + handoff 事件
- `handoff:request` → `handoff:accepted` / `handoff:rejected`
- Agent Presence REST: timeline 查询、channel 健康状态
- 审批: L0(自动) → L1(确认) → L2(高风险) → L3(手动)

### 5.4 可穿戴设备联动

```
⌚ 手环检测到心率 > 120 bpm 持续 5 分钟
    │
    ▼ 自动化规则触发 (wearable-telemetry rules engine)
    │
💻 桌面悬浮球弹出通知:
   "⚠️ 心率偏高 (128 bpm)，已持续 5 分钟"
   "要不要休息一下？你下午 2 点还有会议"
    │
    ▼ 用户语音: "帮我把下午的会议推迟 30 分钟"
    │
🤖 Agent 执行: 发送日历修改请求
📱 手机推送: "会议已推迟到 2:30 PM"
```

**已有基础**:
- Mobile BLE gateway: 支持 ring/band/clip/sensor 四类设备
- 7 个遥测通道: heart_rate, spo2, temperature, steps, battery, accelerometer, custom
- 自动化规则引擎: 条件触发(gt/lt/between) → 动作(notify_agent, execute_skill, send_alert)
- 缓冲上传: 30 秒 flush，100 条/批次

**桌面端需要做的**:
- 订阅 wearable telemetry 事件 (通过 WebSocket)
- 在悬浮球显示健康数据摘要通知
- 规则触发时弹出 Agent 交互面板

### 5.5 共享记忆体系

```
┌─── 记忆层级 ──────────────────────────────────────┐
│                                                   │
│  Session Memory (会话级)                           │
│  ├─ 单次对话上下文                                  │
│  ├─ 工具调用结果缓存                                │
│  └─ 会话结束后归档                                  │
│                                                   │
│  Agent Memory (Agent 级) ← 跨设备共享              │
│  ├─ 长期偏好: "用户喜欢简洁的回答"                    │
│  ├─ 行为模式: "每天 9 点让我看新闻"                   │
│  ├─ 知识积累: "用户公司叫 Agentrix，做 AI 平台"       │
│  └─ 跨设备: 手机学到的，桌面也知道                    │
│                                                   │
│  User Memory (用户级) ← 所有 Agent 共享             │
│  ├─ 个人信息: 姓名、语言偏好、时区                    │
│  ├─ 全局设置: 审批阈值、通知偏好                      │
│  └─ 跨 Agent: A Agent 知道的，B Agent 也知道         │
│                                                   │
│  Knowledge Base (RAG 知识库)                       │
│  ├─ 用户上传文档 (.md/.txt → 分块向量化)             │
│  ├─ Agent 对话时自动检索相关内容                      │
│  └─ 移动端 记忆中心 可管理                           │
│                                                   │
└───────────────────────────────────────────────────┘
```

**桌面端记忆增强**:
- 工作区文件自动纳入知识库 (设置的工作区目录)
- 剪贴板历史作为短期上下文
- 活动窗口 / 应用名称作为情境线索

---

## 六、Agent 经济系统 (桌面端视角)

> **Agent 不只是助手，是有经济身份、能自主交易的数字员工。**

### 6.1 Agent 账户桥接

```
┌─────────────────────────────────────────┐
│  OpenClaw Instance (AI 运行时)           │
│  ├─ 聊天/语音/工具执行                    │
│  └─ capabilities.platformHosted = true   │
│                                         │
│  AgentAccount (经济身份)                  │
│  ├─ 钱包余额 / 信用评分                   │
│  ├─ 支出限额 / 审批策略                   │
│  ├─ 链上身份 (EAS/ERC-8004)              │
│  └─ Team 成员角色                        │
│                                         │
│  桥接: instance.metadata.agentAccountId  │
│  ⚠️ 当前软链接，计划迁移为 FK            │
└─────────────────────────────────────────┘
```

### 6.2 桌面端经济功能

| 功能 | 描述 | 交互方式 |
|------|------|---------|
| **账户概览** | Agent 余额、收入、支出统计 | 专业模式侧边栏 |
| **技能市场** | 搜索/购买/安装技能 | 语音"帮我找一个翻译技能" 或 面板浏览 |
| **任务市场** | 浏览/发布/接受 bounty 任务 | 专业模式面板 |
| **支付审批** | Agent 消费超阈值需用户确认 | 悬浮球通知 → 快速批准/拒绝 |
| **佣金追踪** | 开发的技能被购买后的收入 | 专业模式仪表盘 |
| **自动赚钱** | Agent 自动接单执行任务 | 设置策略后 Agent 自主执行 |

### 6.3 Agent-to-Agent 协作 (A2A)

```
用户: "帮我做一个市场调研报告"

🤖 我的 Agent (研究型):
   ├─ 拆解任务
   ├─ agent_discover: 找到一个"数据分析 Agent"
   ├─ agent_invoke: 委派数据收集任务 ($0.50)
   │   └─ 🤖 数据 Agent: 执行并返回结果
   ├─ 整合数据，生成报告
   └─ 通知用户: "报告已完成，花费 $0.50"

桌面端显示:
  📋 任务: 市场调研报告
  ├─ ✅ 拆解任务计划 (0.1s)
  ├─ ✅ 委派数据收集给 @DataBot ($0.50)
  ├─ ⏳ 整合数据并写报告...
  └─ ○ 生成最终 PDF
  
  💰 本次花费: $0.50 | Agent 余额: $24.50
```

---

## 七、上下文智能 — 感知用户意图

> **不需要告诉 Agent 你在做什么，它已经知道了。**

### 7.1 自动上下文采集

| 上下文源 | 数据 | 用途 |
|---------|------|------|
| **活动窗口** | 窗口标题、进程名 | "用户在 VS Code 写代码" → 技术模式 |
| **剪贴板** | 最近复制的文本 | "用户复制了一段英文" → 自动提供翻译 |
| **工作区** | 当前打开的项目目录 | 代码任务的项目根目录 |
| **选中文本** | 模拟 Ctrl+C 获取 | Spotlight 模式自动填充 |
| **时间** | 当前时间、日期 | "下午 6 点了" → "要不要整理今天的笔记？" |
| **可穿戴** | 心率、步数、电量 | 健康提醒、活动建议 |
| **网络** | Wi-Fi/断网状态 | 离线时缓存消息、恢复后同步 |

### 7.2 剪贴板智能工作流

```
用户复制了一段文本:
  
  悬浮球弹出小徽章: "📋"
  
  点击徽章:
  ┌──────────────────────┐
  │  📋 检测到剪贴板内容   │
  │                      │
  │  [🌐 翻译]  [📝 总结] │
  │  [💡 解释]  [✏️ 改写] │
  │  [🔍 搜索]  [📤 无视] │
  └──────────────────────┘
  
  点击「翻译」→ Agent 翻译 → 结果替换到剪贴板 → 用户 Ctrl+V 粘贴
```

### 7.3 Spotlight 快速操作 (Ctrl+K)

```
┌──────────────────────────────────────────────────┐
│                 Agentrix Spotlight                │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │ 🔍 @translate 这段代码是什么意思          │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  快捷前缀:                                       │
│  @file     读取文件并解释                         │
│  @web      搜索互联网                            │
│  @translate 翻译选中文本                          │
│  @summarize 总结内容                             │
│  @explain   解释代码/概念                         │
│  @skill     执行已安装技能                        │
│                                                  │
│  (自动获取当前选中文本作为上下文)                    │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │  🤖 这段代码是一个 React Hook...          │   │ ← 流式结果
│  └──────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘
```

---

## 八、认证 & 实例连接

| 项目 | 规格 |
|------|------|
| **登录方式** | 邮箱验证码 / 移动端扫码 / OAuth (Google/Twitter/Discord) |
| **Token 存储** | OS AppData 加密文件 (Tauri secure storage) |
| **实例自动发现** | 登录后拉取 `/auth/me` 获取全部 OpenClaw 实例 |
| **本地 Agent** | mDNS 发现 `_agentrix._tcp.local` / 检测 localhost:7474 |
| **首次引导** | 无实例: ① 一键云端部署 ② 安装本地 Agent ③ 手动输入地址 ④ 扫码复用移动端 |
| **Agent 账户** | 自动 provision AgentAccount 并绑定到 OpenClaw Instance |

## 九、系统集成

| 项目 | 规格 |
|------|------|
| **系统托盘** | 右键: 显示/隐藏, 新对话, 语音, 工作台, 设置, 退出 |
| **开机自启** | 可选，默认开启 (tauri-plugin-autostart) |
| **全局热键** | Ctrl+Shift+A 语音, Ctrl+Shift+S 工作台, Ctrl+K Spotlight |
| **自动更新** | Tauri Updater, 静默检查 + 用户确认 |
| **多显示器** | 悬浮球可跟随活动显示器 |
| **平台** | Windows 10+, macOS 12+, Linux Ubuntu 22+ |
| **WebView2** | Windows 自动检测 + 回退机制 (ensure_webview2_runtime) |
| **麦克风权限** | WebView2 自动授予 (grant_webview2_permissions) |

---

## 十、API 集成规格

桌面端**完全复用现有后端 API**，无需新增后端接口。

### 10.1 认证
```
POST /api/auth/email/send-code       — 发送验证码
POST /api/auth/email/verify-code     — 验证登录
POST /api/auth/desktop-pair/create   — QR 扫码配对(创建)
GET  /api/auth/desktop-pair/poll     — QR 扫码轮询
GET  /api/auth/me                    — 用户信息 + 实例列表
```

### 10.2 Agent 通信
```
POST /api/openclaw/proxy/{id}/stream     — SSE 流式对话 (主路径)
POST /api/claude/chat                    — 直接 Claude 对话 (降级路径)
GET  /api/openclaw/proxy/{id}/history    — 会话历史
GET  /api/openclaw/instances             — 实例列表
PATCH /api/openclaw/instances/{id}/model — 切换模型
```

### 10.3 语音
```
POST /api/voice/transcribe  — STT (上传音频 → 文字)
GET  /api/voice/tts         — TTS (文字 → 音频流)
```

### 10.4 跨设备同步
```
WS  /ws                              — Session sync, clipboard sync, device list
WS  /presence                        — Device presence, handoff, approval events
POST /api/desktop-sync/sessions      — 存储会话快照
GET  /api/desktop-sync/sessions      — 获取统一会话列表
GET  /api/desktop-sync/commands/pending — 获取待执行远程命令
POST /api/desktop-sync/heartbeat     — 设备心跳上报
```

### 10.5 Agent 经济
```
GET  /api/agent-presence/agents              — Agent 列表 + 余额
GET  /api/agent-presence/agents/{id}/timeline — Agent 活动时间线
GET  /api/agent-presence/devices             — 在线设备列表
POST /api/agent-presence/approvals/{id}/approve — 审批通过
POST /api/agent-presence/approvals/{id}/reject  — 审批拒绝
```

### 10.6 技能 & 市场
```
GET  /api/openclaw/proxy/{id}/skills          — 已安装技能
POST /api/openclaw/proxy/{id}/skills/install  — 安装技能
GET  /api/openclaw/proxy/{id}/platform-tools  — 可用平台工具 (25个)
POST /api/openclaw/proxy/{id}/platform-tools/execute — 执行平台工具
```

### 10.7 记忆管理
```
GET    /api/ai-rag/knowledge            — 知识库文件列表
POST   /api/ai-rag/knowledge            — 上传知识文件
DELETE /api/ai-rag/knowledge/:id        — 删除知识文件
GET    /api/ai-rag/memory/preferences   — 记忆偏好 (待实现)
POST   /api/ai-rag/memory/preferences   — 添加偏好 (待实现)
```

### 10.8 通知
```
GET  /api/notifications/recent?limit=10&since={ts}  — 轮询通知
GET  /api/agent-presence/approvals                   — 待审批列表
```

---

## 十一、非功能需求

| 项目 | 要求 |
|------|------|
| **安装包大小** | Windows < 15 MB, macOS < 12 MB |
| **内存占用** | 常驻 < 50 MB, 对话中 < 100 MB |
| **启动时间** | 冷启动 < 2 秒 |
| **语音延迟** | 唤醒到开始录音 < 200ms |
| **流式首字** | 发送到首字显示 < 500ms |
| **语音结果** | 说话结束到结果卡片出现 < 1.5s |
| **跨设备同步** | session 同步延迟 < 2s |
| **系统支持** | Windows 10+, macOS 12+, Ubuntu 22+ |
| **自动更新** | 静默检查, 后台下载, 用户确认 |
| **安全** | Token 加密存储, IPC ACL, CSP, 路径遍历防护 |
| **离线** | 缓存消息，恢复后自动同步 |

---

## 十二、差异化竞争策略

### 12.1 为什么用户选 Agentrix 而不是 ChatGPT Desktop

| 维度 | ChatGPT Desktop | Agentrix Desktop |
|------|----------------|-----------------|
| 形态 | 独立窗口，需要切换 | **悬浮球，不离开当前窗口** |
| 语音 | 有但需打开窗口 | **全局热键唤醒，结果原位显示** |
| 多端 | 仅同步聊天记录 | **会话实时衔接，手机审批桌面执行** |
| 行动 | 只能对话 | **能执行命令、修改文件、Git操作** |
| 经济 | 无 | **Agent 有钱包，能自主交易和接单** |
| 生态 | 封闭 GPTs | **开放技能市场，开发者可赚佣金** |
| 可穿戴 | 无 | **手环心率触发 Agent 行动** |
| 记忆 | 有限上下文 | **知识库 + 偏好 + 跨设备共享记忆** |

### 12.2 差异化功能矩阵

```
                      ChatGPT  Lemon  Cursor  Agentrix
                      Desktop  (heyL) (IDE)   Desktop
对话聊天                 ✅      ✅     ✅      ✅
语音唤醒                 ❌      ✅     ❌      ✅
悬浮球/不打断工作流       ❌      ✅     ❌      ✅
代码执行/编辑            ❌      ❌     ✅      ✅
多 Agent 编排            ❌      ❌     ❌      ✅
Agent 经济系统           ❌      ❌     ❌      ✅
技能市场                 ✅(GPTs) ❌    ❌      ✅
跨设备会话衔接           ❌      ❌     ❌      ✅
可穿戴设备联动           ❌      ❌     ❌      ✅
Agent 自主交易           ❌      ❌     ❌      ✅
共享记忆/知识库          ❌      ❌     ❌      ✅
```

### 12.3 独特卖点 (USP)

1. **"你的 Agent 跟着你走，不跟着设备走"** — 手机上教会的，桌面上也记得
2. **"说句话就能搞定，不用打开任何窗口"** — 语音优先，零切换成本
3. **"Agent 不只听话，还能替你赚钱"** — Agent 经济：接单、交易、佣金
4. **"手环一震，Agent 就知道你需要什么"** — 可穿戴情境感知 → 主动 Agent 行动
5. **"从创意到执行，一个面板搞定"** — 专业模式：规划→审批→执行→验证

---

## 十三、实施路线图

### Phase 1: 语音模式重塑 (1.5 周)

> **目标**: 悬浮球语音交互达到 heylemon.ai 水准

| 任务 | 工作量 | 关键文件 |
|------|--------|---------|
| T1.1 悬浮球窗口自适应 resize | 1d | main.rs, lib.rs, tauri.conf.json |
| T1.2 VoiceResultCard 结果卡片 | 1d | 新建 VoiceResultCard.tsx |
| T1.3 FloatingBall 语音流程重构 | 2d | FloatingBall.tsx (录音→结果→收回全在原位) |
| T1.4 分句流式 TTS 优化 | 1d | voice.ts, AudioQueuePlayer.ts |
| T1.5 实时转写 + duplex 优化 | 1d | liveSpeech.ts, FloatingBall.tsx |
| T1.6 持续对话 (5s 窗口期) | 0.5d | FloatingBall.tsx |
| T1.7 上下文自动注入 | 0.5d | store.ts (活动窗口+剪贴板→prompt) |

**交付物**: 单击悬浮球→说话→原位结果卡片+TTS播报→自动收回

### Phase 2: 专业模式体验升级 (2 周)

> **目标**: Agent 模式从"底层操作列表"升级为"用户可理解的任务视图"

| 任务 | 工作量 | 关键文件 |
|------|--------|---------|
| T2.1 TaskTimeline 分层计划视图 | 2d | TaskTimeline.tsx |
| T2.2 代码 Diff 渲染 (diff2html) | 1.5d | 新建 DiffView.tsx, MessageBubble.tsx |
| T2.3 Thinking 动画指示器 | 0.5d | MessageBubble.tsx |
| T2.4 终端输出流式 + ANSI | 1.5d | 新建 TerminalOutput.tsx |
| T2.5 Plan 模式完整接入 | 1.5d | PlanPanel.tsx → ChatPanel.tsx |
| T2.6 工具执行动画 + 参数预览 | 1d | MessageBubble.tsx |
| T2.7 双击→专业模式入口 | 0.5d | FloatingBall.tsx, lib.rs |
| T2.8 Token 消耗进度条 | 0.5d | ChatPanel.tsx |

**交付物**: 高层任务计划 + Diff + 动画进度 + Plan 审批

### Phase 3: 跨设备 & Agent 经济 (1.5 周)

> **目标**: 桌面端成为多端协同的主力执行端

| 任务 | 工作量 | 关键文件 |
|------|--------|---------|
| T3.1 会话衔接通知 ("手机上有进行中任务") | 1d | CrossDevicePanel.tsx |
| T3.2 Handoff 接力 UI | 1d | 新建 HandoffBanner.tsx |
| T3.3 Agent 账户概览侧边栏 | 1d | 新建 AgentEconomyPanel.tsx |
| T3.4 技能市场快速浏览/安装 | 1d | ChatPanel.tsx / 集成到对话 |
| T3.5 支付审批快速通道 | 0.5d | FloatingBall.tsx 通知 + 快速批准 |
| T3.6 可穿戴事件订阅 + 通知显示 | 1d | 新建 WearableNotification.tsx |
| T3.7 共享记忆管理 (桌面端知识库) | 1d | 新建 MemoryPanel.tsx |

**交付物**: 跨设备会话无缝衔接 + Agent 经济面板 + 可穿戴联动通知

### Phase 4: 打磨 & 完善 (1 周)

| 任务 | 工作量 |
|------|--------|
| T4.1 首次引导流程更新 (反映双模 + 多端) | 1d |
| T4.2 快捷命令系统完善 | 0.5d |
| T4.3 快捷键自定义设置 | 0.5d |
| T4.4 性能优化 (WebView 内存, 启动速度) | 1d |
| T4.5 离线缓存 + 恢复 | 1d |
| T4.6 多平台打包测试 (Win/Mac/Linux) | 1d |

---

## 十四、成功指标

| 指标 | 目标 (发布后 30 天) | 衡量方法 |
|------|-------------------|---------|
| **日活用户 (DAU)** | 500+ | 设备心跳 |
| **语音交互率** | 50%+ 用户每天使用过语音模式 | 语音事件 |
| **跨设备用户** | 30%+ 同时有移动端+桌面端 | 设备 presence |
| **日均对话轮次** | 15+/人 (语音+文字合计) | 消息计数 |
| **语音→结果延迟** | P95 < 2s | 端到端计时 |
| **次日留存** | 45%+ | 登录记录 |
| **专业模式使用率** | 20%+ 用户每周使用过专业模式 | 面板打开事件 |
| **Agent 经济活跃** | 10%+ 用户有技能安装/购买行为 | 交易记录 |
| **崩溃率** | < 0.1% | 错误上报 |

---

## 十五、风险 & 依赖

| 风险 | 影响 | 缓解 |
|------|------|------|
| Tauri 窗口动态 resize 闪烁 | 语音模式体验 | CSS 动画过渡 + 预设固定尺寸阶梯 |
| TTS 分句播报延迟 | 语音流畅度 | AudioQueuePlayer 已有 buffer 机制 |
| 后端需要 emit 高层任务事件 | 专业模式分层展示 | 先前端硬编码映射规则，后续后端配合 |
| heylemon 用 fn 键，Windows 无 fn | 快捷键 | Ctrl+Shift+A 或 Ctrl+Space |
| Agent 三系统(UserAgent/AgentAccount/Instance)未融合 | 经济功能 | 已有融合计划，先用软链接 |
| 记忆偏好后端未实现 | 共享记忆 | 先实现知识库部分，偏好后补 |
| WebView2 各版本兼容性 | Windows 用户 | ensure_webview2_runtime 回退机制 |

---

## 十六、后端架构优化对齐 (v2.1 增补)

> **参考**: `ARCHITECTURE_OPTIMIZATION_CLAUDE_CODE_REFERENCE.md` Phase 1-6 优化计划

### 16.1 SSE 协议兼容增强

后端 Phase 6 统一 SSE 协议在 `shared/stream-parser.ts` 中已全面支持。桌面端需确保以下新事件类型被前端正确消费:

| 事件类型 | 来源 Phase | 桌面端处理 | 实现状态 |
|---------|-----------|-----------|---------|
| `text_delta` | Phase 6 | ChatPanel 流式渲染 | ✅ 已有 |
| `thinking` | Phase 6 | MessageBubble 思考指示器 | ✅ 已有 |
| `tool_start` / `tool_progress` / `tool_result` | Phase 6 | TaskTimeline 实时更新 | ✅ 已有 |
| `tool_error` | Phase 6 | 错误提示 + 重试建议 | ✅ 已有 |
| `approval_required` | Phase 6 | ApprovalSheet + FloatingBall 通知徽章 | 🔄 增强中 |
| `usage` | Phase 6 | **实时 Token 消耗条** — `totalCostUsd` 直接渲染 | 🔄 增强中 |
| `turn_info` | Phase 6 | **Turn 进度** — `turnIndex`/`isCompacted` 状态卡 | 🔄 增强中 |
| `done` | Phase 6 | 结束原因展示 (`max_tokens` → 提示继续) | ✅ 已有 |
| `error` | Phase 6 | 错误通知 + `retriable` 自动重试 | ✅ 已有 |

### 16.2 实时成本展示升级

原来 Token 进度条依赖 `/agent-intelligence/sessions/{id}/context-usage` 轮询接口。
现升级为 **SSE 实时流内事件驱动**:

```
onUsage 事件:
  ┌─ totalCostUsd ──→ 实时成本标签: "$0.0032"
  ├─ inputTokens ───→ 输入 token 计数
  ├─ outputTokens ──→ 输出 token 计数
  ├─ cacheReadTokens → 缓存命中指示 "♻️ Cache"
  └─ model ─────────→ 当前模型标签

Token 进度条:
  [████████░░░░] 64% · 128K/200K · $0.0032 · claude-3-5-sonnet ♻️
```

### 16.3 Plan 模式完整对接

PlanPanel 已存在，需增强:
- Plan 审批后自动切换到 Agent 模式跟踪执行
- Plan 步骤与 TaskTimeline 联动 — PlanStep → TaskTimelineEntry 映射
- Plan 状态变更推送 (通过 `onMeta` 回调实时更新)

### 16.4 SubAgent 编排可视化

后端 Phase 3 SubAgent 编排对桌面端的影响:

```
TaskTimeline 新增 KIND_GROUPS:
  agent_spawn  → "🤖 Sub-Agent 执行"
  agent_result → "🤖 Sub-Agent 执行"
  web_search   → "🌐 Web 搜索"
  memory_read  → "🧠 记忆检索"
  memory_write → "🧠 记忆存储"

SubAgent 嵌套显示:
  ├─ 🤖 Sub-Agent: DataBot
  │   ├─ 📖 Analyzing code (3 steps)
  │   └─ ✅ Completed ($0.50)
  └─ ✏️ Modifying files (2 steps)
```

### 16.5 自动压缩状态提示

后端 Phase 1 Context Compaction 在 token 超阈值时自动压缩历史。
桌面端通过 `turn_info.isCompacted` 事件显示系统卡片:

```
┌─────────────────────────────────────────┐
│ 🗜️ 上下文已自动压缩                      │
│ 已压缩 45K tokens 的历史对话              │
│ 当前上下文: 128K / 200K                  │
└─────────────────────────────────────────┘
```

### 16.6 Agent 经济面板

新增 `AgentEconomyPanel.tsx` 组件:
- Agent 账户余额、收入、支出图表
- 近期交易流水
- 技能购买/安装快捷操作
- 佣金收入追踪

### 16.7 记忆管理面板

新增 `MemoryPanel.tsx` 组件:
- 四层记忆可视化: Session / Agent / User / Knowledge Base
- 记忆条目列表 + 新鲜度标记
- 知识库文件上传/删除
- 偏好编辑 (待后端实现后对接)

### 16.8 对桌面 PRD 的影响总结

| 影响面 | 原 PRD 描述 | 优化后变更 |
|--------|-----------|-----------|
| Token 进度条 (§4.3) | 静态轮询 `/context-usage` | → SSE `usage` 事件实时驱动 + 成本标签 |
| TaskTimeline (§4.3) | 仅映射基础工具操作 | → 新增 SubAgent / 记忆 / Web 搜索分组 |
| Plan 模式 (§4.3) | "PlanPanel 存在但未接入" | → 完整审批→执行→监控闭环 |
| 审批 (§5.3) | 仅在 ApprovalSheet 内 | → FloatingBall 快速审批通道 |
| Agent 经济 (§6.2) | "侧栏" 概念 | → 独立 AgentEconomyPanel 面板 |
| 记忆管理 (§5.5) | "桌面端记忆增强" 概念 | → 独立 MemoryPanel 面板 |
| 压缩 (§10.2) | 未提及 | → 系统消息卡片显示压缩状态 |

---

*Agentrix Desktop v2.1 — 不是另一个聊天窗口，是连接你、你的 Agent、和整个 Agent 经济的桌面入口。语音优先，跨设备协同，Agent 替你工作替你赚钱。与后端架构优化 Phase 1-6 全面对齐。*
