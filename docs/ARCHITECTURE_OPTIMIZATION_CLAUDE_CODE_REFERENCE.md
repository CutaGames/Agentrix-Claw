# Agentrix 架构优化方案 — 参考 Claude Code Harness Engineering

> 基于对 Claude Code 源码快照（~51万行 TypeScript）和 Agentrix 全栈代码的深度对比分析
> 日期：2026-04-02

---

## 一、核心差距总览

| 维度 | Claude Code | Agentrix 当前 | 差距等级 |
|------|------------|--------------|---------|
| **Tool 系统** | 声明式 `buildTool` 工厂，40+ 属性泛型接口 `Tool<I,O,P>` | 扁平 JSON Schema + switch-case 分发 | 🔴 关键 |
| **Query Engine** | 类实例化引擎，streaming tool executor，并发批处理 | 简单 for 循环，最多 5 轮 | 🔴 关键 |
| **流式架构** | 双流（消息流 + 进度流）+ 并发工具 + 有序发射 | 单流 SSE + 串行工具执行 | 🔴 关键 |
| **记忆系统** | 文件级 memdir + 4 类型分类 + 语义检索 + 新鲜度管理 | save_memory 工具 + SESSION/USER 二分 | 🔴 关键 |
| **Auto-Compaction** | API-round 分组 + 9 项结构化摘要 + 文件/skill 恢复预算 | 无（80 条硬截断） | 🔴 关键 |
| **多 Agent 编排** | AgentTool + Coordinator + Team/Swarm + Fork + 邮箱系统 | create_subtask 工具，无真正 coordinator | 🔴 关键 |
| **权限系统** | 7 模式 + 5 层规则源 + glob 匹配 + 2 阶段分类器 + 否决追踪 | 布尔开关逐字段控制 | 🟡 重要 |
| **KAIROS** | 助手模式 + 会话历史 API + 跨项目恢复 + 远程隔离 | 无对应功能 | 🟡 重要 |
| **错误 & 重试** | withRetry + 指数退避 + 容量级联 + 模型降级 | try-catch + provider fallback chain | 🟡 重要 |
| **上下文系统** | 4 层上下文 + prompt 缓存 + claude.md 发现 | 基本 system prompt + memory 注入 | 🟡 重要 |
| **成本追踪** | 按模型定价表 + 缓存感知计费 + 会话持久化 | `text.length/4` 估算 + 配额系统 | 🟡 重要 |
| **插件/Hooks** | YAML 前端 Skills + pre/post hooks + 惰性加载 | Skill 市场 + HTTP/MCP/Internal 执行 | 🟢 可优化 |
| **消息规范化** | normalizeMessagesForAPI + 内容替换预算 + LRU 缓存 | 直接传递 DB 消息，无规范化层 | 🟡 重要 |

---

## 二、优化方案（按优先级排序）

---

### P0：重构 Tool 系统 — 声明式工具注册中心

**问题**：当前 50+ 个工具分散在 `getFunctionSchemas()` 大函数中，用 switch-case 分发，新增工具需改 3 处代码，两条 chat 路径极易失同步。

**Claude Code 做法**：
```typescript
// 每个工具是独立模块，用 buildTool() 工厂声明
export const FileEditTool = buildTool({
  name: 'file_edit',
  inputSchema: z.object({ path: z.string(), oldStr: z.string(), newStr: z.string() }),
  isReadOnly: false,
  isConcurrencySafe: false,
  isDestructive: false,
  checkPermissions: async (input, ctx) => { /* 权限检查 */ },
  call: async (args, ctx, canUseTool, parentMsg, onProgress) => { /* 执行逻辑 */ },
  prompt: () => '使用说明文本...',
})
```

**Agentrix 优化方案**：

```
backend/src/modules/tool-registry/
├── tool-registry.module.ts          # NestJS 模块
├── tool-registry.service.ts         # 工具注册中心
├── interfaces/
│   ├── tool.interface.ts            # Tool<TInput, TOutput, TProgress> 泛型接口
│   └── tool-result.interface.ts     # 统一返回格式
├── decorators/
│   └── register-tool.decorator.ts   # @RegisterTool() 装饰器
├── tools/
│   ├── commerce/
│   │   ├── search-products.tool.ts
│   │   ├── add-to-cart.tool.ts
│   │   ├── checkout.tool.ts
│   │   └── ...
│   ├── skill/
│   │   ├── skill-search.tool.ts
│   │   ├── skill-install.tool.ts
│   │   └── ...
│   ├── wallet/
│   │   ├── get-balance.tool.ts
│   │   ├── x402-pay.tool.ts
│   │   └── ...
│   ├── task/
│   ├── agent/
│   ├── desktop/
│   └── mcp/                         # MCP 工具动态注册
└── adapters/
    ├── claude-adapter.ts            # 转 Claude tool_use 格式
    ├── openai-adapter.ts            # 转 OpenAI function_calling 格式
    ├── bedrock-adapter.ts           # 转 Bedrock converse 格式
    └── gemini-adapter.ts            # 转 Gemini 格式
```

**核心接口**：
```typescript
interface AgentrixTool<TInput = any, TOutput = any> {
  // === 身份 ===
  name: string;                              // 全局唯一标识
  category: ToolCategory;                    // commerce | skill | wallet | task | agent | system
  description: string;                       // LLM 看到的描述
  
  // === Schema ===
  inputSchema: ZodSchema<TInput>;            // Zod 校验 (替代手写 JSON Schema)
  
  // === 行为标记 ===
  isReadOnly: boolean;                       // 只读工具可并发
  isConcurrencySafe: boolean;                // 是否可与其他工具并行
  requiresPayment: boolean;                  // 执行前是否需扣费
  riskLevel: 0 | 1 | 2 | 3;                 // Desktop 审批等级
  
  // === 权限 ===
  checkPermissions(input: TInput, ctx: ToolContext): Promise<PermissionResult>;
  
  // === 执行 ===
  execute(input: TInput, ctx: ToolContext): Promise<ToolResult<TOutput>>;
  
  // === 可选 ===
  onProgress?(callback: (progress: any) => void): void;  // 进度通知
  prompt?(): string;                         // 注入 system prompt 的使用说明
  maxResultChars?: number;                   // 超长截断阈值
}
```

**收益**：
- 新增工具只建一个文件，自动注册到两条 chat 路径
- Schema 用 Zod 定义一次，自动转换为各 LLM provider 格式
- `isReadOnly` / `isConcurrencySafe` 标记为并发执行打基础
- `riskLevel` 统一 Desktop 审批逻辑

---

### P0：QueryEngine 重构 — 有状态对话引擎

**问题**：当前 `handleBedrockChat()` 是一个巨大的 for 循环，工具串行执行，无并发，无预算控制，无 turn 限制优雅退出。

**Claude Code 做法**：
- `QueryEngine` 是类实例，持有 `mutableMessages[]`、`abortController`、`totalUsage`
- `submitMessage()` 是 `AsyncGenerator`，yield 流式消息
- 工具通过 `StreamingToolExecutor` 并发执行，只读工具批量并行
- 内置 `maxTurns`、`maxBudgetUsd`、`taskBudget` 断路器

**Agentrix 优化方案**：

```typescript
// backend/src/modules/query-engine/query-engine.ts
export class QueryEngine {
  private messages: Message[] = [];
  private abortController = new AbortController();
  private totalUsage: TokenUsage = { input: 0, output: 0, cacheRead: 0 };
  private turn = 0;

  constructor(
    private config: QueryEngineConfig,   // tools, llmProvider, maxTurns, maxBudget...
    private toolExecutor: ToolExecutor,
    private costTracker: CostTracker,
  ) {}

  async *submitMessage(userInput: string): AsyncGenerator<StreamEvent> {
    this.messages.push({ role: 'user', content: userInput });

    while (this.turn < this.config.maxTurns) {
      this.turn++;
      
      // 1. 调用 LLM
      const stream = this.config.llmProvider.stream(this.messages, this.config.tools);
      
      // 2. yield 文本 chunk + 收集 tool_use blocks
      const toolCalls: ToolCall[] = [];
      for await (const event of stream) {
        if (event.type === 'text_delta') yield { type: 'text', data: event.text };
        if (event.type === 'tool_use') toolCalls.push(event);
        if (event.type === 'usage') this.costTracker.accumulate(event.usage);
      }
      
      // 3. 无工具调用 → 结束
      if (toolCalls.length === 0) break;
      
      // 4. 并发执行工具（只读批量并行，写操作串行）
      const results = await this.toolExecutor.executeBatch(toolCalls, {
        onProgress: (toolId, progress) => yield { type: 'tool_progress', toolId, progress },
      });
      
      // 5. yield 工具结果
      for (const r of results) yield { type: 'tool_result', data: r };
      
      // 6. 追加到消息历史 → 继续循环
      this.messages.push({ role: 'assistant', content: toolCalls });
      this.messages.push({ role: 'user', content: results.map(r => r.toToolResultBlock()) });
      
      // 7. 预算检查
      if (this.costTracker.totalUSD > this.config.maxBudgetUsd) {
        yield { type: 'budget_exceeded' };
        break;
      }
    }
  }

  abort() { this.abortController.abort(); }
}
```

**ToolExecutor 并发策略**（学习 Claude Code `StreamingToolExecutor`）：

```typescript
class ToolExecutor {
  async executeBatch(toolCalls: ToolCall[], opts): Promise<ToolResult[]> {
    // 分组：只读工具并行，写工具串行
    const readOnly = toolCalls.filter(tc => this.registry.get(tc.name).isReadOnly);
    const writable = toolCalls.filter(tc => !this.registry.get(tc.name).isReadOnly);
    
    // 只读工具并发（最多 10 并发）
    const readResults = await pMap(readOnly, tc => this.executeSingle(tc, opts), { concurrency: 10 });
    
    // 写工具串行执行
    const writeResults = [];
    for (const tc of writable) {
      writeResults.push(await this.executeSingle(tc, opts));
    }
    
    // 按原始顺序返回
    return this.reorderByOriginal(toolCalls, [...readResults, ...writeResults]);
  }
}
```

**收益**：
- 只读工具（search、get_balance 等）并行执行，响应延迟降低 3-5x
- Budget 断路器防止 token 失控
- AbortController 支持用户中断长对话
- AsyncGenerator 模式天然适配 SSE 流

---

### P0：统一流式架构 — 双流 + 结构化事件

**问题**：当前 SSE 格式是纯文本 `data: {chunk}\n\n`，工具执行期间用户看到空白等待，无法区分"LLM 在想" vs "工具在跑"。

**Claude Code 做法**：
- 消息流和进度流并行
- 工具执行时 yield `tool_progress` 事件
- 结果按接收顺序发射（不等全部完成）

**Agentrix 优化方案** — 结构化 SSE 事件协议：

```typescript
// SSE Event Types
type StreamEvent = 
  | { type: 'text_delta';     data: string }              // LLM 文本增量
  | { type: 'thinking';       data: string }              // 思考过程（extended thinking）
  | { type: 'tool_start';     toolId: string; name: string; input: any }   // 工具开始
  | { type: 'tool_progress';  toolId: string; data: any }                  // 工具进度
  | { type: 'tool_result';    toolId: string; result: any; duration: number } // 工具完成
  | { type: 'tool_error';     toolId: string; error: string }             // 工具失败
  | { type: 'approval_required'; toolId: string; name: string; riskLevel: number } // 需审批
  | { type: 'usage';          input: number; output: number; cost: number } // 用量
  | { type: 'turn_info';      turn: number; maxTurns: number }            // 轮次信息
  | { type: 'done';           reason: 'end_turn' | 'max_turns' | 'budget' | 'abort' }
```

**前端适配**（统一三端解析器）：

```typescript
// shared/stream-parser.ts — Web / Mobile / Desktop 共用
function parseStreamEvents(reader: ReadableStreamReader): AsyncGenerator<StreamEvent> {
  // SSE line parser → JSON typed events
  // 替代当前各端各写一套的 chunk 拼接逻辑
}
```

**收益**：
- 工具执行时前端可显示实时进度（如"正在搜索商品..."）
- 三端 SSE 解析统一为一个 shared 包
- `approval_required` 事件驱动 Desktop ApprovalSheet / Mobile 未来审批 UI
- `usage` 事件支持客户端实时显示 token 消耗

---

### P1：重试 & 模型降级策略

**问题**：当前无指数退避重试，Bedrock 429/529 直接失败。多模型 fallback 是硬编码 if-else 链。

**Claude Code 做法**：
```typescript
// withRetry AsyncGenerator — 可在等待时 yield 状态消息
async function* withRetry(operation, options) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try { return yield* operation(attempt); }
    catch (e) {
      if (isTransient(e)) {
        yield { type: 'system', text: `Retrying in ${backoff}ms...` };
        await sleep(500 * 2 ** attempt);  // 指数退避
      }
      if (consecutive529 >= 3) throw new FallbackTriggeredError();  // 触发降级
    }
  }
}
```

**Agentrix 优化方案**：

```typescript
// backend/src/modules/query-engine/with-retry.ts
interface RetryConfig {
  maxRetries: number;          // 默认 5
  baseDelayMs: number;        // 默认 500
  maxDelayMs: number;         // 默认 30000
  retryableStatuses: number[]; // [429, 529, 503]
  fallbackModel?: string;     // 降级模型
  maxConsecutiveOverload: number; // 连续过载阈值，默认 3
}

async function* withRetry<T>(
  operation: (attempt: number) => AsyncGenerator<StreamEvent, T>,
  config: RetryConfig,
): AsyncGenerator<StreamEvent, T> {
  let consecutive529 = 0;
  
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const result = yield* operation(attempt);
      consecutive529 = 0;  // 重置
      return result;
    } catch (err) {
      if (err.status === 529) consecutive529++;
      
      if (consecutive529 >= config.maxConsecutiveOverload && config.fallbackModel) {
        yield { type: 'system', data: `模型过载，自动降级到 ${config.fallbackModel}` };
        // 切换模型重试
        return yield* operation.withModel(config.fallbackModel);
      }
      
      if (config.retryableStatuses.includes(err.status)) {
        const delay = Math.min(config.baseDelayMs * 2 ** attempt, config.maxDelayMs);
        yield { type: 'system', data: `请求失败 (${err.status})，${delay}ms 后重试...` };
        await sleep(delay);
        continue;
      }
      
      throw err;  // 不可重试错误
    }
  }
}
```

**模型降级链**：
```
claude-opus → claude-sonnet → claude-haiku
gpt-4o → gpt-4-turbo → gpt-4o-mini
gemini-2.0-flash → gemini-1.5-flash
```

**收益**：
- 429/529 不再直接报错，用户体验平滑
- 自动降级到更便宜/更快模型，保证可用性
- 重试期间 SSE 流式告知前端状态

---

### P1：分层上下文系统

**问题**：当前 system prompt 是硬编码字符串 + memory 直接拼接，无缓存、无层次、无版本控制。

**Claude Code 做法**：
- 4 层上下文：System → User (claude.md) → Coordinator → Tool
- `getSystemContext` 和 `getUserContext` 都有 memoize 缓存
- Prompt 缓存策略减少重复的 API token 消耗
- Sub-agent 的 system prompt 在 turn 开始时冻结

**Agentrix 优化方案**：

```typescript
// backend/src/modules/context/context.service.ts
interface ContextLayer {
  source: 'system' | 'agent_profile' | 'user_memory' | 'skill_prompts' | 'coordinator';
  content: string;
  cacheable: boolean;     // 是否可 prompt cache
  ttl?: number;           // 缓存寿命 (ms)
}

class ContextService {
  // 层次化上下文构建
  async buildSystemPrompt(userId: string, agentId: string, options: ContextOptions): Promise<{
    systemPrompt: string;
    cacheBreakpoints: number[];  // 用于 Anthropic prompt caching
  }> {
    const layers: ContextLayer[] = [];
    
    // Layer 1: 基础 system prompt (高频缓存)
    layers.push({
      source: 'system',
      content: await this.getBaseSystemPrompt(agentId),
      cacheable: true,
      ttl: 3600_000, // 1h
    });
    
    // Layer 2: Agent Profile + Skills
    layers.push({
      source: 'agent_profile',
      content: await this.getAgentProfile(agentId),
      cacheable: true,
      ttl: 300_000, // 5min
    });
    
    // Layer 3: User Memory (per-session)
    const memories = await this.memoryService.getUserMemories(userId, agentId);
    if (memories.length > 0) {
      layers.push({
        source: 'user_memory',
        content: this.formatMemories(memories),
        cacheable: false, // 动态
      });
    }
    
    // Layer 4: Installed Skill Prompts
    const skillPrompts = await this.skillService.getInstalledSkillPrompts(agentId);
    if (skillPrompts.length > 0) {
      layers.push({
        source: 'skill_prompts',
        content: skillPrompts.join('\n'),
        cacheable: true,
        ttl: 60_000, // 1min
      });
    }
    
    return this.composeLayers(layers);
  }
}
```

**Prompt Caching 集成**（Claude API `cache_control`）：

```typescript
// 在 Anthropic API 调用中利用 cache_control
const systemBlocks = [
  {
    type: 'text',
    text: baseSystemPrompt,       // 高频不变
    cache_control: { type: 'ephemeral' },  // 触发 prompt cache
  },
  {
    type: 'text', 
    text: dynamicContext,         // 用户记忆等动态部分
  },
];
```

**收益**：
- Prompt cache 命中率提升 → token 成本降低 ~50-70%
- 上下文层次清晰，Agent 个性化与平台策略解耦
- 缓存 TTL 防止过期上下文

---

### P1：精确成本追踪

**问题**：当前用 `Math.ceil(text.length / 4)` 估算 token，误差可达 30-50%。无按模型定价。

**Claude Code 做法**：
- 从 API 响应的 `usage` 字段获取精确 token 数
- `modelCost.ts` 维护每个模型的 input/output/cache 价格
- `calculateUSDCost(model, inputTokens, outputTokens, cacheMetrics)` 精确计算
- 累计到 session 级别

**Agentrix 优化方案**：

```typescript
// backend/src/modules/cost-tracker/model-pricing.ts
const MODEL_PRICING: Record<string, { inputPer1M: number; outputPer1M: number; cachePer1M?: number }> = {
  'claude-opus-4':    { inputPer1M: 15.0,  outputPer1M: 75.0,  cachePer1M: 1.5 },
  'claude-sonnet-4':  { inputPer1M: 3.0,   outputPer1M: 15.0,  cachePer1M: 0.3 },
  'claude-haiku-3.5': { inputPer1M: 0.80,  outputPer1M: 4.0,   cachePer1M: 0.08 },
  'gpt-4o':           { inputPer1M: 2.5,   outputPer1M: 10.0 },
  'gpt-4o-mini':      { inputPer1M: 0.15,  outputPer1M: 0.60 },
  'gemini-2.0-flash': { inputPer1M: 0.075, outputPer1M: 0.30 },
  'deepseek-v3':      { inputPer1M: 0.27,  outputPer1M: 1.10 },
};

// backend/src/modules/cost-tracker/cost-tracker.service.ts
class CostTrackerService {
  // 从 LLM 响应提取真实 usage → 精确计费
  accumulateFromResponse(model: string, usage: { input_tokens: number; output_tokens: number; cache_read?: number }) {
    const pricing = MODEL_PRICING[model];
    const cost = 
      (usage.input_tokens / 1_000_000) * pricing.inputPer1M +
      (usage.output_tokens / 1_000_000) * pricing.outputPer1M +
      ((usage.cache_read || 0) / 1_000_000) * (pricing.cachePer1M || pricing.inputPer1M * 0.1);
    
    this.sessionCost += cost;
    this.sessionUsage.input += usage.input_tokens;
    this.sessionUsage.output += usage.output_tokens;
    
    // 实时通过 SSE 告知客户端
    return { cost, totalSessionCost: this.sessionCost };
  }
}
```

**配额系统升级**：
```
当前: estimateTokens(text.length / 4) → 粗糙
优化: API response.usage.input_tokens / output_tokens → 精确
```

---

### P1：消息规范化 & 内容预算

**问题**：当前直接把 DB 中最多 80 条消息传给 LLM，无内容截断、无大结果外置。一次 search_products 返回 10KB JSON 的消息会吃掉大量 context window。

**Claude Code 做法**：
- `normalizeMessagesForAPI()` 过滤 UI-only 消息
- `content replacement budget`: 超长工具结果写磁盘，消息中替换为引用
- `maxResultSizeChars: 100000`，超出持久化

**Agentrix 优化方案**：

```typescript
// backend/src/modules/query-engine/message-normalizer.ts
class MessageNormalizer {
  private readonly MAX_TOOL_RESULT_CHARS = 4000;  // 单个工具结果上限
  private readonly MAX_TOTAL_CONTEXT_CHARS = 120_000;  // ~30K tokens

  normalize(messages: Message[]): Message[] {
    let result = messages
      .filter(m => !m.metadata?.uiOnly)                    // 1. 过滤 UI-only 消息
      .map(m => this.truncateToolResults(m))                // 2. 截断超长工具结果
      .map(m => this.compactOldToolResults(m, messages));   // 3. 老消息中的工具结果摘要化

    // 4. 总长度预算控制 — 从最老的消息开始摘要
    while (this.estimateChars(result) > this.MAX_TOTAL_CONTEXT_CHARS && result.length > 4) {
      result = this.summarizeOldestTurn(result);
    }
    
    return result;
  }

  private truncateToolResults(msg: Message): Message {
    if (msg.role !== 'user' || !msg.toolResults) return msg;
    
    return {
      ...msg,
      toolResults: msg.toolResults.map(tr => ({
        ...tr,
        content: tr.content.length > this.MAX_TOOL_RESULT_CHARS
          ? tr.content.slice(0, this.MAX_TOOL_RESULT_CHARS) + '\n...[结果已截断，共 ' + tr.content.length + ' 字符]'
          : tr.content,
      })),
    };
  }
}
```

---

### P2：Hook 系统 — pre/post 工具生命周期

**问题**：当前 pre_tool_use / post_tool_use hook 是简单事件触发，无法修改工具输入或拦截执行。

**Claude Code 做法**：
- `preToolUse` hook 可 reject/modify 输入
- `postToolUse` hook 可 transform 输出
- `sessionStart` hook 注入上下文
- Hook 有优先级排序

**Agentrix 优化方案**：

```typescript
// backend/src/modules/tool-registry/hooks/tool-hooks.service.ts
interface PreToolHook {
  priority: number;                    // 数字越大越先执行
  match: string | RegExp;             // 匹配工具名
  handler(ctx: HookContext): Promise<
    | { action: 'allow' }                         // 放行
    | { action: 'deny'; reason: string }          // 拒绝
    | { action: 'modify'; input: any }            // 修改输入
    | { action: 'replace'; result: ToolResult }   // 直接返回结果（短路）
  >;
}

interface PostToolHook {
  priority: number;
  match: string | RegExp;
  handler(ctx: HookContext, result: ToolResult): Promise<ToolResult>;
}

// 内置 hooks 示例
const paymentGuardHook: PreToolHook = {
  priority: 100,
  match: /^(checkout|buy|x402_pay|quickpay)/,
  async handler(ctx) {
    const balance = await walletService.getBalance(ctx.userId);
    if (balance < ctx.estimatedCost) {
      return { action: 'deny', reason: `余额不足: ${balance} < ${ctx.estimatedCost}` };
    }
    return { action: 'allow' };
  }
};

const auditLogHook: PostToolHook = {
  priority: 0,
  match: /.*/,
  async handler(ctx, result) {
    await auditService.logToolExecution(ctx.userId, ctx.toolName, ctx.input, result);
    return result;
  }
};
```

---

### P2：权限系统升级 — 规则引擎

**问题**：当前是 20+ 个布尔字段 (`skillSearchEnabled`, `commercePurchaseEnabled` ...)，灵活性差，无法表达"允许 git 开头的命令"这类细粒度规则。

**Claude Code 做法**：
- 5 层规则源 (user / project / local / flag / policy)
- Glob 模式匹配: `"Bash(git *)"`, `"FileEdit(src/**)"` 
- 推测分类器：Bash 命令安全性预判

**Agentrix 优化方案**：

```typescript
// backend/src/modules/permissions/permission-rule.ts
interface PermissionRule {
  pattern: string;        // glob: "checkout*", "skill_execute(payment*)", "*"
  behavior: 'allow' | 'deny' | 'ask';  // ask = 需要用户批准
  scope: 'session' | 'persistent';
  source: 'platform' | 'agent_owner' | 'user' | 'admin';
  priority: number;       // 高优先级覆盖低优先级
}

// 规则匹配引擎
class PermissionEngine {
  evaluate(toolName: string, input: any, rules: PermissionRule[]): PermissionBehavior {
    // 按 priority 降序排列
    const sorted = rules.sort((a, b) => b.priority - a.priority);
    
    for (const rule of sorted) {
      if (minimatch(toolName, rule.pattern) || 
          minimatch(`${toolName}(${JSON.stringify(input)})`, rule.pattern)) {
        return rule.behavior;
      }
    }
    
    return 'ask';  // 默认询问 (fail-safe)
  }
}
```

---

### P2：Coordinator 模式 — 多 Agent 编排

**问题**：当前 `create_subtask` 是简单的任务分发，无真正的 Agent 协作：子任务无独立 context、无工具限制、无并发控制。

**Claude Code 做法**：
- `AgentTool` 派生子 Agent，拥有独立 `QueryEngine` 实例
- 子 Agent 有受限工具集 (`ASYNC_AGENT_ALLOWED_TOOLS`)
- 否决追踪：子 Agent 权限否决累积，达阈值升级
- `setAppState` 对子 Agent 是 no-op（防竞态）

**Agentrix 优化方案**：

```typescript
// backend/src/modules/coordinator/coordinator.service.ts
class CoordinatorService {
  async spawnSubAgent(parentCtx: ToolContext, config: SubAgentConfig): Promise<SubAgentHandle> {
    // 1. 创建独立 QueryEngine 实例
    const subEngine = new QueryEngine({
      tools: this.filterTools(parentCtx.tools, config.allowedTools),
      maxTurns: config.maxTurns || 10,
      maxBudgetUsd: config.budgetUsd || 0.50,
      systemPrompt: this.buildSubAgentPrompt(parentCtx, config),
    });
    
    // 2. 子 Agent 在后台执行
    const handle = new SubAgentHandle(subEngine, parentCtx.sessionId);
    handle.start(config.task);
    
    return handle;
  }

  private filterTools(allTools: Tool[], allowList: string[]): Tool[] {
    // 子 Agent 只能用白名单工具
    return allTools.filter(t => allowList.includes(t.name));
  }
}
```

---

## 三、实施路线图

```
Phase 1 — 基础设施 (2-3 周)
├── P0: Tool Registry 模块（声明式工具注册）
├── P0: 统一 SSE 事件协议 + 共享解析器
└── P1: withRetry 重试引擎

Phase 2 — 引擎核心 (2-3 周) 
├── P0: QueryEngine 重构（有状态对话引擎）
├── P0: ToolExecutor 并发执行器
├── P1: MessageNormalizer 消息规范化
└── P1: 精确成本追踪

Phase 3 — 高级能力 (2-3 周)
├── P1: 分层上下文系统 + Prompt Cache
├── P2: Hook 系统 (pre/post tool)
├── P2: 权限规则引擎
└── P2: Coordinator 多 Agent 编排

Phase 4 — 客户端统一 (1-2 周)
├── 三端接入新 SSE 协议
├── 工具进度实时展示 UI
└── 审批 UI 统一 (Desktop 已有，Mobile/Web 补齐)
```

---

## 四、迁移策略

### 不破坏现有功能

1. **双轨运行**：新 `QueryEngine` 通过 feature flag 启用，旧路径保持兼容
2. **工具渐进迁移**：每个工具文件化后自动 fallback 到旧 switch-case
3. **SSE 协议向后兼容**：新事件类型客户端不认识就忽略，`text_delta` 等同旧 `data: {chunk}`
4. **两条 chat 路径** 最终合并为一条（通过 QueryEngine 统一入口），从根本上消除同步问题

### 关键度量

| 指标 | 当前 | 目标 |
|------|------|------|
| 工具执行延迟 (3 个只读工具并发) | ~3s (串行) | ~1s (并行) |
| Token 成本估算误差 | 30-50% | <5% |
| 新增一个工具需改文件数 | 3 个 | 1 个 |
| Prompt cache 命中率 | 0% | 60-80% |
| 429/529 重试成功率 | 0% | 85%+ |
| 大工具结果 context 膨胀 | 无限增长 | 4KB 上限 |

---

## 五、总结

Claude Code 的 Harness Engineering 核心哲学：

> **"每个工具是一等公民，引擎是有状态的流式循环，权限是声明式规则，错误是可重试的降级。"**

Agentrix 当前的架构已经具备完整的多端、多模型、支付、市场能力（这些是 Claude Code 不具备的），但在 **AI Agent 运行时层**（工具编排、对话引擎、流式协议、权限模型）上有显著提升空间。本方案建议优先重构这 4 个核心模块，使 Agentrix 的 agent 运行时达到 Claude Code 级别的工程成熟度，同时保留 Agentrix 独有的商业平台优势。

---
---

# 附录：深度子系统分析

> 以下为 Claude Code 5 大子系统的源码级深度分析 + Agentrix 对应优化方案

---

## 附录 A：记忆系统（Memory / memdir）

### A.1 Claude Code 记忆系统架构

Claude Code 的记忆系统是**文件级持久化存储层**，跨会话存活，核心哲学：只存储无法从代码/git 推导的上下文。

#### 目录结构

```
~/.claude/
├── projects/
│   └── <canonicalized-project-root>/
│       └── memory/
│           ├── MEMORY.md              # 私有索引（入口点）
│           ├── user_expertise.md      # 用户类记忆
│           ├── feedback_no_mocks.md   # 反馈类记忆
│           ├── project_deadline.md    # 项目类记忆
│           ├── reference_grafana.md   # 引用类记忆
│           └── team/                  # @feature('TEAMMEM')
│               ├── MEMORY.md          # 团队索引
│               └── *.md              # 共享记忆
```

#### 4 类型封闭分类法

```typescript
type MemoryType = 'user' | 'feedback' | 'project' | 'reference'
```

| 类型 | 范围 | 内容 | 保存时机 | 衰减速度 |
|------|------|------|---------|---------|
| `user` | 永远私有 | 用户角色/专长/偏好 | 用户透露个人信息时 | 极慢 |
| `feedback` | 默认私有 | 工作方式指导（"不要这样做"） | 用户纠正或确认时 | 慢 |
| `project` | 倾向团队 | 进行中的工作/目标/截止日期 | 状态更新时 | **快**（需要 why） |
| `reference` | 通常团队 | 外部系统指针（Grafana/Slack/Linear） | 提到外部资源时 | 中 |

#### 文件格式：YAML 前端 + Markdown

```markdown
---
name: 用户偏好简洁回复
description: 沟通风格调整
type: user
---

用户偏好简洁响应，不需要尾部总结。他们认为自己能读代码时，冗长解释是干扰。

**Why:** 早期经验表明他们重视速度和直接性。

**How to apply:** 去掉总结块，让 diff 自己说话。
```

#### 发现 → 加载 → 注入流水线

```
1. 发现阶段（查询时）
   用户查询 → findRelevantMemories()
     ├── scanMemoryFiles(memoryDir)     // 最多 200 文件，按 mtime 排
     │   └── 只读前端（前 30 行）
     ├── sideQuery(Sonnet) 选择 Top-5   // 语义检索
     └── 返回 MemoryHeader[] (路径 + mtime)

2. 加载阶段（Prompt 构建）
   MEMORY.md (入口点) → truncateEntrypointContent()
     ├── 行数上限: MAX_ENTRYPOINT_LINES = 200
     ├── 字节上限: MAX_ENTRYPOINT_BYTES = 25,000
     └── 超出则追加警告

3. 新鲜度检查
   记忆检索 → memoryAge(mtimeMs)
     ├── <1 天: 静默
     ├── ≥1 天: 包裹 <system-reminder> 过期提醒
     └── "此记忆已 N 天，请与当前代码核实"

4. 去重（保存时）
   保存请求 → 检查已有同主题记忆
     ├── 存在 → 更新（而不是新建）
     └── MEMORY.md 索引条目 <150 字符
```

#### 安全性

`sanitizePathKey()` 拒绝：
- Null 字节、反斜杠、绝对路径
- URL 编码遍历 (`%2e%2e%2f`)
- Unicode 标准化攻击（全角 `．．／`）

### A.2 Agentrix 当前记忆系统

```
AgentMemory 实体:
- userId, agentId, content, scope (SESSION | USER)
- 通过 save_memory 工具创建
- 注入方式：直接拼接到 system prompt
- 无分类、无语义检索、无新鲜度管理、无去重
```

### A.3 Agentrix 优化方案：分层记忆系统

```typescript
// backend/src/modules/memory/

// === 记忆类型分类 ===
enum MemoryType {
  USER = 'user',           // 用户偏好/专长
  FEEDBACK = 'feedback',   // 工作反馈/纠正
  PROJECT = 'project',     // 项目进展/截止日期
  REFERENCE = 'reference', // 外部系统引用
  AGENT = 'agent',         // Agent 学到的行为模式（Agentrix 特有）
}

enum MemoryScope {
  SESSION = 'session',     // 仅当前会话
  USER = 'user',           // 跨会话持久
  TEAM = 'team',           // 团队共享（Agentrix 特有：同 workspace 的用户）
}

// === 记忆实体 ===
@Entity()
class AgentMemory {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() userId: string;
  @Column({ nullable: true }) agentId: string;
  @Column({ type: 'enum', enum: MemoryType }) type: MemoryType;
  @Column({ type: 'enum', enum: MemoryScope }) scope: MemoryScope;
  @Column() name: string;          // 简短标题
  @Column() description: string;   // 一行摘要
  @Column('text') content: string; // 完整内容（含 Why / How to apply）
  @Column({ type: 'float', default: 1.0 }) relevanceScore: number;
  @Column() createdAt: Date;
  @Column() updatedAt: Date;       // 用于新鲜度计算
  @Column({ nullable: true }) expiresAt: Date; // project 类型可设过期
}

// === 记忆服务 ===
class MemoryService {
  
  // 语义检索 Top-K（参考 Claude Code 的 sideQuery Sonnet 做法）
  async findRelevantMemories(
    userId: string, 
    agentId: string, 
    query: string, 
    limit: number = 5
  ): Promise<AgentMemory[]> {
    // 1. 加载该用户+Agent 的所有记忆（上限 200 条）
    const all = await this.memoryRepo.find({
      where: [
        { userId, scope: MemoryScope.USER },
        { userId, agentId, scope: MemoryScope.SESSION },
        { agentId, scope: MemoryScope.TEAM },
      ],
      order: { updatedAt: 'DESC' },
      take: 200,
    });
    
    if (all.length <= limit) return all;
    
    // 2. 用 LLM 做语义匹配选择 Top-K
    const manifest = all.map(m => `[${m.id}] ${m.type}: ${m.name} — ${m.description}`).join('\n');
    const selected = await this.llmRouter.quickQuery(
      `给定用户查询: "${query}"\n从以下记忆中选择最相关的 ${limit} 条，返回 ID 列表:\n${manifest}`
    );
    
    return this.parseSelectedIds(selected, all);
  }

  // 新鲜度标记（参考 Claude Code memoryAge）
  formatWithFreshness(memory: AgentMemory): string {
    const ageDays = (Date.now() - memory.updatedAt.getTime()) / 86400_000;
    let content = `## ${memory.name}\n${memory.content}`;
    
    if (ageDays >= 1) {
      content = `<stale-warning>此记忆已 ${Math.floor(ageDays)} 天未更新，请与当前状态核实</stale-warning>\n${content}`;
    }
    
    return content;
  }

  // 去重保存（参考 Claude Code 的更新而非新建策略）
  async saveOrUpdate(dto: CreateMemoryDto): Promise<AgentMemory> {
    // 查找同主题已有记忆
    const existing = await this.memoryRepo.findOne({
      where: { userId: dto.userId, agentId: dto.agentId, name: dto.name }
    });
    
    if (existing) {
      existing.content = dto.content;
      existing.updatedAt = new Date();
      return this.memoryRepo.save(existing);
    }
    
    return this.memoryRepo.save(this.memoryRepo.create(dto));
  }
}
```

#### 注入策略升级

```
当前: 全部记忆直接拼接 → system prompt
优化: 
  1. 静态层（基础 prompt + Agent profile）→ prompt cache
  2. 记忆层（Top-5 语义检索 + 新鲜度标记）→ 动态注入
  3. 预算控制：MAX_MEMORY_TOKENS = 3000（~12KB）
```

---

## 附录 B：Auto-Compaction（自动压缩）

### B.1 Claude Code 压缩架构

#### 触发条件

| 触发 | 条件 | 行为 |
|------|------|------|
| **主动压缩** | `contextWindow - maxOutput - reserveBuffer` 溢出 | `autoCompactIfNeeded()` |
| **被动压缩** | API 返回 `prompt-too-long` | 按 API-round 组从最旧开始裁剪 |
| **手动** | 用户命令 | 强制压缩 |

保留缓冲: `MAX_OUTPUT_TOKENS_FOR_SUMMARY = 20,000` (p99.99 摘要 = 17.3KB)

#### 压缩流程（9 步）

```
1. stripImagesFromMessages()          // 图片 → [image] 占位符
2. stripReinjectedAttachments()       // 移除 skill 发现/清单（反正下轮会重新注入）
3. groupMessagesByApiRound()          // 按 API 调用轮次分组
4. 构建压缩 prompt（禁止工具调用）
5. 流式调用 LLM 生成摘要
6. 结构化输出格式:
   <analysis>[思考过程]</analysis>
   <summary>
   1. 主要请求和意图
   2. 关键技术概念
   3. 文件和代码段（带片段）
   4. 错误及修复方式
   5. 问题解决（已解决 + 进行中）
   6. 所有用户消息（非工具结果）
   7. 待处理任务
   8. 当前工作（摘要前最后一步）
   9. 建议下一步
   </summary>
7. 创建 SystemCompactBoundaryMessage（边界标记 + 元数据）
8. runPostCompactCleanup() — 恢复关键上下文:
   ├── 文件恢复预算: 50,000 tokens, 最多 5 文件, 每文件 5,000 tokens
   └── Skill 恢复预算: 25,000 tokens, 每 skill 5,000 tokens
9. 重新注入 agent_listing / mcp_instructions / deferred_tools
```

#### prompt-too-long 重试循环

```typescript
const MAX_PTL_RETRIES = 3;
// 如果压缩请求本身也触发 prompt-too-long:
// → 从最旧 API-round 组裁掉 20% → 重试
// → 最多 3 次
```

#### RecompactionInfo（防止压缩循环）

```typescript
type RecompactionInfo = {
  isRecompactionInChain: boolean,    // 是否在链式压缩中
  turnsSincePreviousCompact: number, // 上次压缩后的轮次数
  previousCompactTurnId?: string,
  autoCompactThreshold: number,
}
```

#### snipReplay（历史快照重放）

```typescript
// QueryEngine 配置中的可选功能
snipReplay?: (yieldedSystemMsg, store) => { messages, executed } | undefined
// 用于 HISTORY_SNIP feature：允许在不重新摘要的情况下重放压缩历史
```

### B.2 Agentrix 当前做法

```
- 加载最多 80 条消息（硬截断）
- 无摘要、无压缩、无边界标记
- 工具结果 > 2000 字符简单截断 + ...[truncated]
- 旧消息的大工具结果不断膨胀 context
```

### B.3 Agentrix 优化方案：自动对话压缩引擎

```typescript
// backend/src/modules/query-engine/compaction/

// === 压缩配置 ===
interface CompactionConfig {
  maxContextTokens: number;        // 默认 120,000 (~80% context window)
  reserveForOutput: number;        // 默认 8,000
  reserveForSummary: number;       // 默认 15,000
  maxPostCompactFiles: number;     // 默认 5
  maxTokensPerFile: number;        // 默认 3,000
  summaryModel: string;            // 默认 'claude-haiku-3.5'（便宜快速）
}

// === 压缩服务 ===
class ConversationCompactor {

  // 主动检查：是否需要压缩
  shouldCompact(messages: Message[], config: CompactionConfig): boolean {
    const totalTokens = this.estimateTokens(messages);
    return totalTokens > (config.maxContextTokens - config.reserveForOutput);
  }

  // 执行压缩
  async compact(
    messages: Message[], 
    config: CompactionConfig,
    onProgress?: (event: StreamEvent) => void
  ): Promise<CompactionResult> {
    
    // 1. 分离：保留最近 N 轮 + 压缩旧消息
    const { toSummarize, toPreserve } = this.splitMessages(messages);
    
    // 2. 预处理：清理图片和超长工具结果
    const cleaned = this.preprocess(toSummarize);
    
    // 3. 按 API 轮次分组
    const rounds = this.groupByApiRound(cleaned);
    
    // 4. 调用 LLM 生成结构化摘要
    onProgress?.({ type: 'system', data: '正在压缩对话历史...' });
    
    const summary = await this.generateSummary(rounds, config);
    
    // 5. 构建压缩边界消息
    const boundaryMessage: CompactBoundaryMessage = {
      role: 'system',
      type: 'compact_boundary',
      content: summary,
      metadata: {
        summarizedCount: toSummarize.length,
        summaryTokens: this.estimateTokens([{ content: summary }]),
        preCompactTokens: this.estimateTokens(toSummarize),
        compactedAt: new Date(),
      }
    };
    
    // 6. 文件恢复：最近引用的文件内容重新注入（预算内）
    const fileRecovery = await this.recoverRecentFiles(toSummarize, config);
    
    return {
      messages: [boundaryMessage, ...fileRecovery, ...toPreserve],
      savedTokens: this.estimateTokens(toSummarize) - this.estimateTokens([boundaryMessage]),
    };
  }

  // 结构化摘要 prompt（参考 Claude Code 9 项输出格式）
  private async generateSummary(rounds: MessageRound[], config: CompactionConfig): Promise<string> {
    const prompt = `你是对话历史压缩器。分析以下对话并生成结构化摘要。
    
禁止: 调用任何工具。只输出文本。

请按以下格式输出:

<summary>
1. **主要请求**: [用户的核心意图]
2. **关键决策**: [做了哪些技术决策，为什么]
3. **文件变更**: [修改了哪些文件，关键改动]
4. **错误与修复**: [遇到什么问题，如何解决]
5. **待处理**: [尚未完成的任务]
6. **当前进度**: [摘要前最后在做什么]
</summary>

对话内容:
${this.formatRoundsForSummary(rounds)}`;

    return this.llmRouter.quickQuery(prompt, { model: config.summaryModel });
  }
}

// === 集成到 QueryEngine ===
class QueryEngine {
  async *submitMessage(userInput: string): AsyncGenerator<StreamEvent> {
    // ... 现有逻辑 ...
    
    // 每轮开始前检查是否需要压缩
    if (this.compactor.shouldCompact(this.messages, this.compactionConfig)) {
      const result = await this.compactor.compact(
        this.messages, 
        this.compactionConfig,
        (event) => { /* yield to SSE */ }
      );
      this.messages = result.messages;
      yield { type: 'system', data: `已压缩 ${result.savedTokens} tokens 的历史对话` };
    }
    
    // ... 继续正常流程 ...
  }
}
```

#### 与 DB 持久化的集成

```
当前: AgentMessage 表存原始消息，加载最多 80 条
优化: 
  1. 新增 compact_boundary 类型消息
  2. 加载时检测: 如果有 compact_boundary → 从边界开始加载
  3. 边界消息包含摘要 + 元数据
  4. 旧消息仍保留在 DB（审计），但不再发送给 LLM
```

---

## 附录 C：多 Agent 编排系统

### C.1 Claude Code 完整多 Agent 架构

Claude Code 的多 Agent 是**业界最复杂**的实现之一，包含 4 种编排模式：

#### 模式对比

| 模式 | 触发方式 | 并发 | 工具集 | 隔离 | 通信 |
|------|---------|------|--------|------|------|
| **Standard Spawn** | `AgentTool(subagent_type)` | 默认后台异步 | 受限白名单 | 无 | tool_result |
| **Fork** | `AgentTool()` 省略类型 | 异步 | 继承父工具集 | 无 | 继承对话历史 |
| **Coordinator** | `COORDINATOR_MODE=1` | workers 并行 | 受限 + 内部工具 | 无 | 工具结果上浮 |
| **Team/Swarm** | `TeamCreateTool` | 并行独立 | 各自配置 | git worktree/remote | **邮箱系统** |

#### AgentTool 输入 Schema

```typescript
{
  description: string,       // 3-5 词任务描述
  prompt: string,            // 完整任务指令
  subagent_type?: string,    // 指定 Agent 类型
  model?: 'sonnet'|'opus'|'haiku',  // 模型覆盖
  run_in_background?: boolean,
  
  // KAIROS Team 扩展:
  name?: string,             // 可寻址名称 (用于 SendMessage)
  team_name?: string,        // 团队上下文
  mode?: PermissionMode,     // 权限模式
  isolation?: 'worktree' | 'remote',  // 隔离方式
  cwd?: string,              // 工作目录
}
```

#### 子 Agent 工具过滤

```
基础禁止列表 (ALL_AGENT_DISALLOWED_TOOLS):
  - AgentTool（防递归派生）
  - DialogLauncher, ConfigTool
  - 其他 UI/配置工具

自定义 Agent 额外禁止 (CUSTOM_AGENT_DISALLOWED_TOOLS):
  - 更多限制性工具

异步 Agent 白名单 (ASYNC_AGENT_ALLOWED_TOOLS):
  - Bash, FileRead, FileEdit, FileWrite, Glob, Grep, LSP
  - NotebookEdit, MCPTool, SkillTool
  
  例外: 进程内队友可额外使用:
  - AgentTool（有限递归）
  - IN_PROCESS_TEAMMATE_ALLOWED_TOOLS
```

#### Team/Swarm 邮箱系统

```typescript
// SendMessageTool 消息类型
{ to: 'agent-name', message: string }           // 点对点
{ to: '*', message: string }                    // 广播
{ to: 'agent-name', message: {                  // 结构化
    type: 'shutdown_request' | 'plan_approval_response',
    request_id: string,
    approve: boolean,
    feedback?: string
  }
}

// 邮箱写入
await writeToMailbox(recipientName, {
  from: senderName,
  text: content,
  summary,
  timestamp: ISO,
  color: senderColor     // UI 着色
}, teamName)
```

#### Fork Subagent 的 Prompt Cache 优化

```
[...完整对话历史, 
 assistantMessage(所有tool_use + thinking + text), 
 userMessage(
   tool_use_1: 占位符结果,    // 每个子 fork 相同
   tool_use_2: 占位符结果,    // 每个子 fork 相同
   最后一个文本块: 子任务指令  // 仅此处不同
 )]

→ 最大化前缀匹配 → prompt cache 命中率 ~90%
```

### C.2 Agentrix 当前多 Agent 做法

```
- create_subtask 工具: 将任务分发到 desktop/mobile
- agent_invoke 工具: 调用其他 Agent 的 API
- 无真正的子 Agent QueryEngine 实例
- 无工具过滤/受限
- 无邮箱/消息系统
- 无并发控制
```

### C.3 Agentrix 优化方案：三层 Agent 编排

```typescript
// backend/src/modules/agent-orchestration/

// === Layer 1: SubAgent 基础（对标 Standard Spawn）===
class SubAgentService {
  async spawn(parentCtx: ToolContext, config: SubAgentConfig): Promise<SubAgentHandle> {
    // 创建独立 QueryEngine
    const engine = new QueryEngine({
      tools: this.filterTools(parentCtx.tools, config.allowedTools),
      maxTurns: config.maxTurns || 10,
      maxBudgetUsd: config.budgetUsd || 0.50,
      systemPrompt: this.buildSubAgentPrompt(parentCtx, config),
      model: config.model || parentCtx.model,
    });
    
    const handle = new SubAgentHandle(engine, parentCtx.sessionId, config);
    
    // 异步执行
    handle.promise = this.executeInBackground(handle, config.task);
    
    return handle;
  }

  private filterTools(allTools: Tool[], allowList?: string[]): Tool[] {
    const DISALLOWED = ['agent_spawn', 'team_create', 'team_delete'];
    let filtered = allTools.filter(t => !DISALLOWED.includes(t.name));
    
    if (allowList) {
      filtered = filtered.filter(t => allowList.includes(t.name) || t.name.startsWith('mcp_'));
    }
    
    return filtered;
  }
}

// === Layer 2: Coordinator 模式（对标 Coordinator Mode）===
class CoordinatorService {
  async coordinate(
    parentCtx: ToolContext,
    task: string,
    workers: WorkerConfig[]
  ): Promise<CoordinatedResult> {
    const handles: SubAgentHandle[] = [];
    
    // 并行派生 workers
    for (const w of workers) {
      const handle = await this.subAgentService.spawn(parentCtx, {
        ...w,
        allowedTools: w.allowedTools || COORDINATOR_WORKER_TOOLS,
      });
      handles.push(handle);
    }
    
    // 等待所有 worker 完成（带超时）
    const results = await Promise.allSettled(
      handles.map(h => Promise.race([
        h.promise,
        sleep(h.config.timeoutMs || 120_000).then(() => ({ status: 'timeout' }))
      ]))
    );
    
    return this.aggregateResults(results);
  }
}

// === Layer 3: Team 邮箱系统（对标 Team/Swarm）===
class TeamService {
  private mailboxes = new Map<string, MailboxEntry[]>();

  async createTeam(config: TeamConfig): Promise<Team> {
    const team: Team = {
      name: config.name,
      leadAgentId: config.leadAgentId,
      members: [],
      scratchpadDir: `/tmp/agentrix-teams/${config.name}`,
    };
    return team;
  }

  async sendMessage(from: string, to: string, message: TeamMessage): Promise<void> {
    if (to === '*') {
      // 广播
      for (const [name, _] of this.mailboxes) {
        if (name !== from) this.writeToMailbox(name, { from, ...message });
      }
    } else {
      this.writeToMailbox(to, { from, ...message });
    }
  }

  async readMailbox(agentName: string): Promise<MailboxEntry[]> {
    const entries = this.mailboxes.get(agentName) || [];
    this.mailboxes.set(agentName, []); // 读后清空
    return entries;
  }

  private writeToMailbox(to: string, entry: MailboxEntry) {
    const box = this.mailboxes.get(to) || [];
    box.push({ ...entry, timestamp: new Date().toISOString() });
    this.mailboxes.set(to, box);
  }
}

// === 注册为 LLM 工具 ===
const agentSpawnTool: AgentrixTool = {
  name: 'agent_spawn',
  category: 'agent',
  description: '派生子 Agent 执行独立任务，可指定工具集和预算限制',
  inputSchema: z.object({
    task: z.string().describe('子 Agent 的任务描述'),
    model: z.enum(['opus', 'sonnet', 'haiku']).optional(),
    allowedTools: z.array(z.string()).optional(),
    maxTurns: z.number().max(20).optional(),
    budgetUsd: z.number().max(5.0).optional(),
    runInBackground: z.boolean().default(true),
  }),
  isReadOnly: false,
  isConcurrencySafe: true,
  requiresPayment: true,  // 子 Agent 消耗 token
  riskLevel: 1,
  async execute(input, ctx) {
    const handle = await subAgentService.spawn(ctx, input);
    if (input.runInBackground) {
      return { status: 'launched', agentId: handle.id, task: input.task };
    }
    return await handle.promise;
  }
};
```

---

## 附录 D：KAIROS 系统

### D.1 Claude Code KAIROS 架构

KAIROS 是 Claude Code 的 **feature-gated 助手模式扩展**，在标准 CLI 之上增加以下能力：

#### 激活方式

```typescript
// main.tsx 中的条件加载
const assistantModule = feature('KAIROS') 
  ? require('./assistant/index.js') : null;
const kairosGate = feature('KAIROS') 
  ? require('./assistant/gate.js') : null;
```

#### KAIROS 扩展的能力

| 能力 | 描述 | 工具/模块 |
|------|------|---------|
| **会话历史 API** | OAuth 认证分页获取历史会话 | `assistant/sessionHistory.ts` |
| **跨项目恢复** | 从不同项目恢复会话状态 | `launchTeleportResumeWrapper()` |
| **远程隔离** | CCR 环境中运行 Agent | `isolation: 'remote'` |
| **Worktree 隔离** | Git worktree 隔离 Agent | `isolation: 'worktree'` |
| **发送文件** | 向用户 workspace 发送文件 | `SendUserFileTool` |
| **推送通知** | 发送通知 | `PushNotificationTool` |
| **订阅 PR** | 订阅 GitHub PR 事件 | `SubscribePRTool` |
| **安装向导** | 首次使用引导流程 | `launchAssistantInstallWizard()` |
| **会话选择** | 跨项目会话选择 UI | `launchAssistantSessionChooser()` |

#### 会话历史 API 集成

```typescript
// assistant/sessionHistory.ts
export async function fetchLatestEvents(ctx: HistoryAuthCtx, limit = 100)
export async function fetchOlderEvents(ctx: HistoryAuthCtx, beforeId: string)

// 使用 CCR beta API
headers: { 'anthropic-beta': 'ccr-byoc-2025-07-29' }
endpoint: `/v1/sessions/{sessionId}/events`
```

#### 与压缩系统的集成

```typescript
// compact.ts 中
const sessionTranscriptModule = feature('KAIROS')
  ? require('../sessionTranscript/sessionTranscript.js') : null;

// 压缩时录制会话转录 → 用于跨项目恢复
```

#### 状态管理

```typescript
// bootstrap/state.ts
getKairosActive(): boolean
setIsRemoteMode(bool)
setMainThreadAgentType(type)
getOriginalCwd()
```

### D.2 Agentrix 对标方案：会话连续性引擎

KAIROS 的核心价值是**会话连续性**——Agentrix 作为平台级产品，天然有 DB 持久化优势。

```typescript
// backend/src/modules/session-continuity/

class SessionContinuityService {
  
  // === 跨设备会话恢复 ===
  async resumeSession(userId: string, sessionId: string, targetDevice: 'web' | 'mobile' | 'desktop'): Promise<SessionState> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId, userId } });
    const messages = await this.messageRepo.find({
      where: { sessionId },
      order: { sequenceNumber: 'ASC' },
    });
    
    // 如果消息太多，先压缩
    if (messages.length > 40) {
      const compacted = await this.compactor.compact(messages, this.compactionConfig);
      return { session, messages: compacted.messages, resumed: true };
    }
    
    return { session, messages, resumed: true };
  }

  // === 会话转移（桌面 → 手机）===
  async handoffSession(
    userId: string, 
    sessionId: string, 
    fromDevice: string, 
    toDevice: string
  ): Promise<HandoffResult> {
    // 1. 冻结当前会话状态
    const snapshot = await this.snapshotSession(sessionId);
    
    // 2. 创建 handoff token（5 分钟有效）
    const token = await this.createHandoffToken(userId, sessionId, snapshot);
    
    // 3. 通知目标设备
    await this.notificationService.sendToDevice(userId, toDevice, {
      type: 'session_handoff',
      sessionId,
      handoffToken: token,
    });
    
    return { handoffToken: token, expiresIn: 300 };
  }

  // === 会话摘要 API（对标 KAIROS sessionHistory）===
  async getSessionHistory(userId: string, limit: number = 20): Promise<SessionSummary[]> {
    const sessions = await this.sessionRepo.find({
      where: { userId },
      order: { lastMessageAt: 'DESC' },
      take: limit,
    });
    
    return sessions.map(s => ({
      id: s.id,
      agentName: s.metadata?.agentName,
      lastMessage: s.metadata?.lastUserMessage?.slice(0, 200),
      messageCount: s.metadata?.messageCount,
      lastActiveAt: s.lastMessageAt,
      devices: s.metadata?.devices || [],
    }));
  }
}
```

---

## 附录 E：权限系统（完整深度分析）

### E.1 Claude Code 权限架构全貌

#### 7 种权限模式

```typescript
type PermissionMode = 
  | 'default'           // 不确定时询问用户
  | 'acceptEdits'       // 自动接受文件编辑
  | 'bypassPermissions' // 全部自动允许
  | 'dontAsk'           // 仅用规则，不提示
  | 'plan'              // /plan 命令模式
  | 'auto'              // 分类器自动决策（feature-gated）
  | 'bubble'            // 内部：子 Agent 权限上浮给父进程
```

#### 5 层规则源（优先级从高到低）

```
policySettings    ← 企业管理 (MDM/远程) [最高优先级]
  ↓
flagSettings      ← GrowthBook feature flags
  ↓
localSettings     ← .claude/settings.json (项目本地)
  ↓
projectSettings   ← .claude.json / claude.json (项目级)
  ↓
userSettings      ← ~/.claude/*.settings.json (用户级)
```

当 `policySettings.allowManagedPermissionRulesOnly === true` 时，只使用 policySettings，忽略所有其他层。

#### 规则格式与解析

```typescript
// 纯工具匹配
"Bash"                    → { toolName: "Bash" }

// 带参数模式匹配
"Bash(npm install)"       → { toolName: "Bash", ruleContent: "npm install" }
"Bash(git *)"             → { toolName: "Bash", ruleContent: "git *" }  // glob

// MCP 服务器级匹配
"mcp__slack"              → 匹配 slack 服务器的所有工具
"mcp__slack__*"           → 同上（显式通配）
"mcp__slack__read_channel" → 只匹配特定工具

// 带特殊字符的转义
"Bash(python -c \"print\\(1\\)\")" → 正确转义括号
```

#### 2 阶段自动分类器（Auto-Mode Classifier）

```
Stage 1 (Fast): 
  - tool_use 模式，不带 thinking
  - 单次 API 请求
  - 快速判断: shouldBlock: boolean

Stage 2 (Thinking):
  - 当 Stage 1 不确定时触发
  - 使用 extended thinking (budget_tokens)
  - 更高准确率

分类器输入:
  buildTranscriptForClassifier(
    actionType: 'bash' | 'file_edit' | 'url_fetch',
    command: string,
    cwd: string,
    descriptions: string[],  // 用户+ML 描述
    behavior: 'allow' | 'deny' | 'ask'
  )

分类器输出:
  {
    shouldBlock: boolean,
    reason: string,
    stage: 'fast' | 'thinking',
    confidence: 'high' | 'medium' | 'low',
    usage: { inputTokens, outputTokens, cacheStats }
  }
```

#### 否决追踪与降级

```typescript
DENIAL_LIMITS = {
  maxConsecutive: 3,   // 连续 3 次否决 → 回退到交互提示
  maxTotal: 20         // 总计 20 次否决 → 回退到交互提示
}

recordDenial(state) → { consecutiveDenials++, totalDenials++ }
recordSuccess(state) → { consecutiveDenials: 0 }
shouldFallbackToPrompting(state) → 连续≥3 || 总计≥20
```

#### 推测执行（Speculative Checking）

```
用户请求 → 工具待执行
            ↓
       [并行启动]
       ↓          ↓
  渲染 UI       跑分类器
       ↓          ↓
  用户看到提示  分类器完成
       ↓
  如果分类器已判断 allow → 跳过交互提示，直接执行
  如果分类器判断 deny → 显示拒绝理由
  如果分类器超时 → 回退到正常交互提示
```

#### 权限 Explainer（风险解释器）

```typescript
// 使用 Haiku 模型生成风险评估
{
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH',
  explanation: '命令功能描述',
  reasoning: '为什么用户要执行此命令',
  risk: '可能出什么问题（<15字）'
}
// 异步运行，不阻塞用户操作
```

#### 安全白名单（分类器跳过）

```
永远允许（无需分类）:
  只读: FileRead, Grep, Glob, LSP, ToolSearch
  元数据: TodoWrite, Task(Create|Get|List|Update|Stop|Output)
  UI: AskUserQuestion, EnterPlanMode, ExitPlanMode
  协调: TeamCreate, TeamDelete, SendMessage
  杂项: Workflow, Sleep, TerminalCapture
```

### E.2 Agentrix 权限系统优化方案（增强版）

```typescript
// backend/src/modules/permissions/

// === 权限模式 ===
enum AgentrixPermissionMode {
  DEFAULT = 'default',           // 不确定时询问
  AUTO_APPROVE = 'auto_approve', // 全部自动（仅限信任 Agent）
  RULES_ONLY = 'rules_only',    // 仅用规则判断
  ASK_WRITES = 'ask_writes',    // 读操作自动，写操作询问
  LOCKED = 'locked',            // 企业管理锁定
}

// === 4 层规则源 ===
enum PermissionSource {
  PLATFORM = 'platform',     // Agentrix 平台策略（最高优先）
  AGENT_OWNER = 'agent_owner', // Agent 创建者配置
  USER = 'user',             // 用户会话级偏好
  WORKSPACE = 'workspace',   // 工作区设置
}

// === 权限规则 ===
interface PermissionRule {
  source: PermissionSource;
  priority: number;          // 同源内优先级
  pattern: string;           // glob: "checkout*", "skill_execute(payment*)"
  behavior: 'allow' | 'deny' | 'ask';
  scope: 'session' | 'persistent';
  conditions?: {
    maxAmount?: number;      // 支付类工具的金额限制
    timeWindow?: string;     // 时间窗口限制 "24h"
    maxCalls?: number;       // 调用次数限制
  };
}

// === 权限决策引擎 ===
class PermissionEngine {
  
  // 多层规则评估
  evaluate(toolName: string, input: any, context: PermissionContext): PermissionDecision {
    // 1. 安全白名单（只读工具直接放行）
    if (SAFE_READONLY_TOOLS.includes(toolName)) {
      return { behavior: 'allow', reason: { type: 'whitelist' } };
    }
    
    // 2. 按优先级加载所有规则
    const rules = this.loadRules(context);
    
    // 3. 平台锁定模式检查
    if (context.mode === AgentrixPermissionMode.LOCKED) {
      const platformRules = rules.filter(r => r.source === PermissionSource.PLATFORM);
      return this.matchFirstRule(toolName, input, platformRules);
    }
    
    // 4. 全层评估
    for (const rule of rules) {
      if (this.matchesPattern(toolName, input, rule.pattern)) {
        // 条件检查（金额/次数/时间）
        if (rule.conditions && !this.checkConditions(rule.conditions, context)) {
          continue;
        }
        return { behavior: rule.behavior, reason: { type: 'rule', rule } };
      }
    }
    
    // 5. 模式默认行为
    return this.modeDefault(context.mode, toolName);
  }

  // glob 模式匹配（对标 Claude Code）
  private matchesPattern(toolName: string, input: any, pattern: string): boolean {
    // "checkout*" 匹配 checkout_agentrix_cart
    if (minimatch(toolName, pattern)) return true;
    
    // "skill_execute(payment*)" 匹配 skill_execute 且参数含 payment
    const match = pattern.match(/^(\w+)\((.+)\)$/);
    if (match) {
      const [, tool, argPattern] = match;
      if (toolName === tool) {
        return minimatch(JSON.stringify(input), `*${argPattern}*`);
      }
    }
    
    return false;
  }
}

// === 否决追踪（对标 Claude Code denialTracking）===
class DenialTracker {
  private state = new Map<string, { consecutive: number; total: number }>();
  
  recordDenial(agentId: string) {
    const s = this.state.get(agentId) || { consecutive: 0, total: 0 };
    s.consecutive++;
    s.total++;
    this.state.set(agentId, s);
  }
  
  recordSuccess(agentId: string) {
    const s = this.state.get(agentId);
    if (s) s.consecutive = 0;
  }
  
  shouldFallbackToPrompting(agentId: string): boolean {
    const s = this.state.get(agentId);
    if (!s) return false;
    return s.consecutive >= 3 || s.total >= 20;
  }
}

// === 前端审批 UI 统一 ===
// SSE 事件驱动审批流
type ApprovalEvent = {
  type: 'approval_required';
  toolId: string;
  toolName: string;
  input: any;
  riskLevel: 0 | 1 | 2 | 3;
  explanation?: string;        // LLM 生成的风险解释
  suggestions?: string[];      // "总是允许此操作", "仅本次允许"
}

// 用户响应
type ApprovalResponse = {
  toolId: string;
  decision: 'allow' | 'deny';
  remember: 'session' | 'persistent' | 'once';
  modifiedInput?: any;         // 用户可以修改工具参数
}
```

---

## 附录 F：更新后的实施路线图

```
Phase 1 — 基础设施 (2-3 周)
├── P0: Tool Registry 模块（声明式工具注册）
├── P0: 统一 SSE 事件协议 + 共享解析器
└── P1: withRetry 重试引擎

Phase 2 — 引擎核心 (2-3 周) 
├── P0: QueryEngine 重构（有状态对话引擎 + AsyncGenerator）
├── P0: ToolExecutor 并发执行器（只读并行/写串行）
├── P0: Auto-Compaction 压缩引擎（9 项结构化摘要 + 文件恢复预算）
├── P1: MessageNormalizer 消息规范化
└── P1: 精确成本追踪（API usage → 模型定价表）

Phase 3 — 记忆 & 上下文 (2 周)
├── P0: 分层记忆系统（4 类型 + 语义检索 + 新鲜度）
├── P1: 分层上下文系统 + Prompt Cache
└── P1: 记忆注入预算控制（MAX_MEMORY_TOKENS = 3000）

Phase 4 — Agent 编排 (2-3 周)
├── P0: SubAgent 基础（独立 QueryEngine + 工具过滤 + 预算限制）
├── P1: Coordinator 模式（并行 worker + 结果聚合）
├── P2: Team 邮箱系统（点对点 + 广播 + 结构化消息）
└── P2: Agent 隔离（workspace 隔离 / 独立会话）

Phase 5 — 权限 & 连续性 (2 周)
├── P1: 权限规则引擎（4 层源 + glob 匹配 + 条件限制）
├── P2: 否决追踪 + 降级机制
├── P2: 前端统一审批 UI（三端 SSE 驱动）
└── P2: 会话连续性引擎（跨设备恢复 + 协议 handoff）

Phase 6 — 客户端统一 (1-2 周)
├── 三端接入新 SSE 协议 & 压缩状态显示
├── 工具进度实时展示 UI
└── 记忆管理 UI（查看/编辑/删除记忆）
```

### 更新后的关键度量

| 指标 | 当前 | 目标 |
|------|------|------|
| 工具执行延迟 (3 只读并发) | ~3s (串行) | ~1s (并行) |
| Token 成本估算误差 | 30-50% | <5% |
| 新增工具需改文件数 | 3 个 | 1 个 |
| Prompt cache 命中率 | 0% | 60-80% |
| 429/529 重试成功率 | 0% | 85%+ |
| 最大对话长度 | 80 条（硬截断） | **无限**（自动压缩） |
| 记忆检索相关性 | 全量拼接 | Top-5 语义匹配 |
| 子 Agent 预算控制 | 无 | $0.50/子任务 |
| 权限规则灵活度 | 20 个布尔字段 | glob 模式 + 条件 |
| 跨设备会话恢复 | 手动重开 | 带压缩的自动恢复 |
