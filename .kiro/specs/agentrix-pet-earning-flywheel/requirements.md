# Requirements Document

> AI 萌宠赚钱飞轮（Pet Earning Flywheel）

## Introduction

### 目标
把 Agentrix 现有但**割裂、半接线、看不见**的赚钱能力，串成一个用户能真实感知、并能真实跑起来的飞轮：

> 分享拉新 → 新用户领到一只「会赚钱的萌宠」→ 萌宠在集市接活/挂资源/参与预测市场赚到收益 → 收益在「萌宠收益中心」聚合可见且可兑付 → 用户更愿意分享 → 回到拉新。

本 spec 的硬约束（来自用户）：**前后端细节都要落地，飞轮要能真实跑起来，不允许"task 全做完却没达成目的"**。因此每条需求都必须有**端到端验证标准**（数据从产生→入账→聚合→前端可见→可兑付的完整链路，而非只交付某一层）。

### 现状勘探结论（grounded，基于真实代码）
以下是动笔前对真实代码的核实，作为 design/tasks 的事实地基：

1. **AXP 软账本事实上已是统一收入底座**（关键发现）。
   - `backend/src/modules/axp/axp.service.ts`：`AxpService.earn(input: EarnInput)` / `spend(input: SpendInput)` / `getBalance(userId)` / `listHistory(userId, limit, cursor)`。单事务原子写 `user_axp_ledger` + 更新快照 `user_axp_balances`。
   - earn 对 `IDEMPOTENT_EARN_SOURCES` 用 `refId` 做精确一次（partial unique index + 23505 兜底）；**spend 无幂等键**（缺口）。
   - `getBalance` 返回 `usd_value_cents`（既有遗留字段；**AXP 无官方法币定价，本 spec 不依赖也不展示该折算**）。
   - `axp.constants.ts` 的 `AXP_EARN_SOURCES` 已包含大量**集市赚钱线**：`task_complete`、`skin_sold`、`contest_win`、`creation_tip/unlock/purchase`、`remix_royalty`、`arena_prize`、`prediction_payout`、`lsm_payout/lsm_refund/lsm_vault_redeem`、`aeon_market_sale/aeon_wage/aeon_bounty/aeon_task`、`plot_revenue/plot_payout` 等。
   - **结论**：多数集市收入已落到同一张账本（AXP ledger），但**没有任何"按用户跨来源聚合的收益视图"**，前端也没有"我的萌宠赚了多少"的入口。

2. **拉新裂变是真实断点**：`referral_signup`(500 AXP) 与 `referral_gmv_pct` 两个 earn source 已在 `axp.constants.ts` / `user-axp-ledger.entity.ts` 定义，但**全仓 grep 无任何调用点**——定义了却从未接线。

3. **C 端收益出口断点**：AXP `spend` 出口目前只有"平台内消费抵扣"（`sub_discount`/`skill_discount`/`skin_discount`/`redeem_skin` 等），**没有 AXP→法币/链上提现的桥**。C 端"把赚的钱拿走"的通道缺失。

4. **萌宠 vs 经济主体分离**：
   - `living-pet.entity.ts`：`LivingPet`（1 user 1 只，不持钱，**有 `boundAgentAccountId` 字段**可绑定到一个 AgentAccount，注释明确"不参与经济"）。
   - `agent-account.entity.ts`：`AgentAccount`（经济主体，持 `mpcWalletId`/`defaultAccountId`/`creditScore`/`spendingLimits`/`usedTodayAmount`/统计字段）。
   - **结论**：数据层已具备"萌宠←→会赚钱的 agent"绑定的字段基础，但 UI 与统一服务层（`unified-agent` / `UnifiedAgentService`）尚未把它呈现成一只"会赚钱的萌宠"。

5. **自主赚钱半成品**：`auto-earn/` 框架在、`agent-task` 有真实后台 worker，但策略类多为 MOCK/TODO（待 design 阶段逐文件标注行号证据）。

6. **费率分散（已核实）**：`commission/financial-architecture.config.ts` **已是集市资产佣金的单一配置源**——按 `AssetType` 配 `baseRate`/`poolRate`，并有 `resolveRates(assetType, ctx)` 统一解析（含 virtual_band/web2_upstream/web3_fee 动态档）、`PROMOTER_SHARE_OF_BASE=0.2`、`EXECUTOR_SHARE_OF_POOL=0.7`/`REFERRER_SHARE_OF_POOL=0.3`、X402/scanned 各档费率常量。**真正分散的是游离在这份配置之外、各自硬编码数字的费率**：`human-commission.service`（一/二级推荐链）、`developer-revenue`(15%)、`off-ramp-commission`、multi-agent(30%) 等。统一口径 = 把这些收敛到经 `financial-architecture.config.ts` + 一个统一费率解析服务读取（见需求 9）。

7. **支付/兑付/佣金轨道已跑通（用户确认 + 已核实）**：
   - `payment/` 模块已具备完整轨道：`crypto-payment`/`crypto-rail`、`stablecoin-payment`、`x402`（`x402.service`/`x402-authorization`/`x402-metadata`）、`stripe-*`、`transak-provider`、`escrow`、`fiat-to-crypto`、`off-ramp-commission`/`on-ramp-commission`、`refund`、`withdrawal`。
   - **用户确认**：任务/资源/商品购买已通过 **BNB 测试链 USDT** / X402 / 法币通道（Stripe、Transak 测试账户）跑通，相关**佣金合约已部署到 BNB 测试链**。即"卖东西收 crypto/法币 + 佣金分账"主轨道真实可用。
   - **关键缺口（已核实）**：`withdrawal.service.createWithdrawal(merchantId, ...)` **只面向商家**（MPC 钱包 crypto→法币 off-ramp via Transak），**C 端普通用户没有收益出金通道**。但底层 crypto↔法币、MPC 钱包、USDT 轨道现成，C 端出金可在其上扩展而非从零造。

### 范围边界（关键决策——用户已拍板，记录在案）
- **D1｜收益兑付口径 → 决定：(a) 闭环 + 预留 (b) 接口**。第一期做到 **AXP→平台消费抵扣**真实闭环；同时**预留**收益→**BNB 测试链 USDT** 真实出金的接口与路线（复用 payment 现成 crypto/USDT 轨道，C 端出金扩展），第一期不强制完成真实出金。
- **D2｜萌宠自主程度 → 决定：(a) 半自主**（萌宠推荐机会 + 用户一键授权接活，`AgentAccount.spendingLimits` 做围栏）。**(b) 全自主**列为后续，其待完成工作清单见下方「附：D2(b)」。
- **D3｜第一期赚钱线覆盖 → 决定：先覆盖 ① 已落 AXP 账本的成熟线（task/skin/creation/LSM/contest/arena/prediction 等）+ ② crypto-BNB 测试链 USDT 稳定币收入线**（集市成交的 crypto 结算/佣金分账收入）。**法币线（Stripe/Transak 测试账号）暂不着急**，后续只读纳入。
- **过程约束（用户要求）**：每一步都讨论清楚再进入下一步——requirements 确认后才进 design，design 确认后才进 tasks，tasks 确认后才逐条执行。
- **D4｜LSM 预测市场切稳定币 → 决定：(乙) 独立后续阶段，不在本飞轮 spec 第一期**。LSM 维持 AXP（`AxpAssetAdapter`）；本期"crypto-BNB 测试链 USDT 收入线"来自**已跑通的集市 crypto 成交**（product/task/资源等经 payment 模块按 USDT 结算 + 佣金分账），不要求 LSM 自身切 USDT。LSM-USDT 的额外工作已勘探登记（见下「附：LSM 切稳定币额外工作」），作为后续独立 spec/阶段。

### 附：D2(b) 全自主待完成工作（后续阶段，本期不实现，仅登记）
1. **自动决策引擎**：把半自主的"推荐列表 + 人工一键"升级为"萌宠在策略约束内自动选单/下单"，需可配置策略（机会类型白名单、最低预期收益、最大风险敞口）。
2. **无人值守风控围栏**：在 `AgentAccount.spendingLimits`（单笔/日/月）之上增加按信用分动态调额、连续亏损熔断、异常行为自动暂停。
3. **资金授权模型**：全自主动用钱包资金需更强授权（ERC-4337 会话密钥 / X402 授权额度 / 链上 attestation），复用 `account-abstraction`、`agent-authorization`、`x402-authorization`。
4. **随时接管/暂停开关**：用户可一键暂停萌宠自主行为并接管，暂停后无在途自动动作。
5. **可解释与审计**：每笔自动决策留痕（为何接此单、预期/实际收益、风险评估），供复盘与申诉。
6. **回测/灰度**：全自主前先 shadow（只推荐不执行）跑一段验证胜率与收益，再分用户灰度放开真实执行。
7. **结算与对账**：自动接活的收入/成本进统一账本并参与收益中心聚合与对账，确保不产生账目漂移。

### 附：LSM 切稳定币额外工作（D4=后续独立阶段，本期不做，仅登记）
LSM 架构已为切币留好口子（`LSM_ASSET_ADAPTER` 注入令牌 + `AssetAdapter` 接口 + `StablecoinAssetAdapter` 占位 + 工厂 env 开关），引擎核心不动，但"用真钱"引出以下工作：
1. **C 端 USDT 余额来源**：建议复用/桥接 KMarket 已做好的多链 USDT 国库（`multichain-deposit-withdraw` spec 已上线 BNB Chain 等充提），而非在 Agentrix 重造。
2. **`StablecoinAssetAdapter` 实接线**：escrow/debit/credit/release 接真实 USDT 国库的链上/链下双分录 + 幂等。
3. **精度改造**：AXP 整数（`assertInt`）→ USDT 小数（L2 6 位 / BNB Chain 18 位）；`lsm.pricing.ts`/`lsm.risk-math.ts`/`lsm.vault-math.ts` 端到端改定点整数（最小单位）。
4. **金库 bankroll 模型**：官方金库"铸 1 亿 AXP"模式不可用于 USDT（不能铸）→ 需真实 USDT 本金；用户自建金库 LP 为真钱。
5. **偿付能力对账**：`lsm-reconciliation` 保证 USDT 负债≤储备。
6. **合规法务前置**：真钱博彩需 KYC/AML/司法辖区门（AXP 时代已降为 NONE，需加回）。
7. **C 端提现**：USDT 盈利可提出（与需求 5 的 C 端出金缺口同源）。
8. **前端币种感知**：AXP vs USDT 计价/小数显示、USDT 充提入口、OrderTicket/金库 USDT 计价。

## Glossary

真实实体/服务术语表（tasks 必须引用真实符号）
- AXP：`AxpService`（`axp.service.ts`）、`UserAxpLedger`（`user-axp-ledger.entity.ts`）、`UserAxpBalance`、`AXP_EARN_SOURCES`/`AXP_SPEND_SOURCES`（`axp.constants.ts`）。
- 萌宠/Agent：`LivingPet`（`living-pet.entity.ts`，`boundAgentAccountId`）、`AgentAccount`（`agent-account.entity.ts`）、`UnifiedAgentService`（`modules/unified-agent/`）。
- 集市：`unified-marketplace`（`unified-marketplace.service.ts`）、各赚钱模块（`skill`/`skill-listings`/`product`/`merchant-task`/`pet-skin`/`marketplace-pet`/`creation`/`creator-studio`/`dataset`/`leverage-sports-market`/`multi-agent`）。
- 裂变：`referral/`、`invitation/`。
- 资金出口：`payment/`、`wallet/`、`mpc-wallet/`、`withdrawal`（待 design 核实精确位置）。
- 自主：`auto-earn/`、`auto-earn-timeline/`、`agent-task/`（`AgentTaskWorker`）。
- 移动端：`src/screens/`、`src/services/`、`src/components/`（React Native + Expo）。
- 费率：`commission/financial-architecture.config.ts`。

---

## Requirements

### 需求 1：统一收益中心后端聚合层（飞轮"可见"的地基）

**用户故事**：作为用户，我想在一个地方看到我的萌宠通过所有集市渠道一共赚了多少、各来源占比、走势和可兑付余额，这样我才相信"萌宠真的在帮我赚钱"。

#### 验收标准
1. WHEN 调用 `GET /pet-earnings/summary`（鉴权用户）THEN 系统 SHALL 返回该用户的：AXP 可用余额（含 `usd_value_cents`）、累计赚取、累计消费、累计过期，数据来自 `AxpService.getBalance`（不得自造重复账本）。
2. WHEN 调用 `GET /pet-earnings/breakdown?range=7d|30d|all` THEN 系统 SHALL 按 **收入来源分类**（任务/皮肤/创作/预测市场/赛事/对赛/拉新/其他）聚合 `user_axp_ledger` 的 earn 行金额与笔数，分类映射表以 design 固化（覆盖 D3 决策的来源集合）。
3. WHEN 该用户存在 **crypto-BNB 测试链 USDT 收入**（集市成交的 crypto 结算/佣金分账，来自 commission/payment 结算记录）THEN 系统 SHALL 在 breakdown 中以**独立币种分组（USDT）**返回金额与笔数，明确标注链/币种，**不与 AXP 直接相加**（AXP 为积分不折算法币，USDT 按链上稳定币展示）。
4. WHEN 法币线（Stripe/Transak）暂不纳入（D3 决定）THEN 系统 SHALL 预留分组位但本期返回空/隐藏，不阻断其余分组。
5. WHEN 调用 `GET /pet-earnings/timeline?range=...` THEN 系统 SHALL 返回按日聚合的收益走势点（AXP 与 USDT 分序列），供前端折线图。
6. IF 用户无任何收益记录 THEN 接口 SHALL 返回零值结构而非报错（前端可渲染空态）。
7. **端到端验证**：构造测试用户，分别经 task_complete / skin_sold / lsm_payout 写入 AXP earn 行、并构造一笔 BNB 测试链 USDT 集市成交结算后，summary 的 AXP 总额 = 三笔之和、USDT 分组 = 该笔结算额，breakdown 分类与币种正确，timeline 落在正确日期桶。验证查询写入部署记录。

### 需求 2：移动端「萌宠收益中心」页面（飞轮"可见"的前端落地）

**用户故事**：作为移动端用户，我想在萌宠主界面一眼看到"今日/累计收益 + 来源拆分 + 走势 + 去兑付"，并能下钻到明细。

#### 验收标准
1. WHEN 用户进入萌宠主屏 THEN 系统 SHALL 展示一张「收益卡」：可用余额（AXP 积分）、今日新增、入口按钮"收益中心"。数据来自需求 1 接口。
2. WHEN 用户进入「收益中心」页 THEN 系统 SHALL 展示：余额头部、来源分类拆分（带占比）、收益走势折线图（复用既有 `OddsHistoryChart` 的 svg 折线模式或同等组件）、收益明细列表（分页，来自 `listHistory`）。
3. WHEN 收益走势/分类无数据 THEN 页面 SHALL 显示空态文案而非崩溃或空白。
4. WHEN 用户点击"去兑付" THEN 系统 SHALL 跳转到需求 5 的兑付入口。
5. **端到端验证**：用需求 1 的测试用户在真机/模拟器（或镜像触发的 APK build）打开页面，收益卡与收益中心数字与后端一致；APK 构建产物成功并记录 build 号。

### 需求 3：萌宠 = 会赚钱的经济主体（叙事与经济主体在 UI 层合一）

**用户故事**：作为用户，我的萌宠应该就是那个"在集市里替我赚钱的家伙"，而不是一个不碰钱的吉祥物和一个看不见的 agent 账户两张皮。

#### 验收标准
1. WHEN 用户的 `LivingPet.boundAgentAccountId` 为空 AND 用户首次进入收益/赚钱相关入口 THEN 系统 SHALL 提供"为萌宠开通赚钱能力"流程：创建或绑定一个 `AgentAccount` 并回写 `boundAgentAccountId`（幂等，不重复创建）。
2. WHEN `boundAgentAccountId` 已绑定 THEN `UnifiedAgentService` 的合并视图 SHALL 对外暴露"萌宠"维度的：绑定 agent 的钱包/可用额度、信用分、累计成交统计、收益汇总（聚合需求 1）。
3. WHEN 前端展示萌宠 THEN 名称/人格来自 `LivingPet`，赚钱能力/钱包/收益来自其绑定的 `AgentAccount`，呈现为同一只萌宠（不暴露两个独立对象给用户）。
4. IF 绑定/创建 AgentAccount 失败 THEN 系统 SHALL 不破坏 LivingPet 既有功能（陪伴功能照常），并给出可重试的错误。
5. **端到端验证**：一个尚未绑定的用户走完开通流程后，`boundAgentAccountId` 已写、合并视图返回钱包+收益、再次开通不产生第二个 AgentAccount。

### 需求 4：拉新裂变双边激励接线（飞轮"拉新"的闭环）

**用户故事**：作为用户，我分享 Agentrix（含世界杯赛事海报深链）拉来的新用户注册并消费后，我和新用户都能拿到真实可见的奖励，这样我才有动力持续分享。

#### 验收标准
1. WHEN 新用户通过带 referral 归因参数的深链完成注册 THEN 系统 SHALL 建立邀请关系，并给邀请人发 `referral_signup`(**200 AXP**)、给被邀人发新人奖励(**200 AXP**)，调用 `AxpService.earn` 且**以邀请关系 id 作为 `refId` 保证精确一次**（`referral_signup` 须纳入 `IDEMPOTENT_EARN_SOURCES`）。
2. WHEN 被邀人产生集市成交（GMV）THEN 系统 SHALL 按 `referral_gmv_pct` 给邀请人发放分成 AXP，比例 = **被邀人 GMV 的固定 2%**（`REFERRAL_GMV_RATE`，从 `financial-architecture.config.ts` 单一来源读取），且以(成交单 id)为 `refId` 幂等。
3. WHEN 同一邀请关系或同一成交被重复回调 THEN 系统 SHALL 不重复发放（幂等）。
4. WHEN 缺少有效 referral 归因 THEN 注册/成交流程 SHALL 正常完成且不发放裂变奖励（不阻断主流程）。
5. WHEN 分享海报/深链生成 THEN 深链 SHALL 携带邀请人归因码，落地页/注册能解析并透传（前后端贯通）。
6. **端到端验证**：A 生成分享深链 → B 经深链注册（双方 AXP 到账且各一笔）→ B 成交（A 收到 gmv 分成一笔）→ 重复回调不增量。链路写入部署记录。

### 需求 5：收益兑付出口（飞轮"可兑付"的闭环，范围依 D1）

**用户故事**：作为用户，萌宠赚的收益必须能真实用出去或拿出来，否则飞轮就是空转。

#### 验收标准（第一期：AXP→平台消费抵扣闭环）
1. WHEN 用户在收益中心点击"兑付" THEN 系统 SHALL 展示可用兑付方式（第一期：抵扣订阅/购买/皮肤等，复用既有 `AXP_SPEND_SOURCES` 出口）。
2. WHEN 用户用 AXP 抵扣一笔真实消费 THEN 系统 SHALL 调用 `AxpService.spend` 扣减，并**带幂等键**防止重复扣（补齐 spend 幂等缺口），按既有兑换目录/抵扣规则扣减（**不做 AXP→法币折算，AXP 无定价**）。
3. WHEN 抵扣成功 THEN 收益中心余额与明细 SHALL 实时反映扣减。
4. **端到端验证**：测试用户用 AXP 抵扣一笔订阅/购买，余额正确减少、明细新增一条 spend、重复提交不双扣。

#### 验收标准（预留：真实出金到 BNB 测试链 USDT，依 D1 = 仅预留接口/路线，本期不强制完成）
5. IF 进入真实出金阶段 THEN 系统 SHALL 复用 payment 现成轨道（`withdrawal`/`fiat-to-crypto`/`crypto-rail`/`mpc-wallet`），把当前**仅面向 merchant 的 `createWithdrawal`** 扩展出**C 端用户收益→BNB 测试链 USDT 出金**路径（含偿付能力与风控约束、幂等、链上 tx 绑定）。
6. WHERE 本期 THE 系统 SHALL 仅交付该出金路径的接口契约与设计文档（design 阶段产出），不在本期实现真实出金，确保后续可平滑接入。

### 需求 6：萌宠半自主接活赚钱（飞轮"赚到"的引擎，范围依 D2）

**用户故事**：作为用户，我希望萌宠能主动发现集市里能赚钱的机会（任务/资源需求/预测机会），推荐给我并在我授权后去完成赚到收益。

#### 验收标准（第一期：半自主——推荐 + 一键接活 + 限额围栏）
1. WHEN 萌宠（绑定的 AgentAccount）轮询集市 THEN 系统 SHALL 通过 `unified-marketplace` 拉取可接的机会（至少覆盖 merchant-task），按匹配度产出推荐列表。
2. WHEN 用户对某推荐"一键接活" THEN 系统 SHALL 在 `AgentAccount.spendingLimits` 限额内执行该任务的真实链路（接单→完成→结算），结算收入经既有 earn source（如 `task_complete`）入账，并出现在收益中心。
3. WHEN 任务执行超出单笔/日限额 THEN 系统 SHALL 拒绝并提示，不得绕过风控。
4. IF 任务执行失败 THEN 系统 SHALL 记录失败、不入账、可重试，且不影响限额已用统计的正确性。
5. **端到端验证**：测试用户授权萌宠接一个真实可结算的集市任务，完成后 `task_complete` AXP 入账并在收益中心可见；限额耗尽时被正确拦截。

#### 验收标准（预留：全自主，依 D2，后续）
6. IF D2 选择全自主 THEN 系统 SHALL 在限额+信用分围栏内自动接活无需逐笔确认，并提供随时暂停/接管开关；否则本期不做。

### 需求 7：飞轮指标与运营可观测（确保"真的在转"）

**用户故事**：作为产品/运营，我需要看到飞轮各环节的真实数据，以判断它是否真的在转、哪一环漏。

#### 验收标准
1. WHEN 查询飞轮指标 THEN 系统 SHALL 提供：拉新（referral 注册数/转化）、赚取（各来源 earn 总额/活跃赚钱用户数）、兑付（spend/提现额）、留存与分享回流的基础聚合（admin 接口或现有看板扩展）。
2. WHEN 任一环节为 0 或异常 THEN 指标 SHALL 真实反映（不注入种子/不自欺）。
3. **端到端验证**：需求 4/5/6 的测试动作发生后，飞轮指标对应环节数字相应增加。

### 需求 8：一致性、幂等与资金正确性（贯穿所有需求的非功能约束）

#### 验收标准
1. WHERE 任何 earn/spend/分成/兑付写入 THE 系统 SHALL 使用幂等键（refId）保证重复回调不重复记账；`spend` 须补齐幂等能力。
2. WHERE 涉及金额 THE 系统 SHALL 复用既有精确账本路径（AXP 整数；法币/链上沿用各自精确单位），不得新引入 f64/浮点中间层造成漏损。
3. WHERE 费率被使用 THE 系统 SHALL 从 `financial-architecture.config.ts` 单一来源读取（裂变分成、抽佣口径收敛于此），不得新增散落硬编码费率。
4. WHERE 任何新接口暴露 THE 系统 SHALL 经鉴权，且遵守 AGENTS.md 的两条 chat 路径同步等硬规则（若触及）。
5. **端到端验证**：对 earn/spend/分成接口做重复提交压测，账本无重复行、余额无漂移。

### 需求 9：统一抽佣口径（消除费率分散，保证收益数字可信）

**用户故事**：作为平台/用户，我需要全平台的抽佣/分成口径来自同一份可信配置，这样收益中心展示的"我赚了多少、平台抽了多少"才不会因为各模块各算各的而对不上。

#### 建议统一抽佣方案（具体提案，费率均可改——用户确认前为草案）
> 现状已核实：`financial-architecture.config.ts` 用 `baseRate`(平台净抽佣) + `poolRate`(激励/分销池) 按 `AssetType` 配置，`resolveRates()` 统一解析；池再分 `EXECUTOR_SHARE_OF_POOL=0.7`/`REFERRER_SHARE_OF_POOL=0.3`，promoter 拿 `PROMOTER_SHARE_OF_BASE=0.2`。游离在外的费率需收敛。

**统一模型**：每笔成交 `GMV = 卖家净收入 + 平台抽佣(base) + 激励分销池(pool)`；`pool` 按 执行 70% / 推荐 30% 分（推荐部分 = 需求 4 的 `referral_gmv_pct` 来源）。所有费率只存于 `financial-architecture.config.ts`。

| 赚钱线 | 现状费率 | 建议归口 profile | 建议总费率(base+pool) | 说明 |
|---|---|---|---|---|
| 实物商品 product | 0.5%+2.5% | PHYSICAL（不变） | 3% | 保持 |
| 服务 service | 1%+4% | SERVICE（不变） | 5% | 保持 |
| 虚拟/数字商品 | 0.5%+2.5%（2–4% band） | VIRTUAL（不变） | 3% | 保持 |
| 技能/插件 skill·dev-tool | DEV_TOOL 3%+7% **vs** developer-revenue **15%（冲突）** | 统一 DEV_TOOL | **10%（3%+7%）✅已定** | 废弃游离的 15%，统一到 DEV_TOOL 10% |
| 任务 merchant-task | 游离硬编码 5% | 归 SERVICE 或新增 TASK profile | 5% | 写进 config，数值不变 |
| 皮肤 pet-skin·marketplace-pet | 游离硬编码 5% | 归 VIRTUAL 或新增 SKIN profile | 5% | 写进 config，数值不变 |
| 创作 creation（tip/unlock/purchase） | 当前走 AXP，无显式平台抽成 | 新增 CREATION profile | **5% ✅已定** | 平台抽 5% |
| multi-agent 雇佣 | 游离硬编码 **30%** | 新增 AGENT_HIRE profile | **10% ✅已定（从 30% 下调）** | 30%→10%，降低使用门槛 |
| LSM 预测市场 | 金库利润：用户自建 10% / 官方 0% | 独立 LSM 抽佣（不走资产佣金链） | 维持现状 | 在 config 登记口径，便于对账 |
| 数据集 dataset | mock | 待定 | 占位 | 后续 |

**决策已确认（用户采纳推荐）**：① developer-revenue 15% → **统一为 DEV_TOOL 10%**；② multi-agent 雇佣 30% → **下调为 10%**；③ creation 平台抽成 = **5%**；④ 收敛过程**仅动上述三项，其余费率数值保持不变**（保护已上线 BNB 测试链佣金分账）。

#### 验收标准
1. WHEN 任一赚钱线计算平台抽佣/激励池/推荐分成 THEN 系统 SHALL 经**单一费率解析入口**（基于 `commission/financial-architecture.config.ts` 的 `resolveRates` + 一个统一 fee 解析服务）取费率，不得在业务代码内新增硬编码费率常量。
2. WHEN 现存游离费率被识别（`human-commission` 一/二级链、`developer-revenue` 15%、`off-ramp-commission`、multi-agent 30% 等）THEN 系统 SHALL 在 design 阶段逐一登记其当前值与位置，并给出收敛方案：要么并入 `financial-architecture.config.ts`（新增对应 AssetType/profile 或常量），要么由统一解析服务显式引用同一配置；收敛过程**保持现有对外费率数值不变**（除非用户明确要调整），避免改动影响已上线的 BNB 测试链佣金分账。
3. WHEN 收益中心 breakdown 展示"平台抽佣/净收入" THEN 其费率口径 SHALL 与实际结算所用费率一致（同源），可对账。
4. IF 某条线确需独立费率（业务差异）THEN 该费率 SHALL 仍登记在统一配置中（带 profile/标签），而非散落代码。
5. **端到端验证**：对每条已纳入第一期的赚钱线，验证其结算费率读取自统一配置；修改配置中某费率后，对应线的抽佣计算与收益中心展示同步变化；已上线 BNB 测试链佣金合约相关数值不被意外改动。

---

## 交付与验证总则（防"task 做完没达成目的"）
- 每个需求的"端到端验证"标准是**任务完成的判定门槛**：只交付后端或只交付前端不算完成，必须数据贯通到用户可见/可兑付。
- 后端改动按 AGENTS.md 工作流：`tsc --noEmit` + 相关 jest → SSH 部署（`git pull`+`npm run build`+`migration:run`+`pm2 restart agentrix-backend`）→ 在生产/数据库实测验证 → 记录到 `.kmdeploy/_deploy_record.md`。
- 移动端改动：镜像到 `CutaGames/Agentrix-Claw` build 分支触发 APK CI，记录 build 号，等用户真机验证。
- **web 优先轨道的移动端重验证（用户明确）**：现有支付/USDT/X402/佣金链路此前主要在 **web 端**验证过；凡本 spec 触及这些链路的能力，移动端 SHALL 单独跑一遍端到端验证（真机/APK），不得假设 web 通过即移动端通过。
- 每完成一个需求切片即可独立验证，不必等全部 task 完成才能看到飞轮的某一环真实运转。
