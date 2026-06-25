# Agentrix 移动端 PRD v3.0（Mobile · iOS + Android）

> **移动 = 钱包 + 嘴巴**：签名中心、Push 主端、语音 Quick、系统助手原生深度集成。
>
> 本文件只写移动端实现，不重写跨端层。所有跨端契约引用顿领 PRD `agentrix-cross-platform-prd-v3.md`。

- 版本: v3.0（上接 `_archive/MOBILE_PRD-v1.md`）
- 定位: 三形态（Home Console + Voice Quick + Pet Companion）
- 技术栈: React Native (Expo) + 原生模块（iOS App Intents / Android App Actions）
- 仓库策略: 代码在 `Agentrix-website`（单一事实源），发分发到 `agentrix-claw`（见 §14）
- 规划源: `plans/agentrix-cross-platform-prd-v3-fdc618.md` §4 + §10

---

## 0. 一句话定位 + 三形态

### 0.1 一句话定位

**Agentrix Mobile = 你的 Web3 钱包 + 语音快捷助手 + 可选的主宠陪伴，深度集成到 iOS / Android / 国内四家助手生态，是全端唯一签名端**。

### 0.2 三形态一览

| 形态 | 名字 | 启动方式 | 主界面 | 默认状态 | 目标频次 |
|------|------|---------|-------|---------|---------|
| **Home Console** | 主控台 | Tab Bar 主入口 | 流式列表 + Agent Tab + Team Tab + Doer 入口 | **默认开启** | 每日 5-20 次 |
| **Voice Quick** | 语音快速 | 浮动按钮 / 系统手势 / Siri/Gemini 唤起 / 锁屏快捷 | 圆形语音胶囊 + 转写 | **默认开启** | 每日 10-50 次（碎片） |
| **Pet Companion** | 主宠陪伴 | 用户主动开启（默认关闭） | 全屏 / 小窗 / 锁屏 / 灵动岛 | **默认关闭**（防娃化反感） | 按需 |

### 0.3 三形态对比

| 维度 | Home Console | Voice Quick | Pet Companion |
|------|--------------|-------------|---------------|
| 打扰度 | 不打扰（用户进入） | 低打扰（快速脱离） | 用户可控（静音 / 隐藏） |
| 主宠在场 | 状态徽（顶部 pill） | 隐身（主宠 emoji 短暂闪） | 全屏 Live2D / 锁屏 / 灵动岛 |
| 跨端关系 | 与桌面 Pro Mode 双向 Handoff | 与桌面浮球 listen 态双向 Handoff | 与桌面 Living Agent 形态双向 |
| 签名入口 | ✅ 主入口 | ✅ 紧急审批 | × |
| 适合用户 | 全员 | 全员 | 陪伴需求强烈者 |

---

## 1. 三层愿景在移动端的体现

| 层 | 移动主阵地 | 对应形态 | 关键能力 |
|----|-----------|---------|---------|
| **Living Agent** | 情感反馈 / 主动问候 / 陪伴 | Pet Companion（可选） + Home Console 状态徽 | Live2D / 锁屏 / 灵动岛 |
| **Doer** | 审批、语音任务、Push 接收、碎片指令 | Home Console 的 Doer Tab + Voice Quick | Plan-Approval 闭环 / 系统助手暴露 |
| **Economy** | 钱包签名、Auto-Earn 仪表盘、订阅 | Home Console 的 Wallet Tab | 生物认证 + MPC + Stripe + Auto-Earn |

---

## 2. 现状基线

### 2.1 从 `MOBILE_PRD.md` v1.0 继承的能力

- React Native + Expo 基础架构
- 登录 / 注册 / 邀请码
- 基础钱包 UI（需升级至 MPC + Stripe 完整）
- Agent 列表
- 推送通道（FCM / APNs）
- 相机 / 相册 / 位置 / 麦克风权限

### 2.2 v1.0 功能完成度（审计）

| 模块 | v1.0 状态 | v3.0 目标 |
|------|----------|----------|
| 登录 / OAuth | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐（Passkey） |
| 钱包 | ⭐⭐⭐（空壳多） | ⭐⭐⭐⭐⭐（MPC + Stripe + USDC） |
| Agent Tab | ⭐⭐ | ⭐⭐⭐⭐⭐（Team + A2A） |
| 语音 | ⭐⭐ | ⭐⭐⭐⭐⭐（Voice Quick + Realtime） |
| 主宠 | 不存在 | Pet Companion（默认关） |
| 系统助手 | 不存在 | 原生深度集成（§10） |
| Push | ⭐⭐⭐ | ⭐⭐⭐⭐（Live Activity + 灵动岛） |

### 2.3 现状 Bug / 历史负债（抽自现有审计）

- 钱包 Stripe guest checkout 已真实，但 Web3 签名链路未贯通 → P0 补齐
- 邀请码流程在 v1.0 能用但 UX 割裂 → P0 重构为 5 步 stepper
- 三形态架构完全缺失 → P0 从零建
- 系统助手层完全缺失 → P0 起步

### 2.4 关键源文档

- `MOBILE_PRD.md` v1.0（将归档到 `_archive/MOBILE_PRD-v1.md`）
- `MOBILE_UX_OPTIMIZATION_PROPOSAL.md` / `MOBILE_UX_V4_FINAL.md`（保留 UX 细节参考）
- `MOBILE_LAUNCH_PLAN.md`（邀请码 200→1000 计划仍有效）
- `PRD_REALTIME_VOICE_MOBILE_FIRST.zh-CN.md`（语音架构引用）
- `PRD_LOCAL_WAKEWORD_MOBILE.zh-CN.md`（唤醒词架构引用）
- `Agentrix_Mobile_Optimization_Plan.md`（优化计划参考）

---

## 3. 竞品对标（移动视角）

### 3.1 对标矩阵

| 对手 | 优势 | Agentrix Mobile v3 的回答 |
|------|------|-------------------------|
| **ChatGPT App (iOS/Android)** | 品牌、语音 Advanced | 我们跨端 + Web3 + Economy + 可定制 agents |
| **Claude App** | 长上下文、Artifacts | 我们主宠 + Doer + Economy + 系统助手集成 |
| **Gemini App** | 系统原生（Android） | 我们作为 Gemini Extension 共生（模式 A） |
| **Character.AI / Replika App** | 陪伴 / 情感 | 我们叠加 Economy + Doer |
| **Phantom / Coinbase Wallet** | Web3 钱包 | 我们叠加 agents + 陪伴 + 系统助手 |
| **Apple Shortcuts / 快捷指令** | 系统原生 | 我们作为 Intent 源共生（模式 A） |
| **HeyLemon / Rewind Mobile** | 语音 / 记忆 | 我们跨端 + Economy |
| **国内 ChatGPT 壳 app** | 本地化 / 微信支付 | 我们跨端 + 正版 + 小艺 / 小爱集成 |

### 3.2 差异化三板斧

1. **三形态明确分工**：不是"一个 app 塞一切"，而是按使用频次 / 打扰度拆三态。
2. **系统助手深度共生**：不是外挂，是 App Intents / App Actions / 小艺 / 鸿蒙意图原生暴露 + 反向调用。
3. **签名中心定位**：移动是全端唯一 Trust=3，手机丢失有 MPC 恢复，其他端永远不持 share。

---

## 4. 三形态详规

### 4.1 Home Console 形态（主控台）

#### 4.1.1 Tab Bar 结构（5 Tab）

| Tab | 图标 | 功能 |
|-----|------|------|
| **首页 / Today** | 🏠 | 主宠状态徽 + 今日摘要 + Handoff 入口 + 经济微卡片 + 待审批 |
| **Agents** | 🤖 | Working agents 列表 + 单独进入 / 管理 |
| **Team** | 👥 | 团队视图（多 agent 协作可视化，A2A 可视化） |
| **Wallet** | 💰 | 完整钱包：余额 / 收入 / Auto-Earn / Stripe / USDC / 交易历史 |
| **Me** | 👤 | 设置 / 邀请 / 引擎切换 / 隐私 / 订阅 |

#### 4.1.2 Today 首页关键模块

```
┌──────────────────────────────────────┐
│  [主宠头像 + 状态徽]  👋 早上好        │  <- 主宠 emoji pill
│  亲密度 lv 3 · happy                  │
├──────────────────────────────────────┤
│  📋 待办 · 2 条                        │  <- 今日 tasks (L0-L1)
│  💸 待审批 · 1 条 · $24.50 (L2)       │  <- 审批 (触发生物认证)
│  📱 Handoff · 桌面 Pro Mode 进行中     │  <- 引用顿领 §5.1
├──────────────────────────────────────┤
│  💰 今日经济                           │
│    余额 $128.50                        │
│    Auto-Earn 今日 +$2.40               │
│    [→ 查看详情]                        │
├──────────────────────────────────────┤
│  🤖 你的 Agents (3 在线)              │
│    draft-pro · idle                   │
│    coder-v2 · running (桌面)          │
│    seeker · waiting_approval          │
└──────────────────────────────────────┘
```

#### 4.1.3 Agents Tab

- 列表展示所有 working agents，卡片式。
- 每张卡片: 头像 / 名字 / 人格标签 / 今日贡献 / skill 集合。
- 点击进入 agent 详情: 记忆 / 权限 / 经济账户（read-only）/ 交互历史。
- 右上角 "+" 从 Skill Market 购买新 agent。

#### 4.1.4 Team Tab

- 多 agent 协作可视化（A2A graph）。
- 支持用户手动组队 + 保存"Team 预设"。
- 显示待处理的 A2A 请求。

#### 4.1.5 Wallet Tab

- 顶部: 主账户余额 + 今日变动。
- 中部 Tab: Balances / Transactions / Auto-Earn / Stripe / Settings。
- **生物认证门**: 进入 Wallet Tab 首次需 Face ID / Touch ID。
- **关键动作**: 充值（Stripe） / 提现（USDC，L3 需协签） / 签名待处理操作。

#### 4.1.6 Doer 入口（Home Tab 顶部的 FAB）

- 悬浮按钮: `✨ 让 Agent 干活`
- 点击进入 Plan-Approval 闭环:
  1. 用户输入任务 / 语音 / 选模板
  2. Agent 返回 plan（步骤列表）
  3. 用户 review plan → L1 审批 → 执行
  4. 过程中随时查看进度 / 中断
  5. 完成后通知 + 结果卡片

### 4.2 Voice Quick 形态（语音快速）

#### 4.2.1 启动方式

- Home Console 底部悬浮按钮（主手势）
- 锁屏 Control Center 快捷
- Action Button（iPhone 15+）/ 双击电源 / 侧键映射
- Siri / Gemini: "Hey Siri, ask Agentrix ..."（模式 A）
- 灵动岛 / Live Activity 展开

#### 4.2.2 UI

```
┌──────────────────────────────────────┐
│        🎤  (圆形语音胶囊)              │
│        正在听...                      │
│   "帮我看看今天的日程"                  │
│                                       │
│  [×]                          [发送]  │
└──────────────────────────────────────┘
```

- 胶囊悬浮在屏幕下半部，背景模糊。
- 语音实时转写 + 纠错。
- 支持打断 + 追问。
- ≤ 3s 响应或 ≤ 500 字简短回答时保持 Voice Quick，超出时提示 "打开完整对话?" → 进入 Home Console。

#### 4.2.3 语音技术栈（引用 `PRD_REALTIME_VOICE_MOBILE_FIRST.zh-CN.md`）

- **本地唤醒词**（P1+）: "Hey Aira" 低功耗本地检测（Porcupine / Whisper VAD）
- **STT**: WhisperX / 国内厂商 API（讯飞 / 百度）双通道
- **TTS**: ElevenLabs / Google Cloud TTS / 国内合作
- **Realtime**: OpenAI Realtime API / Gemini Live（延迟 < 500ms）

#### 4.2.4 低电量降级

- 电量 < 20% → 关闭"Hey Aira"常驻唤醒，只保留按键触发。
- 唤醒词识别偏好自动切"系统优先"（顿领 §6.9）。

### 4.3 Pet Companion 形态（主宠陪伴）

#### 4.3.1 默认关闭

**关键设计**：默认关闭，避免"打开就是宠物"让 Prosumer 用户反感。只有用户明确在设置中打开才呈现。

#### 4.3.2 三种子形态

| 子形态 | 触发 | 视觉 |
|-------|------|------|
| **全屏 Pet** | 设置开启后长按首页主宠徽 | 全屏 Live2D + 对话气泡 |
| **小窗 Pet** | 设置开启 + app 在后台 | 桌面小窗（Android Bubble / iOS Widget） |
| **锁屏 Pet** | 设置开启 + 锁屏 | 锁屏小部件显示主宠表情 + 心情 |
| **灵动岛 Pet** | iPhone 14+ 灵动岛 | 动态岛实时显示主宠状态 |

#### 4.3.3 交互

- **全屏**: 双击主宠 = 语音对话，长按 = 隐藏主宠返回首页。
- **小窗**: 拖拽位置，双击展开，摇动 → 主宠回头看镜头。
- **锁屏**: read-only 展示，点击主宠进入 Voice Quick。
- **灵动岛**: 主宠做长任务时显示进度条 + emoji，点击进入 Home Console 进度页。

#### 4.3.4 Pet Companion 的伦理红线

- 不主动推送"我想你了"等诱导回流内容。
- 亲密度不因"日常不互动"而快速下降（反衰减，顿领 §3.5.1）。
- 不强制购买装扮、不限时促销装扮。
- 提供"静音主宠"一键开关，关闭后主宠仅保留状态徽，无主动行为。

### 4.4 三形态切换

- Home Console ↔ Voice Quick: Home 底部悬浮按钮 / 任意 app 的系统手势。
- Home Console ↔ Pet Companion: 仅设置中开关 + 长按主宠徽。
- Voice Quick ↔ Pet Companion: 不直接切换，Voice Quick 完成后回上一个主形态。

---

## 5. Living Pet 在移动端的表达

> 引用顿领 §3。此处只写移动层表达。

### 5.1 主宠状态徽（Home Tab 顶部）

- Pill 形状（宽 80×高 32），包含: 小头像 + 当前 emoji + 亲密度 lv + mood 颜色。
- 点击 → 进入主宠详情页（记忆 / 引擎 / 人格 / 装扮）。
- 长按 → 直接进入 Voice Quick 与主宠对话。

### 5.2 Pet Companion 全屏（需用户开启）

- Live2D（P3）+ 对话气泡 + 背景时间轴（晨 / 午 / 晚）。
- 左下: 历史对话入口；右下: 语音按钮；右上: 静音 / 返回。
- 双击屏幕: 主宠回应。

### 5.3 Pokémon 式 agent 出场

- 用户在 Home Console Doer 发起任务 → 派遣的 working agent 从屏幕右下滑入 → 任务期间右上角小徽标 → 完成后退场。
- 比桌面简化（更短动画 800ms）。

### 5.4 引擎切换（顿领 §3.8）

- 设置 → 主宠 → 引擎，选择 LLM provider。
- 切换时主宠 emoji 短暂光晕 0.8s，其余 UI 不变。
- 第一条对话自动带入 recent_memory_snippets。

---

## 6. 跨端联动（引用顿领 §5）

### 6.1 Handoff（顿领 §5.1）

- Home Tab 顶部常驻 Handoff pill（有活跃 handoff 时高亮）。
- 接收 Banner: 全屏 Modal 大按钮（接力 / 镜像 / 忽略），突出显示为 L1 动作。
- 接力后: Home Console 转入 task 详情页，显示当前进度 + 能继续对话。
- 发起: 任意 Home Console 任务运行 > 30s 时右上角出现 "Handoff to..."。

### 6.2 Approval Routing（顿领 §5.2）

- **移动是唯一 L2/L3 签名端**。
- UI 分级:
  - L0: 无需弹窗
  - L1: 底部 sheet 确认（一次点击）
  - L2: 全屏 modal + 生物认证 + MPC 签名
  - L3: 全屏 modal + 生物认证 + 强制 ≥ 1 协签（Desktop / Web）

### 6.3 Wallet（顿领 §5.3）

- **真实资产源**：Wallet Tab 是真实 MPC share 持有端。
- **本地存储**：iOS Keychain / Android Keystore TEE 存 Share 1。
- **签名流程**：请求签名 → 用户生物认证 → 本地签名 + 服务端 HSM 协签 → 上链 / Stripe 确认。

### 6.4 Vitals（顿领 §5.4）

- 移动也是 Vitals source（位置 / 日历 / 锁屏时长 / 通话时长）。
- 上报频率: 每 60s 聚合一次。
- 默认关闭，用户白名单开启每项（GDPR/PIPL 友好）。

### 6.5 Memory（顿领 §5.5）

- Home Console "Me" Tab 有 Memory 管理入口。
- 用户可手动添加、标签（工作 / 私人 / 家庭）、固定、删除。
- Pet Companion 模式下主宠可"问 + 记": "你是 X 公司的产品经理对吧？" → 用户确认 → 写 User Memory。

---

## 7. Agent 经济在移动端（引用顿领 §9）

### 7.1 Wallet Tab 详规

- **Balances**: 主账户 + 各 AgentAccount 余额，支持多币种（USDC / USDT / CNY / USD）。
- **Transactions**: 完整历史，可筛选（kind / agent / date）。
- **Auto-Earn**: 实时仪表盘，当日 / 7 日 / 30 日趋势。
- **Stripe**: 订阅管理（进入 Stripe Customer Portal webview）。
- **Settings**: CommissionV2 / SplitPlan（移动仅查看，配置在 Web Console）。

### 7.2 签名流程（L2 示例）

```
1. 用户点击 "提现 $50 USDC"
2. 移动显示 modal: 金额 / 手续费 / 接收地址 + 生物认证按钮
3. 用户 Face ID → LocalAuthentication / BiometricPrompt
4. 本地 Share 1 + 服务端 Share 2 协作签名（2-of-3）
5. 广播到链 / 服务端确认
6. 推送完成通知 + Home 显示最新余额
```

### 7.3 Auto-Earn 仪表盘

- 今日折线 + 7 日柱状 + 30 日趋势。
- 异常检测: 突降 > 40% 红色提示 + 建议检查 agent 状态。
- 点击 agent 过滤查看单个 agent 的贡献。

### 7.4 订阅 / 企业

- 订阅管理: Stripe Customer Portal 嵌入 webview。
- 企业版: 邀请 / 付费席位管理跳转 Web Console。

---

## 8. 用户画像与核心流程

### 8.1 画像

- **全员**（因为移动是全用户覆盖端）
- **重点 Persona**:
  - **碎片指令者**: 随时用 Voice Quick 下指令。
  - **钱包用户**: 需要签名、关心 Auto-Earn、经济主战场。
  - **陪伴需求者**: 主动打开 Pet Companion。
  - **企业员工**: 审批多、走 BudgetPool。

### 8.2 Day-in-the-life

```
07:30  Siri 早安 → Apple Shortcut 触发 Agentrix "早安简报"
       → Voice Quick 胶囊冒出，播报今日日程 + 待审批
       → 主宠 pill 显示 happy

09:15  地铁 → Pet Companion 锁屏显示主宠 calm
       → 桌面发起的 Handoff 推送 → 点击进 Home Console 接力

10:00  到公司开机 → 桌面 Pro Mode 接回任务
       → Mobile 转为钱包 + 审批 + Voice Quick 角色

12:00  午饭 → Voice Quick "查询今天 Auto-Earn"
       → 语音回答 "今日 $1.80"

14:30  收到 L2 支付审批推送 → Home Console 全屏 modal
       → Face ID → MPC 签名 → 完成 → 桌面自动继续流程

17:00  Auto-Earn 达到里程碑 $50/月 → 灵动岛庆祝 + 主宠 excited

20:00  通勤回家 → Pet Companion 小窗（设置开启者）
       → 主宠 calm → 看到心率数据建议休息

22:30  准备睡觉 → Voice Quick "明天提醒我..."
       → 主宠 tired → "晚安" → 关闭 app
```

### 8.3 核心流程清单

| 编号 | 流程 | 涉及顿领 § / 本文件 § |
|------|------|--------------------|
| F1 | 首次注册 5 步 stepper | §4.1 + 顿领 §0.3 注册引导 |
| F2 | 邀请码兑换 | §2.3 |
| F3 | 钱包初始化（MPC share 1 生成） | 顿领 §8.2 + §7.2 |
| F4 | Voice Quick 唤起 + 对话 | §4.2 |
| F5 | Home Console 三形态切换 | §4.4 |
| F6 | L2 生物认证 + 签名 | §7.2 + 顿领 §5.2 §8.3 |
| F7 | Handoff 发起 / 接受 | §6.1 |
| F8 | Doer Plan-Approval 闭环 | §4.1.6 |
| F9 | 系统助手调用 Agentrix | §10 |
| F10 | Pet Companion 开启 + 子形态切换 | §4.3 |
| F11 | Auto-Earn 订阅 / 查看 | §7.3 |
| F12 | 引擎切换 | §5.4 |

---

## 9. 数据 / 通信契约（引用顿领 §7）

### 9.1 移动订阅的 Topics（全部）

- `user.{user_id}.presence` – heartbeat
- `user.{user_id}.pet.state` – 主宠状态
- `user.{user_id}.handoff` – Handoff
- `user.{user_id}.approval` – **核心，必须订阅**（L2/L3 主要通过移动签名）
- `user.{user_id}.wallet` – 钱包
- `user.{user_id}.vitals` – 自身贡献 + 接收聚合
- `user.{user_id}.agent.*.event` – agent 任务
- `user.{user_id}.economy.event` – 经济事件
- `user.{user_id}.memory.changed` – 记忆失效

### 9.2 移动本地存储

| 数据 | 存储 | 加密 | TTL |
|------|------|------|-----|
| MPC Share 1 | iOS Keychain / Android Keystore TEE | 系统级 | 永久（生物识别门控） |
| Session memory | SQLite (Expo SQLite) | SQLCipher | 30 天 |
| Agent memory cache | SQLite | SQLCipher | 7 天 |
| 浮球位置 / 偏好 | AsyncStorage | – | 永久 |
| Vitals 临时聚合 | Memory（不落盘） | – | 60s |
| 通知历史 | SQLite | – | 90 天 |
| Pet Companion 配置 | AsyncStorage | – | 永久 |

### 9.3 Realtime / 离线

- WebSocket 主通道 + 推送 fallback。
- 离线时显示"离线模式"，所有 L1+ 动作排队，联网后 flush（24h 内）。
- Push 推送里带 `handoff_id` / `approval_id` 可点直达对应 modal。

### 9.4 Push 策略

- **优先级**:
  - L3 审批: Critical + Sound + 持续震动
  - L2 审批: High + Sound
  - Handoff: Default
  - Auto-Earn 里程碑: Default
  - Pet Companion 主动推（开启者）: Low + debounce
- **iOS Focus Mode 友好**: L3 走 Critical Alert（需授权），其他尊重 Focus。
- **Android Heads-up**: 仅 L2+ 或 Critical handoff。

---

## 10. 系统 AI 助手集成层（重点章 · 工程映射 §B）

> 映射顿领 §6 战略到移动端工程层。本章是移动 PRD 的最长章节（因为工程深度最大）。

### 10.1 iOS + Siri 集成

#### 10.1.1 App Intents 6 核心（P0）

| Intent | 类 | Parameter | 意图短语 |
|--------|-----|-----------|---------|
| `AskAiraIntent` | Conversational | `query: String` | "Ask Agentrix about / Hey Siri, ask Aira..." |
| `DraftIntent` | Content | `kind: Enum`, `prompt: String` | "用 Aira 起草 XX" |
| `ApproveIntent` | Approval | `task_id: String` | "批准 XX 任务" |
| `WalletStatusIntent` | Query | – | "Aira 今日余额" |
| `InvokeAgentIntent` | Invoke | `agent_id: String`, `task: String` | "让 XX agent 干活" |
| `HandoffIntent` | Flow | `device: String` | "Handoff 到桌面" |

#### 10.1.2 App Intents 扩展（P1）

- `SummarizeDayIntent` / `EarnStatusIntent` / `PetMoodIntent` / `MemoryAddIntent`
- Shortcut 模板包（5 个默认模板，P1 上架）

#### 10.1.3 Apple Intelligence 链（P2）

- iOS 18+ 的 AI 链能力对接，Aira 作为 provider 参与链式调用。
- 国行版降级为手动 Shortcut（Apple Intelligence 中国受限）。

#### 10.1.4 URL Scheme & Shortcuts Deep Link

- `agentrix://open`
- `agentrix://agent/{id}/invoke?task=...`
- `agentrix://wallet/balance`
- `agentrix://approve/{taskId}`
- 每个深链都对应一个 App Intent 包装。

#### 10.1.5 Live Activity / 灵动岛（P1）

- **长任务**: 进度条 + agent emoji + 剩余时间。
- **Handoff**: 跨端接力进度。
- **Auto-Earn 里程碑**: 短暂庆祝动画。
- **主宠**: 开启 Pet Companion 灵动岛后主宠 emoji 常驻。

#### 10.1.6 iOS 审核风险

- SiriKit / App Intents 近年审核较严格，尤其 Approval / Wallet 类 Intent。
- **对策**: P0 TestFlight 跑通 + 小规模审核试水；准备退化到 URL Scheme 兜底。

### 10.2 iOS Watch Shortcut 贯通（P0）

- Watch 上的 Shortcut 调用 iPhone 端 Agentrix App Intent。
- 典型流: 手表 Complication 按钮 → 触发 ApproveIntent → 推到手机生物认证。
- 技术: Watch Connectivity + iOS Shortcut。

### 10.3 Android + Gemini 集成

#### 10.3.1 App Actions 6 核心（P0）

映射到 Google Assistant 标准意图:

| Intent | Built-in Intent | Parameter |
|--------|-----------------|-----------|
| `ask-aira` | `actions.intent.DISCUSS` | query |
| `draft` | `actions.intent.CREATE_ITEM_LIST` | kind, prompt |
| `approve` | `actions.intent.CONFIRM_ITEM` | task_id |
| `wallet-status` | `actions.intent.GET_ACCOUNT` | – |
| `invoke-agent` | `actions.intent.START_EXERCISE` | agent_id, task |
| `handoff-to` | `actions.intent.OPEN_APP_FEATURE` | device |

#### 10.3.2 Quick Settings Tile（P0）

- 下拉快捷开关里有"Agentrix" tile，一键呼出 Voice Quick。

#### 10.3.3 Gemini Extension 申请（P1）

- 提交 Gemini Extension 入驻申请（Google 名额有限）。
- 备份方案: 保持 App Actions 等效能力。

#### 10.3.4 Slice + Routines（P1）

- Slice: 在 Google Assistant 结果里嵌入 Agentrix 卡片。
- Routines: 用户设定 "回家时 → Agentrix 播报今日 Auto-Earn"。

#### 10.3.5 Android AccessibilityService（慎用，P2+）

- 用于跨 app 读取/操作（例如自动填表）。
- **Google Play 禁止滥用**，必须 in-app 明示授权 + 功能合理必要性。
- P2 仅在企业版 + 明确场景（合同审批自动化）启用。

### 10.4 国内厂商矩阵（P2-P3）

#### 10.4.1 华为 · 小艺 + 鸿蒙意图（P2）

- **小艺技能平台**: 申请技能 ID → 提交 Intent → 审核 2-4 周。
- **鸿蒙意图**: HarmonyOS 4+ 的 Intent Framework 对接。
- **挑战**: 华为生态闭环强，需原生模块 + 鸿蒙 ArkTS 桥接（RN 方案不完美）。

#### 10.4.2 小米 · Xiao AI 开放平台（P2）

- **小米开放平台**: 提交技能 + Intent。
- **小米手机快捷方式**: 对接 MIUI 快捷。

#### 10.4.3 OPPO · 小布（P3）

- **小布技能**: OPPO 开放平台提交。

#### 10.4.4 vivo · Jovi（P3）

- **Jovi 指令**: vivo 开放平台提交。

#### 10.4.5 国内唤醒词冲突

- "小艺小艺" / "小爱同学" / "小布小布" / "Hi Jovi"：都已被国内厂商占用。
- "Hey Aira" 英文 + 默认关闭，避免触发厂商助手。
- 国内版可定制中文唤醒词（"小顿" / "嘿 Aira"）用户自选。

### 10.5 联合工作流市场（P2）

- 提供 5 个内置模板 + 用户自定义编辑器。
- 模板可从 Web Console Shortcut Editor 推送同步到手机。
- 示例: "早安简报" / "开会前 10min" / "通勤模式" / "一键下班" / "夜间学习"（顿领 §6.6）。

### 10.6 反向调用系统助手（模式 B）

| 动作 | iOS | Android |
|------|-----|---------|
| 打开日历 | `EKEventStore.saveEvent` | `CalendarContract.Events` |
| 呼叫联系人 | `tel://` URL | `Intent.ACTION_CALL` |
| 播放音乐 | MusicKit / SpotifyKit | MediaSession / Spotify Intent |
| 设置计时器 | Shortcuts Intent | Clock Intent |
| 启动 app | `UIApplication.open(url:)` | `Intent.ACTION_VIEW` |

### 10.7 唤醒词工程细节

- "Hey Aira" 本地模型: Porcupine（商用授权）或 Snowboy（社区维护差）。
- 待机功耗目标: < 5 mA（允许长时间常驻）。
- 误触发率: < 1 次 / 24h。
- 低电量降级: < 20% 自动切系统优先。

### 10.8 系统助手矩阵一览

| 平台 | P0 | P1 | P2 | P3 |
|------|----|----|----|-----|
| iOS + Siri | App Intents 6 核心 + URL Scheme + Live Activity | Shortcut 模板包 + 反向调用 + 灵动岛 | Apple Intelligence 链（国际） + 联合工作流市场 v1 | iOS 26 新能力 + 完整 MCP 桥 |
| iOS Watch | Watch Shortcut 贯通 | watchOS 启动 + Complication | Watch 上 L2 推回 | 6 端表情同步 |
| Android + Gemini | App Actions 6 核心 + Quick Settings Tile | Gemini Extension 申请 + Slice + Routines | Tasker 模板 + AccessibilityService（慎） | Gemini Extensions 完整 |
| 华为 小艺 / 鸿蒙 | – | – | 小艺技能 + 鸿蒙意图 | 完整联合工作流 |
| 小米 Xiao AI | – | – | 小米开放平台 | 深度集成 |
| OPPO 小布 | – | – | – | 小布技能 |
| vivo Jovi | – | – | – | Jovi 指令 |

### 10.9 系统助手集成的关键工程模块

| 模块 | 位置 | P0 必须? |
|------|------|---------|
| `mobile/native-ios/AppIntents/` | Swift | ✅ |
| `mobile/native-android/appactions/` | Kotlin | ✅ |
| `mobile/native-android/quicksettings/` | Kotlin | ✅ |
| `mobile/native-ios/LiveActivity/` | Swift (ActivityKit) | P1 |
| `mobile/native-ios/DynamicIsland/` | Swift | P1 |
| `mobile/native-android/Tile/` | Kotlin | P1 |
| `mobile/wakeword/` | Porcupine SDK | P1 |
| `mobile/oem-huawei/` | Kotlin + ArkTS 桥 | P2 |
| `mobile/oem-xiaomi/` | Kotlin | P2 |

---

## 11. 非功能需求

### 11.1 性能

| 指标 | 目标 |
|------|------|
| 冷启动 | < 1.8s（高端）/ < 3s（中端） |
| 热启动 | < 400ms |
| Voice Quick 唤起延迟 | < 200ms |
| 首帧 Home Console | < 800ms |
| 推送到达 → 显示 | < 1.5s（端到端） |
| Live Activity 更新频率 | ≥ 5 FPS（iOS 限制） |
| 唤醒词常驻功耗 | < 5 mA |

### 11.2 内存 / 流量

- 常驻内存 < 180 MB
- 24h 流量 < 30 MB（无语音 / 无大附件）
- 语音流量（10min 对话）< 5 MB

### 11.3 电量

- Foreground 高强度使用 30min 耗电 < 15%
- Background idle 24h 耗电 < 5%
- 唤醒词常驻 24h 耗电 < 8%

### 11.4 离线能力

- Home Console 离线可浏览缓存数据。
- Voice Quick 离线提示"需要联网"。
- Pet Companion 离线仅显示缓存 state。
- 所有 L1+ 动作离线排队，上线 flush。

### 11.5 多平台版本最低

- iOS 15+（Live Activity 要求 16.1+）
- Android 9+（API 28+，Dynamic Tile 要求 API 33+）

### 11.6 国际化

- 语言: en / zh-CN / zh-TW / ja（P3）
- 货币: USD / USDC / CNY（Stripe + 微信支付 P2）

---

## 12. 实施路线图（引用顿领 §10）

### 12.1 阶段与交付

| 阶段 | 移动关键交付 | 系统助手交付 | 顿领映射 |
|------|-----------|-------------|--------|
| **P0 (3w)** | 三形态骨架 + Voice Quick 浮动 + 邀请码 stepper + 钱包 MPC 基础 | App Intents 6 + App Actions 6 + Watch Shortcut + Quick Settings Tile | 顿领 §10.1 P0 Mobile 列 |
| **P1 (4w)** | Doer 工作流 + Plan-Approval 闭环 + Pet Companion 锁屏 / 灵动岛 | Shortcut 模板包 + Gemini Extension 申请 + Live Activity + 反向调用 5 个 | 顿领 §10.1 P1 Mobile 列 |
| **P2 (3w)** | Wallet 升级 + Auto-Earn 仪表盘 + SplitPlan / Budget UI + Doer 多工作流 | 小艺 + 小米 + 鸿蒙意图 + 联合工作流市场 v1 + Apple Intelligence 链（国际） | 顿领 §10.1 P2 Mobile 列 |
| **P3 (4w)** | Pet Companion 默认皮肤 + 离线消息队列 + 家庭账号 P3 入口（查看） | OPPO 小布 + vivo Jovi + Gemini Extensions 完整 + iOS 26 新能力 | 顿领 §10.1 P3 Mobile 列 |

### 12.2 P0 Gate

- [ ] 三形态骨架可切换
- [ ] 邀请码 5 步 stepper < 90s
- [ ] 钱包 MPC Share 1 本地生成 + 生物识别门
- [ ] L2 签名 demo（Stripe 订阅 + USDC 提现雏形）
- [ ] iOS App Intents 6 核心 + Android App Actions 6 核心上架 review
- [ ] Watch Shortcut + Quick Settings Tile
- [ ] Handoff 接收与发起

### 12.3 移动专属里程碑

| 时间 | 里程碑 |
|------|-------|
| P0 W1 | 三形态骨架 + 钱包 MPC 初始化 |
| P0 W3 | App Intents / App Actions 送审 + Voice Quick MVP |
| P1 W2 | Doer Plan-Approval + Pet Companion 灵动岛 |
| P1 W4 | Shortcut 模板包 + Gemini Extension 递交 |
| P2 W1 | Wallet + Auto-Earn 完整 |
| P2 W3 | 小艺 + 小米 + 鸿蒙 alpha |
| P3 W2 | OPPO + vivo |
| P3 W4 | 国内四家完整 + 家庭账号查看入口 |

---

## 13. 成功指标

### 13.1 移动专属指标

| 指标 | P0 目标 | P3 目标 |
|------|--------|--------|
| 周活 WAU | 500 | 30000 |
| 日活 DAU | 150 | 12000 |
| 三形态使用分布 | Home 90% / Voice 60% / Pet 5% | Home 85% / Voice 75% / Pet 20% |
| L2 签名成功率 | ≥ 97% | ≥ 99% |
| 邀请码完成率 | ≥ 55% | ≥ 75% |
| App Intents 调用 / 日 | 1000+ | 100000+ |
| 系统助手来源调用占比 | 5% | 20% |
| 安装保留 D-7 | 30% | 50% |
| 安装保留 D-30 | 15% | 35% |

### 13.2 与顿领指标的关系

- **Cross-Surface DAU** 主要贡献端（预计 60% 跨端用户首先在移动启动）。
- **Handoff**: 移动既是起点也是终点。
- **L2/L3 签名**: 移动独占。
- **系统助手集成指标**: 主要数据源。

---

## 14. 附录

### 14.1 仓库同步清单（双仓库策略）

**双仓库结构**:

- **`Agentrix-website`** (本仓库, 单一事实源): 所有代码、文档、PRD、plans、合约、桌面、Web、Watch。
- **`agentrix-claw`** (另一仓库, 仅移动端分发): 仅 React Native 运行时代码 + Expo / EAS 配置。

#### 14.1.1 同步白名单（从 Agentrix-website → agentrix-claw）

```
src/                            ← 共享 RN 代码（但不含 src/watch/、src/desktop/ 等）
App.tsx
app.json
index.js
babel.config.js
metro.config.js
tsconfig.json
package.json                    ← 移动相关子集（详见下文裁剪规则）
package-lock.json
plugins/                        ← Expo 插件
assets/                         ← 移动资产（图片 / 字体 / 语音）
android/                        ← 原生 Android
ios/                            ← 原生 iOS
eas.json                        ← Expo EAS 配置
.easignore
.gitignore (移动版)
```

#### 14.1.2 同步黑名单（**永不进入 agentrix-claw**）

```
docs/**                         ← 所有文档（含所有 PRD，含 mobile-prd-v3.md 自身）
plans/**                        ← 所有规划
*.md                            ← 所有项目级 markdown
  - Agentrix_*_Plan.md
  - README.md (仅根目录的完整版) / WORKFLOW.md
  - 审计报告 / 优化计划 / 会议纪要
desktop/**                      ← 桌面代码
frontend/**                     ← Web 代码
backend/**                      ← 后端
contract/**                     ← 智能合约
tests/**                        ← 测试
src/watch/**                    ← Watch 代码
src/desktop/**                  ← 桌面共享逻辑
src/web/**                      ← Web 共享
src/backend-admin/**            ← 后台
.windsurf/**                    ← 编辑器本地
_*.js / _*.ps1 / test-*.js     ← 实验脚本
*.pem / *.p12 / *.key / *.txt  ← 证书临时文件
```

#### 14.1.3 关键规则

- **mobile-prd-v3.md 自身永不进入 agentrix-claw**（本 PRD 亦属 docs/）。
- **package.json 需裁剪**: 删除 web / desktop 依赖，仅保留 RN + Expo 相关。
- **.easignore 采用白名单**: 明示允许的目录，其余全部排除。

#### 14.1.4 同步工具

- **现状**: 仅有 `_push_watch_to_claw.ps1` / `_push_watch_to_claw2.ps1` / `_push_watch_to_claw3.ps1`（3 个版本，需审查）。
- **待新建**: `_push_mobile_to_claw.ps1`，结构与 watch 脚本一致，但处理移动端白名单。
- **审查重点**:
  - 检查现有脚本是否曾同步过 docs / *.md / plans（若有，agentrix-claw 历史中需清理）。
  - 新脚本显式使用白名单而非 rsync --exclude 黑名单（白名单更安全）。
  - 每次同步前 dry-run 输出 diff 供人工 review。

#### 14.1.5 agentrix-claw 历史清理

- 落地本 PRD 前，检查 agentrix-claw 仓库历史 commit 是否有文档泄漏。
- 若有，**单独一个 commit** 使用 `git rm` 清除（不 rebase，保留审计轨迹）。
- Push 清理后立即给相关成员发通知（内部文档可能已短暂外泄）。

### 14.2 与其他 PRD 的关系

| 引用来源 | 顿领 § | 移动本文件 § |
|---------|--------|------------|
| Living Pet 双层心智 | §3 | §5 |
| 5 主路径 | §5 | §6 |
| 系统助手战略 | §6 | §10（工程层映射） |
| 数据契约 / Topics / API | §7 | §9 |
| 安全模型 / MPC / Trust / 生物认证 | §8 | §9.2 本地 + §6.2 签名流程 |
| Agent 经济 | §9 | §7 |
| 整体路线图 Mobile 列 | §10 | §12 |

**Deviations from 顿领**: 无。

### 14.3 术语表（移动专属）

| 术语 | 含义 |
|------|------|
| **Home Console** | 移动主控台形态（Tab Bar） |
| **Voice Quick** | 移动语音快速形态（悬浮胶囊） |
| **Pet Companion** | 移动主宠陪伴形态（默认关闭） |
| **App Intent** | iOS 暴露给 Siri / 系统助手的能力单元 |
| **App Action** | Android 暴露给 Google Assistant 的能力 |
| **Built-in Intent** | Google Assistant 预定义的标准意图 |
| **Shortcut** | iOS Shortcuts / Android Routines / 小艺技能 等系统快捷工作流 |
| **Live Activity** | iOS 16.1+ 实时活动 |
| **灵动岛** | iPhone 14 Pro+ Dynamic Island |
| **Quick Settings Tile** | Android 下拉快捷开关 |
| **MPC Share 1** | 移动端本地持有的钱包私钥分片（顿领 §8.2） |

### 14.4 版本历史

| 版本 | 日期 | 主要变更 |
|------|------|---------|
| v1.0 | 2025 Q2 | 初版，基础钱包 + agent 列表 + 推送 |
| v1.1 | 2025 Q4 | 现状审计 + UX V4 |
| **v3.0** | **2026-05-04** | **三形态 + 系统助手原生深度集成 + MPC 签名中心 + 双仓库同步策略** |

---

**文档结束。下游写作顺序：Web → 可穿戴 → 归档。**
