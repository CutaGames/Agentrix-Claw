# Agentrix 端侧对话/语音时序与流程图汇总

> 更新：2026-04-20 · 适用于 build142 及以后版本。
> 涵盖桌面端（Tauri）、移动端（RN/Expo）在 **本地模型 / 云端模型 / 混合模式** 下
> 的文本、图片、语音/音频、视频四类输入的实际流程。
>
> 所有图表使用 Mermaid，GitHub / VS Code / Notion 均可直接渲染。

---

## 0. 全局架构方框图

```mermaid
flowchart LR
    subgraph Clients[端侧]
        DESK[桌面 Tauri + React]
        MOB[移动 RN + Expo]
        WEB[网页 Next.js]
        WEAR[可穿戴]
    end

    subgraph Edge[边缘 / 本地]
        LCS[llama.cpp sidecar<br/>localhost:8787]
        RNLM[llama.rn 本地推理]
        WHISPER[whisper.rn 本地 STT]
        OUTETTS[OuteTTS 本地 TTS]
    end

    subgraph Backend["后端 · 47.130.176.148 (agentrix.top)"]
        GW["Nginx + NestJS"]
        OCP["/openclaw/proxy/*<br/>主控制面"]
        CC["/claude/chat<br/>兼容层"]
        VOICE["/voice/*<br/>Deepgram WS / Gemini / Edge / Polly"]
        AGT[Agent Runtime<br/>80+ Modules]
        DB[(PostgreSQL)]
        VEC[(Vector Store)]
    end

    subgraph LLM[LLM 云]
        CLAUDE[Anthropic / Bedrock]
        GEM[Gemini 2.0 / Live]
        GPT[OpenAI / OpenRouter]
    end

    DESK -->|SSE| OCP
    MOB -->|SSE| OCP
    WEB -->|SSE| OCP
    WEAR --> OCP
    DESK <--> LCS
    MOB <--> RNLM
    MOB <--> WHISPER
    MOB <--> OUTETTS

    GW --> OCP
    GW --> CC
    GW --> VOICE
    CC -.委托.-> OCP
    OCP --> AGT
    AGT --> DB
    AGT --> VEC
    AGT --> CLAUDE
    AGT --> GEM
    AGT --> GPT
    VOICE --> GEM
```

---

## 1. 桌面端 · 文本对话（云端模式）

```mermaid
sequenceDiagram
    autonumber
    participant U as 用户
    participant CP as ChatPanel
    participant ST as store.ts · streamChat
    participant BE as /openclaw/proxy/:id/stream
    participant OP as OpenClawProxyService
    participant L as LLM Provider
    U->>CP: 键入文本 + Enter
    CP->>ST: streamChat({instanceId,message,model,mode})
    Note right of ST: 原生 fetch 优先<br/>CORS 失败回退 tauriFetch
    ST->>BE: POST (SSE)
    BE->>OP: JwtAuthGuard → ensureOwnedInstance
    OP->>OP: 归一化 + resolveModel + PermissionProfile
    OP->>L: Bedrock / Claude / Gemini
    loop 流式
      L-->>OP: token
      OP-->>BE: data: {chunk}
      BE-->>ST: AgentrixStreamParser
      ST-->>CP: onChunk → setMessages
    end
    OP-->>BE: data: [DONE]
    CP-->>U: MessageBubble (memo) 渲染
```

---

## 2. 桌面端 · 文本（本地模型 llama.cpp sidecar）

```mermaid
sequenceDiagram
    autonumber
    participant U as 用户
    participant CP as ChatPanel
    participant TR as turnRouter
    participant LLS as LocalLLMSidecar
    participant R as Tauri Rust
    participant SR as llama-server :8787
    U->>CP: 输入 + 选 Gemma-Nano-2B
    CP->>TR: resolveExecutionTier
    TR-->>CP: tier=local
    CP->>LLS: ensureDesktopLocalSidecar()
    alt sidecar 已存活
      LLS-->>CP: reuse PID
    else 冷启动
      LLS->>R: invoke desktop_bridge_start_llm_sidecar
      R->>SR: spawn (冷启 8-15s)
      LLS->>SR: 健康探针 /health
    end
    CP->>SR: POST /v1/chat/completions (stream=true)
    loop
      SR-->>CP: OpenAI SSE delta
    end
    Note over CP,SR: CPU 推理 15-25s/50 token<br/>GPU 卸载可 5-10x 加速
```

---

## 3. 桌面端 · 混合模式决策

```mermaid
flowchart TD
    I[用户输入] --> M{executionMode}
    M -->|local-only| LR{本地运行时就绪?}
    M -->|cloud-only| CLOUD[云端 openclaw-proxy]
    M -->|auto| A{内容评估}
    LR -->|是| LOCAL[llama.cpp sidecar]
    LR -->|否| REJ[❌ requireLocal 拒绝]
    A -->|文本≤400 & token≤6k &<br/>无非图附件 & 无 URL| LOCAL
    A -->|否则| CLOUD
    LOCAL -.10s 超时 / 错误.-> CLOUD
    CLOUD --> OUT[SSE chunk/tool_*]
    LOCAL --> OUT
```

---

## 4. 桌面端 · 图片 / 视频 / 文件附件

```mermaid
sequenceDiagram
    autonumber
    participant U as 用户
    participant CP as ChatPanel
    participant UP as uploadChatAttachment
    participant API as /api/uploads
    participant OP as /openclaw/proxy/:id/stream
    U->>CP: 拖拽/粘贴/选文件
    CP->>UP: FormData (multipart)
    UP->>API: POST
    API-->>UP: {url, mime, size}
    CP->>OP: SSE · message = [{type:text},{type:image_url,url},…]
    Note over OP: 多模态模型路由<br/>不支持视觉 → 拒绝或降级
    OP-->>CP: SSE chunks
```

---

## 5. 桌面端 · 语音（按住说话 · 当前实现）

```mermaid
sequenceDiagram
    autonumber
    participant U as 用户
    participant FB as FloatingBall
    participant V as voice.ts
    participant STT as /voice/transcribe
    participant SDC as streamDirectChat
    participant OP as /openclaw/proxy/stream
    participant AQ as AudioQueuePlayer
    participant TTS as /voice/tts
    U->>FB: 长按 400ms
    FB->>V: startRecording (getUserMedia)
    U->>FB: 松开
    FB->>V: stopRecording → Blob(opus/webm)
    V->>STT: POST audio (30s timeout)
    STT-->>V: {text}
    FB->>SDC: prior history + agentId
    SDC->>OP: SSE
    loop
      OP-->>SDC: chunk
      SDC-->>FB: onChunk
      FB->>AQ: SentenceAccumulator
      AQ->>TTS: GET /voice/tts?text=&lang=
      TTS-->>AQ: MP3 片段
      AQ-->>U: Web Audio API 播放
    end
```

**已知瓶颈**
- 批量 STT（单 Blob 发送）无流式；30s 超时 → 感知延迟 2-5s
- `SentenceAccumulator` 等句号才刷 → 首句 TTS 延迟
- 本地模型下整体延迟叠加到 40s+

---

## 6. 桌面端 · 全双工语音（目标架构 · 切换 realtime）

```mermaid
sequenceDiagram
    autonumber
    participant U as 用户
    participant RV as realtimeVoice.ts
    participant GW as /voice (Socket.IO)
    participant DG as Deepgram Nova-2 WS
    participant OP as openclaw-proxy
    participant TTS as Gemini/Edge/Polly
    U->>RV: 连接 wss://api.agentrix.top/voice
    RV->>GW: voice:session:start {lang,voiceId}
    loop 说话
      U->>RV: PCM 16k chunk
      RV->>GW: voice:audio:chunk (binary)
      GW->>DG: forward
      DG-->>GW: interim / final (300ms endpointing)
      GW-->>RV: voice:stt:interim / final
    end
    RV->>OP: final 文本 → SSE 触发 LLM
    OP-->>RV: text delta
    RV->>GW: 句级 TTS 请求
    GW->>TTS: 合成 (Gemini 默认)
    TTS-->>GW: 音频帧
    GW-->>RV: voice:tts:chunk
    RV-->>U: AudioQueuePlayer 播放
```

---

## 7. 移动端 · 文本 + 附件（云端 SSE）

```mermaid
sequenceDiagram
    autonumber
    participant U as 用户
    participant A as AgentChatScreen
    participant UP as /api/uploads
    participant TX as transcribeAudioAttachments
    participant OP as /openclaw/proxy/:id/stream
    U->>A: 输入文本 + 附件
    par 附件处理
      A->>UP: 图/视频 multipart → URL
    and
      A->>TX: 音频 → 文本
    end
    A->>OP: SSE (EventSource polyfill)
    loop
      OP-->>A: AgentrixStreamParser chunk
    end
    A-->>U: MessageList 渲染
```

---

## 8. 移动端 · 本地模型（llama.rn · Gemma-3n）

```mermaid
sequenceDiagram
    autonumber
    participant U as 用户
    participant A as AgentChatScreen
    participant MI as MobileLocalInference
    participant RN as llamaRnBridge
    U->>A: 输入 + 选本地模型
    A->>MI: generateTextStream()
    MI->>RN: completion(stream=true, ctx_shift=false)
    loop
      RN-->>MI: onToken
      MI-->>A: 增量 token (带软/硬 flush)
    end
    Note over MI: 无 token 时才用<br/>最终全文回放
```

---

## 9. 移动端 · 按住说话（三分支路由）

```mermaid
flowchart TD
    P[onPressIn] --> S{startVoiceRecording}
    S --> PERM{权限 OK?}
    PERM -->|否| AL1[提示授权]
    PERM -->|是| R{路由决策}
    R -->|本地模型 + PCM 可用| PA[RealtimeMicrophoneService<br/>PCM 16k mono]
    R -->|本地 + preferLocalSpeech| PB[liveSpeech · expo-speech-recognition]
    R -->|默认| PC[expo-av 录音 m4a]
    PA --> U[onPressOut stopVoiceRecording]
    PB --> U
    PC --> U
    U --> BR{分支}
    BR -->|A| A2{whisper.rn 可用?}
    A2 -->|是| AWA[本地 whisper]
    A2 -->|否| AWC[POST /voice/transcribe]
    BR -->|B| BC[controller.stop → transcript<br/>或 fallback 至 ref]
    BR -->|C| C2{whisper.rn 可用?}
    C2 -->|是| CWA[本地 whisper]
    C2 -->|否| CWC[POST /voice/transcribe]
    AWA --> SEND[onSendMessage]
    AWC --> SEND
    BC --> SEND
    CWA --> SEND
    CWC --> SEND
```

---

## 10. 移动端 · 全双工实时通话

```mermaid
sequenceDiagram
    autonumber
    participant U as 用户
    participant H as useVoiceSession
    participant RV as RealtimeVoiceService
    participant GW as /voice Socket.IO
    participant DG as Deepgram Nova-2
    participant OP as openclaw-proxy
    participant TTS as TTS Provider
    participant AQ as AudioQueuePlayer
    H->>RV: connect (WS + Bearer)
    RV->>GW: handshake
    loop
      U->>RV: PCM 帧 (onFrame)
      RV->>GW: voice:audio:chunk
      GW->>DG: 转发
      DG-->>GW: interim / final
      GW-->>RV: STT 事件
    end
    RV->>OP: 触发 LLM
    OP-->>RV: SSE
    RV->>GW: 句级 TTS
    GW->>TTS: 合成
    TTS-->>GW: 音频
    GW-->>RV: voice:tts:chunk
    RV->>AQ: enqueue
    AQ-->>U: 播放
    Note over RV: 说话时 muteAgent()<br/>播放时启用 barge-in
```

---

## 11. 移动端 · 图片 / 音频 / 视频附件

```mermaid
flowchart TD
    IN[用户选文件] --> T{MIME}
    T -->|image| IM{模型支持视觉?}
    IM -->|是| UP1[multipart → /uploads]
    IM -->|否 & 本地| BL[🚫 block]
    IM -->|否 & 云| UP1
    UP1 --> MSG[SSE content 数组]
    T -->|audio| AU{本地 whisper?}
    AU -->|是| LW[localWhisper.transcribe]
    AU -->|否| CS[/voice/transcribe]
    LW --> TXT[拼接为文本 turn]
    CS --> TXT
    T -->|video| VV{多模态 LLM?}
    VV -->|是| UP2[上传 + 取帧+音轨]
    VV -->|否| BL2[🚫 不支持]
    UP2 --> MSG
    MSG --> OP[openclaw-proxy]
    TXT --> OP
```

---

## 12. Agent 架构方框图

```mermaid
flowchart LR
    Req[SSE 请求] --> PG[JwtAuthGuard]
    PG --> Norm[归一化<br/>ChatMessageDto]
    Norm --> IT{instanceType}
    IT -->|platform-hosted| CI[ClaudeIntegrationSvc]
    IT -->|external| EX[HTTP 代理至用户 OpenClaw 容器]
    CI --> MR[ModelRouterService<br/>LIGHT/MEDIUM/HEAVY/ULTRA]
    MR --> SK[SkillExecutor]
    SK --> TR[ToolRegistry 40+<br/>commerce/P0/analysis/AI]
    CI --> AI[AgentIntelligenceSvc<br/>记忆抽取 + 向量检索]
    AI --> VS[(pgvector / Weaviate)]
    CI --> TQ[TokenQuotaSvc]
    CI --> CT[CostTrackerSvc]
    SK -.tool_use.-> CI
    CI --> OUT[SSE<br/>chunk / tool_start / tool_result / done]
```

---

## 13. 语音提供商决策

```mermaid
flowchart TD
    TTS[TTS 请求] --> P{VOICE_TTS_PROVIDER}
    P -->|gemini (默认)| G[Gemini TTS]
    P -->|edge| E{从 AWS SG 可达?}
    E -->|是| EE[Edge TTS]
    E -->|否| G
    P -->|polly| PL[AWS Polly · $4/1M chars]
    G -.失败.-> EE
    EE -.失败.-> PL

    STT[STT 请求] --> S0{Gemini STT 可用?}
    S0 -->|是 & 允许| GS[Gemini STT · 免费]
    S0 -->|否| S1{VOICE_STT_ORDER}
    S1 --> AWS[AWS Transcribe Streaming · 主]
    AWS -.失败.-> GR[Groq Whisper Turbo]
    GR -.失败.-> OAI[OpenAI Whisper]
    subgraph Realtime
      DG[Deepgram Nova-2 WS]
    end
    STT2[/voice WS/] --> DG
```

---

## 14. 已知瓶颈总表

| 类别 | 位置 | 现象 | 计划 |
|---|---|---|---|
| 桌面卡顿 | `FloatingBall.tsx` backdrop-filter × 4 | 核显空闲占用 30% | ✅ 已删除 |
| 桌面重渲 | `ChatPanel.tsx` useAuthStore() 全量订阅 | 输入/token 刷新均全树刷 | ✅ selector 拆分 |
| 桌面 TTS 延迟 | `AudioQueuePlayer.ts` 按句缓冲 | 首句延迟 ≥ 句长 | 🔧 早刷 (逗号/10字) |
| 桌面本地推理 | `localLLM.ts` | 40s 冷启 + CPU 推理 | 🔧 sidecar 常驻 + GPU 卸载 |
| 桌面 STT | `voice.ts` 批量 30s | 无流式 interim | 🔧 切 realtime-voice gateway |
| 移动无法通话 | `realtimeVoice.service.ts` | WS 静默失败 | 🔧 连接失败显式报错 |
| 移动按住无转录 | `useVoiceSession.ts` 路径 A | 权限/设备占用 0 字节 | 🔧 权限预检 + 设备占用提示 |
| 后端 Edge TTS | AWS SG 网络策略 | 被墙 | 🟡 默认 Gemini TTS |
| 后端 Groq 401 | env key 无效 | 回退 AWS | 🟡 更新 key |

---

## 15. 测试矩阵（E2E 回归）

| 端 | 模式 | 文本 | 图片 | 音频附件 | 视频 | 按住说话 | 全双工 |
|---|---|---|---|---|---|---|---|
| 桌面 | 云端 | ✅ | ✅ | ✅ | 🟡 | 🔧 | 🔧 |
| 桌面 | 本地 | 🔧 | — | — | — | 🔧 | — |
| 桌面 | 混合 | 🔧 | ✅ | ✅ | 🟡 | 🔧 | 🔧 |
| 移动 | 云端 | ✅ | ✅ | ✅ | 🟡 | 🔧 | 🔧 |
| 移动 | 本地 | ✅ | 🟡 | 🟡 | — | 🔧 | — |
| 移动 | 混合 | ✅ | ✅ | ✅ | 🟡 | 🔧 | 🔧 |

图例：✅ 稳定 · 🟡 部分 · 🔧 本次修复周期内 · — 不支持
