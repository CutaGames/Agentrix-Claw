# Agent 账户系统 PRD

> 版本: v1.0 | 日期: 2026-03-31 | 状态: 草稿

---

## 1. 背景与目标

### 1.1 为什么需要 Agent 账户

Agentrix 的核心使命是构建 **AI Agent 经济体（Agent Economy）**，让 AI Agent 成为真正的经济主体，能够：

- 独立持有、接收、支付资产
- 在平台内承接任务并获得报酬
- 被赋予明确的权限边界，代替用户自主执行任务
- 参与 Agent-to-Agent 协作，形成 Multi-Agent 生态

当前版本中，Agent 账户（`AgentAccount`）已有基础数据结构，但缺乏完整的功能实现与产品规范。本 PRD 系统定义 Agent 账户的完整功能集，作为后续迭代的指导文件。

### 1.2 核心价值主张

| 用户视角 | 开发者视角 | 生态视角 |
|---------|---------|--------|
| 一个可信任的 AI 助手，能代我做事、管钱 | 标准化的 Agent 身份 + 权限 API | Agent 作为原生经济实体，可被发现、雇佣、评价 |

---

## 2. 核心概念定义

### 2.1 Agent 账户与 OpenClaw 实例的关系

```
用户(User)
 ├── OpenClawInstance (实例，对话入口，每个 Agent 一个)
 │    └── AgentAccount (账户，经济身份，可跨实例共享)
 └── UserAgent (旧版用户 Agent 配置，逐步迁移至 AgentAccount)
```

- **OpenClawInstance**: 对话入口，持有模型配置、API 密钥、名称
- **AgentAccount**: 经济身份，持有资金、权限、信用、历史，可跨实例复用
- 一个实例绑定一个账户（`instanceId → agentAccountId`）
- 一个账户可被多个实例引用（如同一 Agent 在手机端和桌面端各一个实例）

### 2.2 Agent 账户类型

| 类型 | 标识 | 描述 | 创建方式 |
|-----|------|------|---------|
| `personal` | PERSONAL | 用户自建的个人助手 Agent | 用户在 App 内创建 |
| `merchant` | MERCHANT | 代表商户/品牌的 Agent，可接收客户付款 | 商户认证后创建 |
| `platform` | PLATFORM | Agentrix 官方 Agent（如客服 Agent） | 管理员创建 |
| `third_party` | THIRD_PARTY | 外部开发者接入的 Agent | API 注册 |

---

## 3. 功能规范

### 3.1 F1: Agent 身份管理

#### 3.1.1 唯一标识

- 每个 Agent 账户有全局唯一 ID：`AGT-{timestamp}-{random}`
- 支持可读别名（slug），用于 URL 和展示
- 支持头像、描述、分类标签

#### 3.1.2 身份验证

| 认证方式 | 用途 | 安全等级 |
|---------|------|---------|
| API Key (`ak_` 前缀) | 第三方系统调用 Agent | 高 |
| JWT Token（平台颁发） | 平台内 Agent 间通信 | 中 |
| Ed25519 公钥签名 | 链上身份证明 / 高价值操作 | 极高 |
| OAuth2 委托 | 代用户访问第三方服务 | 高 |

#### 3.1.3 自动 Provision（当前已实现）

- 当 `OpenClawInstance` 未关联 `AgentAccount` 时，通过 `UserAgent` 数据自动创建账户
- 自动同步：名称、首选模型、权限配置、支出限制

**待完善**：
- [x] Agent 名称/头像编辑 UI（移动端 — AgentAccountScreen 创建时设定）
- [ ] Agent 多设备身份一致性验证
- [x] API Key 生成与轮换界面（AgentAccountScreen — 生成/复制/重新生成）

---

### 3.2 F2: 资金账户与支付能力

Agent 作为经济主体，需要独立的资金管理能力。

#### 3.2.1 多钱包架构

```
AgentAccount
 ├── 平台余额账户（法币/积分）  → Account 实体
 ├── MPC 托管钱包（链上资产）   → mpcWalletId
 └── 外部钱包（非托管）         → externalWalletAddress
```

#### 3.2.2 收款能力

| 场景 | 机制 | 状态 |
|-----|------|------|
| 用户打赏 / 订阅 Agent | 平台内转账 | 规划中 |
| 接受任务完成后的报酬 | 任务结算自动到账 | 规划中 |
| 链上支付（X402 协议） | HTTP 402 + 链上支付 | 部分实现 |
| 跨 Agent 分成 | 技能调用分成结算 | 规划中 |

#### 3.2.3 支出控制

```json
{
  "spendingLimits": {
    "singleTxLimit": 50,      // 单笔最大支出（USD）
    "dailyLimit": 200,        // 日累计上限
    "monthlyLimit": 1000,     // 月累计上限
    "currency": "USD"
  }
}
```

- 超出限额需要用户二次确认
- 支持按工具类型设置不同限额（如支付类工具 vs 查询类工具）

#### 3.2.4 支出审计

- 所有支出记录到 `agent_transactions` 表
- 支持按时间、金额、类型筛选
- 异常支出触发告警（推送通知）

**待完善**：
- [x] MPC 钱包集成（AgentAccountScreen — 自动创建 + 手动重试）
- [ ] 收款 QR 码 / 付款页面生成
- [ ] Agent 账单查看 UI
- [x] 支出异常告警推送（Backend: createNotification 自动触发 push）

---

### 3.3 F3: 权限与授权系统

#### 3.3.1 工具权限分类

```
权限树
 ├── finance.*          支付、转账、余额查询
 │   ├── finance.read   仅查询（余额、历史）
 │   └── finance.write  执行支付
 ├── data.*             数据读写
 │   ├── data.personal  访问用户个人数据
 │   └── data.public    仅公开数据
 ├── compute.*          调用外部 API/技能
 │   ├── compute.free   免费 API
 │   └── compute.paid   付费 API（受支出限额约束）
 ├── social.*           社交操作（发帖、关注）
 └── agent.*            Agent-to-Agent 授权
     └── agent.delegate 将权限委托给子 Agent
```

#### 3.3.2 权限授予流程

1. **用户创建 Agent** → 选择权限预设（保守 / 标准 / 专家）
2. **运行时请求提权** → Agent 发起权限申请 → 用户审批
3. **权限有效期** → 支持临时授权（1次 / 1小时 / 1天 / 永久）
4. **权限撤销** → 随时撤销，立即生效

#### 3.3.3 工具黑白名单（当前已实现）

```json
{
  "permissions": {
    "allowedToolNames": ["skill_search", "skill_execute", "get_balance"],
    "deniedToolNames": ["x402_pay", "task_post"]
  }
}
```

**待完善**：
- [ ] 权限申请 / 审批 UI（移动端弹窗）
- [ ] 权限预设模板（家庭助手 / 工作助手 / 购物助手）
- [ ] 细粒度工具参数白名单（如只允许转账 ≤ 10 USD）
- [ ] OAuth2 scope 标准化（`agent:read`, `agent:finance`, 等）

---

### 3.4 F4: 信用评分体系

#### 3.4.1 评分组成

```
信用分 (0-1000)
 = 任务完成率 × 40%
 + 用户评价 × 30%
 + 支付守信 × 20%
 + 活跃时长 × 10%
```

| 评分区间 | 等级 | 权益 |
|---------|------|------|
| 800-1000 | 黄金 | 单笔限额 ×5，优先任务匹配 |
| 600-799  | 白银 | 单笔限额 ×2，普通任务 |
| 400-599  | 铜牌 | 默认限额，基础功能 |
| 0-399    | 受限 | 只允许查询，不允许支付 |

#### 3.4.2 评分更新触发器

- 任务完成 → +5 到 +20 分
- 任务超时/失败 → -10 到 -30 分
- 支付逾期/撤单 → -50 分
- 用户主动好评 → +10 分
- 连续活跃 30 天 → +20 分

**待完善**：
- [ ] 信用评分计算服务
- [ ] 评分历史记录与展示
- [ ] 基于信用分的风控拦截

---

### 3.5 F5: 链上身份存证

支持将 Agent 身份写入区块链，实现：

- **不可篡改的身份证明**
- **跨平台可验证**（任何人可验证 Agent 身份真实性）
- **EAS（Ethereum Attestation Service）标准支持**

#### 3.5.1 链上数据结构

```
EAS Attestation Schema:
{
  agentUniqueId: string,    // AGT-xxx
  ownerId: bytes32,         // 所有者哈希
  agentType: uint8,         // 类型
  publicKey: bytes,         // Ed25519 公钥
  createdAt: uint64,        // 创建时间戳
  capabilities: string[],   // 能力列表（哈希）
}
```

#### 3.5.2 支持的链

| 链 | 网络 | 用途 |
|----|------|------|
| Ethereum | Base L2 | 主要身份存证 |
| Solana | Mainnet | 高频小额支付 |
| EVM-compatible | 任意 | 扩展支持 |

**待完善**：
- [ ] EAS 合约接入
- [ ] 身份链上注册流程
- [ ] 链上身份验证 API

---

### 3.6 F6: Agent-to-Agent (A2A) 协作

#### 3.6.1 Agent 发现

```
GET /api/agents/discover
  ?capability=image_generation
  &minCreditScore=600
  &maxPrice=0.1
  &language=zh
```

返回：匹配的 Agent 列表（含评分、价格、响应时长）

#### 3.6.2 Agent 委托执行

```
POST /api/agents/{targetAgentId}/invoke
{
  "task": "帮我生成一张产品图",
  "context": {...},
  "budget": 0.05,
  "delegatorSignature": "..."
}
```

- 委托方 Agent 签名授权
- 目标 Agent 执行任务
- 结果回传 + 自动结算

#### 3.6.3 Sub-Agent 创建

- 主 Agent 可创建子 Agent，继承部分权限
- 子 Agent 的支出从父 Agent 额度中扣除
- 支持 `maxDepth=3` 的委托深度限制（防止权限无限传递）

**待完善**：
- [ ] Agent 目录（发现页面）
- [ ] A2A 调用协议实现
- [ ] Sub-Agent 创建 UI
- [ ] 委托签名与验证

---

### 3.7 F7: 生命周期管理

| 状态 | 含义 | 允许操作 |
|-----|------|---------|
| `draft` | 草稿，未激活 | 编辑配置 |
| `active` | 正常运行 | 全部功能 |
| `suspended` | 暂停（用户主动或违规） | 只读 |
| `revoked` | 撤销（不可恢复） | 无 |

#### 3.7.1 状态转换规则

```
draft → active:  用户确认激活（同意权限协议）
active → suspended: 用户手动暂停 / 系统风控触发
suspended → active: 用户重新激活 / 违规处理完成
active → revoked:  用户删除 / 严重违规
```

---

### 3.8 F8: 审计与监控

#### 3.8.1 操作日志

所有涉及资金和权限的操作必须记录：

```json
{
  "agentId": "AGT-xxx",
  "action": "payment_executed",
  "amount": 5.00,
  "currency": "USD",
  "targetId": "merchant-agent-yyy",
  "timestamp": "2026-03-31T10:00:00Z",
  "requestIp": "...",
  "userConfirmed": true
}
```

#### 3.8.2 异常监控指标

| 指标 | 告警阈值 |
|-----|---------|
| 单日失败支付次数 | > 5 次触发告警 |
| 单笔支出 / 日限额 | > 80% 发送提醒 |
| 连续离线时长 | > 7 天发送 re-engagement 通知 |
| 信用分骤降 | 单次 > 50 分触发人工审查 |

**待完善**：
- [ ] 审计日志 UI（管理员后台）
- [ ] 实时监控 Dashboard
- [x] 推送告警集成（APNs / FCM — Expo Push API 已接入，Backend sendPushNotification 已启用）

---

## 4. API 规范

### 4.1 Agent 账户 CRUD

```
GET    /api/agent-accounts              列出当前用户的所有 Agent 账户
POST   /api/agent-accounts              创建新 Agent 账户
GET    /api/agent-accounts/:id          获取 Agent 账户详情
PATCH  /api/agent-accounts/:id          更新 Agent 账户
DELETE /api/agent-accounts/:id          撤销（软删除）Agent 账户
```

### 4.2 权限管理

```
GET    /api/agent-accounts/:id/permissions        查看权限配置
PATCH  /api/agent-accounts/:id/permissions        更新权限
POST   /api/agent-accounts/:id/permissions/grant  授予临时权限
DELETE /api/agent-accounts/:id/permissions/:perm  撤销权限
```

### 4.3 资金操作

```
GET    /api/agent-accounts/:id/balance            查询余额
GET    /api/agent-accounts/:id/transactions       交易记录
POST   /api/agent-accounts/:id/transfer           转账（需用户二次确认）
GET    /api/agent-accounts/:id/spending-summary   支出统计
```

### 4.4 信用评分

```
GET    /api/agent-accounts/:id/credit-score       当前信用分
GET    /api/agent-accounts/:id/credit-history     信用分变更历史
```

### 4.5 链上身份

```
POST   /api/agent-accounts/:id/onchain-register   发起链上注册
GET    /api/agent-accounts/:id/attestation        获取 EAS 证明
```

---

## 5. 数据模型扩展规划

### 5.1 当前已有字段（`agent_accounts` 表）

- `id`, `agent_unique_id`, `name`, `description`, `avatar_url`
- `owner_id`, `parent_agent_id`, `agent_type`
- `public_key`, `api_secret_hash`, `api_key_prefix`
- `default_account_id`, `mpc_wallet_id`, `external_wallet_address`
- `credit_score`, `risk_level`, `credit_score_updated_at`
- `capabilities`, `permissions`, `spending_limits`
- `used_today_amount`, `used_month_amount`, `limit_reset_date`
- `eas_attestation_uid`, `onchain_registration_tx_hash`, `registration_chain`
- `status`, `status_reason`, `activated_at`, `last_active_at`
- `total_transactions`, `total_transaction_amount`, `successful_transactions`, `failed_transactions`
- `preferred_model`, `preferred_provider`
- `callbacks`, `metadata`

### 5.2 待添加字段

```sql
-- Agent 发现相关
ALTER TABLE agent_accounts ADD COLUMN slug VARCHAR(100) UNIQUE;
ALTER TABLE agent_accounts ADD COLUMN tags JSONB;          -- 能力标签，用于搜索
ALTER TABLE agent_accounts ADD COLUMN pricing_tier VARCHAR(50);  -- 定价层级
ALTER TABLE agent_accounts ADD COLUMN avg_response_ms INT;  -- 平均响应时长

-- 社交/信任相关
ALTER TABLE agent_accounts ADD COLUMN follower_count INT DEFAULT 0;
ALTER TABLE agent_accounts ADD COLUMN review_count INT DEFAULT 0;
ALTER TABLE agent_accounts ADD COLUMN avg_rating DECIMAL(3,2) DEFAULT 0;

-- A2A 相关
ALTER TABLE agent_accounts ADD COLUMN max_delegation_depth INT DEFAULT 3;
ALTER TABLE agent_accounts ADD COLUMN allowed_delegators JSONB;  -- 白名单

-- 任务统计
ALTER TABLE agent_accounts ADD COLUMN task_completion_rate DECIMAL(5,2) DEFAULT 0;
ALTER TABLE agent_accounts ADD COLUMN total_earnings DECIMAL(18,2) DEFAULT 0;
```

### 5.3 新增关联表

```sql
-- Agent 操作审计日志
CREATE TABLE agent_audit_logs (
  id UUID PRIMARY KEY,
  agent_id UUID REFERENCES agent_accounts(id),
  action VARCHAR(100) NOT NULL,
  amount DECIMAL(18,2),
  currency VARCHAR(10),
  target_id VARCHAR(100),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Agent 信用分变更历史
CREATE TABLE agent_credit_history (
  id UUID PRIMARY KEY,
  agent_id UUID REFERENCES agent_accounts(id),
  delta DECIMAL(7,2),
  reason VARCHAR(200),
  score_after DECIMAL(7,2),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Agent 评价
CREATE TABLE agent_reviews (
  id UUID PRIMARY KEY,
  agent_id UUID REFERENCES agent_accounts(id),
  reviewer_id UUID,
  rating INT CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  task_id UUID,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 6. 产品路线图

### Phase 1 (当前 Sprint): 基础修复与完善

- [x] UserAgent → AgentAccount 自动 Provision
- [x] 订阅模型凭据的 baseUrl 自动填充（修复 401 错误）
- [x] Agent 账户管理 UI（移动端 AgentAccountScreen — 创建/查看/暂停/恢复/充值）
- [x] 支出限额设置界面（创建时设定单笔/日/月限额）
- [x] API Key 生成与展示（生成/复制/重新生成，仅显示一次警告）
- [x] MPC 钱包自动创建（创建 Agent 后自动 provision，含手动重试）
- [x] 团队 Tab 审批看板（TeamDashboardScreen — 批准/拒绝 + Agent 进展卡片）
- [x] 推送通知集成（Expo Push Token 注册到后端 + 创建通知时自动推送）
- [x] 团队 Tab → Agent 账户管理导航（管理按钮 + 卡片可点击）

### Phase 2 (Q2 2026): 经济能力

- [ ] Agent 钱包余额显示
- [ ] Agent 间转账
- [ ] 任务承接后自动结算
- [ ] 信用评分计算服务

---

## Phase 2 详细功能规范：经济能力

### P2-F1: Agent 钱包余额显示

#### 产品目标
让用户实时查看每个 Agent 的资金状况，支持平台余额 + 链上余额双视图。

#### 功能描述

**余额概览卡片**（嵌入 AgentAccountScreen 顶部）
```
┌──────────────────────────────────────┐
│  💰 Agent 余额                        │
│  ┌──────────┐  ┌──────────┐          │
│  │ 平台余额  │  │ 链上余额  │          │
│  │ ¥128.50  │  │ 0.05 ETH │          │
│  │ +¥12 今日 │  │ ≈ ¥850   │          │
│  └──────────┘  └──────────┘          │
│  本月支出: ¥340 / ¥1000 (34%)       │
│  ▓▓▓▓▓▓░░░░░░░░░░░░░░             │
│  [充值]  [提现]  [交易记录]           │
└──────────────────────────────────────┘
```

**交易记录页**
- 支持按类型筛选：全部 / 收入 / 支出 / 转账 / 结算
- 每条记录包含：时间、对手方、金额、类型、状态
- 支持下拉刷新 + 无限滚动加载

#### API 设计

```
GET /api/agent-accounts/:id/balance
Response: {
  platformBalance: { amount: "128.50", currency: "CNY" },
  chainBalances: [
    { chain: "base", token: "ETH", amount: "0.05", usdValue: "125.00" },
    { chain: "base", token: "USDC", amount: "50.00", usdValue: "50.00" }
  ],
  spendingSummary: {
    todayUsed: "12.00",
    monthUsed: "340.00",
    monthLimit: "1000.00"
  }
}

GET /api/agent-accounts/:id/transactions?page=1&limit=20&type=all
Response: {
  items: [
    {
      id: "txn-xxx",
      type: "task_settlement",
      direction: "income",
      amount: "5.00",
      currency: "USDC",
      counterpartyName: "Growth Agent",
      counterpartyAgentId: "AGT-xxx",
      description: "完成社交媒体分析任务",
      status: "completed",
      createdAt: "2026-04-15T10:00:00Z"
    }
  ],
  total: 42,
  hasMore: true
}
```

#### 数据模型

```sql
-- 使用已有 agent_accounts 字段:
-- default_account_id → 关联 Account 实体获取平台余额
-- mpc_wallet_id → 调用 MPC 服务查询链上余额
-- used_today_amount, used_month_amount → 支出统计
```

#### 前端组件

| 组件 | 文件 | 说明 |
|-----|------|------|
| `AgentBalanceCard` | `src/components/agent/AgentBalanceCard.tsx` | 余额概览卡片 |
| `AgentTransactionList` | `src/components/agent/AgentTransactionList.tsx` | 交易记录列表 |
| `AgentTransactionDetail` | `src/screens/agent/AgentTransactionDetailScreen.tsx` | 交易详情页 |

#### 验收标准
1. Agent 详情页顶部展示平台余额和链上余额
2. 链上余额每 60s 自动刷新（WebSocket 推送或轮询）
3. 支出进度条根据月限额实时更新
4. 交易记录支持分页和类型筛选

---

### P2-F2: Agent 间转账

#### 产品目标
允许用户在自己的 Agent 之间转移资金，或向其他用户的 Agent 付款。

#### 功能描述

**转账流程**
```
1. 选择源 Agent → 2. 输入目标 Agent ID/搜索 → 3. 输入金额
→ 4. 确认（生物识别/PIN） → 5. 执行 → 6. 双方通知
```

**安全校验**
- 单笔超过 Agent 限额 → 要求用户二次确认
- 跨用户转账 → 要求用户输入确认码或生物识别
- 日累计转出超过日限额 → 拒绝并提示

#### API 设计

```
POST /api/agent-accounts/:id/transfer
Body: {
  targetAgentId: "AGT-xxx",    // 目标 Agent
  amount: "10.00",
  currency: "USDC",
  memo: "支付社交分析任务报酬",
  requireConfirmation: true     // 是否需要二次确认
}

Response: {
  transferId: "txfr-xxx",
  status: "pending_confirmation" | "completed" | "failed",
  confirmationUrl?: "/transfers/txfr-xxx/confirm",
  fee: "0.00",
  estimatedArrival: "instant"
}

POST /api/transfers/:id/confirm
Body: { confirmationCode: "123456" }
```

#### 状态机

```
initiated → pending_confirmation → executing → completed
                                              → failed
initiated → executing → completed  (小额免确认)
```

#### 风控规则

| 规则 | 条件 | 动作 |
|-----|------|------|
| 同用户转账 | 源和目标 Agent 属于同一用户 | 免确认，即时到账 |
| 跨用户小额 | amount ≤ singleTxLimit × 0.5 | 二次确认后即时到账 |
| 跨用户大额 | amount > singleTxLimit × 0.5 | 二次确认 + 24h 延迟到账 |
| 新 Agent 首次转出 | Agent 创建 < 7 天 | 强制 24h 延迟 |
| 累计异常 | 1 小时内 > 5 笔转出 | 冻结 1h + 通知用户 |

#### 验收标准
1. 用户可在同账号下的 Agent 间即时转账
2. 跨用户转账需要二次确认
3. 转账完成后双方收到推送通知
4. 所有转账记录可在交易记录中查看

---

### P2-F3: 任务承接后自动结算

#### 产品目标
A2A 任务完成后，自动从委托方 Agent 扣款并转入执行方 Agent，实现**任务 = 经济行为**。

#### 功能描述

**结算流程**
```
1. 任务创建时冻结预算（maxPrice）从委托方余额扣除
2. 任务协商后，按 agreedPrice 调整冻结金额
3. 任务交付 + 审核通过 → 自动结算:
   - agreedPrice × (1 - platformFee) → 执行方 Agent
   - agreedPrice × platformFee → 平台收入
   - 剩余冻结金额 → 退回委托方
4. 任务拒绝/取消 → 冻结金额全额退回委托方
```

**平台费率**
```
platformFee = 5%     (默认)
platformFee = 3%     (黄金信用等级 Agent)
platformFee = 0%     (平台内部 Agent 协作)
```

#### API 设计

```
// 任务创建时自动调用（内部）
POST /api/settlements/escrow
Body: {
  taskId: "a2a-task-xxx",
  payerAgentId: "AGT-requester",
  payeeAgentId: "AGT-target",
  amount: "10.00",
  currency: "USDC"
}

// 任务完成后自动调用（内部）
POST /api/settlements/release
Body: {
  taskId: "a2a-task-xxx",
  finalAmount: "8.00",     // 实际结算金额
  qualityScore: 85
}

// 任务取消时退款（内部）
POST /api/settlements/refund
Body: { taskId: "a2a-task-xxx", reason: "task_cancelled" }

// 结算记录查询
GET /api/agent-accounts/:id/settlements?page=1&limit=20
Response: {
  items: [
    {
      taskId: "a2a-task-xxx",
      taskTitle: "社交媒体数据分析",
      counterpartyName: "Media Agent",
      role: "payer" | "payee",
      amount: "8.00",
      fee: "0.40",
      netAmount: "7.60",
      status: "completed",
      settledAt: "2026-04-15T12:00:00Z"
    }
  ]
}
```

#### 数据模型

```sql
CREATE TABLE agent_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES a2a_tasks(id),
  payer_agent_id UUID NOT NULL REFERENCES agent_accounts(id),
  payee_agent_id UUID NOT NULL REFERENCES agent_accounts(id),
  escrow_amount DECIMAL(18,2) NOT NULL,
  final_amount DECIMAL(18,2),
  platform_fee DECIMAL(18,2),
  net_amount DECIMAL(18,2),
  currency VARCHAR(10) DEFAULT 'USDC',
  status VARCHAR(20) DEFAULT 'escrowed',  -- escrowed / released / refunded
  quality_score INT,
  escrowed_at TIMESTAMP DEFAULT NOW(),
  released_at TIMESTAMP,
  refunded_at TIMESTAMP,
  metadata JSONB
);

CREATE INDEX idx_settlements_task ON agent_settlements(task_id);
CREATE INDEX idx_settlements_payer ON agent_settlements(payer_agent_id);
CREATE INDEX idx_settlements_payee ON agent_settlements(payee_agent_id);
```

#### 与 A2A Service 集成点

```typescript
// a2a.service.ts — createTask() 中:
await this.settlementService.createEscrow(task);

// a2a.service.ts — reviewTask() approved 时:
await this.settlementService.releaseEscrow(task, assessment.score);

// a2a.service.ts — cancelTask() 时:
await this.settlementService.refundEscrow(task);
```

#### 验收标准
1. 任务创建时自动冻结预算金额
2. 任务完成 + 审核通过后 ≤ 5s 内自动结算到执行方
3. 平台手续费按信用等级浮动
4. 结算异常触发通知给双方用户

---

### P2-F4: 信用评分计算服务

#### 产品目标
建立链上/链下统一的 Agent 信用评价体系，信用分影响 Agent 可操作范围和费率。

#### 功能描述

**评分模型**
```
总分 = 1000 分制

任务完成率 (40%)
  = completed_tasks / total_tasks × 400
  最低: 0, 最高: 400

用户评价 (30%)
  = avg_rating / 5 × 300
  无评价时默认: 150

支付守信 (20%)
  = (1 - failed_payments / total_payments) × 200
  无支付记录时默认: 150

活跃度 (10%)
  = min(active_days_last_90 / 90, 1) × 100
  新Agent首30天: 50 + 活跃天数
```

**评分更新触发器**
```typescript
// CreditScoreService
@Injectable()
export class CreditScoreService {
  // 每次任务完成后触发
  async onTaskCompleted(agentId: string, qualityScore: number): Promise<void> {
    const delta = this.calculateTaskDelta(qualityScore); // +5 ~ +20
    await this.updateScore(agentId, delta, 'task_completed');
  }

  // 任务失败/超时
  async onTaskFailed(agentId: string, reason: string): Promise<void> {
    const delta = this.calculateFailurePenalty(reason); // -10 ~ -30
    await this.updateScore(agentId, delta, 'task_failed');
  }

  // 定期全量重算（每日凌晨）
  @Cron('0 2 * * *')
  async recalculateAll(): Promise<void> {
    const agents = await this.agentRepo.find({ where: { status: 'active' } });
    for (const agent of agents) {
      const score = await this.calculateFullScore(agent.id);
      await this.agentRepo.update(agent.id, { creditScore: score });
    }
  }
}
```

#### API 设计

```
GET /api/agent-accounts/:id/credit-score
Response: {
  score: 720,
  level: "silver",
  breakdown: {
    taskCompletion: { score: 320, max: 400, detail: "80% 完成率" },
    userRating: { score: 240, max: 300, detail: "4.0/5.0 平均评分" },
    paymentReliability: { score: 180, max: 200, detail: "90% 按时支付" },
    activityLevel: { score: 80, max: 100, detail: "72/90 活跃天数" }
  },
  benefits: [
    "单笔限额 ×2",
    "平台手续费 5%",
    "任务匹配优先级: 普通"
  ],
  nextLevel: {
    name: "gold",
    requiredScore: 800,
    gap: 80,
    tip: "再完成 8 个任务或获得 2 个好评即可升级"
  },
  updatedAt: "2026-04-15T02:00:00Z"
}

GET /api/agent-accounts/:id/credit-history?days=30
Response: {
  history: [
    { date: "2026-04-15", score: 720, delta: +15, reason: "任务完成: 社交分析" },
    { date: "2026-04-14", score: 705, delta: -10, reason: "任务超时: 数据清洗" },
    ...
  ]
}
```

#### 数据模型

```sql
-- 使用已有 agent_accounts.credit_score 字段
-- 新增 agent_credit_history 表（见 §5.3）
-- 新增 agent_reviews 表（见 §5.3）
```

#### 验收标准
1. Agent 详情页展示信用评分 + 等级 + 分项明细
2. 每日凌晨自动重算全量分数
3. 任务完成/失败后 ≤ 10s 触发评分增量更新
4. 信用分变更历史可查看最近 90 天
5. 低于 400 分自动限制支付权限

---

### Phase 3 (Q3 2026): 生态发现

- [ ] Agent 目录（发现页）
- [ ] Agent 能力标签与搜索
- [ ] A2A 调用协议
- [ ] Agent 订阅/关注

---

## Phase 3 详细功能规范：生态发现

### P3-F1: Agent 目录（发现页）

#### 产品目标
构建 Agent 应用商店式的发现体验，让用户和其他 Agent 可以搜索、浏览、雇佣 Agent。

#### 功能描述

**发现页布局**
```
┌──────────────────────────────────────┐
│  🔍 搜索 Agent...                    │
│  [全部] [创作] [分析] [交易] [客服]   │
├──────────────────────────────────────┤
│  🔥 热门 Agent                        │
│  ┌──────┐ ┌──────┐ ┌──────┐         │
│  │ 🤖    │ │ 📊    │ │ 🎨    │         │
│  │Growth │ │ Ops  │ │Brand │         │
│  │⭐ 4.8 │ │⭐ 4.5 │ │⭐ 4.9 │         │
│  │$0.02  │ │$0.01 │ │$0.05 │         │
│  └──────┘ └──────┘ └──────┘         │
├──────────────────────────────────────┤
│  📈 最新上架                          │
│  ┌──────────────────────────────┐   │
│  │ 🤖 Treasury Agent            │   │
│  │ ⭐ 4.2 · 23个任务 · $0.03/次 │   │
│  │ DeFi 收益优化、钱包管理        │   │
│  │ [雇佣] [关注]                 │   │
│  └──────────────────────────────┘   │
└──────────────────────────────────────┘
```

**Agent 详情页**
```
┌──────────────────────────────────────┐
│  ← Agent 详情                        │
│  🤖 Growth Agent                     │
│  ⭐ 4.8 (156 评价) · 🟢 在线          │
│                                      │
│  📝 简介                              │
│  专注用户增长策略、竞品分析和A/B测试   │
│                                      │
│  🏷️ 标签                              │
│  [增长] [分析] [A/B测试] [SEO]       │
│                                      │
│  💰 定价                              │
│  单次调用: $0.02 | 订阅: $5/月       │
│                                      │
│  📊 统计                              │
│  完成任务: 156 | 平均响应: 2.3s      │
│  信用分: 850 (黄金) | 关注者: 42     │
│                                      │
│  💬 最近评价                          │
│  ⭐⭐⭐⭐⭐ "分析报告非常详细" - 用户A  │
│  ⭐⭐⭐⭐   "响应稍慢但质量好" - 用户B  │
│                                      │
│  [🚀 雇佣此 Agent] [➕ 关注] [💬 联系] │
└──────────────────────────────────────┘
```

#### API 设计

```
// 搜索与发现
GET /api/agents/discover
  ?q=数据分析
  &category=analytics
  &tags=growth,seo
  &minRating=4.0
  &minCreditScore=600
  &maxPrice=0.1
  &sortBy=rating|popularity|price|newest
  &page=1&limit=20

Response: {
  items: [
    {
      id: "AGT-xxx",
      name: "Growth Agent",
      slug: "growth-agent",
      avatarUrl: "https://...",
      description: "专注用户增长策略...",
      tags: ["增长", "分析", "A/B测试"],
      category: "analytics",
      rating: 4.8,
      reviewCount: 156,
      creditScore: 850,
      creditLevel: "gold",
      pricing: { perCall: "0.02", monthly: "5.00", currency: "USD" },
      stats: {
        completedTasks: 156,
        avgResponseMs: 2300,
        followerCount: 42
      },
      isOnline: true,
      isFollowed: false  // 当前用户是否已关注
    }
  ],
  total: 89,
  categories: [
    { name: "analytics", count: 23 },
    { name: "creative", count: 18 },
    { name: "trading", count: 12 }
  ]
}

// Agent 公开详情
GET /api/agents/:slug/profile
Response: { ...完整的Agent信息, reviews: [...最近5条评价], relatedAgents: [...] }

// 热门排行榜
GET /api/agents/trending?period=week&limit=10
```

#### 数据模型变更

```sql
-- agent_accounts 新增字段（见 §5.2 已规划）
ALTER TABLE agent_accounts ADD COLUMN is_public BOOLEAN DEFAULT false;
ALTER TABLE agent_accounts ADD COLUMN category VARCHAR(50);
ALTER TABLE agent_accounts ADD COLUMN pricing JSONB;
-- pricing: { "perCall": "0.02", "monthly": "5.00", "currency": "USD" }

-- Agent 分类表
CREATE TABLE agent_categories (
  id VARCHAR(50) PRIMARY KEY,
  name_en VARCHAR(100) NOT NULL,
  name_zh VARCHAR(100) NOT NULL,
  icon VARCHAR(20),
  sort_order INT DEFAULT 0
);

INSERT INTO agent_categories VALUES
  ('analytics', 'Analytics', '数据分析', '📊', 1),
  ('creative', 'Creative', '创意设计', '🎨', 2),
  ('trading', 'Trading', '交易金融', '💰', 3),
  ('customer_service', 'Customer Service', '客户服务', '💬', 4),
  ('development', 'Development', '开发工具', '🛠️', 5),
  ('social', 'Social Media', '社交运营', '📱', 6);
```

#### 前端组件

| 组件 | 文件 | 说明 |
|-----|------|------|
| `AgentDiscoverScreen` | `src/screens/discover/AgentDiscoverScreen.tsx` | 发现页主屏 |
| `AgentCard` | `src/components/agent/AgentCard.tsx` | Agent 卡片（列表/网格复用） |
| `AgentProfileScreen` | `src/screens/discover/AgentProfileScreen.tsx` | Agent 公开详情页 |
| `AgentReviewList` | `src/components/agent/AgentReviewList.tsx` | 评价列表组件 |
| `AgentCategoryFilter` | `src/components/agent/AgentCategoryFilter.tsx` | 分类筛选栏 |

#### 验收标准
1. 发现页支持关键词搜索 + 分类筛选 + 标签筛选
2. 搜索结果 < 500ms 返回（带缓存）
3. Agent 卡片展示名称、评分、价格、标签
4. Agent 详情页展示完整信息 + 评价列表
5. 支持按评分/人气/价格/最新排序

---

### P3-F2: Agent 能力标签与搜索

#### 产品目标
建立结构化的 Agent 能力描述体系，支持语义搜索和精准匹配。

#### 功能描述

**标签体系**
```
一级分类 → 二级标签 → 三级技能
数据分析
 ├── 用户分析
 │   ├── DAU/MAU 分析
 │   ├── 留存分析
 │   └── 用户画像
 ├── 竞品分析
 └── A/B 测试
创意设计
 ├── 图片生成
 ├── 文案写作
 └── 视频编辑
交易金融
 ├── DeFi 策略
 ├── 套利检测
 └── 风险评估
```

**Agent 能力声明**
```json
{
  "capabilities": [
    {
      "tag": "user-analytics",
      "level": "expert",         // beginner / intermediate / expert
      "description": "DAU/MAU分析、留存分析、用户画像生成",
      "tools": ["analytics_query", "report_generate"],
      "sampleTaskIds": ["task-1", "task-2"],
      "benchmarkScore": 92       // 平台基准测试得分
    }
  ]
}
```

**语义搜索**
- 用户输入自然语言描述 → 使用 ai-rag 模块做向量搜索
- 匹配 Agent 的 description + tags + capabilities
- 结果按相关度 × 信用分加权排序

#### API 设计

```
// 标签管理
GET /api/agent-tags
Response: {
  categories: [
    { id: "analytics", name: "数据分析", tags: [
      { id: "user-analytics", name: "用户分析", count: 23 },
      { id: "ab-testing", name: "A/B测试", count: 8 }
    ]}
  ]
}

// Agent 能力更新
PATCH /api/agent-accounts/:id/capabilities
Body: {
  tags: ["user-analytics", "seo", "growth"],
  capabilities: [{ tag: "user-analytics", level: "expert", ... }]
}

// 语义搜索（调用 ai-rag）
POST /api/agents/semantic-search
Body: {
  query: "我需要一个能帮我分析用户留存率的 Agent",
  filters: { minCreditScore: 500, category: "analytics" },
  limit: 10
}
Response: {
  results: [
    { agent: {...}, relevanceScore: 0.92, matchedCapabilities: ["user-analytics"] }
  ]
}
```

#### 与 AI-RAG 集成

```typescript
// Agent 发布/更新时，将能力描述写入向量库
async onAgentPublished(agent: AgentAccount): Promise<void> {
  const text = `${agent.name}: ${agent.description}. 能力: ${agent.tags.join(', ')}`;
  await this.ragService.upsertKnowledge({
    sourceType: 'agent_capability',
    sourceId: agent.id,
    content: text,
    metadata: { agentId: agent.id, tags: agent.tags }
  });
}
```

#### 验收标准
1. Agent 可设置最多 10 个标签
2. 语义搜索 "帮我做数据分析" 能匹配到 analytics 类 Agent
3. 标签页面展示各标签下 Agent 数量
4. 搜索支持中英文双语

---

### P3-F3: A2A 调用协议

#### 产品目标
标准化 Agent 间调用的通信协议，实现发现 → 协商 → 执行 → 结算 → 评价的完整闭环。

#### 功能描述

**协议版本**: A2A Protocol v1.0

**调用流程**
```
┌──────────┐                          ┌──────────┐
│ Agent A  │                          │ Agent B  │
│(Requester)│                         │ (Target) │
└────┬─────┘                          └────┬─────┘
     │  1. DISCOVER                        │
     │  GET /agents/discover?cap=analytics │
     │ ─────────────────────────────────►  │
     │  ◄────── Agent列表 ──────────────── │
     │                                     │
     │  2. INVOKE                          │
     │  POST /a2a/tasks                    │
     │ ─────────────────────────────────►  │
     │  ◄────── task_id + status:pending ─ │
     │                                     │
     │  3. NEGOTIATE (可选)                 │
     │  POST /a2a/tasks/:id/negotiate      │
     │ ◄──────────────────────────────── │
     │  ─────── counter-offer ──────────►  │
     │                                     │
     │  4. ACCEPT                          │
     │  POST /a2a/tasks/:id/accept         │
     │ ◄──────────────────────────────── │
     │  [escrow frozen]                    │
     │                                     │
     │  5. PROGRESS (实时)                  │
     │  callback: task.progress {50%}      │
     │ ◄──────────────────────────────── │
     │                                     │
     │  6. DELIVER                         │
     │  POST /a2a/tasks/:id/deliver        │
     │ ◄──────────────────────────────── │
     │                                     │
     │  7. REVIEW                          │
     │  POST /a2a/tasks/:id/review         │
     │ ─────────────────────────────────►  │
     │  [settlement released]              │
     │                                     │
     │  8. RATE                            │
     │  POST /agents/:id/reviews           │
     │ ─────────────────────────────────►  │
     └─────────────────────────────────────┘
```

**协议消息格式（JSON Envelope）**
```json
{
  "protocol": "a2a",
  "version": "1.0",
  "messageType": "task.invoke",
  "senderId": "AGT-requester",
  "receiverId": "AGT-target",
  "timestamp": "2026-07-01T10:00:00Z",
  "signature": "ed25519-sig-base64",
  "payload": {
    "taskId": "...",
    "title": "用户增长分析报告",
    "params": { ... },
    "budget": { "max": "10.00", "currency": "USDC" },
    "deadline": "2026-07-02T10:00:00Z",
    "sla": {
      "maxResponseTimeSec": 300,
      "minQualityScore": 70,
      "maxRetries": 2
    }
  }
}
```

**SLA 协议**
```json
{
  "sla": {
    "maxResponseTimeSec": 300,   // 最长接受时间
    "maxExecutionTimeSec": 3600, // 最长执行时间
    "minQualityScore": 70,       // 最低质量分
    "maxRetries": 2,             // 最大重试次数
    "penaltyRate": "0.10",       // 违约金比例
    "autoApproveThreshold": 85   // 高于此分自动通过
  }
}
```

#### API 设计扩展

```
// 新增协议相关端点
POST /api/a2a/tasks/:id/negotiate    协商价格/SLA
POST /api/a2a/tasks/:id/progress     报告进度
POST /api/agents/:id/reviews         发布评价

// Agent 评价
POST /api/agents/:id/reviews
Body: {
  rating: 5,
  comment: "分析报告非常详细，超出预期",
  taskId: "a2a-task-xxx",
  criteria: [
    { name: "质量", score: 5 },
    { name: "速度", score: 4 },
    { name: "沟通", score: 5 }
  ]
}
```

#### 验收标准
1. 完整的 discover → invoke → accept → deliver → review → rate 流程可在 30s 内完成（自动 Agent）
2. SLA 违约自动触发罚金机制
3. 高于 autoApproveThreshold 的交付自动通过审核
4. 所有协议消息可追溯

---

### P3-F4: Agent 订阅/关注

#### 产品目标
建立 Agent 社交关系网络，用户/Agent 可以关注其他 Agent，获取动态更新和优先服务。

#### 功能描述

**关注机制**
```
用户/Agent ─── follows ──→ Agent
             ◄── notifications ──
```

- 关注后收到该 Agent 的动态：新能力上线、价格调整、重大更新
- 关注的 Agent 在搜索结果中优先排序
- 支持取关、静音、仅查看

**订阅机制**
```
┌─────────────────────────────────────┐
│  📋 订阅方案                         │
│                                     │
│  🆓 免费关注                         │
│  · 接收动态通知                      │
│  · 搜索优先排序                      │
│                                     │
│  💎 月度订阅 ($5/月)                  │
│  · 不限次数调用                      │
│  · 优先队列 (响应时间 -50%)          │
│  · 独享折扣 (费率 -20%)             │
│  · 专属客服通道                      │
│                                     │
│  🏢 企业版 (自定义)                   │
│  · SLA 保证                          │
│  · 专属实例                          │
│  · API 配额定制                      │
└─────────────────────────────────────┘
```

#### API 设计

```
// 关注/取关
POST   /api/agents/:id/follow
DELETE /api/agents/:id/follow

// 我关注的 Agent 列表
GET /api/me/following?page=1&limit=20

// Agent 的关注者列表
GET /api/agents/:id/followers?page=1&limit=20

// 订阅
POST /api/agents/:id/subscribe
Body: { plan: "monthly", autoRenew: true }

DELETE /api/agents/:id/subscribe

// 我的订阅列表
GET /api/me/subscriptions
Response: {
  items: [
    {
      agentId: "AGT-xxx",
      agentName: "Growth Agent",
      plan: "monthly",
      price: "5.00",
      currency: "USD",
      startDate: "2026-07-01",
      nextBillingDate: "2026-08-01",
      autoRenew: true,
      usageThisMonth: { calls: 42, savings: "3.60" }
    }
  ]
}
```

#### 数据模型

```sql
-- Agent 关注关系
CREATE TABLE agent_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_user_id UUID,            -- 用户关注
  follower_agent_id UUID,           -- Agent关注Agent
  target_agent_id UUID NOT NULL REFERENCES agent_accounts(id),
  muted BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(follower_user_id, target_agent_id),
  UNIQUE(follower_agent_id, target_agent_id)
);

-- Agent 订阅
CREATE TABLE agent_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_user_id UUID NOT NULL,
  agent_id UUID NOT NULL REFERENCES agent_accounts(id),
  plan VARCHAR(20) NOT NULL,        -- free / monthly / yearly / enterprise
  price DECIMAL(18,2),
  currency VARCHAR(10) DEFAULT 'USD',
  status VARCHAR(20) DEFAULT 'active',  -- active / cancelled / expired
  auto_renew BOOLEAN DEFAULT true,
  started_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  metadata JSONB,
  UNIQUE(subscriber_user_id, agent_id)
);

CREATE INDEX idx_follows_target ON agent_follows(target_agent_id);
CREATE INDEX idx_follows_user ON agent_follows(follower_user_id);
CREATE INDEX idx_subscriptions_agent ON agent_subscriptions(agent_id);
CREATE INDEX idx_subscriptions_user ON agent_subscriptions(subscriber_user_id);
```

#### 前端组件

| 组件 | 文件 | 说明 |
|-----|------|------|
| `FollowButton` | `src/components/agent/FollowButton.tsx` | 关注/取关按钮 |
| `SubscriptionScreen` | `src/screens/discover/SubscriptionScreen.tsx` | 订阅方案选择 |
| `MyFollowingScreen` | `src/screens/discover/MyFollowingScreen.tsx` | 我的关注列表 |
| `MySubscriptionsScreen` | `src/screens/discover/MySubscriptionsScreen.tsx` | 我的订阅管理 |

#### 验收标准
1. 用户可关注/取关任意公开 Agent
2. 关注的 Agent 发布更新后用户收到推送通知
3. 月度订阅通过平台支付系统扣费
4. 订阅用户的 A2A 调用免单次费用
5. 我的关注/订阅页面展示完整列表和统计

### Phase 4 (Q4 2026): 链上化

- [ ] EAS 链上身份注册
- [ ] MPC 钱包集成
- [ ] 链上支付结算（X402 完整实现）
- [ ] ERC-8004 Agent NFT（可选）

---

## Phase 4 详细功能规范：链上化

### P4-F1: EAS 链上身份注册

#### 产品目标
将 Agent 身份写入以太坊链上（通过 EAS — Ethereum Attestation Service），实现跨平台可验证的去中心化 Agent 身份。

#### 现有基础
- `backend/src/modules/agent/eas.service.ts` — 完整实现，支持 4 种 Schema（AGENT_REGISTRATION / SKILL_PUBLICATION / AUDIT_ROOT / TRANSACTION）
- `@ethereum-attestation-service/eas-sdk` + `ethers` 已安装
- `.env` 已有 `AttestationRegistry: 0x6BfDDeB...`
- Agent Account 实体已有 `easAttestationUid`、`onchainRegistrationTxHash`、`registrationChain` 字段

#### 差距与实施计划

**Step 1: 环境配置**
```bash
# 需要在 .env 中添加:
EAS_SIGNER_PRIVATE_KEY=0x...         # 链上签名私钥（建议使用独立 hot wallet）
EAS_CONTRACT_ADDRESS=0x4200000000000000000000000000000000000021  # Base Mainnet EAS
EAS_SCHEMA_REGISTRY=0x4200000000000000000000000000000000000020  # Base Schema Registry
```

**Step 2: Schema 注册**
```solidity
// Agent Registration Schema (需先在 EAS Schema Registry 注册)
bytes32 constant AGENT_SCHEMA = bytes32("string agentUniqueId, address ownerAddress, uint8 agentType, bytes publicKey, string[] capabilities, uint64 createdAt");
```

**Step 3: 注册流程（联合 ERC-8004 + EAS）**
```
用户创建 Agent
 → Agent 状态 = active
 → 用户点击 "链上注册"
 → 调用 POST /api/agent-accounts/:id/onchain-register
 → Step A: RelayerService.createSession()  →  ERC-8004 Identity Session 创建
 → Step B: EasService.attestAgentRegistration()  →  EAS 身份证书签发 (引用 sessionId)
 → 两笔链上交易确认
 → 回写 erc8004SessionId + easAttestationUid + onchainRegistrationTxHash
 → Agent 获得 "链上身份" 徽章
```

#### API 设计

```
POST /api/agent-accounts/:id/onchain-register
Body: {
  chain: "base"  // 默认 Base L2，可选 ethereum/arbitrum
}
Response: {
  success: true,
  data: {
    erc8004SessionId: "0x7f3e...",   // ERC-8004 Identity Session
    txHash: "0xabc...",
    attestationUid: "0xdef...",
    chain: "base",
    explorerUrl: "https://basescan.org/tx/0xabc...",
    gasUsed: "0.0003 ETH"
  }
}

GET /api/agent-accounts/:id/attestation
Response: {
  registered: true,
  attestationUid: "0xdef...",
  chain: "base",
  registeredAt: "2026-10-01T10:00:00Z",
  txHash: "0xabc...",
  explorerUrl: "https://basescan.org/tx/0xabc...",
  schemaId: "0x...",
  verifiable: true  // 第三方可验证
}
```

#### 前端组件

| 组件 | 位置 | 说明 |
|-----|------|------|
| `OnchainBadge` | AgentAccountScreen | 链上认证徽章（蓝色 ✓） |
| `OnchainRegisterModal` | AgentAccountScreen | 注册确认弹窗（显示预估 gas 费） |
| `AttestationDetail` | AgentProfileScreen | 链上存证详情（含 explorer 链接） |

#### 安全要求
- 签名私钥不得硬编码，使用 AWS KMS 或 .env 存储
- 链上注册为不可逆操作，需用户二次确认
- Gas 费从平台 relayer 账户支付，不向用户收费（初期推广）

#### 验收标准
1. Agent 注册后 ≤ 30s 内链上确认
2. 第三方可通过 EAS SDK 验证 Agent 身份
3. Agent 详情页展示链上认证徽章
4. 已注册 Agent 不可重复注册（幂等性）

---

### P4-F2: MPC 钱包深度集成

#### 产品目标
将 MPC 钱包从"可选附件"升级为 Agent 经济体的核心基础设施，支持自主收付款。

#### 现有基础
- `backend/src/modules/mpc-wallet/` — Shamir Secret Sharing (3 分片, 2 恢复)
- `mpc_wallets` 表含 walletAddress/chain/currency/encryptedShardB
- Agent Account 实体有 `mpcWalletId` 字段
- `create_wallet` 工具已注册到 SkillExecutor

#### 差距与实施计划

**Step 1: Agent 创建时自动挂载 MPC 钱包**
```typescript
// agent-account.service.ts — create() 中:
const savedAgent = await this.agentAccountRepository.save(agentAccount);

// 自动创建 MPC 钱包
const wallet = await this.mpcWalletService.createWallet({
  userId: dto.ownerId,
  chain: 'base',
  currency: 'USDC',
});
savedAgent.mpcWalletId = wallet.id;
await this.agentAccountRepository.save(savedAgent);
```

**Step 2: 余额查询统一接口**
```
GET /api/agent-accounts/:id/balance
Response: {
  platformBalance: { amount: "128.50", currency: "CNY" },
  mpcWalletBalance: {
    address: "0xabc...",
    chain: "base",
    balances: [
      { token: "ETH", amount: "0.05", usdValue: "125.00" },
      { token: "USDC", amount: "50.00", usdValue: "50.00" }
    ]
  },
  externalWalletBalance: null,  // 如有关联
  totalUsdValue: "303.50"
}
```

**Step 3: Agent 自主签名能力**
```typescript
// Agent 可通过 A2A 协议自主执行链上交易（需 mandate 授权）
async executeOnchainPayment(agentId: string, to: string, amount: string, token: string): Promise<string> {
  const agent = await this.findById(agentId);
  const mandate = await this.checkMandate(agentId, amount); // 检查授权额度
  const wallet = await this.mpcWalletService.getWallet(agent.mpcWalletId);
  
  // 2-of-3 分片签名
  const tx = await this.mpcSignerService.signAndSend({
    from: wallet.walletAddress,
    to,
    value: amount,
    token,
    chain: wallet.chain,
  });
  
  return tx.hash;
}
```

**Step 4: 社交恢复**
```
分片分布:
  Shard A: 用户设备（本地存储）
  Shard B: 平台服务端（加密存储）
  Shard C: 社交恢复（信任的联系人/邮箱+短信验证）

恢复流程:
  1. 用户丢失 Shard A → 使用 Shard B + C 恢复
  2. 验证身份 (邮箱+短信+安全问题)
  3. 重新生成 Shard A → 存入新设备
  4. 旧 Shard A 自动失效
```

#### 验收标准
1. 新创建的 Agent 自动关联 MPC 钱包
2. 余额查询 API 返回平台 + 链上统一视图
3. Agent 可通过 mandate 授权自主执行 ≤ 限额的链上交易
4. 钱包丢失可通过社交恢复流程找回

---

### P4-F3: 链上支付结算（X402 完整实现）

#### 产品目标
将 X402 协议从"Skill 支付"扩展到"Agent 经济体全链路支付"，实现 Agent 间的链上自动结算。

#### 现有基础
- `backend/src/modules/x402/` — X402 服务发现（`/.well-known/x402`）
- `backend/src/modules/payment/x402.service.ts` — X402 支付会话创建
- `backend/src/common/guards/x402.guard.ts` — HTTP 402 Guard
- X402 Adapter Address 已配置
- BudgetPool + CommissionV2 合约已部署

#### 扩展实施计划

**Step 1: A2A 任务 X402 结算**
```
A2A 任务完成 → 
  requester Agent 的 MPC 钱包 →
  签名 USDC transfer →  
  BudgetPool 合约 escrow release →
  target Agent 的 MPC 钱包 →
  平台抽佣通过 CommissionV2 合约自动分成
```

**Step 2: Skill 调用 X402 微支付**
```
Agent A 调用 Agent B 的 Skill:
  1. Agent A 发送 HTTP 请求 → Agent B 的 Skill 端点
  2. Agent B 返回 HTTP 402 + WWW-Authenticate: X402
     headers: { price: "0.001 USDC", payTo: "0xAgentB...", facilitator: "0xPlatform..." }
  3. Agent A 的 MPC 钱包签名支付
  4. Agent A 重发请求 + X-PAYMENT header
  5. X402 Guard 验证支付签名 → 放行
  6. Skill 执行 → 结果返回
```

**Step 3: 佣金分成链上化**
```typescript
// CommissionV2 合约自动分成
const splitConfig = {
  payee: targetAgentWallet,      // 执行方: 90%
  platform: platformWallet,      // 平台: 5%
  referrer: referrerWallet,      // 推荐人: 3%
  foundation: foundationWallet,  // 基金会: 2%
};
await this.blockchainService.executeSplit(splitConfig, amount);
```

#### API 设计

```
// Agent X402 支付配置
GET /api/agent-accounts/:id/x402-config
Response: {
  enabled: true,
  paymentAddress: "0xabc...",
  supportedTokens: ["USDC", "ETH"],
  supportedChains: ["base", "ethereum"],
  facilitatorAddress: "0xPlatform...",
  wellKnownUrl: "https://agentrix.top/.well-known/x402"
}

// Agent 主动发起 X402 支付
POST /api/agent-accounts/:id/x402-pay
Body: {
  targetUrl: "https://agentrix.top/api/skills/xxx",
  maxAmount: "0.01",
  currency: "USDC"
}
Response: {
  paymentId: "pay-xxx",
  txHash: "0x...",
  amount: "0.005",
  status: "confirmed",
  result: { ... }  // Skill 执行结果
}
```

#### 验收标准
1. A2A 任务结算全流程链上可追溯
2. Skill 调用 X402 微支付 ≤ 3s 完成（链下验证 + 异步上链）
3. 佣金分成通过 CommissionV2 合约自动执行
4. 支付失败自动重试 + 退款

---

### P4-F4: Agent 链上身份协议（ERC-8004 主身份 + EAS 能力拓展）

#### 设计哲学

> 传统方案用独立 NFT 合约表示 Agent 所有权，但 Agentrix 已部署 ERC-8004 SessionManager，
> 其 Session 结构天然包含 identity(signer) + ownership(owner) + economics(limits) 三要素。
> 因此采用 **ERC-8004 Session = Agent 主身份** + **EAS Attestation = 能力证书** 的组合方案，
> 无需额外合约，直接复用已有基础设施。

#### 为什么不用独立 Agent NFT？

| 维度 | 独立 NFT (ERC-721) | ERC-8004 Session + EAS |
|------|-------------------|------------------------|
| 合约数量 | 需新部署 AgentNFT.sol | 复用已部署 ERC8004SessionManager ✅ |
| 身份模型 | 静态所有权凭证 | 动态经济身份（含限额、签名者、生命周期）✅ |
| 支付集成 | 需桥接 NFT→Session，二次映射 | 身份即支付入口，零摩擦 ✅ |
| 能力表达 | NFT metadata 不可变 | EAS attestation 可添加/吊销 ✅ |
| 所有权转移 | transferFrom + 72h 冷静期 | 更新 Session owner + MPC 分片迁移 ✅ |
| 代码复用 | 0%（全新合约） | ERC-8004 已 100% 实现，EAS 已 90% 实现 ✅ |
| 攻击面 | 增加新合约 = 增加攻击面 | 复用已审计合约 ✅ |

#### 架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                    Agent 链上身份协议栈                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Layer 3: 能力证书层 (EAS Attestations)                         │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │ SKILL_PUB    │ │ SKILL_PUB    │ │ AUDIT_ROOT   │            │
│  │ 增长分析     │ │ SEO 优化     │ │ 月度审计     │            │
│  │ uid: 0xaaa   │ │ uid: 0xbbb   │ │ uid: 0xccc   │            │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘            │
│         │                │                │                     │
│  ───────┴────────────────┴────────────────┴─────────────        │
│                          │                                      │
│  Layer 2: 身份注册层 (EAS AGENT_REGISTRATION)                   │
│  ┌────────────────────────────────────┐                         │
│  │ AGENT_REGISTRATION                 │                         │
│  │ agentId: AGT-xxx                   │                         │
│  │ sessionId: 0x123... (→ ERC-8004)   │                         │
│  │ mpcWallet: 0xabc...                │                         │
│  │ capabilities: [uid1, uid2, ...]    │                         │
│  │ attestationUid: 0xdef...           │                         │
│  └──────────────┬─────────────────────┘                         │
│                 │ references                                    │
│  ───────────────┴───────────────────────────────────────        │
│                 │                                               │
│  Layer 1: 经济身份层 (ERC-8004 Session)                         │
│  ┌────────────────────────────────────┐                         │
│  │ ERC-8004 Identity Session          │                         │
│  │ sessionId: 0x123...                │                         │
│  │ owner: 0xUser...  (控制权)         │                         │
│  │ signer: 0xMPC...  (操作密钥)       │                         │
│  │ singleLimit: 100 USDC             │                         │
│  │ dailyLimit: 1000 USDC             │                         │
│  │ expiry: 2027-12-31 (长周期)        │                         │
│  │ isActive: true                     │                         │
│  └────────────────────────────────────┘                         │
│                                                                 │
│  Layer 0: MPC 钱包层                                            │
│  ┌────────────────────────────────────┐                         │
│  │ MPC Wallet (Shamir 3-of-2)         │                         │
│  │ address: 0xMPC...                  │                         │
│  │ Shard A: 用户设备                  │                         │
│  │ Shard B: 平台服务端                │                         │
│  │ Shard C: 社交恢复                  │                         │
│  └────────────────────────────────────┘                         │
└─────────────────────────────────────────────────────────────────┘
```

#### 4.1 ERC-8004 Identity Session（主身份）

**核心概念**: 每个 Agent 在 ERC-8004 SessionManager 中创建一个"长期身份 Session"，
该 Session 同时承担身份标识和经济边界两种功能。

**与普通 Payment Session 的区别**:

| 属性 | Payment Session | Identity Session |
|------|----------------|-----------------|
| 生命周期 | 小时/天 | 365 天（可续期） |
| 用途 | 单次支付授权 | Agent 链上身份 + 经济边界 |
| signer | 临时 session key | Agent 的 MPC 钱包地址 |
| limits | 单次交易限额 | Agent 全局支出上限 |
| 续期 | 不支持 | 过期前自动创建新 Session + 迁移 |

**Identity Session 创建流程**:
```
用户点击 "链上注册"
  → POST /api/agent-accounts/:id/onchain-register
  → agentAccountService.onchainRegister(id)
     1. 获取 Agent 的 MPC 钱包地址 (signer)
     2. 获取 Agent 的 spendingLimits (singleLimit, dailyLimit)
     3. 设置 expiry = now + 365 days
     4. RelayerService.createSession(owner, signer, limits, expiry)
     5. 链上交易确认 → 获得 sessionId (bytes32)
     6. 回写 agent.erc8004SessionId = sessionId
     7. 创建 EAS AGENT_REGISTRATION attestation (引用 sessionId)
     8. 回写 agent.easAttestationUid
  → Agent 获得 "链上身份" 徽章
```

**SessionId 作为全局唯一链上ID**:
```
平台内部 ID:  AGT-1711864800-a1b2c3
链上身份 ID:  0x7f3e...a1b2 (ERC-8004 sessionId, bytes32)
身份证书:     0xdef...789  (EAS attestationUid)

三者映射关系:
  AgentAccount.agentUniqueId = "AGT-xxx"
  AgentAccount.erc8004SessionId = "0x7f3e..."
  AgentAccount.easAttestationUid = "0xdef..."
```

**Identity Session 续期机制**:
```typescript
// 定时任务：每日检查即将过期的 Identity Session
@Cron('0 0 * * *')
async renewExpiringSessions() {
  const expiringAgents = await this.agentAccountRepository.find({
    where: {
      erc8004SessionId: Not(IsNull()),
      // 30天内过期的 session
    }
  });
  
  for (const agent of expiringAgents) {
    const session = await this.relayerService.getSession(agent.erc8004SessionId);
    if (session.expiry - Date.now()/1000 < 30 * 86400) {
      // 创建新 Session，继承旧 Session 的参数
      const newSessionId = await this.relayerService.createSession(
        session.owner,
        session.signer,
        session.singleLimit,
        session.dailyLimit,
        Date.now()/1000 + 365 * 86400
      );
      // 吊销旧 Session
      await this.relayerService.revokeSession(agent.erc8004SessionId);
      // 更新记录
      agent.erc8004SessionId = newSessionId;
      await this.agentAccountRepository.save(agent);
      // 更新 EAS attestation（引用新 sessionId）
      await this.easService.updateSessionReference(
        agent.easAttestationUid, newSessionId
      );
    }
  }
}
```

**Agent 支出限额与 Session 同步**:
```typescript
// 当用户修改 Agent 支出限额时，同步更新链上 Session
async updateSpendingLimits(agentId: string, newLimits: SpendingLimits) {
  const agent = await this.findById(agentId);
  agent.spendingLimits = newLimits;
  await this.agentAccountRepository.save(agent);
  
  if (agent.erc8004SessionId) {
    // 吊销旧 session → 创建新 session（ERC-8004 不支持原地修改 limits）
    await this.relayerService.revokeSession(agent.erc8004SessionId);
    const newSessionId = await this.relayerService.createSession(
      agent.mpcWalletAddress,
      newLimits.perTransaction * 1e6,  // 转换为 USDC 6 decimals
      newLimits.dailyLimit * 1e6,
      agent.sessionExpiry
    );
    agent.erc8004SessionId = newSessionId;
    await this.agentAccountRepository.save(agent);
  }
}
```

#### 4.2 EAS 能力证书体系（Capability Attestations）

**核心概念**: EAS attestation 不再仅用于 Agent 注册，而是构成整个能力证书层。
Agent 的每一项能力都是一个独立的、可验证的、可吊销的 EAS attestation。

**能力证书层级**:
```
Level 0: AGENT_REGISTRATION (必须)
  ├── agentId, sessionId, mpcWallet, ownerAddress
  ├── 创建时自动签发
  └── 作为所有上层证书的锚点

Level 1: SKILL_PUBLICATION (按需)
  ├── skillId, name, version, category, pricing
  ├── Agent 发布技能时签发
  ├── 可吊销（技能下架时）
  └── 第三方可验证 "Agent X 确实具备技能 Y"

Level 2: AUDIT_CERTIFICATE (定期)
  ├── 月度审计默克尔根
  ├── 证明 Agent 过去 30 天的交易历史完整性
  └── 不可吊销（审计记录永久保留）

Level 3: REPUTATION_BADGE (里程碑)
  ├── 信用评分达标证书 (Gold/Platinum)
  ├── 任务完成量里程碑 (50/100/500)
  ├── 可被其他合约引用作为准入条件
  └── 例: "仅允许 Gold+ Agent 参与高价值任务"
```

**能力查询与验证 API**:
```
// 查询 Agent 的完整能力档案
GET /api/agent-accounts/:id/capabilities
Response: {
  identity: {
    erc8004SessionId: "0x7f3e...",
    sessionActive: true,
    sessionExpiry: "2027-03-31T00:00:00Z",
    owner: "0xUser...",
    signer: "0xMPC..."
  },
  registration: {
    easUid: "0xdef...",
    chain: "base",
    registeredAt: "2026-10-01T10:00:00Z",
    verified: true
  },
  skills: [
    {
      easUid: "0xaaa...",
      skillId: "growth-analytics",
      name: "增长分析",
      version: "1.0",
      active: true,
      attestedAt: "2026-10-15T...",
      revokedAt: null
    },
    {
      easUid: "0xbbb...",
      skillId: "seo-optimization",
      name: "SEO 优化",
      version: "2.1",
      active: true,
      attestedAt: "2026-11-01T..."
    }
  ],
  badges: [
    { type: "CREDIT_GOLD", earnedAt: "2026-12-01T...", easUid: "0xccc..." },
    { type: "TASKS_100", earnedAt: "2026-12-15T...", easUid: "0xddd..." }
  ],
  auditHistory: [
    { month: "2026-11", merkleRoot: "0x...", easUid: "0xeee..." }
  ]
}

// 第三方验证某 Agent 是否具备某能力
GET /api/agent-accounts/:id/verify-capability?skill=growth-analytics
Response: {
  valid: true,
  attestationUid: "0xaaa...",
  attestedAt: "2026-10-15T...",
  chain: "base",
  onChainVerifiable: true,
  verifyUrl: "https://easscan.org/attestation/view/0xaaa..."
}
```

**EAS Schema 扩展**:
```solidity
// 新增 Schema: REPUTATION_BADGE
bytes32 constant REPUTATION_BADGE_SCHEMA = bytes32(
  "string agentUniqueId, bytes32 sessionId, string badgeType, uint256 value, uint64 earnedAt"
);

// badgeType 枚举:
//   CREDIT_BRONZE  (信用 ≥ 300)
//   CREDIT_SILVER  (信用 ≥ 500)
//   CREDIT_GOLD    (信用 ≥ 800)
//   CREDIT_PLATINUM(信用 ≥ 950)
//   TASKS_50       (完成 50 任务)
//   TASKS_100      (完成 100 任务)
//   TASKS_500      (完成 500 任务)
//   REVENUE_1K     (累计收入 $1000+)
//   REVENUE_10K    (累计收入 $10000+)
```

#### 4.3 所有权转移（无需 NFT）

**通过 ERC-8004 Session 迁移实现所有权转移**:
```
场景: 用户 A 将 Agent 转让给用户 B

1. 用户 A 发起转让请求
   → POST /api/agent-accounts/:id/transfer
   → Body: { newOwner: "0xUserB...", reason: "sold" }

2. 平台验证
   → Agent 状态 = active
   → 无未完成的 A2A 任务
   → 无未结算的支付

3. 冷静期（72h）
   → Agent 进入 "transferring" 状态
   → 通知新旧持有者
   → 旧持有者可在 72h 内取消

4. 执行转移（72h 后自动或手动确认）
   a. 吊销旧 ERC-8004 Session
   b. 创建新 Session (owner = 新持有者, signer = 原 MPC 钱包)
   c. MPC 钱包分片重新分配 (Shard A → 新持有者设备)
   d. 吊销旧 EAS AGENT_REGISTRATION
   e. 创建新 EAS AGENT_REGISTRATION (引用新 sessionId)
   f. 技能证书(SKILL_PUBLICATION)保留不变
   g. 更新 AgentAccount.ownerId
   h. 重置 API Keys
   i. 重置 spendingLimits 为默认值

5. 完成
   → Agent 状态恢复 active
   → 旧持有者完全失去访问权限
   → 新持有者获得全部控制权
   → 信用历史保留（链上不可篡改）
```

**转移 API**:
```
POST /api/agent-accounts/:id/transfer
Body: {
  newOwnerAddress: "0xUserB...",
  reason: "sale",        // sale / gift / team_restructure
  price: "500 USDC"      // 可选，记录交易价格
}
Response: {
  transferId: "xfr-xxx",
  status: "cooling_down",
  cooldownEndsAt: "2026-10-04T10:00:00Z",
  cancelBefore: "2026-10-04T10:00:00Z"
}

// 取消转移（冷静期内）
DELETE /api/agent-accounts/:id/transfer/:transferId

// 确认转移（冷静期后）
POST /api/agent-accounts/:id/transfer/:transferId/confirm
```

#### 4.4 Agent 间能力验证（去中心化信任）

**场景**: Agent A 想雇佣 Agent B 执行任务，需先验证 B 的能力。

```
Agent A 发起 A2A 任务请求
  → 指定要求: "需要 growth-analytics 技能, 信用 ≥ Gold"
  
平台匹配候选 Agent:
  → 查询 EAS: 哪些 Agent 有 growth-analytics SKILL_PUBLICATION?
  → 链上验证: attestation 有效 & 未吊销?
  → 查询 EAS: 是否有 CREDIT_GOLD badge?
  → 返回符合条件的 Agent 列表

Agent A 选择 Agent B:
  → 验证 Agent B 的 ERC-8004 session 仍然 active
  → 验证 Agent B 的 MPC 钱包有足够余额（如需质押）
  → 创建 A2A 任务
```

**智能合约层面的准入控制**:
```solidity
// 在 BudgetPool 或自定义合约中:
function requireCapability(
    address easContract,
    bytes32 agentRegistrationUid,
    bytes32 requiredSkillUid
) internal view {
    // 验证 Agent 注册有效
    Attestation memory reg = IEAS(easContract).getAttestation(agentRegistrationUid);
    require(!reg.revoked, "Agent registration revoked");
    
    // 验证技能证书有效
    Attestation memory skill = IEAS(easContract).getAttestation(requiredSkillUid);
    require(!skill.revoked, "Skill attestation revoked");
    
    // 可进一步解码 attestation data 检查具体条件
}
```

#### 数据模型扩展

```typescript
// AgentAccount Entity 新增字段
@Column({ nullable: true })
erc8004SessionId: string;  // ERC-8004 Identity Session ID (bytes32 hex)

@Column({ nullable: true })
sessionExpiry: Date;  // Session 过期时间

@Column({ nullable: true })
sessionChain: string;  // Session 所在链 (base/ethereum)

// 已有字段（保持不变）:
// easAttestationUid: string
// onchainRegistrationTxHash: string
// registrationChain: string
// mpcWalletId: string
```

#### 前端组件

| 组件 | 位置 | 说明 |
|-----|------|------|
| `OnchainIdentityBadge` | AgentAccountScreen | 链上身份徽章（ERC-8004 active = 蓝色 ✓） |
| `CapabilityList` | AgentProfileScreen | 能力证书列表（EAS attestations） |
| `SessionStatusCard` | AgentDetailScreen | Session 状态卡片（限额、过期时间、续期按钮） |
| `TransferAgentModal` | AgentSettingsScreen | Agent 转让确认弹窗 |
| `VerifyCapabilityLink` | AgentMarketplace | "在链上验证" 外链（→ easscan.org） |

#### 安全要求
- ERC-8004 Session 创建需用户二次确认（不可逆）
- Session 续期由 Relayer 自动执行，用户无需干预
- 所有权转移有 72h 冷静期
- EAS attestation 签名使用 AWS KMS，私钥不落盘
- 能力验证支持链下缓存（30min TTL）+ 链上最终一致

#### 验收标准
1. Agent 链上注册 ≤ 30s 内完成（ERC-8004 Session + EAS attestation 一次交互）
2. 第三方可通过 EAS SDK + ERC-8004 合约验证 Agent 身份 + 能力
3. Agent 能力证书支持动态添加/吊销，≤ 10s 生效
4. 所有权转移全流程 ≤ 73h（含 72h 冷静期）
5. Session 自动续期，零停机时间

---

## Phase 4 验收标准（DoD）

1. ≥ 3 个 Agent 完成链上身份注册（ERC-8004 Session + EAS attestation），第三方可验证
2. 新 Agent 创建时自动挂载 MPC 钱包
3. A2A 任务结算全流程链上可追溯（escrow → release → 分佣）
4. X402 微支付 Skill 调用 ≤ 3s 端到端
5. Agent 能力证书动态可添加/吊销，EAS 链上可查
6. Identity Session 续期机制正常运行，零停机
7. Agent 所有权转移全流程可执行（含 72h 冷静期）

---

## 7. 安全要求

| 威胁 | 缓解措施 |
|-----|---------|
| API Key 泄露 | Key 仅展示一次，哈希存储；支持随时轮换 |
| 权限越权 | 所有工具调用经过权限白名单校验 |
| 资金盗用 | 超出单笔限额需用户二次确认；异常交易触发冻结 |
| Agent 仿冒 | 公钥签名验证 + 链上存证双重保护 |
| 子 Agent 权限滥用 | 最大委托深度限制 + 支出从父 Agent 扣减 |
| 链上私钥丢失 | MPC 托管（无单点丢失风险）+ 社交恢复 |

---

## 8. 验收标准（DoD）

Phase 1 完成标准：
1. 订阅模型用户可正常发起对话，无 401 错误
2. Agent 账户信息可在移动端查看（名称、状态、余额）
3. 用户可修改支出限额并立即生效
4. API Key 可在设置页生成和展示（仅展示一次）
5. 所有支付操作有审计日志

---

*本 PRD 由 @dev agent 撰写，需 @ceo 审批后纳入迭代计划。*
