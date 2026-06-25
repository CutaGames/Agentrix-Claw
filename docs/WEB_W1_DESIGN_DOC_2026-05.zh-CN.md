# Web Sprint W1 设计稿 · Marketing 主叙事 + 定价 + Landing 落地

> **版本**：v1.0 · 2026-05-10
> **范围**：Web Sprint W1 · 5 天工作量
> **目标**：Marketing 侧立刻反映 2026-05-10 冻结口径，外部流量看到「宠物 Agent 生态 × AXP × 5 档订阅」新心智
> **上游**：
> - [MOBILE_REFACTOR_AND_ECOSYSTEM_PLAN_2026-05.zh-CN.md](MOBILE_REFACTOR_AND_ECOSYSTEM_PLAN_2026-05.zh-CN.md)
> - [web-prd-v4.md](web-prd-v4.md)
> - [WEB_REFACTOR_PLAN_2026-05.zh-CN.md](WEB_REFACTOR_PLAN_2026-05.zh-CN.md)（本文档下游）

---

## 0. 本文档的作用

本文档是 W1 Sprint 的**设计冻结稿**。Figma / UI 未来可以在此基础上演化，但文案、信息层级、CTA 路由、5 档定价数字在 W1 实施期内不再变动。

W1 完成之后，产出物是以下 9 个任务（W1-1 ~ W1-9）的代码：

| ID | 交付物 | 涉及文件 |
|----|-------|---------|
| W1-1 | Hero 新文案 + PetCreator demo 占位 | `components/marketing/sections.tsx` §HeroLiving |
| W1-2 | 三侧生态 Section（供给 / 需求 / 关系） | `components/marketing/sections.tsx` §ThreeSideEcosystem（新） |
| W1-3 | AXP Narrative Section | `components/marketing/sections.tsx` §AxpNarrative（新） |
| W1-4 | 5 档 + Enterprise PRICING_TIERS 重写 + 年付 toggle | `components/marketing/sections.tsx` §PRICING_TIERS + §PricingTable |
| W1-5 | `/showcase` 瀑布流页 | `pages/showcase.tsx`（新） |
| W1-6 | `/co-raising/[token]` Landing | `pages/co-raising/[token].tsx`（新） |
| W1-7 | `/greeting/[token]` Landing | `pages/greeting/[token].tsx`（新） |
| W1-8 | MarketingHeader IA 调整 | `components/marketing/MarketingHeader.tsx` |
| W1-9 | FAQ 扩 4 条 | `components/marketing/sections.tsx` §FAQ_ITEMS |

---

## 1. Hero 新文案（W1-1）

### 1.1 现版 vs 新版

**现版**（问题：讲「Living Agent / Doer / Economy 三层」，抽象、难共鸣、无宠物心智）：

```
标题：一只 Agent，陪你 · 帮你 · 替你赚钱
副标：从 Mobile 主宠到 Desktop 工作台…同一个 Agent，跨 5 端无缝陪伴、执行任务、自动结算收益
```

**新版**（冻结，对齐 Mobile Refactor §1.2）：

```
EYEBROW：Agentrix v4 · Pet-as-Agent Economy 正式上线

标题（主句）：
  你养的每一只宠物，都是一个能赚钱的 AI Agent
  (EN: Every pet you raise is an AI agent that earns)

副标（2 行）：
  ERC-8004 独立身份 · MPC 独立钱包 · X402 微支付。
  跨 Mobile / Desktop / Web / Watch / Toy 五端陪你、帮你、替你赚钱。
  (EN:
   ERC-8004 identity · MPC wallet · X402 micropay.
   Across Mobile / Desktop / Web / Watch / Toy — companions, works, earns.)

CTA 主：下载 Mobile 开始养宠 → /downloads（次要跳 App Store / Google Play）
CTA 次：打开 Web Console → /auth/login?next=/console/dashboard
CTA 三（低突出）：在 Web 生成你的第一只 → /console/pet/create（W3 后可用，W1 先占位禁用）

信任条（Trust badges，icon + 短语）：
  🛡 MPC 三方分片 · 签名只在 Mobile
  🪙 1 AXP = $0.001 · 签到 / 对话 / 推广 / 消费返现
  🌍 A2A · ERC-8004 · X402 原生支持
  🎨 6 族群灵魂 × 无限皮肤
```

### 1.2 视觉方向

- **背景**：保留现有 purple/electric 双模糊圆，但在中央加一个半透明「宠物 Agent」占位（SVG，后续替换为 Rive/VRM）
- **占位 Demo 视频**：右下角浮层 play button，点击打开 modal（W1 先占位 `<PetCreatorDemoPlaceholder/>`，W3 补真视频）
- **移动端适配**：`md:` 断点下 3 个 CTA 纵向堆叠

### 1.3 i18n 文案（含所有变体）

```ts
const HERO_COPY = {
  eyebrow: {
    zh: 'Agentrix v4 · Pet-as-Agent Economy 正式上线',
    en: 'Agentrix v4 — Pet-as-Agent Economy is here',
  },
  titleMain: {
    zh: '你养的每一只宠物，',
    en: 'Every pet you raise',
  },
  titleAccent: {
    zh: '都是一个能赚钱的 AI Agent',
    en: 'is an AI agent that earns',
  },
  sub: {
    zh: 'ERC-8004 独立身份 · MPC 独立钱包 · X402 微支付。跨 Mobile / Desktop / Web / Watch / Toy 五端陪你、帮你、替你赚钱。',
    en: 'ERC-8004 identity · MPC wallet · X402 micropay. Across Mobile / Desktop / Web / Watch / Toy — companions, works, earns.',
  },
  ctaPrimary: { zh: '下载 Mobile 开始养宠', en: 'Download Mobile — start raising' },
  ctaSecondary: { zh: '打开 Web Console', en: 'Open Web Console' },
  ctaTertiary: { zh: '在浏览器生成我的第一只', en: 'Generate my first pet in browser' },
  badges: [
    { zh: '🛡 MPC 三方分片 · 签名只在 Mobile', en: '🛡 MPC 3-share · signs on Mobile only' },
    { zh: '🪙 1 AXP = $0.001 · 签到 / 对话 / 推广 / 消费返现', en: '🪙 1 AXP = $0.001 · check-in / chat / refer / cashback' },
    { zh: '🌍 A2A · ERC-8004 · X402 原生支持', en: '🌍 A2A · ERC-8004 · X402 native' },
    { zh: '🎨 6 族群灵魂 × 无限皮肤', en: '🎨 6 clans × unlimited skins' },
  ],
};
```

---

## 2. 三侧生态 Section（W1-2）

### 2.1 目的

替代/补充现有 `ThreeLayerVision`（Living/Doer/Economy），传达「每用户都是全能公民」的心智，呼应 Mobile Refactor §1.3「零身份包的本质原因」。

### 2.2 信息层级

```
┌── Section Title ────────────────────────────────────────┐
│   一个账号，所有能力                                       │
│   你在 Agentrix 里，同时是消费者 / 创作者 / 商家 / 家长…     │
└─────────────────────────────────────────────────────────┘

┌── 三侧主视觉（中央平台，三侧用户，箭头连回） ──────────────┐
│                                                          │
│                 🏛 Agentrix 平台                          │
│                 账户 · 钱包 · 协议 · 合约                  │
│              ↙  ↓  ↘                                      │
│   🔧 供给侧       👥 需求侧        🤝 关系侧              │
│                                                          │
│   技能开发        个人 / 商家       推广者                │
│   宠物设计        开发者 / 家庭     公会主                │
│   AI 模型商       企业             创作者 KOL             │
│   硬件合作                          家长 / 监护           │
│   MCP 供应                          联盟 Alliance         │
│   广告主                                                  │
│                                                          │
│   所有交互 = 宠物 Agent 为载体                            │
│   结算 = MPC + X402 + Commission V4                       │
│   激励 = AXP 积分                                          │
└─────────────────────────────────────────────────────────┘

┌── 三列卡片 ──────────────────┬──────────────────┬──────────────────┐
│ 🔧 我是供给方                │ 👥 我是需求方    │ 🤝 我是关系方    │
│ 发布技能/皮肤/商品/硬件/游戏  │ 陪伴 + 任务 + 消费│ 推广 + 共养 + 公会│
│ 订阅档位 → 发布配额↑ + 曝光↑  │ 订阅档位 → 配额↑  │ 订阅档位 → 佣金↑  │
│ [了解创作者分成 →]           │ [开始养宠 →]      │ [加入推广 →]      │
└─────────────────────────────┴──────────────────┴──────────────────┘
```

### 2.3 组件命名 & 放置

- 新函数：`export function ThreeSideEcosystem()` 放在 `sections.tsx` 里，位置**在 `V3FeaturesSection` 之后、`ThreeLayerVision` 之前**（即 `HeroLiving → V3FeaturesSection → ThreeSideEcosystem → ThreeLayerVision → …`）
- `ThreeLayerVision` 保留但降级为次要 Section（W2/W3 再做是否合并）

---

## 3. AXP Narrative Section（W1-3）

### 3.1 目的

首页完整介绍 AXP 积分体系，解决 Audit 发现的「AXP 心智在 Web 上根本没出现」。

### 3.2 信息层级

```
┌── Section Header ───────────────────────────────────────┐
│   💎 AXP 积分体系                                         │
│   1 AXP = $0.001 · 轻度通缩 · 12 个月过期 FIFO           │
└─────────────────────────────────────────────────────────┘

┌── 两栏左右 ─────────────────────────────────────────────┐
│  左：6 大获得方式               右：5 大使用场景          │
│  🎁 每日签到 +20 AXP            💳 订阅续费抵扣（≤20%）   │
│  💬 聊 10 轮 +20 AXP            ⚡ 技能购买抵扣（≤20%）   │
│  👬 共养好友宠物 +5 AXP         👕 皮肤购买抵扣（≤20%）   │
│  🔗 推广新用户 +500 AXP         🎯 集市置顶 / A2A 优先匹配│
│  💰 消费返现（见右侧阶梯）       🎰 抽奖 / 限定兑换         │
│  🏆 游戏大赛 / 成就解锁                                   │
└─────────────────────────────────────────────────────────┘

┌── 返现阶梯表（强 CTA 引导升级） ──────────────────────────┐
│  档位      买 $100 返 AXP      返现率                      │
│  Free      0                   0%                          │
│  Lite      500                 5%                          │
│  Plus      1,000               10%   ← 推荐                 │
│  Pro       1,500               15%                         │
│  Elite     2,000               20%                         │
│  [查看完整定价 → /pricing]                                  │
└────────────────────────────────────────────────────────────┘
```

### 3.3 组件命名

- 新函数：`export function AxpNarrative()` 放在 `sections.tsx`
- 位置：**在 `PricingTable` 之前**（首页不直接调用 `PricingTable`，仅 `AxpNarrative` 后接 `DownloadCallout`；`/pricing` 单独页用 `PricingTable` + `AxpNarrative`）

---

## 4. 5 档订阅 PRICING_TIERS（W1-4）

### 4.1 数据结构升级

原 `PricingTier` 只支持月价，升级：

```ts
export interface PricingTier {
  key: 'free' | 'lite' | 'plus' | 'pro' | 'elite' | 'enterprise';
  name: { zh: string; en: string };
  monthlyPrice: { zh: string; en: string };          // "$0" | "$4.99" | "$14.99" | "$29.99" | "$69" | "联系我们"
  yearlyPrice: { zh: string; en: string } | null;    // "$49" | "$149" | "$299" | "$690"；Free/Enterprise 为 null
  yearlySavings?: { zh: string; en: string };        // "省 $9.88" 等
  unit: { zh: string; en: string };
  tagline: { zh: string; en: string };               // 一句话定位
  axpCashback: number;                                // 0 | 5 | 10 | 15 | 20
  features: Array<{ zh: string; en: string }>;       // 6-8 条核心能力
  ctaText: { zh: string; en: string };
  ctaHref: string;
  highlight?: boolean;                                // Plus 设为 true
  isEnterprise?: boolean;
}
```

### 4.2 完整 6 档数据（冻结，对齐 Mobile §3.1）

| key | 月价 | 年价 | 年省 | tagline | 返现 | highlight |
|-----|----:|----:|----:|--------|----:|----:|
| free | $0 | — | — | 规模 + 教育 + AXP 裂变 | 0% | |
| lite | $4.99 | $49 | $10.88 | 去除硬限，继续探索 | 5% | |
| plus | $14.99 | $149 | $30.88 | 黄金档 · 活跃玩家 / 创作者 / 小商户 | 10% | **✓** |
| pro | $29.99 | $299 | $60.88 | 核心用户 · 全职开发者 / 中型商户 | 15% | |
| elite | $69 | $690 | $138 | 品牌绑定 · 全能力无限 · 流量王者 | 20% | |
| enterprise | 合同 | — | — | 私有化 / SLA / SOC2 / 合规 | — | |

### 4.3 年付 toggle UI

```
┌──────────────────────────────────────────────┐
│        简单透明的定价                          │
│                                              │
│        [ 月付 ]  [ 年付 省 2 个月 ]           │
│         ^active                              │
│                                              │
└──────────────────────────────────────────────┘

4 个档位卡片 + 1 个 Enterprise 宽卡（底部横跨 4 列）
```

- 默认 **月付**
- 切换「年付」时：`$14.99/月` → `$149/年` + 小字「省 $30.88 · 等同 $12.42/月」
- Free / Enterprise 始终显示静态文案

### 4.4 每卡能力展示（仅 6-8 条 most-important，完整 34 项矩阵放在可展开的"能力对比"下）

Free：
- 1-2 只宠 + 基础陪伴
- $0.30 LLM 硬顶 + 本地模型
- 每日 20 轮对话 + 5 min 语音
- 1 技能 / 1 皮肤 / 1 商品 免费上架
- 无 AXP 返现

Lite（$4.99）：
- 5 只宠 + 去掉对话 / 语音硬限
- $2.5 LLM cloud 预算
- 3 技能 / 3 皮肤 / 5 商品
- 无限对话 + 无限语音
- **5% AXP 消费返现**

Plus（$14.99 · 推荐）：
- 15 只宠 + $8 LLM cloud 预算
- 10 技能 / 10 皮肤 / 30 商品 / L3 × 3 硬件
- 首个可发布游戏 / 公会席位
- **10% AXP 消费返现**
- 集市推荐权重 1.5×

Pro（$29.99）：
- 40 只宠 + $20 LLM cloud 预算
- 30 技能 / ∞ 皮肤 / 100 商品 / L3 ∞ + L2 × 1
- A2A 优先匹配 · L3 多端协签
- 自定义 System Prompt + 模型路由
- **15% AXP 消费返现**

Elite（$69）：
- 无限宠 + $50 LLM cloud 预算
- 所有配额 ∞
- Pet SDK Beta + 季度限定皮肤 + Elite Creator 徽章
- 2h 审核 lane + 4h 专属客服
- **20% AXP 消费返现** · 首页推荐权重 3×

Enterprise（合同）：
- $500 起 / 10 席位 / 私有 VPC / 99.5% SLA
- $5k / 100 席位 / on-prem / 99.9% SLA / 专属经理
- $50k+ / 无限 / SOC2 / ISO27001 / 白标 SDK / 7×24 电话

### 4.5 超额三选一说明（PricingTable 底部，所有档位共享）

```
💡 当预算 / 配额耗尽时，你有 3 个选择：
  ① AXP 抵扣：10,000 AXP = $10 折扣
  ② 现金实扣：绑卡按需 1.3-1.5× 倍率
  ③ BYOK：自带 API Key，LLM 永远免计费（订阅费照收）
```

---

## 5. `/showcase` 瀑布流页（W1-5）

### 5.1 目的

每日精选用户共创皮肤瀑布流，社交分享带 OG 卡片，符合 V4 PRD §2.1。

### 5.2 骨架

- 路由：`/showcase`
- Layout：`MarketingLayout`（不登录可访问）
- 内容：
  - 顶部 Hero：「今日精选」+ 今日发布数 / 今日 GMV
  - Masonry 瀑布流（`react-masonry-css` 或纯 Flexbox）
  - 每卡：3D/VRM 缩略图（W1 用静态图占位）+ 作者头像 + 标题 + 标签 + 点赞/收藏/Remix 次数
  - 点击卡 → `/market/skin/[id]`（W2 上线）
- 筛选：族群 A-F + 标签（情绪 / 风格 / 颜色）
- SEO：`buildSeo` + 动态 OG 图 `/api/og/showcase`（W5 接入）

### 5.3 API 依赖

- `GET /api/v1/market/skins?sort=featured&limit=30&clan=xxx` （后端 Mobile Sprint B5 同源）
- W1 可用 mock 数据先上线 UI，W2 接真数据

---

## 6. `/co-raising/[token]` Landing（W1-6）

### 6.1 目的

Mobile 共养链接分享到 Twitter / 微信等，非 Agentrix 用户点击也要能看到内容并被引导下载。

### 6.2 路径参数

- `token`：32 字节随机字符串，后端 Sprint C1 已生成 `pet_coraising_invites.token`
- 可选 query：`?utm_source=twitter&utm_campaign=pet-alfred`

### 6.3 骨架

```
┌──────────────────────────────────────┐
│  🐾 Alfred 想让你帮它喂食              │
│                                      │
│  [宠物 3D/静图]                       │
│  Alfred · Lv.7 · 😊 · 能量 72%        │
│  邀请人：Alex （显示头像）             │
│                                      │
│  [喂食 +2 能量 +5 AXP]               │
│   → 未注册点击后跳下载引导            │
│   → 已注册点击后调 API 完成喂养       │
│                                      │
│  💡 注册就送 500 AXP  → /auth/register│
│                                      │
│  (底部)                               │
│  关于 Pet-as-Agent · 隐私政策         │
└──────────────────────────────────────┘
```

### 6.4 API 依赖

- `GET /api/v1/co-raising/peek?token=xxx` — 公开，返回宠物 + 邀请人基本信息（Mobile Sprint C1 同源）
- `POST /api/v1/co-raising/feed` — 登录后调用
- 登录检测 → 未登录跳 `/auth/register?next=/co-raising/xxx&reward=500`

---

## 7. `/greeting/[token]` Landing（W1-7）

### 7.1 骨架

```
┌──────────────────────────────────────┐
│  🎁 Alex 的 Alfred 给你发了一张贺卡   │
│                                      │
│  [贺卡 3D/模板渲染，全屏]              │
│                                      │
│  "祝你生日快乐！一起来养我吧 🎂"      │
│                                      │
│  [收下 +20 AXP]                      │
│  [回一张 → /greeting/compose]        │
│                                      │
│  💡 未注册收下自动注册 + 送 500 AXP   │
└──────────────────────────────────────┘
```

### 7.2 API 依赖

- `GET /api/v1/greeting/peek?token=xxx`
- `POST /api/v1/greeting/redeem`（登录后）
- 未登录点"收下"→ 跳 `/auth/register?next=/greeting/xxx&reward=520`

---

## 8. MarketingHeader IA 调整（W1-8）

### 8.1 现版 vs 新版

**现版**：
```
[Logo] Product ▾ | Pricing | Skills | Developers | Enterprise | Family | Downloads    [Login]
```

**新版**：
```
[Logo] Product ▾ | Market ▾ | Pricing | Showcase | Developers | Enterprise | Family | Downloads    [Login]
```

### 8.2 两个下拉详细

**Product ▾**（顶级菜单延伸）：
- 产品概览 → `/`
- Pet-as-Agent 生态 → `/manifesto`（manifesto 内容要在 W2 对齐新口径，W1 先改导航文案）
- 5 端能力矩阵 → `/features`
- AXP 积分体系 → `/#axp`（首页 anchor）**新增**
- 6 族群灵魂 → `/clans`
- 应用场景 → `/use-cases`
- 安全与 MPC → `/security`

**Market ▾**（新增）：
- Marketplace 主页 → `/market`（W2 上线）
- Showcase 精选 → `/showcase`
- Skills 市场 → `/skills`（保留 Marketing 介绍页，W4 合并到 /market）
- 拍卖大厅 → `/market/auction`（W2 上线，W1 禁用占位）
- 创作者排行榜 → `/market/leaderboard`（W2 上线，W1 禁用占位）

### 8.3 变动说明

- `/skills` 从顶级降级到 Market 下拉内（避免与新 `/market` 混淆）
- `Showcase` 提升为顶级（V4 PRD 明示）
- 保留 `Family` 顶级（家庭账号受众群体独立，仍要强 CTA）

---

## 9. FAQ 扩 4 条（W1-9）

在现有 4 条之后追加：

```ts
{
  q: { zh: 'AXP 和未来的 AX 代币是什么关系？', en: 'What is the relation between AXP and the upcoming AX token?' },
  a: {
    zh: 'AXP 是 off-chain 软积分（Phase 1 已上线）。AX 是未来合规就绪后的 ERC-20 治理代币（Phase 3+）。AXP 会按 1:100 固定比例预留 AX 兑换接口，过渡期无缝。',
    en: 'AXP is an off-chain soft point (Phase 1 live). AX is an ERC-20 governance token planned for Phase 3+ when compliance is ready. AXP is reserved a 1:100 bridge to AX for seamless transition.',
  },
},
{
  q: { zh: '5 档订阅怎么选？', en: 'How to pick among the 5 tiers?' },
  a: {
    zh: 'Free 适合尝鲜；Lite 解决硬限；Plus 是黄金档（创作者 / 小商户）；Pro 面向全职开发 / 中型商户；Elite 给品牌 KOL / 深度玩家；Enterprise 面向需要 SLA / SOC2 / 私有化的企业。',
    en: 'Free for tasting; Lite removes hard caps; Plus is the sweet spot (creators / SMBs); Pro for full-time devs / mid merchants; Elite for brand KOLs / power users; Enterprise for SLA / SOC2 / private deployment.',
  },
},
{
  q: { zh: '什么是共养？', en: 'What is co-raising?' },
  a: {
    zh: '你可以把主宠的共养链接分享给好友，好友每天可喂一次增加能量，好友还能分到主宠未来任务收入的 5%。蚂蚁森林式的轻互动，回访率极高。',
    en: 'Share a co-raising link with friends. They can feed your pet daily to boost energy, and earn 5% of the pet\'s future task revenue. Ant-Forest-style lightweight interaction with extremely high retention.',
  },
},
{
  q: { zh: '创作者卖皮肤怎么赚钱？', en: 'How do creators earn from selling skins?' },
  a: {
    zh: '上架皮肤可选一口价 / 拍卖 / 租赁三种模式，并设置 10-50% 的 Remix 分成比例。一旦被他人 Remix 出售，原作者按设定比例持续分账。',
    en: 'Creators can list skins as fixed-price / auction / rental, and set a 10-50% Remix share. Whenever a Remix of your skin sells, you get that share continuously.',
  },
},
```

---

## 10. 验收标准

- [ ] `/`（首页）：Hero 新文案 + ThreeSideEcosystem + V3FeaturesSection + ThreeLayerVision + AxpNarrative + DownloadCallout + FAQ（8 条）
- [ ] `/pricing`：6 档 PricingTable + 年付 toggle + 超额三选一说明 + AxpNarrative + FAQ
- [ ] `/showcase`：Masonry 瀑布流可访问（mock 数据也行）
- [ ] `/co-raising/[token]` + `/greeting/[token]`：mock token 可访问（API 对接可延后到 W2）
- [ ] `MarketingHeader`：新 IA，下拉菜单 Product / Market 齐全
- [ ] `next build` 通过
- [ ] `vitest run` 通过
- [ ] 中 / 英文切换无遗漏（`t({zh,en})` 全覆盖）
- [ ] Lighthouse Performance > 85（首页）

---

## 11. 已知延迟 / Trade-off

| 项 | 延迟到 | 原因 |
|----|-------|-----|
| PetCreator demo 视频 | W3 | W3 才做 `/console/pet/create` 真工坊，W1 先占位 |
| `/market` + `/market/auction` + `/market/leaderboard` | W2 | MVP 依赖后端 skin-marketplace API + 拍卖 SSE |
| `/co-raising` + `/greeting` 真数据 | W2 | 依赖 Mobile Sprint C1/C2 后端 API（已完成，但对接要 0.5d） |
| 完整能力矩阵对比表（34 项） | W3 | PricingTable 只放 6-8 条 highlight，完整表在 `/pricing/compare` 独立页 |
| Stripe Checkout 真跳转 | W3 | 依赖 5 档 priceId，W1 CTA 暂跳 `/invite?plan=xxx` |
| OG 图生成 | W5 | `/api/og/*` 要统一迁移 |

---

## 12. 下一步

1. 本文档归档后进入 W1 coding：
   - W1-1 ~ W1-4 在 `components/marketing/sections.tsx` 里改动（一个 PR）
   - W1-5 ~ W1-7 三个新页（各一个 PR）
   - W1-8 ~ W1-9 收尾（一个 PR）
2. Design Gate：W1 完成后对照本文档 §10 验收标准打勾
3. 进入 W2 · Marketplace 公开形态 MVP

---

*Agentrix Engineering · 2026-05-10*
