# Design Document

> AI 萌宠赚钱飞轮（Pet Earning Flywheel）— 技术设计

## Overview

本设计把飞轮拆成 9 个可独立交付、可端到端验证的技术切片，全部**扎根真实代码**（每个组件给出真实文件路径、方法签名、实体字段、迁移、前端组件）。设计原则：

- **不重造账本**：AXP（`user_axp_ledger`/`user_axp_balances`）已是各赚钱线的统一收入底座，新增的只是**聚合读层**与**接线**，不引入第二套账本。
- **不重造支付/费率**：复用 `payment/` 现成轨道与 `commission/financial-architecture.config.ts` 单一费率源。
- **最小侵入**：新增一个 `pet-earnings` 模块做聚合 + 飞轮编排；其余为对既有模块的接线（referral、unified-agent、axp 幂等、commission 收敛）。
- **每切片端到端**：后端接口 + 前端消费 + 部署验证三者齐备才算完成。

### 现状地基（已核实，design 直接引用）
| 能力 | 真实符号 | 状态 |
|---|---|---|
| AXP 记账 | `AxpService.earn/spend/getBalance/listHistory`（`modules/axp/axp.service.ts`），`UserAxpLedger`/`UserAxpBalance` | 已用，多赚钱线已写入 |
| earn 幂等 | `IDEMPOTENT_EARN_SOURCES`（`axp.service.ts` L39，当前仅 `aeon_reality_reward`）+ refId + 23505 兜底 | 需扩充 |
| spend 幂等 | 无 | **需补齐** |
| 萌宠 | `LivingPet`（`entities/living-pet.entity.ts`，`boundAgentAccountId`） | 已有绑定字段 |
| 经济主体 | `AgentAccount`（`entities/agent-account.entity.ts`，`mpcWalletId`/`creditScore`/`spendingLimits`/`usedTodayAmount`/统计） | 已有 |
| 统一 Agent 视图 | `UnifiedAgentService.getUnifiedAgents/getUnifiedAgentById/createUnifiedAgent`（`modules/unified-agent`，以 `OpenClawInstance` 为主 LEFT JOIN `AgentAccount`） | 已有，需纳入 LivingPet + 收益 |
| 集市搜索 | `UnifiedMarketplaceService.search/getTrending/purchaseSkill/executeSkill`（`modules/unified-marketplace`） | 已有（覆盖 Skill） |
| 深链/分享 | `ReferralLinkService.createLink/recordClick/recordConversion`（`modules/referral/referral-link.service.ts`，`shortUrl=/r/:code`，`fullUrl?ref=ownerId`） | 已有，需接 C 端拉新 |
| 商家分成 | `ReferralService.recordPaymentCommission`（merchant-referral） | 已有（merchant 向） |
| 费率源 | `financial-architecture.config.ts`（`resolveRates`、`FINANCIAL_PROFILES`、`EXECUTOR/REFERRER_SHARE_OF_POOL`、`PROMOTER_SHARE_OF_BASE`） | 已有，需收敛游离费率 |
| 支付轨道 | `payment/`（`crypto-payment`/`stablecoin-payment`/`x402`/`stripe`/`transak`/`escrow`/`withdrawal`/`fiat-to-crypto`/`mpc-wallet`） | 已跑通（web 优先，BNB 测试链 USDT） |
| C 端提现 | `WithdrawalService.createWithdrawal(merchantId,...)` | **仅 merchant，需扩 C 端（本期仅接口契约）** |

## Architecture

### 新增模块 `pet-earnings`（聚合 + 飞轮编排核心）
`backend/src/modules/pet-earnings/`
```
pet-earnings.module.ts
pet-earnings.controller.ts        # GET /pet-earnings/summary|breakdown|timeline|redeem-options ; POST /pet-earnings/redeem
pet-earnings.service.ts           # 跨来源聚合（AXP ledger + USDT 结算记录）
earning-source-map.ts             # AXP earn source → 展示分类 的映射表（单一事实源）
pet-earnings.metrics.service.ts   # 需求7 飞轮指标（admin）
dto/                              # 响应 DTO（summary/breakdown/timeline）
```
依赖注入：`AxpService`（读 balance/ledger）、`commission`/`payment` 的结算记录仓储（读 USDT 收入）、`UnifiedAgentService`（萌宠维度）。

### 接线点（改既有模块，不新建）
- `axp.service.ts`：扩 `IDEMPOTENT_EARN_SOURCES`；新增 `spend` 幂等（partial unique index on `user_axp_ledger(user_id, source, ref_id) where direction='spend'`）。
- `referral/`：新增 C 端拉新接线（`user_referrals` 关系 + 注册/成交回调 → `AxpService.earn(referral_signup/referral_gmv_pct)`）。
- `unified-agent/`：合并视图纳入 `LivingPet` 与收益汇总；新增"为萌宠开通赚钱能力"绑定流程。
- `commission/`：新增统一费率解析服务 `FeeResolverService`，收敛游离费率（developer-revenue 15%→10%、multi-agent 30%→10%、creation→5%）。
- 移动端 `src/`：新增「收益中心」屏 + 收益卡 + 分享深链入口 + 兑付入口。

### 数据流（飞轮一圈）
```
分享海报(深链 /r/:code?ref=inviterId)
  → B 点击(recordClick) → B 注册(?ref) → user_referrals(inviter,invitee)
  → AxpService.earn(referral_signup, refId=relationId) ×2(双边)
  → B 用萌宠(boundAgentAccountId→AgentAccount)在集市接活/成交
  → 各线 earn(AXP) 或 USDT 结算 → pet-earnings 聚合
  → B 成交 GMV → earn(referral_gmv_pct, refId=orderId) 给 A
  → 收益中心可见 → 兑付(spend 抵扣 / 预留USDT出金)
  → 用户再分享 …
```

## Components and Interfaces

### C1 — 收益聚合层（需求 1）
**`PetEarningsService`**（`pet-earnings.service.ts`）
```ts
interface EarningSummary {
  axp: { balance: number; lifetimeEarned: number; lifetimeSpent: number;
         lifetimeExpired: number; usdValueCents: number };
  usdt: { lifetimeEarnedWei: string; pendingWei: string; chain: 'bnb-testnet' };
  updatedAt: number;
}
interface EarningBreakdownItem { category: string; unit: 'AXP'|'USDT';
  amount: number|string; count: number; pctOfUnit: number; }
interface EarningTimelinePoint { date: string; axpEarned: number; usdtEarnedWei: string; }

class PetEarningsService {
  async getSummary(userId: string): Promise<EarningSummary>;          // AXP 来自 AxpService.getBalance；USDT 聚合结算记录
  async getBreakdown(userId: string, range: '7d'|'30d'|'all'): Promise<EarningBreakdownItem[]>;
  async getTimeline(userId: string, range: '7d'|'30d'|'all'): Promise<EarningTimelinePoint[]>;
}
```
- **AXP 聚合**：直接 `AxpService.getBalance` + 对 `user_axp_ledger` 按 `source` 分组 SUM（`direction='earn'`，按 range 过滤 `created_at`）。
- **分类映射**（`earning-source-map.ts`，单一事实源）：
  | 展示分类 | AXP earn sources |
  |---|---|
  | 任务 | `task_complete`, `aeon_task`, `aeon_bounty` |
  | 皮肤 | `skin_sold` |
  | 创作 | `creation_tip`, `creation_unlock`, `creation_purchase`, `remix_royalty` |
  | 预测市场 | `lsm_payout`, `lsm_refund`, `lsm_vault_redeem` |
  | 赛事/对赛 | `contest_win`, `arena_prize`, `arena_refund`, `prediction_payout`, `prediction_refund` |
  | 世界/Plot | `aeon_market_sale`, `aeon_wage`, `plot_revenue`, `plot_payout` |
  | 拉新 | `referral_signup`, `referral_gmv_pct` |
  | 其他 | 兜底（签到/聊天等非集市收入） |
- **USDT 聚合**：读 `commission` 的分成结算记录（`ReferralCommission` 等，按 `currency` 过滤 USDT/USDC）+ payment 结算中归属该用户作为卖家/收款方的成交。**USDT 与 AXP 分单位返回，不相加**（AXP 为积分不折算法币；USDT 按链上稳定币展示）。
- 空数据返回零值结构。

**`PetEarningsController`**：`GET /pet-earnings/summary`、`/breakdown?range=`、`/timeline?range=`（`@UseGuards(JwtAuthGuard)`，`userId` 取自 `req.user`）。

### C2 — 移动端收益中心（需求 2）
- `src/services/petEarnings.api.ts`：`getSummary/getBreakdown/getTimeline`。
- `src/screens/PetEarningsScreen.tsx`：余额头部（AXP 积分，无法币折算）、分类拆分（占比条）、走势折线（复用 `src/components/lsm/OddsHistoryChart.tsx` 的 react-native-svg 折线模式或抽出通用 `LineChart`）、明细列表（分页，调 AXP `listHistory`）。
- 萌宠主屏（现有萌宠 screen）插入「收益卡」组件 `src/components/pet/EarningCard.tsx`：可用余额 + 今日新增 + "收益中心"入口。
- 空态：分类/走势/明细均有空态文案。
- "去兑付"跳 C5 兑付页。

### C3 — 萌宠 = 经济主体（需求 3）
- **绑定流程**：`LivingPetService`（`modules/living-pet`）新增 `ensureEarningCapability(userId)`：若 `LivingPet.boundAgentAccountId` 为空，调用 `UnifiedAgentService.createUnifiedAgent`（已会建 `AgentAccount`+`OpenClawInstance`）并把返回的 `agentAccountId` 回写 `LivingPet.boundAgentAccountId`；幂等（已绑定直接返回，不重复建）。
- **合并视图扩展**：`UnifiedAgentService` 新增 `getPetEconomicProfile(userId)`：返回 `LivingPet`（名称/人格）+ 其 `boundAgentAccountId` 对应 `AgentAccount`（钱包/可用额度 `spendingLimits`-`usedTodayAmount`/`creditScore`/成交统计）+ `PetEarningsService.getSummary`（收益汇总）合并成一个"会赚钱的萌宠"视图。
- 失败隔离：绑定/创建失败不影响 `LivingPet` 既有陪伴功能（try/catch，返回可重试错误）。
- 端点：`GET /living-pet/economic-profile`、`POST /living-pet/enable-earning`。

### C4 — 拉新裂变接线（需求 4）
- **关系表**（新迁移）`user_referrals`：`id`、`inviterUserId`、`inviteeUserId`(unique)、`shortCode`、`channel`、`signupRewarded`(bool)、`createdAt`。一个被邀人只能归属一个邀请人（首次归因，unique on inviteeUserId）。
- **深链**：复用 `ReferralLinkService.createLink`（`?ref=inviterId`）；分享海报深链 = 该 link 的 `shortUrl`。新用户落地 `/r/:code` → `recordClick` → 注册页透传 `ref`/`code`。
- **注册回调**（接 `auth`/`user` 注册成功钩子）：`ReferralFlywheelService.onSignup(inviteeUserId, ref)`：
  - 解析 ref（shortCode→link.ownerId 或直接 inviterId），建 `user_referrals`（幂等 on inviteeUserId）。
  - `AxpService.earn({ userId: inviterId, source:'referral_signup', amount:200, refId: relationId })`（邀请人 **200 AXP**）+ 给被邀人新人奖励 `AxpService.earn({ userId: inviteeUserId, source:'referral_signup', amount:200, refId: relationId+':invitee' })`（被邀人 **200 AXP**，已定）。
  - `ReferralLinkService.recordConversion(code)`。
- **成交分成回调**（接集市成交结算成功钩子）：`ReferralFlywheelService.onInviteeGmv(inviteeUserId, orderId, gmvAmount, assetType)`：
  - 查 `user_referrals` 找 inviter；无则跳过（不阻断主流程）。
  - 费率从 `FeeResolverService`（C8）取 **`REFERRAL_GMV_RATE`（新增于 `financial-architecture.config.ts`，固定 2%，单一来源，已定）**——即被邀人 GMV 的 2% 以 AXP 发给拉新人（不随品类浮动，便于传播与封顶）。
  - `AxpService.earn({ userId: inviterId, source:'referral_gmv_pct', amount, refId: orderId })`（幂等）。
- **幂等**：`referral_signup`、`referral_gmv_pct` 加入 `IDEMPOTENT_EARN_SOURCES`。
- 端点：`POST /referral/track-signup`（内部/注册钩子）、`GET /referral/my-flywheel`（我的拉新战绩：邀请数/转化/累计 AXP）。

### C5 — 收益兑付（需求 5）
- **spend 幂等（必做）**：`AxpService.spend` 增加 `IDEMPOTENT_SPEND_SOURCES` + refId 去重，迁移加 partial unique index `user_axp_ledger(user_id, source, ref_id) where direction='spend'`，并发 23505 兜底（对齐 earn 逻辑）。
- **抵扣闭环**：`PetEarningsService.getRedeemOptions(userId)` 返回可用 AXP 抵扣项（订阅/购买/皮肤，来自既有 `AXP_SPEND_SOURCES`）；`POST /pet-earnings/redeem` → `AxpService.spend(source, amount, refId=businessOrderId)`，按既有兑换目录/抵扣规则扣减（**不做 AXP→法币折算，AXP 无定价**）。
- 前端：收益中心"兑付"页列出可抵扣场景 + 抵扣后余额实时刷新。
- **预留 USDT 出金（仅接口契约，本期不实现）**：design 给出 `CWithdrawalService.createUserPayout(userId, amountWei, targetChainId, targetAddress)` 接口契约 + 复用 `withdrawal`/`fiat-to-crypto`/`mpc-wallet` 的路线说明 + 偿付能力/风控/幂等约束，落 design 文档，不写实现。

### C6 — 萌宠半自主接活（需求 6）
- **机会发现**：`PetAutoEarnService`（新，或扩 `auto-earn`）`listOpportunities(userId)`：聚合 `MerchantTaskService`（可接任务）+ `UnifiedMarketplaceService.search`（可接技能需求），按萌宠能力/信用分排序，产出推荐列表。
- **一键接活**：`POST /pet-earnings/opportunities/:id/accept` → 校验 `AgentAccount.spendingLimits`（单笔/日，对比 `usedTodayAmount`）→ 在限额内执行真实接单→完成→结算链路（调对应模块既有 service）→ 结算收入经既有 earn source（如 `task_complete`）入账 → 出现在收益中心。
- 超限：拒绝 + 提示，不绕过风控（更新 `usedTodayAmount`）。
- 失败：记录、不入账、可重试，`usedTodayAmount` 统计正确。
- 前端：收益中心/萌宠屏"萌宠帮我赚"推荐卡 + 一键接活确认。

### C7 — 飞轮指标（需求 7）
- `PetEarningsMetricsService`（admin）：拉新（`user_referrals` 注册/转化）、赚取（`user_axp_ledger` earn 按 source 总额 + 活跃赚钱用户数）、兑付（spend/预留出金额）、分享回流（`referral_links` clicks→conversions）。
- 端点 `GET /admin/flywheel/metrics`（admin guard）或并入现有运营看板。真实数据，不注入种子。

### C8 — 统一抽佣（需求 9）
- **`FeeResolverService`**（`modules/commission/fee-resolver.service.ts`）：唯一费率解析入口，内部基于 `resolveRates(assetType, ctx)` + `FINANCIAL_PROFILES`。所有赚钱线计算抽佣/池/推荐分成都经此服务。
- **配置收敛**（仅动三项，其余不变）：
  - `FINANCIAL_PROFILES[DEV_TOOL]`：保持 3%+7%=10%；**移除/重定向 `developer-revenue` 模块的 15% 到此**（developer-revenue 改为引用 FeeResolver）。
  - 新增 `AGENT_HIRE` profile（或在 multi-agent 引用 SERVICE）：multi-agent 抽成 **30%→10%**；改 `multi-agent-marketplace.service` 的硬编码 30% 为 `FeeResolverService`。
  - 新增 `CREATION` profile：平台抽 **5%**；creation 结算经 FeeResolver。
  - `human-commission`/`off-ramp-commission`：登记现值，改为引用统一配置（数值不变）。
  - 新增常量 `REFERRAL_GMV_RATE = 0.02`（拉新返佣率，固定 2%，C4 用）；`REFERRAL_SIGNUP_INVITER = 200` / `REFERRAL_SIGNUP_INVITEE = 200`（AXP，已定）。
- **对账一致**：收益中心 breakdown 的"平台抽佣"口径与实际结算同源（都过 FeeResolver）。
- 端到端：改配置某费率 → 对应线抽佣与收益中心同步变化；BNB 测试链佣金相关数值不被动到（只动上述三项）。

### C9 — 非功能（需求 8）贯穿
- 幂等：earn/spend/分成/兑付全部 refId；新增 partial unique indexes。
- 金额：AXP 整数；USDT 沿用 wei/最小单位字符串，不引入 f64。
- 鉴权：所有新端点 `JwtAuthGuard`；admin 端点 admin guard。
- AGENTS.md：不触碰两条 chat 路径；TypeORM 不写 snake_case（SnakeNamingStrategy 自动）。

## Data Models

新增迁移，additive，SnakeNamingStrategy
1. `user_referrals`（C4）：见上字段；index on `inviterUserId`，unique on `inviteeUserId`。
2. `user_axp_ledger` 索引（C5）：partial unique index for spend 幂等：`CREATE UNIQUE INDEX uq_axp_spend_idem ON user_axp_ledger(user_id, source, ref_id) WHERE direction='spend' AND ref_id IS NOT NULL;`（earn 侧若未建对应 idem index 也一并补）。
3. 无新增账本表——收益聚合全部基于既有 `user_axp_ledger` + commission/payment 结算记录的只读查询。

## Correctness Properties
飞轮的资金/记账正确性必须满足以下不变量（作为属性测试与对账依据）：

### Property 1: 聚合守恒
`summary.axp.balance == lifetimeEarned - lifetimeSpent - lifetimeExpired`；breakdown 各分类 earn 之和 == 该 range 内 `user_axp_ledger` earn 总额。
**Validates: Requirements 1.1, 1.2, 1.7**

### Property 2: earn/spend 精确一次
对同一 `(userId, source, refId)`，无论回调多少次，账本只一行、余额只变一次（earn 已有，spend 本期补齐）。
**Validates: Requirements 5.2, 8.1**

### Property 3: 裂变不双发
同一 `user_referrals` 关系只发一次 `referral_signup`；同一 `orderId` 只发一次 `referral_gmv_pct`。
**Validates: Requirements 4.1, 4.2, 4.3**

### Property 4: 单位隔离
AXP 与 USDT 在任何聚合中不被相加；AXP 为积分不折算法币，USDT 按链上稳定币展示。
**Validates: Requirements 1.3, 8.2**

### Property 5: 费率同源
任一线结算所用费率 == 收益中心展示该线"平台抽佣"所用费率（都过 `FeeResolverService`）。
**Validates: Requirements 9.1, 9.3, 8.3**

### Property 6: 限额不被绕过
半自主接活后 `usedTodayAmount` 单调正确累加，超限必拒。
**Validates: Requirements 6.2, 6.3**

### Property 7: 失败不入账
接活/结算失败不产生 earn 行，且不污染限额统计。
**Validates: Requirements 6.4, 8.1**

## Error Handling
- 聚合层任一数据源异常降级为该分组返回空 + 记 warn，不让整页 500。
- 绑定/接活失败不破坏萌宠陪伴/既有功能。
- earn/spend 并发用 23505 兜底返回幂等结果。
- USDT 结算源不可用时 summary 的 usdt 分组返回 0 + 标记 stale，AXP 分组正常。

## Testing Strategy
- **单测**：分类映射完整性（每个第一期 earn source 都有分类）；FeeResolver 费率解析（含收敛后的 10%/10%/5%）；spend 幂等（重复 refId 不双扣）；referral 双边发放幂等。
- **集成测**：构造 task_complete/skin_sold/lsm_payout + 一笔 USDT 结算 → summary/breakdown/timeline 正确（需求1 端到端）；A→B 注册→成交 裂变双边到账且重复回调不增量（需求4 端到端）；一键接活在限额内入账、超限拦截（需求6 端到端）。
- **部署验证**：后端 `tsc --noEmit` + jest → SSH 部署 → 生产/DB 实测查询 → 记 `.kmdeploy/_deploy_record.md`；移动端镜像触发 APK、记 build 号、真机重验（含支付/兑付链路 web→mobile 重测）。
- **每切片独立验证**，不等全量完成。
