# Agentrix AI 眼镜端 PRD — GLASS 独立接入方案

**版本**: 1.0  
**日期**: 2026-04-05  
**状态**: Draft  
**作者**: CEO Agent (@ceo)  
**关联文档**:
- `docs/PRD_TRI_TIER_HYBRID_AI.zh-CN.md` (三级混合 AI 架构总 PRD)
- `docs/WEARABLE_OPENCLAW_PRD.md` (穿戴设备 OpenClaw 集成)
- `docs/PRD_CROSS_PLATFORM_VOICE.zh-CN.md` (跨端语音 PRD)

---

## 〇、核心问题

### GLASS 是什么？

GLASS **不是**一个独立的安装包。Agentrix AI 眼镜接入方案是：

```
┌─────────────────────────────────────────────────────────┐
│  AI 眼镜 (硬件)   ←──BLE──→   手机 Agentrix App (中继)   │
│                                      │                   │
│  • 无独立 OS App                      │ WebSocket         │
│  • 无需安装任何东西                    ▼                   │
│  • 纯蓝牙外设模式              Agentrix 云端服务          │
└─────────────────────────────────────────────────────────┘
```

**架构定位**: AI 眼镜 = **纯蓝牙外设 (BLE Peripheral)**，通过手机 Agentrix App 作为中继接入 Agentrix 生态。

- **眼镜端**: 零安装，蓝牙配对即用
- **手机端**: Agentrix-Claw App 增加"穿戴设备"模块（已有 BLE 基础层）
- **云端**: Voice Gateway v2 已支持 `voice:image:frame` 和策略路由

### 为什么不做独立 App？

| 方案 | 优势 | 劣势 | 选择 |
|------|------|------|------|
| 眼镜独立 App | 无需手机 | 每款眼镜需单独开发；算力严重受限；无法复用 Agent 生态 | ❌ |
| 手机中继 (BLE) | 零安装；复用整个 Agentrix 手机端能力；一套代码适配多款眼镜 | 依赖手机在身边 | ✅ |
| 配套桌面端 | WiFi 直连延迟低 | 眼镜使用场景不一定在桌面前 | ⚠️ 备选 |

---

## 一、产品愿景

> **"戴上眼镜，Agent 随时在线"** — 用户戴上任何兼容的 AI 眼镜，自动与手机端 Agentrix 配对，即刻获得语音+视觉多模态 Agent 能力，无需掏出手机。

### 核心场景

| 场景 | 用户行为 | Agent 能力 |
|------|---------|-----------|
| 🛒 **超市比价** | 看到商品 + 说"这个多少钱" | 识别商品图像 + 搜索价格 + 语音播报 |
| 🗣️ **实时翻译** | 与外国人对话 | 听→翻译→眼镜耳机播放 (全双工) |
| 📝 **会议纪要** | 戴眼镜参加会议 | 持续录音 + 实时摘要 + 行动项提取 |
| 🧭 **导航指引** | 说"带我去最近的咖啡店" | 语音导航 + 前方路标识别 |
| 💳 **无感支付** | 说"买这个" | Agent 下单 → 手机弹出 MPC 签名确认 |
| 🔧 **维修指导** | 看到设备说"怎么修这个" | 识别设备型号 + 语音引导步骤 |
| 👤 **人脸备忘** | 遇到某人说"记一下这个人" | 提取面部特征 → 关联备忘录（需用户授权） |

---

## 二、适配硬件策略

### 2.1 不自制硬件，适配开放生态

我们只适配支持开放 BLE API 的 AI 眼镜，不自研硬件。

### 2.2 优先适配目标 (2026 H1)

| 设备 | 开放度 | 能力 | 适配优先级 |
|------|--------|------|-----------|
| **Even Realities G1** | BLE 开放 API | 单色 HUD、麦克风、扬声器、触摸条 | 🥇 P0 |
| **XREAL Air 2 Ultra** | Android AR SDK | 全彩 AR、6DoF、双摄像头 | 🥈 P1 |
| **Meta Ray-Ban Stories** | 有限 BLE | 摄像头、扬声器、触摸 | 🥉 P2 (BLE 受限) |
| **通用 BLE 音频眼镜** | 标准 BLE Audio | 仅麦克风+扬声器 | P1 (音频通道) |
| **未来 Gemma Nano 内置眼镜** | 完全开放 | 全能力 + 端侧推理 | P3 (2027+) |

### 2.3 能力矩阵 (按硬件)

| 能力 | Even G1 | XREAL Air 2 | Meta RB | BLE 音频 |
|------|---------|-------------|---------|----------|
| 语音输入 (麦克风) | ✅ | ✅ | ✅ | ✅ |
| 语音输出 (扬声器) | ✅ | ✅ | ✅ | ✅ |
| 摄像头图像帧 | ❌ | ✅ 双摄 | ✅ | ❌ |
| HUD 文本显示 | ✅ 单色 | ✅ 全彩 AR | ❌ | ❌ |
| 触摸交互 | ✅ 触摸条 | ✅ | ✅ | ❌ |
| IMU 姿态 | ✅ | ✅ 6DoF | ❌ | ❌ |
| 唤醒词 (本地) | ⚠️ 部分 | ❌ | ✅ | ❌ |

---

## 三、技术架构

### 3.1 端到端数据流

```
┌──────────────┐         ┌──────────────────────┐         ┌─────────────────┐
│  AI 眼镜      │  BLE    │  手机 Agentrix App    │  WS     │  Agentrix Cloud │
│              │ Audio   │                      │         │                 │
│ [Mic] ───────┼────────►│ WearableAudioRelay   │────────►│ Voice Gateway   │
│              │         │   ↓ PCM 16kHz        │ audio   │   v2            │
│ [Camera] ────┼────────►│ WearableImageRelay   │────────►│   ↓             │
│              │ Frame   │   ↓ JPEG 720p        │ image   │ [Strategy]      │
│              │         │                      │         │   ↓             │
│ [Speaker] ◄──┼─────────│ AudioQueuePlayer     │◄────────│ TTS / e2e audio │
│              │ Audio   │                      │ audio   │                 │
│ [HUD] ◄──────┼─────────│ GlassHUDController   │◄────────│ Agent text      │
│              │ Text    │                      │ text    │                 │
│              │         │                      │         │                 │
│ [Touch] ─────┼────────►│ GlassGestureHandler  │────────►│ voice:interrupt  │
│              │ Event   │                      │ cmd     │ voice:text      │
└──────────────┘         └──────────────────────┘         └─────────────────┘
```

### 3.2 BLE 通信协议

#### GATT Service 定义 (Agentrix Glass Service)

| Service UUID | 特征 UUID | 方向 | 描述 |
|-------------|-----------|------|------|
| `0xAGX0` (自定义) | `0xAGX1` | Notify | 麦克风音频流 (PCM 16kHz LE16) |
| `0xAGX0` | `0xAGX2` | Write | 扬声器音频流 (PCM/MP3) |
| `0xAGX0` | `0xAGX3` | Notify | 摄像头图像帧 (JPEG, 触发式) |
| `0xAGX0` | `0xAGX4` | Write | HUD 文本推送 (UTF-8, ≤200 字节) |
| `0xAGX0` | `0xAGX5` | Notify | 触摸/IMU 事件 (JSON) |
| 标准 Battery | `0x2A19` | Read/Notify | 电池电量 |
| 标准 DIS | `0x2A29` | Read | 制造商名称 |

#### BLE 音频传输方案

```
问题：经典蓝牙 BLE 4.x MTU ≈ 247 字节，PCM 16kHz = 32KB/s → 远超 BLE 吞吐量

方案 A (BLE Audio Profile): 使用 LE Audio (LC3 编码) — 需要蓝牙 5.2+
方案 B (HFP 经典蓝牙):    SCO 音频通道 — 延迟低但音质差 (8kHz)
方案 C (BLE + Opus 压缩):  Opus 编码 @ 16kbps = 2KB/s → BLE 可承载
方案 D (WiFi Direct):      P2P WiFi 直连 — 带宽充足但功耗高

选择：方案 C (Opus over BLE) 为 MVP，方案 A (LE Audio) 为目标
  - Opus 编码在眼镜端完成 / 手机端解码
  - 每个 BLE 通知包含 20ms Opus 帧 (约 40 bytes)
  - 实测延迟增量 ~20-30ms，可接受
```

### 3.3 手机端新增模块

#### 3.3.1 模块清单

| 模块 | 文件路径 | 描述 |
|------|---------|------|
| `GlassVendorProfile` | `wearableVendorRegistry.service.ts` | 眼镜设备识别 + GATT 映射 |
| `WearableAudioRelay` | `wearables/wearableAudioRelay.service.ts` | BLE 音频 → WebSocket 音频流 |
| `WearableImageRelay` | `wearables/wearableImageRelay.service.ts` | BLE 图像 → WebSocket image:frame |
| `GlassHUDController` | `wearables/glassHUDController.service.ts` | 文本/通知推送到眼镜 HUD |
| `GlassGestureHandler` | `wearables/glassGestureHandler.service.ts` | 触摸/IMU 事件映射为 Agent 指令 |
| `GlassAuthInterceptor` | `wearables/glassAuthInterceptor.service.ts` | 支付意图拦截 → 手机 MPC 签名 |
| `GlassSessionBridge` | `wearables/glassSessionBridge.service.ts` | 管理眼镜↔云端 Voice Session 生命周期 |

#### 3.3.2 WearableAudioRelay (核心)

```typescript
// 职责：
// 1. 订阅眼镜 BLE 音频特征 (Notify)
// 2. Opus → PCM 解码 (如有)
// 3. 通过现有 Voice Gateway WebSocket 以 voice:audio:chunk 发送
// 4. 接收云端 voice:agent:audio，编码后通过 BLE Write 发回眼镜扬声器

class WearableAudioRelay {
  // BLE Notify → 解码 → voice:audio:chunk
  startUpstream(deviceId: string, voiceSocket: Socket): void;

  // voice:agent:audio → 编码 → BLE Write
  startDownstream(deviceId: string, voiceSocket: Socket): void;

  // 停止中继
  stop(): void;
}
```

#### 3.3.3 WearableImageRelay

```typescript
// 职责：
// 1. 订阅眼镜 BLE 图像特征 (Notify) — JPEG 分包重组
// 2. 通过 voice:image:frame 发送到云端

class WearableImageRelay {
  // BLE Notify → 分包重组 → voice:image:frame
  startRelay(deviceId: string, voiceSocket: Socket): void;

  // 手动触发一次拍照（对支持命令式相机的设备）
  captureFrame(): Promise<Buffer>;
}
```

### 3.4 云端适配

Voice Gateway v2 **已支持**眼镜端所需的全部协议：

| 已实现 | 描述 |
|--------|------|
| ✅ `voice:image:frame` 事件 | 接收 Base64 图像帧 |
| ✅ `v2Strategy` 路由字段 | deviceType='glass' → 优先 gemma-multimodal |
| ✅ `GemmaMultimodalVoiceStrategy` | 支持 `processImageFrame()` |
| ✅ 策略降级 | GPU 不可用时自动回退 cascade |

**无需后端改动**，仅需手机端作为中继桥接。

---

## 四、用户体验设计

### 4.1 首次配对流程

```
1. 用户打开 Agentrix App → 设置 → 穿戴设备
2. 点击"扫描附近设备"
3. 列表中出现 AI 眼镜 (带🕶️图标 + 型号名)
4. 点击配对 → BLE 配对 (PIN/Just Works)
5. App 自动检测眼镜能力 (麦克风/摄像头/HUD/触摸)
6. 显示"已连接 — 可用能力"看板
7. 说"Hey Agentrix"测试连通性 → 眼镜耳机播放"你好，我在"
8. 配对完成 ✅ 下次自动重连
```

### 4.2 日常使用流程

```
用户出门戴上眼镜
  ↓
手机 App 后台自动检测 BLE 重连
  ↓
状态栏显示 🕶️ 图标 (已连接)
  ↓
说 "Hey Agentrix" → 唤醒
  ↓
眼镜麦克风录音 → BLE → 手机 → WebSocket → 云端
  ↓
云端识别+回复 → voice:agent:audio → 手机 → BLE → 眼镜扬声器播放
  ↓
（如有 HUD）同时在眼镜 HUD 上显示简短文本
```

### 4.3 支付安全流程

```
用户："帮我买这个"
  ↓
Agent 识别为支付意图
  ↓
GlassAuthInterceptor 拦截
  ↓
眼镜 HUD 显示："确认支付 ¥39.99?"
  ↓
用户眼镜触碰确认 / 说"确认"
  ↓
手机端弹出 MPC 签名页面 (全屏，需生物认证)
  ↓
Face ID / 指纹 → 签名 → 交易完成
  ↓
眼镜播放："支付成功"
```

---

## 五、数据流与隐私

### 5.1 数据分类

| 数据类型 | 存储位置 | 加密 | 保留策略 |
|---------|---------|------|---------|
| 音频流 | 不存储 (流式处理) | TLS (WS) | 实时丢弃 |
| 图像帧 | 不存储 (处理后丢弃) | TLS (WS) | 处理后即删 |
| 会话文本 | 云端 PostgreSQL | AES-256 | 用户可删除 |
| 电池/IMU 遥测 | 手机端本地 | — | 7 天轮转 |
| 支付签名 | 链上 | — | 永久 |

### 5.2 隐私保护

- **摄像头**: 默认关闭，仅在用户语音指令触发时抓取单帧（非持续录像）
- **麦克风**: 仅在唤醒词触发后开始传输，非活跃时 BLE 断开音频通道
- **人脸数据**: 仅提取特征向量，不存储原始图像，需用户二次确认
- **位置**: 不从眼镜获取位置，仅在手机端使用（遵循已有隐私策略）

---

## 六、实施路线

### Phase G1: BLE 音频通道 MVP (2 weeks)

| 任务 | 模块 | 优先级 |
|------|------|--------|
| 在 vendor registry 增加 `glass` WearableKind | Mobile | P0 |
| 实现 `WearableAudioRelay` (BLE Notify → voice:audio:chunk) | Mobile | P0 |
| 实现 `WearableAudioRelay` 下行 (voice:agent:audio → BLE Write) | Mobile | P0 |
| 用 Even G1 / 通用 BLE 耳机真机验证端到端语音 | QA | P0 |
| 眼镜设备管理 UI (配对/断开/状态) | Mobile | P1 |

### Phase G2: 视觉多模态 + HUD (2 weeks)

| 任务 | 模块 | 优先级 |
|------|------|--------|
| 实现 `WearableImageRelay` (分包图像重组 + voice:image:frame) | Mobile | P0 |
| 实现 `GlassHUDController` (文本推送到 HUD) | Mobile | P0 |
| GPU 节点部署 Gemma 4 Multimodal + 视觉理解测试 | Backend | P0 |
| 眼镜端实时翻译场景验证 | QA | P1 |

### Phase G3: 交互增强 + 支付 (2 weeks)

| 任务 | 模块 | 优先级 |
|------|------|--------|
| 实现 `GlassGestureHandler` (触摸/IMU 映射) | Mobile | P0 |
| 实现 `GlassAuthInterceptor` (支付意图拦截 + MPC 签名) | Mobile | P0 |
| 实现 `GlassSessionBridge` (后台自动重连 + session 管理) | Mobile | P1 |
| 多品牌眼镜适配测试 | QA | P1 |

### Phase G4: 量产适配 + 生态开放 (4 weeks)

| 任务 | 模块 | 优先级 |
|------|------|--------|
| XREAL Air 2 Ultra AR SDK 适配 | Mobile | P1 |
| 第三方眼镜接入 SDK (开放 BLE 协议规范) | SDK | P2 |
| 眼镜端 Gemma Nano 推理 (未来支持本地唤醒词的眼镜) | Edge | P3 |

---

## 七、风险与缓解

| 风险 | 影响 | 缓解策略 |
|------|------|---------|
| BLE 音频带宽不足 (经典 BLE < 1Mbps) | 音频质量/延迟差 | 使用 Opus 编码压缩至 16kbps；升级 LE Audio |
| 眼镜硬件碎片化严重 | 每款设备 GATT 服务不同 | Vendor Registry 模式，每新设备添加一个 profile |
| 眼镜电池续航短 | 音频传输功耗高 | BLE 低功耗模式；非活跃时断开音频通道 |
| 摄像头隐私争议 | 用户/法律风险 | 默认关闭；语音触发式单帧；LED 指示灯（需硬件支持） |
| 手机不在身边 | 眼镜完全不可用 | 明确定位为"手机配件"；未来支持 WiFi Direct 备选通道 |
| GPU 节点未就绪 | 无视觉理解能力 | 先走 cascade 策略（STT→LLM→TTS），不支持图像帧 |

---

## 八、成功指标

| 指标 | Phase G1 目标 | Phase G3 目标 |
|------|-------------|-------------|
| 配对成功率 | >90% | >98% |
| 语音端到端延迟 (眼镜说→眼镜听到回复) | <3s (cascade) | <1.5s (e2e) |
| 图像理解准确率 | N/A | >80% (物体识别) |
| 支付拦截率 (不误放) | N/A | 100% |
| 电池额外消耗 (手机端) | <5%/hr | <3%/hr |
| 适配眼镜品牌数 | 1 (Even G1) | 3+ |
| 日活眼镜用户 (3个月后) | 50 | 500 |

---

## 九、与三级混合架构的关系

```
           AI 眼镜 PRD (本文档)
                │
                │ 定义：硬件适配 + BLE 协议 + 手机中继
                │
                ▼
    ┌───────────────────────┐
    │  三级混合 AI 架构 PRD  │
    │  (PRD_TRI_TIER)       │
    │                       │
    │  第一级：端侧 Nano    │ ← 眼镜唤醒词 (未来含 Nano)
    │  第二级：云端 Gemma 4  │ ← 眼镜音频/图像 → voice:image:frame
    │  第三级：超脑 API     │ ← 复杂任务路由
    └───────────────────────┘
```

- 本 PRD 聚焦**硬件接入层**：BLE 协议、手机中继、设备适配
- 三级 PRD 聚焦**AI 推理层**：模型路由、策略分流、延迟优化
- 两份 PRD 通过 Voice Gateway v2 的 `deviceType='glass'` 和 `voice:image:frame` 协议桥接

---

*本文档由 CEO Agent 编写，Eye on the Prize — Agent Everywhere.*
