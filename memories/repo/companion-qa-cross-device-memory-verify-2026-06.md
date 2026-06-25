# Companion_QA 跨端单一记忆源 — 验证结论 (spec soul-companion-onboarding / task 5.2)

> R9.1 / R9.5 / R9.6,设计 §8,Correctness Property 11(后者的属性级检查归 task P.6)。
> 结论:**已满足,无需改动桌面 ChatPanelImpl**——记忆已是后端按 instanceId 单点存取,
> 不存在端本地分叉。本任务为复用/验证,产物是一份可在 WSL/CI 跑的后端 jest 测试。

## 两端对话入口都汇聚到同一份 instanceId-keyed 记忆

- **桌面**:`desktop/src/components/ChatPanelImpl.tsx` 是常驻问答面板(R9.1)。
  - 取 `useAuthStore().activeInstanceId`,经 `useStreamingTurn.runCloudStream`:
    - 有 instance → `streamChat({ instanceId: activeInstanceId, ... })`
      → `desktop/src/services/store.ts` → `POST /openclaw/proxy/:instanceId/stream`。
    - 无 instance → `streamDirectChat` → `POST /openclaw/proxy/stream`
      → 后端 `streamDefaultChat` → `resolveDefaultInstanceForUser`(primary/首个)。
  - `activeInstanceId` 的解析(`activeInstanceId → primary → 第一个`)与
    `services/remoteControl.ts`、`services/presence.ts` 同款;`remoteControl.ts`
    明确注释「mobile targets the user's OpenClaw **instance id**」——即桌面用的
    `activeInstanceId` 就是移动端共享的同一个 Claw_Instance id。
- **移动端**(task 5.1):`streamAgentChat(instanceId, ...)` → 同样打 `/openclaw/proxy/:instanceId/stream`。
- 两条路径在后端最终都进入 `OpenClawProxyService.streamChatToCallbacks`
  → `streamPlatformHostedChat*`。

## 后端记忆 = 单一来源,键是 instanceId(不是 device/platform/sessionId)

`backend/src/modules/openclaw-proxy/openclaw-proxy.service.ts`:
- 写:`getOrCreatePlatformHostedSession` 建会话时 `metadata.instanceId = instance.id`;
  `savePlatformHostedMessage` 把消息挂到该会话。**所有端的写入都落到 instanceId-keyed 会话。**
- 读(新对话/跨端):`getPlatformConversationHistory(userId, instanceId)` 过滤
  `session.metadata ->> 'instanceId' = :instanceId`,**跨 session、跨端**取该实例最近历史。
- `dto.deviceId` / `dto.platform` 只用于 tier 路由/工具选择,**不参与记忆分区**,
  因此不存在「端本地分叉」。
- 注意点:当某一端在请求里带了 `history`(桌面会带本地 tab 历史)时,该轮 LLM 上下文
  用显式 history;但**持久化仍按 instanceId 落库**,别的端开新对话时通过
  `getPlatformConversationHistory` 仍可见 → R9.6 成立。

## 验证测试(真跑通过)

新增 `backend/src/modules/openclaw-proxy/openclaw-proxy.memory.spec.ts`:
- 用 `Object.create(OpenClawProxyService.prototype)` + 只注入 session/message 两个
  内存假仓储,直接调**真实**私有记忆方法(绕过 28 个构造依赖,无需 Postgres)。
- 假 QueryBuilder 精确复现服务用到的 SQL 片段(`session.userId`、
  `session.metadata ->> 'instanceId'`、`session.sessionId`),未识别片段直接抛错以防静默错过滤。
- 6 个用例:desktop+mobile 同 instanceId 汇聚单一来源 / 新记忆对其它端全新对话可见(R9.6)
  / 按 instanceId 分区不串台 / 按 user 隔离 / 同 sessionId 复用会话 / 指定 sessionId 读取仍按 instanceId。
- 运行(WSL):`cd backend && node_modules/.bin/jest src/modules/openclaw-proxy/openclaw-proxy.memory.spec.ts --no-coverage --runInBand` → **6 passed**。

## 仍需留意(超出本任务范围)

- AGENTS.md 硬规则:`/openclaw/proxy/:id/stream` 与 `/claude/chat` 两条链路要同步。
  本任务 Companion_QA(桌面+移动)**只走 openclaw-proxy**,记忆键一致已验证;
  `/claude/chat` 是兼容 shim(见 `query-engine/runtime-seam.service.ts`),如未来让
  Companion_QA 走它,需保证同样按 instanceId 落 `agent_sessions/agent_messages`。
- 更宽的属性级检查由 task P.6(Correctness Property 11)负责,与本聚焦测试互补。
