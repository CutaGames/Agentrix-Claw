# Agentrix Desktop 用户手册（v0.2.x）

> 适用版本：v0.2.0 及以上（2026-05-16 发布）
> 操作系统：Windows 10 / 11（macOS / Linux 内测后跟进）
> 文档状态：初稿，配图待补
> 反馈渠道：Telegram 群 / Discord / `support@agentrix.top`

---

## 目录

- [快速上手](#0-快速上手三步搞定)
- [1. 安装与启动](#1-安装与启动)
- [2. 浮球：你的常驻 AI 伙伴](#2-浮球你的常驻-ai-伙伴)
- [3. Pro Mode：完整工作台](#3-pro-mode完整工作台)
- [4. 输入区与发送](#4-输入区与发送)
- [5. 25 个功能面板](#5-25-个功能面板)
- [6. 全局快捷键](#6-全局快捷键)
- [7. 隐私与遥测](#7-隐私与遥测)
- [8. 自动更新](#8-自动更新)
- [9. 故障排除](#9-故障排除)

---

## 0. 快速上手（三步搞定）

```
[安装 setup.exe] → [邮箱登录] → [完成 Onboarding]
                                         ↓
                  桌面右下角出现一只 3D 灵狐悬浮球 ✨
```

之后的常用操作：
- **单击浮球** → 打开 Compact 聊天面板
- **双击浮球** → 进入 Pro Mode（完整工作台）
- **右键浮球** → 弹出 12 个功能菜单
- **拖动浮球** → 自动贴边（多显示器自动归位）

---

## 1. 安装与启动

### 1.1 下载

打开 [agentrix.top/download](https://agentrix.top/download) 点击 `下载 Windows 版本`。

文件名：`Agentrix Desktop_0.2.0_x64-setup.exe`（约 7 MB）。

> 推荐 Windows 10 1903+ / Windows 11，需要 WebView2 运行时（系统通常自带；缺失时安装器会自动下载）。

### 1.2 SmartScreen 引导（内测期间未签名）

双击安装包后，可能看到蓝色或红色的 "Windows 已保护你的电脑" 提示：

```
[图片：SmartScreen 红色拦截截图]
```

操作：
1. 点击 **更多信息**（链接，不是关闭按钮）
2. 出现 **仍要运行** 按钮，点击它
3. 进入正常 NSIS 安装向导

> 内测后我们会做代码签名（Sprint G-3），届时不再有此提示。

### 1.3 安装目录

默认安装到 `%LOCALAPPDATA%\Programs\Agentrix Desktop\`，用户数据写到：

| 路径 | 用途 |
|------|------|
| `%APPDATA%\Agentrix Desktop\` | 用户配置、对话缓存、皮肤资产 |
| `%APPDATA%\Agentrix Desktop\crash-logs\` | Rust panic 日志（自动清理） |

完全卸载：控制面板 → 卸载 → "Agentrix Desktop"，并手动删除 `%APPDATA%\Agentrix Desktop\`。

### 1.4 首次启动

启动后依次出现：

1. **Splash 闪屏（200 ms）**：紫色旋转加载圈 + "Agentrix" 字样
   ```
   [图片：splash 截图]
   ```
2. **登录面板 LoginPanel**：480 × 640 窗口
   - 默认 Tab：**📱 扫码登录**（移动端 Agentrix App 扫描二维码）
   - 第二 Tab：**📧 邮箱 + 验证码**
   - 第三 Tab：**🔑 钱包登录**（MetaMask / WalletConnect）
   - 底部：**👻 游客模式**（不持久化数据）
3. **Onboarding 引导**：选灵狐 → 选首个 Agent → 完成
4. **窗口缩小到 80 × 80**，灵狐悬浮球出现在屏幕右下角

> 完成 onboarding 后，启动时间通常 < 2 秒。

---

## 2. 浮球：你的常驻 AI 伙伴

### 2.1 三种形态（自动切换）

| 形态 | 何时出现 | 视觉特征 | 用途 |
|------|---------|---------|------|
| **🐾 萌态 living-agent** | 默认，浮球状态 | Q 版圆润灵狐，柔和光晕 | 待机、随时聊几句 |
| **⚡ 专家态 pro-mode** | 进入 Pro Mode 时 | 修长身形 + 数据流光环 | 编程、深度任务 |
| **💰 商人态 economy-panel** | 打开 Agent Economy 面板时 | 戴礼帽、抱金币 | 经济管理 |

形态切换是动画过渡的，**情绪也会反映在表情上**（happy/sad/excited 等共 10 种）。

```
[图片：3 形态对比图]
```

### 2.2 浮球的三种交互方式

| 操作 | 行为 |
|------|------|
| **单击** | 打开 Compact 聊天面板（480 × 640） |
| **双击** | 直接进入 Pro Mode（1100 × 820） |
| **右键** | 弹出功能菜单（见 §2.4） |
| **长按拖动** | 移动浮球；松手后自动贴最近边缘 |
| **Hover 3 秒** | 触发萌宠互动反应（小动作） |

### 2.3 浮球状态

| 状态 | 视觉 | 何时出现 |
|------|------|---------|
| **idle** | 缓慢呼吸 | 默认 |
| **thinking** | 数据流光环加速 | AI 正在生成回复 |
| **speaking** | 语音波纹动画 | 正在说话（TTS 中） |
| **recording** | 红色心跳光圈 | 正在录音 |

### 2.4 右键菜单（12 项）

按功能分组，从上到下：

```
┌─ 主功能 ──────────────┐
│ 💬 打开 Pro Mode        │
│ 🆕 新对话               │
│ 🎤 语音输入             │
├─ 我的萌宠 ──────────────┤
│ 🐾 我的萌宠 (衣柜)      │
│ ✨ 创建新萌宠           │
│ 📊 成长 / 成就 / 相册   │
│ ✨ 选择灵魂             │
├─ 创作工坊 ──────────────┤
│ 🎨 创作中心 Studio Hub  │
│ 🎬 视频工作室           │
├─ 经济 + 社交 ───────────┤
│ 💞 社交繁育             │
├─ 设置 ──────────────────┤
│ ⚙️  设置               │
└────────────────────────┘
```

**重要修复（v0.2.0）**：之前在 main 窗口右键菜单点任意项会**额外弹出一个 Agentrix 桌面端窗口**导致整体卡顿。v0.2.0 已修复，所有菜单项**只会在当前窗口内打开对应面板**。

---

## 3. Pro Mode：完整工作台

### 3.1 何时进入 Pro Mode

- 双击浮球
- `Ctrl + Shift + S` 快捷键
- `Ctrl + Shift + Space`
- 浮球右键 → "💬 打开 Pro Mode"

窗口尺寸：1100 × 820（最小 720 × 560）。

### 3.2 顶部标题栏（左到右）

```
[Logo] [Agent 选择] [Model 选择] [Tier 切换 (本地/智能/云端)] ... [设置] [More 菜单] [窗口控制]
```

| 元素 | 功能 |
|------|------|
| **Agent 选择** | 切换主 Agent（左上角下拉） |
| **Model 选择** | 切换 LLM 模型（如 Gemma-4 7B、Claude Haiku） |
| **Tier 切换** | 本地 (📱) / 智能 (🧠) / 云端 (☁️) — 决定路由策略 |
| **附件按钮** | 📎 添加图片 / 文件 |
| **截图** | 📷 截取屏幕（粘贴到对话） |
| **告警 / 任务** | ⚠️ 待审批的高风险操作 |
| **链接** | 🔗 外部链接 / 工作区切换 |
| **新建会话** | + 开新 Tab |
| **声音** | 🔊 TTS 开关 |
| **More 菜单 ⋯** | Agent Economy / Memory / Worktree / Skill Canvas / Work Log / Wiki |
| **Pro 切换** | 当前已是 Pro，按钮变成 "X 关闭" |
| **窗口控制** | 最小化 / 最大化 / 关闭 |

### 3.3 中部：消息列表 + 输入区

详见 §4。

### 3.4 标题栏 More 菜单（6 项）

```
🌿 Worktree Board    — 多分支并行工作树
🕸 Skill Canvas       — 技能依赖图
💰 Agent Economy     — 钱包 / AXP / 收入 / 交易
📋 Work Log          — 任务日志
🧠 Memory            — 长期记忆
📚 Memory Wiki       — 知识库
```

### 3.5 闲置 15 分钟自动回 Compact

为了减少打扰，Pro Mode 下连续 15 分钟无键鼠操作 → 自动切回 Compact 形态（也即浮球）。这个行为可以通过设置关闭（待补 UI）。

---

## 4. 输入区与发送

### 4.1 文本输入

底部输入框：
- `Enter` 发送
- `Shift + Enter` 换行
- 支持粘贴文本 / 图片
- 支持 `@` 触发 mention（待补）
- 支持 `/` 触发 slash command

### 4.2 三种聊天模式

按钮在输入区右侧：

| 模式 | 标识 | 行为 | 用途 |
|------|------|------|------|
| **Ask** | 💬 询问 | 仅文字回复，不调工具 | 问答 / 解释 |
| **Agent** | 🤖 智能 | 自动调用工具（搜索/文件/命令）| 任务执行 |
| **Plan** | 📋 计划 | 先规划再执行，每步审批 | 复杂任务 |

切换会持久化到 `localStorage.agentrix_chat_mode`。

### 4.3 三层 Tier 路由

按钮在 Model 选择旁：

| Tier | 含义 |
|------|------|
| **📱 本地** | 用本机 Gemma-4 7B（隐私优先，无需联网） |
| **🧠 智能** | 自动选最便宜的可用模型（Claude Haiku 等） |
| **☁️ 云端** | 强制用最好的模型（Sonnet / Opus） |

Tier 选择会显示在每条 AI 回复底部，例如：
```
智能 → claude-haiku-4-5 · ~$0.001 · 1500ms · 上传云端
```

### 4.4 语音输入

#### 单次语音（点击式）
1. 点击 🎙 按钮 → 进入录音状态（浮球变红心跳）
2. 说完话 → 再点 🎙 停止
3. 自动转写 → 自动发送

#### 持续语音（按住式）
- 长按 🎙 按钮：录音中
- 松手：发送

#### 唤醒词（可选）
设置 → 启用唤醒词（Picovoice Porcupine）后，可以说 "嘿 Agentrix" 自动启动语音。

### 4.5 附件上传

- 点击 📎 → 选择文件
- 拖拽到聊天面板 → 自动上传
- 支持图片（截图问答）、PDF、文档、代码文件
- 单文件 ≤ 50 MB，单次会话 ≤ 200 MB

### 4.6 截图问答

- `截图` 按钮：选区域 → 截图自动粘贴到输入框
- 支持 Computer Use（屏幕识别 + 点击 + 输入）

---

## 5. 25 个功能面板

按入口分类：

### 5.1 萌宠相关（7 个）

| 面板 | 入口 | 用途 |
|------|------|------|
| **WardrobePanel 衣柜** | 右键 → 衣柜 | 浏览拥有的皮肤、装备、上架 marketplace |
| **PetCreatorPanel 创作** | 右键 → 创建新萌宠 | 文生 / 图生 / 繁殖 |
| **PetGrowthDashboard** | 右键 → 成长 | XP 进度 / 解锁记录 |
| **PetAchievementWall** | (同上 Tab) | 成就墙 |
| **PetMemoryAlbumPanel** | (同上 Tab) | 萌宠相册 |
| **SoulPicker** | 右键 → 选择灵魂 | 6 族群灵魂切换 |
| **PetBreedingPanel** | 右键 → 社交繁育 | 邀请好友的萌宠繁育 |

#### 5.1.1 WardrobePanel 衣柜

打开后看到三栏：
- 左：**当前装备**（3D 预览 + 名称）
- 中：**已拥有皮肤网格**（搜索 + 标签筛选）
- 右：**Marketplace 入口**（浏览 + 上架 + 收入）

操作：
- 点击皮肤卡片 → "装备" 按钮 → 浮球瞬间切换外观
- 自创皮肤右上角有 "上架" → 跳到 MarketplaceListingModal

#### 5.1.2 PetCreatorPanel 创作

3 个 Tab：
- **文生 3D**：输入描述（如 "穿着实验袍的赛博狐"）→ 选 Provider（Meshy / Hunyuan3D）→ 提交（需 200-500 AXP）
- **图生 3D**：上传照片 → 自动转 3D（需 500 AXP）
- **多形态生成**（v0.2.0+）：一次生成 living/pro/economy 三种形态变体

进度条 + 通知：任务进入队列后右下角通知，完成后自动入衣柜。

### 5.2 对话与会话（5 个）

| 面板 | 入口 | 用途 |
|------|------|------|
| **ChatPanel** | 双击浮球 | 主对话界面 |
| **TabBar** | ChatPanel 顶部 | 多会话切换 |
| **HistoryPanel** | ChatPanel 历史按钮 | 跨会话搜索 |
| **PlanPanel** | Plan 模式自动展开 | 多步任务计划 |
| **ApprovalModal** | 高风险动作触发 | L1/L2/L3 审批 |

### 5.3 经济与社交（5 个）

| 面板 | 入口 | 用途 |
|------|------|------|
| **AgentEconomyPanel** | More → Agent Economy | 6 个 Tab：Overview / Transactions / A2A / Skills / AXP / Skin GMV |
| **CheckinModal** | AXP 角标 → 签到 | 每日签到 +20 AXP |
| **SocialPanel** | 右键 → 社交 | Coraising / Greeting / Mimic |
| **MarketplaceBrowser** | 衣柜 → 市场 | 浏览皮肤 / 技能 / 任务 |
| **MarketplaceListingModal** | 衣柜 → 上架 | 自创皮肤上架 |

#### 5.3.1 AgentEconomyPanel

```
[Overview Tab]            ← 余额 + 信用分 + 总收入
[Transactions Tab]        ← 交易流水
[A2A Tab]                 ← Agent 协作时间线
[Skills Tab]              ← 已装技能
[AXP Tab]                 ← 积分 / 档位 / 兑换
[Skin GMV Tab]            ← 自创皮肤销售情况
```

**空状态修复（v0.2.0）**：用户没创建主宠时，Overview Tab 显示引导卡片 `✨ 创建/选择主宠`，点击后**先关闭 Economy 面板再打开 PetCreator**（v0.1.x 之前会同时显示导致重叠）。

### 5.4 工作流与开发（5 个）

| 面板 | 入口 | 用途 |
|------|------|------|
| **MemoryPanel** | More → Memory | 长期记忆查询 / 编辑 |
| **MemoryWikiPanel** | More → Wiki | 知识库浏览 |
| **TaskLogPanel** | More → Work Log | 任务日志（含工具调用） |
| **WorktreePanel** | More → Worktree | Git 多分支并行 |
| **SkillCanvasPanel** | More → Skill Canvas | 技能图谱 |

### 5.5 系统与工具（3 个）

| 面板 | 入口 | 用途 |
|------|------|------|
| **SettingsPanel** | 右键 → 设置 | 全局设置 |
| **NotificationCenter** | 顶栏 🔔 | 系统通知 |
| **DeepOsPanel** | More → DeepOS | 系统集成 |

### 5.6 创作中心（合一）

`CreatorStudioHub` 整合了 PetCreator / VideoStudio / PosterWorkshop / WardrobeMimic 四个工坊在一个 Tab 容器里。入口：右键 → 创作中心。

---

## 6. 全局快捷键

> 在任意窗口都可以触发，无需聚焦 Agentrix。

| 快捷键 | 功能 |
|--------|------|
| `Ctrl + Shift + S` | 切换 Pro Mode |
| `Ctrl + Shift + A` | 推动语音（按住） |
| `Ctrl + K` | 打开 Spotlight（轻量提问） |
| `Ctrl + Space` | Living Agent (Compact) 切换 |
| `Ctrl + Shift + Space` | Pro Mode 切换 |
| `Ctrl + N`（Pro 内）| 新对话 Tab |
| `Esc`（Pro 内）| 关闭面板 |
| `F11`（Pro 内）| 全屏 |
| `Ctrl + Shift + F`（Pro 内）| 跨会话搜索 |

如果某个快捷键被其他应用占用，去 `Settings → Hotkeys` 自定义（待补 UI）。

---

## 7. 隐私与遥测

### 7.1 默认值（v0.2.0+）

| 项 | 默认 |
|----|------|
| **匿名遥测** | ❌ 关闭 |
| **崩溃报告** | ✅ 开启（仅含设备指纹哈希，不携带用户内容） |
| **本地数据** | 仅本机存储；不上传 |

### 7.2 修改设置

打开 `右键 → 设置 → Privacy`：

```
[发送匿名使用数据]    [○ 关 / ● 开]
匿名启动 / 登录 / 首次对话事件，
帮助我们改进 Agentrix。
崩溃报告独立机制，仅含设备指纹（始终上报）。
```

### 7.3 第 3 天 opt-in 弹窗

完成 onboarding 后第 3 天，右下角会弹一次温和的 toast：

```
帮助我们改进 Agentrix
是否愿意分享匿名使用数据？崩溃报告独立机制，
仅含设备指纹。

[开启]   [先不用]
```

无论选哪个，**只显示一次**。

### 7.4 可上报的事件清单

opt-in 后会上报以下 6 类（其他都不上报）：

| 事件 | 何时触发 | 字段 |
|------|---------|------|
| `desktop_launch` | 每次启动 | platform, is_first_run |
| `desktop_login` | 登录成功 | method (email/wallet/qr/manual) |
| `desktop_onboarding_complete` | onboarding 完成 | (无额外字段) |
| `desktop_first_chat` | 首次对话发送 | mode (ask/agent/plan) |
| `desktop_first_pet_view` | 首次看到浮球 | (无额外字段) |
| `desktop_form_switch` | 形态切换 | from, to, open |

> 服务端字段白名单详见 [`backend/src/modules/desktop-lifecycle/desktop-analytics.service.ts`](../backend/src/modules/desktop-lifecycle/desktop-analytics.service.ts) 的 `PROP_KEY_WHITELIST`。任何不在白名单内的字段会被丢弃。

### 7.5 删除我的数据

发邮件到 `privacy@agentrix.top`，提供你的 device_id（在 Settings → About 显示），我们会在 7 天内从 `agentrix_desktop.crash_records` / `analytics_events` 中删除。

---

## 8. 自动更新

### 8.1 检查频率

启动后 30 秒自动向 `api.agentrix.top/api/desktop/update/...` 发请求。失败静默，下次启动重试。

### 8.2 灰度发布

新版本通常先以 10% 灰度发布 3 天，稳定后扩到 100%。你可能比群里的人更早或更晚收到通知，这是正常的。

### 8.3 收到更新提示

通知中心会显示：

```
🎉 新版本 v0.2.1 可用
包含 bug 修复与新功能。点击立即更新自动安装。
[立即更新]
```

点击后：
1. 后台下载 NSIS 包到临时目录
2. 自动校验 ed25519 签名
3. 显示 "正在下载更新…" toast
4. 下载完成 → 自动重启安装

签名校验失败会显示错误 toast 并中止（防中间人攻击）。

### 8.4 手动检查

`右键 → 设置 → About → Check for Updates`（按钮）。

### 8.5 渠道

默认是 `stable`。如果想加入 `beta`：

```
右键 → 设置 → About → Channel → [stable | beta | dev]
```

切到 beta 后会更频繁收到新版本（含未稳定特性）。

---

## 9. 故障排除

### 9.1 安装阶段

| 问题 | 解决 |
|------|------|
| SmartScreen 红屏 | 详细信息 → 仍要运行（v0.2.x 期间） |
| 杀毒软件拦截 | 暂时关闭杀毒，安装后加白名单 |
| WebView2 缺失 | 安装器自动下载，约 100 MB；可手动从 Microsoft 下载 |
| 安装到 D 盘失败 | NSIS 默认装到 `LocalAppData`，目前不支持自定义；需要的话装到默认位置后用 mklink |

### 9.2 启动阶段

| 问题 | 解决 |
|------|------|
| 黑屏 / 卡 splash | DevTools (Ctrl+Shift+I) 看 console，多半是网络问题 |
| 80×80 隐形方块 | v0.2.0 已修；如果发生，关掉重启 |
| 浮球不显示 | `agentrix-desktop.exe --reset-position` 或删 `%APPDATA%\Agentrix Desktop\config.json` |

### 9.3 登录阶段

| 问题 | 解决 |
|------|------|
| 邮箱 OTP 收不到 | 检查垃圾邮件；联系运营手动发 |
| 二维码扫不上 | 移动端 Agentrix App 版本 < 1.0 不兼容；升级到最新 |
| 钱包连不上 | MetaMask 锁定状态时连接会失败；解锁后重试 |

### 9.4 浮球阶段

| 问题 | 解决 |
|------|------|
| 浮球被任务栏遮 | 拖到屏幕中央 / `Ctrl + Space` 重置位置 |
| 浮球到屏幕外了 | v0.2.0 启动时会自动归位（拔副屏后） |
| 多显示器 DPI 错位 | v0.2.x 已修；如果还是异常，文件 issue |
| 双击没反应 | 重启 Agentrix；确认 webview2 没崩溃 |

### 9.5 对话阶段

| 问题 | 解决 |
|------|------|
| Tier 选 "本地" 但报错 | 本地模型未下载；Settings → Local LLM → 下载 Gemma-4 7B |
| 流式中途断开 | 网络抖动；点 "重试" 按钮 |
| 工具调用卡住 | 看 Work Log → 取消正在运行的工具 |
| 模型回复 "我是 Gemini" 等错误身份 | v0.2.0 已用 system prompt 修复；如果还有，提交 issue + 截图 |

### 9.6 萌宠 / 经济阶段

| 问题 | 解决 |
|------|------|
| 3D 灵狐没渲染 | 显卡可能太老；自动降级 PNG（正常） |
| 切 Pro 灵狐没变 | 等几秒；网络慢的话切到 PNG fallback |
| AXP 不增加 | 检查右键 → 设置 → Privacy → 看 token 是否过期 |
| 衣柜空 | 默认会绑定 Kitsune 灵狐；如果没有，重启或联系运营 |

### 9.7 自动更新阶段

| 问题 | 解决 |
|------|------|
| 通知不弹 | 检查灰度桶；可能没轮到你 |
| 下载失败 | 网络问题；下次启动重试 |
| 安装后版本号没变 | 没真重启；任务管理器杀 agentrix-desktop.exe 再启动 |
| 想回滚 | 卸载后从 `agentrix.top/downloads/desktop/archive/` 装老版本 |

### 9.8 隐私阶段

| 问题 | 解决 |
|------|------|
| 怎么验证遥测真的关了 | DevTools → Network → Filter `analytics`；启动后无请求 |
| 崩溃报告关不掉 | 暂不支持；只含设备指纹哈希（无内容） |
| 想删历史数据 | 邮件 `privacy@agentrix.top`（见 §7.5） |

### 9.9 收集诊断信息

如果上面都没解决，请提交 issue 时附：

1. **版本号**：右键 → 设置 → About
2. **device_id**：同上
3. **崩溃日志**：`%APPDATA%\Agentrix Desktop\crash-logs\` 最新 .json 文件
4. **DevTools 截图**：`Ctrl + Shift + I` → Console 红色错误
5. **OS 版本**：`winver` 命令

发到 `support@agentrix.top` 或 GitHub issue。

---

## 附录 A：技术架构（对开发者好奇者）

```
┌─ 桌面端 (Tauri 2.0 + Rust) ─┐
│  UI: React 19 + Vite        │
│  3D: three.js + @pixiv/three-vrm
│  IPC: Tauri commands         │
└─────────────┬────────────────┘
              │ HTTPS
              ▼
┌─ 后端 (NestJS + Postgres) ──┐
│  schema agentrix_desktop:    │
│   - releases (auto-update)   │
│   - crash_records            │
│   - analytics_events         │
│  schema public:              │
│   - users / agents / pets …  │
└──────────────────────────────┘
```

详细 PRD：[docs/desktop-prd-v3.md](desktop-prd-v3.md)
跨端 PRD：[docs/agentrix-cross-platform-prd-v4.md](agentrix-cross-platform-prd-v4.md)

---

## 附录 B：版本历史

| 版本 | 日期 | 主要变化 |
|------|------|---------|
| v0.1.0 | 2026-04-15 | 首次内部 build |
| v0.1.1 | 2026-04-30 | Living Agent 形态 |
| v0.1.2 | 2026-05-15 | Sprint G-1：浮球右键修复 + Splash + Economy 跳转 |
| **v0.2.0** | **2026-05-16** | **Sprint G-2：自动更新 + 崩溃 + 遥测 opt-in + VRM + 多显示器** |
| v0.2.1 | 待发 | Sprint G-3：内测反馈 P0/P1 修复 + 代码签名 |
| v1.0.0 | 待发 | GA 公开发布 |

---

> 本手册由 Agentrix 团队维护。错误反馈 / 改进建议：[docs Issues](https://github.com/CutaGames/Agentrix/issues) 或 `docs@agentrix.top`。
