# Design — Agentrix 集市 Tab 重构

## Overview

把移动端「集市」从「teaser 过场层 + 真实交易层」双层结构塌平为**单层 5 段交易市场切换器**（赛事预测/OpenClaw技能/任务/宠物/资源与商品，默认赛事预测），删除广场/玩乐；并让赛事预测（LSM）接通 KMarket 赔率源、提供 KMarket 式赛事列表 + 世界杯 Hero + 开仓/平仓闭环。后端模块/表/路径 `lsm` 不动，仅前端展示改名。

## Architecture

### 现状（实测）
```
底部 Tab「集市」→ PlazaStack
  ├─ PlazaRoot = PlazaScreen        ← 图1：5 段 teaser(广场/技能/任务/宠物/玩乐)
  │     skills 段 → "技能市场·浏览技能" → navigate('Skills')
  ├─ Skills = ClawMarketplaceScreen ← 图2/3：4 交易页签(OpenClaw/任务/杠杆滚球/资源)
  ├─ Tasks / Feed / Messaging / GreetingCard* / PetsSkins / EventsCenter /
  │   PredictionMarket / PhotoMimic / Predict / CoRaising* …
  └─ SkillDetail / Checkout …
```
问题：双层重复（技能/任务出现两次）；LSM 段无数据；无平仓。

### 目标
```
底部 Tab「集市」→ MarketplaceStack（PlazaStack 精简改名）
  ├─ MarketplaceRoot = MarketplaceScreen  ← 单层 5 段，默认「赛事预测」
  │     赛事预测 = PredictionMarketSegment (Hero + 赛事列表 + 我的持仓 + 金库)
  │     OpenClaw = OpenClawSkillsTab（沿用）
  │     任务     = TaskMarketScreen（沿用）
  │     宠物     = PetMarketSegment（皮肤拍卖）
  │     资源与商品 = ResourcesTab（沿用）
  └─ 二级：SkillDetail / Checkout / MatchDetail …
  （删除 PlazaScreen 5-teaser、Feed/Messaging/GreetingCard*/EventsCenter/
   PhotoMimic/Predict/CoRaising* 的集市内入口与路由）
```
- `MarketplaceScreen` 由 `ClawMarketplaceScreen` 升级（4→5 段、赛事预测置首默认、宠物段接皮肤市场）。
- 段切换为同屏 state，不走导航栈；`PlazaStack.PlazaRoot` 直接渲染 `MarketplaceScreen`，删 `PlazaScreen`。

### 路由清理策略（需求 2）
- 删除前逐个 grep 引用方；仅去集市内入口，保留被其他 Tab（世界/我）复用的底层屏。
- 清 `PlazaStackNavigator` 的 `Stack.Screen` + `PlazaStackParamList` 类型项 + 所有 `navigate('<删>')` + `resolveLegacyRoute` 深链别名（导向 MarketplaceRoot 或保留屏）。
- 验收：`tsc --noEmit` 0 新错误 + 全局 grep 无悬空 `navigate('<已删路由>')`。

## Components and Interfaces

### 后端

**LsmFeedPoller**（新增，`leverage-sports-market` 模块，@Cron 复用全局 ScheduleModule）
- `@Cron(EVERY_30_SECONDS, 'lsm-feed-poll')`：未配 `KMARKET_INTERNAL_BASE_URL` 则跳过；`GET {base}/api/v1/internal/lsm/snapshots`（`X-Internal-Token`）→ `LsmFeedService.ingest`。
- `@Cron(EVERY_5_MINUTES, 'lsm-feed-poll-all')`：全量。
- env：`KMARKET_INTERNAL_BASE_URL`/`KMARKET_INTERNAL_TOKEN`/`LSM_FEED_POLL_DISABLED`。超时 + try/catch，失败仅告警。

**LsmOrderService.cashOut(orderId, userId)**（新增）+ `POST /lsm/orders/:id/cashout`（JwtAuthGuard）
- 门禁：盘口 tradable（非 stale/suspended）+ `systemMode.assertCanOpen()`。
- 定价见 Data Models；逐金库腿释放预留 + 结算（同事务，强校验兑现≤预留），订单 `CASHED_OUT`，用户 credit（幂等 `lsm:cashout:<id>`）。
- `myOrders`/持仓视图为每个 OPEN 单附实时 `cashoutValue`。

**Featured/Hero**：`GET /lsm/markets/featured`（按 `LSM_FEATURED_LEAGUES` 联赛过滤或 featured 标记）；v1 可由前端按 `league` 从 `markets/live` 派生。

### 前端（移动端）

- **MarketplaceScreen**：顶部分段 `['predictions','skills','tasks','pets','resources']`，默认 `predictions`；同屏渲染；保留 AXP pill/搜索/通知。
- **PredictionMarketSegment**（原 `LeverageSportsMarketScreen` 升级）：盘口（Hero + 分组列表，赔率点按直开 `OrderTicket`）/ 我的持仓（实时 `cashoutValue` + 平仓）/ 金库；文案改「赛事预测」。
- **PetMarketSegment**：接 `SkinAuctionScreen`/`market/skins`/`FeaturedSkinsCarousel`。
- **ResourcesTab**：沿用（去/弱化 TEST 横幅）。
- **API 客户端**：RN/web 补 `cashOut()`、`featured()`。
- BTC `Predict` 屏标题改「BTC 预测」。

## Data Models

无新表（cash-out 复用现有 `lsm_orders`/`lsm_order_legs`/`lsm_vault*` + `CASHED_OUT` 枚举）。

**cash-out 定价（整数 AXP，floor 不高估用户）**
- 订单：保证金 `M=stake`、杠杆 `L`、入场可成交赔率 `o_e`、名义 `N=M·L`、`maxProfit=floor(N·(o_e−1))`、各腿 `reserveShare`（Σ=winPayout=M+maxProfit）。
- 当前可成交赔率 `o_c = tradableOddsFor(market,outcomeIdx)`（与开仓同源含 edge）。
- `maxProfit_now = floor(N·(o_e/o_c − 1))`（o_c↓=增值，o_c↑=贬值）。
- `cashout = clamp(M + maxProfit_now, 0, M + maxProfit)`。
- 退出 edge：`LSM_CASHOUT_EDGE_BPS`（默认 0，v1 不抽）。
- 金库：`splitProRata(cashout, 各腿权重)`，余数归官方腿；本腿净盈亏 `= stakeShare − cashoutShare`；强校验 `Σ cashoutShare ≤ Σ reserveShare`。

## Correctness Properties

### Property 1: 兑现上界
`Σ cashoutShare ≤ Σ reserveShare`（兑现不超过该单预留）。
**Validates: Requirements 6.3, 8.1**

### Property 2: 守恒
平仓后「用户余额 + Σ金库权益 + Σ未结预留」恒等于平仓前（AXP 守恒，credit=金库释放净额）。
**Validates: Requirements 6.3, 8.1**

### Property 3: 偿付
任意金库 `reserved ≤ bankroll` 平仓后保持。
**Validates: Requirements 6.3, 8.1**

### Property 4: 隔离
多金库腿各自独立结算，互不影响。
**Validates: Requirements 6.2, 8.1**

### Property 5: 整数与非负
全程整数 AXP，floor 取整，无浮点；`cashout ≥ 0`。
**Validates: Requirements 6.2, 8.1**

## Error Handling

- poller 未配 env → 静默跳过；HTTP 失败/超时 → 告警不抛，不阻塞。
- cash-out：盘口 stale/suspended → 拒绝 `ODDS_STALE`/`MARKET_SUSPENDED`；system-mode 非 normal → `SYSTEM_MODE_*`；订单非 OPEN/非本人 → 幂等返回或拒绝；金库释放失败 → 事务回滚，用户不入账。
- 删路由后残留跳转 → 编译期 `tsc` 拦截 + 深链别名兜底导向 MarketplaceRoot。
- 赔率源空 → 赛事列表友好空态 + 源状态提示。

## Testing Strategy

- 单元：`computeCashout` 纯函数（增值/贬值/封顶/floor/非负）。
- 属性（`lsm.properties.spec.ts`）：P-cashout-1..4 + 整数（fast-check）。
- E2E（`lsm.e2e.spec.ts`）：开仓 → 价变 → 平仓 → 守恒 + 状态机；既有 LSM 测试不回归。
- 集成冒烟：feed poller 落库非空、`markets/live` 非空、stale 判定、sweepSettlements 据 winningOutcomeIdx 结算。
- 移动端冒烟：集市 5 段切换、赛事列表有数据、开仓、平仓、改名生效、无死链。

## Deployment
- 后端：poller + cash-out（无新表/migration）→ SSH build + pm2 restart + 健康检查；生产配 `KMARKET_INTERNAL_*` env。
- 移动端：改 `src/**` → 镜像 → APK CI（同前次流程）。

## Risks
- 删路由误伤跨 Tab 复用 → 删前逐个 grep。
- cash-out 定价错误致金库漏损 → floor + 兑现≤预留 + 属性测试 + `CASHOUT_EDGE_BPS=0` 保守。
- KMarket 内部端点缺 scope 参数 → poller 先全量拉取。
