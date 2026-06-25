# Agentrix Agent 对话系统 — 输入输出流程与延迟分析

> **日期**: 2026-03-28  
> **版本**: build138 (true streaming fix)

---

## 1. 整体架构

```
┌─────────────┐   SSE/WebSocket    ┌──────────────────┐   Bedrock API   ┌─────────────┐
│  Mobile App │◄──────────────────►│  Backend Server  │◄──────────────►│  AWS Bedrock │
│  (React     │   (新加坡)          │  (新加坡 EC2)     │  (us-east-1)    │  Claude      │
│   Native)   │                    │  NestJS + PM2    │                │  Haiku 4.5   │
└─────────────┘                    └────────┬─────────┘                └─────────────┘
                                            │
                                   ┌────────┴─────────┐
                                   │  PostgreSQL DB   │
                                   │  SkillHub API    │
                                   │  OpenClaw Hub    │
                                   └──────────────────┘
```

---

## 2. 简单消息流程（如 "hi"、"hello"）

### 时序图

```
Mobile App          Backend (NestJS)         Bedrock (us-east-1)
    │                     │                        │
    │── POST /stream ────►│                        │
    │                     │── getOrCreateSession ─►│ DB (7ms)
    │                     │── directSkillIntent ──►│ 匹配失败 (8ms)
    │                     │── parallelQueries ────►│ tools+history+config (35ms)
    │                     │                        │
    │                     │  ⚡ messageNeedsTools("hi")=false
    │                     │  → 跳过32个tools, 历史截断为4条
    │                     │                        │
    │                     │── invoke-with-response-stream ──────►│
    │                     │     (0 tools, 5 msgs)                │
    │                     │                        │              │
    │                     │◄── EventStream chunk ──│  ~1.6s TTFB
    │◄─ SSE: {"chunk":"Hello!"}                    │
    │                     │◄── chunk ──────────────│  逐字流出
    │◄─ SSE: {"chunk":" I'm..."}                   │
    │                     │◄── chunk ──────────────│
    │◄─ SSE: {"chunk":"...agent"}                  │
    │                     │                        │
    │                     │── save messages ───────►│ DB
    │◄─ SSE: {"meta":{...}}                        │
    │◄─ SSE: [DONE]       │                        │
    │                     │                        │
    总耗时: ~2.5s (TTFB: ~1.7s)
```

### 延迟分解

| 阶段 | 耗时 | 说明 |
|------|------|------|
| Session 查询/创建 | ~7ms | PostgreSQL 查询 |
| 直接意图匹配 | ~8ms | 正则匹配 skill_search 等快速路径 |
| 并行查询 (tools+history+config) | ~35ms | Promise.all 批量查询 |
| 简单消息优化 | 0ms | 跳过 tools, 截断历史 |
| **Bedrock 调用** | **~2000ms** | ⚠️ **主要瓶颈** |
| ├─ 网络往返 (SG→us-east-1) | ~200ms | 跨区域延迟 |
| ├─ 模型推理 | ~1400ms | Claude Haiku 4.5 |
| └─ 流式传输开销 | ~400ms | EventStream 编解码 |
| 消息持久化 | <10ms | DB 写入 |
| **总计** | **~2.5s** | |

---

## 3. 工具调用消息流程（如 "help me find skills for blog writing"）

### 时序图

```
Mobile App          Backend (NestJS)         Bedrock           SkillHub
    │                     │                    │                  │
    │── POST /stream ────►│                    │                  │
    │                     │── session + queries ►│ (211ms)         │
    │                     │                    │                  │
    │                     │── invoke-stream ───►│                  │
    │                     │  (32 tools, 13 msgs)│                  │
    │                     │                    │  ~2.2s TTFB       │
    │                     │◄─ text_delta ──────│                  │
    │◄─ {"chunk":"🎯 正在搜索..."}              │                  │
    │                     │◄─ text_delta ──────│                  │
    │◄─ {"chunk":"博客写作相关技能"}             │                  │
    │                     │◄─ tool_use ────────│  LLM决定调tool    │
    │                     │◄─ tool_use ────────│  (3× skill_search)│
    │                     │◄─ message_stop ────│                  │
    │                     │                    │                  │
    │◄─ {"chunk":"[Tool Call] skill_search..."}│                  │
    │                     │── skill_search ────┼─────────────────►│
    │                     │── skill_search ────┼─────────────────►│
    │                     │── skill_search ────┼─────────────────►│
    │                     │◄─ results ─────────┼─────────────────│ (~500ms)
    │                     │                    │                  │
    │                     │── invoke-stream ───►│                  │
    │                     │  (0 tools, 15 msgs) │                  │
    │                     │                    │  ~2.0s TTFB       │
    │                     │◄─ text_delta ──────│                  │
    │◄─ {"chunk":"📝 搜索结果分析..."}          │                  │
    │                     │◄─ text_delta ──────│                  │
    │◄─ {"chunk":"...更多内容..."}              │                  │
    │                     │◄─ message_stop ────│                  │
    │                     │                    │                  │
    │◄─ {"meta":{...}}    │                    │                  │
    │◄─ [DONE]            │                    │                  │
    │                     │                    │                  │
    总耗时: ~10s (TTFB: ~2.4s, 第二段: ~5.7s)
```

### 延迟分解

| 阶段 | 耗时 | 说明 |
|------|------|------|
| Pre-LLM 准备 | ~211ms | session + 32 tools + 12 history |
| **1st LLM 调用 (决策+流式)** | **~3200ms** | ⚠️ 瓶颈 #1 |
| ├─ TTFB (首字节) | ~2200ms | 32 tools 增加推理时间 |
| ├─ 流式文本 "正在搜索..." | ~200ms | 实时反馈给用户 |
| └─ tool_use 生成 | ~800ms | LLM 生成 3 个 tool call |
| Tool 执行 (3× skill_search) | ~500ms | SkillHub API 调用 |
| **2nd LLM 调用 (总结+流式)** | **~6000ms** | ⚠️ 瓶颈 #2 |
| ├─ TTFB (首字节) | ~2000ms | 15 msgs 含大量 tool 结果 |
| └─ 流式生成 | ~4000ms | 生成长回复 |
| 消息持久化 | <30ms | DB 写入 |
| **总计** | **~10s** | |

---

## 4. 关键代码路径

### 文件及职责

| 文件 | 职责 |
|------|------|
| `openclaw-proxy.service.ts` | 路由层：session管理、tools构建、SSE发送 |
| `claude-integration.service.ts` | LLM调度层：Claude/Bedrock路由、tool执行循环 |
| `bedrock-integration.service.ts` | Bedrock层：API调用、EventStream解析、流式回调 |
| `agent-preset-skills.config.ts` | 工具定义：20个预置tools |

### 调用链

```
POST /api/openclaw/proxy/:instanceId/stream
  └─ OpenClawProxyController.streamChat()
       └─ streamPlatformHostedChat(userId, instance, dto, res)
            ├─ res.setHeader('Content-Type', 'text/event-stream')
            └─ runPlatformHostedChat(userId, instance, dto, {onChunk})
                 ├─ getOrCreateSession()           → DB
                 ├─ tryHandleDirectSkillIntent()    → 快速路径
                 ├─ Promise.all([                   → 并行查询
                 │    buildPlatformHostedTools(),    → SkillHub API
                 │    getPermissionProfile(),        → DB
                 │    getDefaultConfig(),             → DB
                 │    getRecentHistory()              → DB
                 │  ])
                 ├─ messageNeedsTools(msg)          → 简单消息优化
                 └─ claudeIntegration.chatWithFunctions(messages, {onChunk})
                      └─ handleBedrockChat(messages, tools, {onChunk})
                           ├─ bedrock.chatWithFunctions({onChunk})  ← 1st LLM
                           │    └─ invokeStreamingWithPlatformToken(onChunk)
                           │         └─ parseEventStreamFrames() → onChunk(text_delta)
                           │
                           ├─ [if tool_calls returned]:
                           │    ├─ onChunk("[Tool Call] skill_search, ...")
                           │    ├─ executeFunctionCall(tool) × N  ← tool 执行
                           │    └─ bedrock.chatWithFunctions({onChunk})  ← 2nd LLM
                           │         └─ invokeStreamingWithPlatformToken(onChunk)
                           │
                           └─ return { text, toolCalls }
```

---

## 5. 已知瓶颈与优化机会

### 已修复的瓶颈

| 瓶颈 | 状态 | 修复方案 |
|------|------|----------|
| **Nginx SSE 缓冲** | ✅ 已修复 (2026-03-28) | `/api/` location 添加 `proxy_buffering off; proxy_cache off;` |
| **EventStream 帧解析** | ✅ 已修复 (2026-03-28) | 自定义 `parseEventStreamFrames()` 替换 `MessageDecoderStream` |
| **SSE Fallback 误触发** | ✅ 已修复 (2026-03-28) | `textBytesStreamed` 追踪实际文本，非 `[Tool Call]` 标记 |

> **Nginx 缓冲是前端"一口气回复"的根本原因**: `/api/` location 块缺少 `proxy_buffering off;`，Nginx 默认缓冲 proxy 响应，导致后端实时发送的 SSE chunks 被 Nginx 收集后整体返回。后端 `X-Accel-Buffering: no` header 不起作用因为不在该 location 块中。

### 当前瓶颈

| 瓶颈 | 影响 | 原因 | 优先级 |
|------|------|------|--------|
| **跨区域延迟** | 每次LLM调用+1.7s | 服务器在新加坡, Bedrock在us-east-1 | P0 |
| **Tool数量** | 1st LLM调用3.2s | 32个tool schema增加推理时间 | P1 |
| **历史消息数** | 2nd LLM调用6s | 15条消息(含大量tool结果) | P1 |
| **2nd LLM响应过长** | 生成4s | 模型倾向生成冗长回复 | P2 |

### 优化方案

#### P0: 切换 Bedrock 区域 (预期: -1.5s/次调用)
```
当前: 新加坡 (ap-southeast-1) → us-east-1, RTT ~200ms
目标: 新加坡 → ap-southeast-1 (同区域), RTT ~5ms
障碍: Bearer Token (API Key) 在 ap-southeast-1 不可用 — 模型返回 "model identifier invalid"
      或 "Retry with inference profile" 错误。需要在 ap-southeast-1 开通 Cross-region inference
      并更新 Bearer Token，或改用 IAM 凭证 (AccessKeyId/SecretAccessKey)。
效果: 简单消息 2.5s → 1.0s, 工具消息 10s → 7s
```

#### P1: 减少 Tool 数量 (预期: -0.5s/次调用)
- 合并 4 个搜索工具 → 1 个统一 `search` 工具
- 惰性加载支付/发布工具 (用户有相关权限时才加载)
- 简化 marketplace skill schemas

#### P1: 截断 Tool 结果 (预期: -1~2s/2nd调用)
- 限制每个 tool_result 最大 2000 字符
- 2nd LLM 的 system prompt 中加 "简洁回复" 指示
- 移除 tool_results 中的冗余字段

#### P2: 限制 2nd LLM 回复长度
```typescript
// 当前: max_tokens: 4000
// 优化: 2nd LLM 调用用 max_tokens: 1500
body.max_tokens = isFollowUp ? 1500 : 4000;
```

---

## 6. SSE 事件格式

客户端接收的 Server-Sent Events 格式：

```
data: {"chunk":"Hello "}          // 文本 chunk (逐词/逐句)
data: {"chunk":"world!"}          // 继续流式
data: {"chunk":"[Tool Call] skill_search, skill_search"}  // 工具调用标记
data: {"chunk":"搜索结果..."}     // 2nd LLM 流式文本
data: {"meta":{"resolvedModel":"claude-haiku-4-5","resolvedModelLabel":"claude-haiku-4-5"}}
data: [DONE]                      // 流结束
```

### 前端处理策略

| 事件类型 | 处理方式 |
|----------|----------|
| `chunk` (普通文本) | 追加到消息气泡, 实时渲染 Markdown |
| `chunk` (以 `[Tool Call]` 开头) | 显示思维链/进度指示器 |
| `meta` | 记录使用的模型信息 |
| `[DONE]` | 标记消息完成, 停止 loading 动画 |

---

## 7. 流式实现技术细节

### AWS EventStream 二进制解析

Bedrock 的 `invoke-with-response-stream` 返回 `application/vnd.amazon.eventstream` 格式：

```
┌────────────────────────────────────────┐
│ 4 bytes: Total message length (BE)     │
│ 4 bytes: Headers length (BE)           │
│ 4 bytes: Prelude CRC                   │
│ N bytes: Headers                       │
│   - :event-type = "chunk"              │
│   - :content-type = "application/json" │
│   - :message-type = "event"            │
│ M bytes: Payload (JSON)                │
│   {"bytes": "base64-encoded-event"}    │
│ 4 bytes: Message CRC                   │
└────────────────────────────────────────┘
```

**关键问题**: TCP 传输不保证 chunk 边界与消息边界对齐。一个 TCP 包可能包含多个消息或部分消息。

**解决方案**: 自定义 `parseEventStreamFrames()` 实现帧级别的消息分割：
1. 累积 TCP chunks 到 buffer
2. 读取前 4 字节获取消息总长度
3. 当 buffer >= 消息长度时, 切割并解码一条消息
4. 重复直到 buffer 不足一条完整消息

---

## 8. 实测数据 (2026-03-28 修复后)

### Nginx SSE 缓冲修复 — 端到端验证 (via HTTPS)

#### 简单消息 "hello" (通过 Nginx HTTPS)
```
TTFB (首字节到客户端):     1908ms
流式完成:                   2349ms
流式方式:                   真实逐词 (每 20-40ms 一个 token)
```

#### 问题 "你有哪些能力技能和能哪些工具？" (通过 Nginx HTTPS)
```
TTFB (首字节到客户端):     2238ms
流式 chunks 数:            434 个
流式完成:                   12619ms
流式方式:                   真实 token-by-token (20-30ms/chunk)
```

### 后端内部测试 (直连 localhost:3000)

#### 简单消息 "hello"
```
TTFB (首字节到客户端):     1676ms
流式完成:                   2710ms
流式方式:                   真实逐词 (每 20-40ms 一个 token)
```

#### 工具消息 "help me find skills for blog writing"
```
1st LLM TTFB:              2437ms (用户看到 "正在搜索...")
1st LLM 流式完成:          2618ms
Tool 执行:                 3694ms (3× skill_search)
2nd LLM TTFB:              5706ms (用户看到搜索结果)
2nd LLM 流式完成:          9866ms
总计:                      9975ms
```

### 修复前后对比

| 场景 | 修复前 | 修复后 | 改进 |
|------|--------|--------|------|
| 简单消息 TTFB | 2925ms (假流式) | 1908ms (真流式) | **35% ↓** |
| 简单消息体验 | 等3s → 文字一次出现 | 等1.9s → 逐字流出 | ✅ 真流式 |
| 工具消息 TTFB | 10-20s (无反馈) | 2238ms (立刻有反馈) | **78-89% ↓** |
| 工具消息总时间 | 10-20s | ~12.6s (全程流式) | ✅ 体感大幅提升 |
| 流式方式 | Nginx缓冲→一口气 | 真实 token-by-token | ✅ |

### 根因汇总
1. **EventStream 帧解析 (后端)** — `MessageDecoderStream` 不能处理 TCP 多帧合并 → 0 chunks → 假流式
2. **Nginx proxy_buffering (网络层)** — `/api/` location 缺少 `proxy_buffering off` → SSE 被缓冲一次性发送
3. **SSE Fallback 误判 (后端)** — `[Tool Call]` 标记设置 `chunksStreamed=true` → 跳过文本回退
