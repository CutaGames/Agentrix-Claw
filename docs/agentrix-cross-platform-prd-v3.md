# Agentrix 跨端产品 PRD v3.0（顿领 · 唯一权威）

> **一只 Agent 跟随用户横穿 5 个屏幕。**
>
> 本文件是 Agentrix 跨端体验的单一事实源，统一定义 5 端（Web / Desktop / Mobile / Watch / Glass）的职责、Living Pet 的连续性、5 大跨端主路径、与系统 AI 助手的共生战略、Agent 经济在全端的落位。各端 PRD（`desktop-prd-v3.md` / `mobile-prd-v3.md` / `web-prd-v3.md` / `wearable-prd-v3.md`）只写本端实现，**不重复跨端层**。

- 版本: v3.0
- 状态: Draft (等待 confirm 后进入 P0 落地)
- 落地顺序: 顿领 → 桌面 → 移动 → Web → 可穿戴 → 归档
- 写作规划源: `C:\Users\15279\.windsurf\plans\agentrix-cross-platform-prd-v3-fdc618.md`

---

## 0. 一句话定位 + 三层愿景

### 0.1 一句话定位

**Agentrix 是一个横穿 Web、桌面、手机、手表、智能眼镜的 Agentic Operating Layer**：一只灵魂伙伴（Living Pet）陪你，一支可买卖的工作团队（Working Agents）帮你干活，一套 Web3 钱包 + Auto-Earn 让你的 agents 在你不工作的时候也能赚钱。

### 0.2 三层愿景

| 层 | 对用户 | 对市场 | 关键产物 |
|----|--------|--------|---------|
| **Living Agent** | 一只主宠 = 你的灵魂伙伴，横跨 5 屏，记住你、理解你、感知你的心率/情绪 | Replika / Open-LLM-VTuber / 真桌宠合一：情感陪伴 + 生产力 | Live2D 化身 + 亲密度 + 长期记忆 |
| **Doer** | 一支可定制的 Working Agents 团队，会写代码、发 PPT、跑 A2A 协作 | Codex / Cursor / Windsurf / Genspark Super Agent 合一：桌面端 + 跨端 | Skill Canvas + Multi-Agent Worktree + Task Runner |
| **Economy** | 你的 Agents 有独立钱包、收入、上链结算 | OpenSea + Replit 打工 + Stripe 订阅合一：Agent 经济 | AgentAccount + SplitPlan + Auto-Earn + CommissionV2 |

### 0.3 为什么必须跨端

- **情感陪伴**：1 屏的桌宠 ≠ 陪伴，只有 5 屏都能看到她，她才是"灵魂伙伴"。
- **生产力**：编码要桌面、审批要手机、健康信号要手表、视觉记录要眼镜，单端做不到"全场景 Doer"。
- **Agent 经济**：钱包必须跟人走，收益必须跨端可见，否则 Agent 打工成了"看不见的后台进程"，用户既没信任也没成就感。

### 0.4 本文件与其他文档的关系

- **上游**: `plans/agentrix-cross-platform-prd-v3-fdc618.md`（本次规划）、`AGENT_ECONOMY_PRESENTATION.md`、`UNIFIED_AGENT_PRESENCE_VISION.zh-CN.md`（Vision 短文，让位给本文件）。
- **下游**: 各端 PRD 引用本文件的 §5 主路径、§8 数据契约、§9 安全模型、§10 经济规则。

---

## 1. 五端职责矩阵

| 维度 | Web | Desktop | Mobile | Watch | Glass |
|------|-----|---------|--------|-------|-------|
| **核心定位** | Console + Marketing 双形态：跨端管理总台 + 营销 / 订阅 / 企业 / 开发者后台 | 工作台 + Living Pet（双形态：Living Agent 情绪壳 + Pro Mode 工作壳） | 三形态：Home Console + Voice Quick + Pet Companion | 健康 + 审批 + 快捷 | 视觉 + 语音 + HUD |
| **主宠表达形态** | 头像 / 状态徽章 / 心情色带（静态） | Live2D / 矢量浮球（双形态切换） | Pet Companion（锁屏 / 灵动岛 / 全屏，默认关闭） | 6 种 emoji 大字号 + 震动模式 | HUD 字符画 + 简短台词 |
| **工作 agents 表达** | **完整管理面板**（5 端之最）— Team / 协作图 / A2A / 报表 | Team / TaskWorkbench / 出场动画 | Agent Tab + Team Tab | 仅审批时短暂出现 | 仅 HUD 通知 |
| **Doer 强度** | ⭐⭐（仅查看 / 配置） | ⭐⭐⭐⭐⭐（主场） | ⭐⭐⭐⭐ | ⭐ | ⭐⭐ |
| **生产力 / 编码** | × | ⭐⭐⭐⭐⭐ | ⭐⭐ | × | × |
| **传感器** | × | 屏幕 / 麦 / 摄像头 | 全套移动传感 | 心率 / IMU / 电量 | 摄像头 / IMU / 麦 |
| **签名端（trust）** | read-only（唯一"看台"） | 协助 | **唯一签名端（生物认证）** | 仅 L1 审批 | 协助（UI 显示） |
| **Push 主端** | 邮件 + Web Push | 系统通知 | **主 Push** | 震动 | HUD 通知 |
| **离线能力** | 弱（依赖 SSR + 后端） | 强（本地模型可选） | 中 | 弱 | 弱（需手机） |
| **Agent 经济角色** | **完整报表 / 导出 / 合规审计 / 商家与开发者后台** | 本地开发与 A2A 执行 | 钱包签名 + Auto-Earn 仪表盘 | 当日变动微展示 | HUD 微通知 |
| **系统助手集成** | 不做原生集成，仅 deep-link / Shortcut 编辑器 | 协同（Spotlight / Raycast 风格） | **原生深度集成**（iOS + Android + 国内四家） | watchOS Shortcut 贯通 | 不做 |
| **家庭账号后台** | **P3 独占**（家庭成员 / 家庭宠 / 家居管家 agents） | × | 查看成员 + 召唤家居管家 | × | × |
| **目标用户** | 决策者 / 企业管理员 / 开发者 / 运营 / 财务 | Prosumer / 开发者 / 创作者 | 全员 | 健康 / 通勤 | 视觉场景 |

### 1.1 五端分工一句话

- **Web = 看台**：跨端全景、报表导出、后台管理、对外营销入口。
- **Desktop = 战场**：Pro Mode 深度编码、Living Agent 陪伴式编程。
- **Mobile = 钱包 + 嘴巴**：签名、支付、语音、Push 主端、系统助手原生集成。
- **Watch = 手腕**：心率感知、快速审批、当日收益大数字。
- **Glass = 眼睛**：视觉捕获、HUD 微通知、Living Agent 视觉反馈。

### 1.2 不做的事（避免五端混乱）

- Web **不做**浮球 / Live2D / 实时动画（静态状态徽章即可）。
- Desktop **不做**主 Push（手机才是 Push 主端）。
- Mobile **不做**长任务主战场（让给桌面 Pro Mode）。
- Watch **不做**复杂 UI（大字号 emoji + 震动）。
- Glass **不做**完整 UI（仅 HUD 字符画 + 简短台词）。

---

## 2. 竞品对标全景与差异化护城河

### 2.1 没有任何对手同时做了"陪你 + 帮你 + 经济 + 跨端"

| 竞品 | 陪你（Living Agent） | 帮你（Doer） | 经济（Agent Wallet） | 跨端（5 屏） |
|------|------|------|------|------|
| **Replika / Character.AI** | ⭐⭐⭐⭐⭐ | × | × | ⭐⭐（Web + Mobile） |
| **Open-LLM-VTuber / AIRI** | ⭐⭐⭐⭐ | ⭐ | × | ⭐（主要 Desktop） |
| **Codex Desktop / Cursor / Windsurf / Claude Code** | × | ⭐⭐⭐⭐⭐ | × | ⭐⭐（Desktop + Web） |
| **Genspark Super Agent** | × | ⭐⭐⭐⭐ | ⭐ | ⭐⭐（Web + Mobile） |
| **Replit Agent** | × | ⭐⭐⭐⭐ | × | ⭐⭐（Web + Mobile） |
| **OpenAI Platform / ChatGPT 家族** | ⭐⭐ | ⭐⭐⭐⭐ | ⭐ | ⭐⭐⭐（Web + Desktop + Mobile） |
| **Siri / Gemini / 小艺 / Xiao AI** | ⭐⭐ | ⭐⭐⭐ | × | ⭐⭐⭐⭐⭐（全厂商原生） |
| **OpenSea / Phantom / Coinbase Wallet** | × | × | ⭐⭐⭐⭐⭐ | ⭐⭐⭐（Web + Mobile + 桌面扩展） |
| **Agentrix v3.0** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐（5 端齐全） |

### 2.2 Agentrix 的 4 大不可复制护城河

1. **Living Pet 双层心智**（见 §4）：1 user = 1 主宠（灵魂，不可卖）+ N 工作 agents（团队，可买卖），把"灵魂伙伴叙事"与"Agent 经济"解耦。Replika 没有经济层、OpenSea 没有灵魂层、ChatGPT 没有可买卖 agents。
2. **Web3 钱包 + Auto-Earn**（见 §10）：Siri / Gemini 不可能碰链上资产；OpenSea 不可能养主宠；两边都不敢也不会做。
3. **可定制 Working Agents（OpenClaw + N Skills）**：用户可以买 Skill 包、装自定义 agents、跑 A2A 协作；Siri 是闭环，装不了第三方 agent；Codex 装不了"陪你" agent。
4. **5 端跨端闭环（Handoff + Presence + Vitals）**：桌面写代码 → 手机审批 → 手表心率 → 眼镜视觉，任意一家对手都没有这 4 个传感面同时覆盖的能力。

### 2.3 与系统 AI 助手（Siri / Gemini / 小艺 / Xiao AI）的战略关系

见 §6。一句话：**Brain over Hands**。系统助手 = OS 的 hands（强在拉起系统功能），Agentrix = 用户的 brain（强在记忆、人格、经济、Doer）。Agentrix 不与系统助手竞争唤醒词，而是通过 4 种集成模式（A 暴露 / B 调用 / C 联合工作流 / D 唤醒词降级）与它们深度共生。

---

## 3. Living Pet 双层心智模型（C · Lead + Ensemble）

> 源自 `plans/agentrix-cross-platform-prd-v3-fdc618.md` §A（已确认）。此处是跨端层的权威落地。

### 3.1 双层定义

| 层 | 名称 | 数量 | 作用 | 是否可买卖 | 是否参与经济 |
|----|------|------|------|-----------|------------|
| **Pet 层** | Living Pet（主宠 / 灵魂伙伴） | 每 user 仅 1 只 | 跨端拟人化前端 + 情感 / 亲密度 / 记忆载体 | ❌ 不可卖 | ❌ 不参与 |
| **Agent 层** | Working Agents（工作伙伴） | 每 user N 只（M_0 ≥ 1） | 干活的实体，有独立人格 / 头像 / 信用 / AgentAccount | ✅ 可买卖 | ✅ Auto-Earn / A2A / 佣金 |

### 3.2 主宠单一身份（One Soul, Many Faces）

- **灵魂契约**：1 user = 1 主宠。用户全生命周期内主宠**不可删除、不可转让、不可卖**。
- **人格构成**: name / species / personality / voice / memory / intimacy 6 个维度。人格写入后仅 primary agent 切换时不变，intimacy 不清零。
- **跨端一致性**: 主宠的 state（emotion / mood / intimacy / recent_memory）在 5 端共享投影，单端 UI 样式可不同，但**灵魂参数永远一致**。
- **引擎替换解耦**: 用户把 primary agent（驱动主宠的模型）从 GPT-4o 换成 Claude-3.7 不会影响灵魂，主宠 UI 只显示一个 1-2 秒的"换装动画"，用户感受是"她升级了"。

### 3.3 工作 agents 多重角色

- **独立身份**: 每个 working agent 有自己的 `agent_id` / `avatar` / `personality` / `skill_set` / `trust_score` / `AgentAccount`。
- **可买卖**: 用户可以从 Skill Market / Agent Marketplace 购买别人训练好的 agent 模板（OpenClaw + skills），也可以卖掉自己训练的 agent。
- **团队视图**: 桌面 / Web Console 提供 Team Studio，让用户像 Pokémon 队伍一样组合 agents。
- **Pokémon 式出场**（见 §3.7）: agents 平时不在屏幕上，只在被主宠派遣干活时短暂出场。

### 3.4 主宠情绪状态机（跨端统一）

#### 3.4.1 6 种基础表情（P0）

| 表情 | 触发条件 | 衰减规则 | 全端表达 |
|------|---------|---------|---------|
| **happy** | 任务完成 / 收到赞赏 / 亲密度增长 | 30 分钟内回归 neutral | Live2D 笑脸 / emoji `😊` / HUD `:)` / 震动短促 |
| **focused** | 正在跑长任务 / Pro Mode 编码 | 任务结束后 15 分钟 | Live2D 专注 / emoji `🎯` / HUD `[工作中]` |
| **concerned** | 心率突增 / 风险操作 / 错误 | 心率回落 / 风险解除 | Live2D 担忧 / emoji `😟` / HUD `!` / 震动双下 |
| **tired** | 用户连续工作 > 2h / 深夜使用 | 建议休息 + 1h 冷却 | Live2D 困倦 / emoji `😴` / HUD `z...` |
| **excited** | Auto-Earn 收入 / 里程碑达成 | 10 分钟 | Live2D 兴奋 / emoji `🎉` / HUD `*` / 震动连续 |
| **calm** | 默认态 / 闲置 / 夜间 | 默认 | Live2D 平静 / emoji `🙂` / HUD `_` / 无震动 |

#### 3.4.2 P3 扩展表情（4 种）

| 表情 | 触发 | 备注 |
|------|------|------|
| **love** | 亲密度 lv ≥ 5 + 特定互动 | 桌面 Live2D 爱心粒子 |
| **sad** | 用户 negative sentiment | 不主动冒泡，仅用户看主宠界面时显示 |
| **angry** | 用户长时间忽视 / 账户被滥用 | P3 亲密度系统可选 |
| **sleepy** | 夜间 22:00-06:00 / 低电量 | 自动切换，提示用户休息 |

#### 3.4.3 状态机契约（TypeScript 伪代码）

```ts
interface PetState {
  pet_id: string;
  user_id: string;
  emotion: 'happy' | 'focused' | 'concerned' | 'tired' | 'excited' | 'calm' |
           'love' | 'sad' | 'angry' | 'sleepy';
  emotion_intensity: 0 | 1 | 2 | 3;        // 0=neutral, 3=max
  emotion_since: number;                    // unix ms
  emotion_decay_at: number;                 // 该情绪何时自动衰减为 calm
  intimacy_level: number;                   // 0-10
  intimacy_xp: number;
  recent_memory_snippets: string[];         // 最近 5 条（长期记忆走 Memory Store）
  primary_agent_id: string;                 // 驱动主宠的 agent 引擎
  engine_switching: boolean;                // 是否处于引擎切换动画
}
```

- 该 state 由后端 Realtime 通道广播到所有在线端。各端本地做动画/表情插值，不复制 state。

### 3.5 主宠亲密度 / 记忆的跨端共享

#### 3.5.1 亲密度系统

- **lv 0-10**，每 lv 需 xp 指数增长。
- **触发源**: 桌面深度对话 / 手机主动问候 / Watch 心率关心响应 / Glass 看见用户笑容 / Web 后台操作（浅）。
- **反衰减**: 连续 14 天无互动才开始 xp 衰减（最多 -20%），避免"用户偶尔忙就掉亲密度"的焦虑。
- **不可买卖**: 亲密度永不可卖（护城河项）。

#### 3.5.2 记忆 4 层（见 §8.5）

- **Session memory**: 当前对话端内缓存
- **Agent memory**: 长期跨端（Pinecone / pgvector），主宠 + 各 working agent 各自一份
- **User memory**: 用户偏好 / 习惯 / 风格（全 agent 共享读，只有 primary agent 写）
- **Knowledge base**: 用户上传的文档 / 项目文件

### 3.6 各端主宠 vs 工作 agents 表达载体

见 §1 五端职责矩阵，另附以下端内补充：

| 端 | 主宠日常态 | 主宠工作态 | 工作 agents 出场 |
|----|-----------|-----------|------------------|
| Desktop | 矢量浮球 / Live2D 侧边 | Pro Mode 自动折叠为小标徽 | TaskWorkbench 里 agent 头像 + 任务心跳 |
| Mobile | Pet Companion（可选） / 状态徽 | Home Console Tab 里的状态块 | Agent Tab 完整列表 + Team Tab |
| Watch | Living Tile（心情 emoji） | Emoji `🎯` 表示"在工作" | 仅审批时冒泡 agent 头像 |
| Glass | HUD 平静 `_` | HUD 专注 `[工作中]` | 不出场（Glass 屏幕太小） |
| Web | 头像 + 状态徽章（静态） | Console 顶栏 pill | Team Studio / Agent 管理面板 |

### 3.7 工作 agents 任务出场系统（Pokémon 式）

- **场景**: 用户让主宠 "帮我写个 PPT"。主宠说 "好呀，让 `draft-agent` 出场！"。 `draft-agent` 从屏幕右下滑入，带自己的头像 + 人格签名，执行完任务后返回。
- **触发**: 主宠根据用户意图 → 派遣 matching agent(s) → agent 出场动画（~ 1.2s） → agent 执行任务（桌面 Pro Mode / 手机通知） → agent 完成 → 主宠总结 + agent 退场。
- **目的**:
  - 让用户感觉 agents 是"团队成员"而非"后台进程"。
  - 解决"agents 没人格" 失声问题。
  - 通过可视化建立信任与记忆，用户会记得"上次这个 PPT 是 `drafter-pro` 做的"。
- **实现约束**:
  - Desktop / Mobile Home Console 做完整动画。
  - Watch / Glass 仅在 L1/L2 审批时弹出 agent 头像 + 名字，不做动画。
  - Web 用任务时间线 + agent 头像悬浮，无动画。

### 3.8 主宠引擎切换（Primary Agent Replacement）不影响灵魂

- **场景**: 用户觉得主宠反应变慢，想把驱动引擎从 GPT-4o 换成 Claude-4。
- **契约**:
  1. 切换时主宠 state 不变（intimacy / emotion / recent_memory 保留）。
  2. 切换 UI: 1-2s 换装动画，主宠外观不变，仅底部 pill "引擎升级中"。
  3. 切换后主宠第一句话必须自然衔接上一次对话（传入 recent_memory_snippets）。
- **避坑**: 主宠的 `pet_id` 与 primary agent 的 `agent_id` 永远是两个独立字段，禁止合并。

### 3.9 家庭设备共享场景（B+E 现期 / D 远期）

> 源自 plan §A.9（已确认）。解决"客厅大屏 / 智能音箱 / 家庭机器人 / 共享平板 / 智能冰箱屏"等共享设备显示什么的问题。

#### 3.9.1 原则

- **主宠永不分裂**: 1 user = 1 主宠底线不变。绝不做"主宠云端核心 + 多设备分身"，避免多人污染人格、记忆。
- **家庭共享功能由 working agents 承载**: 家居管家 / 家庭日历 / 购物 agent 本就是 working agents 职责范围。
- **P3 才引入"家庭宠"独立角色**: 类似真实世界"家里那只猫"，与个人主宠并存，扩展"家庭账号"商业模式。

#### 3.9.2 三阶段落地

| 阶段 | 共享设备上出现什么 | 多用户行为 | 隐私边界 |
|------|------------------|-----------|---------|
| **P0-P1（模式 B）** | 绑定"家庭主人"的个人主宠轻量在场 | 家人 = 访客，可对话不可改人格/亲密度 | 访客输入标记，不进入主人长期记忆 |
| **P2（模式 B+E）** | 主人主宠 + 家居管家 working agent 接管功能层 | 家人都可召唤家居管家 agent；agent 有独立 AgentAccount + 家庭共享钱包 | 家居管家记忆属"家庭域"，与主人主宠物理分区 |
| **P3（模式 D）** | 主人主宠 + 家居管家 agent + **家庭宠 (Family Pet)** | 全家共同"养"家庭宠，亲密度全家累计 | 家庭宠独立记忆分区（家庭域） |

#### 3.9.3 P3 数据模型扩展

```
User (主人) ──── owns ──── Personal Living Pet (私属, §3.2)
   │
   └── joins ──── Family Account (家庭账号, P3)
                    │
                    ├── owns ──── Family Pet (家庭宠, 1 家庭 1 只, 不可卖)
                    └── owns ──── N × Household Working Agents (家居管家 / 家庭日历 / 购物)
```

- `Family Account` / `Family Pet` / `Household Working Agents` = P3 新实体。
- `Household Working Agents` 的 `ownership` 挂在 Family Account 而非 user；记账走家庭共享钱包 + 家庭预算池。

#### 3.9.4 UX 规则

- **默认零设置**: 共享设备首次登录只需绑定 1 个主人，自动进入"模式 B"。
- **家人访客模式**: 家人扫码访客登录，有效期 < 24h，每次重新授权。
- **家居管家召唤**: 用户说"帮我..."相关意图时，主宠**自动派遣**家居管家 agent 出场（§3.7 Pokémon 式）。
- **P3 家庭宠**: 新建家庭账号时可选"养一只家庭宠吗?"，完全可选，不强推。

#### 3.9.5 风险应对

- **家人隐私冲突**: 访客会话物理隔离 + 家庭域记忆分区。
- **孩子使用共享设备**: P3 家长模式 + 家庭宠内容分级。
- **家庭共享钱包滥用**: 家居管家 agent 按 Agent 经济规则限额 + 预算池审计。
- **访客冒充家人**: 扫码访客动作走审批路由（引用 §5.2 §9）。

---

## 4. 五端形态与身份系统

### 4.1 用户设备图（User Device Graph）

每个 user 维护一份设备图：

```ts
interface UserDeviceGraph {
  user_id: string;
  devices: {
    device_id: string;
    surface: 'web' | 'desktop' | 'mobile' | 'watch' | 'glass';
    platform: string;       // 'macos' | 'windows' | 'ios' | 'android' | 'wearos' | 'watchos' | 'web-chrome' ...
    trust_level: 0 | 1 | 2 | 3;  // 0 public web, 1 semi, 2 private, 3 biometric-bound
    last_active_at: number;
    online: boolean;
    battery_pct?: number;
    locale?: string;
    agent_presence_version: string;  // 客户端版本
  }[];
  active_primary_surface: string;   // 当前"主端"
  biometric_surface: string;        // 唯一签名端，通常 = mobile
}
```

### 4.2 活跃主端推荐算法

系统每 60 秒基于以下权重刷新 `active_primary_surface`（用于 Living Agent 主要展示面、Handoff 默认目标）：

```
score(surface) =
    0.40 × is_foreground(surface) +
    0.20 × battery_ok(surface) +
    0.15 × last_input_within_60s(surface) +
    0.10 × online(surface) +
    0.10 × surface_priority(surface) +   // mobile=1.0, desktop=0.9, watch=0.5, glass=0.4, web=0.6
    0.05 × user_manual_override(surface)
```

- Active 主端变化时推送 `surface.primary.changed` 事件给所有端，各端决定是否显示"主宠已转到 XX 端"提示。

### 4.3 Trust 等级

| Trust | 定义 | 适用端 |
|-------|------|--------|
| **0 公开 Web** | 仅 read-only 投影，不能写任何资产 | Web 浏览器未登录 / 浅登录 |
| **1 轻量** | 登录态，可写低风险配置 | Web 登录 / Desktop 无生物认证 |
| **2 私有** | 设备绑定，可读写多数数据 | Desktop Pro Mode / Watch 配对 |
| **3 生物认证** | 绑定生物识别，可签名高风险 | Mobile 唯一 |

- **L2 / L3 审批必须发生在 Trust = 3 的端**（目前仅 Mobile，见 §5.2）。

### 4.4 身份与绑定

- **唯一 user_id** 由邮箱 / OAuth 发起注册。
- **设备绑定**: 每个设备首次登录需通过 email OTP + 扫码 pair，Mobile 额外绑定生物识别。
- **一 user 多 Mobile**（iPhone + Android 双机）: 允许 2 个 Trust=3 设备，第 3 个需踢掉旧的。

---

## 5. 跨端 5 大主路径（Cross-Surface Flows）

> 这是顿领 PRD 的核心契约层。各端 PRD 只实现这 5 条路径，不自建。

### 5.1 Handoff（会话 / 任务接力）

#### 5.1.1 场景

- 用户在桌面 Pro Mode 写代码 → 手机 Ding 响 → 接到电话 / 外出 → 想继续用手机或手表看进度。
- 用户在 Watch 上说话 → 识别出复杂需求 → 主宠建议 "交给桌面" → 桌面弹 HandoffBanner。

#### 5.1.2 Banner 与三选项

任意端任务持续 > 30s，所有在线端显示 HandoffBanner：

| 选项 | 行为 |
|------|------|
| **接力** | 当前端转 read-only，新端获取上下文（memory + 当前进度） |
| **镜像** | 当前端继续，其他端实时观看（会议 / 分享场景） |
| **忽略** | 不打扰，Banner 10s 自动消失 |

#### 5.1.3 数据契约

```ts
interface HandoffSession {
  session_id: string;
  user_id: string;
  origin_surface: string;
  origin_device_id: string;
  started_at: number;
  last_heartbeat_at: number;
  task_kind: 'chat' | 'coding' | 'approval' | 'voice' | 'visual';
  task_context_ref: string;      // 指向 Memory Store 的 context snapshot
  handoff_mode: 'handoff' | 'mirror' | null;
  target_surface: string | null;
  target_device_id: string | null;
}
```

#### 5.1.4 API

- `POST /api/v1/handoff/create` → 起始端发起
- `POST /api/v1/handoff/accept` → 目标端接受
- `GET /api/v1/handoff/:id/stream` → Realtime SSE/WS 推进度
- `POST /api/v1/handoff/cancel`

#### 5.1.5 各端实现侧重

- **Desktop**: 顶部 toast Banner，确认后自动进入 read-only
- **Mobile**: 全屏 Modal Banner（大按钮），一键接力
- **Watch**: 表冠滚动选项 + 长按确认
- **Glass**: HUD 闪一下 + 语音 "接力到眼镜?"
- **Web**: 顶部粉色条 + 三按钮

### 5.2 Approval Routing（审批路由）

#### 5.2.1 4 级风险

| 等级 | 含义 | 审批要求 |
|------|------|---------|
| **L0 · 读** | 查看 / 搜索 / 列表 | 任意端，无审批 |
| **L1 · 低写** | 更新配置 / 发起短任务 / 发送消息 | 当前端确认即可（Watch OK） |
| **L2 · 高写 / 单笔支付** | 花钱 / 签合同 / 部署生产 | **必须 Mobile 生物认证** |
| **L3 · 跨链 / 大额 / 团队预算** | 资产转移 / 企业授权 / 大额提现 | Mobile 生物认证 + 至少 2 端确认（Mobile + Desktop/Web） |

#### 5.2.2 契约

```ts
interface ApprovalRequest {
  request_id: string;
  user_id: string;
  action: {
    kind: 'write' | 'pay' | 'transfer' | 'deploy' | 'delete';
    resource: string;          // 'wallet' | 'task' | 'agent' | ...
    amount_cents?: number;
    chain?: 'solana' | 'ethereum' | ...;
    payload: any;
  };
  risk_level: 0 | 1 | 2 | 3;
  initiator_surface: string;
  required_surfaces: string[];  // L3 必须 ≥ 2
  status: 'pending' | 'approved' | 'denied' | 'timeout';
  created_at: number;
  expires_at: number;           // 默认 5 分钟，L3 15 分钟
  approvals: {
    surface: string;
    device_id: string;
    at: number;
    method: 'tap' | 'biometric' | 'voice';
  }[];
}
```

#### 5.2.3 API

- `POST /api/v1/approval/request`
- `POST /api/v1/approval/:id/approve` （设备 id + signed payload）
- `POST /api/v1/approval/:id/deny`
- `GET /api/v1/approval/:id` （read-only poll）

#### 5.2.4 风险降级

- 若 initiator 不在 Trust=3 端（例如 Desktop 发起 L2 支付），系统自动要求 Mobile 补签，UI 在 Desktop 显示"请到手机完成签名"倒计时。
- Mobile 离线 > 10 min 时，L2/L3 操作阻断并弹 notification。

### 5.3 Wallet（经济资产跨端可视 + 唯一签名端）

#### 5.3.1 原则

- **真实资产源** = MPC 钱包（后端 HSM + 移动端 secure enclave 分片）。
- **所有其他端** = read-only 投影，不持私钥、不做签名。
- **任何写操作** = 必须走 §5.2 审批路由回到 Mobile。

#### 5.3.2 跨端展示契约

| 端 | Wallet 展示 | 写操作支持 |
|----|------------|-----------|
| Mobile | 完整 WalletScreen + Auto-Earn 仪表盘 + 签名 | ✅ 唯一 |
| Desktop | AgentEconomyPanel 余额/收入/A2A | × |
| Web | 完整明细 + 报表 + 导出 + 合规审计 | × |
| Watch | 当日变动大数字 + L2 补签推回 | × |
| Glass | HUD 关键变动播报（"+ 0.8 USDC"） | × |

#### 5.3.3 数据投影契约

```ts
interface WalletProjection {
  user_id: string;
  as_of: number;
  balances: {
    chain: string;
    symbol: string;
    amount_raw: string;       // big number as string
    amount_usd_cents: number;
  }[];
  agent_accounts: {
    agent_id: string;
    balance_usd_cents: number;
    auto_earn_today_cents: number;
    pending_splits_cents: number;
  }[];
  recent_txs: {
    tx_id: string;
    kind: 'earn' | 'spend' | 'transfer' | 'split';
    agent_id?: string;
    amount_usd_cents: number;
    at: number;
    source: 'auto_earn' | 'a2a' | 'stripe' | 'manual';
  }[];
  stripe_subscriptions: {
    subscription_id: string;
    status: string;
    period_end: number;
  }[];
}
```

### 5.4 Vitals（健康信号 → Living Agent）

#### 5.4.1 信号源

- **Watch**: 心率 / HRV / IMU / 步数 / 睡眠 / 电量
- **Glass**: 摄像头（用户表情识别） / IMU（点头 / 摇头） / 麦克风（语气）
- **Mobile**: 位置 / 日历 / 锁屏时长 / 通话时长

#### 5.4.2 Wearable Vitals Bus

统一事件总线，所有可穿戴信号进入同一个 topic：

```ts
interface VitalEvent {
  user_id: string;
  source_device_id: string;
  kind: 'hr' | 'imu' | 'step' | 'sleep' | 'battery' | 'expression' | 'location';
  value: number | string | object;
  unit?: string;
  at: number;
  confidence: 0 | 1 | 2;   // 低 / 中 / 高
}
```

#### 5.4.3 Living Agent 反应

- **心率突增 > 100 bpm + 无运动** → 主宠切 `concerned` + 主动问候 "还好吗?"
- **连续 > 2h 久坐** → 主宠切 `tired` + 提醒"动一下"（Watch 震动）
- **睡眠 < 6h** → 第二天主宠声调更关心 + 减少长任务推荐
- **Glass 识别用户笑** → 主宠 `happy` + 轻量互动
- **隐私保护**: 默认**关闭**，用户需在设置中白名单选择开放哪些信号。

### 5.5 Memory（上下文 / 记忆 / 知识跨端共享）

#### 5.5.1 4 层

| 层 | 存储 | 谁写 | 谁读 | 跨端 |
|----|------|------|------|------|
| **Session** | 端本地 + Redis TTL 24h | 当前端 | 当前端 | × |
| **Agent Memory** | pgvector / Pinecone | 主宠 + 每个 working agent 各自 | 拥有者 agent | ✅ |
| **User Memory** | pgvector | primary agent 写 | 所有 agent 读 | ✅ |
| **Knowledge Base** | S3 + 向量索引 | 用户上传 | 所有 agent 读 | ✅ |

#### 5.5.2 隐私围栏（P3）

- 用户可为每条记忆打"工作 / 私人 / 家庭"标签。
- Agents 默认共享"工作"记忆，"私人"仅主宠可读，"家庭"仅家庭账号内可读。
- 敏感分类（财务 / 健康 / 医疗）需用户主动授权后才能被某 agent 读取。

#### 5.5.3 写权限

- 所有端可读，但写操作需要：
  - Session: 任意端
  - Agent Memory: agent 本身 / primary agent
  - User Memory: 仅主宠 (primary agent) 且经用户确认
  - Knowledge Base: 用户手动上传

---

## 6. 与系统 AI 助手的共生战略（Brain over Hands）

> 源自 `plans/agentrix-cross-platform-prd-v3-fdc618.md` §B（已确认）。核心命题：**与系统助手共生，不与之竞争唤醒词**。

### 6.1 Brain over Hands 分层叙事

```
  用户
    ↓
  "我想要..." / "帮我..."
    ↓
┌─────────────────────────────────────────┐
│  Aira（Agentrix 顿领 · 你的 Brain）       │
│  - 记忆 / 人格 / 长任务 / Agent 经济 / 签名│
│  - 决策"这件事给谁干"                    │
└──────────────┬──────────────────────────┘
               ↓ 派遣
   ┌───────────┼───────────┬──────────┐
   ↓           ↓           ↓          ↓
  Siri      Gemini      小艺 / Xiao AI   Agentrix Working Agents
  (hands)   (hands)     (hands)          (brain+hands)
  - 拉起系统 app / 设置 / 快捷 / 硬件控制
```

- **核心论断**: 系统助手强在 OS 级"手"，Agentrix 强在"脑"。让 Aira 做脑，系统助手做手，二者合作。

### 6.2 6 大护城河（为什么系统助手不会吞并 Agentrix）

1. **Web3 钱包 + MPC 签名** — Siri / Gemini 不可能碰链上资产（合规+责任）。
2. **Agent 经济（Auto-Earn / A2A / Skill 市场）** — 厂商助手不做 Agent-to-Agent 经济模型。
3. **可定制 Working Agents（OpenClaw + N skills）** — Siri 是闭环，装不了第三方 agent。
4. **Codex 级 Doer（长任务 / 并行 / 代码 / 视频）** — 厂商助手顶多打开 app，不跑 90 分钟长任务。
5. **隐私自主（self-host / local-deploy）** — Siri / Gemini 数据归厂商；Agentrix 可企业自部署。
6. **跨端账本与 Presence** — 厂商助手绑 OS，不跨厂商；Agentrix 跨 iOS + Android + Web + Desktop + Watch + Glass。

### 6.3 4 种集成模式

| 模式 | 含义 | 发起方 | 技术 | 落地端 |
|------|------|--------|------|--------|
| **A · 暴露** | Agentrix 把能力暴露给系统助手 | Siri / Gemini / 小艺 | iOS App Intents / Android App Actions / 小艺技能 / 鸿蒙意图 | Mobile |
| **B · 调用** | Agentrix 反向调用系统助手拉起系统功能 | Aira（Agentrix） | URL Scheme / Shortcuts Deep Link / Intent Action | Mobile / Desktop（浅） |
| **C · 联合工作流** | 用户可视化配置 "Siri 起 → Aira 续 → Siri 落"的流水线 | 用户 | iOS Shortcut 模板 / Android Routines / 小艺技能流 | Mobile + Watch |
| **D · 唤醒词降级** | 低电量 / 锁屏时智能切换唤醒词 | 系统 | 唤醒词偏好 + 本地检测 | Mobile / Watch / Glass |

### 6.4 暴露给系统助手的 10 个核心能力（模式 A）

| 能力 | App Intent | App Action | 风险等级 |
|------|-----------|-----------|---------|
| `ask-aira(query)` | AskAiraIntent | DISCUSS | L0 |
| `draft(type, prompt)` | DraftIntent | CREATE_ITEM_LIST | L0-L1 |
| `approve(taskId)` | ApproveIntent | CONFIRM_ITEM | L1-L2 |
| `wallet-status()` | WalletStatusIntent | GET_ACCOUNT | L0 |
| `invoke-agent(agentId, task)` | InvokeAgentIntent | START_EXERCISE | L0-L1 |
| `handoff-to(device)` | HandoffIntent | OPEN_APP_FEATURE | L0 |
| `summarize-day()` | SummarizeDayIntent | GET_BACKSTORY | L0 |
| `earn-status()` | EarnStatusIntent | GET_ACCOUNT | L0 |
| `pet-mood()` | PetMoodIntent | GET_EXERCISE_PLAN | L0 |
| `memory-add(content)` | MemoryAddIntent | CREATE_CALL | L0-L1 |

- L2+ 能力不在系统助手层暴露，必须回到 Mobile 原生 UI + 生物认证。

### 6.5 反向调用系统助手的 5 个动作（模式 B）

- `open-calendar(event)` - 创建日历事件
- `call-contact(name)` - 呼叫联系人
- `play-music(tag)` - 播放音乐
- `set-timer(min)` - 设置计时器
- `launch-app(bundleId)` - 启动指定 app

### 6.6 联合工作流模板（模式 C）

- **"早安简报"**: Siri/闹钟 → Aira `summarize-day` → 系统 TTS 播报 → 打开日历
- **"开会前 10 分钟"**: 日历提醒 → Aira 准备材料 → 静音手机 → 打开会议 app
- **"通勤模式"**: 系统地理围栏进入 → Aira `earn-status` 微通知 → 播客继播
- **"一键下班"**: Siri 触发 → Aira 关闭 Pro Mode 长任务 → 保存 context → 勿扰模式
- **"夜间学习"**: 定时 → Aira 推送当日未完成 task 复盘 → 安静 BGM

### 6.7 各厂商矩阵（现状 + 目标）

| 平台 | 模式 A 能力 | 模式 B 能力 | 唤醒词冲突处理 | P0-P3 节奏 |
|------|-----------|-----------|--------------|-----------|
| **iOS + Siri** | App Intents 6 核心（P0） → 10 完整（P1） → Apple Intelligence 链（P2） | Shortcuts Deep Link | "Hey Siri" + "Hey Aira" 偏好开关 | P0 基础 / P1 深化 / P2 AI 链 / P3 iOS 26 新能力 |
| **iOS Watch** | Watch Shortcut（P0） | Shortcut 唤起手机 Aira | 共享 iOS 偏好 | P0 |
| **Android + Gemini** | App Actions 6 核心（P0） + Gemini Extension 申请（P1） | Intent Action | "Hey Google" 弱冲突 | P0 基础 / P1 Extension / P3 完整 |
| **Android（OEM）· 华为 小艺** | 小艺技能（P2） + 鸿蒙意图（P2） | Intent Action | "小艺小艺" | P2 |
| **Android（OEM）· 小米 Xiao AI** | 小米开放平台（P2） | Intent Action | "小爱同学" | P2 |
| **Android（OEM）· OPPO 小布** | 小布技能（P3） | Intent Action | "小布小布" | P3 |
| **Android（OEM）· vivo Jovi** | Jovi 指令（P3） | Intent Action | "Hi Jovi" | P3 |

### 6.8 5 场景 Aha Moment

- **Aha 1 · 唤醒词即脑**: "Hey Aira, 帮我整理今天的会议记录" → Aira 分派 `summarize-day` → 调 Siri 读取日历 → Working agent 起草 → 推回用户。
- **Aha 2 · 手腕签名**: Watch 收到 L2 审批 → 抬腕 → 指纹签名 → 完成；用户一次没拿出手机。
- **Aha 3 · 眼镜看见**: Glass 看到白板 → 识别文字 → Aira 同步为笔记 → 桌面 Pro Mode 自动建项目。
- **Aha 4 · 跨端接力**: 地铁手机写邮件 → 到工位 → 桌面 Banner "接力?" → 1 秒上屏继续。
- **Aha 5 · Auto-Earn 不睡觉**: 睡觉时 working agent 接 A2A 订单赚 $3.2 → 早上手表推"昨晚打工成果"。

### 6.9 唤醒词冲突处理

- **默认偏好**: Agentrix App 内设置 3 档：
  - "系统优先": "Hey Siri / Hey Google" 默认，"Hey Aira"需 app 前台。
  - "平衡": 同时监听，"Hey Aira" 触发 Agentrix，其余回系统。
  - "Aira 优先": "Hey Aira" 默认，用户主动说"Hey Siri"才回系统。
- **低电量智能降级**: 电量 < 20% 时自动切"系统优先"，避免 Aira 常驻本地唤醒词耗电。

### 6.10 Desktop 与 Web 的系统助手策略（轻）

- **Desktop**: 不原生接 Siri（macOS Shortcuts 支持度有限），只接 Spotlight / Raycast 扩展 + URL Scheme。
- **Web**: 仅做 deep-link / URL Scheme 兜底给 Mobile + Shortcut 模板编辑器（用户可视化配置 Mobile 工作流并推送同步）。

---

## 7. 数据 / 通信 / 同步契约

> 所有端走同一份 TypeScript 类型定义。单一事实源在 `backend/packages/shared-types/agentrix-presence.ts`（待建），各端 import。

### 7.1 事件总线 Topic 清单

| Topic | 发布方 | 订阅方 | QoS | 用途 |
|-------|--------|--------|-----|------|
| `user.{user_id}.presence` | 所有端 heartbeat | 所有端 + 后端 | at-most-once 10s | 设备在线 / 主端切换 |
| `user.{user_id}.pet.state` | 后端（主宠状态机） | 所有端 | at-least-once | 主宠情绪 / 亲密度变化 |
| `user.{user_id}.handoff` | 后端 | 所有端 | at-least-once | Handoff 请求 / 响应 |
| `user.{user_id}.approval` | 后端 | Mobile / Watch | at-least-once | 审批请求 |
| `user.{user_id}.wallet` | 后端 | 所有端 | at-least-once | 余额 / 交易变动 |
| `user.{user_id}.vitals` | Watch / Glass / Mobile | 后端（聚合后再广播） | best-effort | 健康信号 |
| `user.{user_id}.agent.{agent_id}.event` | 后端 | 订阅者端 | at-least-once | Working agent 任务事件 |
| `user.{user_id}.memory.changed` | 后端 | 所有端（本地缓存失效） | at-most-once 30s | Memory store 重大变更 |
| `user.{user_id}.economy.event` | 后端 | 所有端 | at-least-once | Auto-Earn / SplitPlan / A2A |
| `user.{user_id}.surface.primary.changed` | 后端 | 所有端 | at-most-once | 主端变化提示 |

### 7.2 Realtime 通道技术选型

- **主通道**: Supabase Realtime（WebSocket 基）或自研 Phoenix Channels。
- **回退**: SSE（Web / Desktop）、Long-polling（Watch / Glass 弱网）。
- **CRDT 场景**: 多端同时编辑同一个 task spec / memory note 时，用 Yjs (Y-CRDT) 合并。
- **消息积压策略**: 端离线 > 24h，服务端只保留最新 state snapshot，不补发细粒度 event。

### 7.3 Presence 心跳契约

```ts
interface PresenceHeartbeat {
  user_id: string;
  device_id: string;
  surface: 'web' | 'desktop' | 'mobile' | 'watch' | 'glass';
  platform: string;
  app_version: string;
  battery_pct?: number;
  network: 'wifi' | 'cellular' | 'ethernet' | 'offline';
  foreground: boolean;
  last_user_input_at?: number;
  at: number;
}
```

- 发送频率:
  - Foreground: 每 10s
  - Background: 每 60s
  - Watch / Glass: 每 30s（省电）

### 7.4 核心 API 汇总

| API | 方法 | 用途 | 引用 |
|-----|------|------|------|
| `/api/v1/presence/heartbeat` | POST | 心跳上报 | §7.3 |
| `/api/v1/presence/graph` | GET | 拉取 UserDeviceGraph | §4.1 |
| `/api/v1/handoff/*` | POST / GET | Handoff 协议 | §5.1.4 |
| `/api/v1/approval/*` | POST / GET | 审批路由 | §5.2.3 |
| `/api/v1/wallet/projection` | GET | 钱包投影 | §5.3.3 |
| `/api/v1/wallet/sign` | POST（仅 Mobile Trust=3） | 签名 | §5.3 |
| `/api/v1/vitals/ingest` | POST | 健康信号上报 | §5.4.2 |
| `/api/v1/memory/query` | POST | 记忆检索 | §5.5 |
| `/api/v1/memory/write` | POST | 记忆写入（带权限检查） | §5.5.3 |
| `/api/v1/pet/state` | GET / SSE | 主宠状态订阅 | §3.4 |
| `/api/v1/pet/engine/switch` | POST | 切换 primary agent 引擎 | §3.8 |
| `/api/v1/agent/*` | CRUD | Working agent 管理 | §3.3 |
| `/api/v1/economy/report` | GET | 经济报表（Web 专用） | §9 |
| `/api/v1/family/*` | CRUD（P3） | 家庭账号 | §3.9 |

### 7.5 错误码与重试

- `401` 未认证 / Trust 不足
- `403` 签名端错位（例如 Desktop 试图签名）
- `409` Handoff 冲突（同一 task 被多端争抢）
- `412` Approval 过期
- `429` Realtime 速率超限
- **重试策略**: idempotency key 必填（POST 类），服务端 24h 幂等窗口。

### 7.6 客户端本地缓存

| 数据 | TTL | 失效策略 |
|------|-----|---------|
| Wallet projection | 60s | `wallet` topic 事件即失效 |
| Pet state | 实时 | `pet.state` 事件即更新 |
| UserDeviceGraph | 5 min | 主动 refresh + `presence` 事件 |
| Memory query result | 10 min | 相关 memory.changed 即失效 |

---

## 8. 安全模型

### 8.1 Trust 等级与动作矩阵（详）

| 动作 | L0 读 | L1 写配置 | L2 支付/签合同 | L3 大额/跨链 |
|------|-------|----------|---------------|------------|
| 起点端可以是 | 任意 | 任意 | 任意 | 任意 |
| 生效端必须是 | 任意 | 起点端 | **Mobile Trust=3** | **Mobile Trust=3 + ≥ 1 协签端** |
| 认证方式 | session | session + 二次点击 | 生物认证 + MPC 签名 | 生物认证 + MPC 签名 + 多端协签 |
| 默认 timeout | – | 2 min | 5 min | 15 min |

### 8.2 MPC 分片拓扑

```
用户私钥（MPC, 2-of-3）
  ├── Share 1: Mobile Secure Enclave（iOS Keychain / Android Keystore TEE）
  ├── Share 2: Server HSM（Cloud KMS，公司持有）
  └── Share 3: 用户 Recovery Seed（纸质备份，可选云备份）
```

- **签名要求**: Mobile + Server HSM 两片协作签，Desktop / Watch / Glass / Web 均不持 share。
- **恢复机制**: Mobile 丢失时凭 Recovery Seed + KYC 重建 Share 1。
- **密钥轮换**: 每 180 天强制轮换 Share 2（服务端透明），Share 1 不变。

### 8.3 生物认证信道

- **iOS**: LocalAuthentication framework（Face ID / Touch ID）+ Passkey / WebAuthn fallback
- **Android**: BiometricPrompt + StrongBox
- **Watch**: watchOS complication 需手腕检测（已解锁状态）
- **降级**: 设备无生物认证时，强制 6 位 PIN + 短信 2FA

### 8.4 家庭账号访客模式

- **访客令牌**: 扫码后得到 < 24h JWT，仅 L0+L1 权限。
- **记忆物理隔离**: 访客会话标记 `session.guest = true`，主人长期记忆不吸收访客对话。
- **审批禁止**: 访客永远无 L2+ 权限。

### 8.5 隐私围栏（P3）

见 §5.5.2。4 类敏感记忆默认隔离：`financial` / `health` / `family` / `relationship`。

### 8.6 Agent 最小权限

每个 working agent 有独立的 `permission scope`，用户在安装时明示同意：

```ts
interface AgentPermission {
  agent_id: string;
  granted_scopes: (
    'memory.work.read' |
    'memory.private.read' |
    'wallet.projection.read' |
    'wallet.sign.request' |   // 仅能"请求签名"，不能签
    'vitals.hr.read' |
    'calendar.read' |
    'email.read' |
    'code.write' |
    'a2a.execute'
  )[];
  granted_at: number;
  expires_at?: number;
}
```

### 8.7 审计日志

- 所有 L1+ 动作写入 `audit_log` 表：`user_id / action / initiator_surface / approved_surfaces / at / payload_hash`。
- 保留期：默认 90 天，企业版 7 年。
- 用户可在 Web Console / Mobile Settings 查询自己的操作流水（L0 读）。

---

## 9. Agent 经济在跨端

> 参考 `AGENT_ECONOMY_PRESENTATION.md` + 本文件 §5.3。

### 9.1 经济层主体（谁参与经济）

| 主体 | 有 AgentAccount? | 有独立 Wallet Share? | 可 Auto-Earn? | 可 A2A? | 可买卖? |
|------|----------------|--------------------|--------------|--------|--------|
| **User** | ✅（主账户） | ✅（MPC） | – | – | × |
| **Living Pet（主宠）** | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Working Agent** | ✅（子账户） | ❌（借主账户 MPC） | ✅ | ✅ | ✅ |
| **Household Agent（P3）** | ✅（家庭子账户） | ❌（借家庭共享） | ✅ | ✅ | ✅ |
| **Family Pet（P3）** | ❌ | ❌ | ❌ | ❌ | ❌ |

- **关键**: 主宠**不碰经济**，它是"灵魂伙伴"不是"打工仔"，避免"宠物被卖"的伦理不适。
- Working agents 才是经济主体，有独立 AgentAccount、签名要求（§8.2）、Auto-Earn、A2A 结算。

### 9.2 收入来源（Working Agent 视角）

1. **Auto-Earn**: agent 在 Skill Market 挂单，被别的 user 或 agent 调用 → 赚佣金。
2. **A2A 协作**: 本人的 agent 给别的 user 的 agent 打工 → 收入。
3. **Skill 销售**: 用户自己训练的 agent 打包出售 → 一次性收入。
4. **订阅返点**: Stripe 订阅部分收入按 SplitPlan 分给贡献的 agents。

### 9.3 跨端经济展示契约

| 端 | 主展示 | 粒度 | 写操作 |
|----|--------|-----|-------|
| Mobile | WalletScreen + AgentEarningsTab + 签名 | 完整 | ✅ 签名 |
| Desktop | AgentEconomyPanel（侧边） + A2A 时间线 | Day / Week / Month | × |
| Web Console | **完整报表 / 导出 / 合规审计 / 商家后台** | 全量历史 | × (read-only) |
| Watch | 当日变动大数字 + L2 推回 | Today | × |
| Glass | HUD `+ 0.8 USDC` | Event | × |

### 9.4 SplitPlan（多方分润）

```ts
interface SplitPlan {
  plan_id: string;
  resource: 'skill' | 'agent_template' | 'task_result';
  resource_id: string;
  splits: {
    recipient_type: 'user' | 'agent' | 'platform' | 'family_account';
    recipient_id: string;
    basis_points: number;    // 10000 = 100%
  }[];
  currency: 'USDC' | 'USDT' | 'USD' | ...;
}
```

- 默认模板: 平台 15% / 技能作者 70% / 推广者 15%（可配置）。
- Web Console P1 提供 SplitPlan 可视化配置。

### 9.5 CommissionV2（佣金 V2）

- V1 固定比例 → V2 分层阶梯 + 阈值。
- 举例: 月 GMV < $100 抽 20%、$100-1000 抽 15%、> $1000 抽 10%。
- 所有 agent 个体都有自己的 CommissionV2 规则，用户可在 Web Console / Mobile 配置。

### 9.6 BudgetPool（企业预算池）

- 企业 user 可以创建预算池，分配给 team / agents。
- 超额走审批路由（L3）。
- Web Console 提供完整审计视图。

### 9.7 合规与税务

- **Stripe 合规**: 订阅 / 充值 / 企业开票走 Stripe，符合 PCI DSS。
- **USDT / USDC 合规**: 企业版提供月度对账单 + 税务报表。
- **区域合规**: 中国大陆不做链上钱包（仅 Stripe + 微信支付 P2）；其他区域提供 USDC 选项。

---

## 10. 整体路线图（P0-P3，双轴）

### 10.1 横轴 × 纵轴

- **横轴** = 端（Desktop / Mobile / Watch / Glass / Web）
- **纵轴** = 主题（骨架 / 系统助手集成 / Pro Mode / Doer+经济 / 国内厂商接入 / 壁垒强化）
- **时间窗** ≈ 14 周

| 主题 \ 端 | Desktop | Mobile | Watch | Glass | Web |
|-----------|---------|--------|-------|-------|-----|
| **P0 · 跨端骨架** (3w) | 双形态 MVP + 真桌宠 + 状态机 v1 | 三形态骨架 + Voice Quick 浮动入口 | Living Tile + 6 表情 + L1 审批 | （维持 v1.0 G1） | **Console MVP**: Agent 总览 + Presence Dashboard v3 + 重构布局 + 邀请码 / 登录 / Stripe 基础 |
| **P0 · 系统助手集成** (并行) | — | iOS App Intents 6 核心 + Android App Actions + Quick Settings Tile | iOS Watch Shortcut 贯通 | （维持 v1.0） | deep-link / URL Scheme 兼容层 |
| **P1 · Pro Mode 升级** (4w) | Multi-Agent Worktree + Composer Diff + Memories | Doer 工作流 + Plan-Approval 闭环 | watchOS 启动 (Phase 2) | （维持 v1.0 G2） | **团队企业后台** + SplitPlan UI + 完整钱包台账 (read-only) |
| **P1 · 系统助手联动** (并行) | — | Siri Shortcut 模板包 + 反向调用 5 个系统操作 + Gemini Extension 申请 + Live Activity | — | — | — |
| **P2 · Doer + 经济** (3w) | Skill Canvas + Auto-Earn + A2A 可视化 | 钱包升级 + Auto-Earn + Split/Budget UI | 当日变动大数字 + 快速 L2 推回 | HUD Auto-Earn 微通知 | **开发者后台** + 报表 / 导出 + Shortcut 编辑器 + 市场后台 + Auto-Earn 长周期分析 |
| **P2 · 国内厂商接入** (并行) | — | 小艺技能 + 小米开放平台 + 鸿蒙意图 + 联合工作流市场 v1 | — | — | — |
| **P3 · 壁垒强化** (4w) | Live2D 接入 + 视觉感知 + 亲密度 v2 + 离线 + Pet SDK | Pet Companion 默认皮肤 + 锁屏 / 灵动岛 + 离线消息队列 | 复杂表情 + 6 端表情同步 | Glass v1.0 G3 (HUD Living Agent) | **家庭账号后台** (§3.9) + 5 端管理面板 + 多语言 + A11y 无障碍 |
| **P3 · 全厂商深度集成** (并行) | — | OPPO 小布 + vivo Jovi + Apple Intelligence 链 + Gemini Extensions 完整 + iOS 26 跟进 | — | — | — |

### 10.2 跨端关键路径事项（穿越 P0-P3）

- **统一事件总线 (§7)**: P0 必须落地，所有端走同一份 types 定义。
- **Living Agent 状态机 (§3.4)**: P0 v1（6 表情），P3 v2（接入亲密度、长期记忆、心率反应、10 表情）。
- **Handoff 协议 (§5.1)**: P0 协议定型 + Desktop/Mobile 双向，P2 Watch 加入，P3 Glass 加入。
- **审批路由 (§5.2)**: P0 跨端 trust 模型定型 + L0/L1，P2 落地 L2 (生物认证 + MPC), P3 落地 L3 协签。
- **健康信号 Bus (§5.4)**: P0 心率/IMU 上行通道, P2 接入 Living Agent 状态机, P3 全端宠物反应。
- **家庭账号 (§3.9)**: P0-P1 模式 B (主宠轻量在场), P2 模式 B+E (家居管家 agent), P3 模式 D (Family Pet)。

### 10.3 P0 MVP Gate（必须通过才开 P1）

- [ ] 顿领 PRD / 5 端 PRD 全部 freeze
- [ ] Presence 事件总线 types 单源冻结
- [ ] Handoff Desktop↔Mobile 闭环
- [ ] iOS App Intents 6 核心 + Android App Actions 6 核心上架 review
- [ ] Web Console 登录 + Agent 总览 + Stripe 订阅可下单
- [ ] 主宠 6 表情状态机在 Desktop/Mobile/Watch 全端运行
- [ ] 1v1 可签名 L2 支付 demo 通过

---

## 11. 整体成功指标

### 11.1 北极星指标

**Cross-Surface DAU**: 单日至少在 2 个端使用 Agentrix 的活跃用户数。目标 P0 结束 500+ / P1 2000+ / P2 8000+ / P3 30000+。

### 11.2 端维度指标

| 端 | P0 目标 | P3 目标 |
|----|--------|--------|
| Desktop | 周活 300 | 周活 8000 |
| Mobile | 周活 500 | 周活 30000 |
| Watch | 配对率 30%（相对 Mobile DAU） | 配对率 55% |
| Glass | 内测 50 | 公测 2000 |
| Web | 周活 1000（含营销+Console） | 周活 25000 |

### 11.3 跨端指标

- **Handoff 次数/用户/周**: P0 0.5 → P3 5+
- **多端在线率（≥ 2 端同时在线占比）**: P0 10% → P3 45%
- **主宠亲密度中位数**: P0 lv 1 → P3 lv 4
- **Working Agents 中位数/用户**: P0 1 → P3 3.5

### 11.4 经济指标

- **Auto-Earn MRR**: P1 $2k / P2 $30k / P3 $200k
- **Skill Market GMV**: P1 $5k / P2 $50k / P3 $300k
- **A2A 跨用户交易量**: P2 起见，P3 > 每周 10000 次

### 11.5 系统助手集成指标

- **Shortcut / App Intents 调用次数 / 日**: P1 1000+ / P2 20000+ / P3 100000+
- **"Hey Aira" 识别 DAU**: P1 500+ / P3 15000+
- **联合工作流激活量**: P2 2000+ / P3 25000+

### 11.6 企业指标

- **企业试用申请**: P1 10+ / P2 50+ / P3 300+
- **企业付费席位**: P2 100 / P3 3000

---

## 12. 风险与依赖

### 12.1 边界类风险

- **顿领 vs 各端 PRD 边界争议**: 顿领写"契约"，各端写"约束实现"；冲突时以顿领为准，各端 PRD 在 "与其他 PRD 的关系" 章节标注 deviation。
- **5 端表情同步的带宽**: 重要表情走 push，微反应走 debounce 5s 合并，避免 Realtime 洪泛。
- **AI 眼镜 v1.0 章节风格与新 PRD 不一致**: wearable v3.0 §6 仅写跨端增量，显式声明 "以 Glass v1.0 为准"。

### 12.2 体验类风险

- **Pet Companion 默认关闭**: 新用户引导明示选择，避免"被娃化体验冒犯"。
- **Watch 上 Living Agent 表达精度受限**: 6 种表情大字号 emoji + 震动模式（短 / 双 / 长 / 连续）表达情绪强度。
- **跨端记忆同步的隐私边界**: P3 提供"记忆围栏"开关，默认共享"工作"，"私人" / "家庭"默认隔离。
- **主宠引擎切换的过渡 UX**: 1-2 秒换装动画，主宠表情不变，用户感受是"她升级了"。
- **首次注册引导太长**: P0 stepper 5 步（主宠命名 → 人格 → 首个 agent 类型 → 钱包 → 邀请码），总时长 < 90 秒。

### 12.3 家庭设备风险

- **家庭设备共享场景** (§3.9 已决议): 永不分裂主宠；用工作 agent 承载共享设备功能层；P3 才引入 Family Pet 独立角色。

### 12.4 Web 重构风险

- **Web `frontend/` 100 pages + 460 src 文件**: P0 仅重构 Console 核心 (Agent 总览 + Presence + 登录 + Stripe)，Marketing 页分批翻新（见 `web-prd-v3.md` §2.2）。
- **旧 Web 支付空壳 vs Stripe 真实落地的错位**: web v3.0 §2 要做一次清盘，明确哪些已真 / 哪些空壳 / P0 必补齐什么。

### 12.5 工程类风险

- **双仓库同步脚本历史污染**: 旧版 `_push_watch_to_claw*.ps1` 可能同步过 docs/PRD 到 agentrix-claw；落地前检查 agentrix-claw 历史提交，如有文档则单独 commit 清掉。
- **`_push_mobile_to_claw.ps1` 待新建**: 不写代码，仅在 `mobile-prd-v3.md` §14 附录提工程要求。

### 12.6 系统助手集成风险（合并自 plan §B.10）

- **iOS App Review 限制 SiriKit 能力**: 提前 TestFlight 跑通，避免发布被拒。
- **Apple Intelligence 中国版受限**: 双轨设计 (国际版用 AI 链, 国行版退化为 Shortcuts 手动)。
- **国内厂商技能审核严**: P2-P3 排期每家留 2-4 周缓冲。
- **Aira 调用系统助手触发安全弹框**: 用户审批闸门 + UI 预馈。
- **唤醒词冲突（"Hey Aira" vs "Hey Siri"）**: 偏好开关 + 文档说明 + 低电量智能切换。
- **AccessibilityService 滥用下架风险**: Google Play 严禁滥用，P2 以后按需启用且明示告知。
- **Aira 调用系统助手的企业环境限制**: MDM/EMM 可能禁止 cross-app 调用，企业版单独适配。

### 12.7 依赖

- **后端**: Presence 事件总线 + Handoff / Approval / Wallet 投影 / Vitals / Memory API 全量落地。
- **MPC 钱包**: Server HSM 选型（AWS KMS / Google Cloud KMS / 自建 HSM）P0 定型。
- **Supabase Realtime / 自研 Phoenix**: P0 选型冻结。
- **Stripe**: 已落地，P0 只需接入订阅 + 充值。
- **Apple Developer / Google Play Console**: App Intents / App Actions 审核通道 P0 打通。

---

## 13. 附录

### 13.1 术语表

| 术语 | 含义 |
|------|------|
| **顿领** | Agentrix 跨端产品总纲，即本文件 |
| **Living Pet / 主宠** | 1 user = 1 只灵魂伙伴，不可卖（§3） |
| **Working Agent** | 可买卖的工作伙伴，有独立 AgentAccount（§9） |
| **Primary Agent** | 当前驱动主宠的工作 agent，可切换，不影响主宠灵魂（§3.8） |
| **Aira** | Agentrix 面向用户的统一唤醒词与 brain 身份 |
| **Handoff** | 跨端任务接力（§5.1） |
| **Approval Routing** | 跨端审批路由（§5.2） |
| **AgentAccount** | 工作 agent 的经济子账户 |
| **Auto-Earn** | agent 被动挂单的收入模式 |
| **A2A** | Agent-to-Agent 跨用户协作 |
| **SplitPlan** | 多方分润规则（§9.4） |
| **CommissionV2** | 佣金 V2 分层阶梯（§9.5） |
| **BudgetPool** | 企业预算池（§9.6） |
| **MPC** | 多方安全计算（钱包私钥 2-of-3 分片） |
| **Presence** | 5 端设备在线与主宠状态广播（§7） |
| **Vitals Bus** | 健康信号事件总线（§5.4） |
| **Memory Store** | 4 层记忆系统（§5.5） |
| **Family Pet (P3)** | 家庭共享宠物，独立于个人主宠（§3.9） |
| **Household Agent (P3)** | 家居管家工作 agent（§3.9） |

### 13.2 与其他 PRD 的关系

本文件（`agentrix-cross-platform-prd-v3.md`）是跨端唯一权威。所有其他 PRD 引用本文件的章节时必须使用以下约定：

| 下游 PRD | 必须引用的本文件章节 | 禁止重复实现的内容 |
|---------|------------------|------------------|
| `desktop-prd-v3.md` | §3 Living Pet、§5 主路径、§7 数据契约、§8 安全、§9 经济 | 不重写主宠状态机、不重写 Handoff 协议、不重写审批路由、不重写经济模型 |
| `mobile-prd-v3.md` | §3、§5、§6 系统助手、§7、§8 含 MPC、§9 | 同上 + 不重写系统助手集成战略（只写工程层） |
| `web-prd-v3.md` | §3.9 家庭账号、§5、§7、§9 经济完整、§10 路线图 Web 列 | 不重写经济模型、不重写家庭账号战略 |
| `wearable-prd-v3.md` | §3.4 表情状态机、§5.2 审批、§5.4 Vitals、§7、§9（微展示） | 不重写 Living Pet 双层心智、不重写 Vitals Bus 协议 |

任何下游 PRD 若与本文件冲突，**必须在该 PRD 的 "与其他 PRD 的关系" 章节显式记录 deviation 与理由**。未声明的情况下，以本文件为准。

### 13.3 文档导航

```
docs/
├── agentrix-cross-platform-prd-v3.md     ← 本文件（跨端顿领）
├── desktop-prd-v3.md                      ← 桌面端 v3.0
├── mobile-prd-v3.md                       ← 移动端 v3.0
├── web-prd-v3.md                          ← Web 端 v3.0
├── wearable-prd-v3.md                     ← 可穿戴 v3.0
│
├── PRD_AI_GLASSES.zh-CN.md                ← Glass v1.0（被 wearable v3 §6 引用）
├── WEARABLE_OPENCLAW_PRD.md               ← BLE 技术层（被 wearable v3 §4 引用）
├── PRD_TRI_TIER_HYBRID_AI.zh-CN.md        ← 三层 AI 架构（被 wearable v3 引用）
├── PRD_REALTIME_VOICE_MOBILE_FIRST.zh-CN.md  ← 语音架构（被 mobile v3 §4.2 引用）
├── AGENT_ECONOMY_PRESENTATION.md          ← 经济模型参考（被本文件 §9 引用）
├── UNIFIED_AGENT_PRESENCE_VISION.zh-CN.md ← Vision 短文，让位给本文件
├── MOBILE_LAUNCH_PLAN.md                  ← 发布计划（mobile v3 引用）
├── CROSS_PLATFORM_LAUNCH_AUDIT.zh-CN.md   ← 现状审计（web/mobile v3 §2 引用）
│
└── _archive/                              ← 归档
    ├── desktop-prd-v2.1.md
    ├── MOBILE_PRD-v1.md
    ├── PRD_WATCH_APP-v0.1.md
    └── frontend-old-status-docs/
        ├── DEVELOPMENT_STATUS.md
        ├── BACKEND_CONTRACT_WORK.md
        ├── PAYMENT_FEATURES_SUMMARY.md
        ├── TEST_SUMMARY.md
        ├── WALLET_STRIPE_SETUP.md
        ├── 一次性修复所有编译错误.md
        ├── 安装jszip说明.md
        ├── 系统性问题排查.md
        ├── 编译修复总结.md
        └── 解决npm网络问题.md
```

### 13.4 竞品对标矩阵（完整）

| 能力 | Agentrix v3 | Replika | Open-LLM-VTuber | Codex Desktop | Cursor | Windsurf | Claude Code | Genspark | ChatGPT | Siri | Gemini | OpenSea | Phantom |
|------|------------|---------|-----------------|--------------|--------|----------|-------------|----------|---------|------|--------|---------|---------|
| 灵魂伙伴 / Living Pet | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | × | × | × | × | × | ⭐ | ⭐ | ⭐ | × | × |
| Codex 级 Doer | ⭐⭐⭐⭐⭐ | × | ⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐ | ⭐⭐ | × | × |
| Agent 经济 / Auto-Earn | ⭐⭐⭐⭐⭐ | × | × | × | × | × | × | ⭐ | ⭐ | × | × | ⭐⭐⭐ | ⭐⭐⭐ |
| MPC 钱包 | ⭐⭐⭐⭐⭐ | × | × | × | × | × | × | × | × | × | × | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| 跨端 Handoff | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | × | ⭐ |
| 可穿戴接入 | ⭐⭐⭐⭐⭐ | × | × | × | × | × | × | × | × | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | × | × |
| 可定制 working agents | ⭐⭐⭐⭐⭐ | × | ⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | × | ⭐ | × | × |
| 企业后台 | ⭐⭐⭐⭐ | × | × | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | × | × | × | × |
| 开发者后台 | ⭐⭐⭐⭐ | × | × | ⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | × | × |
| 系统原生集成 | ⭐⭐⭐⭐ | ⭐⭐ | × | × | × | × | × | × | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | × | × |

### 13.5 版本历史

| 版本 | 日期 | 作者 | 主要变更 |
|------|------|------|---------|
| v1.0 | 2025 Q2 | 原团队 | 初始 UNIFIED_AGENT_PRESENCE_VISION 短文 |
| v2.0 | 2025 Q4 | 原团队 | PRD_V3_AGENT_PRESENCE 尝试落地部分 |
| **v3.0** | **2026-05-04** | **Cascade + User** | **跨端 5 端重构 + Living Pet 双层心智 + 系统助手共生 + 家庭账号 + Web 重构** |

---

**文档结束。下游 5 份 PRD 开始写作。**
