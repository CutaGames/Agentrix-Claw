# Agentrix 三级混合 AI 架构 PRD — 端-边-云跨端跨应用协同重构

**版本**: 1.0  
**日期**: 2026-04-04  
**状态**: Draft  
**作者**: CEO Agent (@ceo)  
**关联文档**:
- `docs/PRD_CROSS_PLATFORM_VOICE.zh-CN.md` (现有跨端语音 PRD v2.0)
- `docs/PRD_WATCH_APP.md` (手表端 PRD v0.1)
- `docs/PRD_REALTIME_VOICE_MOBILE_FIRST.zh-CN.md` (语音 v1.0)
- `docs/MOBILE_PRD.md` (移动端整体 PRD)

---

## 〇、前言 — 为什么需要这次重构

### 0.1 核心判断

经过对 Agentrix 现有代码库（85+ NestJS 模块）的深度审计，以及对 Gemma 4 系列开源模型发布后行业格局的评估，我们得出以下关键判断：

1. **Agentrix 的语音架构已经跑通了"级联模式"的全链路**（STT→LLM→TTS），但级联模式存在不可逾越的延迟地板（~1.5s），且 ASR/TTS 的第三方 API 费用在用户规模化后将成为主要成本项。
2. **Gemma 4 Multimodal 的开源释放了端到端多模态语音的能力**，但当前的 t3.xlarge 服务器（无 GPU）无法本地部署，需要引入 GPU 算力节点。
3. **Gemma 4 的推理能力不足以完全替代 Opus 4.6 / GPT-5.4**，高复杂度任务（A2A 编排、代码生成、财务分析）仍需顶级闭源模型。
4. **AI 眼镜是 Agentrix "Agent 无处不在" 愿景的下一个高价值入口**，其"语音+视觉多模态"的交互模式完美匹配我们已有的经济身份体系。
5. **现有的跨端能力矩阵严重不均衡**：移动端已实现全双工/打断/分句 TTS，桌面端仍是半双工文件上传，Web 端几乎无能力。

### 0.2 重构目标

> **用一套统一的"端-边-云 三级混合架构"，实现所有端侧设备（手机/桌面/Web/AI 眼镜/手表/其他可穿戴）的语音与多模态体验一致化，同时将语音交互延迟降至 500ms 以内、API 成本降低 60%+。**

### 0.3 非目标

- 不自研 AI 眼镜硬件（适配市面开放生态设备）
- 不替换所有闭源 API（保留 Opus/GPT-5.4 作为"超脑"层）
- 不重写前端 UI 框架（React Native / Tauri / Next.js 保持不变）

---

## 一、现状分析与差距审计

### 1.1 现有语音架构 (AS-IS)

```
┌─────────────────────────────────────────────────────────────────┐
│  端侧设备                                                       │
│  📱 Mobile (Expo)   🖥️ Desktop (Tauri)   🌐 Web (Next.js)      │
│  ┌──────────┐       ┌──────────┐         ┌──────────┐          │
│  │expo-av   │       │MediaRec. │         │WebSpeech │          │
│  │expo-speech│      │voice.ts  │         │VoiceInput│          │
│  │AudioQueue│       │AudioQueue│         │VoiceOut  │          │
│  └────┬─────┘       └────┬─────┘         └────┬─────┘          │
│       │ PCM/m4a          │ webm/opus           │ text           │
└───────┼──────────────────┼─────────────────────┼────────────────┘
        │                  │                     │
        ▼                  ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  新加坡 t3.xlarge (18.139.157.116)                               │
│  NestJS Voice Gateway (Socket.IO /voice namespace)              │
│                                                                 │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐        │
│  │ STT Pipeline │   │ LLM Router   │   │ TTS Pipeline │        │
│  │              │   │              │   │              │        │
│  │ Gemini Free  │   │ LIGHT→Nova   │   │ Gemini TTS   │        │
│  │ → Deepgram   │   │ MED→Qwen/DS  │   │ → Edge TTS   │        │
│  │ → AWS Trans. │   │ HEAVY→Claude │   │ → Kokoro     │        │
│  │ → Groq       │   │              │   │ → AWS Polly  │        │
│  │ → Whisper    │   │              │   │              │        │
│  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘        │
│         │ text              │ text              │ audio          │
│         └──────────►────────┘──────────►────────┘               │
│                    (级联：STT→LLM→TTS)                           │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 现有能力矩阵 (已审计)

| 能力 | 📱 Mobile | 🖥️ Desktop | 🌐 Web | ⌚ Watch | 🕶️ Glass |
|------|-----------|-----------|--------|---------|-----------|
| 实时流式 STT | ✅ expo-speech | ❌ 文件上传 | ⚠️ Chrome only | ⚠️ 基础 | ❌ 无端 |
| 全双工对话 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 自然打断 (Barge-in) | ✅ | ❌ | ❌ | ❌ | ❌ |
| 分句流式 TTS | ✅ 句级 | ❌ 整段 | ❌ 整段 | ❌ | ❌ |
| 唤醒词 | ❌ | ❌ | ❌ | ❌ | ❌ |
| 跨应用后台监听 | ❌ | ❌ | ❌ | ❌ | ❌ |
| **跨端会话接续** | ✅ handoff 协议已实现 | ✅ | ❌ | ❌ | ❌ |
| 视觉多模态输入 | ❌ (仅图片 URL) | ❌ | ❌ | ❌ | ❌ |
| 端到端音频模型 | ⚠️ Gemini Live 初步 | ❌ | ❌ | ❌ | ❌ |
| 本地离线推理 | ❌ | ❌ | N/A | ❌ | ❌ |

### 1.3 核心差距

| 编号 | 差距 | 影响 | 严重度 |
|------|------|------|--------|
| G1 | 无端到端多模态模型（自部署） | 延迟地板 1.5s, 第三方 API 成本高 | 🔴 严重 |
| G2 | 桌面端/Web端语音能力严重落后移动端 | 用户体验不一致，跨端协同断裂 | 🔴 严重 |
| G3 | 无视觉多模态输入 | 无法支撑 AI 眼镜场景 | 🔴 严重 |
| G4 | 无离线/端侧推理能力 | 弱网/隐私场景完全不可用 | 🟡 中等 |
| G5 | 无唤醒词 | 无法"随时唤醒"，离"Agent 无处不在"差距大 | 🟡 中等 |
| G6 | 大小模型无协同路由 | 简单对话也耗费高价 API | 🟡 中等 |
| G7 | 无 GPU 算力节点 | 无法部署自有多模态模型 | 🔴 严重 |

---

## 二、目标架构 (TO-BE) — 端-边-云三级混合

### 2.1 架构全景

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        第一级：端侧 (On-Device)                          │
│                                                                          │
│   📱 Mobile          🖥️ Desktop        🕶️ AI Glass       ⌚ Watch        │
│   ┌───────────┐     ┌───────────┐     ┌──────────┐     ┌──────────┐    │
│   │Gemma Nano │     │Gemma Nano │     │唤醒词+VAD│     │唤醒词+VAD│    │
│   │(OTA 1.5G) │     │(内置/OTA) │     │(微型引擎)│     │(微型引擎)│    │
│   │           │     │           │     │          │     │          │    │
│   │• 唤醒词    │     │• 唤醒词    │     │• 蓝牙音频│     │• 蓝牙音频│    │
│   │• VAD      │     │• VAD      │     │  透传    │     │  透传    │    │
│   │• 隐私脱敏  │     │• 本地简单  │     │• 图像帧  │     │          │    │
│   │• 离线指令  │     │  对话     │     │  抓取    │     │          │    │
│   │• 意图路由  │     │• 意图路由  │     │          │     │          │    │
│   └─────┬─────┘     └─────┬─────┘     └─────┬────┘     └─────┬────┘    │
│         │                 │                  │ BLE           │ BLE     │
│         │  WebSocket      │  WebSocket       │               │          │
│         │                 │             ┌────▼────────────────▼───┐     │
│         │                 │             │   手机端 Relay Service   │     │
│         │                 │             │   (Agentrix-Claw)       │     │
│         │                 │             └────────┬───────────────┘     │
└─────────┼─────────────────┼──────────────────────┼──────────────────────┘
          │                 │                      │
          ▼                 ▼                      ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                   第二级：云端快思考 (Cloud Fast-Think)                    │
│                   新加坡 VPC 内网                                         │
│                                                                          │
│   ┌──────────────────────────────────────┐  ┌─────────────────────────┐ │
│   │  t3.xlarge (18.139.157.116)          │  │  g6.xlarge (GPU 节点)    │ │
│   │  NestJS 业务网关 + PostgreSQL         │  │  NVIDIA L4 · 24GB VRAM  │ │
│   │                                      │  │                         │ │
│   │  ┌────────────────────────────┐      │  │  ┌───────────────────┐  │ │
│   │  │  Voice Gateway v2         │      │  │  │ Gemma 4 31B       │  │ │
│   │  │  (统一 WebSocket 入口)     │◄────►│  │  │ Multimodal        │  │ │
│   │  │                            │ gRPC │  │  │                   │  │ │
│   │  │  • 会话管理                │      │  │  │ • Audio-in→out    │  │ │
│   │  │  • 设备路由                │      │  │  │ • Vision 理解     │  │ │
│   │  │  • 策略分流                │      │  │  │ • Tool Calling    │  │ │
│   │  │  • Handoff 编排            │      │  │  │ • 中/英/日多语种  │  │ │
│   │  │  • Token Quota 计量        │      │  │  │                   │  │ │
│   │  └────────────────────────────┘      │  │  └───────────────────┘  │ │
│   │                                      │  │                         │ │
│   │  ┌────────────────────────────┐      │  │  vLLM / SGLang 推理框架  │ │
│   │  │  LLM Router v2            │      │  │  内网端口 :8000          │ │
│   │  │  (大小模型智能调度)        │      │  │                         │ │
│   │  └────────────────────────────┘      │  └─────────────────────────┘ │
│   │                                      │                              │
│   └──────────────────────────────────────┘                              │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼ (仅 20% 高复杂度任务)
┌──────────────────────────────────────────────────────────────────────────┐
│                   第三级：超脑 API (Cloud Deep-Think)                     │
│                                                                          │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│   │ Anthropic     │  │ OpenAI       │  │ Google       │                  │
│   │ Opus 4.6      │  │ GPT-5.4      │  │ Gemini Ultra │                  │
│   │               │  │              │  │              │                  │
│   │ • 超复杂推理  │  │ • 代码生成   │  │ • 超长上下文 │                  │
│   │ • A2A 任务    │  │ • 专业分析   │  │ • 视频理解   │                  │
│   │ • 财务决策    │  │ • 多模态高级 │  │              │                  │
│   └──────────────┘  └──────────────┘  └──────────────┘                  │
│                                                                          │
│   按 Token 计费 · 仅通过 LLM Router 触发 · 无需常驻                      │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2.2 三级分工矩阵

| 维度 | 第一级：端侧 | 第二级：云端快思考 | 第三级：超脑 API |
|------|-------------|-------------------|-----------------|
| **部署** | 用户设备本地 | 新加坡 VPC 自有 GPU | 第三方 API 远程调用 |
| **模型** | Gemma Nano 2B (量化) | Gemma 4 31B Multimodal | Opus 4.6 / GPT-5.4 |
| **延迟** | <50ms (本地) | <500ms (内网 gRPC) | 2-15s (跨国网络+推理) |
| **成本** | $0 (本地算力) | ~$0.30/hr (g6 Spot) | $5-25/M tokens |
| **能力** | 唤醒词/VAD/脱敏/简单指令 | 日常对话/多模态/工具调用 | 代码生成/财务分析/复杂 A2A |
| **离线** | ✅ 完全可用 | ❌ 需网络 | ❌ 需网络 |
| **多模态** | ❌ 仅文本/音频 | ✅ 音频+视觉 | ✅ 音频+视觉+视频 |
| **覆盖请求** | ~10% (预筛选) | ~70% (日常交互) | ~20% (深度任务) |

### 2.3 请求生命周期 (一次典型的眼镜→多模型协作)

```
用户戴着 AI 眼镜，在超市看到一台 PS6
    │
    ▼
[第一级] 眼镜端：检测到唤醒词 "Hey Agentrix"
    │  本地 VAD 确认用户在说话
    │  开始蓝牙音频透传到手机
    ▼
[第一级] 手机 Relay：Gemma Nano 识别意图 →
    │  判断："需要视觉+比价" → 复杂度 MEDIUM → 发往云端
    │  同时触发眼镜摄像头抓取一帧 720p 图像
    ▼
[第二级] t3 网关：收到音频流 + 图像帧
    │  Voice Gateway v2 路由至 g6 GPU 节点
    ▼
[第二级] g6 GPU：Gemma 4 31B Multimodal
    │  端到端：直接从音频理解用户意图 + 识别图像中的 PS6
    │  调用 MCP 工具 search_agentrix_products("PS6")
    │  生成语音回复（500ms 内开始流式输出）
    │  → "这是 PS6 Pro，京东上 ¥3899，亚马逊 $499，需要我下单吗？"
    ▼
[第一级] 眼镜端播放语音回复
    │
用户说："帮我写个分析报告，对比 PS6 和 Xbox Series X 的技术参数"
    │
    ▼
[第二级] Gemma 4 判断：这是复杂分析任务 → 路由至第三级
    │  立刻语音播报："好的，我把这个任务交给高级分析师了，很快会有结果。"
    ▼
[第三级] Opus 4.6 API：深度推理 15 秒，输出结构化分析报告
    │  回调至第二级
    ▼
[第二级] Gemma 4 将 Opus 的文本结果转为语音流
    │  → "报告已完成，PS6 采用 AMD Zen 6 架构..."
    ▼
[第一级] 眼镜端语音播放 + 手机端推送完整报告到看板
```

---

## 三、重构方案 — 分模块详细设计

### 3.1 模块一：Voice Gateway v2 (后端核心重构)

**所在文件**: `backend/src/modules/voice/`

**现状**:
- `realtime-voice.gateway.ts` 已有完整的 Socket.IO /voice 命名空间
- 级联模式运行良好：Gemini STT → LLM → Edge TTS
- Gemini Live Adapter 已初步实现端到端通路
- Voice Session Handoff 已实现跨设备接续协议

**重构策略: 不推翻，双轨并行**

#### 3.1.1 新增 `IVoiceStreamStrategy` 接口

```typescript
// backend/src/modules/voice/strategies/voice-stream-strategy.interface.ts

export interface IVoiceStreamStrategy {
  readonly name: string;

  /**
   * 处理一个音频 chunk（PCM/opus）
   * 对于端到端模型：直接灌入模型
   * 对于级联模型：先 STT 再走 LLM
   */
  processAudioChunk(sessionId: string, chunk: Buffer): Promise<void>;

  /**
   * 处理一个图像帧（来自眼镜/手机摄像头）
   * 仅端到端多模态策略支持
   */
  processImageFrame?(sessionId: string, frame: Buffer, mimeType: string): Promise<void>;

  /**
   * 注册回调：当模型产生音频/文本输出时
   */
  onAudioResponse(callback: (sessionId: string, chunk: Buffer) => void): void;
  onTextResponse(callback: (sessionId: string, text: string, isFinal: boolean) => void): void;

  /**
   * 打断当前输出（Barge-in）
   */
  interrupt(sessionId: string): Promise<void>;

  /**
   * 结束会话
   */
  endSession(sessionId: string): Promise<void>;
}
```

#### 3.1.2 实现两套策略

```typescript
// 策略 A：保留现有级联模式（兜底/免费用户）
export class CascadeVoiceStrategy implements IVoiceStreamStrategy {
  // 复用现有的 Gemini STT → LLM Router → Edge TTS 逻辑
  // 不改一行现有代码，仅封装为策略接口
}

// 策略 B：新增端到端多模态模式（GPU 节点直连）
export class GemmaMultimodalVoiceStrategy implements IVoiceStreamStrategy {
  // gRPC 连接到 g6.xlarge 上的 vLLM/SGLang 服务
  // 音频流直接灌入模型，模型直出音频流
  // 支持图像帧注入（AI 眼镜场景）
}
```

#### 3.1.3 Voice Gateway v2 路由决策

```typescript
// 在 WebSocket 连接建立时，动态选择策略
private selectStrategy(session: VoiceSession): IVoiceStreamStrategy {
  // 优先级规则：
  // 1. AI 眼镜设备 → 强制端到端（需要视觉多模态）
  // 2. Premium / Pro 用户 → 端到端（极低延迟体验）
  // 3. GPU 节点不可用 → 降级为级联模式
  // 4. 免费用户 → 级联模式（成本控制）

  if (session.deviceType === 'smart_glass') return this.gemmaStrategy;
  if (session.userPlan === 'premium' && this.gpuNodeHealthy) return this.gemmaStrategy;
  return this.cascadeStrategy;
}
```

#### 3.1.4 新增 Socket.IO 事件

在现有协议基础上，新增：

| 事件 | 方向 | 用途 |
|------|------|------|
| `voice:image:frame` | Client→Server | 眼镜/手机发送图像帧 (Base64 JPEG) |
| `voice:strategy:info` | Server→Client | 告知客户端当前使用的策略 (cascade/e2e) |
| `voice:deepthink:start` | Server→Client | 通知前端：任务已转交超脑 API |
| `voice:deepthink:done` | Server→Client | 超脑任务完成，结果已就绪 |
| `voice:model:used` | Server→Client | 本次回复使用的模型信息 (用于计费展示) |

---

### 3.2 模块二：LLM Router v2 (大小模型智能调度)

**所在文件**: `backend/src/modules/llm-router/llm-router.service.ts`

**现状**:
- 已有 LIGHT/MEDIUM/HEAVY 三级分类
- 基于消息长度、函数调用、对话轮次的复杂度评分
- 模型目录：Nova Micro → Qwen → DeepSeek → Nova Pro → Claude Haiku

**重构策略: 扩展为四级，新增 Gemma 本地层和超脑 API 层**

#### 3.2.1 新增 TaskTier

```typescript
export enum TaskTier {
  LOCAL = 'local',     // 新增：端侧 Gemma Nano 可处理
  LIGHT = 'light',     // 保留：简单问答
  MEDIUM = 'medium',   // 保留：多步推理
  HEAVY = 'heavy',     // 保留：复杂推理
  ULTRA = 'ultra',     // 新增：超复杂任务，需要 Opus/GPT-5.4
}
```

#### 3.2.2 新增模型到目录

```typescript
// ── LOCAL tier (on-device, zero cost) ─────────────
{
  id: 'gemma-nano-2b-q4',
  provider: 'local',
  name: 'Gemma Nano 2B (4-bit)',
  inputCostPer1M: 0,
  outputCostPer1M: 0,
  maxTokens: 8_192,
  tiers: [TaskTier.LOCAL],
},

// ── MEDIUM tier 新增 Gemma 31B ────────────────────
{
  id: 'gemma-4-31b-multimodal',
  provider: 'self-hosted',
  name: 'Gemma 4 31B Multimodal',
  inputCostPer1M: 0.02,   // 仅电费分摊
  outputCostPer1M: 0.08,
  maxTokens: 128_000,
  tiers: [TaskTier.LIGHT, TaskTier.MEDIUM],
  capabilities: ['audio_in', 'audio_out', 'vision'],
},

// ── ULTRA tier 新增 ──────────────────────────────
{
  id: 'anthropic.claude-opus-4.6',
  provider: 'anthropic',
  name: 'Claude Opus 4.6',
  inputCostPer1M: 15.00,
  outputCostPer1M: 75.00,
  maxTokens: 200_000,
  tiers: [TaskTier.ULTRA],
},
{
  id: 'gpt-5.4',
  provider: 'openai',
  name: 'GPT-5.4',
  inputCostPer1M: 10.00,
  outputCostPer1M: 30.00,
  maxTokens: 256_000,
  tiers: [TaskTier.HEAVY, TaskTier.ULTRA],
},
```

#### 3.2.3 路由判定增强

```typescript
classifyTask(messages, options): TaskTier {
  let score = 0;

  // 现有规则保留 ...
  if (msgLen > 500) score += 2;
  if (hasFunctionCalling) score += 3;
  if (turnCount > 10) score += 2;

  // 新增规则
  if (options.hasImageFrame) score += 4;        // 视觉输入 → 至少 MEDIUM
  if (options.requiresCodeGen) score += 5;      // 代码生成 → HEAVY+
  if (options.requiresFinancial) score += 6;    // 财务决策 → ULTRA
  if (options.isA2AOrchestration) score += 7;   // A2A 多智能体编排 → ULTRA
  if (options.isSimpleGreeting) return TaskTier.LOCAL; // 简单寒暄 → 端侧

  if (score <= 1) return TaskTier.LOCAL;
  if (score <= 4) return TaskTier.LIGHT;
  if (score <= 7) return TaskTier.MEDIUM;
  if (score <= 10) return TaskTier.HEAVY;
  return TaskTier.ULTRA;
}
```

---

### 3.3 模块三：GPU 推理节点 (基础设施)

#### 3.3.1 节点规格

| 配置项 | 值 |
|--------|------|
| 实例类型 | g6.xlarge (如跑 31B 则 g6.12xlarge) |
| GPU | NVIDIA L4 × 1 (24GB VRAM) 或 × 4 |
| 区域 | ap-southeast-1 (新加坡，与 t3 同 VPC) |
| 推理框架 | vLLM 0.8+ 或 SGLang |
| 模型 | Gemma 4 (9B 或 31B) Multimodal |
| 接口 | OpenAI-compatible API (内网 :8000) |
| 通信 | t3↔g6 内网 gRPC/HTTP (~0.2ms RTT) |

#### 3.3.2 成本预估

| 方案 | 月成本 (USD) | 适用阶段 |
|------|-------------|---------|
| g6.xlarge Spot (9B 模型) | ~$250 | MVP/灰度测试 |
| g6.xlarge On-Demand (9B) | ~$700 | 小规模生产 |
| g6.12xlarge On-Demand (31B) | ~$5,500 | 规模化生产 |
| 按需临时拉起 (测试) | ~$3/天 | 开发期 |

#### 3.3.3 部署方式

```bash
# Docker Compose (g6 节点)
services:
  vllm:
    image: vllm/vllm-openai:latest
    runtime: nvidia
    ports:
      - "8000:8000"    # 仅绑定内网 IP
    environment:
      - MODEL=google/gemma-4-9b-multimodal
      - DTYPE=bfloat16
      - MAX_MODEL_LEN=32768
      - GPU_MEMORY_UTILIZATION=0.90
    deploy:
      resources:
        reservations:
          devices:
            - capabilities: [gpu]
```

---

### 3.4 模块四：端侧 Gemma Nano (移动端/桌面端)

#### 3.4.1 移动端集成 (Agentrix-Claw)

```
不打入主安装包 → OTA 按需下载

设置 → AI 引擎 → "开启本地加速模式"
  → 提示用户下载 1.5GB 离线模型包
  → 下载完成后存入 App 沙盒
  → 使用 llama.cpp (React Native 绑定) 或 ExecuTorch 进行推理
```

**职责边界**：
- ✅ 唤醒词本地识别
- ✅ VAD (语音活动检测）
- ✅ 隐私数据脱敏（信用卡号、身份证号等在发送前本地截断）
- ✅ 简单离线指令（设闹钟、念备忘录、切换 Agent）
- ✅ 意图分类/路由判断（决定本地处理还是发云端）
- ❌ 不做复杂对话
- ❌ 不做视觉理解
- ❌ 不做工具调用

#### 3.4.2 桌面端集成 (Tauri)

```
Tauri Sidecar 模式 → 内置 llama.cpp 可执行文件 + 量化模型

桌面端优势：算力充裕（x86/ARM CPU + 可选 GPU）
→ 可以跑 Gemma Nano 甚至 Gemma 4B 级别模型
→ 支持本地隐私模式（"Local Only" 部署模式，数据不离开电脑）
```

---

### 3.5 模块五：AI 眼镜端接入 (IoT / Wearable)

#### 3.5.1 架构定位

AI 眼镜 = **纯瘦客户端 (Thin Client)**，无本地模型，所有数据经蓝牙透传给手机。

```
[AI Glasses]                    [Phone Relay]               [Cloud]
┌───────────┐  BLE Audio   ┌──────────────┐  WebSocket  ┌──────────┐
│ Mic/Spk   │◄────────────►│ BLE Manager  │◄───────────►│ Voice    │
│ Camera    │  BLE Data    │              │             │ Gateway  │
│ Touch     │──────────────►│ Image Relay  │─────────────►│ v2       │
│ IMU       │              │              │             │          │
│           │              │ MPC Signer   │             │ Payment  │
│ [唤醒词]   │              │ (授权拦截)   │             │ Router   │
└───────────┘              └──────────────┘             └──────────┘
```

#### 3.5.2 手机端新增模块 (Agentrix-Claw)

| 模块 | 描述 |
|------|------|
| `BLEDeviceManager` | 蓝牙扫描/配对/连接管理 (react-native-ble-plx) |
| `WearableRelay` | 后台服务，接收眼镜音频/图像，转发至 WebSocket |
| `GlassAuthInterceptor` | 当眼镜触发支付时，手机弹出 MPC 签名确认 |
| `DeviceSettingsScreen` | 穿戴设备管理页面（绑定/解绑/电量/固件版本） |

#### 3.5.3 新增 Socket.IO 事件 (眼镜专属)

| 事件 | 方向 | Payload |
|------|------|---------|
| `glass:connect` | C→S | `{ deviceId, model, firmwareVer }` |
| `glass:image:frame` | C→S | `{ sessionId, frame: Base64, timestamp }` |
| `glass:touch:event` | C→S | `{ gesture: 'tap'|'long_press'|'swipe' }` |
| `glass:status` | S→C | `{ battery, connected, streaming }` |

---

### 3.6 模块六：跨端会话协同 (Session Fabric)

**现状**: `VoiceSessionHandoffService` 已实现基础的跨设备 Handoff 协议

**升级方向**: 从"1对1 Handoff"升级为"多设备会话织网 (Session Fabric)"

#### 3.6.1 多设备并行感知

```
一个用户可以同时有多个设备在线：
  📱 手机 (口袋里，中继眼镜数据)
  🕶️ 眼镜 (戴着，主交互)
  🖥️ 桌面 (桌上，显示详细看板)
  ⌚ 手表 (手腕，快捷审批)

Session Fabric 的职责：
  1. 所有设备共享同一个 Agent Session Context
  2. 语音输入：只有"主设备"（当前活跃设备）的音频发给模型
  3. 输出分发：
     - 语音回复 → 眼镜/耳机播放
     - 详细内容 → 桌面端/手机端推送看板卡片
     - 审批通知 → 手表端快捷操作
  4. 主设备可无感切换（从眼镜摘下 → 手机自动接管）
```

#### 3.6.2 数据库扩展

```typescript
// 新增实体：DeviceSession
@Entity()
export class DeviceSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  sessionId: string;          // 统一会话 ID

  @Column()
  deviceId: string;           // 设备唯一标识

  @Column({ type: 'enum', enum: ['phone', 'desktop', 'web', 'glass', 'watch'] })
  deviceType: string;

  @Column({ default: false })
  isPrimary: boolean;         // 是否为当前主输入设备

  @Column({ type: 'jsonb', nullable: true })
  capabilities: {             // 设备能力声明
    hasCamera: boolean;
    hasMic: boolean;
    hasSpeaker: boolean;
    hasScreen: boolean;
    screenSize: 'none' | 'small' | 'medium' | 'large';
    hasLocalModel: boolean;
  };

  @Column({ type: 'timestamp' })
  lastActiveAt: Date;
}
```

---

## 四、跨端体验一致性矩阵 (重构后)

| 能力 | 📱 Mobile | 🖥️ Desktop | 🌐 Web | ⌚ Watch | 🕶️ Glass |
|------|-----------|-----------|--------|---------|-----------|
| 实时流式语音 | ✅ e2e/cascade | ✅ e2e/cascade | ✅ cascade | ✅ via relay | ✅ via relay |
| 全双工对话 | ✅ | ✅ | ✅ | ⚠️ 简化 | ✅ |
| 自然打断 | ✅ <250ms | ✅ <250ms | ✅ <500ms | ✅ | ✅ |
| 唤醒词 | ✅ Nano 本地 | ✅ Nano 本地 | ❌ | ✅ 硬件端 | ✅ 硬件端 |
| 视觉多模态 | ✅ 摄像头 | ❌ | ❌ | ❌ | ✅ 核心能力 |
| 本地离线推理 | ✅ OTA Nano | ✅ 内置 Nano | ❌ | ❌ | ❌ |
| 跨端会话接续 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 超脑深度推理 | ✅ 异步通知 | ✅ 看板展示 | ✅ | ✅ 审批 | ✅ 语音播报 |
| 支付授权 | ✅ MPC 签名 | ✅ MPC 签名 | ✅ | ⚠️ 快捷确认 | 🔀 手机代签 |

---

## 五、实施路线 (Phase Plan)

### Phase 7A：Voice Gateway v2 + GPU 节点 (核心基建)

**目标**: 跑通端到端多模态语音链路，内部验证延迟和质量

| 任务 | 模块 | 优先级 |
|------|------|--------|
| 开通 g6.xlarge Spot 实例，部署 vLLM + Gemma 4 9B | Infra | P0 |
| 实现 `IVoiceStreamStrategy` 接口 + 两套策略 | Backend | P0 |
| Voice Gateway v2：策略路由 + 图像帧协议 | Backend | P0 |
| 内部 gRPC 或 HTTP 桥接 t3↔g6 | Backend | P0 |
| 延迟基准测试 (目标 <500ms TTFA) | QA | P0 |
| LLM Router v2：新增 LOCAL/ULTRA 分级 | Backend | P1 |
| 桌面端升级为 WebSocket 实时语音 (对齐移动端) | Desktop | P1 |
| Web 端升级为 WebSocket 实时语音 | Frontend | P1 |

### Phase 7B：端侧 Nano + 眼镜 MVP (端侧扩展)

**目标**: 手机端离线能力 + AI 眼镜最小可用版本

| 任务 | 模块 | 优先级 |
|------|------|--------|
| Agentrix-Claw 集成 llama.cpp RN 绑定 | Mobile | P0 |
| OTA 模型下载 + 本地推理管线 | Mobile | P0 |
| 唤醒词引擎集成 (Porcupine / Snowboy) | Mobile | P0 |
| BLE 设备管理器 + 穿戴 Relay 服务 | Mobile | P1 |
| AI 眼镜配对 + 音频中继 + 图像帧透传 | Mobile | P1 |
| Glass Auth Interceptor (支付拦截) | Mobile | P1 |
| Tauri 端 llama.cpp Sidecar 集成 | Desktop | P2 |

### Phase 7C：Session Fabric + 三级协同 (体验闭环)

**目标**: 多设备同时在线，智能输出分发

| 任务 | 模块 | 优先级 |
|------|------|--------|
| DeviceSession 实体 + 多设备注册 | Backend | P0 |
| Session Fabric 主设备自动切换 | Backend | P0 |
| 输出分发器 (语音→眼镜, 详情→桌面, 审批→手表) | Backend | P0 |
| 超脑 API 异步回调 + 前台安抚话术 | Backend | P1 |
| 手表端快捷审批 UI | Watch | P1 |
| 端到端延迟优化至 <500ms (P95) | QA | P1 |

---

## 六、风险与缓解

| 风险 | 影响 | 缓解策略 |
|------|------|---------|
| g6 Spot 实例被回收 | 语音服务中断 | 自动回退到级联模式；配置 Spot Fleet 多可用区 |
| Gemma 4 31B 显存不足 | 模型加载失败 | 先用 9B 验证，31B 等 g6.12xlarge 预算到位 |
| 眼镜硬件碎片化 | 适配成本高 | 先只适配 1-2 款开放 API 眼镜，不自研硬件 |
| 端侧 Nano OTA 下载率低 | 离线能力失效 | 默认不下载，仅在用户启用"隐私模式"时提示 |
| 三级路由判断出错 | 简单任务发给超脑浪费钱 | A/B 测试路由阈值，逐步调优 |
| 跨国 API 延迟不可控 | 超脑任务体感差 | "前台安抚"模式 + 异步通知，不让用户干等 |

---

## 七、成功指标 (KPIs)

| 指标 | 当前值 | Phase 7A 目标 | Phase 7C 目标 |
|------|--------|-------------|-------------|
| 语音首字节延迟 (TTFA) | ~1.5s | <800ms | <500ms |
| 第三方 ASR/TTS API 月成本 | $X | 降低 40% | 降低 80% |
| 桌面端语音能力覆盖率 | 30% | 80% | 95% |
| 跨端会话接续成功率 | ~60% | 85% | 95% |
| AI 眼镜 MVP 可用 | ❌ | ❌ | ✅ |
| 端侧离线可用率 | 0% | 30% (OTA 用户) | 50% |
| 用户对语音自然度评分 (1-5) | ~3.2 | 3.8 | 4.3 |

---

## 八、附录

### 附录 A：现有代码文件映射

| 功能域 | 文件路径 | 重构动作 |
|--------|---------|---------|
| Voice Gateway | `backend/src/modules/voice/realtime-voice.gateway.ts` | 注入策略模式，不改旧逻辑 |
| Voice Service | `backend/src/modules/voice/voice.service.ts` | 拆分为 CascadeStrategy |
| LLM Router | `backend/src/modules/llm-router/llm-router.service.ts` | 扩展 TaskTier + 模型目录 |
| Gemini Live | `backend/src/modules/voice/adapters/gemini-live.adapter.ts` | 保留作为级联模式内的 e2e 选项 |
| Session Handoff | `backend/src/modules/voice/voice-session-handoff.service.ts` | 升级为 Session Fabric |
| Session Store | `backend/src/modules/voice/voice-session.store.ts` | 新增 deviceType/isPrimary 字段 |
| WebSocket Gateway | `backend/src/modules/websocket/websocket.gateway.ts` | 新增 glass:* 事件 |
| Desktop Voice | `desktop/src/services/voice.ts` | 升级为 WebSocket 实时流 |
| Desktop Audio | `desktop/src/services/AudioQueuePlayer.ts` | 适配流式 e2e 音频 |
| Provider Interface | `backend/src/modules/voice/adapters/voice-provider.interface.ts` | 新增 RealtimeMultimodalAdapter |

### 附录 B：技术选型对比

| 组件 | 方案 A | 方案 B | 选择 |
|------|--------|--------|------|
| GPU 推理框架 | vLLM | SGLang | vLLM (生态更成熟) |
| 端侧推理 | llama.cpp | ExecuTorch | llama.cpp (跨平台，Tauri 兼容) |
| 唤醒词引擎 | Porcupine (Picovoice) | Snowboy | Porcupine (准确率高，商用授权) |
| BLE 通信 | react-native-ble-plx | react-native-bluetooth-le | ble-plx (社区活跃) |
| t3↔g6 通信 | gRPC | HTTP/REST | HTTP (模型框架原生支持 OpenAI 格式) |

---

*本文档由 CEO Agent 基于前序讨论整理，待团队评审后进入实施阶段。*
