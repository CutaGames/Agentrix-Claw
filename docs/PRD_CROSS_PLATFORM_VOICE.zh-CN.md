# Agentrix 多端语音方案 PRD — 跨端跨应用随时语音唤醒

**版本**: 2.0  
**日期**: 2026-03-18  
**状态**: Draft  
**关联文档**: `docs/PRD_REALTIME_VOICE_MOBILE_FIRST.zh-CN.md`（v1.0 草案，本文档替代并扩展之）

---

## 一、现状全端审计

### 1.1 技术组件清单

| 组件 | 文件 | 平台 | 当前能力 |
|------|------|------|----------|
| **后端 STT** | `backend/src/modules/voice/voice.service.ts` | 服务端 | AWS Transcribe Streaming → OpenAI Whisper → Groq whisper-large-v3-turbo; 自动语种(zh/en); ffmpeg PCM |
| **后端 TTS** | `backend/src/modules/voice/voice.controller.ts` | 服务端 | AWS Polly Neural (Zhiyu/Matthew); 6 种声线映射; neural→standard 降级 |
| **移动端录音** | `AgentChatScreen.tsx` | iOS/Android | expo-av m4a 16kHz mono; 上传 `/voice/transcribe`; hold/tap 模式 |
| **移动端实时识别** | `src/services/liveSpeech.service.ts` | iOS/Android | expo-speech-recognition 设备端; interim+final; contextualStrings; iOS 强制 on-device |
| **移动端 TTS** | `src/services/AudioQueuePlayer.ts` | iOS/Android | 分句队列; Polly URL 流式; expo-speech 兜底 |
| **移动端全双工** | `AgentChatScreen.tsx` duplexMode | iOS/Android | 自动恢复监听; 打断播报; interim 字幕; 分句流式 TTS |
| **桌面端录音** | `desktop/src/services/voice.ts` | Tauri/Web | MediaRecorder(webm/opus); tauriFetch 双通道上传 |
| **桌面端按钮** | `desktop/src/components/VoiceButton.tsx` | Tauri/Web | hold-to-talk; CustomEvent 联动 FloatingBall |
| **桌面端悬浮球** | `desktop/src/components/FloatingBall.tsx` | Tauri/Web | 长按 400ms 触发语音事件; 无唤醒词 |
| **Web STT** | `frontend/components/agent/voice/VoiceInput.tsx` | 浏览器 | webkitSpeechRecognition; 非 continuous; 无 interim |
| **Web TTS** | `frontend/components/agent/voice/VoiceOutput.tsx` | 浏览器 | SpeechSynthesisUtterance 本地合成; 无后端 Polly |

### 1.2 能力矩阵

| 能力维度 | 移动端 | 桌面端 | Web 端 | 理想态 |
|----------|--------|--------|--------|--------|
| 录音 | ✅ expo-av | ✅ MediaRecorder | ✅ Web Speech | ✅ |
| 设备端实时 STT | ✅ expo-speech-recognition | ❌ | ⚠️ 仅 Chrome | ✅ 全平台 |
| 服务端流式 STT | ❌ 文件上传 | ❌ 文件上传 | ❌ | ✅ WebSocket |
| TTS 播放 | ✅ Polly+兜底 | ✅ Polly blob | ⚠️ 仅本地合成 | ✅ 神经 TTS |
| 全双工对话 | ✅ duplexMode | ❌ 半双工 | ❌ 半双工 | ✅ |
| 自然打断 | ✅ 说话停播报 | ❌ | ❌ | ✅ <250ms |
| 自动恢复监听 | ✅ | ❌ | ❌ | ✅ |
| interim 字幕 | ✅ | ❌ | ❌ | ✅ |
| 分句流式 TTS | ✅ 句级 flush | ❌ 整段 | ❌ 整段 | ✅ 词级 |
| **唤醒词** | ❌ | ❌ | ❌ | ✅ |
| **跨应用后台监听** | ❌ | ❌ | ❌ | ✅ |
| **跨端会话接续** | ❌ | ❌ | ❌ | ✅ |
| 音频路由管理 | ⚠️ 基础 | ❌ | N/A | ✅ |
| AEC 回声消除 | ⚠️ iOS only | ⚠️ 浏览器 | N/A | ✅ |
| VAD 端点检测 | ⚠️ 粗粒度 | ❌ | ❌ | ✅ |
| 多语种混合 | ⚠️ zh/en 互斥 | ⚠️ zh/en 互斥 | ⚠️ 单语 | ✅ code-switch |
| 统一会话协议 | ❌ | ❌ | ❌ | ✅ |
| provider 动态路由 | ❌ | ❌ | ❌ | ✅ |
| 观测与回放 | ❌ | ❌ | ❌ | ✅ |

### 1.3 差距总结

**红区 — 核心缺失，阻碍"随时唤醒"目标**:

1. **无唤醒词**: 所有端均需手动触发，无法做到"随时语音唤醒"
2. **无跨应用后台监听**: App 切后台即停止; 桌面端无系统级常驻
3. **无跨端会话接续**: 手机→桌面无法延续同一语音 session
4. **无统一 Voice Session Layer**: 三端各自实现，桌面与移动端体验鸿沟巨大
5. **桌面端无实时识别**: 仍是录完→上传→转写的半双工模式
6. **无 WebSocket 实时语音流**: 服务端全部为 HTTP 文件上传，无真正流式链路

**黄区 — 有基础但不达标**:

7. 多语种只支持 zh/en 且互斥，不支持 code-switching
8. VAD 仅 Android 粗粒度静默超时，iOS 依赖系统 endpoint detection
9. AEC 仅 iOS voiceProcessing，Android 和桌面端无保障
10. TTS 声线有限（Polly 中文仅 Zhiyu/Zhiqiang），距离"全球最好"差距明显
11. 移动端语音逻辑散落在 AgentChatScreen（400+ 行语音代码混入 2200 行 UI）

**绿区 — 已有良好基础**:

12. 移动端全双工雏形完整: 打断、恢复、interim、分句 TTS
13. 后端 STT 多 provider 降级链路完整
14. 桌面端悬浮球长按语音事件机制已有

---

## 二、目标定义 — "全球效果最好"

### 2.1 关键体验指标

| 维度 | 目标 | 当前竞品基准 |
|------|------|-------------|
| 识别准确率(WER) | 中英混合 <8% | GPT-4o Realtime ~5%, Gemini Live ~7% |
| 首包延迟 | 用户停说→Agent 出声 <800ms | ChatGPT Voice ~600ms, Gemini ~900ms |
| 打断响应 | 用户开口→Agent 停 <250ms | ChatGPT ~200ms, Siri ~300ms |
| TTS 自然度(MOS) | >4.2 | ElevenLabs 4.5, Polly Neural 3.8 |
| 连续会话 | >20 min 无中断 | 竞品均可达到 |
| 跨端切换 | <2s 恢复上下文 | 无竞品完全实现 |
| 唤醒成功率 | >95% 安静, >85% 噪声 | Siri ~97%/~88% |

### 2.2 竞品差异化优势

我们不需要在每个维度上都胜过所有竞品。核心差异化在于:

1. **Agent 不是助手而是伙伴** — 工具调用不中断对话，这点 ChatGPT Voice 做不到
2. **跨端跨应用接续** — Siri/Google Assistant 不跨第三方应用
3. **LLM 可选** — 用户保留模型选择权，不被单一供应商锁死
4. **开放生态** — 穿戴设备、IoT 可接入同一语音 session

---

## 三、Provider 选型 — 早期性价比优先

### 3.1 STT 选型

| Provider | 价格 | 质量 | 延迟 | 中文 | 推荐阶段 |
|----------|------|------|------|------|----------|
| **Groq whisper-large-v3-turbo** | 免费额度充足, 超出 $0.04/hr | 优秀 | ~500ms | 优秀 | ✅ P0 首选 |
| **Google Cloud STT v2** | 免费 60 min/月, 超出 $0.016/min | 优秀 | ~300ms streaming | 优秀 | ✅ P1 流式首选 |
| OpenAI Whisper API | $0.006/min | 顶级 | ~1-2s | 顶级 | P1 备选 |
| AWS Transcribe Streaming | $0.024/min | 良好 | ~400ms | 良好 | 现有, 保留 fallback |
| **Deepgram Nova-2** | 免费 $200 credit, 超出 $0.0043/min | 顶级 | <300ms | 良好 | ✅ P1 低延迟候选 |
| 本地 Whisper (whisper.cpp) | 免费 | 良好 | 设备依赖 | 良好 | P2 离线场景 |

**P0 推荐**: Groq whisper-large-v3-turbo（已集成, 免费额度高, 质量优秀）

**P1 推荐**: Deepgram Nova-2 或 Google STT v2（真正的流式 WebSocket, 极低延迟）

### 3.2 TTS 选型

| Provider | 价格 | 自然度(MOS) | 中文 | 延迟 | 推荐阶段 |
|----------|------|-------------|------|------|----------|
| **Edge TTS (免费)** | 完全免费 | ~4.0 | 优秀(晓晓等) | <200ms | ✅ P0 首选 |
| **Kokoro TTS (开源)** | 自托管免费 | ~4.0 | 支持 | <150ms 本地 | ✅ P0 备选 |
| AWS Polly Neural | $16/1M chars | ~3.8 | 一般 | ~300ms | 现有, 降级 fallback |
| ElevenLabs | $0.30/1K chars | ~4.5 | 良好 | ~400ms | P2 高端声线 |
| OpenAI TTS-1-HD | $30/1M chars | ~4.3 | 良好 | ~500ms | P2 高端备选 |
| Fish Audio (开源) | 自托管免费 | ~4.2 | 优秀 | ~200ms | P1 中文首选候选 |
| **Gemini TTS (免费层)** | 免费 | ~4.0 | 良好 | ~300ms | ✅ P0 验证 |

**P0 推荐**: Edge TTS（完全免费, 中文声线丰富, 延迟极低, npm 包 `edge-tts` 可直接使用）

**P1 推荐**: Fish Audio 或 Kokoro 自托管（音色克隆, 高自然度, 零边际成本）

### 3.3 端到端实时语音选型

| Provider | 价格 | 体验 | 工具调用 | 推荐阶段 |
|----------|------|------|----------|----------|
| **Gemini 2.5 Flash Native Audio** | 免费层可用 | 良好 | ✅ 原生支持 | ✅ P1 首选实验 |
| OpenAI Realtime (gpt-4o-realtime) | $5.00/1M input | 顶级 | ✅ | P2 高端 |
| Amazon Nova 2 Sonic | TBD | 良好 | ✅ | P2 评估 |

**P1 推荐**: Gemini 2.5 Flash Native Audio（免费层, 工具调用, WebSocket, 性价比最高）

### 3.4 唤醒词选型

| 方案 | 价格 | 平台 | 准确率 | 推荐 |
|------|------|------|--------|------|
| **Porcupine (Picovoice)** | 免费(开源个人), 商业 $5/设备 | 全平台 | >95% | ✅ P1 首选 |
| **Snowboy (开源)** | 完全免费 | 全平台(已停维) | ~90% | P2 备选 |
| **OpenWakeWord** | 完全免费 | Python, 可封装 | ~92% | P1 服务端 |
| 自训练 TFLite 模型 | 免费 | 全平台 | 可调 | P2 |
| iOS Siri Shortcuts | 免费 | 仅 iOS | 系统级 | P0 快速方案 |

**P0 推荐**: iOS 通过 Siri Shortcut 桥接唤醒; Android 通过 Accessibility Service

**P1 推荐**: Porcupine 跨平台统一唤醒词引擎

### 3.5 综合早期推荐方案（最低成本）

```
┌─────────────────────────────────────────────────────────┐
│                    P0 零成本方案                         │
│                                                         │
│  STT:  Groq whisper-large-v3-turbo (已有, 免费额度)      │
│  TTS:  Edge TTS (完全免费)                               │
│  LLM:  现有 Agent Router                                │
│  唤醒: iOS Siri Shortcut / Android 快捷方式              │
│  实时: 设备端 speech-recognition (已有)                   │
│                                                         │
│  月成本预估: $0 (低量) ~ $5 (中量)                       │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                    P1 低成本高质量方案                    │
│                                                         │
│  STT:  Deepgram Nova-2 WebSocket 流式                   │
│  TTS:  Edge TTS + Fish Audio 自托管                     │
│  实时: Gemini 2.5 Flash Native Audio (免费层)            │
│  唤醒: Porcupine 跨平台                                 │
│  会话: 统一 Voice Session Layer + WebSocket              │
│                                                         │
│  月成本预估: $10-50 (中量) ~ $200 (高量)                 │
└─────────────────────────────────────────────────────────┘
```

---

## 四、目标架构

### 4.1 分层设计

```
┌─────────────────────────────────────────────────────────┐
│  L0: Wake Word Layer (Porcupine / Siri / System)        │
│      - 跨应用后台常驻监听                                │
│      - 检测到唤醒词 → 激活 L1                            │
├─────────────────────────────────────────────────────────┤
│  L1: Device Audio Layer                                 │
│      - 麦克风采集 / 播放 / AEC / NS / AGC               │
│      - 蓝牙/外放/听筒路由                                │
│      - VAD 端点检测                                      │
├─────────────────────────────────────────────────────────┤
│  L2: Voice Session Layer (核心!)                         │
│      - 统一状态机: idle→listening→thinking→speaking       │
│      - turn-taking / barge-in / cancellation            │
│      - 跨端 session 同步 (via WebSocket)                 │
│      - transcript aggregation / output queue            │
│      - provider fallback orchestration                  │
├─────────────────────────────────────────────────────────┤
│  L3: Realtime Voice Gateway (服务端)                     │
│      - WebSocket 双向流                                  │
│      - provider 路由与鉴权                               │
│      - 会话日志与观测                                    │
│      - 工具调用桥接                                      │
│      - session handoff (跨端)                            │
├─────────────────────────────────────────────────────────┤
│  L4: Provider Adapter Layer                             │
│      - HybridPipelineAdapter (STT+LLM+TTS)             │
│      - GeminiLiveAdapter                                │
│      - NovaSonicAdapter                                 │
│      - OpenAIRealtimeAdapter                            │
│      - EdgeTTSAdapter / FishAudioAdapter                │
├─────────────────────────────────────────────────────────┤
│  L5: Agent Runtime (现有)                                │
│      - 上下文管理 / 工具调用 / Memory                    │
└─────────────────────────────────────────────────────────┘
```

### 4.2 Voice Session 状态机

```
                    ┌──────────┐
         wake_word  │          │  manual_trigger
        ┌──────────►│  IDLE    │◄──────────┐
        │           │          │            │
        │           └────┬─────┘            │
        │                │ activate          │
        │                ▼                  │
        │           ┌──────────┐            │
        │     ┌────►│LISTENING │────┐       │
        │     │     └────┬─────┘    │       │
        │     │          │ final    │ timeout│
        │     │ resume   │ transcript       │
        │     │          ▼          │       │
        │     │     ┌──────────┐    │       │
        │     │     │ THINKING │    │       │
        │     │     └────┬─────┘    │       │
        │     │          │ first    │       │
        │     │          │ audio    │       │
        │     │          ▼          │       │
        │     │     ┌──────────┐    │       │
        │     └─────│ SPEAKING │────┘       │
        │   barge-in└────┬─────┘            │
        │                │ finish           │
        │                ▼                  │
        │           ┌──────────┐            │
        └───────────│ COOLDOWN │────────────┘
                    └──────────┘
                         │ tool_result
                         ▼
                    ┌──────────┐
                    │TOOL_SPEAK│──► LISTENING
                    └──────────┘
```

### 4.3 跨端会话接续协议

```json
{
  "type": "voice_session_handoff",
  "sessionId": "vs_abc123",
  "fromDevice": "iphone-14",
  "toDevice": "desktop-tauri",
  "context": {
    "conversationId": "conv_xyz",
    "lastTranscript": "帮我查一下明天的航班",
    "pendingToolCalls": ["flight_search"],
    "voicePreferences": { "voiceId": "zhiyu", "speed": 1.0 },
    "sessionState": "tool_running"
  },
  "timestamp": 1742292000
}
```

---

## 五、重构与优化计划

### Phase 0: 零成本快速提升（1 周）

**目标**: 不增加任何成本，提升现有体验

| 任务 | 描述 | 文件 |
|------|------|------|
| P0-1 | 后端集成 Edge TTS 替代 Polly 作为默认 TTS（免费, 更多中文声线, 更自然） | `voice.controller.ts` |
| P0-2 | 将 Groq 提升为 STT 默认首选（已集成, 免费额度更高, 质量更好） | `voice.service.ts` |
| P0-3 | 桌面端接入 Web Speech API 实现实时识别（Chrome/Edge 已支持） | `desktop/src/services/voice.ts` |
| P0-4 | 桌面端实现全双工模式 — 复用移动端的 duplexMode 逻辑 | `desktop/src/components/VoiceButton.tsx` |
| P0-5 | 抽取 AgentChatScreen 语音逻辑到独立 `useVoiceSession` hook | `src/hooks/useVoiceSession.ts` (新建) |

**Edge TTS 集成方案**:
```
npm install edge-tts  (Node.js 包, 免费调用 Microsoft Edge 在线 TTS)
中文声线: zh-CN-XiaoxiaoNeural, zh-CN-YunxiNeural, zh-CN-XiaoyiNeural
英文声线: en-US-JennyNeural, en-US-GuyNeural, en-US-AriaNeural
支持 SSML, 情感, 语速调节
```

### Phase 1: 统一会话层 + 唤醒词（2-3 周）

**目标**: 建立跨端统一基础设施

| 任务 | 描述 |
|------|------|
| P1-1 | 实现 `VoiceSessionManager` — 统一状态机, 供所有端使用 |
| P1-2 | 实现后端 `RealtimeVoiceGateway` — WebSocket 双向音频流 |
| P1-3 | 实现 `VoiceProviderAdapter` 接口 + `HybridPipelineAdapter` |
| P1-4 | 移动端集成 Porcupine 唤醒词 ("Hey Agentrix") |
| P1-5 | 桌面端集成 Porcupine WASM 唤醒词 |
| P1-6 | iOS 实现 Siri Shortcut 桥接唤醒 (零成本快速方案) |
| P1-7 | 后端实现 `VoiceSessionStore` — Redis 存储会话状态 |
| P1-8 | 实现 Deepgram Nova-2 WebSocket STT adapter (真正流式) |

**唤醒词技术方案**:

移动端:
```
@picovoice/porcupine-react-native
- 自定义唤醒词 "Hey Agentrix" 通过 Picovoice Console 训练
- 后台运行: iOS Background Audio Mode + Android Foreground Service
- 功耗: <5% 电池/天 (专用 DSP 推理)
- 准确率: >95% (安静) / >85% (噪声)
```

桌面端:
```
@picovoice/porcupine-web (WASM)
- Tauri 进程内常驻 AudioWorklet
- 系统托盘驻留, 窗口关闭不退出
- 检测到唤醒词 → 激活窗口 + 开始语音会话
```

### Phase 2: Gemini Live 集成 + 跨端接续（2-3 周）

**目标**: 接入端到端实时语音, 实现跨端

| 任务 | 描述 |
|------|------|
| P2-1 | 实现 `GeminiLiveAdapter` — WebSocket 双向音频流 |
| P2-2 | Gemini Live 工具调用桥接 (function_call → Agent Runtime) |
| P2-3 | 实现跨端 session handoff 协议 |
| P2-4 | 移动端后台语音保持 (iOS Background Audio + Android Service) |
| P2-5 | 桌面端系统托盘常驻 + 全局快捷键唤醒 |
| P2-6 | 实现 VAD 模块 — 客户端精准端点检测 (Silero VAD ONNX) |
| P2-7 | A/B 测试框架: Hybrid Pipeline vs Gemini Live 对比 |

### Phase 3: 高级能力 + 体验打磨（2-4 周）

| 任务 | 描述 |
|------|------|
| P3-1 | 中英 code-switching 支持 (多语种混合识别不切换) |
| P3-2 | 音频路由管理器 (蓝牙/外放/听筒自动切换) |
| P3-3 | 观测系统: session 日志, 延迟分布, provider 对比 dashboard |
| P3-4 | Fish Audio / Kokoro 自托管 TTS (零成本高质量声线) |
| P3-5 | 语音情感检测 → Agent 回应语气调整 |
| P3-6 | 穿戴设备 (WearOS/watchOS) 语音入口 |
| P3-7 | 长对话稳定性: 连接保活, 自动重连, context 压缩 |

---

## 六、重点重构清单

### 6.1 AgentChatScreen 语音逻辑抽取

当前 `AgentChatScreen.tsx` 有 2218 行，其中约 400 行是语音相关逻辑。需要拆分:

**Before**:
```
AgentChatScreen.tsx (2218 行)
├── UI 渲染逻辑
├── 消息管理
├── voiceMode / duplexMode 状态
├── 录音 start/stop
├── 实时识别 start/stop
├── TTS 队列管理
├── 打断/恢复逻辑
└── ... 全部混在一起
```

**After**:
```
AgentChatScreen.tsx (~1200 行, 纯 UI)
├── useVoiceSession() hook
│   ├── VoiceStateMachine.ts     — 状态机定义与转移
│   ├── VoiceRecorder.ts         — 录音采集抽象
│   ├── VoiceTranscriber.ts      — STT 抽象 (设备端/服务端)
│   ├── VoiceSynthesizer.ts      — TTS 队列抽象
│   └── VoiceSessionSync.ts      — 跨端同步
└── UI 只订阅 { state, transcript, isSpeaking }
```

### 6.2 后端语音模块重构

**Before**:
```
voice/
├── voice.controller.ts  — TTS (Polly 硬编码) + 转写入口
├── voice.service.ts     — STT 逻辑 (多 provider)
└── voice.module.ts
```

**After**:
```
voice/
├── voice.controller.ts        — REST 入口 (保留向后兼容)
├── voice.gateway.ts           — WebSocket 实时语音网关 (新)
├── voice.service.ts           — 编排层
├── voice-session.store.ts     — Redis session 存储 (新)
├── adapters/
│   ├── voice-provider.interface.ts
│   ├── hybrid-pipeline.adapter.ts  — STT+LLM+TTS
│   ├── gemini-live.adapter.ts      — Gemini 端到端 (新)
│   ├── edge-tts.adapter.ts         — 免费 TTS (新)
│   └── polly-tts.adapter.ts        — 现有 Polly
├── stt/
│   ├── stt-provider.interface.ts
│   ├── groq-stt.ts
│   ├── deepgram-stt.ts             — 流式 WebSocket (新)
│   ├── aws-transcribe-stt.ts
│   └── whisper-stt.ts
└── voice.module.ts
```

### 6.3 桌面端升级路径

**Before**: 半双工 hold-to-talk, 无实时识别, 无唤醒

**Step 1** (P0): 加入 Web Speech API 实现浏览器内实时识别
**Step 2** (P1): 加入 Porcupine WASM 唤醒词
**Step 3** (P1): 接入统一 Voice Session Layer via WebSocket
**Step 4** (P2): Tauri 系统托盘常驻 + 全局快捷键

---

## 七、风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| Edge TTS 被微软限制 | TTS 不可用 | 保留 Polly fallback; Fish Audio 自托管备选 |
| Porcupine 商业授权费用 | 唤醒词成本 | 开源替代 (OpenWakeWord); 或 iOS Siri Shortcut 兜底 |
| iOS 后台语音被系统杀死 | 唤醒失效 | Background Audio Mode + 定时静音播放保活 |
| Gemini Live 免费层取消 | 端到端实时成本飙升 | Hybrid Pipeline 作为永久 fallback |
| 中英混合识别质量不稳 | 用户体验差 | 建立评测集; 按场景路由 provider |
| WebSocket 连接不稳定 | 语音中断 | 自动重连 + 本地缓冲 + 降级到 HTTP 上传 |

---

## 八、成本预估

### 8.1 P0 阶段（零成本）

| 项目 | 月成本 |
|------|--------|
| Edge TTS | $0 |
| Groq STT (免费额度) | $0 |
| 设备端 Speech Recognition | $0 |
| **合计** | **$0** |

### 8.2 P1 阶段（低成本）

| 项目 | 月成本 (1000 MAU) |
|------|-------------------|
| Deepgram Nova-2 | ~$20 (免费 $200 credit 后) |
| Edge TTS | $0 |
| Porcupine | $0 (开发阶段免费) |
| Gemini Flash Audio (免费层) | $0 |
| **合计** | **~$20** |

### 8.3 P2 阶段（规模化）

| 项目 | 月成本 (10,000 MAU) |
|------|---------------------|
| Deepgram | ~$200 |
| Fish Audio 自托管 | ~$50 (GPU) |
| Gemini Flash Audio | ~$100 |
| Porcupine 商业 | ~$500/yr |
| **合计** | **~$400/月** |

---

## 九、里程碑与验收标准

| 阶段 | 时间 | 验收标准 |
|------|------|----------|
| **P0** | 1 周 | Edge TTS 上线; Groq 为默认 STT; 桌面端有实时识别; AgentChatScreen 语音逻辑已抽取 |
| **P1** | +3 周 | 唤醒词可用(至少一端); WebSocket 流式语音跑通; 统一 VoiceSessionManager 接入 |
| **P2** | +3 周 | Gemini Live 可用; 跨端接续 demo; VAD 精准端点 |
| **P3** | +4 周 | 中英混合 code-switch; 观测 dashboard; 穿戴设备入口 |

---

## 十、结论

当前方案距离"跨端跨应用随时语音唤醒"的差距主要集中在:

1. **唤醒能力为零** — 这是最大的缺口
2. **桌面端语音体验远落后于移动端** — 需要统一到同一协议
3. **TTS 质量和成本不匹配** — Polly 既贵且不是最好的
4. **无实时 WebSocket 流** — 真正的低延迟需要流式链路

好消息是:
- 移动端的全双工基础已经很好，核心是抽取和标准化
- 免费/低成本 provider 生态在 2026 年已经非常成熟（Edge TTS、Groq、Gemini 免费层）
- P0 阶段可以完全零成本提升体验

推荐立即启动 **Phase 0**，一周内就能让用户感受到明显的 TTS 质量提升和桌面端实时识别能力。
