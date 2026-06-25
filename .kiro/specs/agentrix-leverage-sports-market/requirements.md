# Requirements Document

> Agentrix 集市 · 杠杆滚球预测市场（Leverage Sports Market，LSM）

## Glossary

- **LSM**：Agentrix 集市内新增的「杠杆滚球预测市场」板块（与技能市场/任务市场并列）。
- **AXP**：Agentrix 平台积分，由 `modules/axp`（`AxpService.earn/spend/getBalance`）+ `modules/ledger` 双分录记账维护，整数单位。v1 作为下注与 LP 出资标的，**不可提现、仅站内用途**。
- **滚球（in-play）**：比赛进行中的实时盘口；赔率由 KMarket 采集源实时驱动。
- **赔率源桥接（Feed Bridge）**：复用 KMarket 现有赔率采集服务，通过内部 API 向 Agentrix 推送/拉取赔率与赛事状态。
- **LP 金库（Vault，Hyperliquid 式）**：作为下注对手方（庄家）的 AXP bankroll。LP 存入 AXP 铸造份额（shares），金库赚取边际、承担盈亏方差；亏损按份额社会化，LP 至多损失出资。本系统支持**两类金库**（参考 Hyperliquid）：
  - **官方金库（Protocol Vault，类 HLP）**：平台运营、默认承接所有盘口的统一庄家 bankroll；无主理人利润分成，盈亏全部归存入的 LP。
  - **用户自建金库（User Vault）**：任意合格用户创建并任「主理人（leader）」，可承接其订阅的联赛/盘口；其他用户作为存入方（depositor）出资分担盈亏。
- **主理人（Leader）**：用户自建金库的创建者/管理者，须维持最低自有份额（skin-in-game），按高水位对利润抽取分成（profit share）。
- **存入方（Depositor）**：向某金库出资的 LP，按份额比例分担该金库盈亏。
- **利润分成（Profit Share）**：用户金库主理人对金库利润抽取的比例，按**高水位（High-Water Mark, HWM）**计提，亏损未回补不重复计提。
- **承接路由（Underwriting Routing）**：决定某盘口的对手方是哪个金库；用户金库订阅联赛/盘口并提供承接容量，容量不足回退官方金库。
- **存款锁定期 / 赎回冷却（Lockup/Cooldown）**：存入后一段时间内不可赎回 + 赎回排队/结算临界窗口禁赎，防套利挤兑。
- **NAV / 份额净值**：金库权益 ÷ 总份额。存入按 NAV 铸份额、赎回按 NAV 销份额，不稀释既有 LP。
- **预留负债（Reserved Liability）**：未结订单在最坏结果下金库需赔付的上限。
- **利用率（Utilization）**：预留负债 ÷ 金库 bankroll。
- **edge / margin**：在公允赔率上施加的庄家边际，长期为金库（LP）正期望来源。
- **system-mode**：交易/提现/结算的全局开关（沿用 KMarket 概念，复用 Agentrix `risk` 能力）。
- **MAX_SLIPPAGE_BPS**：下单赔率滑点上限，沿用 KMarket 现值 500（5%）。

## Introduction

把 KMarket 的杠杆滚球预测市场以**升级重建**方式落到 Agentrix：在集市新增 LSM 板块，复用 Agentrix 的 AXP/ledger/risk/kyc/compliance/marketplace 底座；赔率源复用 KMarket 采集（内部 API 喂数据）；引入 **Hyperliquid 式 LP 金库**作为庄家对手方。前期下注与 LP 出资用 AXP 积分（不可提现），后续可升级为稳定币。资金正确性（金库偿付、NAV 守恒、AXP 守恒、精确整数口径）为第一优先级。

边界：
- 后端用 Agentrix NestJS 重写引擎，**不**整体搬迁 KMarket Rust 后端；KMarket 价值以算法/设计 IP + 赔率采集服务复用。
- v1 LP 池仅 **Hyperliquid 式金库制**；Betfair 式 P2P 撮合不在本期。
- v1 标的为 AXP，不接多链充提/稳定币金库；保留资产抽象以便后续升级。
- 不改 `MAX_SLIPPAGE_BPS`，不放宽风控。
- 合规为高风险项：本文档不构成法律意见，稳定币升级前须法务评审。

## Requirements

### Requirement 1: 集市板块接入

**User Story:** 作为 Agentrix 用户，我希望在集市里看到「杠杆滚球预测市场」板块，像进入技能/任务市场一样进入它。

#### Acceptance Criteria
1. WHEN 用户进入集市 THEN 系统 SHALL 在集市（web 与 RN 移动端）展示 LSM 入口，复用现有 marketplace 板块的导航与视觉模式。
2. WHEN 用户进入 LSM THEN 系统 SHALL 展示赛事/盘口列表（live 优先、赛前按开赛时间、已结束在后）与盘口详情。
3. THE LSM 板块 SHALL 复用 Agentrix 统一身份与会话，不引入独立登录。

### Requirement 2: 赔率源桥接（复用 KMarket 采集）

**User Story:** 作为系统，我需要复用 KMarket 的赔率采集，把实时赔率与赛事状态喂给 Agentrix LSM。

#### Acceptance Criteria
1. THE 系统 SHALL 通过内部受信 API 从 KMarket 采集服务获取赛事、赔率快照与实时更新（含 2-way/3-way 的 `outcome_count` 与平局赔率）。
2. WHEN 赔率刷新 THEN LSM SHALL 以服务端为权威口径展示，且展示赔率与成交校验口径一致。
3. IF 采集源中断或赔率过期 THEN 系统 SHALL 标记盘口为「暂停/赔率过期」并禁止下单，不得用陈旧赔率成交。
4. THE 内部 API SHALL 鉴权（服务间令牌），不对公网暴露原始采集端点。

### Requirement 3: AXP 资金与账本

**User Story:** 作为用户，我希望用 AXP 积分下注与结算，余额变动准确、可追溯。

#### Acceptance Criteria
1. WHEN 用户下单 THEN 系统 SHALL 通过 `AxpService.spend` 扣减保证金、通过 `ledger` 写双分录，金额为整数 AXP，无浮点。
2. WHEN 订单结算盈利 THEN 系统 SHALL 通过 `AxpService.earn`/`adjust` 入账，且与金库侧记账双分录恒等。
3. THE 全系统 AXP SHALL 守恒：用户余额 + 金库 bankroll + 预留 + 手续费池之和，除显式发行/销毁外保持不变。
4. THE v1 AXP SHALL 不可提现、仅站内用途；下注/出资入口对未达准入条件用户置灰并说明。

### Requirement 4: 杠杆滚球下单

**User Story:** 作为交易者，我希望对盘口加杠杆下注，清楚看到赔率、滑点与风险。

#### Acceptance Criteria
1. WHEN 用户选择结果、金额、杠杆并提交 THEN 系统 SHALL 按当前服务端赔率成交，金库为对手方。
2. WHERE 盘口为 2-way 或 3-way THE 系统 SHALL 按 `outcome_count` 动态渲染结果数，不写死。
3. IF 提交时服务端赔率与展示赔率偏差超过 `MAX_SLIPPAGE_BPS` THEN 系统 SHALL 拒绝并提供「按新价重试」。
4. WHEN system-mode 为暂停/只读 THEN 系统 SHALL 禁止新下单并说明原因。
5. THE 下单交互 SHALL 落地 `order-placement-ux` spec 的优化（预览、赔率涨跌、杠杆联动、防重复提交、移动端抽屉）。

### Requirement 5: LP 金库（Hyperliquid 式）

**User Story:** 作为 LP，我希望向金库存入 AXP 成为庄家、按份额分享盈亏，且亏损不超过出资。

#### Acceptance Criteria
1. WHEN LP 存入 AXP THEN 系统 SHALL 按当前 NAV 铸造份额，不稀释既有 LP 权益。
2. WHEN LP 赎回 THEN 系统 SHALL 按当前 NAV 销毁份额并返还 AXP，受冷却期/锁定与可用流动性约束（预留负债不可被赎回挪用）。
3. WHEN 任一订单结算 THEN 金库盈亏 SHALL 计入金库权益并即时反映到 NAV（盈→LP 份额增值，亏→社会化减值）。
4. THE 金库 SHALL 始终满足偿付约束：预留负债 ≤ bankroll；任何单盘的最坏赔付不得使金库为负。
5. THE LP 单个主体亏损 SHALL 不超过其出资（金库不可穿仓为负）。
6. THE edge/margin SHALL 使金库长期正期望；金库手续费/边际收益归 LP（NAV 增长）。

### Requirement 6: 风控与敞口上限

**User Story:** 作为平台，我需要敞口上限防止单场比赛打穿金库。

#### Acceptance Criteria
1. THE 系统 SHALL 对每个盘口设最大净敞口、每个赛事设聚合敞口、全局设利用率上限（预留/ bankroll）。
2. IF 一笔下注将使任一上限被突破 THEN 系统 SHALL 拒绝或缩减该笔下注并提示。
3. WHEN 利用率接近阈值 THEN 系统 SHALL 收紧可下注额度或临时暂停高风险盘口。
4. THE 风控判定 SHALL 复用/对接 Agentrix `risk` 模块与 system-mode。

### Requirement 7: 结算、平仓与清算

**User Story:** 作为用户，我希望盈亏按赛果精确结算，支持提前平仓。

#### Acceptance Criteria
1. WHEN 赛果确认 THEN 系统 SHALL 按结算依据精确（整数 AXP）结算订单与金库盈亏，幂等且可重放一致。
2. WHEN 用户提前平仓/现金兑现 THEN 系统 SHALL 按最新赔率与风控规则计算兑现值，金库对应记账。
3. WHEN 杠杆持仓触及强平条件 THEN 系统 SHALL 强平并把损失限定在保证金内，金库承接对应盈亏。
4. IF 赛事取消/改判 THEN 系统 SHALL 暂停、回滚或重新结算，并保持 AXP 守恒。

### Requirement 8: 合规、准入与披露

**User Story:** 作为平台，我需要在用积分阶段也设置准入与风险披露，控制合规风险。

#### Acceptance Criteria
1. THE v1 SHALL 将 AXP 设为不可提现、仅站内用途，并在 LSM 内显著披露风险与「非投资建议」。
2. THE 系统 SHALL 复用 Agentrix `kyc`/`compliance` 对地域/资格做门禁，受限主体禁止下注与出资。
3. WHERE 升级为稳定币标的 THE 系统 SHALL 以独立开关与法务评审为前置，不在 v1 默认开启。
4. THE 文案 SHALL 提供 zh/en 双语。

### Requirement 9: 可观测、对账与运营

**User Story:** 作为运营，我需要金库与盘口的可观测面板与对账。

#### Acceptance Criteria
1. THE 系统 SHALL 提供金库面板：bankroll、NAV、份额、利用率、未结敞口、累计 PnL、LP 名册。
2. THE 系统 SHALL 提供日终对账：AXP 守恒校验、金库权益=份额×NAV 校验、未结预留=各盘口最坏赔付之和校验。
3. THE 系统 SHALL 复用大赛反作弊信号（对敲/多账号）思路对 LSM 做风控视图。

### Requirement 10: 资产可升级抽象

**User Story:** 作为架构，我希望资金标的可从 AXP 平滑切换到稳定币。

#### Acceptance Criteria
1. THE 资金读写 SHALL 经统一「资产适配层」抽象（AXP 适配器 v1；稳定币适配器 v2），引擎不直接耦合具体标的。
2. WHEN 切换标的 THEN 盘口/金库/结算引擎 SHALL 无需改动核心逻辑，仅切换适配器与开关。

### Requirement 11: 双金库模式（官方金库 + 用户自建金库，参考 Hyperliquid）

**User Story:** 作为 LP，我希望既能存入平台官方金库，也能存入/创建用户自建金库当主理人，机制参考 Hyperliquid 的双金库模型。

#### Acceptance Criteria
1. THE 系统 SHALL 提供**官方金库**作为默认对手方，承接所有未被用户金库订阅的盘口；官方金库无主理人分成，盈亏全归其 LP。
2. WHEN 合格用户创建**用户自建金库** THEN 系统 SHALL 要求主理人投入并持续维持最低自有份额（skin-in-game，默认 ≥ 5%，可配置）；不满足则禁止开放存入或承接下注。
3. THE 用户金库主理人 SHALL 可设置利润分成比例（默认 10%、设上限，可配置），且分成 SHALL 仅在金库净值创**高水位**时对超出部分计提，亏损未回补期间不计提。
4. WHEN 存入方向任一金库存入 THEN 该笔出资 SHALL 在锁定期（默认 24h，可配置）内不可赎回；赎回另受可用流动性与结算临界窗口禁赎约束。
5. THE 每个用户金库 SHALL 拥有**独立**的 bankroll/预留/盈亏/敞口上限；某用户金库的亏损 SHALL 不波及其他金库或官方金库（隔离），且其 LP 至多损失出资。
6. WHEN 盘口需要对手方 THEN 承接路由 SHALL 按已订阅用户金库的费率竞价与容量选入承接名单，并允许**多个金库 + 官方金库按容量比例分摊**同一盘口的对手方敞口；每笔下注按比例拆分到各承接金库，各自独立预留/结算；官方金库兜底剩余比例。
7. WHEN 主理人申请退出 THEN 系统 SHALL 限制其自有份额不得赎回至低于最低自有份额（除非走「关闭金库」流程：停止承接新单、结清未结、按 NAV 返还全部存入方后清算）。
8. THE 金库列表 SHALL 向用户展示两类金库的 NAV、历史收益、利用率、主理人与分成、锁定期等关键条款，供其选择存入。

## Out of Scope（本期不含）
- Betfair 式 P2P 撮合 / 挂单簿（留待后续）。
- 稳定币标的、多链充提/金库（沿用 KMarket 既有设计后续接入，需法务前置）。
- 把 KMarket Rust 后端整体迁移（仅复用赔率采集服务 + 算法/设计 IP）。
