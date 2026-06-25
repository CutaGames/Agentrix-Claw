# Agentrix Mobile 重构方案 v4.0：Drawer + 3 Tab + 语音悬浮球

> **版本**: v4.0 FINAL  |  **日期**: 2026-03-27  
> **决策**: 方案 B (侧滑空间法) + 多实例支持 + 悬浮球语音专用化  
> **范围**: 导航架构重构 + 对话页精简 + 输入栏/模型选择优化

---

## 一、架构总览

### 1.1 导航拓扑 (Drawer → Tab → Stack)

```
NavigationContainer
└── RootNavigator (Auth / Onboarding / Main 三态切换)
    └── DrawerNavigator (@react-navigation/drawer, 左侧抽屉)
        │
        ├── [Left Drawer] AgentDrawerContent (自定义组件，非 Screen)
        │   ├── 多实例切换器 (顶部)
        │   ├── 状态概览卡片
        │   └── 管理功能索引列表
        │
        └── [Center] MainTabNavigator (底部 3 Tab)
              ├── 💬 Chat Tab   → AgentStackNavigator (initialRoute: AgentChat)
              ├── 🌍 Discover   → DiscoverStackNavigator
              └── 👤 Me         → MeStackNavigator

GlobalFloatingBall: 挂载在 DrawerNavigator 同级 (与 MainTabNavigator 并列)
```

### 1.2 关键决策记录

| 决策点 | 结论 | 理由 |
|--------|------|------|
| 首屏 | Chat Tab (AgentChat) | 用户打开 App 即可对话，新用户走 auto-provision 欢迎页 |
| 悬浮球 | **纯语音**入口 | Chat 已有 Tab，悬浮球不再导航到 Chat，单击直接进入全双工语音 |
| Drawer 内容 | **精简索引版** Console | 不铺完整 4-Tab Console，只放状态卡+高频入口列表 |
| 多实例 | Drawer 顶部下拉切换器 | v1 用紧凑下拉而非 Discord 竖列，支持多 Agent 秒切 |
| Console 完整页 | Drawer 列表点击后 push 全屏 | 记忆管理/工作流等详情走 Stack 全屏，非 Drawer 内展示 |

---

## 二、各页面最终态 Layout 与交互

### 2.1 Left Drawer — 智能体管理中枢 (AgentDrawerContent)

**触发方式**: 
- Chat 页左上角 🤖 头像按钮 (新增)
- 任何一级 Tab 根页面从屏幕**左边缘向右滑动**
- 二级/三级页面中**锁定 Drawer 手势** (`swipeEnabled: false`)，恢复系统返回

**宽度**: 屏幕 80%  |  **背景**: `colors.bgPrimary`

```text
╔══════════════════════════════════════════╗
║ [多实例切换器 InstanceSwitcher]            ║
║ ╭────────────────────────────────────╮   ║
║ │ 🤖 My Work Agent        ▾ 下拉    │   ║  <- 点击展开下拉列表
║ │     •云端 · Active                 │   ║     切换 activeInstance
║ ╰────────────────────────────────────╯   ║
║ (展开后):                                 ║
║ ╭────────────────────────────────────╮   ║
║ │ ✓ 🤖 My Work Agent (Cloud)        │   ║
║ │   🧑‍💻 Dev Assistant (Local)        │   ║
║ │   📊 Trading Bot (BYOC)           │   ║
║ │ ─────────────────────────────────  │   ║
║ │   ➕ 新建/连接 Agent               │   ║  <- push DeploySelect
║ ╰────────────────────────────────────╯   ║
║                                          ║
║ [状态概览卡 StatusCard]                    ║
║ ╭────────────────────────────────────╮   ║
║ │ [████████░░] Token 72%  ·  23/32k │   ║
║ │ 💾 8.1 / 10 GB  ·  Plan: Free     │   ║
║ │ Status: ● Active  ·  v2.4.1       │   ║
║ ╰────────────────────────────────────╯   ║
║                                          ║
║ [高频管理入口 QuickMenu]                   ║
║  🧠 记忆中心 (Memory Hub)             ❯   ║  -> push MemoryManagement
║  ⚙️ 工作流 (Workflows)               ❯   ║  -> push WorkflowList 
║  🛠️ 技能管理 (Skills)                ❯   ║  -> push AgentConsole[Skills Tab]
║  📋 运行日志 (Logs)                   ❯   ║  -> push AgentLogs
║                                          ║
║ [设备与连接 DeviceMenu]                    ║
║  🖥️ 桌面控制 (Desktop)               ❯   ║  -> push DesktopControl
║  ⌚ 可穿戴设备 (Wearables)            ❯   ║  -> push WearableHub
║  📷 扫码连接 (Scan)                   ❯   ║  -> push Scan
║                                          ║
║ [安全与高级 SecurityMenu]                  ║
║  🔐 权限管理                          ❯   ║  -> push AgentPermissions
║  🤖 Agent 账号                        ❯   ║  -> push AgentAccount
║  👥 团队空间                          ❯   ║  -> push TeamSpace
║                                          ║
║ [底部]                                    ║
║  ⚙️ Agent 完整控制台                  ❯   ║  -> push AgentConsole (全屏)
╚══════════════════════════════════════════╝
```

**多实例切换交互**:
1. 默认折叠态：显示当前 `activeInstance.name` + 部署类型 + 状态点
2. 点击 ▾ 展开：从 `useAuthStore` 读取 `user.openClawInstances[]` 渲染列表
3. 点击某实例：调用 `setActiveInstance(id)`，Drawer 自动关闭，Chat 页刷新连接
4. 点击 "➕ 新建/连接 Agent"：关闭 Drawer → push `DeploySelect` 进入部署流程
5. 实例状态指示：Active=绿点, Disconnected=灰点, Error=红点

**点击管理项的导航行为**:
- 关闭 Drawer (`navigation.closeDrawer()`)
- 然后 `navigation.navigate('Agent', { screen: targetScreen })` 推入全屏 Stack

---

### 2.2 Chat Tab (首屏 — AgentChat)

用户打开 App 默认落地此页。

```text
╔══════════════════════════════════════════════╗
║ [ChatBar 顶部导航栏]  h=80 (safe area + 60) ║
║  🤖(36x36)     Agent Name (16px 700)    ⚙️  ║
║  ↑ 打开Drawer     ↑ 居中 flex:1      ↑ 设置 ║
╠══════════════════════════════════════════════╣
║ [ChatSessionTabs] 多会话横向滚动 Tab          ║
╠══════════════════════════════════════════════╣
║                                              ║
║  [系统 Banner 条件渲染区]                      ║
║   (桌面连接提示 / 离线提醒 / 剪贴板)           ║
║                                              ║
║         ╭─────────────────────────╮          ║
║         │ Agent 消息气泡           │          ║
║         │ bgCard, 左对齐, R=18px  │          ║
║         ╰─────────────────────────╯          ║
║                                              ║
║         [⚡ 思维链胶囊 (流式更新)]             ║
║         "⏳ 正在搜索..." → "✓ 5 steps"       ║
║                                              ║
║              ╭─────────────────────╮         ║
║              │ 用户消息气泡         │         ║
║              │ primary, 右对齐     │         ║
║              ╰─────────────────────╯         ║
║                                              ║
╠══════════════════════════════════════════════╣
║ [语音状态吸附栏 VoiceStatusBar] (仅语音时)    ║
║  [...波纹] 正在听写... "你好帮我查..."        ║
╠══════════════════════════════════════════════╣
║ [InputRow 极简输入区] 3 元素                  ║
║                                              ║
║  文字模式 · 空输入:                            ║
║  [ + ] [  输入消息...               ] [ 🎤 ] ║
║  42x42   flex:1, R=22, maxH=120     42x42   ║
║                                              ║ 
║  文字模式 · 有输入:                            ║
║  [ + ] [  你好，帮我查一下...       ] [ ⬆ ]  ║
║                                              ║
║  语音模式 · PTT:                               ║
║  [ + ] [  🎙  按住说话 (绿底)       ] [ ⌨️ ] ║
║                                              ║
║  语音模式 · 全双工通话中:                       ║
║  [ + ] [  📞 通话中 — 点击挂断 (绿底)] [ ⌨️ ] ║
║                                              ║
╠══════════════════════════════════════════════╣
║ [ 💬 Chat ]    [ 🌍 Discover ]    [ 👤 Me ] ║
║    高亮             默认             默认     ║
╚══════════════════════════════════════════════╝
         ** [AX] 悬浮球 — 右下角，语音唤醒专用 **
```

**Header (ChatBar) 交互**:
- **左侧 🤖 头像按钮** (36x36, `colors.bgSecondary` 圆底):  
  `navigation.openDrawer()` → 弹出智能体管理抽屉
- **中间 Agent Name**: 居中显示 `activeInstance.name`，不可点击
- **右侧 ⚙️ 设置**: 打开 Settings BottomSheet (语音人格、模型选择等)
- ~~原有的 📞 对讲按钮~~: **移除** — 语音入口统一收归悬浮球

**InputRow 3 元素动态切换**:
1. `[ + 附件 ]` — 始终存在，42x42，点击展开附件工具栏 (📷📊📎📍)
2. `[ 输入框 / 按住说话 ]` — flex:1，根据 `voiceMode` 切换
3. `[ 🎤 / ⬆ / ⌨️ ]` — 动态按钮:
   - 文字模式 + 空输入 → 🎤 (点击切为语音PTT模式)
   - 文字模式 + 有输入 → ⬆ 发送 (主色圆底)
   - 语音模式 → ⌨️ (点击切回文字模式)

**Settings BottomSheet (⚙️ 弹出) — 模型内联展开**:
```text
╭──────────────────────────────────────╮
│ ⚙️ 设置                              │
│──────────────────────────────────────│
│ 🎭 语音人格       [ Zhiyu      ▾ ]  │  <- 点击展开声音列表
│ 🤖 智能模型       [ GPT-4o     ▾ ]  │  <- 点击在 Sheet 内展开
│  ┌─ ✓ GPT-4o ──────────────────┐    │     (不弹全屏 Modal)
│  │   Claude-3.5-Sonnet          │    │
│  │   Gemini-2.0-Flash           │    │
│  │   Llama-3.3-70B              │    │
│  └──────────────────────────────┘    │
│ 🔊 语速           [ 1.0x       ▾ ]  │
│ ✨ 新建对话                           │
│ 🤖 Agent 完整控制台              ❯    │  <- push AgentConsole
╰──────────────────────────────────────╯
```
- 模型/语音人格行点击 → 在 Sheet 内直接手风琴展开 ScrollView 列表
- 选择后列表自动收起，Sheet 保持打开
- 操作步数: 6 → **2** (点 ⚙️ → 点选模型)

**ThoughtChain 胶囊流式更新**:
- Streaming 中: 胶囊文本实时替换为 `thoughts[]` 最后一条
- 格式: `[⏳ {latestThought截断40字}]` + 左侧 spinner
- 完成时: spinner → ✓ 图标，文本变为 `✓ {n} steps completed`
- 点击胶囊: 展开完整 thought 日志列表

**新用户空状态** (无 Agent):
- 显示欢迎页: 大 logo (72px) + 标题 + 副标题
- "Get Started" 按钮 → `POST /openclaw/auto-provision` 一键创建
- 创建成功 → 自动刷新页面进入对话态

---

### 2.3 Discover Tab (技能与动态发现)

```text
╔══════════════════════════════════════════════╗
║ [搜索栏] P=16                                ║
║  [ 🔍 搜索技能或动态...  ] R=14, border=1   ║
║  onPress → push('Marketplace')全屏搜索       ║
╠══════════════════════════════════════════════╣
║ [双 Tab 切换] gap=8                          ║
║  [ 🌟 技能站 (高亮) ]  [ 📰 技能展 ]        ║
╠══════════════════════════════════════════════╣
║ [if 技能站激活]                               ║
║                                              ║
║ [筛选 Chips 行] — 同页过滤（不跳页）          ║
║  [●全部] [⚡热门] [🆕最新] [🛠工具]          ║
║  activeFilter 状态切换，亮色底 + 主色文字      ║
║  切换时: FlatList 渲染 filteredSkills[]       ║
║                                              ║
║ [技能双格瀑布流] 2-col, 47%w, gap=12         ║
║  ╭──────────╮ ╭──────────╮                   ║
║  │ 📧 28px  │ │ 🔍 28px  │                   ║
║  │ Email Bot│ │ WebSearch│                   ║
║  │ 灰描述2行│ │ 灰描述   │                   ║
║  │ ¥9.9 主色│ │ Free     │                   ║
║  ╰──────────╯ ╰──────────╯                   ║
║  ...更多卡片...                               ║
║                                              ║
║ [📋 任务广场入口卡片 → TaskMarket]            ║
║ [Browse All Skills → Marketplace]            ║
║                                              ║
╠══════════════════════════════════════════════╣
║ [if 技能展激活]                               ║
║  [进入 Showcase Feed 按钮]                    ║
║  (引导文)                                     ║
╠══════════════════════════════════════════════╣
║ [ 💬 Chat ]    [ 🌍 Discover ]    [ 👤 Me ] ║
║    默认             高亮             默认     ║
╚══════════════════════════════════════════════╝
```

**Chips 筛选交互改进**:
- 现状：每个 Chip 都 `navigate('Marketplace', {filter})` 跳到新页面
- 改为：页面内维护 `activeFilter` state，Chip 选中后高亮切换
- FlatList 数据源根据 filter 重新请求或本地过滤 `featuredSkills`
- 需在 DiscoverScreen 内新增 API 调用支持分类查询（或复用 Marketplace 的 queryFn）

---

### 2.4 Me Tab (个人中心)

```text
╔══════════════════════════════════════════════╗
║ [顶部标题栏]                                  ║
║  Profile (22px 800)       [📷扫码] [🔔通知]  ║
╠══════════════════════════════════════════════╣
║ [用户头像卡] R=16, border=1, P=16            ║
║  ╭────────────────────────────────────────╮  ║
║  │ (56x56 头像)  Nickname (18px 700)      │  ║
║  │               email@xxx.com (13px 灰)  │  ║
║  │               [Creator] [Pro]          │  ║
║  ╰────────────────────────────────────────╯  ║
╠══════════════════════════════════════════════╣
║ [当前 Agent 状态卡] (条件渲染)                 ║
║  ╭────────────────────────────────────────╮  ║
║  │ 🤖 My Agent  ●Active  Cloud           │  ║
║  │ URL: https://xxx (11px mono)           │  ║
║  ╰────────────────────────────────────────╯  ║
╠══════════════════════════════════════════════╣
║ [裂变 CTA Banner]                             ║
║  ╭────────────────────────────────────────╮  ║
║  │ 🦀 Invite friends, earn commissions ❯  │  ║
║  ╰────────────────────────────────────────╯  ║
╠══════════════════════════════════════════════╣
║ [菜单列表] R=14, border=1                     ║
║  ╭────────────────────────────────────────╮  ║
║  │ 🎁 Referrals & Earnings            ❯  │  ║
║  │────────────────────────────────────────│  ║
║  │ 🔐 Wallet & Account                ❯  │  ║
║  │────────────────────────────────────────│  ║
║  │ ⚡ My Skills                        ❯  │  ║
║  │────────────────────────────────────────│  ║
║  │ 📦 My Orders                        ❯  │  ║
║  │────────────────────────────────────────│  ║  
║  │ ⚙️ Settings                         ❯  │  ║
║  ╰────────────────────────────────────────╯  ║
║                                              ║
║  [Sign Out] (红字居中)                        ║
╠══════════════════════════════════════════════╣
║ [ 💬 Chat ]    [ 🌍 Discover ]    [ 👤 Me ] ║
║    默认             默认             高亮     ║
╚══════════════════════════════════════════════╝
```

**与重构前的变更**:
- ~~🤖 Agent Management 菜单项~~：**移除** — Console 已整体迁入左侧 Drawer
- ~~📡 Social Listener 菜单项~~：**移除** — 归入 Discover 的 Social 流
- Me 页只保留纯粹的**个人资产与账户管理**

---

### 2.5 GlobalFloatingBall (语音唤醒专用)

**职责变更** (核心): 不再承担"跳转 Chat"的导航职责，专注AI语音交互。

**Size**: 48x48  |  **Position**: 右下角 (距边12px)，支持拖拽+边缘吸附+MMKV位置持久化

**视觉**: 不变 (`#1a1a2e` 底，白色 "AX"，状态指示点，发光阴影)

**交互重定义**:

| 手势 | 行为 | 说明 |
|------|------|------|
| **单击 (Tap)** | 直接启动**全双工语音通话** | 不导航，在当前页面启动 Socket 语音连接。如果已在 Chat 页则激活 duplexMode；如果在 Discover/Me 页则先 navigate 到 Chat 并自动启动语音 |
| **长按** | 弹出 Voice Pill 胶囊 (260x120) | 语音转文字的轻量面板，可发送文字消息、查看波形与转写 |
| **拖拽** | Spring 边缘吸附 + MMKV 持久化坐标 | 不变 |

**单击语音激活详细逻辑**:
```
1. Haptics 反馈
2. 释放 wake word listener (释放麦克风)
3. 判断当前路由:
   a. 如果在 AgentChat → 直接调用 chatScreen 的 startDuplexCall()
   b. 如果在其他页面 → navigation.navigate('Agent', { 
        screen: 'AgentChat', 
        params: { voiceMode: true, duplexMode: true }
      })
4. 不再使用 CommonActions.reset()，保持导航栈完整
```

**首次引导 (新增)**:
```text
         ┌──────────────────────────┐
         │ 👋 点我开始语音对话       │
         │ 长按打开语音面板          │
         └──────────┬───────────────┘
                    ▼
                  [AX]  ← 1.2x 脉冲动画 3 秒
```
用 MMKV `floating_ball_onboarded` flag 控制只展示一次。

**隐藏页面**: AgentChat (正在聊天时无需悬浮球), VoiceChat, ClawSettings

---

### 2.6 Onboarding Flow (不变，仅补充说明)

```text
Auth 未登录 → Login/WalletConnect
  ↓ 登录成功
InvitationGate (邀请码校验)
  ↓ 通过
DeploySelect (3 选项卡片)
  ☁️ One-Tap Cloud (10GB FREE)
  💻 Local Deploy (PRIVATE)
  ⚙️ BYOC
  [Skip for now]
  ↓ 完成部署 or Skip
Main → Chat Tab (AgentChat)
  有 Agent → 直接对话
  无 Agent → 欢迎页 + Get Started (auto-provision)
```

---

## 三、手势冲突处理方案

| 场景 | 行为 | 实现方式 |
|------|------|---------|
| Tab 根页面 (Chat/Discover/Me 首屏) | 允许左边缘右滑打开 Drawer | `swipeEnabled: true` (默认) |
| Stack 二级页面 (SkillDetail/Settings 等) | 左边缘右滑 = 系统返回，禁用 Drawer | Drawer `screenOptions` 中根据 `navigation.getState()` 检测栈深度，深度 > 1 则 `swipeEnabled: false` |
| AgentChat 页面 | 左上角按钮 + 左滑呼出 Drawer | Chat 页顶部有 🤖 按钮，同时允许滑动手势 |
| 拖拽悬浮球 | 不触发 Drawer | 悬浮球用 PanResponder，在 Drawer 手势之上 (zIndex 9999) |

---

## 四、重构文件改动清单

### 新增文件
| 文件 | 用途 |
|------|------|
| `src/navigation/DrawerNavigator.tsx` | 新的 Drawer 根导航器 |
| `src/components/AgentDrawerContent.tsx` | 自定义 Drawer 内容组件 (实例切换器 + 管理菜单) |

### 修改文件
| 文件 | 改动内容 |
|------|---------|
| `package.json` | 新增 `@react-navigation/drawer` 依赖 |
| `src/navigation/RootNavigator.tsx` | `MainWithFloatingBall` 改为包裹 `DrawerNavigator` 而非 `MainTabNavigator` |
| `src/navigation/MainTabNavigator.tsx` | Agent Tab 从隐藏变为**可见首位 Tab** (💬 Chat 图标) |
| `src/navigation/AgentStackNavigator.tsx` | `initialRouteName` 从 `AgentConsole` 改为 `AgentChat` |
| `src/components/GlobalFloatingBall.tsx` | (1) 单击→全双工语音 (2) `useNavigationState` 加 1 层 Drawer 遍历 (3) 去掉 `CommonActions.reset` 改为 `navigate` (4) 首次引导 Tooltip |
| `src/screens/agent/AgentChatScreen.tsx` | (1) Header 左侧改为 🤖 Drawer 按钮 (2) 移除 📞 对讲按钮 (3) InputRow 5→3 元素 (4) 模型选择 Inline 展开 (5) ThoughtChain 流式胶囊 |
| `src/screens/me/ProfileScreen.tsx` | 移除 "Agent Management" 和 "Social Listener" 菜单项 |
| `App.tsx` | deep linking config 新增 Drawer 层级路径 |

### 不需要修改的文件
| 文件 | 原因 |
|------|------|
| `AgentConsoleScreen.tsx` | 组件内部只用简单 `navigate(route)`，放哪都兼容 |
| `DiscoverScreen.tsx` | Chips 筛选改动是内部状态，不涉及导航 |
| 所有 `screens/agent/*.tsx` 子页面 | 纯业务页面，导航接口不变 |
