# Design Document — Agentrix 杠杆滚球预测市场（LSM）

## Overview

在 Agentrix（NestJS + PostgreSQL 后端，React Native/Expo 移动端，Next.js web）内**新建**杠杆滚球预测市场垂直，作为集市的一个板块。核心三件事：(1) 赔率源复用 KMarket 采集，经内部 API 喂入；(2) 杠杆滚球盘口/下单/结算引擎用 NestJS 重写，复用 AXP+ledger 资金、risk/kyc/compliance 风控合规、marketplace 入口；(3) **Hyperliquid 式 LP 金库**作为统一对手方（庄家），社区出资、按份额分担盈亏。

设计第一原则：**资金正确性**——AXP 守恒、金库偿付约束、NAV 守恒、精确整数口径、结算幂等。所有金额以整数 AXP 最小单位（`bigint`/`numeric(38,0)`）运算，杜绝浮点（沿用 KMarket 去 f64 经验）。

## Architecture

### 系统上下文
```
[KMarket 赔率采集服务]
   │ 内部受信 API（服务间令牌）：赛事/赔率快照 + 实时推送(WS/SSE)
   ▼
[Agentrix 后端 · modules/leverage-sports-market (新)]
   ├─ feed-bridge      ← 拉取/订阅赔率，落本地盘口快照，做"暂停/过期"判定
   ├─ market           ← 盘口生命周期、状态、outcome_count(2/3-way)
   ├─ pricing          ← 公允赔率 → 可成交赔率(+edge/margin)、滑点区间
   ├─ order-engine     ← 杠杆下单/预览/平仓/强平；金库为对手方
   ├─ vault (LP)       ← 多金库：官方金库 + 用户自建金库；bankroll/NAV/份额/存赎/PnL/预留/社会化/主理人分成  ★核心
   ├─ underwriting-router ← 盘口→承接金库路由（用户金库订阅+容量，回退官方金库）
   ├─ risk-limits      ← 单盘/单赛事/全局利用率上限（每金库独立，对接 modules/risk）
   ├─ settlement       ← 赛果结算/取消改判/对账（整数、幂等）
   ├─ asset-adapter    ← 资金标的抽象（v1: AXP 适配器；v2: 稳定币）
   └─ admin/observability ← 金库面板、对账、反作弊视图
   │
   ├─ 复用 modules/axp (AxpService.earn/spend/getBalance), modules/ledger(双分录)
   ├─ 复用 modules/risk, modules/kyc, modules/compliance, modules/marketplace
   └─ 暴露 REST + WS 给 web / RN
   ▼
[Web (Next.js) LSM 页面] + [RN/Expo 集市内 LSM 板块 + OrderTicket]
```

### 模块边界与复用
- **新建** `backend/src/modules/leverage-sports-market/`（也可命名 `lsm`）。不复用现有 `prediction-market`（那是 Polymarket 式价格预言机，模型不同），但可借鉴其 controller/feed 结构。
- **资金**经 `asset-adapter` → v1 落到 `AxpService.spend/earn/adjust` + `ledger`。引擎层只认「资产单位」抽象，不直接调 AXP。
- **风控**：`risk-limits` 自身做敞口/利用率判定，并对接 `modules/risk` 的全局策略与 system-mode 开关。
- **赔率采集**：不在 Agentrix 重做采集；`feed-bridge` 仅消费 KMarket 内部 API。

### 数据流（一次下注）
```
用户下单 → order-engine 预览(pricing: 当前赔率±滑点, 杠杆→敞口/强平价)
  → risk-limits 检查(单盘/赛事/全局利用率)  → 通过?
  → 原子事务:
       asset-adapter.escrow(用户保证金)              [AXP spend + ledger]
       vault.reserveLiability(maxPayout 最坏赔付)     [更新预留, 不动 bankroll]
       创建 order(open)
  → 提交成功（防重复提交：幂等键）
赛果/平仓/强平 → settlement:
  原子事务:
     计算盈亏(整数)
     若用户赢: vault.payout(用户 earn; bankroll 减; 释放预留)
     若用户输: vault.collect(保证金入 bankroll; 释放预留)
     order(settled, 幂等)
  → NAV 随 bankroll 变化重算（份额不变）
```

## Components and Interfaces

### asset-adapter（资产抽象层）
```ts
interface AssetAdapter {
  unit(): 'AXP' | 'USDC';
  balanceOf(userId): Promise<bigint>;
  escrow(userId, amount, ref): Promise<void>;   // 扣减并锁定（下注保证金）
  release(userId, amount, ref): Promise<void>;   // 退还（取消/退款）
  credit(userId, amount, ref): Promise<void>;    // 入账（盈利/赎回）
  debit(userId, amount, ref): Promise<void>;     // 扣减（出资）
  // 全部整数；ref 携带幂等键 + 业务类型，落 ledger 双分录
}
class AxpAssetAdapter implements AssetAdapter { /* 调 AxpService + ledger */ }
```
所有资金动作带幂等键（orderId/txnId），重复调用不重复记账。

### vault（LP 金库，Hyperliquid 式）—— 核心经济模型

**状态（持久化，整数 AXP）：**
- `bankroll`：金库可用本金（不含预留）。
- `reserved`：所有未结订单的最坏赔付之和（预留负债）。
- `equity = bankroll + reserved − openUserMargin?`（见下方守恒定义，统一以「金库净权益」表达）。
- `totalShares`：总份额。
- `navPerShare = equity / totalShares`（用高精度有理数表示，避免取整漂移；展示时再取整）。

**净权益定义（关键）：**
为避免歧义，定义金库**净权益 E**：
```
E = bankroll_free + Σ_open( 已收用户保证金 − 该单最坏赔付预留 )
```
即金库已把每笔未结订单的「保证金收入」与「最坏赔付」都纳入权益的保守计量（最坏情形下 E 即为金库清算价值的下界）。结算时实际盈亏落定，E 收敛到真实值。**采用保守计量**确保 NAV 不高估、LP 赎回不挤兑未结风险。

**存入/赎回：**
- 存入 `d`：`sharesMinted = d × totalShares / E`（首笔 `E=0` 时 1:1）；`E += d`，`totalShares += sharesMinted`。
- 赎回 `s` 份额：`payout = s × E / totalShares`，但**可赎回上限 = bankroll_free 中未被预留占用的部分**（即 `min(payout, freeWithdrawable)`），不足部分进入排队/冷却，保证不挪用未结预留。
- 冷却期/锁定：赎回申请 → 冷却 N 小时后可领（防止赛果临界点套利赎回）。

**下注对手方记账：**
- 开仓：用户保证金 `m` escrow；金库对该单 `reserve = maxPayoutToUser`（=用户在最坏赔付情形下金库要支付的净额）。`reserved += reserve`，同时把 `m` 记入金库侧「该单保证金收入」。E 的净变化 = `m − reserve`（通常为负，因 reserve>m，体现金库承担的方差敞口被保守预留）。
- 结算赢（用户）：金库支付 `payout`；`bankroll_free` 减、释放 `reserve`、保证金收入落定。E 实际下降 = 金库本单净亏。
- 结算输（用户）：保证金 `m` 落入 `bankroll_free`；释放 `reserve`。E 实际上升 = 金库本单净盈（含 edge）。

**偿付约束（硬不变量）：** 任意时刻 `reserved ≤ bankroll_total`，且新开仓必须满足 `reserve_new ≤ availableForNewRisk`（见 risk-limits）。这保证**单盘乃至全场最坏结果下金库不为负**，LP 至多损失出资。

### 双金库模式（官方金库 + 用户自建金库，参考 Hyperliquid）

金库实体统一建模，用 `kind` 区分；上述 NAV/份额/预留/偿付逻辑对两类金库通用：

- **官方金库（kind=protocol，类 HLP）**：平台运营，默认承接所有盘口；`leader=null`、`profit_share=0`，盈亏全归其 LP。系统启动即存在单例。
- **用户自建金库（kind=user）**：主理人创建，附带条款（参考 Hyperliquid，默认值可配置）：
  - **Skin-in-game**：主理人须维持自有份额占比 ≥ `min_leader_share_bps`（默认 500=5%）；低于则停止开放存入/承接。
  - **利润分成（HWM）**：主理人按 `profit_share_bps`（默认 1000=10%，设上限）对金库净值创**高水位**部分计提；记录 `high_water_nav`，亏损未回补期间不计提，避免重复抽成。计提以「向主理人铸造额外份额或落入主理人 claimable」实现，存入方 NAV 反映扣费后权益。
  - **存款锁定期**：存入后 `deposit_lock_secs`（默认 86400=1d）不可赎回；叠加结算临界窗口禁赎。
  - **主理人退出限制**：自有份额不可赎回至低于 `min_leader_share_bps`；完全退出须走「关闭金库」（`status: active→closing→closed`：停止承接新单→结清未结→按 NAV 返还全部存入方→清算）。
  - **隔离**：每个用户金库独立 `bankroll/reserved/total_shares/敞口上限`；其亏损不波及其他金库或官方金库。

### underwriting-router（承接路由，支持按比例分摊）

- `market_house(market_id) -> allocation[]`：决定盘口对手方为**一个或多个金库**的承接配比。
- 用户金库**订阅**联赛/盘口并声明承接容量（受其 bankroll 与敞口上限约束）+ 费率竞价。盘口承接名单按 `费率竞价 + 容量` 排序选入。
- **按比例分摊**：同一盘口可由多个已订阅用户金库 + 官方金库按**承接容量比例**分摊对手方敞口；每笔下注按比例拆分到各承接金库，各自独立预留/记账/结算/盈亏；官方金库始终兜底剩余比例。
- 单笔下注的资金动作在同一事务内对各承接金库按其份额扣预留/计盈亏，隔离不变量按「每金库各自承接份额」成立。
- 用户金库容量耗尽/进入 closing → 新盘口不再分配给它（存量未结仍由其按既定份额承接至结算）。

### pricing
- 输入：feed 公允赔率、`outcome_count`、杠杆。
- 输出：可成交赔率 = 公允赔率经 `edge/margin` 调整（庄家边际，长期 LP 正期望）；可接受滑点区间 `[odds×(1−bps), odds×(1+bps)]`，`bps=MAX_SLIPPAGE_BPS=500`。
- `maxPayoutToUser` / 强平价 / 最大可亏 计算沿用 KMarket 杠杆固定赔率口径（整数）。

### risk-limits
- `perMarketMaxNetExposure`、`perEventMaxExposure`、`globalMaxUtilization = reserved/bankroll_total ≤ U*`。
- `availableForNewRisk = min(perMarket剩余, perEvent剩余, (U*×bankroll_total − reserved))`。
- 超限 → 拒绝或缩减；利用率高 → 收紧/暂停高风险盘口。对接 `modules/risk` + system-mode。

### feed-bridge
- 拉取快照 + 订阅实时（WS/SSE）；本地缓存盘口快照 + `lastOddsAt`。
- `staleAfterSecs` 超时 → 盘口标记 `odds_stale` → 禁止下单。
- 内部 API 服务间令牌鉴权。

### settlement
- 赛果来源：KMarket 采集 finish 事件（经 feed-bridge）。
- 整数结算 + 幂等键（marketId+round）；取消/改判走回滚或重结算路径，全程 AXP 守恒。

### 前端
- **Web（Next.js）**：LSM 列表/详情/金库页（LP 存赎、NAV、PnL）。
- **RN/Expo**：集市内新增 LSM 板块（复用 skill/task 市场板块模式）；`OrderTicket`（落 `order-placement-ux` 设计）；金库 LP 页；实时赔率 WS。
- 资金展示统一「AXP」单位与「不可提现」披露。

## Data Models

（新增表，金额列均为整数 AXP `numeric(38,0)`）
- `lsm_markets`(id, event_id, league, home, away, outcome_count, status, kickoff_at, ...)
- `lsm_odds_snapshots`(market_id, outcome_idx, odds, source, ts)  ← feed-bridge 落地
- `lsm_orders`(id, user_id, market_id, outcome_idx, stake, leverage, entry_odds, max_payout, reserve, status, close_pnl, settled_at, idem_key)
- `lsm_vault`(id, **kind[protocol|user], leader_user_id?, status[active|closing|closed], min_leader_share_bps, profit_share_bps, deposit_lock_secs, high_water_nav,** asset_unit, bankroll, reserved, total_shares, updated_at)
- `lsm_vault_positions`(vault_id, user_id, shares, locked_until, cost_basis, is_leader, ...)
- `lsm_vault_events`(vault_id, type[deposit|redeem|pnl|profit_fee|close], user_id?, amount, shares_delta, nav_at, ts, idem_key)
- `lsm_vault_subscriptions`(vault_id, league_or_market_scope, capacity, fee_bid_bps, priority, enabled)  ← 用户金库承接订阅 + 费率竞价
- `lsm_market_house`(market_id, vault_id, alloc_bps, assigned_at)  ← 承接路由绑定（同盘多行，alloc_bps 合计 10000=按比例分摊）
- `lsm_order_legs`(order_id, vault_id, alloc_bps, stake_share, reserve_share, pnl_share)  ← 单笔下注按承接金库拆分的资金腿
- `lsm_settlements`(market_id, round, basis, idem_key, created_at)
- 所有金额列 `numeric(38,0)`（整数 AXP）；NAV 以 `bankroll/shares` 即时计算或存有理数分子分母。

## Error Handling
- 资金动作全在 DB 事务内 + 幂等键；失败回滚，不产生半截记账。
- 赔率过期/采集中断 → 盘口暂停，下单返回明确错误码（`ODDS_STALE`/`MARKET_SUSPENDED`）。
- 风控拒绝 → `RISK_LIMIT_EXCEEDED`（可附可下注上限）。
- 滑点超限 → `SLIPPAGE_EXCEEDED` + 当前价（前端按新价重试）。
- 赎回流动性不足 → `VAULT_LIQUIDITY_QUEUED`（进入冷却/排队）。

## Testing Strategy
- **属性测试（最高优先，金库/资金）**：随机下注/结算/存赎序列下，验证下列不变量恒成立。
- 单元：pricing（赔率/滑点/强平价/最大可亏边界）、结算幂等、NAV 铸/销不稀释。
- 集成：feed-bridge 断流→暂停；风控上限拒绝；system-mode 暂停。
- E2E（mock 内部 feed API + mock 资产适配器）：集市进入→下单→结算→LP 存赎→NAV 变化；移动端 OrderTicket。
- 灰度：先平台 bankroll（P1）再社区金库（P2），每阶段独立验证。

## Correctness Properties

（可执行不变量；用于属性测试，随机下注/结算/存赎序列下恒成立）

### Property 1: AXP 守恒
`Σ 用户余额 + bankroll_total(含 reserved) + 手续费池 == 常量`（除显式 earn/burn）。任何下注/结算/存赎序列后成立。
**Validates: Requirements 3.3**

### Property 2: 金库偿付
任意时刻 `reserved ≤ bankroll_total`；新开仓后该约束仍成立（最坏结果下金库不为负）。
**Validates: Requirements 5.4, 6.1**

### Property 3: LP 有限亏损
任一 LP 净值 `≥ 0`，累计可领不超过出资 ± 已实现 PnL 份额；金库不可穿仓为负。
**Validates: Requirements 5.5**

### Property 4: NAV 无稀释
存入/赎回在执行 NAV 下进行 ⇒ 其他 LP 的权益（shares×NAV）操作前后不变（取整误差 ≤ 1 最小单位且不可累积获利）。
**Validates: Requirements 5.1, 5.2**

### Property 5: 结算幂等
同一 `(market, round, idem_key)` 重复结算不改变余额与金库状态。
**Validates: Requirements 7.1**

### Property 6: 精确整数
所有资金路径为整数 AXP，无浮点；等价重算结果一致（对齐 KMarket 去 f64）。
**Validates: Requirements 3.1, 7.1**

### Property 7: 展示=成交口径
展示赔率来源与成交校验赔率来源一致；滑点 bps 恒为 `MAX_SLIPPAGE_BPS=500`。
**Validates: Requirements 4.3, 2.2**

### Property 8: 赔率新鲜度
`odds_stale` 或 `MARKET_SUSPENDED` 时不可成交。
**Validates: Requirements 2.3, 4.4**

### Property 9: 金库隔离
任一用户金库的亏损只减计其自身 bankroll/净值，不影响其他金库或官方金库；偿付约束（reserved ≤ bankroll）按**每金库**独立成立。
**Validates: Requirements 11.5**

### Property 10: 主理人 skin-in-game
用户金库开放存入/承接期间，主理人自有份额占比 ≥ `min_leader_share_bps`；任何赎回不得使其低于该值（除经「关闭金库」流程）。
**Validates: Requirements 11.2, 11.7**

### Property 11: 利润分成高水位
仅当金库 NAV 创高水位时对超出部分计提分成；NAV 低于 `high_water_nav` 期间分成计提为 0（不重复抽成）；计提后存入方权益=扣费后净值。
**Validates: Requirements 11.3**

### Property 12: 锁定期
存入产生的份额在 `locked_until` 前不可赎回；结算临界窗口内禁赎规则生效。
**Validates: Requirements 11.4**

## Deployment & Phasing（详见 tasks.md）
- 后端：Agentrix NestJS 标准发布流程（与现有 modules 一致）。
- 资金标的：v1 AXP 适配器；v2 稳定币适配器（法务前置）。
- 灰度顺序：只读盘口 → 平台 bankroll 下注+下单UX → 社区 LP 金库(+属性测试) → 增强 → 稳定币升级。

## Resolved Decisions（已按推荐敲定）

1. **NAV 取整**：以高精度有理数计算，展示取整；取整余数归金库（计入 bankroll），不归个人，杜绝 LP 套利。
2. **edge/margin**：基础边际按联赛可配置（默认总 overround ≈ 4–6%）+ 利用率动态加成（利用率越高边际越高，设上限），保证金库长期正期望。
3. **赎回冷却**：存款锁定期默认 24h（对齐 Hyperliquid），叠加结算临界窗口禁赎；赎回仅从 free bankroll 即时兑付，不足进入冷却队列，不挪用预留。
4. **敞口上限初值（保守，随 bankroll 自适应、可配置）**：单盘最大净敞口 = 金库 bankroll 的 5%，单赛事聚合 = 15%，全局利用率上限 U* = 50%；用户金库同规则按其自身 bankroll 计。
5. **模块命名**：`leverage-sports-market`（简称 `lsm`），不复用现有 `prediction-market`（模型不同）。

## Open Decisions（剩余待确认）

（暂无阻塞项；以下为已敲定的运营策略）

- 用户自建金库准入：需 KYC + 账户等级门槛 + 最低初始 bankroll + 主理人可创建数量上限（具体阈值实现时配置化）。
- 承接订阅粒度：支持按联赛与按单盘两级订阅；多金库竞争同盘按**费率竞价 + 容量**排序。
- **同盘多金库按比例分摊（已采纳）**：允许多个已订阅金库 + 官方金库对同一盘口按**承接容量比例**分摊对手方敞口；每笔下注按比例拆分到各承接金库，各自独立预留/结算/盈亏；隔离不变量按「每金库各自承接份额」成立。官方金库始终作为兜底承接剩余比例。
