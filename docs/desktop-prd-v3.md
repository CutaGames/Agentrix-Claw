# Agentrix 桌面端 PRD v3.0（Desktop）

> **桌面 = 战场**：Pro Mode 深度编码 + Living Agent 陪伴编程的双形态工作台。
>
> 本文件只写桌面端实现，不重写跨端层。所有跨端契约（主宠状态机、Handoff、审批路由、钱包、经济、系统助手共生）引用顿领 PRD `agentrix-cross-platform-prd-v3.md`。

- 版本: v3.0（上接 `_archive/desktop-prd-v2.1.md`）
- 定位: 工作台 + Living Pet 双形态
- 技术栈: Tauri 2.0 + React + Rust + Live2D/矢量浮球
- 代号: ClawBall → 对外品牌: **Agentrix Desktop**
- 规划源: `plans/agentrix-cross-platform-prd-v3-fdc618.md` §3

---

## 0. 一句话定位 + 双形态

### 0.1 一句话定位

**Agentrix Desktop = Cursor / Windsurf / Claude Code 的 Pro Mode + Open-LLM-VTuber / 真桌宠的 Living Agent，二态同根，同一只主宠**。

### 0.2 双形态一览

| 形态 | 名字 | 目标用户 | 主视觉 | 默认热键 | 占屏比 |
|------|------|---------|-------|---------|--------|
| **Living Agent** | 情绪壳 / 陪伴壳 | 日常轻交互 / 非编码时段 / Prosumer | Live2D（P3） / 矢量浮球（P0） | `Cmd/Ctrl + Space` → 呼出 | 小窗 / 侧边 / 桌宠 |
| **Pro Mode** | 工作壳 / 专业壳 | 深度编码 / 长任务 / 开发者 | Multi-panel IDE 风 | `Cmd/Ctrl + Shift + Space` | 全屏 / 双屏 |

### 0.3 双形态切换契约

- **形态互斥**：同一时刻只有一个形态处于主显示位，另一个"折叠"为小标徽挂在任务栏 / 菜单栏。
- **共享主宠**：无论哪个形态，主宠 state（emotion / intimacy / memory）都来自顿领 §3.4 的统一状态机。
- **切换动画**：< 300ms，主宠表情保持不变，UI 淡入淡出。
- **退出时机**：Pro Mode 长任务结束 + 15 分钟无输入 → 自动建议"回到 Living Agent 形态"。

---

## 1. 三层愿景在桌面的体现

| 层 | 桌面主阵地 | 对应形态 | 关键能力 |
|----|-----------|---------|---------|
| **Living Agent** | 陪伴编程 / 情绪反馈 / 主动问候 | Living Agent 形态 | Live2D 化身、浮球、双击互动、亲密度动画 |
| **Doer** | 多 agent worktree、代码 diff、长任务 | Pro Mode 形态 | Skill Canvas、Composer、Tool Runner、Diff View |
| **Economy** | 经济面板 read-only 投影 | 侧边 AgentEconomyPanel（两形态共用） | 余额 / Auto-Earn / A2A 时间线 |

---

## 2. 现状基线（从 v2.1 继承）

### 2.1 已落地能力

- **Tauri 2.0 主框架**：跨 macOS / Windows / Linux。
- **语音优先 UX**：全局热键 + 浮球 + 语音识别。
- **多 Agent 编排基础**：研究 / 写作 / 审核流水线雏形。
- **代码 diff 视图**：基于 Monaco Editor + unified diff。
- **本地文件系统集成**：受限目录 read/write。
- **Live2D 状态**：尚未引入可编译的 Cubism runtime / 模型资源；P3 仍需单独接入。

### 2.2 已知缺口

| 缺口 | 严重性 | 目标修复节点 |
|------|--------|-------------|
| 无双形态切换，Pro Mode 与 Living Agent 混杂 | 高 | P0 |
| 主宠状态机未对齐顿领 §3.4 | 高 | P0 |
| Handoff 协议未实装 | 高 | P0 |
| Auto-Earn / A2A 可视化缺失 | 中 | P2 |
| Live2D runtime / 模型 / renderer 尚未接入 | 中 | P3 |
| 系统助手兜底（Spotlight / Raycast 扩展）缺失 | 低 | P2 |

### 2.3 与 v2.1 的主要差异

| 维度 | v2.1 | v3.0 |
|------|------|------|
| 形态 | 单一「悬浮 + 专业」叠加 | **明确双形态**，互斥切换 |
| 主宠 | 浮球 emoji | Live2D（P3） / 矢量浮球（P0） + 情绪状态机 |
| 跨端 | 粗粒度"同步" | **走顿领 5 主路径**，明确 trust 模型 |
| Agent 经济 | 账户概念存在，UI 不完整 | Panel 完整（两形态共用） |
| 系统助手 | 未涉及 | Spotlight / Raycast / URL Scheme 浅集成 |
| 目标用户 | 碎片指令者 / 深度创作者 | + Prosumer 陪伴编码者 |

---

## 3. 竞品对标（桌面视角）

### 3.1 对标矩阵

| 对手 | 优势 | Agentrix Desktop v3 的回答 |
|------|------|--------------------------|
| **Cursor** | Agent 编辑、Composer | 我们有 **Living Agent 陪伴** + 跨端 + Economy |
| **Windsurf** | Cascade / 长任务 | 我们的 Pro Mode 等价 + 主宠陪伴 |
| **Claude Code** | 终端级 agent、planning | 我们提供 UI-first + 主宠调度多 agent |
| **Codex Desktop** | OpenAI 纯正 | 我们支持多 provider + 本地模型 + Economy |
| **Replit Agent** | Web-first | 我们 desktop-first + 跨端 |
| **Open-LLM-VTuber** | 桌宠 + 情感 | 我们叠加 Codex 级 Doer + Economy |
| **AIRI / Miracle** | 真桌宠玩具向 | 我们严肃 Prosumer + 专业工作台 |
| **ChatGPT Desktop** | 品牌 + 语音 | 我们跨端 + 可定制 working agents + Economy |
| **Raycast / Alfred** | 启动器 / Extension | 我们作为 extension 接入，互补不竞争 |
| **Rewind.ai** | 记忆 / 搜索 | 我们跨端记忆 + 主宠人格化记忆 |

### 3.2 差异化三板斧

1. **双形态同根**: Living Agent 与 Pro Mode 共享同一主宠、同一记忆、同一经济账户。Cursor 没有宠物壳，Open-LLM-VTuber 没有 Codex 级 Doer。
2. **跨端 Handoff 真做**: 桌面 Pro Mode 写一半，手机接力继续；手表心率反馈影响主宠情绪。对手最多 Web↔Desktop。
3. **Agent 经济可视化在桌面**: AgentEconomyPanel 显示每个 working agent 的 Auto-Earn、A2A 收入、任务时间线。Cursor / Windsurf 没有经济层，Phantom 没有工作台。

---

## 4. 双形态详规

### 4.1 Living Agent 形态（情绪壳）

#### 4.1.1 UI 布局

```
┌─────────────────────────────────────────┐
│   [ 主宠 Live2D / 浮球 ]                 │  <- 可拖拽到任意位置
│        💬 "还好吗？要喝点水吗？"           │  <- 气泡（可选）
│                                          │
│  ┌──────────────────────────────────┐   │
│  │  对话小窗（默认折叠）              │   │
│  │  [输入框] [语音按钮]              │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

#### 4.1.2 主宠展示

- **P0 浮球**: 可拖拽 SVG/Canvas 矢量浮球，6 种表情（§3.4 顿领）+ 呼吸动画 + 点击主宠有反馈。
- **P3 Live2D**: 接入 `live2d-cubism-core` + 官方免费模型 / 合作模型，表情映射到 §3.4 的 emotion。
- **桌宠模式**: 置顶 / 穿透 / 拖拽 / 双击互动。可选"走动"模式（沿屏幕底部随机游走）。
- **躲避光标**: 鼠标靠近时浮球自动避让，不挡操作。

#### 4.1.3 主动行为（受 Vitals + 时间触发）

- 连续 2h 无休息 → 主宠冒泡 "休息一下吧?"
- 心率突增（Watch 数据） → 主宠 `concerned` + "还好吗?"
- Auto-Earn 收入 → 主宠 `excited` + "今天赚了 $X.XX"
- 深夜 23:00 后持续使用 → 主宠 `tired` + 建议明天继续
- 日历将开会 → 主宠 `focused` + "10 分钟后 XX 会议"

**默认打扰频率**: < 1 次 / 30min，用户可调 0 / 低 / 中 / 高。

#### 4.1.4 轻量对话小窗

- 默认折叠为气泡（右下角）。
- 展开后支持文本 + 语音。
- 对话内容 < 500 字时保持 Living Agent，超过或涉及代码 → 自动建议 "转 Pro Mode?"。

#### 4.1.5 Pokémon 式 agent 出场（顿领 §3.7）

- 主宠决定派遣时，working agent 头像从屏幕右下滑入，停留 1.2s，展示人格签名，进入 Pro Mode 或后台执行。
- 执行完毕 → agent 退场 → 主宠总结一句。

### 4.2 Pro Mode 形态（工作壳）

#### 4.2.1 UI 布局（IDE 风 3 栏）

```
┌────────────┬──────────────────────┬──────────────┐
│  左侧:     │  中间主编辑区         │  右侧:        │
│  项目树    │  (Monaco / Terminal) │  Agent Team  │
│  技能面板  │                      │  Task 时间线  │
│  Skill     │                      │  Diff 视图   │
│  Canvas    │                      │  主宠小标徽   │
└────────────┴──────────────────────┴──────────────┘
   ↑                                  ↑
   顶部:                              底部:
   - 文件菜单                         - 状态栏
   - Multi-Agent Worktree 切换        - Auto-Earn 实时数字
   - Handoff 接力按钮                 - 经济面板折叠入口
```

#### 4.2.2 Multi-Agent Worktree

- **灵感源**: Git Worktree + Cursor Composer。
- **并行 agents**: 用户可同时运行多个 working agent 在不同的工作区 tab。
- **隔离**: 每个 worktree 有独立的 memory context + 文件工作副本 + git branch。
- **切换**: `Cmd/Ctrl + 1/2/3` 快速切换。

#### 4.2.3 Skill Canvas（P2）

- 可视化流程图，用户拖拽 skill 节点组合工作流。
- 节点类型: HTTP / LLM call / File op / Terminal / Skill / Subagent call。
- 输出可保存为"用户自定义 agent 模板"，发布到 Skill Market。

#### 4.2.4 Code Diff 视图

- Monaco 左右 diff，接受 / 拒绝按钮逐 hunk 粒度。
- Accept All 前必须过 §5.2 L1 审批。

#### 4.2.5 Terminal / Tool Runner

- 集成终端（xterm.js + Rust PTY）。
- Working agent 可申请执行 shell 命令 → 用户审批（L1）→ 执行 → 日志回流到 agent memory。

#### 4.2.6 Agent Team Panel（右侧）

- 展示当前活跃 working agents 头像 + 任务状态（idle / running / waiting_approval / error）。
- 点击头像进入 agent 详情（记忆 / 权限 / 经济账户 read-only）。
- A2A 协作可视化：agent A 调用 agent B 时画箭头动画。

#### 4.2.7 Composer（P1）

- 类似 Cursor Composer，一句话描述需求 → agent 生成多文件 diff。
- 差异点: 主宠会对 Composer 结果做"人格化 review"（比如"这里可能影响性能哦"）。

#### 4.2.8 Memories（P1）

- 仿 Cursor 的 "Memories" 功能，但走顿领 §5.5 User Memory。
- 用户可手动添加、删除、固定 / 取消固定记忆。
- 所有 working agents 共享读此记忆，primary agent 可写。

### 4.3 双形态切换契约

#### 4.3.1 触发方式

| 起点 | 触发 | 结果 |
|------|------|------|
| Living Agent | 用户说 "打开 Pro Mode" / 按 `Cmd+Shift+Space` / 主宠建议 | 淡出浮球 → 淡入 Pro Mode 主窗 |
| Pro Mode | 用户按 `Esc + Esc` / 菜单"退出 Pro Mode" / 长时间 idle | 淡出 Pro Mode → 淡入 Living Agent 浮球 |

#### 4.3.2 状态继承

- 主宠 emotion / intimacy / memory: 共享。
- 当前对话 session: 共享。
- Pro Mode 的 Multi-Agent Worktree: 进入 Living Agent 时**不关闭**，后台继续跑，完成后主宠冒泡通知。
- Living Agent 的浮球位置: 切回后恢复上次位置。

#### 4.3.3 禁忌

- 禁止同时显示两个形态（主面板）。
- 禁止 Pro Mode 时浮球悬浮（浮球折叠为菜单栏图标）。
- 禁止 Living Agent 时 Pro Mode 面板保持前台（必须最小化到 Dock / 任务栏）。

---

## 5. Living Pet 在桌面的表达

> 引用顿领 §3 Living Pet 双层心智。本节只写桌面层表达细节。

### 5.1 表情映射（顿领 §3.4）

| 顿领情绪 | 桌面 Live2D 动作 | 桌面浮球动作 | 气泡内容举例 |
|---------|----------------|------------|------------|
| happy | 微笑 + 眨眼加速 | 绿色呼吸 + 上下浮动 | "做得不错!" |
| focused | 侧视专注 | 蓝色脉冲 | "[工作中]" 或静默 |
| concerned | 眉毛下压 + 微摇头 | 橙色闪烁 | "还好吗?" |
| tired | 眯眼 + 缓慢眨眼 | 灰色减速 | "休息一下?" |
| excited | 跳跃 + 张嘴 | 金色快速旋转 | "哇!" / "赚到了!" |
| calm | 默认 | 淡蓝静态 | 无 |

### 5.2 亲密度可视化（P3）

- Living Agent 形态下: 浮球外环厚度 = 亲密度 lv（0-10 渐变）。
- Live2D 解锁装扮: lv 3 解锁配饰、lv 5 解锁背景、lv 8 解锁特殊动作。
- 亲密度变动时: 短暂光环 + 数字提示。

### 5.3 主宠在 Pro Mode 的存在感

- **不打扰**: Pro Mode 下主宠隐身为右侧 Agent Team Panel 顶部的小标徽。
- **情绪反应保留**: 主宠 emoji 会变色，但不冒泡打扰编码。
- **主动只在关键时刻**: 任务结束 / 心率异常 / Auto-Earn 里程碑 / 代码评审被拒。

### 5.4 工作 agents 的独立表达

- Pro Mode 右侧 Agent Team Panel 每个 agent 有独立头像 + 人格签名。
- A2A 调用时画箭头动画 + 调用 reason 气泡。
- 出场动画: agent 任务开始时头像 + 名字从面板 slide in。

### 5.5 引擎切换（顿领 §3.8）

- 用户在 Pro Mode 菜单"主宠引擎 → 切换"，弹出 model picker（GPT-4o / Claude / Gemini / 本地）。
- 1-2s 换装动画（浮球 / Live2D 短暂光晕），表情不变。
- 切换后主宠下一句对话自然衔接最近 context（传入 recent_memory_snippets）。

---

## 6. 跨端联动（引用顿领 §5）

桌面只实现顿领 5 主路径的桌面端部分，不自建。

### 6.1 Handoff（顿领 §5.1）

- **触发**: 桌面 Pro Mode 任务跑 > 30s，所有在线端收到 Banner。
- **桌面 Banner 位置**: 顶部 toast（Living Agent 形态）/ 顶部 pill（Pro Mode 形态）。
- **三选项**: 接力 / 镜像 / 忽略。
- **接力实现**:
  - 当前桌面转 read-only，显示"任务已接力到 XX"。
  - 新端获取 `task_context_ref` + Memory snapshot。

### 6.2 Approval Routing（顿领 §5.2）

- **桌面可以发起 L0-L2 动作**，但 L2 必须引导到 Mobile 签名。
- **UI**: L2 动作触发时，桌面显示 modal "请到手机完成签名"，倒计时 5 分钟。
- **Mobile 签名后**: 桌面 modal 自动关闭，动作完成。
- **桌面自身只能做 L0+L1**（Trust = 1 或 2），永远不持有 MPC share。

### 6.3 Wallet（顿领 §5.3）

- **AgentEconomyPanel**（侧边）: Day / Week / Month 钱包投影，read-only。
- **余额 / 收入 / A2A 时间线 / Stripe 订阅**：完整展示。
- **签名请求**：点"提现"按钮 → 推送到 Mobile 补签（L2）。
- **两形态共用**：Living Agent 形态时可从菜单栏图标一键打开 Panel。

### 6.4 Vitals（顿领 §5.4）

- **桌面本身不是 Vitals source**（无心率传感器）。
- **但桌面订阅 Vitals**: 通过后端 Realtime 收到 Watch / Glass / Mobile 上报的信号。
- **反应**：心率突增 → 桌面主宠 `concerned` + 可选冒泡。久坐 → `tired` + 冒泡建议运动。

### 6.5 Memory（顿领 §5.5）

- **桌面是 Memory 的重要写源**：编码上下文、Pro Mode 会话、Skill Canvas 配置。
- **User Memory 写权限**：仅主宠 primary agent 可写，Pro Mode 下用户可手动添加。
- **Knowledge Base**: 拖拽文档到主宠或 Pro Mode 面板即可上传索引。

---

## 7. Agent 经济在桌面（引用顿领 §9）

### 7.1 AgentEconomyPanel

- **入口**: 两形态共用，菜单栏"💰"图标或侧边 dock。
- **Tab**: Overview / Per-Agent / A2A Timeline / Skills / Auto-Earn / Settings。

#### 7.1.1 Overview

```
┌──────────────────────────────────────┐
│  主账户余额: $128.50 (USDC) + 1200 ¥  │
│  今日 Auto-Earn: +$2.40                │
│  本月累计: +$87.30                     │
│  活跃 Agents: 3  | A2A 交易: 12 次     │
└──────────────────────────────────────┘
```

#### 7.1.2 Per-Agent

- 每个 working agent 的独立卡片：头像 / 名字 / AgentAccount 余额 / 本月收入。
- 点击进入详情：Skill 列表 / 任务历史 / Commission 规则。

#### 7.1.3 A2A Timeline

- 时间线展示 agent-to-agent 调用：发起 / 完成 / 金额 / 相关 skills。
- 跨用户 A2A 特别标记（对方 user 匿名化）。

#### 7.1.4 Skills

- 本地已装 skills + Skill Market 快速进入。
- 每个 skill 的贡献收入 + SplitPlan 配置。

#### 7.1.5 Auto-Earn

- 时序图（日 / 周 / 月）+ 最近一周小时分布。
- 异常检测提示（突降 / 突增）。

#### 7.1.6 Settings

- 订阅管理（Stripe，read-only，改订阅引导到 Web Console）。
- 税务 / 对账单下载（跳 Web Console）。

### 7.2 桌面发起的经济动作

| 动作 | 风险 | 在桌面完成 | 需 Mobile 协签 |
|------|------|----------|--------------|
| 查看余额 / 报表 | L0 | ✅ | × |
| 安装 Skill（免费） | L1 | ✅ | × |
| 购买 Skill（Stripe） | L1-L2 | Stripe Checkout | L2 时需协签 |
| 提现 USDC | L3 | × | ✅ 必须 Mobile + 协签 |
| 配置 SplitPlan | L1 | ✅ | × |
| 修改 CommissionV2 | L1 | ✅ | × |
| 启动 Auto-Earn 挂单 | L1 | ✅ | × |

---

## 8. 用户画像与核心流程

### 8.1 画像

- **陪伴编码者（新增）**: Prosumer，每天 6-10h 坐桌前，想要一只有情绪反应的伙伴。
- **碎片指令者**: 工作中随时呼出，语音指令，3 秒完成。
- **深度创作者**: 多 agent 编排、代码 diff、长任务、Skill 开发。
- **企业开发者**: 本地调试 + 团队共享 skill + BudgetPool。

### 8.2 Day-in-the-life 流程

```
09:00  启动电脑 → 主宠浮球出现 → 气泡"早上好!"
       → 浮球显示 calm → 用户双击 → 展开对话 → 语音"帮我看看今天日程"
       → 主宠派 summarize-day agent（出场动画）→ 15s 后回答

10:30  决定开始写代码 → Cmd+Shift+Space → 切换 Pro Mode
       → Multi-Agent Worktree 打开上次的 3 个 worktree
       → 主宠变小标徽在右上 → focused emoji

11:45  Composer 请求: "重构 auth 模块"
       → agent 生成 diff → 用户逐 hunk review
       → L1 审批 → Accept All
       → 主宠 excited + "做得漂亮!"

13:00  午饭 → 手机发起 Handoff "继续看下午议题"
       → 桌面转 read-only
       → 回来后 Pro Mode 恢复 + Handoff back

15:30  心率异常（Watch 推）→ 主宠 concerned + "还好吗?"
       → 用户回"没事，咖啡" → 主宠笑了下继续

18:00  Auto-Earn 到账 $3.20 → 主宠 excited + 闪烁
       → 用户在 AgentEconomyPanel 查看明细

21:00  退出 Pro Mode → 回到 Living Agent 形态
       → 主宠 tired + "今天辛苦啦"
```

### 8.3 核心流程清单

| 编号 | 流程 | 涉及顿领 § |
|-----|------|----------|
| F1 | 首次安装 + 主宠引导 | §3、§4 |
| F2 | 日常唤出 / 对话 | §3 |
| F3 | 双形态切换 | §4.3 本文件 |
| F4 | Multi-Agent Worktree 开启 | §4.2.2 本文件 |
| F5 | Composer 生成多文件 diff | §4.2.7 本文件 |
| F6 | Handoff 发起 / 接受 | 顿领 §5.1 |
| F7 | L2 支付引导到手机 | 顿领 §5.2 |
| F8 | Auto-Earn 监控 | 顿领 §9 |
| F9 | Skill 购买 / 发布 | 顿领 §9 |
| F10 | 退出 + 后台任务继续 | §4.3.2 本文件 |
| F11 | 引擎切换 | 顿领 §3.8 |
| F12 | 记忆添加 / 删除 | 顿领 §5.5 |

---

## 9. 数据 / 通信契约（引用顿领 §7）

### 9.1 桌面客户端订阅的 Topics

- `user.{user_id}.presence` – heartbeat + 主端切换
- `user.{user_id}.pet.state` – 主宠状态
- `user.{user_id}.handoff` – Handoff 请求
- `user.{user_id}.approval` – 审批请求（桌面仅显示 L0-L2 提示）
- `user.{user_id}.wallet` – 钱包变动
- `user.{user_id}.agent.*.event` – 工作 agent 任务事件
- `user.{user_id}.economy.event` – 经济事件

### 9.2 桌面本地存储

| 数据 | 存储 | 加密 | TTL |
|------|------|------|-----|
| Session memory | SQLite（Tauri app dir） | AES-256-GCM | 30 天 |
| Agent memory cache | SQLite | AES-256-GCM | 7 天 |
| 浮球位置 / 窗口布局 | JSON（user prefs） | × | 永久 |
| Skill 本地缓存 | App dir | × | 用户清 |
| Knowledge base 索引 | sqlite + 向量（Tantivy / Faiss） | AES-256-GCM | 永久（用户可删） |
| 生物认证 / 私钥分片 | ❌ 桌面永不持有（顿领 §8.2） | – | – |

### 9.3 Realtime 降级

- WebSocket 优先 → SSE 回退 → 离线时本地队列 + 上线 flush。
- 离线 > 24h 服务端只保留 state snapshot，不补发细粒度 event（对齐顿领 §7.2）。

### 9.4 Tauri 2.0 IPC 命令清单

| 命令 | 方向 | 用途 |
|------|------|------|
| `launch_app` | frontend → rust | 启动第三方 app（系统助手 B 模式兜底） |
| `write_clipboard` | bi | 剪贴板读写 |
| `exec_shell` | frontend → rust | Pro Mode Terminal（受 L1 审批） |
| `read_file` / `write_file` | frontend → rust | 文件操作（受 L1 审批） |
| `show_notification` | frontend → rust | 系统通知 |
| `toggle_petbubble` | bi | 浮球显隐切换 |
| `open_url` | frontend → rust | 浏览器打开（Handoff 到 Web 时） |

---

## 10. 安全模型（引用顿领 §8）

### 10.1 桌面 Trust 等级

- **Trust 0**: 未登录 → 仅 Marketing 页面。
- **Trust 1**: 登录邮箱 OTP → 可使用 Living Agent + 只读 Pro Mode。
- **Trust 2**: 设备绑定（首次安装扫码配对 Mobile）→ 可执行 Pro Mode 全部 L0+L1。
- **Trust 3**: 桌面**永远不升级到 3**（MPC share 永不落桌面）。

### 10.2 文件系统 / Terminal 权限

- **文件操作**：沙盒到用户声明的项目根目录（Tauri allowlist），越权需 L1 审批。
- **Shell 执行**：Pro Mode 专用，每条命令前展示预览 + L1 审批。Danger commands（rm -rf / sudo / curl | sh）硬阻断。
- **AccessibilityAPI**：桌面不使用（移动端才用，见 `mobile-prd-v3.md` §10）。

### 10.3 本地加密

- SQLite 数据库加密（SQLCipher）。
- 密钥存储: macOS Keychain / Windows Credential Manager / Linux Secret Service。

### 10.4 自启 / 后台

- 自启: 默认关闭，用户主动开。
- 后台: Living Agent 浮球常驻可选。Pro Mode 关闭后后台任务继续 30 分钟（Handoff 等待窗口）。

### 10.5 更新机制

- Tauri Updater + 签名校验。
- 渐进式灰度：5% → 25% → 100%。

---

## 11. 非功能需求

### 11.1 性能

| 指标 | 目标 |
|------|------|
| 冷启动到浮球显示 | < 1.5s |
| Pro Mode 打开 | < 2.5s |
| 浮球拖拽 FPS | ≥ 60 |
| Live2D 平均 FPS | ≥ 45（P3） |
| Multi-Agent Worktree 切换 | < 500ms |
| 编辑器输入延迟 | < 50ms |
| 后台 CPU（Living Agent idle） | < 3% |
| 后台 CPU（Pro Mode idle） | < 8% |

### 11.2 包大小

- macOS DMG < 80 MB（不含 Live2D 模型，模型按需下载）
- Windows NSIS < 90 MB
- Linux AppImage < 100 MB

### 11.3 跨平台

- macOS 12+（Intel + Apple Silicon 双架构）
- Windows 10+（x64）
- Ubuntu 20.04+ / Fedora 36+（AppImage）

### 11.4 离线能力

- Living Agent 浮球完全离线可用（仅不对话）。
- Pro Mode 本地模型可选（Ollama / LM Studio 桥），P3 内置 minimal model。
- 离线时 Handoff / 审批 / 经济面板为 read-only。

### 11.5 系统集成（Spotlight / Raycast / URL Scheme）

- **macOS Spotlight**: 注册"Agentrix"关键词，快速呼出浮球。
- **Raycast Extension**: P2 发布官方扩展，包含 10 个常用命令。
- **URL Scheme**: `agentrix://open?path=...`, `agentrix://agent/{id}/invoke?task=...`。
- **不做原生 Siri 集成**: macOS Shortcuts 支持度有限，见顿领 §6.10。

---

## 12. 实施路线图（引用顿领 §10 桌面列）

### 12.1 桌面路线图对齐顿领

| 阶段 | 桌面任务 | 与顿领路线图映射 |
|------|---------|---------------|
| **P0 (3w)** | 双形态 MVP + 真桌宠矢量浮球 + 主宠状态机 v1（6 表情） + Handoff 接受方 + Pro Mode 基础 | 顿领 §10.1 "P0 跨端骨架" Desktop 列 |
| **P1 (4w)** | Multi-Agent Worktree + Composer + Memories + Handoff 发起 + Live Activity 桌面通知中心 | 顿领 §10.1 "P1 Pro Mode 升级" Desktop 列 |
| **P2 (3w)** | Skill Canvas + Auto-Earn 可视化 + A2A Timeline + AgentEconomyPanel 完整 + Raycast Extension | 顿领 §10.1 "P2 Doer + 经济" Desktop 列 |
| **P3 (4w)** | Live2D 接入 + 视觉感知（屏幕截图 agent） + 亲密度 v2 + 离线本地模型 + Pet SDK 对外开放 | 顿领 §10.1 "P3 壁垒强化" Desktop 列 |

### 12.2 P0 Gate

- [ ] Living Agent / Pro Mode 双形态互斥切换
- [ ] 主宠 6 表情状态机对接 `user.{user_id}.pet.state` topic
- [ ] Handoff 接受方完整（桌面收到 Banner 能接管）
- [ ] Pro Mode 能跑多 agent + 基础 diff
- [ ] AgentEconomyPanel read-only 余额可见
- [ ] Trust 2 设备绑定流程跑通
- [ ] 冷启动 < 1.5s，Pro Mode 打开 < 2.5s

### 12.3 桌面专属里程碑

| 时间 | 里程碑 |
|------|-------|
| P0 W1 | 双形态切换 demo + 主宠浮球状态机 |
| P0 W3 | Handoff 接受 + AgentEconomyPanel MVP |
| P1 W2 | Multi-Agent Worktree |
| P1 W4 | Composer + Memories |
| P2 W1 | Skill Canvas alpha |
| P2 W3 | Auto-Earn + A2A 可视化 |
| P3 W2 | Live2D 接入 + 3 款免费模型 |
| P3 W4 | Pet SDK 开放文档 |

---

## 13. 成功指标

### 13.1 桌面专属指标

| 指标 | P0 目标 | P3 目标 |
|------|--------|--------|
| 周活 WAU | 300 | 8000 |
| 日活 DAU | 100 | 3000 |
| 双形态使用占比 | Living 80% / Pro 40%（重叠 20%） | Living 70% / Pro 60%（重叠 30%） |
| Pro Mode 长任务 / 用户 / 周 | 1 | 8 |
| 主宠亲密度中位数 | lv 1 | lv 5 |
| 安装保留（Day-7） | 35% | 55% |
| 安装保留（Day-30） | 20% | 40% |

### 13.2 与顿领指标的关系

- **Cross-Surface DAU** 贡献：桌面是"战场"端，预计贡献 30% 跨端用户。
- **Handoff 次数**：桌面既是起点也是终点，期望 P3 每用户每周 5+ 桌面相关 handoff。
- **Auto-Earn MRR**：桌面是 Skill 开发主战场，P3 贡献 45% 的 Skill Market GMV。

---

## 14. 风险与依赖

### 14.1 风险

- **双形态切换体验**: 切换太频繁用户会烦，切换太慢体验僵硬。目标 < 300ms + 用户可定义默认形态。
- **Live2D 模型版权**: 商业用途需授权，P3 接入时必须走合作模型或自建。
- **Multi-Agent Worktree 资源消耗**: 多个 agent 并行占内存。目标 3 个 agent 总内存 < 1.5 GB。
- **本地模型集成稳定性**: Ollama / LM Studio 接口变动风险，P3 内置 bundled minimal model 降级。
- **Tauri 2.0 生态**: 相对 Electron 生态小，某些原生能力需自写 Rust。
- **跨端 Handoff 可靠性**: Realtime 通道不稳定时降级为 polling + 明示用户。
- **Raycast 审核**: 扩展审核周期 2-4 周，P2 提前递交。

### 14.2 依赖

- **顿领 PRD 所有章节落地**。
- **后端事件总线 + 5 主路径 API**。
- **Live2D 模型采购 / 授权**（P3）。
- **Apple Notarization / Windows Code Signing** 证书。
- **Stripe Checkout URL 合规**。

---

## 15. 附录

### 15.1 与其他 PRD 的关系

本文件只写桌面端实现。跨端层约束全部引用顿领 `agentrix-cross-platform-prd-v3.md`：

| 引用来源 | 顿领 § | 桌面本文件 § |
|---------|--------|------------|
| Living Pet 双层心智 | §3 | §5 |
| 5 主路径 Handoff / Approval / Wallet / Vitals / Memory | §5 | §6 |
| 系统助手共生战略 | §6 | §11.5 仅兜底 |
| 数据契约 / Topics / API | §7 | §9 |
| 安全模型 / MPC / Trust | §8 | §10 |
| Agent 经济 / AgentAccount / Auto-Earn / SplitPlan | §9 | §7 |
| 整体路线图 Desktop 列 | §10 | §12 |

**Deviations from 顿领**: 无。本文件完全遵守顿领契约。

### 15.2 术语表（桌面专属）

| 术语 | 含义 |
|------|------|
| **Living Agent 形态** | 桌面陪伴壳，浮球 / Live2D 为主 |
| **Pro Mode 形态** | 桌面工作壳，IDE 风 3 栏布局 |
| **Multi-Agent Worktree** | 并行多 agent 工作区，灵感源 git worktree + Cursor Composer |
| **Composer** | 一句话生成多文件 diff 的 agent 模式 |
| **Skill Canvas** | 可视化 skill 组合流程图 |
| **AgentEconomyPanel** | 桌面侧边的 agent 经济面板（read-only） |
| **Pokémon 式出场** | Working agent 任务开始时的短暂 1.2s 入场动画 |
| **引擎切换** | 替换驱动主宠的 primary agent LLM，不影响灵魂 |

### 15.3 与 v2.1 的详细 diff

```
删除:
- v2.1 "1.1 Agentrix 全端矩阵" 表格 → 合入顿领 §1
- v2.1 "独立 Web 管理控台"段落 → 合入 web-prd-v3
- v2.1 "可穿戴触发桌面 Agent 执行"段落 → 合入 wearable-prd-v3

新增:
- 明确双形态（Living Agent / Pro Mode）
- 主宠状态机对齐顿领 §3.4
- AgentEconomyPanel 完整规划
- Spotlight / Raycast 系统集成浅层
- 引擎切换 UX
- Pokémon 式 agent 出场

重写:
- "跨端协同"段落全部改为引用顿领 §5
- "安全模型"段落全部改为引用顿领 §8
- "用户画像"增加 "陪伴编码者" 新角色
```

### 15.4 版本历史

| 版本 | 日期 | 主要变更 |
|------|------|---------|
| v1.0 | 2026-03-08 | 初版 |
| v2.0 | 2026-04-01 | 双模（语音 + 专业）叠加 |
| v2.1 | 2026-04-15 | 跨端矩阵扩展 |
| **v3.0** | **2026-05-04** | **双形态互斥 + 对齐顿领契约 + Agent 经济完整 + 系统助手浅集成** |

---

**文档结束。下游写作顺序：移动端 → Web → 可穿戴 → 归档。**
