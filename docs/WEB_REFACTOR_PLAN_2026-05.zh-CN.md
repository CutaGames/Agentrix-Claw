# Agentrix Web 端重构 & 生态对齐白皮书

> **版本**：v1.0 · 2026-05-10
> **范围**：Web 前端（`frontend/` · Next.js 15）对齐 Mobile Refactor + AXP + 5 档订阅 + Pet-as-Agent 新口径
> **相关文档**：
> - [AGENTS.md](../AGENTS.md) — 仓库总则
> - [MOBILE_REFACTOR_AND_ECOSYSTEM_PLAN_2026-05.zh-CN.md](MOBILE_REFACTOR_AND_ECOSYSTEM_PLAN_2026-05.zh-CN.md) — 移动端冻结方案（上游）
> - [web-prd-v4.md](web-prd-v4.md) — Web V4 PRD
> - [WEB_W1_DESIGN_DOC_2026-05.zh-CN.md](WEB_W1_DESIGN_DOC_2026-05.zh-CN.md) — W1 设计冻结稿
> - [agentrix-cross-platform-prd-v4.md](agentrix-cross-platform-prd-v4.md) — 跨端 PRD V4
> - [AGENTRIX_CROSS_PLATFORM_CODE_AUDIT_OPTIMIZATION_PLAN_20260501.zh-CN.md](AGENTRIX_CROSS_PLATFORM_CODE_AUDIT_OPTIMIZATION_PLAN_20260501.zh-CN.md) — 最近一次跨端审计

---

## 0. 文档状态与落地约束

**这份文档是 Web 端重构的设计冻结合同**。Mobile Refactor 方案于 2026-05-10 冻结，Web 侧作为其跨端姊妹计划，所有核心口径直接对齐，不再二次决策。

**最终冻结决策清单（2026-05-10）**：

| 维度 | 决策 |
|-----|-----|
| Web 端核心定位 | **看台（Marketing）+ 工坊（Console）+ 集市（Marketplace）** 三形态（V4 PRD） |
| 对齐 Mobile 的核心口径 | Pet-as-Agent 叙事 · 5 档 + Enterprise 订阅 · AXP 积分体系 · 废身份包 · 共养/贺卡深链落地 |
| Marketplace 地位 | Web 是皮肤 / 拍卖 / Remix 的**最强承载端**（最大屏幕 · 最完整工坊 · 最佳 SEO） |
| PetCreator 主战场 | Web `/console/pet/create`（V4 PRD §4.1） |
| Console 身份分组 | **保留** developer/merchant/family/admin RBAC 折叠分组，**新增**"公民基础入口" (Pet/AXP/Wallet/Marketplace/Promote) 放置在 RBAC 之前 |
| 实施节奏 | W1 + W2 + W3 + W4 + W5 连做，~3-4 周 |
| 不做的事 | Web 端签到游戏化 · Web 端完整 IM / DM · AX 代币 UI · 实体玩偶定制后台 · /admin 重写 |

**下一步**：本文档归档后即开 Sprint W1（Marketing 主叙事 + 定价 + Landing 落地）。W1 设计稿已落在 `WEB_W1_DESIGN_DOC_2026-05.zh-CN.md`。

---

## 1. 重构动因：Mobile 冻结给 Web 带来的 7 个口径差

移动端 2026-05-10 冻结的 4 Tab + AXP + 5 档订阅 + 多人游戏，给 Web 带来以下**系统性口径差**。这 7 条是 Web 重构的全部理由，也是本次不做其他大改的原因。

| # | 新口径（Mobile 已冻结） | Web 当前状态 | 影响面 |
|--:|----------------------|------------|-------|
| 1 | **Pet-as-Agent 叙事**（每只宠物 = 一个 ERC-8004 独立身份 + MPC 钱包 + X402 签名的 Agent） | 首页仍讲「Living Agent / Doer / Economy 三层」，无宠物 Agent 心智 | Hero / About / manifesto / Product 下拉 |
| 2 | **5 档 + Enterprise 订阅**（Free / Lite $4.99 / Plus $14.99 / Pro $29.99 / Elite $69） | `/pricing` 仍是旧 Free / Pro $20 / Team $50 / Enterprise | /pricing / /console/billing / Stripe 映射 |
| 3 | **AXP 积分体系**（1 AXP = $0.001 · 返现率阶梯 · 12 月过期） | 完全缺失（零 AXP 表达） | 首页 / /pricing / Console / Landing |
| 4 | **身份包废除 · 全能公民** | Console sidebar 仍按 RBAC 身份分组；marketing 上"身份包"叙事不显但未提"全能公民" | Console IA / 首页叙事 / /features |
| 5 | **共养 / 贺卡多人游戏** | Web 没有 `/co-raising/[token]` 和 `/greeting/[token]` Landing；Mobile 分享出去的链接点进 Web 会 404 | 新增 2 个 public Landing |
| 6 | **Web Marketplace 三形态**（V4 PRD 新增） | 只有零散 `pages/marketplace/*` 和 `pages/skill/*`；无 `/market` 公开集市 IA | 全新一级形态 |
| 7 | **PetCreator 主战场在 Web** | Web 无 `/console/pet/create` 完整工坊；`console/pet/*` 只有 breed/playground/souls/wardrobe 四张 | 新增完整 PetCreator 工坊 |

---

## 2. Web 端三形态 IA（V4 冻结）

### 2.1 三形态总览

```
┌────────────────────────────┬────────────────────────────┬─────────────────────────────┐
│    🏛 Marketing             │    🛠 Console              │    🎪 Marketplace            │
│    看台 · 不登录             │    工坊 · 登录后            │    集市 · 浏览不登录            │
├────────────────────────────┼────────────────────────────┼─────────────────────────────┤
│ URL: / + /about + /pricing  │ URL: /console/**            │ URL: /market/** + /p/[petId] │
│      + /showcase + /manifesto│                            │                              │
│      + /features + /use-cases│                            │                              │
│                             │                            │                              │
│ 受众：未注册 / 投资人 / 媒体 │ 受众：已注册 + 已绑定         │ 受众：全员（浏览不登录）       │
│ Trust：0                    │ Trust：≥ 1                   │ Trust：浏览 0 / 交易 ≥ 1     │
│ 主任务：说服 + 引流下载     │ 主任务：管理灵魂×皮肤×经济   │ 主任务：浏览 / 上架 / 拍卖   │
└────────────────────────────┴────────────────────────────┴─────────────────────────────┘

          所有形态共享：MarketingHeader / MarketingFooter / Auth / i18n / Sentry
          跨端共享：Mobile 深链 Landing（/co-raising/[token] · /greeting/[token] · /p/[petId]）
```

### 2.2 Marketing 形态（新 IA）

| 一级菜单 | 路径 | 动作 | W 阶段 |
|--------|-----|-----|-------|
| Product ▾ 产品概览 | `/` | ♻️ 改造 Hero + 新增 ThreeSideEcosystem + AxpNarrative | W1 |
| Product ▾ Pet-as-Agent 宣言 | `/manifesto` | ♻️ 改造为新口径 | W2 |
| Product ▾ 5 端能力矩阵 | `/features` | ♻️ 补 AXP + 配额可视化视角 | W2 |
| Product ▾ 6 族群灵魂 | `/clans` | ✅ 保留，补链到 `/console/pet/create` | W3 |
| Product ▾ 应用场景 | `/use-cases` | ✅ 保留 | - |
| Product ▾ 安全与 MPC | `/security` | ✅ 保留 | - |
| Product ▾ AXP 积分体系 | `/#axp` 锚点 + 未来独立页 `/axp` | 🆕 W1 先做锚点，W5 考虑独立页 | W1/W5 |
| Market ▾ Marketplace | `/market` | 🆕 | W2 |
| Market ▾ Showcase | `/showcase` | 🆕 | W1 |
| Market ▾ Skills | `/skills` | ✅ 保留 Marketing 介绍，W4 回链 `/market/skills` | W4 |
| Market ▾ 拍卖大厅 | `/market/auction` | 🆕 | W2 |
| Market ▾ 创作者排行 | `/market/leaderboard` | 🆕 | W2 |
| Pricing | `/pricing` | ♻️ 重写为 5 档 + 年付 + AXP 返现阶梯 | W1 |
| Showcase | `/showcase` | 🆕 瀑布流 | W1 |
| Developers | `/developers` | ✅ 保留 | - |
| Enterprise | `/enterprise` | ♻️ 补 Enterprise 三档条款（Starter/Pro/Scale） | W3 |
| Family | `/family` | ✅ 保留 | - |
| Downloads | `/downloads` | ♻️ 强化 Mobile CTA（Mobile 是主战场） | W1 |
| 公开宠物档案 | `/p/[petId]` | ♻️ 补 3D + OG 卡 + iframe sentinel | W2 |
| 共养落地页 | `/co-raising/[token]` | 🆕 | W1 |
| 贺卡落地页 | `/greeting/[token]` | 🆕 | W1 |

### 2.3 Console 形态（新 IA · 保留 RBAC 折叠 + 新增公民基础入口）

```
Sidebar（顶→底）：
│
├── 🏠 概览
│   ├── Dashboard          /console/dashboard     ♻️ 补主宠卡 + 6 条配额
│   ├── Agents             /console/agents        ✅
│   └── Presence           /console/presence      ✅
│
├── 🐾 主宠 & 创生（🆕 公民基础入口）
│   ├── 当前主宠           /console/pet           🆕
│   ├── PetCreator 工坊    /console/pet/create    🆕
│   ├── Wardrobe 衣柜      /console/pet/wardrobe  ✅
│   ├── 灵魂切换           /console/pet/souls     ✅
│   ├── 繁育               /console/pet/breed     ✅
│   └── Playground         /console/pet/playground ✅
│
├── 💎 AXP（🆕 公民基础入口）
│   ├── AXP 中心           /console/axp          🆕
│   ├── 兑换商店           /console/axp/shop     🆕
│   └── 历史流水           /console/axp/history  🆕（可合并入中心）
│
├── 💰 钱包
│   ├── 总览               /console/wallet        ♻️ 补创作者/卖家收入分栏
│   ├── Checkout           /console/wallet/checkout       ✅
│   ├── Auto-Earn          /console/wallet/auto-earn      ✅
│   ├── 分账计划           /console/wallet/split-plans    ✅
│   ├── 预算池             /console/wallet/budgets        ✅
│   └── 审计               /console/wallet/audit          ✅
│
├── 🔗 推广与裂变（🆕 合并入口）
│   ├── 推广中心           /console/promote               🆕 合并 /console/wallet/commission + /console/wallet/referral
│   ├── 我的共养           /console/promote/co-raising    🆕
│   └── 贺卡收件           /console/promote/greeting-inbox 🆕
│
├── 🛒 Marketplace（🆕 合并入口）
│   ├── 主页               /console/marketplace           ✅
│   ├── Skills             /console/marketplace/skills    ✅
│   ├── Tasks              /console/marketplace/tasks     ✅
│   ├── Skins              /console/marketplace/skins     ♻️ 对齐 /market/skins
│   ├── Plugins            /console/marketplace/plugins   ✅
│   ├── Resources          /console/marketplace/resources ✅
│   └── 上架向导           /market/sell                   🆕（跳公开 /market）
│
├── 📋 订阅
│   ├── 订阅管理           /console/billing              ♻️ 5 档 + 年付 + Stripe 5 个 priceId + AXP 抵扣
│   └── 发票 / 账单        /console/billing/invoices     🆕（可合并入 billing 主页）
│
├── 🛠 开发者 ▾（RBAC: developer）
│   ├── Overview           /console/developer            ✅
│   ├── My Skills          /console/developer/skills     ✅
│   ├── Workflows          /console/developer/workflows  ✅
│   ├── Earnings           /console/developer/earnings   ✅
│   └── API Keys           /developers/console           ✅（external）
│
├── 🏪 商家 ▾（RBAC: merchant）
│   ├── Overview           /console/merchant             ✅
│   ├── Products           /console/merchant/products    ✅
│   ├── Orders             /console/merchant/orders      ✅
│   └── Settlements        /console/merchant/settlements ✅
│
├── 👪 家庭 ▾（RBAC: family_owner 或默认展开）
│   ├── Overview           /console/family               ✅
│   ├── Members            /console/family/members       ✅
│   ├── Family Pet         /console/family/pet           ♻️ 对齐 Pet-as-Agent 新口径
│   ├── Household Agents   /console/family/agents        ✅
│   └── Allowance          /console/family/allowance     ✅
│
├── 🛡 管理 ▾（RBAC: admin）
│   └── ...                /admin/**                     ✅ external
│
└── ⚙️ 设置
    ├── Profile            /console/settings/profile     ✅
    ├── Security           /console/settings/security    ✅
    ├── Privacy            /console/settings/privacy     ✅
    └── Memory             /console/settings/memory      ✅
```

**变动概要**：
- 新增 3 个"公民基础入口" section：🐾 主宠 & 创生 / 💎 AXP / 🔗 推广与裂变
- Marketplace section 从原来的子菜单提升为一级 section（单独 RBAC 无依赖）
- 订阅 section 独立（原 billing 挂在 wallet 下，现提升一级并对齐 5 档新口径）
- 开发者 / 商家 / 家庭 / 管理 保持 RBAC 折叠，**但放置在公民入口之后**

### 2.4 Marketplace 形态（V4 新增主战场）

| 路径 | 功能 | W 阶段 |
|-----|------|-------|
| `/market` | 主页（Trending / New / 排行 / 族群筛选） | W2 |
| `/market/skin/[id]` | 皮肤详情（3D 预览 · 价格 · Remix 树 · 历史成交） | W2 |
| `/market/auction/[id]` | 拍卖大厅（实时出价） | W2 |
| `/market/creator/[userId]` | 创作者主页 | W2 |
| `/market/leaderboard` | 排行榜（GMV / 收藏 / Remix） | W2 |
| `/market/clan/[A-F]` | 按 6 族群筛选 | W2 |
| `/market/sell` | 5 步 stepper 上架向导 | W4 |
| `/market/skills` | 技能集市（合并现 `/skills`） | W4 |
| `/market/tasks` | 任务集市（合并现 `/marketplace/tasks`） | W4 |
| `/market/pets/[id]` | 整宠拍卖（Phase 2） | W4+ |
| `/p/[petId]` | 公开宠物档案（可嵌入 iframe） | W2 |

---

## 3. 订阅主线 · 5 档 + Enterprise（对齐 Mobile §3）

### 3.1 定价表（2026-05-10 冻结 · 与 Mobile 完全同步）

| 档位 | 月价 | 年价（×10） | AXP 返现 | Web 视觉重点 |
|-----|----:|----------:|------:|-----|
| Free | $0 | — | 0% | 「体验全部」占位 |
| Lite | $4.99 | $49 | 5% | 「去硬限」 |
| Plus | $14.99 | $149 | 10% | **推荐** · highlight 卡 |
| Pro | $29.99 | $299 | 15% | 「开发者 / 中型商户」 |
| Elite | $69 | $690 | 20% | 「品牌 / KOL / 深玩家」 |
| Enterprise | 合同 | — | — | 底部横跨 4 列大卡 |

### 3.2 Web 特定展示逻辑

1. **月付 / 年付 toggle** 默认月付，年付展示「省 $X」小字
2. **34 项完整能力矩阵** 放在 `/pricing/compare`（W3 再做）；`/pricing` 主页每卡只显示 6-8 条 highlight
3. **超额三选一说明**（AXP 抵扣 / 现金实扣 / BYOK）放在 PricingTable 底部
4. **升级 CTA 路由**（Stripe 依赖 W3 后端 priceId）：
   - W1 / W2：`/invite?plan={key}&billing={monthly|yearly}` 占位
   - W3：真 Stripe Checkout via `/api/billing/checkout-session`

### 3.3 Enterprise 专属条款 Web 展示

`/enterprise` 页新增 3 档卡片（Starter / Pro / Scale），内容对齐 Mobile §3.4：

| 合同档 | 月费起点 | 关键交付 |
|-------|-------:|--------|
| Enterprise Starter | $500 | 10 席位 / VPC / 99.5% SLA / 邮件 |
| Enterprise Pro | $5k | 100 席位 / on-prem / 99.9% SLA / 专属经理 |
| Enterprise Scale | $50k+ | 无限 / SOC2 / ISO27001 / 白标 SDK / 7×24 |

---

## 4. AXP 在 Web 的承载（对齐 Mobile §4）

### 4.1 Web 端 AXP 表达矩阵

| 位置 | 内容 | W 阶段 |
|-----|-----|-------|
| 首页 `AxpNarrative` Section | 6 大获得 + 5 大使用 + 返现阶梯表 | W1 |
| `/pricing` 卡片上 AXP 返现 badge | 每卡右上角「+X% AXP」标签 | W1 |
| `/pricing` 页末段 AxpNarrative | 同首页 | W1 |
| `FAQ` 问答 2 条 | AXP 是什么 / AXP 和 AX 关系 | W1 |
| `MarketingHeader` Product 下拉 | "AXP 积分体系" 锚点链 | W1 |
| `/console/axp` | AXP 中心（余额 + 流水 + 过期提醒） | W3 |
| `/console/axp/shop` | 兑换商店（皮肤 / 限定 / 置顶位） | W3 |
| `/console/dashboard` | 顶部卡展示 AXP 余额 glance | W3 |
| `/co-raising/[token]` Landing | 喂食 +5 AXP + 注册送 500 AXP | W1 |
| `/greeting/[token]` Landing | 收下 +20 AXP + 注册送 500 AXP | W1 |
| `/console/promote` | 推广佣金 AXP 收入栏 | W4 |
| `/market/skin/[id]` | 皮肤可用 AXP 部分抵扣购买 | W4 |

### 4.2 前端 AXP API 对接层（`lib/api/axp.api.ts` · 新建）

```ts
// lib/api/axp.api.ts — 与 Mobile 同源，单一客户端
export interface AxpBalance {
  balance: number;           // 当前可用
  lifetime_earned: number;   // 历史累计
  lifetime_spent: number;
  expiring_soon: number;     // 30 天内过期
  expiring_at: string;       // ISO
}

export interface AxpLedgerEntry {
  id: string;
  amount: number;            // 正数 earn, 负数 spend
  source:
    | 'daily_checkin' | 'chat_rounds' | 'co_raising_feed' | 'referral_signup'
    | 'referral_gmv' | 'subscription_cashback' | 'game_reward' | 'achievement'
    | 'subscription_redeem' | 'skill_redeem' | 'skin_redeem' | 'feature_redeem'
    | 'lottery' | 'expired';
  metadata?: Record<string, unknown>;
  created_at: string;
}

export const axpApi = {
  getBalance: () => http.get<AxpBalance>('/api/v1/axp/balance'),
  listHistory: (cursor?: string, limit = 50) =>
    http.get<{ items: AxpLedgerEntry[]; nextCursor?: string }>('/api/v1/axp/history', { cursor, limit }),
  checkin: () => http.post<{ earned: number; balance: number; streak: number }>('/api/v1/axp/checkin'),
};
```

---


## 5. Pet-as-Agent 叙事在 Web 的三层落地（对齐 Mobile §5）

Mobile 已落 3 个经济闭环。Web 作为跨端生态的 SEO / Marketing / 工坊承载，对应表达如下：

### 5.1 Loop 1 · 陪伴 → 成长 → 亲密度 → 解锁

| Web 位置 | 内容 |
|---------|-----|
| `/` Hero + ThreeSideEcosystem | 「你养的每一只宠物都是 AI Agent」 |
| `/manifesto` | Pet-as-Agent 宣言长文 |
| `/console/pet` | 当前主宠 3D + XP + 亲密度 + Lv |
| `/console/pet/create` | PetCreator 工坊（文生 / 图生 / 双图融合） |
| `/console/pet/souls` | 6 族群灵魂切换 |
| `/p/[petId]` | 公开档案（主人头像 + 成就 + 社交分享） |

### 5.2 Loop 2 · 技能 → 任务 → 赚钱 → 宠钱包 → 分账

| Web 位置 | 内容 |
|---------|-----|
| `/market/skills` | Skill Marketplace（Web 侧以创作者视角为主） |
| `/market/tasks` | Task Marketplace |
| `/console/marketplace/skills` | 我的已购 / 已装 / 可卸载 |
| `/console/wallet` | 主宠 Wallet · Agent Account · Split 分账 |
| `/console/wallet/auto-earn` | Auto-Earn 时间线 |
| `/console/developer/earnings` | 创作者技能分成报表（RBAC developer） |

### 5.3 Loop 3 · 宠物资产 → 设计/养成 → 拍卖/NFT/玩偶 → 裂变

| Web 位置 | 内容 |
|---------|-----|
| `/market/skin/[id]` | 皮肤详情 + 3D 预览 + Remix 树 + 拍卖 |
| `/market/auction/[id]` | 实时出价 |
| `/market/sell` | 5 步上架向导 |
| `/market/creator/[userId]` | 创作者主页 + 历史作品 |
| `/market/leaderboard` | 排行榜（GMV / 收藏 / Remix） |
| `/hardware` | L2 联名玩偶咨询入口（现有，保留） |
| `/showcase` | 每日精选瀑布流 |

---

## 6. 共养 / 贺卡 Web Landing（对齐 Mobile §6）

Mobile Phase 1 多人游戏 = 共养 + 贺卡。这两个的**分享落地页必须在 Web 上实现**，因为 Mobile 分享到 Twitter / Telegram / 微信是 universal link 导出 HTTPS URL。

### 6.1 `/co-raising/[token]` 行为矩阵

| 用户状态 | 打开链接时的体验 |
|--------|----------------|
| 未登录 · 无 Agentrix 账号 | 展示宠物 + 邀请人 + "喂食需要注册" CTA → 跳 `/auth/register?next=/co-raising/xxx&reward=500` → 注册成功后自动调 `POST /co-raising/feed` |
| 未登录 · 已有账号（cookie 过期） | 跳 `/auth/login?next=/co-raising/xxx` |
| 已登录 | 直接调 `POST /co-raising/feed` → 显示 "+2 能量 +5 AXP" 浮层 |
| 已今日喂过 | 展示宠物 + "你今天已帮喂" + "明天再来" CTA |
| 邀请人自己打开 | 展示宠物 + "你的邀请链接" + 分享按钮 |
| token 无效 / 过期 | 404 友好页 + 跳 `/showcase` 引导 |

### 6.2 `/greeting/[token]` 行为矩阵

| 用户状态 | 打开链接时的体验 |
|--------|----------------|
| 未登录 | 展示贺卡全屏 + "收下自动注册 + 520 AXP" CTA → 跳 `/auth/register?next=/greeting/xxx&reward=520` |
| 已登录 · 未 redeem | 调 `POST /greeting/redeem` → "+20 AXP" + "回一张" CTA |
| 已登录 · 已 redeem | 展示贺卡 + "你已收下" + "回一张" CTA |
| 发送人自己打开 | 展示贺卡 + "你已发送给 @lucy" + 分享按钮 |

### 6.3 后端 API 依赖

W1 前这 4 个公开 API 必须 ready（Mobile Sprint C1 / C2 后端同源）：
- `GET /api/v1/co-raising/peek?token=xxx` — 公开，不登录可查
- `POST /api/v1/co-raising/feed` — 鉴权
- `GET /api/v1/greeting/peek?token=xxx` — 公开
- `POST /api/v1/greeting/redeem` — 鉴权

---

## 7. Console 重构详细迁移（85 张 Console 页面定位）

### 7.1 Dashboard 增强（`/console/dashboard`）

```
┌── 顶部 4 KPI（现有）──────────────────────────────────┐
│ 主宠状态 / 待审批 / 钱包余额 / Auto-Earn 30d           │
└──────────────────────────────────────────────────────┘

🆕 下方新增：

┌── 主宠卡（全宽）──────────────────────────────────────┐
│ [3D/Rive 缩略图]  Alfred · Lv.7 · 😊 · 能量 72%         │
│ XP 342/500 ━━━━━━━━━━━━━━────────                     │
│ [进入主宠工作区]  [生成新宠]  [Wardrobe]                │
└──────────────────────────────────────────────────────┘

┌── 💎 AXP 快览（半宽） ──┬── 📋 订阅状态（半宽） ─────────┐
│ 余额 12,340 AXP         │ Plus $14.99/月 · 续订 2026-06 │
│ 本月进账 +2,340         │ [升级 Pro]  [改年付省 $30.88] │
│ [去 AXP 中心]           │                             │
└────────────────────────┴─────────────────────────────┘

┌── 配额可视化（全宽 · 6 条）──────────────────────────┐
│  ⚡ 技能    5/30   |  👕 皮肤 12/∞  |  📦 商品 8/100   │
│  🧸 硬件   2/∞    |  🎮 游戏  1/3  |  👥 公会 0/∞     │
│  [查看完整矩阵]                                       │
└──────────────────────────────────────────────────────┘

┌── 下方原有：Quick actions + Pending Approvals 保持 ─┘
```

### 7.2 Console Sidebar 分组改造

修改文件：`components/console/ConsoleLayout.tsx` · `const SECTIONS`

```ts
// 新分组（顺序从上到下）
const SECTIONS: NavSection[] = [
  { id: 'overview', ... },        // ✅ 保留
  { id: 'pet', ... },              // 🆕 公民基础入口：Pet / Creator / Wardrobe / Souls / Breed / Playground
  { id: 'axp', ... },              // 🆕 公民基础入口：AXP 中心 / Shop / History
  { id: 'wallet', ... },           // ♻️ 保留但去除 commission / referral（合并到 promote）
  { id: 'promote', ... },          // 🆕 合并 commission + referral + co-raising + greeting-inbox
  { id: 'marketplace', ... },      // ✅ 保留，内容对齐新 /market
  { id: 'billing', ... },          // 🆕 从 wallet 下拆出为独立 section（5 档订阅）
  { id: 'developer', requireRole: 'developer', ... },  // ✅
  { id: 'merchant', requireRole: 'merchant', ... },    // ✅
  { id: 'family', ... },           // ✅
  { id: 'admin', requireRole: 'admin', ... },          // ✅
  { id: 'settings', ... },         // ✅
];
```

### 7.3 新建 Console 页面清单（W3 + W4 完成）

| # | 路径 | 用途 | W 阶段 |
|--:|-----|-----|-------|
| 1 | `/console/pet/index` | 主宠工作区 | W3 |
| 2 | `/console/pet/create` | PetCreator 工坊 | W3 |
| 3 | `/console/axp` | AXP 中心 | W3 |
| 4 | `/console/axp/shop` | 兑换商店 | W3 |
| 5 | `/console/axp/history` | AXP 流水（可合并到 1） | W3 |
| 6 | `/console/promote` | 推广中心（合并旧 commission + referral） | W4 |
| 7 | `/console/promote/co-raising` | 我发起的共养 + 邀请管理 | W4 |
| 8 | `/console/promote/greeting-inbox` | 贺卡收件 | W4 |
| 9 | `/console/billing/index` | 订阅管理（重写 5 档） | W3 |
| 10 | `/console/billing/invoices` | 发票 / 账单 | W4 |
| 11 | `/console/wallet/creator-income` | 创作者 / 卖家收入分栏 | W4 |

### 7.4 Console 页面改造清单

| 路径 | 现状 | 改造 | W 阶段 |
|-----|-----|-----|-------|
| `/console/dashboard` | 4 KPI + Quick Actions + Approvals | + 主宠卡 + AXP glance + 订阅状态 + 6 条配额 | W3 |
| `/console/pet/breed` | 现有功能页 | 对齐新灵魂模板数据源 | W3 |
| `/console/pet/souls` | 现有功能页 | 对齐 6 族群心智 + 链到 `/console/pet/create` | W3 |
| `/console/pet/wardrobe` | 现有 | 补 AXP 抵扣 + 链到 `/market/skin/[id]` | W3 |
| `/console/pet/playground` | 现有 | 对齐新宠物成长叙事 | W3 |
| `/console/wallet/index` | Auto-Earn glance | + 创作者收入分栏（Skin / Task / Pet Auction） | W4 |
| `/console/wallet/commission` | 佣金 | 🔀 合并到 `/console/promote` | W4 |
| `/console/wallet/referral` | 推广 | 🔀 合并到 `/console/promote` | W4 |
| `/console/marketplace/skins` | 现有 | 对齐 `/market/skin/[id]` 布局 | W2 |
| `/console/family/pet` | 现有 | 对齐 Pet-as-Agent 口径（"家庭宠" = 多人共享 Agent） | W3 |

---

## 8. Marketing 页面改造清单

| 路径 | 现状 | 改造 | W 阶段 |
|-----|-----|-----|-------|
| `/` (index.tsx) | HeroLiving + V3FeaturesSection + ThreeLayerVision + 5-Surface + CompetitiveTable + Download + FAQ | + ThreeSideEcosystem + AxpNarrative；改 Hero 文案 | W1 |
| `/pricing` | PricingTable 4 档 | 重写为 5 档 + 年付 toggle + Enterprise 宽卡 + 超额三选一 + AxpNarrative | W1 |
| `/manifesto` | 三层愿景长文 | 对齐 Pet-as-Agent 宣言 + 全能公民 | W2 |
| `/features` | 5 端能力矩阵 | + AXP / 共养 / 贺卡 / PetCreator 视角 | W2 |
| `/about` | 公司介绍 | 对齐新口径 | W2 |
| `/enterprise` | Enterprise 介绍 | 补 Starter / Pro / Scale 三档 | W3 |
| `/clans` | 6 族群介绍 | 补链到 `/console/pet/create` | W3 |
| `/use-cases` | 应用场景 | ✅ 保留 | - |
| `/security` | 安全 & MPC | ✅ 保留 | - |
| `/family` | 家庭账号 | 对齐 Pet-as-Agent（家庭宠 = 多人共享 Agent） | W3 |
| `/downloads` | 下载引导 | 强化 Mobile CTA（二维码 + 直链 App Store / Google Play） | W1 |
| `/skills` | Skills Marketing | 保留，末段"创作者入门"链到 `/market/sell` | W4 |
| `/marketplace.tsx`（顶级） | 旧散页 | 🔀 重定向到 `/market` | W5 |
| `/invite` | 邀请码入口 | 支持 `?plan=plus&billing=yearly&reward=500` 新 query 参数 | W1 |
| `/predict` | Polymarket 介绍 | 降级为 Marketing 介绍，真入口在 `/market` 下 | - |
| `/hardware` | 硬件合作 | ✅ 保留（L2/L3 介绍页） | - |
| `/developers` | 开发者总览 | ✅ 保留 | - |
| `/developers/console` | 开发者 API Keys | ✅ 保留 | - |
| `/developers/cert` | Hardware L3 认证 | ✅ 保留 | - |

---

## 9. 全新 Marketing 页面清单（W1 / W2）

| # | 路径 | 用途 | W 阶段 |
|--:|-----|-----|-------|
| 1 | `/showcase` | 每日精选皮肤瀑布流 | W1 |
| 2 | `/co-raising/[token]` | 共养分享落地 | W1 |
| 3 | `/greeting/[token]` | 贺卡分享落地 | W1 |
| 4 | `/market/index` | Marketplace 主页 | W2 |
| 5 | `/market/skin/[id]` | 皮肤详情 | W2 |
| 6 | `/market/auction/[id]` | 拍卖大厅 | W2 |
| 7 | `/market/creator/[userId]` | 创作者主页 | W2 |
| 8 | `/market/leaderboard` | 排行榜 | W2 |
| 9 | `/market/clan/[clanId]` | 族群筛选 | W2 |
| 10 | `/market/sell` | 5 步上架向导 | W4 |
| 11 | `/market/skills` | 技能集市（与 /skills 区分） | W4 |
| 12 | `/market/tasks` | 任务集市 | W4 |

`/p/[petId]` 已存在，W2 补全 3D + OG + iframe sentinel 即可。

---

## 10. Legacy Route 兼容（关键 · Mobile 深链映射）

Mobile `agentrix://` 深链有一部分会 fallback 到 https URL。Web 这些路径必须响应：

| 来自 Mobile 的 URL | Web 路径 | 动作 |
|-----------------|---------|-----|
| `https://agentrix.top/co-raising/:token` | `/co-raising/[token]` | W1 新建 |
| `https://agentrix.top/greeting/:token` | `/greeting/[token]` | W1 新建 |
| `https://agentrix.top/p/:petId` | `/p/[petId]` | W2 补全 |
| `https://agentrix.top/invite?code=xxx` | `/invite` | ✅ 已有，补 `plan`/`billing`/`reward` query |
| `https://agentrix.top/market/skin/:id` | `/market/skin/[id]` | W2 新建 |
| `https://agentrix.top/market/auction/:id` | `/market/auction/[id]` | W2 新建 |
| `https://agentrix.top/showcase` | `/showcase` | W1 新建 |
| `https://agentrix.top/pricing` | `/pricing` | ♻️ 现有改造 |
| `https://agentrix.top/r/:code` | `/r/[code]` | ✅ 已有 |

### 10.1 旧路径重定向（`next.config.js` rewrites / redirects）

```js
// next.config.js 新增
async redirects() {
  return [
    // 旧 `/marketplace.tsx` 顶级页 → 新 `/market`
    { source: '/marketplace', destination: '/market', permanent: true },
    // 旧 `/marketplace/tasks` → 新 `/market/tasks`
    { source: '/marketplace/tasks', destination: '/market/tasks', permanent: true },
    // 旧 `/marketplace/pets/:id` → 新 `/market/pet/:id`（或保留 /p/:petId）
    { source: '/marketplace/pets/:id', destination: '/p/:id', permanent: true },
    // 旧 `/marketplace/skins/:id` → 新 `/market/skin/:id`
    { source: '/marketplace/skins/:id', destination: '/market/skin/:id', permanent: true },
    // 旧 `/marketplace/skins` → 新 `/market?tab=skins`
    { source: '/marketplace/skins', destination: '/market?tab=skins', permanent: true },
    // Console 内部 commission / referral 合并
    { source: '/console/wallet/commission', destination: '/console/promote', permanent: false },
    { source: '/console/wallet/referral', destination: '/console/promote', permanent: false },
  ];
},
```

W5 阶段统一落地。

---


## 11. Sprint 实施计划（3-4 周 · 对齐 Mobile 冻结口径）

### 11.1 Sprint W1 · Marketing 主叙事 + 定价 + Landing 落地（5 天）

**目标**：Marketing 侧立刻反映 2026-05-10 冻结口径。

| # | 任务 | 工程量 | 验收 |
|--:|----|-------:|-----|
| W1-1 | `HeroLiving` 新文案 + PetCreator demo 占位 | 0.5d | 首页 Hero 新句子 + 4 信任条 |
| W1-2 | 新增 `ThreeSideEcosystem` Section（供给 / 需求 / 关系三栏） | 0.5d | 首页出现三侧生态视觉 |
| W1-3 | 新增 `AxpNarrative` Section（6 获得 / 5 使用 / 返现阶梯） | 0.5d | 首页 + /pricing 出现 AXP |
| W1-4 | 重写 `PRICING_TIERS`：6 档 + 年付 toggle + AXP 返现率 + 超额三选一 | 1d | /pricing 5 档主卡 + Enterprise 宽卡 |
| W1-5 | 新增 `/showcase` 页 | 0.5d | Masonry 瀑布流可访问（mock OK） |
| W1-6 | 新增 `/co-raising/[token]` Landing | 0.5d | peek + feed + 未登录跳注册 |
| W1-7 | 新增 `/greeting/[token]` Landing | 0.5d | peek + redeem + 未登录跳注册 |
| W1-8 | `MarketingHeader` 新 IA：Product / Market 双下拉 | 0.3d | 新导航 + `/market` 占位可禁用 |
| W1-9 | `FAQ` 扩 4 条（AXP / 5 档 / 共养 / Remix） | 0.2d | FAQ 共 8 条 |

**W1 Gate**：
- [ ] `/`、`/pricing`、`/showcase`、`/co-raising/[token]`、`/greeting/[token]` 5 个页面对齐 W1 Design Doc
- [ ] MarketingHeader 新 IA 生效
- [ ] `next build` + `vitest run` 通过
- [ ] i18n 无遗漏
- [ ] W1 Design Doc §10 验收标准全部打勾

### 11.2 Sprint W2 · Marketplace 公开形态 MVP（5 天）

**目标**：V4 PRD 点名的第三主战场从零搭起。

| # | 任务 | 工程量 | 验收 |
|--:|----|-------:|-----|
| W2-1 | `/market/index`：Trending / New / 排行 / 族群筛选 + 公开 Layout | 1d | 主页 4 段 Segmented |
| W2-2 | `/market/skin/[id]`：3D 预览（W3 补 VRM，W2 先 GIF/静图）+ 价格 + Remix 树 | 1d | 详情页可点击 "出价" / "一口价" |
| W2-3 | `/market/auction/[id]`：实时出价（SSE 或 5s 轮询） | 1d | 出价后倒计时刷新 |
| W2-4 | `/market/creator/[userId]`：创作者主页 | 0.5d | 作品 + GMV + 关注 |
| W2-5 | `/market/leaderboard`：3 榜 | 0.5d | 榜单可见 |
| W2-6 | `/market/clan/[A-F]`：族群筛选 | 0.3d | 6 族群页 |
| W2-7 | `/p/[petId]` 补全：3D + OG 卡 + iframe sentinel | 0.5d | 无登录可访问 |
| W2-8 | `/manifesto` + `/features` + `/about` 口径对齐 | 0.5d | 三页对齐 Pet-as-Agent |

**W2 Gate**：
- [ ] `/market/*` 8 个路由可访问
- [ ] `/p/[petId]` 可被外部 iframe 嵌入（至少 OG 卡生效）
- [ ] Manifesto / Features / About 三页对齐
- [ ] `next build` 通过

### 11.3 Sprint W3 · Console 工坊 + 配额 + PetCreator 网页版（5 天）

**目标**：登录用户在 Console 完整跑通「生成 → 装扮 → 订阅管理 → AXP」工作流。

| # | 任务 | 工程量 | 验收 |
|--:|----|-------:|-----|
| W3-1 | `ConsoleDashboard` 加主宠卡 + AXP glance + 订阅状态 + 6 条配额 | 0.5d | Dashboard 4 新卡可见 |
| W3-2 | `/console/pet/create` PetCreator 三模式 + WebSocket 进度 | 2d | 可端到端生成皮肤 |
| W3-3 | `/console/pet/index` 主宠工作区 | 0.5d | 3D + 灵魂切换 + Wardrobe 入口 |
| W3-4 | `/console/axp` + `/console/axp/shop` | 1d | 余额 / 流水 / 过期 / 兑换 |
| W3-5 | `/console/billing` 5 档重写 + Stripe 5 个 priceId + AXP 抵扣 | 1d | 可跳 Stripe Checkout |
| W3-6 | `ConsoleLayout` sidebar 新分组（+ Pet / AXP / Promote / Billing 公民基础入口） | 0.3d | Sidebar 新 IA 生效 |
| W3-7 | `/enterprise` 补 Starter / Pro / Scale 三档 + `/clans` 补链 | 0.3d | 两页对齐 |
| W3-8 | `/console/family/pet` + `/console/family/agents` 对齐新口径 | 0.3d | 家庭宠口径一致 |

**W3 Gate**：
- [ ] 登录用户能完整生成宠物 → 装备 → 看到配额消耗
- [ ] Stripe Checkout 真跳转（test mode 即可）
- [ ] AXP 中心能查余额 / 流水 / 过期提醒

### 11.4 Sprint W4 · Marketplace 上架 + 创作者后台 + 推广中心合并（4 天）

| # | 任务 | 工程量 | 验收 |
|--:|----|-------:|-----|
| W4-1 | `/market/sell` 5 步 stepper | 1.5d | 上架全链路 |
| W4-2 | `/console/marketplace/**` 与 `/market/**` 共享组件 | 0.5d | 组件复用 + 单点登录 |
| W4-3 | `/console/promote` 合并（commission + referral + co-raising + greeting-inbox） | 1d | 推广中心一屏 |
| W4-4 | `/console/wallet` 补创作者 / 卖家收入分栏 | 0.5d | 4 栏收入可见 |
| W4-5 | Web AXP 签到 + 日对话 earn 打通（Mobile Sprint C 后端复用） | 0.5d | Web 也可签到 earn |

**W4 Gate**：
- [ ] 创作者能 Web 上完整跑通"生成 → 上架 → 卖出 → 结算 → 收入可视化"
- [ ] 推广中心合并完成，老路径 301 到新路径

### 11.5 Sprint W5 · 质量收尾 + 深链 + 兼容（3 天）

| # | 任务 | 工程量 | 验收 |
|--:|----|-------:|-----|
| W5-1 | `next.config.js` redirects（§10.1 的 8 条规则） | 0.3d | 旧链接 301 新位置 |
| W5-2 | OG 卡：`/p/[petId]` / `/market/skin/[id]` / `/showcase` 动态图 | 0.5d | Twitter/微信分享有缩略图 |
| W5-3 | i18n 全量复核 | 0.3d | 切换无遗漏 |
| W5-4 | `vitest` 冒烟 + E2E（Playwright 选做） | 0.5d | 关键漏斗全绿 |
| W5-5 | Sentry / Plausible 埋点 | 0.5d | PetCreator / 升级 / Landing 有埋点 |
| W5-6 | Legal 文案：AXP / Remix / 5 档订阅 T&C | 0.5d | /legal 更新 |
| W5-7 | Lighthouse Performance > 85；SEO > 90 | 0.3d | 指标达标 |

**W5 Gate**：
- [ ] 全站 Lighthouse 达标
- [ ] 所有旧路径 301 新路径
- [ ] 埋点 + OG + i18n + Legal 完备

---

## 12. 前置与风险

### 12.1 后端前置（W1 开始前必须 ready · 与 Mobile Sprint C / D 同源）

| # | 前置 API | 来源 | 状态 |
|--:|---------|-----|-----|
| 1 | `GET/POST /api/v1/axp/{balance,earn,spend,history,checkin}` | Mobile Sprint C3 | Mobile Gate 已 ✅ |
| 2 | `GET /api/v1/co-raising/peek` / `POST /feed` | Mobile Sprint C1 | ✅ |
| 3 | `GET /api/v1/greeting/peek` / `POST /redeem` | Mobile Sprint C2 | ✅ |
| 4 | `GET /api/v1/me/quota` | Mobile Sprint D | 待确认 |
| 5 | `GET /api/v1/subscription/catalog`（5 档 + priceId） | Mobile Sprint D | 待确认 |
| 6 | Stripe 5 档 Product / Price（test mode 最低门槛） | Backend | ⬜ 需创建 |
| 7 | `POST /api/v1/billing/checkout-session` | Backend | ⬜ 需新建（W3 依赖）|
| 8 | `GET /api/v1/market/skins?sort=&clan=&limit=` | Mobile Sprint B5 | 待确认 |
| 9 | `GET /api/v1/market/auctions/:id` + SSE / 轮询 | Mobile Sprint B5 | ⬜ SSE 待确认 |
| 10 | `GET /api/v1/pet/:petId/public`（/p/[petId] 不登录查） | Backend | ⬜ 需新建 |

**行动**：W1 启动前由本仓库 `backend/` 侧用一天 audit 7/8/9/10 四项的实际状态，任何 ⬜ 项需要 0.5-1d 补完。

### 12.2 风险登记

| 风险 | 严重度 | 缓解 |
|-----|-------|------|
| Stripe 5 档 priceId 未就位阻塞 W3 | 高 | W1 / W2 的 CTA 占位到 `/invite?plan=xxx&billing=xxx`；W3 拿到 priceId 再改 `/api/billing/checkout-session` |
| 老用户从 Pro $20 迁到新 Pro $29.99 产生纠纷 | 高 | Stripe 仅新用户用新 Price；老订阅保留原 Product；迁移流程单独评估（不在本重构范围） |
| `/p/[petId]` 泄露私人宠物信息 | 中 | 加 `pet.is_public` 字段 + 默认需本人开启"公开档案"；未公开时展示「该宠物未公开」|
| Marketplace 上架 UGC 合规（DMCA） | 中 | W4 上架向导加 DMCA 举报入口；Admin 审核后台可 Phase 2 再做 |
| 6 族群（Clans）灵魂数据源不一致 | 中 | W3-2 前先让后端确认 soul_templates 表唯一来源 |
| Web Sidebar 新增 3 个公民入口导致视觉拥挤 | 低 | ConsoleLayout sidebar 默认折叠 developer / merchant / admin；公民入口永远展开 |
| Mobile 分享链接到 Twitter / WeChat 被外部屏蔽风险 | 中 | `/co-raising` / `/greeting` 加 `og:type=website` + 通用预览图，不依赖 universal link 检测 |
| AXP 返现在 Marketing 显示导致监管争议 | 低 | 所有 AXP 相关文案明确「软积分 / 非证券 / 非货币」；Legal 过一遍 |
| PetCreator Web 版生成耗时过长 | 中 | 用 WebSocket 进度条 + 后端 queue + Free 档位先禁用生成（仅 Plus+ 可用，Plus+ 已可并行 3 个生成）|
| `/market/auction` SSE 弱网断线 | 低 | Fallback 5s 轮询 |

### 12.3 不做的事（明确排除）

- ❌ **不重写 /admin**（Admin 本次只补 AXP / 订阅字段显示）
- ❌ **不做 Web 签到游戏化 UI**（共养喂食主战场在 Mobile，Web 只做分享落地）
- ❌ **不做 Web IM / DM**（Mobile 主战场）
- ❌ **不做 AX 代币 UI**（Phase 3+ 合规后）
- ❌ **不做实体玩偶定制下单后台**（保留 `/hardware` 介绍页）
- ❌ **不做 Game Studio SDK Portal**（Phase 2+）
- ❌ **不做 WebRTC 实时对话**（跨端 Voice 在 Mobile / Desktop）
- ❌ **不砍 Console RBAC 分组**（developer / merchant / family / admin 折叠保留）

---

## 13. 验收里程碑

| 里程碑 | 日期（相对 W1 D1）| 验收条件 |
|-------|:----------------:|--------|
| M1 · W1 完成 | D5 | Marketing 新叙事 + 定价 + Landing · 5 页对齐设计稿 |
| M2 · W2 完成 | D10 | `/market/*` 8 路由 + `/p/[petId]` · 公开集市 MVP 上线 |
| M3 · W3 完成 | D15 | Console 新公民入口 + PetCreator + AXP + 5 档订阅 |
| M4 · W4 完成 | D19 | 创作者闭环 + 推广中心合并 + 创作者收入分栏 |
| M5 · W5 完成 | D22 | Redirects + OG + 埋点 + Lighthouse + Legal |

---

## 14. 文档结束 · 下一步

1. **后端前置 Audit**（1 天）：backend owner 检查 §12.1 的 10 项 API 实际状态
2. **W1 开工**：按 [WEB_W1_DESIGN_DOC_2026-05.zh-CN.md](WEB_W1_DESIGN_DOC_2026-05.zh-CN.md) 落地
3. **每完成一个 Sprint Gate** → 回到本文档 §11 打勾
4. **W5 完成后** → 全量 typecheck + Lighthouse + E2E 冒烟 + Legal 过一遍

---

*Agentrix Engineering · 2026-05-10*
