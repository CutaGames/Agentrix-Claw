# Requirements Document

> Agentrix 集市 Tab 重构（交易市场聚焦）

## Glossary
- **集市 root**：底部「集市」Tab 落地页（现 `PlazaScreen`，重构后 `MarketplaceScreen`）。
- **段（segment）**：集市 root 顶部横向切换的市场分类（赛事预测/技能/任务/宠物/资源）。
- **LSM / 赛事预测**：杠杆滚球预测市场（后端模块 `leverage-sports-market`，前端改名「赛事预测」）。
- **feed poller**：从 KMarket 内部赔率 API 周期拉取赔率并 ingest 的后台任务。
- **cash-out / 平仓**：赛果前按当前可成交赔率提前兑现持仓盈亏。
- **Hero**：赛事预测段顶部的世界杯运营位大图 banner。

## Introduction

把移动端「集市」Tab 从「双层嵌套 + 社交/玩法混杂」重构为**单层、聚焦交易的多市场切换器**，并让「赛事预测」（原杠杆滚球 LSM）真正接通 KMarket 赔率源、具备 KMarket 式赛事列表与开仓/平仓闭环。

现状问题（已核实）：
- 集市 root（`PlazaScreen`）是 5 个段（广场/技能/任务/宠物/玩乐）的 **teaser 卡片层**，点"浏览技能"才 `navigate('Skills')` 进入 `ClawMarketplaceScreen` 的真实 4 交易页签 → 装个技能要 3~4 跳 + 一层纯过场；技能/任务在两层重复。
- 「杠杆滚球」点进去空（`暂无活跃盘口`）：`LsmFeedService` 只有 ingest 写入口，**无任何从 KMarket 拉取赔率的轮询**，KMarket 也未推送 → 库内 0 盘口。
- LSM 仅支持开仓 + 到期结算，**无提前平仓（cash-out）**。

决策（已与产品确认）：
1. 删除「广场」「玩乐」段及其功能入口（视为鸡肋，下线；非搬迁）。
2. 集市单层，5 段并列：**赛事预测（默认）· OpenClaw 技能 · 任务 · 宠物 · 资源与商品**。
3. 改名：LSM →「赛事预测」；既有 BTC 5min →「BTC 预测」（消歧义）。
4. 新增平仓（cash-out）。

约束（继承 LSM spec）：整数 AXP 无浮点、`MAX_SLIPPAGE_BPS=500` 不改、不放宽风控、金库偿付不变量 `reserved ≤ bankroll` 全程保持、AXP 守恒、幂等 + DB 事务。

## Requirements

### Requirement 1: 集市单层导航（去过场层）

**User Story:** 作为用户，我点「集市」Tab 应直接进入交易市场，能在多个市场间一键切换，而不是先看一层 teaser 再跳转。

#### Acceptance Criteria
1. WHEN 用户点底部「集市」Tab THEN 系统 SHALL 直接落地交易市场页（无中间 teaser/过场屏），默认选中「赛事预测」段。
2. THE 集市页 SHALL 在顶部以横向分段切换器展示 5 个市场：赛事预测 / OpenClaw 技能 / 任务 / 宠物 / 资源与商品；切换 SHALL 在同屏内完成，不新开栈屏。
3. THE 重构 SHALL 移除原 `PlazaScreen` 的「广场」「玩乐」段，以及"技能市场·浏览技能"等 teaser 卡片层。
4. THE 各市场段切换 SHALL 不重复出现同名入口（技能/任务等仅出现一次）。

### Requirement 2: 下线广场/玩乐功能（清路由、无死链）

**User Story:** 作为维护者，我希望删除广场/玩乐后，应用不残留死链或编译错误。

#### Acceptance Criteria
1. THE 系统 SHALL 移除「广场」相关入口（动态流 Feed / 私信 / 贺卡 等在集市内的入口）与「玩乐」相关入口（活动中心 / 赛事预测重复入口 / 宠物模仿秀 / 共养 / BTC 预测 等在集市内的入口）。
2. WHERE 代码他处仍 `navigate('Feed'|'Tasks'|'Plaza'|'PredictionMarket'|…)` THE 系统 SHALL 清理或重定向这些引用，确保无运行时崩溃与 TS 编译错误。
3. WHERE 某被下线功能的底层屏/后端仍被其他 Tab（世界/我）合法使用 THE 系统 SHALL 仅移除「集市内入口」而保留该屏（避免误删跨 Tab 复用）。
4. THE 深链/旧路由别名（`resolveLegacyRoute` 等）SHALL 同步更新，旧入口失效后导向集市或安全降级。

### Requirement 3: 接通赔率源（盘口非空）

**User Story:** 作为用户，进入赛事预测应能看到真实的世界杯/赛事盘口与实时赔率，而非空列表。

#### Acceptance Criteria
1. THE 系统 SHALL 周期性从 KMarket 内部赔率 API（`GET /api/v1/internal/lsm/snapshots`，`INTERNAL_SERVICE_TOKEN` 鉴权）拉取赛事/赔率快照并经 `LsmFeedService.ingest` 落库。
2. THE 轮询频率 SHALL 对 live 盘口更高、对赛前/空闲更低（可配置），且失败重试不阻塞主流程。
3. WHEN 赔率超过 `LSM_ODDS_STALE_SECS` 未更新或采集中断 THEN 盘口 SHALL 标记为过期/暂停并禁止下单（沿用既有 stale 判定）。
4. WHEN KMarket 标记赛果（`winningOutcomeIdx`）或作废 THEN 既有结算调度（`sweepSettlements`）SHALL 自动结算/退款，保持 AXP 守恒。
5. THE 内部 API 凭证 SHALL 仅经 env 配置（`KMARKET_INTERNAL_BASE_URL`/`KMARKET_INTERNAL_TOKEN`），不硬编码。

### Requirement 4: KMarket 式赛事列表 + 世界杯 Hero

**User Story:** 作为用户，我希望像 KMarket 那样浏览比赛列表、看到醒目的世界杯运营位，点比赛即可参与。

#### Acceptance Criteria
1. WHEN 进入赛事预测段 THEN 系统 SHALL 展示赛事列表：live 优先、赛前按开赛时间、已结束在后；每行含球队/联赛、状态徽标（LIVE/赛前/暂停/完场）、各结果（2-way/3-way 动态）实时可成交赔率。
2. THE 赛事预测段顶部 SHALL 展示「世界杯 Hero 运营位」（大图 + featured 赛事/活动，可点击进入）。
3. THE Hero/featured 来源 SHALL 由后端按联赛过滤或 featured 标记驱动，不写死单场。
4. WHERE 暂无任何盘口 THE 系统 SHALL 显示有意义的空态（而非纯空白），并提示赔率源状态。

### Requirement 5: 优化下单流（开仓）

**User Story:** 作为交易者，我希望点赔率即可快速开仓，所见即所验，不被无谓滑点拒单。

#### Acceptance Criteria
1. WHEN 用户点某结果的赔率 THEN 系统 SHALL 直接拉起下单抽屉（保证金 + 杠杆 + 实时预览：名义/最大盈亏/可成交赔率），无需多余跳转。
2. THE 下单展示赔率与滑点校验赔率 SHALL 同源（避免系统性 SLIPPAGE_EXCEEDED，借鉴 KMarket 教训）；提交前 SHALL 刷新现价。
3. IF 服务端赔率偏离超过 `MAX_SLIPPAGE_BPS` THEN 系统 SHALL 拒绝并提供「按新价重试」。
4. THE 下单 SHALL 复用既有 LSM `preview`/`place`（金库对手方、整数 AXP、幂等键、风控三层上限、system-mode 熔断、合规门禁）。

### Requirement 6: 持仓与平仓（cash-out）

**User Story:** 作为交易者，我希望在赛果出来前按当前赔率提前平仓兑现盈亏。

#### Acceptance Criteria
1. THE 系统 SHALL 在「我的持仓」展示未结订单（球队/方向/保证金/杠杆/入场赔率/当前可兑现值/盈亏）。
2. WHEN 用户对某未结订单发起平仓 THEN 系统 SHALL 按**当前可成交赔率**计算兑现值（mark-to-market），把对应金库腿的预留释放、按兑现值与金库结算、订单置 `CASHED_OUT`，整数 AXP、幂等、同事务。
3. THE 平仓 SHALL 维持金库偿付不变量（`reserved ≤ bankroll`）与 AXP 守恒；兑现值 SHALL 不超过该订单各金库腿可释放预留之和。
4. IF 盘口暂停/赔率过期/system-mode 非 normal THEN 系统 SHALL 拒绝平仓并说明（结算路径不受 system-mode 阻断，但主动平仓属"开新风险敞口变更"，按只读/暂停拒绝）。
5. WHEN 平仓成功 THEN 用户 AXP 入账兑现值、金库 NAV 即时反映该腿盈亏，事件流可审计。

### Requirement 7: 命名与一致性

**User Story:** 作为用户，我希望命名清晰不混淆。

#### Acceptance Criteria
1. THE 移动端「杠杆滚球」文案 SHALL 全部改为「赛事预测」（zh）/ "Sports Predictions"（en，或产品定稿英文）。
2. THE 既有 BTC 5min 预测入口/标题 SHALL 改为「BTC 预测」以消歧义。
3. THE 后端模块/表/接口路径（`lsm`）SHALL 保持不变（仅前端展示改名），避免破坏已部署的 API 与数据。

### Requirement 8: 资金正确性与回归（贯穿）

**User Story:** 作为平台，我需要重构与新增平仓不破坏资金正确性，并可安全上线。

#### Acceptance Criteria
1. THE 平仓/结算/开仓 SHALL 全程整数 AXP、幂等键、DB 事务；新增平仓 SHALL 有属性测试覆盖（守恒、偿付、隔离、兑现值上界）。
2. THE 重构 SHALL 不破坏既有 LSM 测试（pricing/properties/risk-math/compliance/E2E）；新增 E2E SHALL 覆盖"开仓→平仓→守恒"。
3. THE 上线 SHALL 走既有部署流程（tsc + jest → SSH deploy + migration:run + pm2 restart → 健康检查）。

## Out of Scope
- 广场/玩乐被下线功能的"搬迁到其他 Tab"（本期直接下线，不迁移）。
- 稳定币标的、多链充提（沿 LSM spec P5，法务前置）。
- KMarket Rust 后端迁移（仅复用其内部赔率 API + 设计 IP）。
- Web 端集市同构重构（本期聚焦移动端；web `sports.tsx` 命名可顺带改，但 IA 重构不在本期）。
