# Agentrix PRD — 移动端优先的实时语音对话系统

**版本**: 1.0
**日期**: 2026-03-18
**状态**: Draft
**负责人**: Copilot 起草
**关联代码**:
- `src/screens/agent/AgentChatScreen.tsx`
- `src/services/liveSpeech.service.ts`
- `src/services/AudioQueuePlayer.ts`
- `desktop/src/components/VoiceButton.tsx`
- `desktop/src/services/voice.ts`
- `backend/src/modules/voice/voice.service.ts`

---

## 一、背景与目标

Agentrix 的跨端语音不是一个附属功能，而是未来“脱离屏幕、随时随地、跨设备连续对话”的核心交互层。

当前系统已经具备语音能力，但仍然主要是“识别、推理、合成”拼接式方案：

- 移动端已具备实时识别、打断播放、自动恢复监听、分句 TTS 队列等能力。
- 桌面端仍以按住说话、录完上传、再转写与朗读为主。
- 后端支持 AWS Transcribe Streaming、OpenAI Whisper、Groq transcription、AWS Polly，但目前仍是多段式链路。

本 PRD 的目标不是继续优化“语音消息”，而是定义一套世界级实时语音会话产品方案，先在移动端做成，再移植到桌面端。

### 1.1 终极目标

用户与 Agent 的语音交互需要接近人与人通话，而不是语音输入框。

达到以下体验：

- 支持自然插话和抢话，不需要等 Agent 讲完。
- 支持长时间连续会话，不需要每轮按键确认。
- 支持中英混合与多人环境下的鲁棒识别。
- 支持 Agent 在语音对话中异步调用工具，不阻塞对话。
- 支持同一会话在手机、桌面、耳机、穿戴设备间延续。

### 1.2 本期范围

本 PRD 仅定义第一阶段主战场：

- `P0`: 移动端实时语音会话内核
- `P1`: 统一语音会话网关与 provider 抽象
- `P2`: 桌面端迁移到同一套协议和状态机

不在本期范围：

- 电话外呼系统
- 大规模坐席运营台
- 可穿戴端独立 UI 完成态
- 完整多说话人分离

---

## 二、现状评估

### 2.1 移动端现状

当前移动端的语音基础已经明显强于桌面端。

已存在能力：

- `voiceMode`
- `duplexMode`
- 实时语音识别可用性探测
- interim transcript / final transcript
- 播放 Agent 语音时停止监听
- 用户说话时中断 Agent 播报
- 播报结束后恢复监听
- 分句和提早 flush 的 TTS 队列

现状优势：

- 已具备“准实时对话”雏形。
- 已具备一套较完整的移动端状态机基础。
- 已有面向未来全双工体验的 UI 和交互基础。

现状问题：

- 识别、推理、TTS 仍然是分段管道，不是单模型实时 speech-to-speech。
- turn-taking、barge-in、VAD 与播报状态控制仍然散落在 UI 组件里。
- 缺少统一会话层协议，难以复用到桌面端。
- 还没有统一的回声消除、噪声鲁棒性和端点检测策略。

### 2.2 桌面端现状

桌面端目前仍是典型半双工方案：

- 按住录音
- 结束录音
- 上传转写
- 文本推理
- TTS 播放

现状问题：

- 无持续监听
- 无实时字幕
- 无稳定的打断与抢话体验
- 无和移动端统一的语音会话层

结论：

- 移动端适合作为主战场。
- 桌面端不应再独立演进语音方案，而应迁移到移动端沉淀出的统一协议和内核。

### 2.3 后端现状

当前后端语音能力：

- STT: AWS Transcribe Streaming
- STT fallback: OpenAI Whisper / Groq transcription
- TTS: AWS Polly
- 音频预处理: ffmpeg 转 PCM

后端现状问题：

- 还是典型的 STT → LLM → TTS 拼接链路。
- provider 选择逻辑在服务内，缺少更高层的实时语音 session 管理。
- 无统一的实时会话对象来处理打断、取消、转向、工具回流。

---

## 三、用户与场景

### 3.1 核心用户

- 通勤用户：走路、开车、地铁、耳机场景
- 多任务用户：做饭、整理文件、开会间隙
- 高频 agent 用户：把 Agent 作为常驻助手，而不是偶尔打开的聊天界面
- 多设备用户：手机开始，桌面接续，未来穿戴设备继续

### 3.2 关键场景

#### 场景 A: 连续陪伴对话

用户戴耳机与 Agent 持续聊天，Agent 可以插入提醒、总结与建议，用户可以随时打断。

#### 场景 B: 工具执行不中断

用户口头说“帮我查一下明天从上海到东京的机票”。Agent 开始查询，查询期间仍可继续聊天，工具结果回来后再插入语音播报。

#### 场景 C: 跨端接力

用户在手机上开始语音对话，到桌面前自动切换，桌面继续当前上下文和语音 session。

#### 场景 D: 低注意力输入

用户不看屏幕，仅用语音唤起、确认、打断、继续、取消。

---

## 四、产品目标与 KPI

### 4.1 体验目标

- 首包响应延迟：目标 `< 800ms`
- 用户语音结束到 Agent 开口：目标 `< 1.2s`
- barge-in 响应时间：目标 `< 250ms`
- 连续会话时长：目标 `> 20 min`
- 中英混合识别准确率：显著优于当前拼接链路
- 用户主观评价：达到“接近真人实时对话”

### 4.2 业务目标

- 提高移动端语音会话日活和时长
- 提高免看屏场景下的会话完成率
- 为穿戴设备和桌面端统一语音架构打基础

### 4.3 成功指标

- 语音会话启动率
- 语音会话 5 分钟留存
- 平均被用户打断次数与成功恢复率
- 工具调用期间的语音留存率
- 语音对话错误中断率
- 语音 provider 成本与时延分布

---

## 五、产品要求

### 5.1 必须满足的体验要求

1. 自然打断
2. 自动恢复监听
3. 中英混合稳定识别
4. 长对话上下文连续
5. 语音与文本可无缝切换
6. 工具调用不中断对话
7. 低网络质量下有可降级方案

### 5.2 必须满足的工程要求

1. 移动端和桌面端共用同一套语音 session 协议
2. provider 可插拔
3. 支持统一日志、录制、指标与回放
4. 可对比不同 provider 的时延、成本和主观质量
5. fallback 不能破坏会话状态机

---

## 六、目标架构

### 6.1 总体原则

- 以“实时语音会话”替代“语音消息提交”
- 以“单一 session 状态机”替代分散在 UI 的局部布尔值
- 以“主通道 + fallback”替代“单供应商锁死”

### 6.2 分层架构

#### L1. Device Audio Layer

负责：

- 麦克风采集
- 播放控制
- AEC/NS/AGC/VAD 接入
- 蓝牙耳机 / 外放 / 听筒路由切换

#### L2. Voice Session Layer

统一维护会话状态：

- `idle`
- `listening`
- `thinking`
- `speaking`
- `interrupted`
- `tool_running`
- `handoff_pending`

这一层负责：

- turn-taking
- barge-in
- cancellation
- transcript aggregation
- output queue
- fallback 切换

#### L3. Realtime Voice Gateway

服务端统一网关，屏蔽 provider 差异。

职责：

- 建立实时双向流
- provider 路由
- 鉴权
- 会话日志
- 工具调用桥接
- session handoff

#### L4. Voice Model Provider Layer

候选 provider：

- `amazon.nova-2-sonic-v1:0`
- 现有 `AWS Transcribe + LLM + Polly`
- 未来可接 OpenAI Realtime / Gemini realtime 等

#### L5. Agent Runtime Layer

职责：

- 上下文管理
- 工具调用
- Memory 接入
- 多端 session 共享

---

## 七、Provider 策略

### 7.1 主推荐方案: Hybrid Agent Mode

采用原则：

- `Hybrid Agent Mode` 作为生产默认架构
- 统一 Voice Session Layer 承担打断、恢复监听、工具回流、跨端接续
- 按场景把实时语音能力路由到不同 provider，而不是被单一 speech-to-speech 模型锁死

选择原因：

- 复杂工作流、工具调用、多步骤 reasoning 不应被单一语音模型能力边界限制
- 用户可保留对上层 LLM 的选择权
- 更容易做成本分层和套餐设计
- 可以把“实时体验上限”和“复杂任务能力上限”拆开优化

主通道路由：

1. 默认走 `STT -> Agent Router -> chosen LLM -> TTS`
2. 当场景明确追求最低时延、自然抢话、轻中度任务时，可切到端到端实时语音 provider
3. 所有 provider 都必须挂在同一套 session 协议与观测体系下

### 7.1.1 端到端实时语音候选: Amazon Nova 2 Sonic

采用原则：

- 作为端到端实时语音体验上限候选
- 不作为唯一默认主路径

选择原因：

- speech-to-speech 单模型路径，理论上更低延迟
- 原生支持 bidirectional streaming
- 更适合 barge-in 与动态 turn-taking
- 能保留更多声学上下文而不是先文本化再重建
- 支持跨语种与 polyglot voice
- 与 Bedrock 生态整合较好，便于与现有 AWS 能力统一

### 7.1.2 Nova 2 Sonic 与 LLM 的关系

关键原则：

- 如果走 `Nova 2 Sonic` 主通道，它本质上是 Amazon 自己的端到端 speech-to-speech 模型。
- 这条主通道内，不应假设可以在一次实时语音回合中“替换成其他外部 LLM 作为脑子”。
- 也就是说，`Nova 2 Sonic` 不是一个“把 STT/TTS 交给 AWS，中间推理随便换 Anthropic / OpenAI / Gemini”的透明壳层。

因此本产品需要区分两种模式：

1. `End-to-end Voice Mode`

- 直接使用 `Nova 2 Sonic` 完成语音理解、推理和语音生成
- 目标是极致实时性、自然打断、最低交互延迟
- 适合日常陪伴、语音助手、轻中度工具调用

2. `Hybrid Agent Mode`

- 语音入口和语音输出仍然走统一 Voice Session Layer
- 但在需要强工具链、指定模型、复杂 reasoning 或用户自选模型时，切换到 `STT -> external LLM -> TTS` 管线
- 外部 LLM 可以是 Anthropic、OpenAI、Gemini、DeepSeek 或平台已有 provider

结论：

- `Hybrid Agent Mode` 应作为默认生产模式
- `Nova 2 Sonic` 适合做高实时性增强模式
- 不适合被设计成“实时语音壳 + 任意第三方 LLM 热插拔”
- 用户若明确要求指定其他 LLM，应切到 `Hybrid Agent Mode`

### 7.1.3 Nova 2 Sonic 价格策略

当前结论：

- `Nova 2 Sonic` 已经适合列为主评估对象
- 但公开抓取到的 Bedrock pricing 页面未稳定返回 `Nova 2 Sonic` 的明确单价
- 因此在 PRD 中应把其价格标记为 `TBD / 需以 Bedrock 控制台或正式报价为准`

产品策略要求：

- 不允许把 `Nova 2 Sonic` 作为唯一语音路径后再被价格反向卡死
- 必须保留可观测的 fallback 和分层用户策略
- 必须按 `每分钟成本`、`每 10 分钟会话成本`、`首包延迟`、`barge-in 稳定性` 进行 A/B 对比

成本控制策略：

- 免费或低等级用户默认进入 `Hybrid Agent Mode`
- 高频或高价值用户可升级 `Nova Realtime Premium`
- 超长会话、工具密集型任务、指定模型任务优先路由到混合管线

### 7.2 Fallback 方案

fallback 不是备胎，而是生产必须品。

保留链路：

- STT: AWS Transcribe Streaming
- STT fallback: Whisper / Groq transcription
- LLM: 现有 Agent 路由层
- TTS: AWS Polly

fallback 触发条件：

- Nova 2 Sonic 不可用
- 目标区域不可用
- 目标语言或声线不满足要求
- 成本模式不适合当前用户等级
- 网络质量不适合长连接实时流

### 7.3 Provider 评估指标

必须量化比较：

- 首包时延
- 连续对话稳定性
- barge-in 成功率
- 中英混合识别质量
- 情绪、语气、自然度
- 工具调用并行时的会话稳定性
- 单分钟成本

### 7.4 备选方案与价格竞争力

#### A. Gemini Live / Gemini Native Audio

优点：

- 官方提供 Live API，支持低延迟实时语音、barge-in、工具调用、WebSocket 长连接
- 官方存在免费层，适合验证期和早期灰度
- 官方公开价格对音频较透明，适合精细成本控制

已公开的可参考价格：

- `gemini-2.5-flash-native-audio-preview-12-2025`
- 免费层: `Free of charge`
- 付费层: 音频输入 `$3.00 / 1M tokens`，音频输出 `$12.00 / 1M tokens`

适合定位：

- `P0/P1` 阶段快速验证
- 成本敏感的实时语音实验
- 作为 `Nova 2 Sonic` 的强竞争备选

#### B. OpenAI Realtime API

优点：

- 产品成熟度高
- speech-to-speech 体验强
- 生态成熟，第三方框架集成多

缺点：

- 从公开价位看，通常不会是最便宜路线
- 免费阶段不如 Gemini 清晰

已公开的可参考价格：

- `gpt-realtime-1.5` / `gpt-realtime`
- 文本输入 `$4.00 / 1M tokens`，文本输出 `$16.00 / 1M tokens`
- `gpt-realtime-mini` 文本输入 `$0.60 / 1M tokens`，文本输出 `$2.40 / 1M tokens`
- 音频价格需要以 OpenAI 平台实时价格页为准，不应在 PRD 内写死旧值

适合定位：

- 高质量对标基线
- `Nova` 的体验对照组
- 非首选低成本方案

#### C. 现有拼接式管线

组成：

- `AWS Transcribe Streaming + external LLM + AWS Polly`
- 或 `Whisper / Groq + external LLM + TTS`

优点：

- 可控性最强
- 可以接入用户指定模型
- 易做分层和精细化成本路由

缺点：

- 不是最佳实时体验
- barge-in、情绪保留、自然 turn-taking 先天吃亏

适合定位：

- 生产 fallback
- 用户自选模型模式
- 低成本模式

#### D. 开源 / 近乎免费路线

可评估方向：

- 本地或自托管 `Whisper` 类 STT
- 开源 TTS
- 小模型 text reasoning 或自托管 LLM

优点：

- 边际成本最低
- 适合内部验证和实验环境

缺点：

- 很难在 2026 年直接达到世界级实时对话的整体体验
- 多语言、自然度、鲁棒性、打断体验通常明显弱于头部闭源实时模型

结论：

- 这条路线适合作为内部实验或超低成本 fallback
- 不建议作为 Agentrix 的旗舰语音体验主通道

### 7.5 推荐选型结论

推荐顺序：

1. `Hybrid Agent Mode` 作为生产主架构与默认模式
2. `Gemini Live / Native Audio` 作为价格和免费期最强实时语音竞争对手
3. `Nova 2 Sonic` 作为目标体验上限候选
4. `OpenAI Realtime` 作为高质量对标基线，而不是默认成本优先方案

商业化前建议：

- 不要先押单一 provider
- 先做统一 Voice Session Layer + Provider Adapter
- 让 `Hybrid Pipeline`、`Nova`、`Gemini` 在同一指标系统内跑真实 A/B

---

## 八、关键产品设计

### 8.1 交互模式

支持三种模式：

1. `Push-to-talk`
2. `Hands-free realtime`
3. `Hybrid`

默认策略：

- 新用户默认 `Push-to-talk`
- 完成熟悉与权限授权后，可升级 `Hands-free realtime`
- 蓝牙耳机场景优先推荐 `Hands-free realtime`

### 8.2 会话中的工具调用

目标体验：

- 用户说“帮我查天气”
- Agent 口头回应“我来查一下”
- 查询过程中用户仍可继续说别的
- 工具结果返回后，Agent 自然插入回应

要求：

- 工具调用必须是异步的
- 语音流不中断
- Agent 要能在播报中说明“我正在处理”

### 8.3 可见与不可见 UI

屏上可见：

- 当前状态
- 实时字幕
- 当前 provider
- 网络与麦克风状态
- 一键切回文本

屏上不可见但必须可控：

- 语音唤醒
- 打断
- 停止
- 重试
- 转文本继续

---

## 九、技术设计要求

### 9.1 客户端

移动端新增统一模块：

- `VoiceSessionManager`
- `VoiceTransport`
- `VoiceStateMachine`
- `AudioRouteController`
- `SpeechDiagnostics`

要求：

- 现有 `AgentChatScreen` 不再直接编排复杂语音状态
- UI 只订阅状态，不持有底层控制逻辑

### 9.2 服务端

新增统一模块：

- `RealtimeVoiceGatewayModule`
- `VoiceProviderAdapter`
- `NovaSonicAdapter`
- `PipelineFallbackAdapter`
- `VoiceSessionStore`

要求：

- 单个 session 可跨 provider 切换
- 每个 session 可追踪延迟、转写、工具调用、打断事件

### 9.3 观测与回放

必须记录：

- session id
- provider
- start/end timestamps
- user speech start/end
- agent speech start/end
- barge-in events
- tool start/end
- fallback trigger reason
- 用户中断和重试原因

---

## 十、阶段规划

### Phase 0: 验证期（1-2 周）

输出：

- Nova 2 Sonic 技术可行性验证
- 与当前拼接链路对比基线
- 定义统一实时语音 session 协议

### Phase 1: 移动端内核重构（2-4 周）

输出：

- `VoiceSessionManager`
- 统一状态机
- 统一指标埋点
- 现有移动端 UI 接入新内核

### Phase 2: 主通道接入 Nova 2 Sonic（2-3 周）

输出：

- Nova 2 Sonic adapter
- 实时双向流跑通
- fallback 自动切换策略

### Phase 3: 工具调用与长对话（2-3 周）

输出：

- 语音会话中的异步工具调用
- 长对话稳定性优化
- 跨模态切换

### Phase 4: 桌面端迁移（2 周）

输出：

- 桌面端复用统一 session 协议
- 废弃旧的按住说话主逻辑

---

## 十一、风险与对策

### 风险 1: 单模型方案成本过高

对策：

- 保留 fallback 管道
- 分层用户策略
- 为高价值用户默认高质量模式

### 风险 2: 中文或中英混合效果不稳定

对策：

- 建立中英混合集合评测集
- 保留现有 AWS/Whisper fallback

### 风险 3: 移动端音频链路复杂，回声与抢话体验不稳定

对策：

- 音频路由与会话状态机分层
- 建立硬件矩阵测试
- 优先耳机场景

### 风险 4: 桌面端和移动端分叉

对策：

- 禁止桌面端单独扩展新语音协议
- 统一走 Voice Session Layer

---

## 十二、结论

Agentrix 的语音路线应明确为：

- 移动端先做世界级实时语音对话
- 以统一会话层为核心，而不是堆更多 UI 状态
- 以 `Hybrid Agent Mode` 作为默认生产架构
- 以 `Nova 2 Sonic` 和 `Gemini Live` 作为实时体验增强候选
- 以当前拼接式 AWS/Whisper/Polly 链路作为稳定 fallback 与可控成本路径
- 移动端成熟后再把同一套协议迁移到桌面端

这不是“加一个更好的 TTS”项目，而是把 Agentrix 从“聊天应用”推进到“常驻语音 Agent 操作系统”的关键一步。