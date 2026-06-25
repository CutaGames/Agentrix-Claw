# Agent 三系统融合架构 — 设计文档

> 日期: 2026-07 | 状态: 待实施

---

## 一、现状分析

### 三个独立的 Agent 系统

```
┌────────────────────────┐     ┌────────────────────────┐     ┌────────────────────────┐
│   UserAgent            │     │   AgentAccount         │     │   OpenClawInstance     │
│   (user_agents)        │     │   (agent_accounts)     │     │   (openclaw_instances) │
│                        │     │                        │     │                        │
│   社交存在层           │     │   经济身份层           │     │   AI 运行时层         │
│   - personality        │     │   - creditScore        │     │   - instanceUrl        │
│   - systemPrompt       │     │   - spendingLimits     │     │   - instanceToken      │
│   - channelBindings    │     │   - mpcWalletId        │     │   - capabilities       │
│   - delegationLevel    │     │   - easAttestationUid  │     │   - personality        │
│   - memoryConfig       │     │   - erc8004SessionId   │     │   - relayToken         │
│   - capabilities       │     │   - apiKey             │     │   - isPrimary          │
│   - slug               │     │   - agentUniqueId      │     │                        │
│                        │     │   - metadata           │     │   metadata:            │
│   被 Mobile 创建       │     │     .teamTemplateSlug  │     │     .agentAccountId    │
│   但不参与聊天 ❌      │     │     .codename          │     │   (软链接)             │
└────────────────────────┘     └────────────────────────┘     └────────────────────────┘
        │                              │                              │
        │  无 FK                       │  无 FK                       │
        └──────────────────────────────┴──────────────────────────────┘
```

### 核心断裂点

| 操作 | 发生了什么 | 缺什么 |
|------|-----------|--------|
| Mobile "创建 Agent" | 创建 `UserAgent` | 无 AgentAccount（无经济能力）、无 OpenClawInstance（无 AI 能力） |
| Team 一键创建 | 创建 `AgentAccount[]` | 无 UserAgent（不在 Mobile Agent 列表）、无 OpenClawInstance（无法聊天） |
| OpenClaw 聊天 | 使用 `OpenClawInstance` | 与 UserAgent 完全无关；和 AgentAccount只有 metadata 软链接 |
| Mobile Agent 列表 | 读 `/agent-presence/agents` → `UserAgent[]` | 看不到 AgentAccount、也看不到 OpenClawInstance |

**结论：用户在三个入口看到三套不同的"Agent"，体验割裂。**

---

## 二、架构决策

### 推荐方案：OpenClaw Instance 作为主 Agent

**为什么不是替换 agent-presence？**
- agent-presence (UserAgent) 有有价值的字段：channelBindings、delegationLevel、memoryConfig
- 但这些字段可以迁移到 OpenClawInstance，不需要保留 UserAgent 作为独立系统

**为什么 OpenClawInstance 是核心？**
1. **它是实际的 AI 大脑** — 聊天（`/openclaw/proxy/:id/stream`）、语音、技能全走它
2. **已被用户感知** — AgentConsoleScreen 显示 OpenClaw 实例
3. **已有 personality/capabilities** — 和 UserAgent 重叠
4. **Cloud 类型可自动配置** — 新增 Agent 不需要用户自己部署

**AgentAccount 保持独立的原因：**
1. 经济身份是不同的关注点（钱包/信用/链上）
2. 不是每个 Agent 都需要经济能力
3. Team 成员身份自然对应 AgentAccount
4. 关系是 `1:1 nullable`（一个 OpenClawInstance 可选地拥有一个 AgentAccount）

### 融合后的数据模型

```
┌─────────────────────────────────────────────┐
│         OpenClawInstance (主 Agent)          │
│         = 用户创建/看到/交互的 Agent         │
│                                             │
│  ── 运行时（已有） ──                        │
│  instanceUrl, instanceToken, instanceType   │
│  capabilities, personality, isPrimary       │
│  relayToken, relayConnected                 │
│                                             │
│  ── 社交存在（从 UserAgent 迁入） ──         │
│  systemPrompt       (已有 personality)       │
│  channelBindings    (Telegram/Discord/…)     │
│  delegationLevel    (observer→autonomous)    │
│  memoryConfig       (scope/retention/auto)   │
│  slug               (URL 友好标识)           │
│  defaultModel       (偏好模型)               │
│                                             │
│  ── 经济链接（新增 FK） ──                   │
│  agentAccountId     (FK → agent_accounts)    │
│                                             │
└─────────────┬───────────────────────────────┘
              │ FK (nullable)
              ▼
┌─────────────────────────────────────────────┐
│         AgentAccount (经济层)               │
│         = Agent 的钱包/信用/链上身份        │
│                                             │
│  creditScore, spendingLimits, mpcWalletId   │
│  easAttestationUid, erc8004SessionId        │
│  apiKey, agentUniqueId                      │
│  metadata.teamTemplateSlug (团队成员标识)    │
│  metadata.codename (角色代号)               │
│                                             │
└─────────────────────────────────────────────┘

UserAgent (user_agents)
→ 保留表但标记废弃
→ 不再新建
→ 现有数据通过迁移脚本关联到 OpenClawInstance
```

### Team 组建变化

**现在：**
```
provisionTeam() → 创建 N 个 AgentAccount → 结束（无AI能力）
```

**融合后：**
```
provisionTeam() → 创建 N 个 AgentAccount
                → 每个 AgentAccount 自动创建 OpenClawInstance (CLOUD 类型)
                → OR 用户选择已有 OpenClawInstance 绑定到角色
```

**用户把已有 OpenClaw 实例加入团队的流程：**
```
1. 用户进入 Team Dashboard
2. 看到团队角色列表（来自 AgentAccount）
3. 某个角色显示"未绑定实例"
4. 点击 → 选择已有的 OpenClaw 实例
5. 后端：agentAccount.metadata.openclawInstanceId = selected
6.        openclawInstance.agentAccountId = agentAccount.id
7. 该 Agent 立即具备 AI 聊天能力
```

---

## 三、修复优化 TODO 清单

### 阶段一：基础链接（后端 + 数据迁移）

| # | 任务 | 优先级 | 说明 |
|---|------|--------|------|
| 1.1 | OpenClawInstance 新增列 | P0 | `agentAccountId (FK, nullable)`, `systemPrompt`, `channelBindings (jsonb)`, `delegationLevel (enum)`, `memoryConfig (jsonb)`, `slug`, `defaultModel` |
| 1.2 | 数据迁移脚本 | P0 | 将 `openclaw_instances.metadata.agentAccountId` 软链接迁移到正式 FK 列 |
| 1.3 | provisionTeam 增强 | P0 | 创建 AgentAccount 时同时创建 OpenClawInstance (CLOUD 类型)，互相绑定 |
| 1.4 | 统一 Agent API | P0 | 新增 `GET /agents/unified` → JOIN 三表数据返回统一视图 |
| 1.5 | bindInstanceToTeamRole | P1 | 新增 `POST /agent-teams/:teamSlug/roles/:codename/bind-instance` |

### 阶段二：Mobile UI 融合

| # | 任务 | 优先级 | 说明 |
|---|------|--------|------|
| 2.1 | Agent 列表改用统一 API | P0 | AgentAccountScreen / MyAgentsScreen 改为调 `/agents/unified` |
| 2.2 | 创建 Agent 流程统一 | P0 | "创建 Agent" → 先创建 OpenClawInstance (CLOUD) → 可选创建 AgentAccount |
| 2.3 | Team Dashboard 绑定实例 UI | P1 | 角色卡片增加"绑定实例"按钮，弹出用户的 OpenClaw 实例列表供选择 |
| 2.4 | Agent 详情页融合 | P1 | AgentConsoleScreen 显示：实例状态 + 经济信息 + 社交频道配置 |
| 2.5 | 从 Agent 列表直接聊天 | P1 | 统一 Agent 列表 → 点击 → 直接进入该 OpenClaw 实例的聊天 |
| 2.6 | 废弃 agentPresenceAccount 服务 | P2 | 逐步替换为统一 API 调用 |

### 阶段三：深度整合

| # | 任务 | 优先级 | 说明 |
|---|------|--------|------|
| 3.1 | 聊天内显示经济信息 | P2 | 聊天界面顶部显示 Agent 信用分/余额/限额 |
| 3.2 | Agent 间通讯 | P2 | Team 内的 Agent 可以互相发消息/委派任务 |
| 3.3 | UserAgent 表清理 | P3 | 迁移完成后停止写入 user_agents，仅保留读取兼容 |
| 3.4 | 频道自动绑定 | P3 | 从 OpenClawInstance 直接管理 Telegram/Discord 频道绑定 |
| 3.5 | Agent Marketplace | P3 | 基于统一的 Agent 身份对外发布 Agent 服务 |

---

## 四、迁移注意事项

1. **DB_SYNC=false** — 所有 schema 变更必须用 SQL migration，不能自动同步
2. **不删数据** — `user_agents` 表保留，仅停止新建
3. **双写过渡期** — 新统一 API 可同时读旧表数据
4. **Mobile 向后兼容** — 旧版 App 仍调 `/agent-presence/agents`，保持可用
5. **两条聊天路径同步** — `/openclaw/proxy/:id/stream` 和 `/claude/chat` 都要支持新字段

---

## 五、关键 SQL 变更预览

```sql
-- 1.1 OpenClawInstance 新增列
ALTER TABLE openclaw_instances
  ADD COLUMN agent_account_id UUID REFERENCES agent_accounts(id) ON DELETE SET NULL,
  ADD COLUMN system_prompt TEXT,
  ADD COLUMN channel_bindings JSONB DEFAULT '[]',
  ADD COLUMN delegation_level VARCHAR(20) DEFAULT 'assistant',
  ADD COLUMN memory_config JSONB,
  ADD COLUMN slug VARCHAR(150),
  ADD COLUMN default_model VARCHAR(100);

CREATE INDEX idx_openclaw_instances_agent_account_id ON openclaw_instances(agent_account_id);
CREATE INDEX idx_openclaw_instances_slug ON openclaw_instances(slug);

-- 1.2 迁移 metadata 软链接到正式 FK
UPDATE openclaw_instances
SET agent_account_id = (metadata->>'agentAccountId')::uuid
WHERE metadata->>'agentAccountId' IS NOT NULL
  AND (metadata->>'agentAccountId')::uuid IN (SELECT id FROM agent_accounts);
```
