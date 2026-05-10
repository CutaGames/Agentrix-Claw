# Agentrix 移动端重构 & 生态经济白皮书

> **版本**：v1.0 · 2026-05-10
> **范围**：移动端（根目录 `src/` · Expo SDK 54）重构 + 跨端经济模型 + AXP 积分体系 + 5 档订阅定价
> **相关文档**：
> - [AGENTS.md](../AGENTS.md) — 仓库总则
> - [agentrix-cross-platform-prd-v4.md](agentrix-cross-platform-prd-v4.md) — 跨端顿领 V4
> - [mobile-prd-v4.md](mobile-prd-v4.md) — 移动端 V4
> - [toy-prd-v4.md](toy-prd-v4.md) — 玩偶 V4
> - [AGENTRIX_CROSS_PLATFORM_CODE_AUDIT_OPTIMIZATION_PLAN_20260501.zh-CN.md](AGENTRIX_CROSS_PLATFORM_CODE_AUDIT_OPTIMIZATION_PLAN_20260501.zh-CN.md) — 最近一次跨端审计
> - [AGENTRIX_V3_IMPLEMENTATION_PLAN_20260504.zh-CN.md](AGENTRIX_V3_IMPLEMENTATION_PLAN_20260504.zh-CN.md) — V3.0 实施看板

---

## 0. 文档状态与落地约束

**这份文档是 5 轮决策讨论的最终冻结版**。所有关键决策已经由产品负责人拍板，本文档既是设计文档，也是 Sprint 实施合同。

**最终冻结决策清单（2026-05-10）**：

| 维度 | 决策 |
|-----|-----|
| 移动端核心定位 | **随身陪伴 + 跨端中枢 + 社交裂变** 三合一，承载 Pet-as-Agent 生态 |
| 底部 Tab | **4 个：家 / 召唤 / 集市 / 我**（英文 Home / Summon / Plaza / Me） |
| Agent 心智 | 每只宠物 = 一个 Agent，ERC-8004 独立身份 + MPC 钱包 + X402 签名 |
| 多宠策略 | 宠 × 场景二维会话（主宠默认 1 个，可按需新增），召唤 Tab 顶部切换 |
| 首期多人游戏 | **共养好友的宠 + 宠物贺卡**（零门槛 / 高互动 / 高裂变） |
| 订阅结构 | **5 档：Free / Lite $4.99 / Plus $14.99 / Pro $29.99 / Elite $69** + Enterprise 合同 |
| 身份包 | **废除**，所有能力全档开放，配额随订阅升级 |
| AXP 体系 | Phase 1 上线 AXP 软积分（off-chain），AX 代币接口预留不启用 |
| AXP 关键参数 | 1 AXP = $0.001；过期 12 个月；目标销毁率 ≥ 108% |
| 实施节奏 | Sprint A + B + C + D 连做，~14 天 |

**下一步**：本文档归档后即开 Sprint A（移动端导航骨架 + 家 Tab + 召唤 Tab 可用）。

---

## 1. 生态定位：Pet-as-Agent Economy

### 1.1 一句话战略

> **Agentrix = 以"宠物 Agent"为载体的跨端经济生态。每个用户是全能公民，既消费也创造，通过 AXP 积分串联留存与裂变。**

### 1.2 为什么是"宠物 Agent"而不是"工具 Agent"

| 维度 | 工具型 Agent（Cursor / ChatGPT） | 宠物 Agent（Agentrix） |
|-----|--------------------------------|----------------------|
| 用户关系 | 冷工具，用完即走 | 养成关系，每日回访 |
| 身份边界 | 一个账号一个 Bot | 每宠一独立身份（ERC-8004）|
| 钱包能力 | 共享用户账户 | 每宠独立 MPC 钱包 |
| 社交属性 | 弱 | 强（晒宠 / 共养 / 繁育 / 贺卡） |
| 裂变机制 | 依赖口碑 | 宠物本身就是裂变单元（分享 / 拍卖 / NFT）|
| 经济闭环 | 订阅 | 订阅 + GMV 抽成 + NFT + 玩偶 + 广告 |
| 用户 LTV | 一维（订阅） | 多维（订阅 + 消费 + 创作 + 投资）|
| 数字孪生 | 无 | Watch / Glass / Toy 物理化身延伸 |

### 1.3 全能账户哲学（**零身份包的本质原因**）

**一个账号，所有能力**。无论你是谁，你都可以在 Agentrix 同时做这些事：

- 🤖 陪伴 AI 宠物（消费者视角）
- 💡 发布技能、赚取分成（开发者视角）
- 🎨 设计皮肤、挂牌出售（创作者视角）
- 🏪 开店卖货、招揽宠物代工（商家视角）
- 🧸 做 IP 联名实体玩偶（硬件合作方视角）
- 🎮 开发宠物多人游戏（游戏工作室视角）
- 👨‍👩‍👧 家庭成员共养（家庭主视角）
- 👥 带公会打比赛（社区主视角）

**订阅升级 = 配额提升 + 能力深度**，不是"买新身份"。这是 Agentrix 对 Cursor / ChatGPT / Rabbit 的根本差异化护城河。

### 1.4 生态三侧结构

```
              ┌──────────────────────────┐
              │   🏛 Agentrix 平台层      │
              │ 账户 · 钱包 · 协议 · 合约  │
              └────────────┬─────────────┘
                           │ 抽成 / 订阅 / 服务费
      ┌────────────────────┼────────────────────┐
      │                    │                    │
┌─────▼─────┐      ┌───────▼───────┐     ┌──────▼──────┐
│ 🔧 供给侧 │      │ 👥 需求侧     │     │ 🤝 关系侧   │
├───────────┤      ├───────────────┤     ├─────────────┤
│ 技能开发  │      │ 个人 / 商家    │     │ 推广者      │
│ 宠物设计  │      │ 开发者 / 家庭  │     │ 公会主      │
│ AI 模型商 │      │ 企业          │     │ 创作者 KOL  │
│ 硬件合作  │      │              │     │ 家长 / 监护 │
│ MCP 供应  │      │              │     │ 联盟 Alliance│
│ 广告主    │      │              │     │              │
└───────────┘      └───────────────┘     └─────────────┘

              所有交互 = 宠物 Agent 为载体
              结算    = MPC + X402 + Commission V4
              激励    = AXP 积分
```

**关键事实**：在 Agentrix 世界观里，同一个用户**可以同时属于所有三侧**。订阅等级决定他在每一侧能做到多大量级。

---

## 2. 移动端 4 Tab IA

### 2.1 最终 Tab 结构

```
┌───────────────┬───────────────┬───────────────┬───────────────┐
│    🏠 家      │   🔮 召唤     │    🎪 集市    │    👤 我      │
│   Home        │   Summon      │    Plaza      │     Me        │
│ 主宠陪伴仪表  │ 多宠多会话对话 │ 经济 + 社交 + 游戏 │ 账户 + 钱包 + 设置 │
└───────────────┴───────────────┴───────────────┴───────────────┘
        所有 Tab 右上共享：[📷 扫] [🔔 通知/审批/Handoff]
        全局：🎙 Voice FAB（按住说话直接召唤主宠）
```

### 2.2 各 Tab 职责

| Tab | 核心职责 | 商业化任务 | 留存钩子 |
|----|---------|-----------|---------|
| 🏠 **家** | 主宠陪伴 · 成长仪表 · 经济 glance | 订阅升级 CTA · AXP 进度 · 今日事件 | 每日签到 · 活动 · 成就 |
| 🔮 **召唤** | 多宠多会话对话中心 | LLM 预算可视化 · 超量诱导升级 | 连续对话 · 会话历史 |
| 🎪 **集市** | GMV 主发动机（技能 / 任务 / 宠物 / 预测 / Feed） | 每成交返 AXP · 置顶推荐位 · 活动游戏 | 社交 · 裂变 · 新品 |
| 👤 **我** | 账户 · 钱包 · 推广 · 设备 · 团队 · 设置 | 订阅管理 · 分成账单 · 推广中心 | AXP 中心 · 收益可视化 |

### 2.3 Tab 1 · 🏠 家（Home）详细布局

```
┌────────────────────────────────────────────────┐
│ ≡ 主宠: [Alfred ▾]           📷  🔔(3)          │
├────────────────────────────────────────────────┤
│                                                │
│        (Alfred 3D/Rive 渲染，屏幕 55%)          │
│        😊 Lv.7 · XP 342/500                    │
│        ⚡能量 72% · 🛡 L1 授权                   │
│                                                │
│        [💬 召唤 Alfred 对话]  ← 大 CTA 跳召唤   │
│                                                │
├────────────────────────────────────────────────┤
│ 💰 Alfred 钱包   $12.30 ↑  (点进 Alfred 钱包)  │
│ 今日 +$2.30 · MRR $62 · Auto-Earn 执行中       │
│ ├ 我 70% ($8.61)                                │
│ └ 技能作者 20% + 平台 10%                       │
├────────────────────────────────────────────────┤
│ 🎯 Alfred 今日进度                              │
│ ├ BTC 5min 简报 ✓                              │
│ ├ 接单：翻译合同（2/3）进行中                   │
│ └ 🖥 桌面端正在帮我改代码（5%）                 │
├────────────────────────────────────────────────┤
│ 🎁 今日签到 +10 AXP · 🏆 成就 · 🧬 繁育提醒    │
├────────────────────────────────────────────────┤
│ 🌱 3 位朋友刚帮 Alfred 喂养 → [查看谁]         │
└────────────────────────────────────────────────┘

       ↓ 从主宠 3D 区域长按 / 上划唤出 10 个抽屉入口：

┌─────────┬─────────┬─────────┬─────────┬─────────┐
│ 🎒技能   │ 💼接单   │ 💰钱包   │ 🧠记忆   │ 🎮玩乐   │
├─────────┼─────────┼─────────┼─────────┼─────────┤
│ 👕衣柜   │ 💫灵魂   │ 🧬繁育   │ 🆔身份   │ ✨创生   │
└─────────┴─────────┴─────────┴─────────┴─────────┘
```

**关键交互点**：
- 顶部主宠下拉切换多宠（每只宠都有独立仪表盘）
- 🔔 铃铛打开全局审批/Handoff/通知收件箱（原 Devices Tab 的时效性内容都在这里）
- 📷 相机图标：扫 NFC 卡 / 扫宠物分享二维码 / 扫桌面配对码
- 点击"💬 召唤 Alfred 对话" = 跳转召唤 Tab 并预选 Alfred 会话

### 2.4 Tab 2 · 🔮 召唤（Summon）详细布局

```
┌────────────────────────────────────────────────┐
│ [Alfred]  [Mr.Owl]  [Code·Alfred]  [+ 新会话]   │
├────────────────────────────────────────────────┤
│ 🐾 Alfred · 😊 · 使用 Sonnet                    │
├────────────────────────────────────────────────┤
│                                                │
│  Alfred: 早☕ BTC 今天震荡…                     │
│                                                │
│  你:    再看看 ETH                              │
│                                                │
│  Alfred: 好的 [🔧 调用 market_data]             │
│         ETH 当前 $3,412 · 4h 涨 2.3%            │
│                                                │
│                                                │
├────────────────────────────────────────────────┤
│ 本月 LLM 用量 $12.30 / $20  ━━━━━━━━━━──── 62% │
├────────────────────────────────────────────────┤
│ [💬 输入消息]      [🎙] [📎] [⚡技能] [🛒]      │
└────────────────────────────────────────────────┘
```

**多宠 × 场景 = 会话**模型（决策 Q-B C）：
- `session_id = pet_id × context_tag × created_at`
- 默认每只宠有 1 个"日常"会话
- 用户可以"+新会话"给同一只宠开专题（代码 · 投资 · 写作）
- 会话 tab 横向滚动，最多显示 3 个，其他收进下拉

**⚡技能** 下拉 = Alfred 已装技能快捷工具栏（search / calc / code / memory / ...）
**🛒 购买快捷**：跳"集市 · 技能" → 装完返回当前会话

**LLM 用量条**：订阅预算可视化，耗尽时弹升级 / AXP 抵扣 / BYOK 三选一

### 2.5 Tab 3 · 🎪 集市（Plaza）详细布局

```
┌────────────────────────────────────────────────┐
│ 🎪 集市                        [🔍]  [📷]       │
├────────────────────────────────────────────────┤
│ [Feed] [技能] [任务] [宠物] [玩乐]              │
│  ← 5 段 Segmented（默认 Feed）                  │
├────────────────────────────────────────────────┤
│                                                │
│ (Feed 模式)                                    │
│                                                │
│ ┌─ Alice 的 Buddy 今日赚 $12 ───────────────┐ │
│ │ [🎴 技能卡] Smart Checkout · 免费试用      │ │
│ │ 已有 1.2k 只宠学习此技能                   │ │
│ │  [⚡ 装到我的主宠] [🔁 转发得 10% + 50 AXP]│ │
│ └─────────────────────────────────────────┘ │
│                                                │
│ ┌─ @ClawGames 新宠拍卖 ──────────────────────┐ │
│ │ [3D 预览] 赛博龙猫 · Lv.3 · 起拍 $15        │ │
│ │ 血统 Rare × Legendary · 已出 5 价            │ │
│ │  [🪙 出价] [👀 关注] [🧬 找它配对]           │ │
│ └─────────────────────────────────────────┘ │
│                                                │
│ ┌─ 🎯 Polymarket BTC 5min ──────────────────┐ │
│ │ 当前 $63,412 · 涨 54% 跌 46%                │ │
│ │  [让 Alfred 替我下 $1] [我自己下]            │ │
│ └─────────────────────────────────────────┘ │
│                                                │
│ ┌─ 🌱 共养好友的宠物 ───────────────────────┐ │
│ │ Mike 发来一起养"赛博龙猫"邀请               │ │
│ │  [帮他喂食 +2 AXP]  [拒绝]                  │ │
│ └─────────────────────────────────────────┘ │
│                                                │
│ ┌─ 🎁 宠物贺卡：生日快乐 ───────────────────┐ │
│ │ 给 @lucy 发张 Alfred 生日贺卡               │ │
│ │  [选择场景 → 发送] (3 张高级模板 1000 AXP)  │ │
│ └─────────────────────────────────────────┘ │
│                                                │
│ ┌─ 🧸 "赛博龙猫"做成毛绒玩具？ ──────────────┐ │
│ │  [定制咨询 → L2 联名 Landing]                │ │
│ └─────────────────────────────────────────┘ │
└────────────────────────────────────────────────┘
```

**5 段内容详解**：

| 段 | 内容 | 复用后端模块 | 独特 CTA |
|---|------|-------------|---------|
| **Feed** | Agent 经济动态流 + Post | `social` `living-pet` | 每 post 带类型标签（Showcase / Skill / Task / Auction / Predict / Game / Toy） |
| **技能** | Skill Marketplace | `skill-listings` `commerce` `mcp-registry` | ⚡ 装到主宠 · 🔁 转发得佣金 · 💰 购买 |
| **任务** | Task Marketplace + A2A | `merchant-task` `a2a-matching` | "主宠接单"自动匹配视图 · "我发布任务" |
| **宠物** | Skin Auction + 宠整体拍卖 + 繁育 + NFT + 玩偶咨询 | `pet-skin` `marketplace-pet` `pet-breeding` `pet-nft` `partner-inquiry` | 出价 / 挂牌 / 繁育 / mint / 定制玩偶 |
| **玩乐** | Predict + 多人共玩游戏 + 大赛 | `prediction-market` `social` `pet-achievement` | 共养 / 贺卡 / Polymarket / 每日大赛 |

### 2.6 Tab 4 · 👤 我（Me）详细布局

```
┌────────────────────────────────────────────────┐
│ Alex Chen                           [⬆升级到 Pro] │
│ Pro · 月费 $29.99 · 续订 2026-06-10             │
├────────────────────────────────────────────────┤
│ 🪪 我的钱包（用户主 MPC）                        │
│ $284.50 · Auto-Earn 近 24h +$4.30               │
│ 💎 AXP 余额 12,340 · 近 7 天 +2,340              │
│  [兑换中心] [AXP 历史]                          │
├────────────────────────────────────────────────┤
│ 我的作品 / 创作（配额可视化）                   │
│  ⚡ 技能     5/30                               │
│  👕 皮肤    12/∞                               │
│  📦 商品     8/100                              │
│  🧸 硬件     2/∞                                │
│  🎮 游戏     1/3                                │
│  👥 公会     0/∞                                │
├────────────────────────────────────────────────┤
│ 我的收益                                        │
│  技能分成 · 皮肤拍卖 · 任务酬劳 ·               │
│  推广佣金 · 商户收单                            │
├────────────────────────────────────────────────┤
│ 我的购买                                        │
│  订单 · 已装技能 · 关注的宠 · 收藏              │
├────────────────────────────────────────────────┤
│ 📡 设备与连接 ▾                                 │
│  📱 iPhone · 💻 Desktop · ⌚ Watch · 🧸 Toy     │
│  [+ 添加设备 / 扫码配对]                        │
├────────────────────────────────────────────────┤
│ 👥 团队与家庭 ▾ (无团队时折叠)                  │
│  团队空间 · 家庭账号 · 邀请成员                 │
├────────────────────────────────────────────────┤
│ ⚙️ 设置 · 通知 · 账户 · 安全 · 关于             │
├────────────────────────────────────────────────┤
│ 🔧 高级 ▾（uiComplexity ≥ advanced）            │
│  AI 厂商 · 本地 AI · MCP · 工作流 · ACP 会话   │
│  记忆 Wiki · Plugin Hub · Dreaming · ...        │
├────────────────────────────────────────────────┤
│ 🚪 退出登录                                     │
└────────────────────────────────────────────────┘
```

**"我"Tab 替代原来的身份切换**：由于废除身份包，"个人 / 商家 / 开发者"三身份不再存在，而是配额可视化直接展示"你目前能做多少"。需要做更多 → 升级。

---

## 3. 订阅主线 · 5 档 + Enterprise

### 3.1 定价表（2026-05-10 冻结）

| 档位 | 月价 | 年价（×10） | 定位 | Break-even 目标 MAU |
|-----|----:|----------:|------|-------:|
| **Free** | $0 | – | 规模 + 教育 + AXP 裂变 | 补贴 -$0.37/MAU |
| **Lite** | $4.99 | $49 | 去除硬限，继续探索 | +$2.10/MAU |
| **Plus** | $14.99 | $149 | 黄金档 · 活跃玩家/创作者/小商户 | +$5.99/MAU |
| **Pro** | $29.99 | $299 | 核心用户 · 全职开发者 / 中型商户 | +$8.08/MAU |
| **Elite** | $69 | $690 | 品牌绑定 · 全能力无限 · 流量位王者 | +$15.93/MAU |
| **Enterprise** | 合同定制 | $500~$50k/月 | 私有化 / SLA / SOC2 / 合规 | 合同利润 |

**年付折扣 10×（12 减 2）**：Plus 年付 $149 省 $30.88，Elite 年付 $690 省 $138。

### 3.2 完整能力矩阵

这是 Agentrix 订阅的核心 —— 所有能力在所有档位都开放，配额决定量级。

| 能力 | Free | Lite | Plus | Pro | Elite |
|-----|:---:|:---:|:---:|:---:|:---:|
| **LLM 月预算** | $0.30 硬顶 | $2.5 cloud | $8 cloud | $20 cloud | $50 cloud |
| **可用模型层级** | 本地 + 低档 | + Sonnet/4o | + Opus/4 Turbo | + 全模型 | 无限 |
| **日对话限制** | 20 轮/日 | 无限 | 无限 | 无限 | 无限 |
| **宠数量** | 2 | 5 | 15 | 40 | ∞ |
| **活跃设备数** | 1 | 2 | 4 | 6 | 10 |
| **Voice 使用** | 5 min/日 | 无限 | 无限 + 实时 | 全功能 | 全功能 |
| **发布技能** | 1 | 3 | 10 | 30 | ∞ |
| **上架皮肤** | 1 | 3 | 10 | ∞ | ∞ |
| **上架商品** | 1 | 5 | 30 | 100 | ∞ |
| **发布硬件 SKU** | – | L3 × 1 | L3 × 3 | L3 ∞ + L2 × 1 | L2 ∞ |
| **上架游戏** | – | – | 1 | 3 | ∞ |
| **公会创建** | – | – | 1 | ∞ | ∞ |
| **Sandbox 实例** | – | 1 | 3 | 10 | 50 |
| **私有 MCP Server** | – | 1 | 3 | 10 | ∞ |
| **API 免费调用/月** | – | 1k | 10k | 100k | 1M |
| **NFT mint 免费/月** | – | 2 | 10 | ∞ | ∞ |
| **拍卖手续费** | 2.5% | 1.8% | 1.0% | 0.3% | 0% |
| **Stripe 收单费率** | 2.9% | 2.5% | 2.0% | 1.8% | 1.5% |
| **AXP 消费返现** | 0% | +5% | +10% | +15% | +20% |
| **Auto-Earn 执行器并行** | 0 | 1 | 2 | 3 | ∞ |
| **A2A 优先匹配** | – | – | – | ✅ | ✅ |
| **L3 多端协签** | – | – | – | ✅ | ✅ |
| **隐私围栏层数** | 1 | 2 | 3 | 4 | 4 |
| **Agent Team Studio** | – | – | 基础 | 完整 | 完整+ |
| **自定义 System Prompt** | – | – | – | ✅ | ✅ |
| **自定义模型路由** | – | – | – | ✅ | ✅ |
| **Pet SDK Beta** | – | – | – | – | ✅ |
| **家庭子账号** | 0 | 1 | 3 | 6 | 10 |
| **审核优先级** | 72h | 48h | 48h | 24h | 2h 专属 lane |
| **客服响应** | 社区 | 72h | 48h | 24h | 4h 专属 |
| **首页推荐权重** | 1× | 1.2× | 1.5× | 2× | 3× |
| **专属徽章** | – | – | – | – | Elite Creator |
| **季度限定皮肤** | – | – | – | – | ✅ |

### 3.3 超额策略（所有档位）

当 LLM 预算 / 配额耗尽时，用户三选一：
1. **AXP 抵扣**：1 AXP = $0.001 折扣（以 10000 AXP 抵扣 $10）
2. **现金实扣**：绑卡按需扣费，1.3~1.5× 倍率（防止滥用）
3. **BYOK 自带 API key**：永远免 LLM 计费，但订阅费照收

### 3.4 Enterprise 专属条款

面向需要私有部署 / 合规审计 / SLA 保证的企业：

| 合同档 | 月费起点 | 包含 |
|-------|-------:|-----|
| **Enterprise Starter** | $500 | 10 席位 / 私有 VPC / 99.5% SLA / 邮件支持 |
| **Enterprise Pro** | $5k | 100 席位 / on-prem 选项 / 99.9% SLA / 专属客户经理 |
| **Enterprise Scale** | $50k+ | 无限席位 / SOC2 / ISO27001 / 白标 SDK / 7×24 电话支持 |

### 3.5 单位经济 P&L

基于 2026-05 真实基础设施单价：

**固定月成本**：~$999（EC2 + RDS + Redis + KMS + CDN + Sentry + 监控）

**可变非 LLM 成本**：~$0.07/MAU（数据库 + CDN + S3 + MPC 签名 + 错误追踪）

**各档毛利**：

| 档位 | 订阅净收 | LLM | 基础设施 | **毛利** | Margin |
|-----|-------:|-----:|-------:|-------:|-----:|
| Free | $0 | -$0.30 | -$0.07 | **-$0.37** | 平台补贴 |
| Lite | $4.70 | -$2.50 | -$0.10 | **+$2.10** | 45% |
| Plus | $14.14 | -$8.00 | -$0.15 | **+$5.99** | 42% |
| Pro | $28.28 | -$20.00 | -$0.20 | **+$8.08** | 29% |
| Elite | $66.23 | -$50.00 | -$0.30 | **+$15.93** | 24% |

**10k MAU 成熟期加权毛利（基于订阅分布）**：

| 档位 | 占比 | 贡献/人 |
|-----|----:|------:|
| Free | 85% | -$0.37 |
| Lite | 7% | +$2.10 |
| Plus | 5% | +$5.99 |
| Pro | 2% | +$8.08 |
| Elite | 0.8% | +$15.93 |
| Enterprise（$500 档）| 0.2% | +$200 |

**加权月贡献 / MAU = +$0.82**

**额外 GMV 抽成**（技能 / 皮肤 / 任务 / 模型差价 / NFT fee）：**+$0.47/MAU**

**综合 / MAU = +$1.29/月**

**Break-even MAU = $999 / $1.29 ≈ 775 MAU**

**规模化预测**：

| 规模 | 月净利 | 年化 |
|-----|-------:|----:|
| 1k MAU | +$290 | - |
| 10k MAU | +$12.9k | ~$155k |
| 100k MAU | +$129k | ~$1.5M |
| 1M MAU | +$1.29M | **~$15M** |

### 3.6 LLM 成本控制红线

**没有以下 5 条机制，整个经济模型塌房**：

1. **硬 Token Budget**：Free 每日 20 轮硬断；付费档预算耗尽弹升级提示
2. **智能路由默认**：`llm-router` 模块默认走最便宜能干活的模型；Opus/GPT-5 仅在显式指定或需要推理时启用
3. **本地模型降级**：`llama.rn` / `whisper.rn` 常驻；Free 用户 60%+ 对话走本地推理
4. **BYOK 鼓励**：Power user 可用自己 API key 不吃平台 LLM 预算
5. **Quota 可视化**：钱包 / AXP 中心显示"本月已用 $12.30 / $20"，避免超出惊吓

**这 5 项是 Sprint A/B/D 的强依赖**。

---

## 4. AXP 积分体系

### 4.1 两层结构（Phase 1 只启用 AXP）

| 层 | AXP（Agentrix Point） | AX（未来代币） |
|---|---------------------|---------------|
| 形式 | 软积分，off-chain 数据库 | ERC-20 + 治理代币 |
| 锚定 | 1 AXP = $0.001 USD | 浮动 |
| 获取 | 签到 / 对话 / 邀请 / 消费返现 / 活动 | AXP→AX 兑换 + 空投 + IDO |
| 使用 | 抵扣 / 折扣 / 特权 | 提现 / 跨生态支付 / 治理投票 |
| 合规 | 中国区友好（积分非证券） | 仅对非受限地区开放 |
| 上线 | **Phase 1 ✅** | Phase 3+（合规就绪后） |

**合约接口 Phase 1 预留但不启用**（见 §4.7）：数据库字段 `user_axp_balance` / `user_axp_history` 从第一天就完整落库，确保未来一键开启 AXP→AX 兑换时历史数据可追溯。

### 4.2 AXP 六大发放来源

基于 10k MAU 假设，每月发放：

| # | 来源 | AXP / 次 | 月参与人次 | 月发放量 |
|--:|------|--------:|----------:|--------:|
| 1 | 每日签到（50% 参与 × 20 天均活） | 20 avg | 100k | 2,000k |
| 2 | 和宠聊 10 轮 / 日（40% 参与 × 20 天） | 20 | 80k | 1,600k |
| 3 | 宠物 Lv↑（10% 用户 / 月 × Lv3 avg）| 150 | 1k | 150k |
| 4 | 共养好友喂食（3 好友/人/日 × 30% × 30 天）| 5 | 27k | 135k |
| 5 | 好友通过推广注册（新用户 5%）| 500 | 0.5k | 250k |
| 6 | 好友消费 GMV × 1%（均 $1）| 10 | 2k | 20k |
| 7 | 集市发帖被赞（均 3 赞 / 帖）| 3 | 3k | 9k |
| 8 | 完成任务（金额 × 10，均 $0.5）| 5 | 5k | 25k |
| 9 | 皮肤 / 商品售出（20% 创作者 / 商家）| 50 | 0.5k | 25k |
| 10 | 游戏参与（共养 / 贺卡 / 大赛）| 30 avg | 30k | 900k |
| 11 | 大赛参与 / 冠军（30/day × 5000）| 30 | 300 | 159k |
| 12 | 订阅消费返现（Lite+5% ~ Elite+20%）| – | 500 | 按消费 |

**月发放总计 I_m ≈ 5.27M AXP / 月**

→ 对应 **$5,270 平台隐性负债（10k MAU）** = $0.527 / MAU / 月

### 4.3 AXP 五大消耗去处

为闭环，每月销毁量 B_m 必须 ≥ 发放量 I_m 的 108%（通缩设计）：

| # | 消耗场景 | AXP / 次 | 月动用率 | 月销毁量 |
|--:|---------|--------:|---------:|--------:|
| A | **订阅续费抵扣**（最多 20%）| 2000 (=20% Pro) | 800 × 80% | 1,280k |
| B | 技能购买抵扣（最多 20%）| 100 | 集市 × 20% | 800k |
| C | 皮肤购买抵扣（最多 20%）| 200 | 皮肤买家 50% | 400k |
| D | 宠物创作额度（+5 次）| 300 | 10% 用户 | 300k |
| E | A2A 任务优先匹配 | 500 | 发布者 10% × 30% | 150k |
| F | 集市卡片置顶 24h | 200 | 帖主 5% × 2 | 200k |
| G | 专属皮肤 / NFT 预售资格 | 2000 | 限定 | 200k |
| H | L3 协签手续费减免 | 1000 | 小众 | 50k |
| I | **抽奖（100 AXP / 次）** | 100 × 8k 次 | 0.8/MAU | 800k |
| J | **皮肤 / 限定兑换** | 500 | 20% 用户 | 1,000k |
| K | 过期销毁（12 个月未用，~5%）| auto | — | 500k |

**月销毁总计 B_m ≈ 5.68M AXP / 月**

**闭环验证**：
- B_m (5.68M) ÷ I_m (5.27M) = **108%** ✅
- 季度流通池净变 **-1.23M AXP** → **轻度通缩，积分保值**

### 4.4 AXP 消费返现机制（订阅核心黏性）

购买任何生态商品都返 AXP，**返现率 = 订阅档次激励**：

| 用户档 | 买 $100 返 AXP | 返现率 |
|-------|---------------:|-----:|
| Free | 0 | 0% |
| Lite | 500 | 5% |
| Plus | 1000 | 10% |
| Pro | 1500 | 15% |
| Elite | 2000 | 20% |

**效果**：
- 越高档用户越愿在 Agentrix 消费（返现循环回生态）
- AXP 发放与 GMV 挂钩（GMV 越高 AXP 循环越快）
- 订阅是"解锁更多返现能力"而非"买配额"

### 4.5 动态调节机制

AXP 不是静态的，平台需要自动调节器：

| 信号 | 触发条件 | 平台响应 |
|-----|---------|---------|
| 流通池 S_m 月环比 +20% | 积分通胀 | 临时降低发放系数 10%（如签到 20→18）|
| S_m 月环比 -10% | 积分紧缩 | 临时提高发放 10% / 开放限定兑换 |
| 兑换商品连续 30 天售罄 | 供给不足 | 上架新兑换品 / 提高价格 |
| 老用户季度零新获得 | 流失前兆 | 定向"老友回归"礼包 |
| Free 用户 ARPU < $0.02 | 补贴失衡 | 降低签到 AXP / 限制发放频次 |

### 4.6 过期机制（锚点）

- AXP 发放后 **12 个月不使用自动销毁**
- 每笔 AXP 获得都记录时间戳，FIFO 过期（最早的先消耗）
- 过期前 30 天推送提醒："您有 XXX AXP 将于 X 日过期"

**这是通缩设计的关键**：避免老用户囤积扰动新经济。

### 4.7 AXP → AX 代币兑换接口预留

合约层面提前写好，**Phase 1 ADMIN_ONLY 不启用**：

```solidity
// contracts/AXPTokenBridge.sol (Phase 1 仅部署，不开放)
contract AXPTokenBridge is Ownable {
    IERC20 public axToken;
    uint256 public conversionRate = 100; // 1 AX = 100 AXP, 可治理调整
    bool public conversionEnabled = false;

    function setConversionEnabled(bool enabled) external onlyOwner {
        conversionEnabled = enabled;
    }

    function setConversionRate(uint256 newRate) external onlyOwner {
        conversionRate = newRate;
    }

    function claimAX(address user, uint256 axpAmount, bytes signature)
        external adminOnly {
        require(conversionEnabled, "Not enabled yet");
        uint256 axAmount = axpAmount / conversionRate;
        require(axToken.balanceOf(treasury) >= axAmount, "Insufficient treasury");
        axToken.transfer(user, axAmount);
        emit AXPConverted(user, axpAmount, axAmount);
    }
}
```

后端数据库从 Phase 1 就保留：
- `user_axp_ledger`（每笔 AXP 变动流水）
- `user_axp_balance_snapshot`（月末快照用于未来空投）
- `axp_earned_timestamp`（过期 FIFO 追踪）

---

## 5. Pet 经济三大闭环

整个 Agentrix 生态运转靠这三个闭环。所有旧模块（Skill / Task / Predict / Referral / Breeding / NFT / Toy）都是**这三个 loop 的组成部分**，不会被删除。

### 5.1 Loop 1 · 陪伴 → 成长 → 亲密度 → 解锁

```
用户和主宠聊天 / 拍照 / 语音
  → 记忆 4 层入库（working → episodic → semantic → procedural）
  → 亲密度 XP +
  → Lv↑ → 解锁新技能槽 / 灵魂模板 / 皮肤 / 玩乐玩法
  → Dreaming 引擎夜间总结 → 推送晨报
  → 用户回来看 → 继续陪伴 → XP 累积加速
```

**涉及模块**：`living-pet` `pet-companion-engine` `pet-achievement` `pet-memory-album` `memory-tiers` `dreaming` `vitals-bus`

**移动端落地**：
- 家 Tab 首屏主宠状态条 + XP 进度条 + Lv 徽章
- 召唤 Tab 聊天后实时 XP 弹窗（+5 XP 亲密度）
- 家 Tab "今日签到" + "连续 7 天" 连击加成

### 5.2 Loop 2 · 技能 → 任务 → 赚钱 → 宠钱包 → 分账

```
用户在 Plaza · 技能 挑选 → ⚡ 装到主宠
  → 主宠技能栏 +1
  → A2A Matching 自动接任务 / 用户手动接
  → 主宠执行（本地 / 云端 / 桌面执行者）
  → 任务完成
  → 钱进主宠钱包 (MPC + X402 结算)
  → Split Rule 分账：
     · User 70%  · Skill Creator 20%  · Platform 10%
  → User 看到"主宠今日给我赚 $X"
  → 更愿意喂新技能 → 回到起点
```

**涉及模块**：`skill-listings` `merchant-task` `a2a-matching` `commission` `commerce` `auto-earn` `mpc-wallet` `x402` `agent-account` `pet-a2a`

**移动端落地**：
- 家 Tab 主宠钱包卡片显示今日进账 + Split 比例
- 集市 Tab 技能卡 CTA "⚡ 装到主宠"
- 集市 Tab 任务卡"主宠接单" / "我发布任务"
- 召唤 Tab 任务执行实时进度推送

### 5.3 Loop 3 · 宠物资产 → 设计/养成 → 拍卖/NFT/玩偶 → 裂变

```
用户用 PetCreator 生成新宠 / 繁育 / 换皮
  → 灵魂 × 皮肤组合 + 血统 + 成就 + 赚钱记录 = 资产估值
  → 挂 Plaza · 宠物（拍卖 / 一口价 / 出租）
  → 成交 → NFT mint intent → 链上身份确权
  → 买家获得完整宠物（灵魂转移 + 钱包归买家）
  → 或选"定制实体玩偶" → 跳 L2 联名 Landing → Toy NFC 绑定
  → 分享到 Feed / 外部（Twitter / Telegram / WeChat）带 ref
  → 新用户点击 → 看到宠物 → 引导注册 → 闭环 + AXP 返现
```

**涉及模块**：`marketplace-pet` `pet-skin` `pet-breeding` `pet-soul-template` `pet-nft` `pet-sovereign` `device-registry` `partner-inquiry` `partner-app` `referral` `social`

**移动端落地**：
- Plaza · 宠物段：Skin Auction MVP（Phase 1 优先），整体拍卖 + NFT mint Phase 2
- 分享动作全链路：消息气泡长按 → ShareCard → 分享 / Twitter / Telegram / WeChat（带 ref）
- Toy 绑定流程：扫 NFC → 绑定到指定宠物 → 激活钱包 → L2 联名玩偶进 Me · 设备

---

## 6. 多人游戏 Phase 1

决策 Q-D 选定：**② 共养 + 贺卡**（零门槛 × 高互动 × 高裂变）

### 6.1 α · 共养好友的宠物（主发动机）

**心智**：蚂蚁森林模式，每日回访 + 分享分成。

**产品形态**：

```
用户 Alex 把主宠 Alfred 的"共养链接"分享给好友
  → 好友点击（不用注册也能点一次）
  → 落地页：
     🐾 Alfred 想让你帮它喂食 / 浇水 / 遛弯
     [喂食 +2 能量 +5 AXP]  [注册拿 500 AXP]
  → 好友每天可喂 1 次
  → Alfred 能量条 +，加速 Lv↑
  → Alfred 未来每笔 Task 赚的钱，好友得 5%（共养分成）
  → Alex 看到"今天 Mike 帮我喂了 Alfred +18 能量"
  → 回访率极高
```

**后端复用**：
- `pet-energy`（能量系统，现有）
- `referral`（好友归因，现有）
- `commission`（共养 5% 分成配置，现有 V4）
- `pet-achievement`（喂养次数成就）
- 新增表 `pet_coraising_invites`（邀请关系 + 分账比例 + 过期）

**前端新屏**：
- `CoRaisingInviteScreen`（发起邀请 / 选宠 / 设置分成）
- `CoRaisingLandingScreen`（WebView / universal link 落地页，未注册用户也能点）
- `CoRaisingActivityScreen`（好友活动时间线）
- 家 Tab 加一行"🌱 3 位朋友帮 Alfred 喂养 +18 能量"

### 6.2 δ · 宠物贺卡（低成本脉冲）

**心智**：节日 / 生日 / 搞笑场景，关系型传播。

**产品形态**：

```
用户 Alex 选择场景模板（生日 / 加油 / 情人节 / 程序员节 / 搞笑）
  → 主宠 Alfred + 模板文案 + 自定义话
  → 一键发给 @Lucy
  → Lucy 收到：
     🎁 Alex 的 Alfred 对你说：
     "祝你生日快乐！一起来养我吧"
     [收下  +20 AXP]  [回一张我家的]
  → 收件人点开即进 App（universal link）
  → 优质模板 500-2000 AXP 解锁（销毁闭环 J）
```

**后端复用**：
- `social`（消息流）
- `pet-skin`（模板皮肤）
- `referral`（归因）
- 新增表 `pet_greeting_cards`（模板 / 发送记录 / AXP 消耗）

**前端新屏**：
- `GreetingCardComposerScreen`（选宠 + 选模板 + 填文案 + 预览）
- `GreetingCardInboxScreen`（收到的贺卡）
- 集市 Feed 新 post type "[Greeting Card]"

### 6.3 Phase 2 延后游戏（列清单不实现）

以下游戏保留在 Plaza · 玩乐，但 Phase 2 再上：

- **每日宠物大赛**（抖音挑战风格）
- **宠物接龙剧场**（UGC 协作）
- **组队 Polymarket**（多人下注）
- **协作任务分工**（PvE 多人）
- **宠物拍卖 PvP**（竞价对战）
- **宠物赛车 / 经营 / 解谜 / 交易所**（游戏工作室 SDK 作品）

---

## 7. 屏幕完整迁移表

83+ 现有屏全部归位。状态标记：
- ✅ 保留（新位置）
- 🔀 合并（多处合一）
- 📦 下沉 Me · 高级
- 🆕 新建
- ❌ 废弃

### 7.1 家 Tab（Home）屏

| # | 屏 | 现位置 | 新位置 | 动作 |
|--:|---|-------|--------|-----|
| 1 | `HomeScreen` | Today | **家首屏背景/信息流** | 🔀 合并 IdentityTabs 去除 |
| 2 | `PetCompanionScreen` | Today + Pet | **家首屏主视觉** | 🔀 合 2 处 |
| 3 | `PersonalHomeContent` / `MerchantHomeContent` / `DeveloperHomeContent` | Today 内 | **废除（配额可视化代替）** | ❌ |
| 4 | `IdentityActivationScreen` | 根 | ❌ 废除（无身份包） | ❌ |
| 5 | - | - | `HomeScreen` (new, home-centric) | 🆕 |
| 6 | - | - | `CoRaisingActivityScreen` | 🆕 |

### 7.2 召唤 Tab（Summon）屏

| # | 屏 | 现位置 | 新位置 | 动作 |
|--:|---|-------|--------|-----|
| 7 | `AgentChatScreen` (4097 行) | Agent | **召唤 Tab 主屏** | ✅ + ♻️ 拆分 5 组件 |
| 8 | `VoiceChatScreen` | Agent | **召唤 · 语音专用大屏** | ✅ |
| 9 | `AgentConsoleScreen` (30+ 项聚合) | Agent | **废除**，功能分拆 | ❌ |
| 10 | - | - | `SummonStackNavigator` | 🆕 |
| 11 | - | - | `ChatSessionTabs` 增强（多宠×场景） | ✅（现有组件） |

### 7.3 集市 Tab（Plaza）屏

| # | 屏 | 现位置 | 新位置 | 动作 |
|--:|---|-------|--------|-----|
| 12 | `FeedScreen` | Social/Discover | **集市 · Feed** | ✅ |
| 13 | `PostDetailScreen` | Social | 集市 · Feed | ✅ |
| 14 | `CreatePostScreen` | Social | 集市 · Feed · 创建 | ✅ |
| 15 | `UserProfileScreen` | Social | 集市 · Feed · 用户详情 | ✅ |
| 16 | `ClawMarketplaceScreen` | Market | **集市 · 技能** | ✅ |
| 17 | `ClawSkillDetailScreen` | Market | 集市 · 技能详情 | ✅ |
| 18 | `CheckoutScreen` | Market | 集市 · 支付 | ✅ + 🔧 修复 checkoutUrl 断裂 bug |
| 19 | `SkillInstallScreen` | Agent + Discover | 集市 · 技能安装 | 🔀 合 2 处 |
| 20 | `MarketplaceScreen` | 根 | 集市 · 技能 alias | ✅ |
| 21 | `SkillDetailScreen` | 根 | 集市 · 技能详情 | ✅ |
| 22 | `MvpProfileScreen` | 根 | 集市 · 技能 · 作者页 | ✅ |
| 23 | `ReviewsScreen / WriteReviewScreen` | 根 | 集市 · 技能详情 · 评论 | ✅ |
| 24 | `TaskMarketScreen` | 根 + Discover | **集市 · 任务** | 🔀 |
| 25 | `TaskDetailScreen` | 根 + Team | 集市 · 任务详情 | 🔀 |
| 26 | `PostTaskScreen` | 根 + Discover | 集市 · 任务 · 发布 | 🔀 |
| 27 | - | - | `PetMarketScreen` (宠物整体拍卖) | 🆕（Phase 1 MVP = Skin Auction） |
| 28 | `SkinMarketplaceScreen` | Today + Pet | **集市 · 宠物 · 皮肤** | 🔀 合 2 处 |
| 29 | - | - | `SkinAuctionDetailScreen` | 🆕 |
| 30 | - | - | `PetAuctionDetailScreen` | 🆕（Phase 2） |
| 31 | `PredictScreen` | Discover | **集市 · 玩乐 · Predict** | ✅ |
| 32 | `AirdropScreen` | 根 | 集市 · Feed · 活动卡 | ✅ |
| 33 | `AllianceScreen` | 根 | Me · 高级 · 社区联盟 | 📦 |
| 34 | `DirectMessageScreen / DMChatScreen / DMListScreen / ChatListScreen` | Social | **合并为 `MessagingScreen`** | 🔀 4→1 |
| 35 | `GroupChatScreen` | Social | 集市 · Feed · 群聊（通过作者头像进入） | ✅ |
| 36 | `SocialListenerScreen` | Social + Me | Me · 高级 · 社交监听 | 📦 |
| 37 | - | - | `CoRaisingInviteScreen` | 🆕（共养发起） |
| 38 | - | - | `CoRaisingLandingScreen` | 🆕（落地页） |
| 39 | - | - | `GreetingCardComposerScreen` | 🆕（贺卡创建） |
| 40 | - | - | `GreetingCardInboxScreen` | 🆕（贺卡收件） |
| 41 | `CreateLinkScreen` | 根 + Discover | 集市 · Feed · 分享卡 | ✅ |
| 42 | `ShareCardScreen` | Me + Market + Discover | 集市 · 分享卡生成器 | 🔀 |

### 7.4 我 Tab（Me）屏

| # | 屏 | 现位置 | 新位置 | 动作 |
|--:|---|-------|--------|-----|
| 43 | `ProfileScreen` | Me | **我 · 首页** | ✅ |
| 44 | `AccountScreen` | 根 + Me | 我 · 账户 | 🔀 |
| 45 | `ClawSettingsScreen` | Me | 我 · 设置 | ✅ |
| 46 | `NotificationCenterScreen` | 通知 | **全局铃铛**（所有 Tab 共享） | 🔀 |
| 47 | `ReferralDashboardScreen` | Me | **我 · 推广中心** | ✅ 合并 |
| 48 | `PromoteScreen` | 根 | 我 · 推广中心 | 🔀 |
| 49 | `MyLinksScreen` | 根 | 我 · 推广中心 | 🔀 |
| 50 | `CommissionEarningsScreen` | 根 | 我 · 推广中心 · 佣金 | 🔀 |
| 51 | `CommissionRulesScreen` | 根 | 我 · 推广中心 · 规则 | 🔀 |
| 52 | `CommissionPreviewScreen` | 根 | 我 · 推广中心 · 预览 | 🔀 |
| 53 | `MyOrdersScreen` | 根 + Me | 我 · 购买 · 订单 | 🔀 |
| 54 | `MySkillsScreen` | 根 + Me | 我 · 购买 · 已装技能 | 🔀 |
| 55 | `MyFavoritesScreen` | 根 | 我 · 购买 · 收藏 | ✅ |
| 56 | - | - | `AxpCenterScreen`（余额 + 历史）| 🆕 |
| 57 | - | - | `AxpRewardShopScreen`（兑换中心） | 🆕 |
| 58 | - | - | `SubscribePlanScreen`（5 档订阅）| 🆕 |
| 59 | - | - | `CheckInScreen`（每日签到浮层）| 🆕 |
| 60 | `WalletDashboardScreen` | Wallet | **我 · 钱包**（用户主 MPC） | ✅ |
| 61 | `PayMpcDemoScreen` | Wallet | 我 · 钱包 · 快付 demo | ✅ |
| 62 | `AssetsScreen` | 根 | 我 · 钱包 · 资产 | ✅ |
| 63 | `WalletConnectScreen` | Auth + Me + Wallet | 我 · 钱包（唯一） | 🔀 合 3 处 |
| 64 | `WalletSetupScreen` | Me | 我 · 钱包 · 设置 | ✅ |
| 65 | `WalletBackupScreen` | Me | 我 · 钱包 · 备份 | ✅ |
| 66 | `QuickPayScreen` | 根 | **废除** (100% mock) | ❌ |
| 67 | `AutoEarnScreen` | 根 | 我 · 钱包 · Auto-Earn | ✅ |
| 68 | `SettlementsScreen` | 根 | 我 · 钱包 · 结算 | ✅ |
| 69 | `BudgetPoolsScreen` | 根 | 我 · 钱包 · 预算池 | ✅ |
| 70 | `SplitPlansScreen` | 根 | 我 · 钱包 · 分账计划 | ✅ |
| 71 | `StrategyDetailScreen` | 根 | 我 · 钱包 · 策略 | ✅ |
| 72 | **设备与连接区（折叠）**  | - | - | - |
| 73 | `DesktopControlScreen` | Agent | 我 · 设备 · 桌面详情 | ✅ |
| 74 | `WearableHubScreen` | Agent + Me + Drawer | 我 · 设备 · 穿戴 | 🔀 合 3 处 |
| 75 | `WearableMonitorScreen` | Agent | 我 · 设备 · 穿戴详情 | ✅ |
| 76 | - | - | `GlassConnectScreen` | 🆕 |
| 77 | - | - | `ToyBindingScreen` (NFC/BLE/MQTT) | 🆕 |
| 78 | **团队与家庭区（折叠）** | - | - | - |
| 79 | `TeamDashboardScreen` | Team | 我 · 团队 | ✅ |
| 80 | `TeamApprovalDetailScreen` | Team | 全局铃铛 · 审批详情 | 🔀 |
| 81 | `TeamSpaceScreen` | Agent + Team | 我 · 团队 · 空间 | 🔀 合 2 处 |
| 82 | `TeamInviteScreen` | Agent + Team | 我 · 团队 · 邀请 | 🔀 合 2 处 |
| 83 | `TaskBoardScreen` | Team | 我 · 团队 · 任务看板 | ✅ |
| 84 | `AgentProfileScreen` | Team | 我 · 团队 · 成员详情 | ✅ |
| 85 | - | - | `FamilyAccountScreen` | 🆕 |

### 7.5 Buddy 下属（主宠抽屉 10 入口）屏

| # | 屏 | 现位置 | 新位置 | 动作 |
|--:|---|-------|--------|-----|
| 86 | `PetHubScreen` | Pet | **废除单独 Hub**（10 入口直挂家 Tab 抽屉）| ❌ |
| 87 | `AgentAccountScreen` | Agent + Team | 家 · 主宠 · 钱包（Agent Account） | 🔀 合 2 处 |
| 88 | `AgentBalanceScreen` | Agent | 家 · 主宠 · 钱包 · 余额 | ✅ |
| 89 | `AgentPermissionsScreen` | Agent | 家 · 主宠 · 权限 | ✅ |
| 90 | `AgentToolsScreen` | Agent | 家 · 主宠 · 技能栏（高级）| 📦 |
| 91 | `AgentMemoryScreen / MemoryManagementScreen` | Agent | 家 · 主宠 · 记忆 | 🔀 合 2 |
| 92 | `AgentLogsScreen` | Agent | 家 · 主宠 · 记忆 · 日志 | ✅ |
| 93 | `AcpSessionsScreen` | Agent | Me · 高级 · ACP | 📦 |
| 94 | `DreamingDashboardScreen` | Agent | 家 · 主宠 · 记忆 · 梦境 | ✅ |
| 95 | `PluginHubScreen` | Agent | Me · 高级 · 插件 | 📦 |
| 96 | `MemoryWikiScreen` | Agent | Me · 高级 · 记忆 Wiki | 📦 |
| 97 | `McpManagerScreen` | Agent | Me · 高级 · MCP | 📦 |
| 98 | `SkillPackScreen` | Agent | Me · 高级 · 技能包 | 📦 |
| 99 | `StoragePlanScreen` | Agent | Me · 高级 · 存储方案 | 📦 |
| 100 | `WorkflowListScreen / WorkflowDetailScreen` | Agent | 家 · 主宠 · 技能 · 工作流 | 📦 |
| 101 | `AgentSpaceScreen` | Agent | 家 · 主宠 · 协作空间 | ✅ |
| 102 | `PetCreatorScreen` | Pet | 家 · 主宠 · 创生 | ✅ |
| 103 | `WardrobeScreen` | Today + Pet | 家 · 主宠 · 衣柜 | 🔀 合 2 处 |
| 104 | `SoulPickerScreen` | Today + Pet | 家 · 主宠 · 灵魂切换 | 🔀 合 2 处 |
| 105 | `BreedScreen` | Today + Pet | 家 · 主宠 · 繁育 | 🔀 合 2 处 |
| 106 | `PetTeamScreen` | Pet | 家 · 主宠 · 宠团队 | ✅ |
| 107 | `PetPlaygroundScreen` | Today + Pet | 家 · 主宠 · 玩乐聚合 | 🔀 合 2 处 |

### 7.6 Onboarding / Auth / 特殊屏

| # | 屏 | 现位置 | 新位置 | 动作 |
|--:|---|-------|--------|-----|
| 108 | `LoginScreen / AuthCallbackScreen` | Auth | 不变 | ✅ |
| 109 | `InvitationGateScreen` | Auth | 不变 | ✅ |
| 110 | `DeploySelectScreen / CloudDeployScreen / ConnectExistingScreen / LocalDeployScreen / SocialBindScreen` | Onboarding + Agent | 仅 Onboarding 专用 + 我 · 设备 · 添加 | 🔀 合 2 处 |
| 111 | `LocalConnectScreen` | Agent | 我 · 设备 · 本地连接（深链）| ✅ |
| 112 | `OpenClawBindScreen` | Agent | 我 · 设备 · OpenClaw | ✅ |
| 113 | `ScanScreen` | Me + Agent + Drawer | **所有 Tab 右上相机按钮** | 🔀 合 3 处 |
| 114 | `ApiKeysScreen` | Me | Me · 高级 · AI 厂商 | 📦 |
| 115 | `LocalAiModelScreen` | Me | Me · 高级 · 本地模型 | 📦 |
| 116 | `ActivityScreen` | 根 | 家 · 活动流 | ✅ |

**汇总**：
- 83 现有屏 + 10 新建 = 93 屏在新 IA 里
- 12 屏废弃 / 合并消除重复注册
- 结果：**Navigation 重复注册 100% 消除**

### 7.7 Drawer 废弃

现 `AgentDrawerContent` 的所有入口已在 4 Tab 里：
- 实例切换 → 家 Tab 顶部主宠下拉
- Token 用量 → 召唤 Tab LLM 用量条
- 记忆 / 工作流 / 技能 / 日志 → 家 · 主宠抽屉
- 桌面控制 / 可穿戴 / 扫码 → 我 · 设备
- 权限 / Agent 账户 / 团队 → 我 · 团队 + 家 · 主宠 · 权限

**DrawerNavigator 整层删除**，`RootNavigator` 直接指向 `MainTabNavigator`。

---

## 8. Legacy Route Table（深链兼容）

旧通知 / 微信 / Twitter / Discord 分享出去的深链不能 404。Sprint A 必须实现这张转发表：

```typescript
// src/navigation/legacyRouteTable.ts
export const LEGACY_ROUTE_MAP: Record<string, string> = {
  // ========== 旧 Agent/Today/Pet 前缀 → 新 Tab 前缀 ==========
  'agentrix://today': 'agentrix://home',
  'agentrix://today/*': 'agentrix://home/*',
  'agentrix://agent/chat': 'agentrix://summon',
  'agentrix://agent/chat/*': 'agentrix://summon/*',
  'agentrix://agent/voice-chat': 'agentrix://summon/voice',
  'agentrix://agent/console': 'agentrix://home', // AgentConsole 废除 → 回家
  'agentrix://agent/console/*': 'agentrix://home',
  'agentrix://agent/memory': 'agentrix://home/pet/memory',
  'agentrix://agent/memory-management': 'agentrix://home/pet/memory',
  'agentrix://agent/workflow': 'agentrix://home/pet/skills/workflow',
  'agentrix://agent/workflow/*': 'agentrix://home/pet/skills/workflow/*',
  'agentrix://agent/dreaming': 'agentrix://home/pet/memory/dreaming',
  'agentrix://agent/plugin-hub': 'agentrix://me/advanced/plugin',
  'agentrix://agent/memory-wiki': 'agentrix://me/advanced/memory-wiki',
  'agentrix://agent/mcp': 'agentrix://me/advanced/mcp',
  'agentrix://agent/acp': 'agentrix://me/advanced/acp',
  'agentrix://agent/skill-pack': 'agentrix://me/advanced/skill-pack',
  'agentrix://agent/storage': 'agentrix://me/advanced/storage',
  'agentrix://agent/logs': 'agentrix://home/pet/memory/logs',
  'agentrix://agent/tools': 'agentrix://home/pet/skills',
  'agentrix://agent/permissions': 'agentrix://home/pet/permissions',
  'agentrix://agent/account': 'agentrix://home/pet/wallet',
  'agentrix://agent/balance': 'agentrix://home/pet/wallet/balance',
  'agentrix://agent/team-space': 'agentrix://me/team/space',
  'agentrix://agent/team-invite': 'agentrix://me/team/invite',
  'agentrix://agent/wearable': 'agentrix://me/devices/wearable',
  'agentrix://agent/wearable-monitor/*': 'agentrix://me/devices/wearable/monitor/*',
  'agentrix://agent/desktop-control': 'agentrix://me/devices/desktop',
  'agentrix://agent/openclaw-bind': 'agentrix://me/devices/openclaw',
  'agentrix://agent/deploy-select': 'agentrix://me/devices/add',
  'agentrix://agent/cloud-deploy': 'agentrix://me/devices/add/cloud',
  'agentrix://agent/connect-existing': 'agentrix://me/devices/add/existing',
  'agentrix://agent/local-deploy': 'agentrix://me/devices/add/local',
  'agentrix://agent/social-bind/*': 'agentrix://me/devices/social/*',
  'agentrix://agent/skill-install': 'agentrix://plaza/skills/install',
  'agentrix://agent/scan': 'agentrix://scan', // 全局 Scan
  'agentrix://agent/local-connect': 'agentrix://me/devices/local-connect',
  'agentrix://agent/agent-space/*': 'agentrix://home/pet/space/*',
  'agentrix://agent/agent-tools': 'agentrix://home/pet/skills',

  // ========== Pet 前缀 → 主宠抽屉 ==========
  'agentrix://pet': 'agentrix://home',
  'agentrix://pet/companion': 'agentrix://home',
  'agentrix://pet/creator': 'agentrix://home/pet/creator',
  'agentrix://pet/wardrobe': 'agentrix://home/pet/wardrobe',
  'agentrix://pet/soul-picker': 'agentrix://home/pet/soul',
  'agentrix://pet/breed': 'agentrix://home/pet/breed',
  'agentrix://pet/skin-marketplace': 'agentrix://plaza/pets/skins',
  'agentrix://pet/pet-team': 'agentrix://home/pet/team',
  'agentrix://pet/playground': 'agentrix://home/pet/play',

  // ========== Market 前缀 → 集市 ==========
  'agentrix://market': 'agentrix://plaza/skills',
  'agentrix://market/skill/*': 'agentrix://plaza/skills/*',
  'agentrix://market/checkout/*': 'agentrix://plaza/checkout/*',
  'agentrix://market/task': 'agentrix://plaza/tasks',
  'agentrix://market/task/*': 'agentrix://plaza/tasks/*',
  'agentrix://market/post-task': 'agentrix://plaza/tasks/post',
  'agentrix://market/create-link': 'agentrix://plaza/share-card',

  // ========== Discover 前缀（隐藏）→ 集市 ==========
  'agentrix://discover': 'agentrix://plaza',
  'agentrix://discover/predict': 'agentrix://plaza/play/predict',
  'agentrix://discover/marketplace': 'agentrix://plaza/skills',
  'agentrix://discover/feed': 'agentrix://plaza/feed',
  'agentrix://discover/post/*': 'agentrix://plaza/feed/post/*',
  'agentrix://discover/user/*': 'agentrix://plaza/feed/user/*',

  // ========== Social 前缀 → 集市 · Feed / Messaging ==========
  'agentrix://social/feed': 'agentrix://plaza/feed',
  'agentrix://social/post/*': 'agentrix://plaza/feed/post/*',
  'agentrix://social/dm/list': 'agentrix://plaza/messaging',
  'agentrix://social/dm/*': 'agentrix://plaza/messaging/*',
  'agentrix://social/group/*': 'agentrix://plaza/messaging/group/*',
  'agentrix://social/chat-list': 'agentrix://plaza/messaging',
  'agentrix://social/listener': 'agentrix://me/advanced/social-listener',

  // ========== Me 前缀不变（大部分），部分重定位 ==========
  'agentrix://me/settings': 'agentrix://me/settings', // 不变
  'agentrix://me/profile': 'agentrix://me', // 就是首页
  'agentrix://me/referral': 'agentrix://me/promote',
  'agentrix://me/api-keys': 'agentrix://me/advanced/api-keys',
  'agentrix://me/local-ai-model': 'agentrix://me/advanced/local-ai',
  'agentrix://me/wallet-connect': 'agentrix://me/wallet/connect',
  'agentrix://me/wallet-setup': 'agentrix://me/wallet/setup',
  'agentrix://me/wallet-backup': 'agentrix://me/wallet/backup',
  'agentrix://me/notifications': 'agentrix://inbox', // 全局铃铛
  'agentrix://me/share-card/*': 'agentrix://plaza/share-card/*',
  'agentrix://me/scan': 'agentrix://scan', // 全局

  // ========== 废弃屏 → 兼容跳转 ==========
  'agentrix://quick-pay': 'agentrix://me/wallet',
  'agentrix://identity-activation/*': 'agentrix://me', // 无身份包，去我首页
  'agentrix://airdrop': 'agentrix://plaza/feed',
  'agentrix://alliance': 'agentrix://me/advanced/alliance',

  // ========== 特殊深链（配对 / OAuth）不变 ==========
  'agentrix://connect': 'agentrix://me/devices/local-connect', // 桌面配对
  'agentrix://auth/callback': 'agentrix://auth/callback', // OAuth
  'agentrix://login': 'agentrix://login',
};

/**
 * 在 App.tsx `linking` 处理前拦截，转发旧路径到新路径。
 * 保证旧通知 / 第三方分享链接不 404。
 */
export function resolveLegacyRoute(url: string): string {
  for (const [pattern, target] of Object.entries(LEGACY_ROUTE_MAP)) {
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -2);
      if (url.startsWith(prefix)) {
        const suffix = url.slice(prefix.length);
        return target.replace('/*', suffix);
      }
    } else if (url === pattern) {
      return target;
    }
  }
  return url; // 不匹配返回原 url
}
```

### 8.1 `linking` 配置新结构

```typescript
// App.tsx 新 linking 结构（对应 4 Tab）
const linking = {
  prefixes: [Linking.createURL('/'), 'agentrix://', 'https://agentrix.top'],
  getStateFromPath: (path, options) => {
    // 先走 legacy route resolver
    const resolved = resolveLegacyRoute(`agentrix://${path}`);
    const newPath = resolved.replace('agentrix://', '');
    return getStateFromPath(newPath, options);
  },
  config: {
    screens: {
      Auth: { screens: { Login: 'login', AuthCallback: 'auth/callback' } },
      InvitationGate: 'invitation-gate',
      Onboarding: {
        screens: {
          DeploySelect: 'onboarding/deploy',
          CloudDeploy: 'onboarding/cloud',
          ConnectExisting: 'onboarding/connect',
          LocalDeploy: 'onboarding/local',
          SocialBind: 'onboarding/social/:instanceId',
        },
      },
      Main: {
        screens: {
          MainTabs: {
            screens: {
              Home: {
                screens: {
                  HomeRoot: '',
                  Pet: 'home/pet',
                  PetSkills: 'home/pet/skills',
                  PetWallet: 'home/pet/wallet',
                  PetMemory: 'home/pet/memory',
                  PetPlay: 'home/pet/play',
                  PetWardrobe: 'home/pet/wardrobe',
                  PetSoul: 'home/pet/soul',
                  PetBreed: 'home/pet/breed',
                  PetIdentity: 'home/pet/identity',
                  PetCreator: 'home/pet/creator',
                  PetPermissions: 'home/pet/permissions',
                  PetSpace: 'home/pet/space/:spaceId',
                  CoRaisingInvite: 'home/co-raising/invite',
                  CoRaisingLanding: 'home/co-raising/:token',
                },
              },
              Summon: {
                screens: {
                  SummonRoot: 'summon',
                  Voice: 'summon/voice',
                  Session: 'summon/session/:sessionId',
                },
              },
              Plaza: {
                screens: {
                  Feed: 'plaza',
                  Skills: 'plaza/skills',
                  SkillDetail: 'plaza/skills/:skillId',
                  SkillInstall: 'plaza/skills/install/:skillId',
                  Checkout: 'plaza/checkout/:orderId',
                  Tasks: 'plaza/tasks',
                  TaskDetail: 'plaza/tasks/:taskId',
                  PostTask: 'plaza/tasks/post',
                  Pets: 'plaza/pets',
                  PetsSkins: 'plaza/pets/skins',
                  SkinAuctionDetail: 'plaza/pets/skins/:auctionId',
                  PetAuctionDetail: 'plaza/pets/auction/:auctionId',
                  Play: 'plaza/play',
                  Predict: 'plaza/play/predict',
                  Messaging: 'plaza/messaging',
                  MessagingDM: 'plaza/messaging/:partnerId',
                  MessagingGroup: 'plaza/messaging/group/:groupId',
                  ShareCard: 'plaza/share-card',
                  GreetingCardCompose: 'plaza/greeting/compose',
                  GreetingCardInbox: 'plaza/greeting/inbox',
                  PostDetail: 'plaza/feed/post/:postId',
                  UserProfile: 'plaza/feed/user/:userId',
                  CreatePost: 'plaza/feed/create',
                  ToyCustom: 'plaza/toy/custom',
                },
              },
              Me: {
                screens: {
                  Profile: 'me',
                  Wallet: 'me/wallet',
                  WalletAssets: 'me/wallet/assets',
                  WalletConnect: 'me/wallet/connect',
                  WalletSetup: 'me/wallet/setup',
                  WalletBackup: 'me/wallet/backup',
                  WalletAutoEarn: 'me/wallet/auto-earn',
                  WalletSettlements: 'me/wallet/settlements',
                  WalletBudgets: 'me/wallet/budgets',
                  WalletSplitPlans: 'me/wallet/split-plans',
                  PayMpcDemo: 'me/wallet/pay-demo',
                  Axp: 'me/axp',
                  AxpShop: 'me/axp/shop',
                  Promote: 'me/promote',
                  PromoteLinks: 'me/promote/links',
                  PromoteCommission: 'me/promote/commission',
                  MyOrders: 'me/orders',
                  MySkills: 'me/skills',
                  MyFavorites: 'me/favorites',
                  Subscribe: 'me/subscribe',
                  Devices: 'me/devices',
                  DevicesDesktop: 'me/devices/desktop',
                  DevicesWearable: 'me/devices/wearable',
                  DevicesWearableMonitor: 'me/devices/wearable/monitor/:deviceId',
                  DevicesGlass: 'me/devices/glass',
                  DevicesToy: 'me/devices/toy',
                  DevicesAdd: 'me/devices/add',
                  DevicesOpenClaw: 'me/devices/openclaw',
                  DevicesLocalConnect: 'me/devices/local-connect',
                  Team: 'me/team',
                  TeamSpace: 'me/team/space',
                  TeamInvite: 'me/team/invite',
                  TeamTask: 'me/team/task/:taskId',
                  TeamMember: 'me/team/member/:agentId',
                  Family: 'me/family',
                  Settings: 'me/settings',
                  Account: 'me/account',
                  AdvancedApiKeys: 'me/advanced/api-keys',
                  AdvancedLocalAi: 'me/advanced/local-ai',
                  AdvancedMcp: 'me/advanced/mcp',
                  AdvancedAcp: 'me/advanced/acp',
                  AdvancedPlugin: 'me/advanced/plugin',
                  AdvancedMemoryWiki: 'me/advanced/memory-wiki',
                  AdvancedSocialListener: 'me/advanced/social-listener',
                  AdvancedWorkflow: 'me/advanced/workflow',
                  AdvancedSkillPack: 'me/advanced/skill-pack',
                  AdvancedStorage: 'me/advanced/storage',
                  AdvancedAlliance: 'me/advanced/alliance',
                },
              },
            },
          },
          Inbox: 'inbox', // 全局审批 / Handoff / 通知
          Scan: 'scan',   // 全局扫码
        },
      },
    },
  },
};
```

---

## 9. Sprint 实施计划（14 天连做）

### 9.1 Sprint A · IA 骨架 + 家 Tab + 召唤 Tab（5 天）

**目标**：用户从登录进来就看到新 4 Tab，旧路径不崩。

| # | 任务 | 工程量 | 验收标准 |
|--:|-----|-------:|---------|
| A1 | 新 `MainTabNavigator`：家/召唤/集市/我 4 Tab，废除 `DrawerNavigator` | 0.5d | 4 Tab 可见，Drawer 不再出现 |
| A2 | 新 `HomeStackNavigator` + `HomeScreen`（主宠 3D 渲染 + 状态条 + 经济 glance + 签到 + 今日进度） | 1d | 首屏显示主宠 + Lv + 能量 + 钱包快览 |
| A3 | 主宠抽屉 10 入口（长按/上划触发，导航到现有屏） | 0.5d | 10 个入口全部可跳转 |
| A4 | 新 `SummonStackNavigator` + 多宠×场景会话 Tab + LLM 用量条 | 0.5d | 多会话切换可用，用量条显示 |
| A5 | `AgentChatScreen` 4097 行拆分 → `BuddyChat` 组件 + `useBuddyChatRuntime` + `MessageList` + `InputZone` + `ToolCallBlock` | 2d | 主文件 < 1800 行，对话功能不退化 |
| A6 | 废弃 `AgentConsoleScreen` / `QuickPayScreen` / `PetHubScreen` / `DiscoverScreen`(old) / `DMListScreen` / `DMChatScreen` / `ChatListScreen` → 移入 `src_deprecated/` | 0.3d | 旧文件不再被 import |
| A7 | `legacyRouteTable.ts` + `App.tsx` linking 拦截器 | 0.5d | 旧深链全部正确跳转新位置 |
| A8 | 全局 🔔 铃铛组件（审批 + Handoff + 通知合并入口） | 0.3d | 所有 Tab 右上角可见 |

**Sprint A Gate**（2026-05-10 阶段性验收）：
- [x] 4 Tab 可见且可切换（新 `MainTabNavigator` · 家/召唤/集市/我）
- [x] 家 Tab 显示主宠（骨架）+ 状态 + 经济 glance + 抽屉 10 入口
- [x] 召唤 Tab 可正常对话（`AgentChatScreen` 原样复用）
- [x] 旧深链 `agentrix://agent/chat` / `agentrix://pet/companion` / `agentrix://market/*` 全部正确跳转（`legacyRouteTable.ts` + `App.tsx getStateFromPath` 拦截）
- [x] `typecheck:root` 通过（0 个 Sprint A 引入的新错误；5 个 pre-existing 错误不在本次重构范围）
- [x] 全局 🔔 铃铛 + 📷 扫码作为 Root-level modal 挂载
- [x] `DrawerNavigator` 不再被 `RootNavigator` 引用（文件保留到 Sprint E 彻底删除）
- [x] **A5 最小切片完成**（2026-05-10）：抽 `extractUrlsFromMessage / getCopyableMessageText / buildDisplayMessageText / stripInlineMarkdown / dedupeUrls` 到 `src/screens/agent/chatMessage.utils.ts` + 21 unit tests（含发现并修复了 `/api/uploads/*` 无扩展名 URL 被吞的 pre-existing bug）。完整 AgentChatScreen 4097 行拆分仍延后到 Maestro 真机回归覆盖之后。
- [x] **A6 Warn-only 阶段完成**（2026-05-10）：`src/navigation/legacyNavWarn.ts` + 6 unit tests 工具就绪；线上 5 处已知的 `navigate('Discover'|'Agent'|'Team'|'Pet'|'Wallet')` call site 全部迁移（FeedScreen / SkillInstallScreen / TeamDashboardScreen / ClawSkillDetailScreen / AgentConsoleScreen）。Legacy stacks 仍挂作为安全网；Sprint E 真机冒烟验证 7 天无 warn 后删除。

### 9.2 Sprint B · 集市 Tab 经济闭环（4 天）

**目标**：集市 5 段可用，技能/任务/宠物/玩乐/Feed 全部有真实数据。

| # | 任务 | 工程量 | 验收标准 |
|--:|-----|-------:|---------|
| B1 | `PlazaStackNavigator` + 5 段 Segmented（Feed/技能/任务/宠物/玩乐） | 0.5d | 5 段切换流畅 |
| B2 | Feed：现 `FeedScreen` 对接 post type 扩展 + CTA 路由（装技能/接任务/出价/下注/报名游戏） | 1d | 每种 post 类型 CTA 可点击跳转 |
| B3 | 技能：每卡 3 CTA（⚡装到主宠 / 🔁转发得佣金+AXP / 💰购买） | 0.5d | 装到主宠走 `/skills/install` |
| B4 | 任务："主宠接单"自动匹配视图（A2A Matching API）+ "我发布"视图 | 1d | 列表可刷新，接单按钮可用 |
| B5 | 宠物 · Skin Auction MVP：整合 `pet-skin` + `marketplace-pet`，列表 + 出价 + 挂牌 | 1.5d | 可浏览皮肤 / 出价 / 挂牌 |
| B6 | 玩乐 · 共养入口 + 贺卡入口 + Predict 入口 | 0.5d | 3 个入口可进入 |
| B7 | `MessagingScreen` 统一（合并 4 DM 屏），对齐后端 `/messaging/dm/*` 真实 API | 0.5d | DM 收发正常 |
| B8 | 分享卡体系：消息气泡长按 → ShareCard → 外部分享带 ref | 0.5d | 分享到 Twitter/Telegram 可用 |

**Sprint B Gate**（2026-05-10 阶段性验收）：
- [x] 集市 5 段全部有内容（PlazaScreen 5 段 Segmented 已上）
- [x] "⚡装到主宠"端到端路径（路由通到 `/skills/install`；主宠选择器 Sprint D 强化）
- [x] Skin Auction 入口存在（stub 占位屏，真实数据 Sprint B5 再上）
- [x] 分享卡生成 + 外部分享带 ref code（贺卡流程已支持 Share API）
- [x] DM 路径保留（Plaza.DirectMessage 已路由到 `/messaging/dm/*` 对接屏）
- [x] `typecheck:root` 通过（0 新错误）

### 9.3 Sprint C · 多人游戏 + AXP 基础（3 天）

**目标**：共养 + 贺卡可玩，AXP 发放/消耗/余额可见。

| # | 任务 | 工程量 | 验收标准 |
|--:|-----|-------:|---------|
| C1 | 共养：`CoRaisingInviteScreen` + `CoRaisingLandingScreen` + `CoRaisingActivityScreen` | 1.5d | 发起邀请 → 好友点击喂食 → 能量 + → AXP + |
| C2 | 贺卡：`GreetingCardComposerScreen` + `GreetingCardInboxScreen` | 1d | 选模板 → 发送 → 收件人收到 → AXP + |
| C3 | AXP 基础：后端 `user_axp_ledger` 表 + `POST /api/v1/axp/earn` + `POST /api/v1/axp/spend` + `GET /api/v1/axp/balance` | 0.5d | 余额查询 + 变动记录 |
| C4 | 前端 AXP 展示：家 Tab "💎 AXP 12,340" + 我 Tab `AxpCenterScreen` 骨架 | 0.5d | 余额可见 + 历史可查 |
| C5 | 签到 AXP 发放：每日签到 → `POST /api/v1/axp/earn { source: 'daily_checkin' }` | 0.3d | 签到后余额 + |
| C6 | 对话 AXP 发放：聊满 10 轮 → 自动 earn 20 AXP | 0.3d | 对话后弹 "+20 AXP" |

**Sprint C Gate**（2026-05-10 阶段性验收）：
- [x] 共养：邀请生成 + 链接分享 + peekInvite 公共落地 + feed 接 AXP 奖励（C1 完成）
- [x] 贺卡：模板目录 + 发送（Premium 扣 AXP）+ 收件箱 redeem（C2 完成）
- [x] 后端 AXP API：`user_axp_ledger` / `user_axp_balance` + earn/spend/history/balance + 过期 FIFO (C3 完成)
- [x] 前端 AXP 展示：Home Tab "💎 AXP" 卡 + Me Tab AxpCenterScreen 完整历史（C4 完成）
- [x] 每日对话 / 签到的 AXP 发放由服务端内置 daily caps 保护（AxpService 中实现）

### 9.4 Sprint D · 我 Tab 收口 + 订阅 + 配额可视化（2 天）

**目标**：我 Tab 完整，订阅升级入口可用，配额可视化。

| # | 任务 | 工程量 | 验收标准 |
|--:|-----|-------:|---------|
| D1 | `MeStackNavigator` 重写：Profile / 钱包 / 推广 / 设备 / 团队 / 设置 / 高级 | 0.5d | 所有子页可达 |
| D2 | `SubscribePlanScreen`：5 档展示 + Stripe 跳转 + AXP 抵扣选项 | 0.5d | 可查看 5 档 + 点击升级 |
| D3 | 配额可视化：每个能力入口旁显示"5/30"+ 升级引导 | 0.5d | 技能/皮肤/商品/硬件/游戏配额可见 |
| D4 | 推广中心合并：`ReferralDashboard + CreateLink + MyLinks + Commission*` → 统一 `PromoteScreen` | 0.3d | 推广链 + 佣金 + AXP 收入一屏 |
| D5 | 设备与连接折叠区 + 团队与家庭折叠区 | 0.3d | 折叠/展开正常 |
| D6 | 高级区（uiComplexity ≥ advanced）：所有下沉屏挂载 | 0.3d | 高级区可展开 + 所有屏可达 |

**Sprint D Gate**（2026-05-10 阶段性验收）：
- [x] 我 Tab ProfileScreen 重构完成：topbar + 订阅档位 badge + AXP glance + 配额可视化 + Devices/Team/Advanced 折叠分组
- [x] 订阅页 5 档展示真实 catalog（monthly/yearly toggle, current-tier banner, per-tier quota 预览）
- [x] 配额可视化在 ProfileScreen quotaGrid 展示 6 个核心配额
- [x] 推广中心入口保留（My stuff → Referrals & Earnings，点击走 `ReferralDashboard`）
- [x] Devices / Team / Advanced 折叠区上线；beginner 模式点开 Advanced 弹一次性解锁 Alert
- [x] `typecheck:root` 通过（0 新错误）
- [ ] Stripe checkout 真实流程留 Sprint D2+（需后端 priceId 映射 + webhook 对接）
- [ ] Family 账号入口（有家庭时才显示）留 Sprint E（需 family-account API 对接）

---

## 10. 冷启动 / 增长 / 成熟 三阶段运营

### 10.1 Phase 1 · 冷启动（0 → 1k MAU · 1-2 月）

| 策略 | 具体动作 | 目标 |
|-----|---------|-----|
| **创世宠计划** | 前 500 用户领创世宠 NFT（限定灵魂+皮肤），稀缺性拉增长 | 500 注册 |
| **Plus 体验券** | 前 500 用户送 Plus 3 个月免费 | 付费转化 30%+ |
| **Dev 基金** | 谁在 Free 档发布技能通过审核 → 自动解锁 Plus 1 个月 | 首批 50 技能 |
| **Creator 邀请** | 邀请 20 位设计师入驻，Free 也能试挂皮肤 | 首批 100 皮肤 |
| **Merchant 种子** | 免费提供 10 家商户 Pro 3 个月做案例 | 首批 10 商户 |
| **AXP 空投** | KOL / Twitter 用户凭转发领 2000 AXP | 社交曝光 |
| **共养裂变** | 每个新用户自动生成共养链接 → 分享得 500 AXP | K-factor > 1.2 |

### 10.2 Phase 2 · 增长（1k → 50k MAU · 3-6 月）

| 策略 | 具体动作 | 目标 |
|-----|---------|-----|
| **公会系统** | 用户自建 Alliance，公会内 GMV 1% 归公会主 | 50+ 公会 |
| **创作者扶持** | 月度 Top 10 设计师得平台流量 + 限定徽章 | 创作者 500+ |
| **每周大事件** | 每周一次主题（万圣节宠 / 春节福宠 / 程序员节代码宠） | 周活 +20% |
| **共养任务榜** | 月度帮养 KOL 榜，奖励限定皮肤 | DAU 留存 +15% |
| **推广分成** | L1=10% + L2=3% 全面开放 | 推广者 1000+ |
| **Skin Auction 热度** | 每周限定拍卖（稀有血统 / 联名皮肤） | 拍卖 GMV $10k/月 |
| **L2 联名首批** | 2-3 家 IP 方做首批联名玩偶 | 首批 SKU 上线 |

### 10.3 Phase 3 · 成熟（50k+ MAU · 6-12 月）

| 策略 | 具体动作 | 目标 |
|-----|---------|-----|
| **AX 代币发行** | AXP 1:100 兑换 AX，治理投票 | 代币经济启动 |
| **Agent Economy 峰会** | 年度活动，NFT 拍卖峰会 | 品牌影响力 |
| **企业案例库** | SMB/企业案例白皮书，驱动 B 端销售 | Enterprise 合同 10+ |
| **AI 生态基金** | 投资孵化第三方宠物/技能/游戏团队 | 生态项目 50+ |
| **Game Studio SDK 开放** | 第三方游戏工作室入驻 | 游戏 10+ |
| **Hardware L2 规模化** | 联名玩偶 10+ SKU | 硬件 GMV $100k/月 |
| **全球化** | 多语言 + 多区域定价 + 合规 | 海外 MAU 30%+ |

---

## 11. 风险清单 + 必要前置

### 11.1 技术前置（Sprint A 前必须完成）

| # | 前置 | 责任 | 状态 |
|--:|-----|------|-----|
| 1 | 后端 `desktop-sync` devices Map 合入 `agent-presence/UnifiedDeviceService` | Backend | ⬜ 未开始 |
| 2 | 后端 `POST /api/v1/axp/earn` + `POST /api/v1/axp/spend` + `GET /api/v1/axp/balance` API | Backend | ⬜ 未开始 |
| 3 | 后端 `pet_coraising_invites` 表 + 共养分成逻辑（复用 commission V4） | Backend | ⬜ 未开始 |
| 4 | 后端 `pet_greeting_cards` 表 + 模板 CRUD | Backend | ⬜ 未开始 |
| 5 | 后端 `user_axp_ledger` + `user_axp_balance_snapshot` 表 + 过期 FIFO 调度 | Backend | ⬜ 未开始 |
| 6 | 后端 `subscription_tier` 字段 + quota 查询 API `GET /api/v1/me/quota` | Backend | ⬜ 未开始 |
| 7 | Stripe 5 档 Product/Price 创建（test mode） | Backend | ⬜ 未开始 |

### 11.2 风险登记

| 风险 | 严重度 | 缓解 |
|-----|-------|------|
| AgentChat 拆分退化（4097 行拆 5 组件） | 高 | 单独 PR + 对话 E2E 回归 |
| 深链 404（旧通知/分享链接失效） | 高 | legacyRouteTable 100% 覆盖 + CI 测试 |
| LLM 成本失控（Free 用户滥用） | 高 | 硬限 20 轮/日 + $0.30 预算 + 本地模型降级 |
| AXP 通胀（发放 > 销毁） | 中 | 动态调节器 + 12 月过期 + 108% 销毁率设计 |
| iOS App Review 拒审（Tab 大改） | 中 | 提前 TestFlight 2 周 + 截图更新 |
| Drawer 删除用户习惯断裂 | 低 | 一次性 toast 提示"功能已移至底部 Tab" |
| 多宠切换性能（N 只宠 × 独立状态） | 中 | 懒加载 + 只预加载主宠 |
| 共养被刷号薅 AXP | 中 | IP/设备限 + 每人每日 1 次 + 注册门槛 |
| Skin Auction 定价混乱 | 低 | 起拍价下限 + 平台推荐价 |
| 后端 7 个前置未完成阻塞 Sprint A | 高 | Sprint A 前 2 天并行做后端 |

### 11.3 不做的事（明确排除）

- ❌ 不做 IDE / 代码编辑器（桌面端专属）
- ❌ 不做商户后台完整版（Web Console 做）
- ❌ 不做合规审计面板（Web Console 做）
- ❌ 不做 Live2D 渲染（桌面端专属，移动端用 Rive/SVG/3D fallback）
- ❌ 不做 AX 代币发行（Phase 3+）
- ❌ 不做 Enterprise 私有化（合同定制，不在移动端）
- ❌ 不做 Hardware L2 联名后台（Web Console + 合同流程）
- ❌ 不做 Game Studio SDK（Phase 2+）
- ❌ 不做多人实时 PvP 游戏（Phase 2+，共养/贺卡是异步的）

---

## 12. 附录：Navigation 树最终结构

```
RootNavigator
├── Auth Stack
│   ├── LoginScreen
│   ├── AuthCallbackScreen
│   └── WalletConnectScreen
├── InvitationGateScreen
├── Onboarding Stack
│   ├── DeploySelectScreen
│   ├── CloudDeployScreen
│   ├── ConnectExistingScreen
│   ├── LocalDeployScreen
│   └── SocialBindScreen
└── Main (4 Tab)
    ├── 🏠 Home Stack
    │   ├── HomeScreen (主宠 3D + 状态 + 经济 + 签到 + 进度)
    │   ├── PetCompanionScreen (主宠详情)
    │   ├── PetSkillsScreen (技能栏)
    │   ├── PetTasksScreen (接单/发布)
    │   ├── PetWalletScreen (宠钱包 · Agent Account)
    │   ├── PetWalletBalanceScreen
    │   ├── PetMemoryScreen (4 层记忆)
    │   ├── PetMemoryDreamingScreen
    │   ├── PetMemoryLogsScreen
    │   ├── PetPlayScreen (成就/相册/小游戏/繁育)
    │   ├── PetWardrobeScreen
    │   ├── PetSoulScreen (6 族群)
    │   ├── PetBreedScreen
    │   ├── PetIdentityScreen (ERC-8004 + NFT)
    │   ├── PetCreatorScreen
    │   ├── PetTeamScreen
    │   ├── PetPermissionsScreen
    │   ├── PetSpaceScreen
    │   ├── PetWorkflowScreen
    │   ├── CoRaisingInviteScreen
    │   ├── CoRaisingLandingScreen
    │   └── CoRaisingActivityScreen
    │
    ├── 🔮 Summon Stack
    │   ├── SummonScreen (多宠×场景会话 + 对话流 + LLM 用量)
    │   └── VoiceChatScreen
    │
    ├── 🎪 Plaza Stack
    │   ├── PlazaScreen (5 段 Segmented)
    │   ├── FeedScreen / PostDetailScreen / CreatePostScreen / UserProfileScreen
    │   ├── MessagingScreen / GroupChatScreen
    │   ├── SkillMarketScreen / SkillDetailScreen / CheckoutScreen / SkillInstallScreen
    │   ├── TaskMarketScreen / TaskDetailScreen / PostTaskScreen
    │   ├── PetMarketScreen / SkinAuctionDetailScreen / PetAuctionDetailScreen
    │   ├── PredictScreen
    │   ├── CoRaisingInviteScreen (alias)
    │   ├── GreetingCardComposerScreen / GreetingCardInboxScreen
    │   ├── ShareCardScreen / CreateLinkScreen
    │   └── ToyCustomScreen
    │
    ├── 👤 Me Stack
    │   ├── ProfileScreen (配额可视化 + 升级 CTA)
    │   ├── SubscribePlanScreen
    │   ├── AxpCenterScreen / AxpRewardShopScreen
    │   ├── CheckInScreen (浮层)
    │   ├── WalletDashboardScreen / AssetsScreen / PayMpcDemoScreen
    │   ├── WalletSetupScreen / WalletBackupScreen / WalletConnectScreen
    │   ├── AutoEarnScreen / SettlementsScreen / BudgetPoolsScreen / SplitPlansScreen
    │   ├── PromoteScreen (合并 Referral + Commission + Links)
    │   ├── MyOrdersScreen / MySkillsScreen / MyFavoritesScreen
    │   ├── DevicesHubScreen (折叠)
    │   │   ├── DesktopControlScreen
    │   │   ├── WearableHubScreen / WearableMonitorScreen
    │   │   ├── GlassConnectScreen
    │   │   ├── ToyBindingScreen
    │   │   ├── DeploySelectScreen / CloudDeployScreen / ConnectExistingScreen
    │   │   ├── LocalConnectScreen / OpenClawBindScreen
    │   │   └── ScanScreen
    │   ├── TeamHubScreen (折叠)
    │   │   ├── TeamDashboardScreen / TeamSpaceScreen / TeamInviteScreen
    │   │   ├── TaskBoardScreen / TaskDetailScreen / AgentProfileScreen
    │   │   └── AgentAccountScreen (shared)
    │   ├── FamilyAccountScreen
    │   ├── SettingsScreen / AccountScreen
    │   └── Advanced (折叠)
    │       ├── ApiKeysScreen / LocalAiModelScreen
    │       ├── McpManagerScreen / PluginHubScreen
    │       ├── MemoryWikiScreen / WorkflowListScreen / WorkflowDetailScreen
    │       ├── AcpSessionsScreen / StoragePlanScreen / SkillPackScreen
    │       ├── SocialListenerScreen / AllianceScreen
    │       └── DreamingDashboardScreen (alias, 也在 Home)
    │
    ├── InboxScreen (全局铃铛 · 审批 + Handoff + 通知)
    └── ScanScreen (全局相机)
```

---

## 13. 文档结束 · 下一步

本文档已冻结。下一步：

1. **后端前置**（§11.1 的 7 项）：和后端并行启动，Sprint A 前 2 天完成
2. **Sprint A 开始**：新 `MainTabNavigator` + 家 Tab + 召唤 Tab + 废 Drawer + 深链兼容
3. **每完成一个 Sprint Gate**：回到本文档对应 Gate 打勾
4. **Sprint D 完成后**：全量 `typecheck:root` + Maestro 冒烟 + 深链回归

---

*Agentrix Engineering · 2026-05-10*
