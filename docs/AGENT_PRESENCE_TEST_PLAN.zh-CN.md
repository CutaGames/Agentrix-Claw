# Agentrix Agent Presence 完整测试计划 (Phase 1-5)

**版本**: 1.0
**日期**: 2026-03-16
**测试范围**: `backend/src/modules/agent-presence/` 全模块
**关联PRD**: `docs/PRD_V3_AGENT_PRESENCE.zh-CN.md`

---

## 一、测试概览

### 1.1 测试目标

验证 Agent Presence 五个阶段的全部后端功能正确性、稳定性和集成一致性。

### 1.2 测试分层

| 层级 | 描述 | 工具 | 覆盖目标 |
|------|------|------|----------|
| **单元测试** | Service/Adapter 独立逻辑 | Jest + ts-jest | 85%+ 行覆盖 |
| **集成测试 (E2E)** | Controller → Service → Mock DB 全链路 | Jest + supertest (NestJS Testing) | Agent Presence 已暴露 REST 端点 |
| **Smoke 手测** | 真实环境关键路径验证 | curl / Postman | P0 场景 |

### 1.3 测试文件清单

| 测试文件 | 阶段 | 测试数 | 状态 |
|----------|------|--------|------|
| `agent-presence.service.spec.ts` | Phase 1 | 16 | ✅ Passed |
| `channel/channel.spec.ts` | Phase 2 | 17 | ✅ Passed |
| `handoff/session-handoff.spec.ts` | Phase 3 | 14 | ✅ Passed |
| `channel/phase4-adapters.spec.ts` | Phase 4 | 21 | ✅ Passed |
| `scheduler/scheduler.spec.ts` | Phase 5 | 17 | ✅ Passed |
| `agent-presence.e2e.spec.ts` | All | 28 | ✅ Passed |
| **合计** | | **113** | |

---

## 二、Phase 1 测试计划 — Agent Core + 统一消息

### 2.1 单元测试 (agent-presence.service.spec.ts)

| 编号 | 用例 | 预期结果 | 优先级 |
|------|------|----------|--------|
| P1-U01 | createAgent — 默认 delegation level | Agent 创建成功，delegationLevel = assistant | P0 |
| P1-U02 | createAgent — 自定义 delegation level | Agent 按指定级别创建 | P0 |
| P1-U03 | getAgent — 存在 | 返回 Agent 详情 | P0 |
| P1-U04 | getAgent — 不存在 | 抛出 NotFoundException | P0 |
| P1-U05 | updateAgent — 部分字段 | 仅更新传入字段 | P0 |
| P1-U06 | updateAgent — status + metadata merge | 状态切换 + metadata 深合并 | P1 |
| P1-U07 | archiveAgent | status → ARCHIVED | P0 |
| P1-U08 | bindChannel — 正常绑定 | channelBindings 数组增加 | P0 |
| P1-U09 | bindChannel — 重复绑定 | 抛出 ConflictException | P0 |
| P1-U10 | unbindChannel | channelBindings 数组移除 | P0 |
| P1-U11 | createEvent — 正常 | 写入 conversation_events | P0 |
| P1-U12 | createEvent — 非所有者 | 抛出 NotFoundException | P0 |
| P1-U13 | createSharePolicy — 新建 | 策略创建成功 | P1 |
| P1-U14 | createSharePolicy — 更新 | 策略更新成功 | P1 |
| P1-U15 | promoteMemoryToAgent — 存在 | scope 变更为 agent | P1 |
| P1-U16 | promoteMemoryToAgent — 不存在 | 抛出 NotFoundException | P1 |

### 2.2 Smoke 手测

| 编号 | 场景 | 步骤 | 预期 |
|------|------|------|------|
| P1-S01 | 创建 Agent | POST /api/agent-presence/agents | 201 + Agent JSON |
| P1-S02 | 列出 Agent | GET /api/agent-presence/agents | 200 + 数组 |
| P1-S03 | 绑定 Telegram | POST /api/agent-presence/agents/:id/channels | 200 + 更新后的 Agent |
| P1-S04 | 创建事件 | POST /api/agent-presence/agents/:id/events | 201 + ConversationEvent |
| P1-S05 | 查询时间线 | GET /api/agent-presence/agents/:id/timeline | 200 + 事件数组 |

---

## 三、Phase 2 测试计划 — ChannelAdapter 抽象层

### 3.1 单元测试 (channel/channel.spec.ts)

| 编号 | 用例 | 预期结果 | 优先级 |
|------|------|----------|--------|
| P2-U01 | TelegramAdapter.platform | = 'telegram' | P0 |
| P2-U02 | Telegram normalizeInbound — 文本 | 正确提取 content + sender | P0 |
| P2-U03 | Telegram normalizeInbound — 语音 | contentType = 'voice' | P0 |
| P2-U04 | Telegram — /start 命令 | 返回 null（跳过） | P0 |
| P2-U05 | Telegram — /start \<token\> | 返回 null | P0 |
| P2-U06 | Telegram — /help | 返回 null | P1 |
| P2-U07 | Telegram — 空消息 | 返回 null | P1 |
| P2-U08 | DiscordAdapter.platform | = 'discord' | P0 |
| P2-U09 | Discord — slash command (type 2) | 正确提取 | P0 |
| P2-U10 | Discord — 普通消息 | 正确提取 | P0 |
| P2-U11 | Discord — ping (type 1) | 返回 null | P1 |
| P2-U12 | TwitterAdapter.platform | = 'twitter' | P0 |
| P2-U13 | Twitter — mention | 正确提取 | P0 |
| P2-U14 | Twitter — DM | 正确提取 | P0 |
| P2-U15 | Twitter — 空 payload | 返回 null | P1 |
| P2-U16 | ChannelRegistry — 注册与获取 | 注册后 get 返回 adapter | P0 |
| P2-U17 | ChannelRegistry — 未注册 | get 返回 undefined | P0 |

### 3.2 Smoke 手测

| 编号 | 场景 | 步骤 | 预期 |
|------|------|------|------|
| P2-S01 | 审批回复 | POST /api/agent-presence/approvals/:eventId/approve | 200 |
| P2-S02 | 拒绝回复 | POST /api/agent-presence/approvals/:eventId/reject | 200 |
| P2-S03 | 渠道健康 | GET /api/agent-presence/channels/health | 200 + 各渠道状态 |

---

## 四、Phase 3 测试计划 — 跨端 Session Handoff

### 4.1 单元测试 (handoff/session-handoff.spec.ts)

| 编号 | 用例 | 预期结果 | 优先级 |
|------|------|----------|--------|
| P3-U01 | initiateHandoff — 正常 | INITIATED + 5min 过期 | P0 |
| P3-U02 | initiateHandoff — 广播(无目标) | targetDeviceId = undefined | P0 |
| P3-U03 | acceptHandoff — 正常 | ACCEPTED + acceptedAt | P0 |
| P3-U04 | acceptHandoff — 不存在 | NotFoundException | P0 |
| P3-U05 | acceptHandoff — 已接受 | BadRequestException | P0 |
| P3-U06 | acceptHandoff — 已过期 | BadRequestException | P0 |
| P3-U07 | rejectHandoff | REJECTED | P0 |
| P3-U08 | completeHandoff — 正常 | COMPLETED | P0 |
| P3-U09 | completeHandoff — 不存在 | NotFoundException | P0 |
| P3-U10 | deviceHeartbeat — 新设备 | 创建 + isOnline = true | P0 |
| P3-U11 | deviceHeartbeat — 已有 | 更新 lastSeenAt | P0 |
| P3-U12 | deviceDisconnect | isOnline = false | P0 |
| P3-U13 | getOnlineDevices | 查询 isOnline = true | P1 |
| P3-U14 | cleanupStaleDevices | 标记过期设备离线 | P1 |

### 4.2 Smoke 手测

| 编号 | 场景 | 步骤 | 预期 |
|------|------|------|------|
| P3-S01 | 发起 Handoff | POST /api/agent-presence/handoffs | 201 |
| P3-S02 | 接受 Handoff | POST /api/agent-presence/handoffs/:id/accept | 200 |
| P3-S03 | 设备心跳 | POST /api/agent-presence/devices/heartbeat | 200 |
| P3-S04 | 在线设备 | GET /api/agent-presence/devices/online | 200 + 数组 |

---

## 五、Phase 4 测试计划 — 企业渠道扩展

### 5.1 单元测试 (channel/phase4-adapters.spec.ts)

| 编号 | 用例 | 预期结果 | 优先级 |
|------|------|----------|--------|
| P4-U01 | FeishuAdapter.platform | = 'feishu' | P0 |
| P4-U02 | Feishu — 文本消息 | 正确解析 JSON content | P0 |
| P4-U03 | Feishu — 语音消息 | contentType = 'voice' | P0 |
| P4-U04 | Feishu — 空 payload | 返回 null | P1 |
| P4-U05 | Feishu — 无 env 健康检查 | connected = false | P1 |
| P4-U06 | WecomAdapter.platform | = 'wecom' | P0 |
| P4-U07 | Wecom — 文本消息 | 正确提取 Content | P0 |
| P4-U08 | Wecom — 语音+识别 | contentType = 'voice' | P0 |
| P4-U09 | Wecom — 空 payload | 返回 null | P1 |
| P4-U10 | Wecom — 无 env 健康检查 | connected = false | P1 |
| P4-U11 | SlackAdapter.platform | = 'slack' | P0 |
| P4-U12 | Slack — 用户消息 | 正确提取 text + user | P0 |
| P4-U13 | Slack — bot 消息 | 返回 null（防循环） | P0 |
| P4-U14 | Slack — 非 message 事件 | 返回 null | P1 |
| P4-U15 | Slack — 空 payload | 返回 null | P1 |
| P4-U16 | Slack — 无 token sendOutbound | 失败 + 错误信息 | P1 |
| P4-U17 | WhatsAppAdapter.platform | = 'whatsapp' | P0 |
| P4-U18 | WhatsApp — 文本消息 webhook | 正确解析嵌套结构 | P0 |
| P4-U19 | WhatsApp — 语音消息 | contentType = 'voice' | P0 |
| P4-U20 | WhatsApp — 空 payload | 返回 null | P1 |
| P4-U21 | WhatsApp — 无凭证 sendOutbound | 失败 + 错误信息 | P1 |

### 5.2 Smoke 手测

| 编号 | 场景 | 预期 |
|------|------|------|
| P4-S01 | 渠道健康检查包含 7 个渠道 | GET channels/health 返回 7 个平台状态 |
| P4-S02 | Module onModuleInit 注册 7 个 adapter | 日志输出 7 条注册日志 |

---

## 六、Phase 5 测试计划 — 定时任务 + 运营面板

### 6.1 单元测试 — AgentTaskSchedulerService

| 编号 | 用例 | 预期结果 | 优先级 |
|------|------|----------|--------|
| P5-U01 | createTask — CRON | ACTIVE + nextRunAt | P0 |
| P5-U02 | createTask — INTERVAL | intervalSeconds 生效 | P0 |
| P5-U03 | getTasks — 用户级 | 返回用户全部任务 | P0 |
| P5-U04 | getTasks — 按 agentId 过滤 | 仅返回指定 Agent 任务 | P1 |
| P5-U05 | getTask — 存在 | 返回详情 | P0 |
| P5-U06 | getTask — 不存在 | NotFoundException | P0 |
| P5-U07 | pauseTask | status → PAUSED | P0 |
| P5-U08 | resumeTask | status → ACTIVE + nextRunAt 更新 | P0 |
| P5-U09 | deleteTask | 任务从数据库移除 | P0 |
| P5-U10 | dispatchDueTasks — 无到期 | 跳过不报错 | P1 |
| P5-U11 | dispatchDueTasks — INTERVAL | runCount +1, nextRunAt 前进 | P0 |
| P5-U12 | dispatchDueTasks — ONE_TIME | 执行后 COMPLETED | P0 |
| P5-U13 | dispatchDueTasks — 5次失败 | status → FAILED | P0 |

### 6.2 单元测试 — OperationsDashboardService

| 编号 | 用例 | 预期结果 | 优先级 |
|------|------|----------|--------|
| P5-U14 | getDashboardOverview | 返回全部指标字段 | P0 |
| P5-U15 | getChannelVolume | 按渠道聚合统计 | P0 |
| P5-U16 | getResponseTimeStats — 无数据 | avgMs = 0 | P1 |
| P5-U17 | getResponseTimeStats — 有配对 | 正确计算 avg + p95 | P0 |

### 6.3 Smoke 手测

| 编号 | 场景 | 步骤 | 预期 |
|------|------|------|------|
| P5-S01 | 创建定时任务 | POST /api/agent-presence/tasks | 201 |
| P5-S02 | 暂停/恢复任务 | POST tasks/:id/pause → POST tasks/:id/resume | 200 + 状态切换 |
| P5-S03 | 运营面板 | GET /api/agent-presence/dashboard | 200 + 完整 overview |
| P5-S04 | 渠道流量 | GET /api/agent-presence/dashboard/channels | 200 + 渠道数组 |
| P5-S05 | 响应时间 | GET dashboard/agents/:id/response-time | 200 + avgMs/p95Ms |

---

## 七、E2E 集成测试计划

### 7.1 测试文件: `e2e/agent-presence.e2e-spec.ts`

使用 NestJS Testing Module + supertest 模拟 HTTP 请求，验证完整请求链路。

| 编号 | 场景 | 方法 | 路径 | 预期 |
|------|------|------|------|------|
| E2E-01 | 创建 Agent | POST | /agent-presence/agents | 201 |
| E2E-02 | 列出 Agent | GET | /agent-presence/agents | 200 + 数组 |
| E2E-03 | 获取 Agent | GET | /agent-presence/agents/:id | 200 |
| E2E-04 | 更新 Agent | PUT | /agent-presence/agents/:id | 200 |
| E2E-05 | 绑定渠道 | POST | /agent-presence/agents/:id/channels | 200 |
| E2E-06 | 解绑渠道 | DELETE | /agent-presence/agents/:id/channels/:p | 200 |
| E2E-07 | 创建事件 | POST | /agent-presence/agents/:id/events | 201 |
| E2E-08 | 查询时间线 | GET | /agent-presence/agents/:id/timeline | 200 |
| E2E-09 | 渠道健康 | GET | /agent-presence/channels/health | 200 |
| E2E-10 | 审批回复 | POST | /agent-presence/approvals/:id/approve | 200 |
| E2E-11 | 拒绝回复 | POST | /agent-presence/approvals/:id/reject | 200 |
| E2E-12 | 发起 Handoff | POST | /agent-presence/handoffs | 201 |
| E2E-13 | 接受 Handoff | POST | /agent-presence/handoffs/:id/accept | 200 |
| E2E-14 | 拒绝 Handoff | POST | /agent-presence/handoffs/:id/reject | 200 |
| E2E-15 | 设备心跳 | POST | /agent-presence/devices/heartbeat | 200 |
| E2E-16 | 在线设备 | GET | /agent-presence/devices/online | 200 |
| E2E-17 | 全部设备列表 | GET | /agent-presence/devices | 200 |
| E2E-18 | 创建定时任务 | POST | /agent-presence/tasks | 201 |
| E2E-19 | 列出任务 | GET | /agent-presence/tasks | 200 |
| E2E-20 | 获取单个任务 | GET | /agent-presence/tasks/:id | 200 |
| E2E-21 | 暂停任务 | POST | /agent-presence/tasks/:id/pause | 200 |
| E2E-22 | 恢复任务 | POST | /agent-presence/tasks/:id/resume | 200 |
| E2E-23 | 运营面板 | GET | /agent-presence/dashboard | 200 |
| E2E-24 | 渠道流量 | GET | /agent-presence/dashboard/channels | 200 |
| E2E-25 | 响应时间 | GET | /agent-presence/dashboard/agents/:id/response-time | 200 |
| E2E-26 | 删除任务 | DELETE | /agent-presence/tasks/:id | 200 |
| E2E-27 | 完成 Handoff | POST | /agent-presence/handoffs/:id/complete | 200 |
| E2E-28 | 归档 Agent | DELETE | /agent-presence/agents/:id | 200 |

---

## 八、Smoke 手测清单汇总

### 运行方式

```bash
# 1. 启动后端
cd backend && npm run start:dev

# 2. 获取 JWT token
TOKEN=$(curl -s -X POST https://api.agentrix.top/api/auth/email/send-code -H "Content-Type: application/json" -d '{"email":"test@test.com"}' && curl -s -X POST https://api.agentrix.top/api/auth/email/verify -H "Content-Type: application/json" -d '{"email":"test@test.com","code":"..."}' | jq -r '.token')

# 3. 依次执行下列 curl 命令
```

### P0 关键路径

```bash
# S01: 创建 Agent
curl -X POST https://api.agentrix.top/api/agent-presence/agents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"测试Agent","personality":"友好的助手","delegationLevel":"assistant"}'
# 预期: 201

# S02: 列出 Agent
curl https://api.agentrix.top/api/agent-presence/agents \
  -H "Authorization: Bearer $TOKEN"
# 预期: 200 + Agent 数组

# S03: 绑定 Telegram 渠道
curl -X POST https://api.agentrix.top/api/agent-presence/agents/{AGENT_ID}/channels \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"platform":"telegram","channelId":"chat_12345"}'
# 预期: 200

# S04: 渠道健康检查
curl https://api.agentrix.top/api/agent-presence/channels/health \
  -H "Authorization: Bearer $TOKEN"
# 预期: 200 + 7 个渠道状态

# S05: 设备心跳
curl -X POST https://api.agentrix.top/api/agent-presence/devices/heartbeat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"deviceId":"desktop-001","deviceType":"desktop","deviceName":"MacBook"}'
# 预期: 200

# S06: 运营面板
curl https://api.agentrix.top/api/agent-presence/dashboard \
  -H "Authorization: Bearer $TOKEN"
# 预期: 200 + totalAgents/activeAgents/etc.

# S07: 创建定时任务
curl -X POST https://api.agentrix.top/api/agent-presence/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"agentId":"{AGENT_ID}","name":"每日摘要","triggerType":"cron","cronExpression":"0 9 * * *","actionType":"digest_summary"}'
# 预期: 201
```

---

## 九、通过标准

| 维度 | 标准 |
|------|------|
| 单元测试 | 全部 85+ 用例通过，0 failures |
| E2E 测试 | 全部 22 用例通过 |
| 编译 | `tsc --noEmit` 0 errors (agent-presence 相关) |
| Smoke | 全部 P0 场景可正常请求，状态码正确 |
| 覆盖率 | Service 层 > 80% 行覆盖 |

---

*Agentrix QA · 2026-03-16*
