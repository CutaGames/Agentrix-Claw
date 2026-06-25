# Agentrix PRD V3 — 统一 Agent Presence 重构与优化方案

**版本**: 3.0
**日期**: 2026-03-16
**关联文档**:
- `docs/UNIFIED_AGENT_PRESENCE_VISION.zh-CN.md` — 愿景总纲
- `docs/SOCIAL_CHANNEL_INTEGRATION_PLAN.zh-CN.md` — 社交渠道接入方案
- `docs/PRD_V2_COMPREHENSIVE.md` — 上一版 PRD（总体完成度 68%）

---

## 一、愿景评估：现状 vs 目标

### 1.1 愿景核心诉求

UNIFIED_AGENT_PRESENCE_VISION 定义了三层产品结构：

| 层级 | 定义 | 当前实现 | 差距 |
|------|------|----------|------|
| **Agent Core** | 身份 + 记忆 + 任务状态 + 偏好 + 权限 | `user_agents` 实体有基础字段；`agent_memory` 绑定在 session 上而非 agent 上；记忆无跨 agent 共享机制 | **严重缺失** — 记忆系统以 Session 为中心，非以 Agent 为中心 |
| **Presence Surface** | 移动端 / 桌面端 / 手表 / 手环 / IoT / Telegram / Discord / 飞书等 | 移动端 82%、桌面端 92%、穿戴设备 50%（BLE Phase 1）、Telegram Bot 闭环 70%、Discord/Twitter 仅入站回调 | **部分完成** — 各端数据不互通；穿戴设备仅 BLE 扫描，无 Agent 消息通道 |
| **Policy & Delegation** | 自动执行 / 审核 / 代理参与 / Agent 间共享策略 | 桌面端有 4 级审批（L0-L3）；社交有 4 种回复策略；无 Agent 间共享策略 | **框架在，深度不够** |

### 1.2 关键差距矩阵

| 能力 | 愿景要求 | 代码现状 | 差距评级 |
|------|----------|----------|----------|
| **多 Agent 身份管理** | 用户创建多个 Agent，各自独立身份/人格 | `user_agents` 表存在，有 name/description/status/settings | 🟡 实体在，无完整 CRUD UI |
| **Agent 级记忆系统** | 每个 Agent 独立记忆，可控共享 | `agent_memory` 按 sessionId 索引，**不按 agentId** | 🔴 架构性缺陷 |
| **跨端统一时间线** | 任一入口消息进入统一时间线 | 桌面 `desktop_sessions` / 社交 `social_events` / Agent `agent_messages` 三套独立存储 | 🔴 完全割裂 |
| **社交消息归一化** | Telegram/Discord/Twitter 消息归入 Agent 会话 | `social_events` 独立表，仅有 `userId` 无 `agentId` | 🔴 未绑定 Agent |
| **Telegram 闭环** | 第一个完整 Presence 入口 | `telegram-bot.service.ts` 有完整转发链路，但绑定到 OpenClaw Instance，非 UserAgent | 🟡 可复用，需重构绑定关系 |
| **免看屏语音** | 摘要朗读 + 语音确认 + 语音回复 | 移动端 VoiceButton 录音+转写骨架；Telegram 语音转写已实现 | 🟡 基础在，需产品化 |
| **Agent 代表参与** | 分级自动回复 / 社群维护 / 定时分发 | `SocialReplyConfig` 有 4 种策略（auto/approval/notify/disabled）；无代理级别（观察/助理/代表/维护） | 🟡 需扩展 |
| **Agent 间共享策略** | 用户控制记忆/知识库/技能在 Agent 间共享 | 完全不存在 | 🔴 需全新设计 |
| **跨端 Session Handoff** | 手机说一半，桌面接着做 | `desktop-sync` 全内存 Map，重启丢失；无 handoff API | 🔴 PRD V2 已识别，未实施 |
| **穿戴设备 Presence** | 手表/手环接收 Agent 通知、语音交互、快捷确认 | WearableHubScreen 28K（BLE 扫描+配对）；BLE Gateway/Device Adapter 基础在；无 Agent 消息推送到穿戴设备 | 🟡 BLE 连接层在，缺 Agent Presence 协议 |

### 1.3 两套社交架构的问题

代码库中存在两条平行的社交链路：

**链路 A: Social Listener（social-callback.controller.ts）**
- 接收 Telegram/Discord/Twitter webhook → `social_events` 表
- 按 `SocialReplyConfig` 策略自动回复
- 移动端 `SocialListenerScreen` 展示事件和审核队列
- **问题**: 事件仅关联 userId，不关联 agentId；无统一时间线

**链路 B: Telegram Bot 直连 OpenClaw（telegram-bot.service.ts）**
- `/start <relayToken>` 绑定到 OpenClawInstance
- 消息转发到 Instance AI 引擎（本地/云端/内置）
- 语音转写 → 文本 → AI 回复 → 发回 Telegram
- **问题**: 绑定到 OpenClawInstance，不绑定到 UserAgent；和链路 A 数据不互通

**结论**: 两套链路必须统一为一条 Agent Presence 标准链路。

---

## 二、多端架构现状评估

### 2.1 后端（82 模块）— 85%

**强项**:
- 完整的 AI 多模型路由（Claude/GPT-4o/Gemini/DeepSeek/Groq）
- 完整的支付引擎（Stripe/Crypto/X402/QR/Refund/Escrow）
- 完整的协议栈（MCP/UCP/A2A/X402/ERC-8004）
- Agent Runtime 策略层/授权层/执行层/审计层/记忆层

**弱项**:
- `desktop-sync.service.ts` 全内存 Map 存储（devices/tasks/approvals）
- `agent_memory` 以 Session 为中心，非 Agent 为中心
- `social_events` 不关联 Agent
- 无统一消息总线
- `agent-negotiation.service.ts` 用内存 Map 存储协商会话
- 无 Agent 间共享策略表

### 2.2 移动端（50+ 屏幕）— 82%

**强项**:
- 8 种登录方式全部实现
- SSE 流式对话 + Thought Chain 可视化
- SocialListenerScreen 展示社交事件
- 5200+ Skills 浏览安装
- 任务集市 / 佣金仪表盘 / 推荐裂变完整

**弱项**:
- 无多 Agent 管理 UI（仅有 OpenClaw Instance 管理）
- 社交事件与主聊天不互通
- 语音仅"按住说话"，无 VAD
- 无 Agent 间共享配置页
- Desktop Control 页仅骨架

### 2.3 桌面端 — 92%（P0-P4 已完成）

**强项**:
- Tauri 2.x 双窗口架构（FloatingBall + ChatPanel）
- 多标签页聊天 + Session 持久化
- Git 集成 / 截图 / 凭证库 / 通知中心
- 代码签名 / 自动更新 / 崩溃报告 / E2E 测试 / NSIS 安装器

**弱项**:
- 无多 Agent 切换 UI
- 社交消息不在桌面端展示
- `sessionSync.ts` 全内存后端，重启丢失
- 无渠道状态监控面板
- 无 Agent 工作台（SOCIAL_CHANNEL_INTEGRATION_PLAN 要求桌面做"正式运营台"）

### 2.4 Web 前端 — 65%

**强项**:
- 首页/营销页/Marketplace/Workbench/Agent Builder 基础完成
- 双语支持

**弱项**:
- 支付组件大量空壳（Passkey/X402/多签）
- 无社交渠道管理 UI
- 无 Agent Presence 管理页面
- Admin 后台 17 页多为 mock 数据

### 2.5 综合评分（对照 Agent Presence 愿景）

```
Agent Core（身份+记忆+状态）     ████████░░░░░░░░░░░░  40%  ← 架构性缺陷
Presence Surface（多端+穿戴+IoT）  ██████████████░░░░░░  65%  ← 穿戴设备仅 BLE 扫描，无 Agent 通道
统一时间线 & 消息总线             ████░░░░░░░░░░░░░░░░  15%  ← 几乎为零
社交渠道闭环                     ████████░░░░░░░░░░░░  35%  ← 仅 Telegram 部分
Policy & Delegation              ████████████░░░░░░░░  50%  ← 框架在
Agent 间共享与协作               ██░░░░░░░░░░░░░░░░░░   5%  ← 仅有协商骨架
语音 Presence                    ██████░░░░░░░░░░░░░░  25%  ← 基础转写在
跨端协同（含穿戴设备）         ██████░░░░░░░░░░░░░░  30%  ← 穿戴设备未纳入协同体系
────────────────────────────────────────────────────────────
Agent Presence 愿景对标完成度     ████████░░░░░░░░░░░░  35%
```

---

## 三、重构方案

### 3.0 设计原则

1. **Agent 为中心** — 所有数据（记忆、会话、任务、社交事件）以 agentId 为主键，而非 sessionId 或 userId
2. **渠道无关** — 统一消息模型 `ConversationEvent`，所有渠道（聊天/社交/系统）写入同一张表
3. **不推翻现有代码** — 渐进式重构，先加中间层，再迁移旧数据
4. **Telegram First** — 第一个完整 Presence 入口验证全链路
5. **终端无关** — 手机/桌面/手表/手环/IoT 设备统一通过 `channel` 字段区分，共享同一套 Agent Core 和消息总线

### 3.1 后端重构

#### R1. Agent Core 实体升级 [P0, 2 周]

**当前 `user_agents` 表**:
```
id, userId, templateId, name, description, status, isPublished, slug, settings, metadata
```

**升级为**:
```sql
ALTER TABLE user_agents ADD COLUMN personality TEXT;           -- Agent 人格描述
ALTER TABLE user_agents ADD COLUMN system_prompt TEXT;         -- 自定义系统提示词
ALTER TABLE user_agents ADD COLUMN avatar_url VARCHAR(500);    -- Agent 头像
ALTER TABLE user_agents ADD COLUMN default_model VARCHAR(100); -- 默认模型
ALTER TABLE user_agents ADD COLUMN capabilities JSONB;         -- 启用的能力列表
ALTER TABLE user_agents ADD COLUMN channel_bindings JSONB;     -- 渠道绑定信息
ALTER TABLE user_agents ADD COLUMN memory_config JSONB;        -- 记忆配置（范围、保留策略）
ALTER TABLE user_agents ADD COLUMN delegation_level VARCHAR(20) DEFAULT 'assistant';
```

**新增 API**:
- `POST /api/agents` — 创建 Agent
- `GET /api/agents` — 列出用户所有 Agent
- `PUT /api/agents/:id` — 更新 Agent 配置
- `DELETE /api/agents/:id` — 归档 Agent
- `POST /api/agents/:id/channels/:platform` — 绑定渠道
- `DELETE /api/agents/:id/channels/:platform` — 解绑渠道

#### R2. 统一消息模型 `conversation_events` [P0, 2 周]

**新建表，替代三套独立存储**:

```sql
CREATE TABLE conversation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id UUID NOT NULL,                         -- ← 核心：绑定到 Agent
  session_id UUID,                                 -- 可选：会话内分组
  
  -- 来源渠道
  channel VARCHAR(30) NOT NULL,                    -- 'mobile' | 'desktop' | 'web' | 'watch' | 'band' | 'iot' | 'telegram' | 'discord' | 'twitter' | 'feishu' | 'system'
  channel_message_id VARCHAR(255),                 -- 渠道原始消息 ID
  
  -- 消息内容
  direction VARCHAR(10) NOT NULL,                  -- 'inbound' | 'outbound' | 'system'
  role VARCHAR(20) NOT NULL,                       -- 'user' | 'agent' | 'system' | 'external_user'
  content_type VARCHAR(20) DEFAULT 'text',         -- 'text' | 'voice' | 'image' | 'file' | 'card' | 'action'
  content TEXT NOT NULL,
  
  -- 外部发送者（社交消息）
  external_sender_id VARCHAR(255),
  external_sender_name VARCHAR(255),
  
  -- 元数据
  metadata JSONB,                                  -- 模型、token 数、延迟等
  raw_payload JSONB,                               -- 渠道原始数据
  
  -- 送达状态
  delivery_status VARCHAR(20) DEFAULT 'delivered', -- 'pending' | 'delivered' | 'failed' | 'read'
  
  -- 审批相关
  approval_status VARCHAR(20),                     -- 'auto' | 'pending' | 'approved' | 'rejected'
  approval_draft TEXT,                             -- Agent 草稿
  approved_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conv_events_agent ON conversation_events(user_id, agent_id, created_at DESC);
CREATE INDEX idx_conv_events_session ON conversation_events(session_id, created_at);
CREATE INDEX idx_conv_events_channel ON conversation_events(channel, created_at DESC);
```

**迁移策略**:
1. 新消息全部写入 `conversation_events`
2. 旧数据（`agent_messages` + `social_events` + `desktop_sessions.messages`）通过迁移脚本批量写入
3. 旧表保留 6 个月后删除

#### R3. Agent 级记忆系统 [P0, 2 周]

**当前问题**: `agent_memory` 以 `sessionId` 为主键，Session 结束记忆就死了

**重构**:

```sql
-- 升级 agent_memory 索引结构
ALTER TABLE agent_memory ADD COLUMN agent_id UUID;
ALTER TABLE agent_memory ADD COLUMN scope VARCHAR(20) DEFAULT 'session';
-- scope: 'session' | 'agent' | 'user' | 'shared'

CREATE INDEX idx_agent_memory_agent ON agent_memory(agent_id, type, created_at DESC);

-- 新增 Agent 间共享策略表
CREATE TABLE agent_share_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  source_agent_id UUID NOT NULL,
  target_agent_id UUID NOT NULL,
  share_type VARCHAR(30) NOT NULL,    -- 'memory' | 'knowledge' | 'skills' | 'contacts' | 'context'
  share_mode VARCHAR(20) NOT NULL,     -- 'full' | 'summary_only' | 'on_demand' | 'blocked'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, source_agent_id, target_agent_id, share_type)
);
```

**MemoryService 升级**:
- `saveMemory(agentId, sessionId?, scope, ...)` — 新增 agentId + scope 参数
- `getAgentMemory(agentId, type?, limit?)` — 按 Agent 检索记忆
- `getSharedMemory(agentId, sharePolicy)` — 按共享策略检索其他 Agent 的记忆
- `promoteToAgentMemory(sessionId, memoryId)` — 将 Session 记忆提升为 Agent 长期记忆

#### R4. 统一社交渠道 Adapter [P0, 3 周]

**设计一层 `ChannelAdapter` 抽象**:

```typescript
// backend/src/modules/channel/channel-adapter.interface.ts
export interface ChannelAdapter {
  platform: string;
  
  // 入站：外部消息 → ConversationEvent
  normalizeInbound(rawPayload: any): ConversationEventInput;
  
  // 出站：Agent 回复 → 平台消息
  sendOutbound(agentId: string, channelConfig: any, message: OutboundMessage): Promise<DeliveryResult>;
  
  // 渠道健康检查
  healthCheck(channelConfig: any): Promise<HealthStatus>;
}

// 实现
export class TelegramAdapter implements ChannelAdapter { ... }
export class DiscordAdapter implements ChannelAdapter { ... }
export class TwitterAdapter implements ChannelAdapter { ... }
// 未来: FeishuAdapter, WecomAdapter, SlackAdapter, WhatsAppAdapter
```

**统一入站流程**:
```
Webhook → SocialCallbackController
  → adapter.normalizeInbound(rawPayload)
  → 解析 agentId（通过 channel_bindings 反查）
  → 写入 conversation_events
  → AgentPresenceRouter.route(event)
    → 检查 delegation_level + reply_strategy
    → 自动回复 / 审核 / 仅通知 / 转发给 Agent AI 引擎
  → adapter.sendOutbound(reply)
  → 更新 delivery_status
```

#### R5. Desktop-Sync 持久化 [P0, 1 周]

（PRD V2 Phase A1 已定义，此处执行）

将 `DesktopSyncService` 中 5 个 Map 迁移到已有的 PostgreSQL 表：
- `devices` Map → Redis (TTL 5min)，仅作 presence
- `tasks` Map → `desktop_tasks` 表（已有）
- `approvals` Map → `desktop_approvals` 表（已有）
- `sessions` Map → `desktop_sessions` 表（已有）
- `commands` Map → `desktop_commands` 表（已有）

实体表已存在（`desktop-sync.entity.ts`），只需将 Service 的 Map 操作替换为 Repository 操作。

#### R6. 跨端 Session Handoff [P1, 2 周]

```typescript
// POST /api/agents/:agentId/sessions/:sessionId/handoff
interface HandoffRequest {
  fromDeviceId: string;
  toDeviceId: string;
  includeRecentMessages: number;  // 默认 20
  includeMemorySnapshot: boolean;
}

interface HandoffResponse {
  sessionId: string;
  agentId: string;
  recentMessages: ConversationEvent[];
  memorySnapshot: AgentMemory[];
  activeTasks: DesktopTask[];
  handoffAt: string;
}
```

WebSocket 广播 `session:handoff` 事件到所有已登录设备。

### 3.2 移动端重构

#### M1. Agent 管理页 [P0, 1 周]

新增 `AgentManageScreen.tsx`:
- Agent 列表（头像 + 名称 + 状态 + 最近活跃时间）
- 创建 Agent 向导（人格 / 系统提示词 / 模型 / 能力选择）
- Agent 详情 & 编辑
- Agent 间共享策略配置
- 渠道绑定管理

#### M2. 统一时间线页 [P0, 1 周]

升级 `AgentChatScreen.tsx`:
- 消息来源标签（💬 Chat / ✈️ Telegram / 🎮 Discord / 𝕏 Twitter / 🖥️ Desktop）
- 渠道消息与主聊天交织展示
- 审批操作内嵌（approve/reject/edit draft）

#### M3. Agent 切换组件 [P0, 3 天]

在聊天页顶部添加 Agent 选择器：
- 当前 Agent 头像 + 名称
- 下拉切换到其他 Agent
- 每个 Agent 显示未读消息数和最近活跃渠道

#### M4. 语音 Presence 升级 [P1, 2 周]

- 社交消息摘要朗读（长按消息 → "读给我听"）
- 语音确认发送（"回复他" → 生成草稿 → 语音确认 → 发送）
- 语音添加待办（"帮我记住xxx" → 写入 Agent 记忆）
- VAD 端点检测（连续对话）

### 3.3 桌面端重构

#### D1. Agent 工作台模式 [P1, 2 周]

ChatPanel 升级为多模式：
- **聊天模式**（现有）：对话为主
- **工作台模式**（新增）：左侧渠道列表 + 中间消息流 + 右侧上下文/记忆/任务

工作台模式包含：
- 渠道状态面板（Telegram 🟢 / Discord 🔴 / Twitter 🟡）
- 待审批队列（社交回复草稿 approve/reject/edit）
- Agent 记忆浏览器
- 快捷键批量处理

#### D2. 多 Agent Tab [P1, 1 周]

升级现有 `TabBar.tsx`：
- 每个 Tab 关联一个 Agent（而非匿名 Session）
- Tab 显示 Agent 头像 + 名称
- 跨 Tab 通知（Agent A 的 Tab 上显示 Telegram 新消息 badge）

#### D3. 渠道状态组件 [P1, 3 天]

在 ChatPanel title bar 添加渠道状态指示器：
- 各渠道连接状态图标
- 点击展开渠道详情面板
- 一键跳转到渠道配置

### 3.4 Web 前端重构

#### W1. Agent Presence Dashboard [P1, 2 周]

新增 `/dashboard/agents` 页面：
- Agent 卡片网格（状态 / 活跃渠道 / 最近消息 / 记忆条数）
- Agent 创建/编辑向导
- 渠道绑定向导（一键复制 Webhook URL / 扫码绑定 Telegram）
- Agent 间共享策略矩阵（拖拽配置）

#### W2. 渠道管理页 [P1, 1 周]

新增 `/dashboard/channels` 页面：
- 渠道接入向导（6 步标准流程）
- 渠道健康检查
- 测试消息发送
- 事件日志搜索

#### W3. 统一审核台 [P1, 1 周]

新增 `/dashboard/approvals` 页面：
- 跨渠道待审批队列
- 批量审批/拒绝
- 草稿编辑 + 一键发送
- 审核历史和统计

---

## 四、分阶段实施计划

### Phase 1: Agent Core + 统一消息 (4 周)

**目标**: 建立以 Agent 为中心的数据架构

| 任务 | 工作量 | 优先级 | 涉及端 |
|------|--------|--------|--------|
| R1. user_agents 实体升级 + CRUD API | 3 天 | P0 | 后端 |
| R2. conversation_events 统一消息表 + 写入层 | 5 天 | P0 | 后端 |
| R3. agent_memory 升级（增加 agentId + scope） | 3 天 | P0 | 后端 |
| R5. Desktop-Sync Map → DB | 3 天 | P0 | 后端 |
| M1. 移动端 Agent 管理页 | 5 天 | P0 | 移动端 |
| M3. Agent 切换组件 | 2 天 | P0 | 移动端 |
| 桌面端 Agent 选择器 | 2 天 | P0 | 桌面端 |

**验收标准**:
- 用户可创建多个 Agent，每个有独立人格和记忆
- 所有新消息写入 conversation_events，关联 agentId
- Desktop-Sync 重启不丢数据
- 移动端和桌面端可切换 Agent

### Phase 2: Telegram 第一个完整 Presence 入口 (3 周)

**目标**: 让 Telegram 成为第一个真正的 Agent Presence 渠道

| 任务 | 工作量 | 优先级 | 涉及端 |
|------|--------|--------|--------|
| R4. ChannelAdapter 抽象层 + TelegramAdapter | 5 天 | P0 | 后端 |
| 统一 Telegram Bot 绑定到 UserAgent（替代 OpenClawInstance） | 3 天 | P0 | 后端 |
| Telegram 消息写入 conversation_events | 2 天 | P0 | 后端 |
| Agent 回复走 ChannelAdapter.sendOutbound | 2 天 | P0 | 后端 |
| M2. 移动端统一时间线（社交消息 + 主聊天交织） | 5 天 | P0 | 移动端 |
| 移动端 Telegram 绑定流程升级（绑定到 Agent） | 2 天 | P0 | 移动端 |

**验收标准**:
- Telegram 消息出现在移动端该 Agent 的统一时间线中
- 在移动端的对话和 Telegram 的对话，对 Agent 来说是同一个上下文
- Agent 可根据策略自动回复 Telegram 消息
- 桌面端也能看到同一个 Agent 的 Telegram 消息

### Phase 3: 跨端协同 + 工作台 (3 周)

**目标**: 实现跨设备无缝 Agent 交互

| 任务 | 工作量 | 优先级 | 涉及端 |
|------|--------|--------|--------|
| R6. Session Handoff API + WebSocket 广播 | 5 天 | P1 | 后端 |
| 移动端实时消息同步（WebSocket 接收其他设备的消息） | 3 天 | P1 | 移动端 |
| D1. 桌面端工作台模式 | 5 天 | P1 | 桌面端 |
| D2. 多 Agent Tab | 3 天 | P1 | 桌面端 |
| D3. 渠道状态组件 | 2 天 | P1 | 桌面端 |
| W1. Web Agent Presence Dashboard | 5 天 | P1 | Web |

**验收标准**:
- 手机上和某 Agent 说到一半的话，桌面端可续接
- 桌面端工作台显示渠道状态 + 待审批 + Agent 记忆
- Web 端可管理所有 Agent 和渠道

### Phase 4: 多渠道扩展 + Policy (3 周)

**目标**: 复用框架接入更多渠道，完善策略层

| 任务 | 工作量 | 优先级 | 涉及端 |
|------|--------|--------|--------|
| DiscordAdapter 实现 | 3 天 | P1 | 后端 |
| TwitterAdapter 实现 | 3 天 | P1 | 后端 |
| Agent 间共享策略表 + API + UI | 5 天 | P1 | 全端 |
| 代理级别扩展（观察/助理/代表/维护） | 3 天 | P1 | 后端 + 移动端 |
| W2. Web 渠道管理页 | 3 天 | P1 | Web |
| W3. Web 统一审核台 | 3 天 | P1 | Web |
| M4. 语音 Presence 升级 | 5 天 | P1 | 移动端 |

**验收标准**:
- Discord 和 Twitter 消息进入统一时间线
- 用户可控制 Agent 间记忆共享
- 语音摘要 + 语音确认发送可用

### Phase 5: 中国企业渠道 + 高级功能 (4 周, 可并行)

| 任务 | 工作量 | 涉及端 |
|------|--------|--------|
| FeishuAdapter（飞书） | 5 天 | 后端 |
| WecomAdapter（企业微信） | 5 天 | 后端 |
| SlackAdapter | 3 天 | 后端 |
| WhatsAppAdapter | 3 天 | 后端 |
| 运营数据面板（Agent 活跃度/渠道消息量/响应时间） | 5 天 | Web |
| Agent 定时任务（定期分发/跟进/社群维护） | 5 天 | 后端 |

---

## 五、数据迁移策略

### 5.1 社交事件迁移

```sql
-- social_events → conversation_events
INSERT INTO conversation_events (
  user_id, agent_id, channel, direction, role, content_type, content,
  external_sender_id, external_sender_name, raw_payload,
  approval_status, approval_draft, created_at
)
SELECT 
  se.user_id,
  -- agent_id: 查找用户的默认 Agent，或创建一个
  COALESCE(
    (SELECT id FROM user_agents WHERE user_id = se.user_id AND status = 'active' ORDER BY created_at LIMIT 1),
    gen_random_uuid()
  ),
  se.platform,
  'inbound',
  'external_user',
  'text',
  se.text,
  se.sender_id,
  se.sender_name,
  se.raw_payload,
  CASE se.reply_status 
    WHEN 'auto_sent' THEN 'auto'
    WHEN 'pending' THEN 'pending'
    WHEN 'approved' THEN 'approved'
    WHEN 'rejected' THEN 'rejected'
    ELSE NULL
  END,
  se.agent_draft_reply,
  se.created_at
FROM social_events se
WHERE se.user_id IS NOT NULL;
```

### 5.2 桌面会话迁移

```sql
-- desktop_sessions.messages → conversation_events
-- 需要在应用层遍历 JSONB 数组展开为单条记录
```

### 5.3 Agent 记忆迁移

```sql
-- 为现有 agent_memory 补上 agent_id
UPDATE agent_memory am
SET agent_id = (
  SELECT ua.id FROM user_agents ua
  JOIN agent_sessions asess ON asess.id = am.session_id
  WHERE ua.user_id = asess.user_id
  AND ua.status = 'active'
  ORDER BY ua.created_at
  LIMIT 1
)
WHERE am.agent_id IS NULL;
```

---

## 六、技术风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| conversation_events 表数据量大导致查询慢 | 中 | 高 | 按 (user_id, agent_id) 分区；热数据 Redis 缓存 |
| Telegram Bot 绑定迁移影响已有用户 | 中 | 中 | 渐进式：新绑定走 UserAgent，旧绑定兼容层自动映射 |
| 多端同时写入冲突 | 中 | 中 | 先用 Last-Writer-Wins，Phase 5 后引入 CRDT |
| 渠道 API 限流（Telegram/Discord） | 低 | 中 | 出站消息队列 + 限流器 |
| 前端三端同时改动开发效率低 | 高 | 中 | Phase 1-2 聚焦后端 + 移动端；Phase 3 才动桌面端和 Web |

---

## 七、成功指标

| 阶段 | 指标 | 目标 |
|------|------|------|
| Phase 1 完成 | 用户可创建/管理多 Agent | 100% |
| Phase 1 完成 | 所有新消息写入统一表 | 100% |
| Phase 2 完成 | Telegram 消息出现在移动端时间线 | 100% |
| Phase 2 完成 | Agent 上下文跨 Telegram 和移动端共享 | 100% |
| Phase 3 完成 | 跨端 Session Handoff 延迟 | < 2s |
| Phase 3 完成 | 桌面端工作台可审核社交消息 | 100% |
| Phase 4 完成 | 支持渠道数 | ≥ 3 (Telegram + Discord + Twitter) |
| Phase 4 完成 | Agent 间共享策略可用 | 100% |

---

## 八、与 PRD V2 的关系

本文档 **不替代** PRD V2，而是在 PRD V2 Phase C（跨端协同）的基础上：

1. **前置了 Agent Core 重构** — PRD V2 Phase C 假设 Agent Core 已就绪，但实际 `agent_memory` 以 Session 为中心，必须先修
2. **增加了社交渠道统一层** — PRD V2 未涉及两套社交架构合并问题
3. **细化了多 Agent 管理** — PRD V2 仅提到"统一 Agent Session"，未涉及多 Agent + 共享策略
4. **具体化了桌面端工作台** — 社交渠道方案明确要求桌面端做"正式运营台"

**推荐执行顺序**:
```
PRD V2 Phase A (基础加固)  →  本文档 Phase 1-2 (Agent Core + Telegram)
       ↓                              ↓
PRD V2 Phase B (支付闭环)  ←→  本文档 Phase 3 (跨端协同)
       ↓                              ↓
PRD V2 Phase C (原跨端协同) →  本文档 Phase 4-5 (多渠道 + 中国企业)
       ↓
PRD V2 Phase D-F (硬件/增长/生态)
```

---

## 九、总结

Agentrix 的核心差异化是 **"让用户拥有多个持续在线的 Agent 分身，每个 Agent 都可以跨设备、跨应用、跨社交渠道与用户协作"**。

当前代码库有完善的多端基础（后端 82 模块、移动端 50+ 屏幕、桌面端 92%、Web 65%），但**数据架构以 Session/User 为中心，不以 Agent 为中心**，这是实现愿景的根本障碍。

**最小可行路径**:
1. 先修 Agent Core（实体升级 + 统一消息表 + 记忆系统）— 4 周
2. 再打通 Telegram 第一个完整 Presence 闭环 — 3 周
3. 再补跨端协同和桌面工作台 — 3 周
4. 最后扩展到更多渠道 — 3+ 周

**总工期预估**: 13-17 周（约 3-4 个月），可与 PRD V2 Phase A/B 并行推进。
