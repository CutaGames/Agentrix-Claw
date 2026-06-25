# Implementation Plan — Agentrix 杠杆滚球预测市场（LSM）

## Overview

五阶段交付（P0→P5），每阶段独立可构建/灰度/验证。后端在 Agentrix NestJS 内新建 `modules/leverage-sports-market`，复用 axp/ledger/risk/kyc/compliance/marketplace；赔率源复用 KMarket 采集（内部 API）。**资金正确性（守恒/偿付/NAV/整数/幂等/隔离）贯穿，金库为关键路径与最高风险**。约束：不改 `MAX_SLIPPAGE_BPS=500`、不放宽风控、整数 AXP 无浮点、v1 AXP 不可提现、稳定币升级法务前置。

灰度顺序：只读盘口 → 平台 bankroll 下注 + 下单 UX → **官方金库（类 HLP）** → **用户自建金库（主理人/分成/隔离）** → 可观测/运营 → 稳定币升级。

## Tasks

### 阶段 P0 — 集市接入 + 只读盘口 + 赔率桥接

- [x] 1. KMarket 内部赔率 API + feed-bridge
  - KMarket 侧：`routes/lsm_internal.rs` 暴露 `GET /api/v1/internal/lsm/snapshots`（`INTERNAL_SERVICE_TOKEN` + `X-Internal-Token` 鉴权，markets+latest odds_tick LATERAL join，2/3-way、bps→decimal、状态映射、winningOutcomeIdx），注册于 `routes/mod.rs`。Agentrix 侧：`LsmFeedService.ingest` 消费落库 + `odds_stale`/`isTradable` 判定。实时 WS 推送可后续接（轮询已足够 P0）。
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 2. LSM 模块骨架 + 集市板块入口（只读）
  - 后端只读盘口完成。前端：RN `ClawMarketplaceScreen` 新增「杠杆滚球」第 4 页签 → `LeverageSportsMarketScreen`（盘口/我的持仓/金库三页签，2/3-way 动态）；web `pages/sports.tsx`（盘口+金库，Tailwind/Navigation/Footer）。
  - _Requirements: 1.1, 1.2, 1.3, 4.2_

- [x] 3. 资产适配层（AXP 适配器）
  - `AssetAdapter` 抽象 + `AxpAssetAdapter`（escrow/release/credit/debit，整数强校验，refId 派生幂等键，对接 `AxpService`）。
  - _Requirements: 3.1, 3.2, 10.1, 10.2_

### 阶段 P1 — AXP 下注（平台 bankroll 庄家）+ 下单交互优化

- [x] 4. pricing 引擎
  - `lsm.pricing.ts` 纯函数：`applyEdge`（压缩净盈利倍率/floor 取整）、`dynamicEdgeBps`（利用率动态加成封顶）、`slippageBand`/`withinSlippage`（bps=500 固定）、`computeBet`（notional/maxProfit/maxLoss/reserve/winPayout，全整数 AXP）。单元测试 `lsm.pricing.spec.ts` **15/15 通过**。
  - _Requirements: 4.1, 4.3, 7.2, 7.3_

- [x] 5. order-engine（庄家=平台 bankroll，单一账户）
  - `LsmOrderService`：preview（纯定价）+ place（新鲜度/滑点/偿付容量预检 → escrow 保证金 → house 计数器更新 + 订单创建，悲观锁 + 偿付不变量 reserved≤bankroll 强校验）；幂等键 `idemKey` 唯一防重复；失败补偿（release 退保证金）。`LsmHouse` 单例计数器。
  - _Requirements: 4.1, 4.4, 7.2, 7.3, 3.1_

- [x] 6. settlement（整数、幂等）
  - `settleMarket`（按 winningOutcomeIdx 结算 OPEN 订单：won→派彩 winPayout+house 减；lost→house 释放 reserved）/`refundMarket`（取消/作废/平局退保证金）。状态机幂等（仅处理 OPEN）+ AXP 派生幂等键；house/order 同事务，整数守恒。**结算触发器（先前缺口）已补：`LsmOrderService.sweepSettlements`（FINAL+赛果→结算 / VOIDED→退款）由 `LsmSchedulerService` @Cron 每分钟驱动 + admin 手动 `/admin/lsm/settle/sweep`。**
  - _Requirements: 7.1, 7.4, 3.2, 3.3_

- [x] 7. 下单交互优化落地（order-placement-ux）
  - RN `components/lsm/OrderTicket.tsx` + web `pages/sports.tsx` OrderModal：防抖预览、赔率涨跌徽标、杠杆联动、滑点按新价重试、防重复提交、移动端底部抽屉、zh/en、AXP 不可提现披露。
  - _Requirements: 4.5, 8.4_
  - RN/web `OrderTicket`：预览、赔率涨跌徽标、杠杆联动、滑点按新价重试、防重复提交、移动端抽屉、zh/en。
  - _Requirements: 4.5, 8.4_

- [x] 8. 准入/披露 + P1 验证
  - `LsmComplianceService`（复用 `compliance/KYCService`）：地域门禁（env `LSM_BLOCKED_COUNTRIES` + `cf-ipcountry`/`x-country` 请求头）+ 最低 KYC 分级门禁（下注/出资/创建金库可经 env 配置，默认 none/basic/verified）+ zh/en 双语披露文案（`GET /lsm/vaults/disclosure`）。已接入 `place`（下注）、`deposit`/`createUserVault`（出资/主理人）。前端下单/存赎/创建均已显著披露「AXP 不可提现·非投资建议」。**P1 全链路 E2E（`lsm.e2e.spec.ts`，Nest TestingModule + 内存 ORM 桩 + mock feed/资产适配器/KYC）8/8**：LP 注资→下注（赢/输）→结算→退款、AXP 守恒、偿付不变量、幂等、system-mode/地域/滑点门禁。
  - _Requirements: 8.1, 8.2, 8.4_

### 阶段 P2 — 官方金库（Protocol Vault，类 HLP）★核心

- [x] 9. vault 通用会计（bankroll/reserved/shares/NAV）+ 官方金库单例
  - `lsm_vault`(kind=protocol,singletonKey)/`lsm_vault_positions`/`lsm_vault_events`；`lsm.vault-math.ts` 纯函数：净权益 E=bankroll−reserved 保守计量、`navFixed`(1e9 定点) + 余数归金库（floor）。`LsmVaultService.getOrCreateProtocolVault`。
  - _Requirements: 5.1, 5.3, 5.6, 11.1_

- [x] 10. 官方金库 LP 存入/赎回（铸/销份额 + 锁定期）
  - `computeDeposit`/`computeRedeem` 按 NAV 铸/销不稀释；存款锁定期默认 24h（`lockedUntil`）；赎回 payout≤E 恒从 free 兑付不挪用预留；存赎事务 + AXP 补偿/对账。
  - _Requirements: 5.1, 5.2, 11.4_

- [x] 11. 金库作为对手方接入 order-engine/settlement
  - order-engine 改用金库腿：`reserveOpenLeg`/`settleLegWin`/`settleLegLose`/`refundLeg`（同事务，逐腿偿付不变量强校验）；删除 P1 `LsmHouse`；结算盈亏即时反映 NAV。
  - _Requirements: 5.3, 5.4, 5.5, 7.1_

- [x] 12. risk-limits（单盘/赛事/全局利用率上限，每金库独立）
  - 偿付上限 reserved≤bankroll 逐腿强校验 + 利用率动态 edge（`dynamicEdgeBps`）。`lsm.risk-math.ts`/`LsmRiskService.assertLegWithinLimits` 实现单盘 5%/单赛事 15%/全局 U*=50% 三层净敞口上限（基数=金库风险资本 C=bankroll−未结保证金，超限抛 `RISK_LIMIT_EXCEEDED`，阈值 env 可覆盖），在 `place` 开仓事务内逐承接金库腿校验。system-mode 对接：`LsmSystemModeService`（normal/reduce_only/halted 全局熔断），`place`/`deposit`/`redeem` 接入门禁，admin 可即时切换（`/admin/lsm/system-mode`）。验证：`lsm.risk-math.spec.ts` **7/7** + `lsm-compliance.spec.ts` system-mode 部分。
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 5.4_

- [x] 13. 官方金库正确性属性测试（P1–P8）
  - `lsm.properties.spec.ts`（fast-check）：AXP 守恒、偿付(reserved≤bankroll)、权益≥0、NAV 无稀释(单调不降)、余数归金库无套利、全整数、滑点常量、splitProRata 守恒。**23/23 通过。**
  - _Requirements: 5.4, 5.5, 3.3, 7.1_

### 阶段 P3 — 用户自建金库（User Vaults：主理人/分成/隔离）

- [x] 14. vault 实体泛化 + 创建用户金库 + skin-in-game
  - `lsm_vault` kind=user/leaderUserId/minLeaderShareBps(默认500)/profitShareBps(默认1000上限3000)/depositLockSecs/status；`createUserVault` 要求主理人初始出资（标记 isLeader），赎回时 active 金库强制维持最低自有份额。**准入门禁(kyc/等级) = controller 注释待接入。**
  - _Requirements: 11.2, 11.5_

- [x] 15. underwriting-router（订阅 + 容量 + 回退官方金库）
  - `lsm_vault_subscriptions`/`lsm_market_house`/`lsm_order_legs`；`LsmUnderwritingService` 按 (费率竞价 + 容量) 选入用户金库，多金库按容量比例分摊(封顶80%)，官方金库兜底剩余比例；`splitProRata` 余数归官方腿；closing/closed 不接新盘。
  - _Requirements: 11.6, 6.1_

- [x] 16. 利润分成（高水位 HWM）+ 主理人退出/关闭金库
  - `computeProfitFee`（仅 NAV 创高水位计提、铸份额式、不重复抽成）+ `accrueProfitFee`，由 `LsmSchedulerService`（@Cron 每小时）对 active 用户金库自动计提。关闭金库编排：`closeVault`（active→closing，停止承接）+ `finalizeCloseIfReady`（reserved==0 时按 NAV 把全部 LP 份额兑付为 AXP、主理人豁免最低份额、totalShares 归零→closed，CLOSE 事件审计 + 幂等键防重复入账），调度器每 5 分钟扫描清算。控制器 `POST /lsm/vaults/:id/close`（仅主理人）。
  - _Requirements: 11.3, 11.7_

- [x] 17. 用户金库 LP UI（创建/管理/存赎/条款披露）
  - RN `LeverageSportsMarketScreen` 金库页签 + web `sports.tsx` 金库区：两类金库 NAV/利用率/本金/分成/锁定期/主理人最低份额披露；存入 + **赎回**（持仓份额展示、锁定期/最低份额错误映射）+ **创建用户金库**（名称/出资/分成/锁定期，skin-in-game 提示）+ 主理人**关闭金库**与**承接订阅管理**（web：联赛/单盘 + 容量 + 费率竞价）。Web/RN API 客户端补齐 getVault/myPositions/createUserVault/closeVault/listSubscriptions/upsertSubscription/disclosure。
  - _Requirements: 11.8, 1.1_

- [x] 18. 多金库隔离与主理人经济属性测试（P9–P12）
  - `lsm.properties.spec.ts` 覆盖 P9 隔离（各金库各自 reserved≤bankroll、互不影响）、P11 高水位分成（仅创新高计提/回撤不提/不增发 AXP）。skin-in-game(P10)/锁定期(P12) 在服务层强校验。
  - _Requirements: 11.5, 11.2, 11.3, 11.4, 11.7_

### 阶段 P4 — 可观测、对账、运营

- [x] 19. 金库面板 + 对账 + 反作弊视图
  - `LsmReconciliationService` + `LsmAdminController`（`/admin/lsm/*`，JwtAuthGuard+AdminGuard）：金库面板（两类 bankroll/NAV/份额/利用率/未结预留/状态）；对账报告（逐金库偿付 reserved≤bankroll、reserved==OPEN 订单腿 reserveShare 之和、totalShares==Σ持仓份额、权益==份额×NAV 容差校验 + 全局 bankroll/reserved/equity/未结保证金/未结预留汇总）；反作弊信号（同用户同盘多结果、跨账号镜像对敲、同用户短时同额高频）；system-mode 查看/切换 + 手动结算扫描。
  - _Requirements: 9.1, 9.2, 9.3_

- [x] 20. 排行榜/活动复用 + LSM 内运营位
  - `LsmLeaderboardService`（复用 KMarket 排行榜思路）：pnl 盈利王（Σclose_pnl）/ volume 成交量王（Σnotional），all/week 周期，仅计已结算订单。公开端点 `GET /lsm/leaderboard`。前端 web `sports.tsx` 新增「排行榜」页签（盈利王/成交量王切换 + Top20）+ RN/web API 客户端 `leaderboard()`。
  - _Requirements: 1.2_

### 阶段 P5 — 资产升级（稳定币，法务前置）

- [x] 21. 稳定币适配器 + 切换开关（默认关闭）
  - `StablecoinAssetAdapter`（unit=USDC，实现 `AssetAdapter`，默认安全占位：未接国库前抛 `STABLECOIN_TREASURY_UNWIRED`，不持私钥）。引擎核心不变：order/vault 引擎改为依赖注入令牌 `LSM_ASSET_ADAPTER`，`assetAdapterFactory` 按 env 选择（默认 AXP；稳定币须 `LSM_STABLECOIN_ENABLED=1` 且 `LSM_ASSET_UNIT=USDC`，法务前置开关）。后续接 KMarket 多链充提/国库（见 multichain-deposit-withdraw spec）只需在适配器内实现资金动作，引擎零改动。
  - _Requirements: 10.1, 10.2, 8.3_

## Task Dependency Graph

```mermaid
graph TD
  T1[1. feed-bridge] --> T2[2. LSM骨架/集市入口]
  T2 --> T4[4. pricing]
  T3[3. AXP资产适配] --> T5[5. order-engine 平台bankroll]
  T4 --> T5
  T5 --> T6[6. settlement]
  T5 --> T7[7. 下单交互优化]
  T6 --> T8[8. 准入/披露+P1验证]
  T7 --> T8
  T8 --> T9[9. vault会计+官方金库]
  T9 --> T10[10. 官方金库存赎]
  T9 --> T11[11. 金库接入引擎]
  T11 --> T12[12. risk-limits]
  T10 --> T13[13. 官方金库属性测试]
  T11 --> T13
  T12 --> T13
  T13 --> T14[14. 泛化+创建用户金库]
  T14 --> T15[15. 承接路由]
  T14 --> T16[16. 利润分成/关闭]
  T15 --> T17[17. 用户金库UI]
  T16 --> T17
  T15 --> T18[18. 隔离/主理人属性测试]
  T16 --> T18
  T18 --> T19[19. 面板/对账/反作弊]
  T19 --> T20[20. 排行榜/活动]
  T19 --> T21[21. 稳定币升级(法务前置)]
```

执行波次：

```json
{ "waves": [
  { "wave": 1, "tasks": ["1","2","3"] },
  { "wave": 2, "tasks": ["4","5","6","7","8"] },
  { "wave": 3, "tasks": ["9","10","11","12","13"] },
  { "wave": 4, "tasks": ["14","15","16","17","18"] },
  { "wave": 5, "tasks": ["19","20"] },
  { "wave": 6, "tasks": ["21"] }
] }
```

## Notes
- 不整体迁移 KMarket Rust 后端；仅复用赔率采集服务（内部 API）+ 算法/设计 IP（赔率稳定性、去 f64 结算口径、固定赔率杠杆、滑点、system-mode）。
- 金库（P2）是关键路径与最高风险：先平台 bankroll（P1）跑通闭环，再切社区金库，属性测试不变量为合并门槛。
- 资金全程整数 AXP + 幂等键 + DB 事务；NAV 取整余数归金库防套利。
- 合规：v1 AXP 不可提现 + 地域门禁 + 风险披露；稳定币升级（P5/任务21）须法务评审前置，非默认开启（本文档不构成法律意见）。
- 后台编排（`LsmSchedulerService`，复用全局 `ScheduleModule`）：结算扫描（每分钟）、关闭金库清算（每 5 分钟）、主理人高水位分成计提（每小时）；env `LSM_SCHEDULER_DISABLED=1` 可整体停用。
- 关键 env：`LSM_SYSTEM_MODE`（normal/reduce_only/halted）、`LSM_RISK_{MARKET,EVENT,GLOBAL_U}_BPS`、`LSM_BLOCKED_COUNTRIES`、`LSM_MIN_KYC_{BET,LP,LEADER}`、`LSM_ODDS_STALE_SECS`、`KMARKET_INTERNAL_*`。
- 测试：LSM 模块单元/属性/E2E **54/54 通过**（pricing 15 + properties 23 + risk-math 7 + compliance/system-mode 9 + P1 E2E 8，口径以套件输出为准）。

## 状态
**全部 21 个任务已完成（P0–P5）。** 稳定币（task 21）为安全占位 + 法务前置开关，真实多链充提/国库接线在 `multichain-deposit-withdraw` spec 落地后于适配器内实现，引擎零改动。
