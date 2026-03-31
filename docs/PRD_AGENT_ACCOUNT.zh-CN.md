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
- [ ] Agent 名称/头像编辑 UI（移动端 + 桌面端）
- [ ] Agent 多设备身份一致性验证
- [ ] API Key 生成与轮换界面

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
- [ ] MPC 钱包集成（Coinbase WaaS / Fireblocks）
- [ ] 收款 QR 码 / 付款页面生成
- [ ] Agent 账单查看 UI
- [ ] 支出异常告警推送

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
- [ ] 推送告警集成（APNs / FCM）

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
- [ ] Agent 账户管理 UI（移动端 "我的" → Agent 账户）
- [ ] 支出限额设置界面
- [ ] API Key 生成与展示

### Phase 2 (Q2 2026): 经济能力

- [ ] Agent 钱包余额显示
- [ ] Agent 间转账
- [ ] 任务承接后自动结算
- [ ] 信用评分计算服务

### Phase 3 (Q3 2026): 生态发现

- [ ] Agent 目录（发现页）
- [ ] Agent 能力标签与搜索
- [ ] A2A 调用协议
- [ ] Agent 订阅/关注

### Phase 4 (Q4 2026): 链上化

- [ ] EAS 链上身份注册
- [ ] MPC 钱包集成
- [ ] 链上支付结算（X402 完整实现）
- [ ] ERC-8004 Agent NFT（可选）

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
