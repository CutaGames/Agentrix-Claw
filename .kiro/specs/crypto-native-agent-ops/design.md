# Design Document

> Crypto-Native Agent Ops（滩头专项）· 技术设计
> 范围:本设计**优先覆盖 P0**(散户:尽调/监控/安全/被雇佣;项目方:S0/S1/贯穿;底座:浏览器锚定/分级审批/结算/AgentAccount 打通),
> P1(桌面 GUI 加固、空投协助、S2/S3 辅助、Agent 团队产品化)给出架构占位,细节在后续迭代展开。

## Overview

本专项不是从零起盘,而是**在既有平台资产上接线 + 补缺口**。核心策略:
- **复用**:Agent 实体(`openclaw_instance` + `AgentAccount`)、分级授权(payment `PolicyEvaluatorService` / `desktopAgentSync`)、
  浏览器 CDP(`desktop/src-tauri/src/computer_use/cdp_eval.rs`)、结算 rail(`relayer.service` BSC testnet + Commission 合约 + `split-tree-generator`)、
  托管(`agent_hire_escrow`)、团队(`agent-team.service.provisionTeam` + `AgentTeamTemplate`)、计量(`user_subscription_usage`)、后台任务(BullMQ + `@Cron`)。
- **补缺口**:AgentAccount 经济身份层的「自动闭环」(需求 7)、面向 crypto 的浏览器任务编排器与尽调引擎(需求 8)、
  分级审批向 crypto/浏览器场景的扩展(需求 3)、监控调度与安全防护(需求 9/10)。

**两条能力路径(关键设计约束):**
- **浏览器 CDP 锚定(可靠,P0 主力)** — DOM 级 `evaluate`/选择器点击/导航,用于尽调、监控、安全、增长运营。
- **原生桌面 GUI(P1)** — 需先补坐标 grounding / 窗口聚焦 / 分级审批(需求 4),P0 不依赖。

## Architecture

```
┌────────────────────────── 客户端(桌面/移动/Web)──────────────────────────┐
│  Agent 控制台 / 任务面板 / 交付物查看 / 审批 sheet / 用量看板                │
└───────────────┬───────────────────────────────────────────┬──────────────┘
                │ (CDP 浏览器自动化在桌面端本地执行)          │ REST/SSE
   ┌────────────▼────────────┐                  ┌────────────▼─────────────────────┐
   │ Desktop Agent Runtime    │                  │ Backend: 新模块 agent-ops          │
   │ (Tauri + computer_use)   │                  │  - TaskOrchestrator(任务编排)      │
   │  - cdp_eval(navigate/    │  任务/结果       │  - DueDiligenceEngine(尽调,需求8) │
   │    eval/click_selector)  │◄───────────────► │  - MonitorScheduler(@Cron,需求9)  │
   │  - 原生 GUI(P1 grounding)│                  │  - SecurityGuard(需求10)          │
   │  - 分级审批执行点         │                  │  - DeliverableStore(交付物)       │
   └─────────────────────────┘                  └───┬───────────────┬──────────────┘
                                                     │               │
                         ┌───────────────────────────▼──┐   ┌────────▼───────────────────┐
                         │ ApprovalPolicy(扩展自          │   │ AgentEconomy(打通 AgentAccount│
                         │ PolicyEvaluatorService,需求3) │   │ 需求7)+ Settlement(需求5)    │
                         │  risk 分级 + 会话/任务预算授权  │   │ relayer/commission/escrow/AXP │
                         └───────────────────────────────┘   └───────────────────────────────┘
                         ┌───────────────────────────────────────────────────────────────────┐
                         │ 项目方:TeamProvisioning(agent-team)+ DeliveryPackages(需求13-15)   │
                         │  + Subscription/Rental/Escrow 计费(需求17,P1 产品化)               │
                         └───────────────────────────────────────────────────────────────────┘
```

**新增后端模块:** `backend/src/modules/agent-ops/`(编排 + 尽调 + 监控 + 安全 + 交付物 + 项目方交付包)。
**桌面侧:** 复用 `computer_use` 浏览器工具 + 新增「任务执行器」对接后端编排。

## Components and Interfaces

### C1. AgentAccount 经济身份打通(需求 7)

**目标:把 🟡/🔴 字段接成自动闭环。** 不改实体结构(列已存在),主要补「写入事件钩子 + 定时任务 + 钱包/链上/密钥服务」。

- **额度联动(A 组)**:在结算出口统一挂钩。`relayer.service`(QuickPay/链上)、`agent_hire_escrow` release、`commission` 分账完成处
  统一调用 `AgentAccountService.recordSpending(agentId, amount, success)`。引入幂等键(结算事件 id)防重复计数。
  → 接口:`recordSpending(agentId, amount, success, idempotencyKey)`。
- **额度重置(B 组)**:新增 `AgentAccountResetScheduler`(`@Cron`),按 `limitResetDate` + UTC 重置 `usedTodayAmount`/`usedMonthAmount`,
  漏跑用「上次重置时间 < 今日」补偿。参考 `developer-account` 已有 scheduler 模式。
- **信用评分(C 组)**:在 escrow release(成功)/ dispute refund(失败)/ 任务失败处调用 `updateCreditScore(delta, reason)`;
  `riskLevel` 由 creditScore 阈值映射(low ≥700 / medium 500-699 / high 300-499 / critical <300,阈值可配)。
- **钱包绑定(D 组)**:新增 `AgentWalletService`:托管走 MPC 供应商适配器(`MpcWalletProvider` 接口,实现待选 Fireblocks/Circle/Turnkey 等,默认占位);
  外部钱包走签名验证(复用 `wallet.service` 的 ethers `verifyMessage`)。绑定失败事务回滚。
- **链上身份(E 组)**:新增 `AgentOnchainIdentityService`:ERC-8004 注册(复用 `agent-authorization` + relayer 提交)写回 session/tx/chain;
  EAS attestation 适配器。失败降级「链下身份」,不阻塞。**默认 BSC testnet,上主网为开关项**。
- **密钥(F 组)**:`AgentKeyService`:激活时生成密钥对,`publicKey`+`apiKeyPrefix` 入库,secret 仅签发时一次性返回(只存 `apiSecretHash`);
  agent 代付/被调用验签复用 `agent-execute-payment` 已有 `ethers.verifyMessage` 路径。
- **能力门控(G 组)**:确立 `AgentAccount.capabilities` 为**单一权威来源**,`openclaw_instance`/skill 侧门控从中派生;
  未声明工具调用在执行层(`skill-executor` / desktop tool gating)拒绝。
- **前台(H 组)**:Agent 详情 DTO 增加各能力「真实状态」枚举(enabled/not_enabled/failed),前端按状态展示,不空占位。

### C2. 浏览器自动化任务编排器(需求 2)

- **`TaskOrchestrator`**:接收结构化任务(目标 + 步骤计划),驱动「截图/读取 → LLM 决策 → CDP 动作 → 回执」循环。
- **执行落点在桌面端**(用户本地 Chrome,隔离 profile),后端只下发任务计划 + 收集结果(经现有桌面↔后端通道)。
- **锚定优先级**:`browser_eval`(JS 读取 DOM)> `click_selector`(选择器)>(P1)像素点击。失败返回结构化原因(选择器未命中/超时/结构变化)允许重试或降级。
- **可审计轨迹**:每步动作(目标/动作/结果/时间)落库 `agent_ops_action_log`。

### C3. 分级审批(需求 3)

- **复用并扩展 `PolicyEvaluatorService`**(payment 模块已有 `evaluatePolicy → {authorized, suggestedAction}`)。
- **风险分级映射**:只读(screenshot/navigate/eval-read/选择器读)= 自动;中风险(发布/点击/输入/导航新域)= 策略+预算;
  高风险(交易签名/转账/新收款地址/对外发布/批量操作)= 人确认;红线(终端/sudo/sybil/wash trading)= Rust `redlines.rs` + 后端红线拒绝(不可绕过)。
- **会话/任务预算授权**:新增 `ApprovalGrant`(scope=session|task,预算上限,过期时间);在范围内自动放行,超出回落人确认。复用 `requireDesktopActionApproval` 作为人确认 UI。

### C4. 尽调报告引擎(需求 8)

- **`DueDiligenceEngine`**:输入(token/钱包/合约/项目)→ 数据源采集插件集(区块浏览器/DEX/CEX/官方渠道/审计源,均**只读**)→ 归一 → 结构化报告。
- **采集插件**:`DataSourcePlugin` 接口(name/fetch(target)/sourceUrl);失败跳过并标「未获取」,**禁止编造**(LLM prompt + 校验层双保险)。
- **合格校验器 `DeliverableValidator`**:依据需求 8「验收清单」逐项检查(A 必备 6 项 + B 真实性门槛);任一缺失/违反 → 不合格。
- **交付物**:`Deliverable` 实体(归属 agent、可保存/分享/复用、采集时间戳、来源链接)。
- **指标采集**:记录 自主完成率 / 质量合格率(抽检)/ 时延,供需求 18 北极星。

### C5. 监控告警 + 安全防护(需求 9/10)

- **`MonitorScheduler`(`@Cron` + BullMQ)**:周期性只读检查(价格/清算/解锁/治理/空投窗口/授权异常);命中条件 → 多端推送(复用 voice `output-dispatcher` 多端分发)。
- **`SecurityGuard`**:授权扫描(读链上 approvals)+ 风险标注 + 引导撤销(撤销交易走人确认签名);交易模拟/解读(集成模拟 RPC,如 Tenderly/anvil fork,适配器待选);地址/合约/域名骗局检查。只读为主,不代执行资金操作。

### C6. Auto-Earn / A2A 被雇佣 + 结算(需求 5/12.1)

- **挂牌**:agent 作为可被付费调用的服务(复用 x402 discovery + `agent-marketplace` listing)。
- **被调用结算**:经服务端权威定价 → `agent_hire_escrow` 或直接 USDC 结算(relayer)→ `split-tree-generator` 多跳分佣 → Commission 合约一次提交 → `recordSpending` 入账。
- **AXP** 保留为 App 内积分层,与 USDC 边界清晰(不混用余额)。

### C7. 项目方交付包 + Agent 团队(需求 13-15 P0;17 P1)

- **交付包 = 任务模板**:S0(文档/品牌/研究/审计协调)、S1(6 个增长交付包)、贯穿(监控/sybil 检测/报告)。每个含「输入→动作→交付物→量化验收→计费」。
- **sybil 检测**:只读链上行为分析服务,输出风险评分 + 可疑簇 + 依据(不替项目方处置)。
- **Agent 团队(P1 产品化)**:复用 `agent-team.provisionTeam` + `AgentTeamTemplate`;计费三模式(订阅 `user_subscription_usage` / 租赁 `pet_rental_leases` 模式 / 按结果 `agent_hire_escrow`);编排复用 `agent_tasks` 父/子 + `worktree_lanes`。

## Data Models

**复用现有(不改结构):** `AgentAccount`、`Account`、`openclaw_instance`、`agent_hire_escrow`、`pet_rental_leases`、`user_subscription_usage`、`AgentTeamTemplate`、`agent_tasks`、`worktree_lanes`、`Payment`、Commission 相关。

**新增(agent-ops 模块):**
- `agent_ops_task`:id, agentId, ownerId, type(due_diligence|monitor|security|growth_*|...), input(jsonb), status, riskTier, approvalState, createdAt。
- `agent_ops_deliverable`:id, taskId, agentId, type, content(jsonb), sourceLinks(jsonb), collectedAt, qualified(bool), qualityCheckedBy。
- `agent_ops_action_log`:id, taskId, step, target, action, result, riskTier, approvedBy, at(审计轨迹)。
- `approval_grant`:id, userId, agentId, scope(session|task), scopeId, budgetCap, used, expiresAt。
- `monitor_subscription`:id, ownerId, agentId, monitorType, condition(jsonb), interval, lastCheckedAt, lastResult, status。

**新增列(打通用,均可空 + 默认兼容):** AgentAccount 详情 DTO 的能力状态枚举(派生,不一定落列);若需持久化能力状态可加 `economic_identity_status`(jsonb)。

## Correctness Properties

系统在任何执行路径下都必须保持以下不变量(可作为属性测试/审计断言的依据):

### Property 1: 账实一致
**Validates: Requirements 7.1, 7.4**
`recordSpending` 的累计扣减与统计恰好对应已真实发生的成交;同一结算事件(idempotencyKey)不重复计数,被拒动作不记账。

### Property 2: 限额单调且不可超
**Validates: Requirements 3.1, 7.5**
任一时刻 `usedTodayAmount ≤ dailyLimit`、`usedMonthAmount ≤ monthlyLimit`(达上限即拒新支出);重置只发生在跨日/跨月边界。

### Property 3: 红线不可绕过
**Validates: Requirements 3.5, 6.2**
无论 UI 配置、策略授权、会话/任务预算如何,红线动作(终端/sudo/自身/sybil/wash trading/买粉)始终被拒绝。

### Property 4: 资金写操作必经人确认
**Validates: Requirements 3.3, 6.1**
任何交易签名/转账/新收款地址/不可逆提交在无人工确认时不得执行。

### Property 5: 托管金额守恒
**Validates: Requirements 17.14, 17.17**
escrow 中 reserved = released + refunded(无凭空增减);release ≤ min(agreedUsd, actualCostUsd)。

### Property 6: 分佣守恒
**Validates: Requirements 5.2, 5.4**
一笔成交的 商户净额 + 各方分佣 + 平台/渠道费 = 成交总额(对接 split-tree 校验)。

### Property 7: 不编造数据
**Validates: Requirements 8.5, 8.6**
尽调/报告交付物中每条关键数据要么有可核来源,要么标「未获取」;不存在无来源的杜撰数值。

### Property 8: 降级显式
**Validates: Requirements 7.18, 7.25**
钱包/链上身份/grounding 不可用时进入显式「未启用/降级」态,绝不静默伪装可用。

### Property 9: 审批范围有界
**Validates: Requirements 3.4**
`ApprovalGrant` 自动放行严格限定在其 scope + budgetCap + expiresAt 内;越界即回落人确认。

### Property 10: 密钥保密
**Validates: Requirements 6.3, 7.21**
API secret 明文仅签发时返回一次;私钥/助记词永不出现在日志/回包中。

## Error Handling

- **浏览器动作失败**:结构化原因(selector_miss/timeout/dom_changed/blocked)→ 重试(指数退避,上限)→ 降级(换选择器/换数据源)→ 仍失败则任务标 failed 并记录,不编造结果。
- **结算/记账失败**:幂等键防重复;`recordSpending` 与结算保持账实一致(失败补偿,不部分写)。
- **钱包/链上失败**:绑定/注册失败事务回滚 + 降级链下身份 + 明示用户,不阻塞基础功能。
- **审批超时**:中风险 timeout-auto 到期按策略(放行/拒绝)处理;高风险无确认即不执行。
- **数据源不可达**:跳过 + 标「未获取」,合格校验据此判定。

## Testing Strategy

- **单元**:DeliverableValidator(验收清单逐项)、ApprovalPolicy 风险分级与预算、recordSpending 幂等与账实一致、信用评分阈值→riskLevel、额度重置补偿。
- **集成**:尽调端到端(mock 数据源 → 报告 → 合格判定)、被雇佣结算 → 多跳分佣 → recordSpending 闭环、监控触发 → 多端推送。
- **合规红线测试**:sybil/wash trading/买粉等请求被拒(复用 Rust `redlines` 单测模式 + 后端红线单测)。
- **可靠性度量**:尽调任务集(20-30 例)跑自主完成率 ≥80% / 质量合格率 ≥90%(需求 18 门槛)。
- **安全敏感**:验签失败拒绝、密钥不回显、私钥最小暴露的断言测试。

## Security & Compliance

- 只读优先;资金/交易/签名/对外发布强制人确认;红线 Rust + 后端双层不可绕过。
- 不做 sybil/wash trading/买粉/无披露喊单(需求 6)。竞猜类地区+法务门控默认关。
- 私钥/助记词最小暴露、不回显;API secret 一次性签发只存哈希。
- 链上默认 testnet,上主网为显式开关 + 需合约审计 + relayer 热钱包风控(承袭 AGENTS.md 安全冻结策略)。

## Phasing(对应需求 Phasing 节)

- **P0**:C1(AgentAccount 打通)、C2(浏览器编排)、C3(分级审批)、C4(尽调)、C5(监控/安全)、C6(被雇佣结算)、C7 的交付包+sybil 检测(不含团队产品化)。
- **P1**:需求 4(桌面 GUI grounding/focus/approval)、需求 11(空投协助)、需求 16(S2/S3 辅助)、C7 的 Agent 团队三模式计费产品化(需求 17)。
- **待复核**:需求 12.3 自主策略;MPC 托管方案;链上主网;争议仲裁主体。
