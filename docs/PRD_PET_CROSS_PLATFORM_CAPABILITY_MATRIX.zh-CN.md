# Agentrix ClawBuddy · 跨端能力矩阵专项文档

> **版本**：v1.0  
> **日期**：2026-05-06  
> **关联 PRD**：`docs/PRD_DESKTOP_PET_AGENTRIX_CLAW.zh-CN.md`（v2.0）  
> **作者**：@dev + @design  
> **状态**：草稿，待评审

---

## 0. 目的

ClawBuddy 是「同一只宠物，住进 6 类端 + 5 种硬件接入」。本文档锁定：

- 6 端（Desktop / Mobile / Watch / Glass / Toy / Web）的形态、能力、限制
- 5 种硬件接入方式（NFC / BLE Beacon / ClawCore SDK / Wi-Fi / 厂商 App SDK）的协议级别差异
- 各端的「最小可用能力（MVP）」与「目标能力」
- 跨端同步契约（SSoT topic、降级策略、冲突解决）

读者：跨端工程师、设计师、硬件 / 协议工程师、产品。

---

## 1. 端 × 能力总览矩阵

| 能力 | Desktop | Mobile | Watch | Glass | Toy | Web |
|------|:------:|:------:|:------:|:------:|:------:|:------:|
| **渲染层级 L0 SVG** | ✅ | ✅ | ✅ | ⚠️ HUD | — | ✅ |
| **渲染层级 L1 Rive** | ✅ | ✅ | — | — | — | ✅ |
| **渲染层级 L2 VRM 低面数** | ✅ | ✅ | — | ✅ | — | ✅ |
| **渲染层级 L3 VRM 高面数 + PBR** | ✅ | ⚠️ 旗舰机 | — | ✅ | — | ⚠️ 弱网降级 |
| **渲染层级 L4 实体硬件** | — | — | — | — | ✅ | — |
| **PetCreator 入口** | ✅ 满血 | ✅ 简版 | — | — | — | ⚠️ 提交+查看 |
| **摄像头扫描（V5）** | ⚠️ 外接相机 | ✅ 主入口 | — | ✅ 眼镜原生 | — | — |
| **VRM 在线渲染** | ✅ Three.js | ✅ react-three-fiber | — | ✅ Unity / WebGL | — | ✅ Three.js |
| **情绪同步** | ✅ | ✅ | ✅ | ✅ | ✅ (LED + 振动) | ✅ |
| **亲密度同步** | ✅ | ✅ | ✅ | ✅ | ✅ (本地缓存) | ✅ |
| **能量系统显示** | ✅ | ✅ | ✅ Complication | ✅ HUD | ✅ LED 颜色 | ✅ |
| **L0 审批（无感）** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **L1 审批（轻审批）** | ✅ tap | ✅ tap | ✅ tap | ✅ gaze | ✅ 物理按键 | ✅ click |
| **L2 审批（生物）** | ⚠️ 转手机 | ✅ 必须 | — | ⚠️ 转手机 | ⚠️ 转手机 | ⚠️ 转手机 |
| **L3 审批（多端协签）** | ✅ 协签端 | ✅ 协签端 | — | ✅ 协签端 | — | ✅ 协签端 |
| **PetCreator 文生** | ✅ | ✅ | — | — | — | ✅ |
| **PetCreator 图生** | ✅ | ✅ | — | — | — | ✅ |
| **PetCreator 摄像头扫描** | ⚠️ V5 W11 | ✅ V5 W9 主入口 | — | ✅ V5 W12 | — | — |
| **Auto-Earn 开关** | ✅ | ✅ | ✅ | — | — | ✅ |
| **Auto-Earn 任务执行** | ✅ 主战场 | ⚠️ 后台 | — | — | — | ⚠️ 浏览器存活时 |
| **A2A 派单** | ✅ | ✅ | — | — | — | ✅ |
| **Marketplace 浏览** | ✅ | ✅ | — | — | — | ✅ 主战场 |
| **Marketplace 上架** | ✅ | ⚠️ 简版 | — | — | — | ✅ |
| **Marketplace 购买** | ✅ | ✅ | — | — | — | ✅ |
| **视觉感知（看屏幕）** | ✅ | — | — | — | — | — |
| **视觉感知（看现实世界）** | ⚠️ 外接 | ✅ | — | ✅ 主战场 | — | — |
| **语音对话（实时）** | ✅ | ✅ | ⚠️ 短指令 | ✅ | ✅ | ✅ |
| **语音克隆** | ✅ | ✅ | — | — | ⚠️ 播放 | ✅ |
| **触摸 / 拥抱反馈** | — | ⚠️ 屏幕触摸 | ⚠️ 表面 tap | — | ✅ 主战场 | — |
| **健康数据回传** | — | ✅ | ✅ 主入口 | ⚠️ 眼动 | — | — |
| **AR 模式** | — | ✅ | — | ✅ 原生 | — | — |
| **NFC 触发** | — | ✅ | — | — | ✅ 物体侧 | — |
| **BLE Beacon 检测** | ✅ | ✅ | ⚠️ 系统级 | ✅ | ✅ 物体侧 | — |
| **离线模式** | ✅ 局部 | ⚠️ 缓存 | ⚠️ 表盘 | — | ✅ 设备本地 | — |
| **嵌入到第三方页面** | — | — | — | — | — | ✅ iframe |
| **公开档案页 / 社交分享** | ⚠️ 链接到 Web | ⚠️ 链接到 Web | — | — | — | ✅ 主战场 |

> ✅ = 完整支持；⚠️ = 部分支持或需特殊条件；— = 不支持。

---

## 2. 各端形态详解

### 2.1 Desktop（桌面端）— 主战场，能力最完整

**定位**：最长在线、最重度使用、Pro / Pro+ 用户的主要工作区。

**形态**：

- **浮球模式**（`PetCanvas.tsx`）：永远悬浮在屏幕一角的 SVG / Rive / VRM 宠物
- **聊天面板模式**（`ChatPanel.tsx`）：展开为完整对话窗口
- **Pro Mode**：透明全屏 + 屏幕感知，VRM 大尺寸 + 多 Agent 共存
- **托盘 / 系统状态栏**：最小化时仍显示情绪 emoji

**核心能力清单**：

| 能力 | 实现 | 状态 |
|------|------|:-:|
| 全局热键 (Ctrl+Space) 唤起 | `desktop/src/services/globalVoiceShortcut.ts` | ✅ |
| 拖拽文件给宠物 | Tauri drop event | 🟡 V4 W1 |
| 鼠标穿透 / 点击穿透 | Tauri `setIgnoreCursorEvents` | ✅ |
| 多 Agent 并行（11 子宠） | 主宠 + 子宠分屏 | 🟡 V6 |
| VRM 高面数（PBR） | three.js + three-vrm | ✅ |
| 视觉感知屏幕 | `visionPerception.ts`（30s 采样 + hash） | ✅ |
| 桌面 ↔ 后端同步 | `desktopSync.ts` + `desktopAgentSync.ts` | ✅ |
| 满血 PetCreator | `PetCreatorPanel.tsx` + 文生 / 图生 / 配额面板 | ✅ |
| Auto-Earn 任务 | `auto-earn/` 后端 + 桌面任务面板 | 🟡 V4 W7 |
| L1 审批（tap） | `ApprovalSheet.tsx` | ✅ |
| L2 审批（转手机生物） | 二维码 / 推送到手机 | 🟡 V4 W7 |
| L3 协签 | 多端联合签名 | 🟡 V4 W7 |
| 离线模式（局部） | 本地 LLM `localLLM.ts` 兜底 | ✅ |
| Voice 实时对话 | `realtimeVoice.ts` + WebSocket | ✅ |
| 屏幕截图 → 宠物 | `screenshot.ts` + `/ss` slash | ✅ |
| Git slash command | `git.ts` + `/gs` `/gd` | ✅ |
| 通知中心 | `NotificationCenter.tsx` | ✅ |

**性能基线**：

| 项目 | 目标 |
|------|------|
| 启动到浮球可见 | < 1.5s |
| L0 SVG 帧率 | 60 FPS |
| L2 VRM 帧率（中端 GPU） | 60 FPS |
| L3 VRM 帧率（中端 GPU） | 30 FPS |
| 内存占用（idle） | < 200 MB |
| 内存占用（VRM 渲染） | < 600 MB |

---

### 2.2 Mobile（手机端）— 24 小时随身本体

**定位**：审批中心 + AR 创作 + 通勤陪伴 + 摄像头扫描主入口。

**形态**：

- **App 全屏 3D 模式**（`PetCompanionScreen.tsx` 扩展）
- **浮球**（`GlobalFloatingBall.tsx`）：跨页持续显示
- **通知卡片**：审批 / 收益 / 日报
- **Widget**：iOS 14+ WidgetKit + Android App Widget
- **锁屏挂件**：iOS 16+ Lock Screen Widget
- **AR 模式**：ARKit / ARCore 把宠物 VRM 叠加到现实

**核心能力清单**：

| 能力 | 实现 | 状态 |
|------|------|:-:|
| 全屏 VRM 渲染 | react-three-fiber + three-vrm | 🟡 V4 W3 |
| Rive 2D 渲染 | `@rive-app/react-native-canvas` | 🟡 V4 W3 |
| 通知卡片 | Expo Notifications | ✅ |
| iOS Widget | WidgetKit + Swift bridge | 🟡 V4 W4 |
| Android App Widget | RemoteViews + Kotlin bridge | 🟡 V4 W4 |
| 锁屏挂件 | iOS WidgetKit lockScreen family | 🟡 V4 W4 |
| AR 模式 | ARKit / ARCore + VRM 投射 | 🟡 V4 W5 |
| 摄像头扫描（V5 主入口） | Hunyuan3D 多视角 + Expo Camera | 🟡 V5 W9 |
| 健康数据回传 | HealthKit / Health Connect | ✅ |
| NFC 触发 | `expo-nfc` | 🟡 V4 W5 |
| Face ID / Touch ID（L2 审批） | `expo-local-authentication` | 🟡 V4 W7 |
| 后台 Auto-Earn 心跳 | iOS BGAppRefresh + Android WorkManager | 🟡 V4 W8 |
| Marketplace 简版 | RN list + payment | 🟡 V4 W6 |
| 浮球（`GlobalFloatingBall.tsx`） | RN PanResponder | ✅ |
| 离线缓存（最近一次状态） | AsyncStorage + MMKV | ✅ |
| 语音对话 | Expo Audio + WebSocket | ✅ |
| Twitter / Discord 分享 | RN Share API | ✅ |

**性能基线**：

| 设备级别 | L1 Rive | L2 VRM 低 | L3 VRM 高 |
|------|:-:|:-:|:-:|
| iPhone 12+ / 旗舰安卓 | ✅ 60 FPS | ✅ 60 FPS | ✅ 30 FPS |
| iPhone X / 中端安卓 | ✅ 60 FPS | ✅ 30 FPS | ⚠️ 降级 L2 |
| 千元机 | ✅ 30 FPS | ⚠️ 降级 L1 | — |

---

### 2.3 Watch（手表端）— 1 秒触达

**定位**：审批最后一公里 + 心率回传 + 极简陪伴。

**形态**：

- **Complication / Tile**：表盘上显示当前情绪 emoji + 能量条
- **极简宠物 App**：单击启动，显示最小化版宠物
- **Always-On 模式**：低功耗灰阶情绪
- **腕带轻敲检测**：单 / 双 / 三敲对应不同交互

**核心能力清单**：

| 能力 | 实现 | 状态 |
|------|------|:-:|
| watchOS Complication | SwiftUI WidgetKit | 🟡 V4 W7 |
| Wear OS Tile | Tile Service (Kotlin) | 🟡 V4 W7 |
| 数据层桥接 | `watchDataLayerBridge.service.ts` | ✅ |
| 心率回传 | HealthKit / Health Connect | ✅ |
| 步数 / 卡路里 | 同上 | ✅ |
| 腕带轻敲 | `wristTapBridge.service.ts` | ✅ |
| L1 审批（tap） | DataLayer push → Complication 红点 → tap 批准 | 🟡 V4 W7 |
| L2 审批 | ❌ 不支持，转手机 | — |
| 语音备忘 | 系统语音 → 主机 App 中转 | 🟡 V4 W8 |
| 表盘动画 | Complication 动态情绪 | 🟡 V4 W7 |

**通信模型**：

```
Watch ↔ Phone（系统级 DataLayer）↔ Backend
不允许 Watch 直接连后端（流量 / 续航成本）
所有事件经手机中转
```

**注意事项**：

- **不走通用 BLE 扫描**：Apple Watch / Wear OS 用各自系统 API
- **Complication 刷新限制**：watchOS 每天限制 50 次主动刷新，所以情绪 push 必须节流（10 分钟最多 1 次 except 高优先级审批）

---

### 2.4 Glass（眼镜 / XR 端）— 未来主战场

**定位**：让宠物从屏幕里走出来，进入真实空间。

**形态**：

- **HUD 小宠物**：右下角悬浮，永远可见
- **空间宠物**：放置在桌面 / 沙发 / 镜子前的虚拟空间锚点
- **私语模式**：靠近耳朵时音量加大，转头时静音

**核心能力清单**：

| 能力 | 实现 | 状态 |
|------|------|:-:|
| HUD 渲染 | `glassHUDController.service.ts` | ✅ |
| 眼镜会话桥接 | `glassSessionBridge.service.ts` | ✅ |
| 厂商适配（XReal / Meta Quest / VisionOS） | `glassVendorAdapters.service.ts` | ✅ |
| 眼动追踪触发交互 | gaze > 1s = `hover_long` | 🟡 V5 W12 |
| 手势审批 | `glassGestureHandler.service.ts` 单击批准 | ✅ |
| 空间锚点 | ARKit anchors / OpenXR | 🟡 V5 W12 |
| 物体识别 | Vision API + 后端图像识别 | 🟡 V5 W12 |
| 实时翻译 HUD | 字幕浮在对方头顶 | 🟡 V6 |
| VRM 投射 | Unity 引擎 + glTF | 🟡 V5 W11 |

**性能限制**：

- VRM 面数 < 20k（XR 头显 GPU 受限）
- 帧率必须 ≥ 60 FPS（< 60 会引发眩晕）
- 必须支持空间锚定 30 分钟无漂移

---

### 2.5 Toy（玩具 / 实体硬件端）— 情感价值最高

**定位**：给宠物一个可触摸的身体，把灵魂从屏幕里接到现实。

**形态分类**：

| 类型 | 例子 | 接入方式 | 价位 |
|------|------|------|------|
| 毛绒玩具 | ClawCub / 联名熊 / 泰迪 | ClawCore L2 SDK | $39-99 |
| 桌面潮玩 | ClawStick / 摆件 | ClawCore L1 全功能 | $59-129 |
| 音箱型设备 | ClawSpeaker | Wi-Fi + ClawCore | $99-199 |
| 挂件型 | 钥匙扣宠物（OLED） | ClawCore L3 极简 | $19-39 |
| 儿童陪伴玩具 | ClawKid（F 族群专用） | ClawCore L2 + 内容白名单 | $59-99 |

**核心能力（与硬件层级对应）**：

| 能力 | L3 认证 | L2 联名 | L1 旗舰 |
|------|:-:|:-:|:-:|
| 单向上报触摸 | ✅ | ✅ | ✅ |
| LED 颜色情绪 | ⚠️ 单色 | ✅ RGB | ✅ RGB + 渐变 |
| 振动反馈 | ⚠️ 单振 | ✅ 模式 | ✅ 4 种模式 |
| OLED / eink 情绪显示 | — | ⚠️ 可选 | ✅ |
| 拥抱压力检测 | — | ✅ | ✅ |
| 物理审批按键 | — | ✅ | ✅ |
| 麦克风采集 | — | ⚠️ 可选 | ✅ |
| TTS 播放 | — | ✅ | ✅ |
| OTA 更新 | — | — | ✅ |
| 离线缓存 | — | ⚠️ 缓存最近一次 | ✅ |
| Wi-Fi 双向 | — | ⚠️ 可选 | ✅ |

**详细硬件接入方式**：见 §3。

---

### 2.6 Web（网页端）— 最低门槛入口

**定位**：免安装体验 + 社交传播 + Marketplace 主战场 + 嵌入合作伙伴。

**形态**：

- **右下角浮球**（`frontend/components/pet/WebPetCanvas.tsx`）：嵌入 agentrix.top 任意页
- **iframe 嵌入**：合作伙伴一行 `<script>` 即可加载
- **公开档案页** `/p/[petId]`：社交分享主入口
- **Marketplace 主页**：浏览 / 搜索 / 购买 / 上架

**核心能力清单**：

| 能力 | 实现 | 状态 |
|------|------|:-:|
| SVG 浮球 | `WebPetCanvas.tsx` | 🟡 V4 W6 |
| Rive 2D | `@rive-app/canvas` | 🟡 V4 W6 |
| WebGL VRM | three.js + three-vrm | 🟡 V4 W6 |
| iframe 嵌入 SDK | `frontend/components/pet/embed.ts` | 🟡 V4 W6 |
| Marketplace 主页 | Next.js pages | 🟡 V4 W6 |
| 公开档案页 | `pages/p/[petId]/index.tsx` + Open Graph | 🟡 V4 W6 |
| Web PetCreator 简版 | 提交 + 进度查看 | 🟡 V4 W6 |
| WebAuthn / Passkey 审批 | 浏览器原生 | 🟡 V4 W7 |
| WebSocket 同步 | 已有 frontend Realtime | ✅ |
| 离线 PWA | Next.js + Service Worker | 🟡 V6 |

**iframe 嵌入示例**（合作伙伴使用）：

```html
<!-- 一行加载默认宠物 -->
<script src="https://embed.agentrix.top/pet.js" data-pet-id="user-123"></script>

<!-- 自定义嵌入 -->
<iframe 
  src="https://embed.agentrix.top/pet/user-123?theme=dark&size=small" 
  width="120" height="120" 
  style="border:0; position:fixed; bottom:20px; right:20px;">
</iframe>
```

**性能基线**：

| 项目 | 目标 |
|------|------|
| 首屏到浮球可见 | < 1s（含 SVG fallback） |
| Rive 2D 加载 | < 2s |
| VRM 加载 | < 5s（带 progressive） |
| 跨域支持 | CORS + iframe sandbox |

---

## 3. 5 种硬件接入方式详解

### 3.1 NFC 标签（最低门槛）

**适用**：盲盒卡片 / 潮玩贴纸 / 联名贴卡 / 一次性活动周边

**协议**：NDEF（NFC Forum Type 4 标签）

**数据格式**：

```json
{
  "v": 1,
  "type": "claw_nfc",
  "tag_id": "<uuid>",
  "skin_url": "https://cdn.agentrix.top/skins/<id>.vrm",
  "soul_template": "fox",
  "trigger_emotion": "excited",
  "campaign_id": "blindbox_2026_v1"
}
```

**用户流程**：

```
用户用手机贴近 NFC 标签
   ↓
系统弹出 Universal Link → agentrix:// 打开 App
   ↓
App 读取 NDEF → POST /v1/pet/nfc/trigger
   ↓
后端：
  - 校验 tag_id 未被滥用（频率限制）
  - 触发 nfc_touch 交互（+2 happy）
  - 如带 skin_url → 推荐用户领取该皮肤
   ↓
浮球弹出 "你触发了 [campaign_name]！"
```

**实现**：

- 移动：`expo-nfc` + 后端 `pet-generation/nfc.controller.ts`（新增）
- 写卡工具：商家通过 `tools/nfc-writer/` CLI 批量写卡

**成本**：NFC 贴纸 ≈ $0.05/枚

---

### 3.2 BLE Beacon（低成本识别）

**适用**：固定场所的实体玩具 / 桌面潮玩 / 展览展品

**协议**：iBeacon (Apple) + Eddystone (Google)

**数据帧**（Eddystone-URL + Eddystone-TLM）：

```
Frame 1 (URL):   https://a.tx.top/p/<short_id>
Frame 2 (TLM):   电池电量、温度、广告次数
Frame 3 (UID):   用于宠物匹配的 namespace + instance
```

**用户流程**：

```
手机 / 桌面后台扫描到 Eddystone beacon
   ↓
匹配 namespace = "agentrix.toy.v1"
   ↓
读取 instance ID → 查询后端 toy_devices 表
   ↓
若用户已绑定 → 触发 proximity 交互（+1 happy）
若未绑定 → UI 提示「附近有 Agentrix 联名玩偶，要绑定吗？」
```

**实现**：

- 移动 / 桌面：`wearableBleGateway.service.ts` 已有 BLE 扫描，新增 toy profile
- 玩具固件：nRF52 / ESP32 + Embassy / Zephyr，3 节钮扣电池续航 6 个月

**成本**：BLE Beacon 模块 ≈ $1.5/件

---

### 3.3 ClawCore SDK（最完整）

**适用**：联名硬件 / 高互动玩具（全部由合作方制造）

**详见**：主 PRD §4.6 ClawCore SDK 协议草案

**SDK 两层（Agentrix 不自研硬件）**：

| 层 | 帧 type 子集 | 适用 |
|:-:|------|------|
| **L3 认证层** | `hello`, `pet.interaction` | 极简 OLED 挂件、单按键玩具、贴纸 |
| **L2 联名层** | + `pet.state.sync`, `pet.approval.*`, `vitals`, `ota.chunk` | 毛绒玩具、潮玩、智能音箱、IoT |

**通信模型**：

```
设备 ←BLE GATT / Wi-Fi MQTT→ ClawCore Bridge（手机或桌面）
                                ↓
                              Backend
```

**JSON 帧**：

```json
{
  "v": 1,
  "ts": 1714940000123,
  "type": "pet.state.sync",
  "payload": {
    "emotion": "happy",
    "intimacy": 4,
    "energy": 0.8,
    "alert": null
  },
  "sig": "<hmac-sha256>"
}
```

**SDK 仓库结构**（开发者门户 `developer.agentrix.top`）：

```
clawcore-sdk/
├─ proto/                    # JSON schema + protobuf 双格式
├─ esp32-rs/                 # ESP32-S3 Rust + Embassy
├─ nrf-zephyr/               # nRF52 Zephyr
├─ stm32-rt/                 # STM32 + RT-Thread（社区贡献）
├─ android-bridge/           # Kotlin SDK
├─ ios-bridge/               # Swift SDK
├─ desktop-bridge/           # Rust + Tauri command
├─ samples/
│   ├─ minimal-l3-toy/
│   └─ plush-l2/
└─ certification/
    ├─ test-suite/           # 100 项自测
    └─ submission-form/
```

**认证流程**：

| 层 | 流程 | 周期 | 费用 |
|:-:|------|:-:|:-:|
| L3 | 提交固件 + 自测报告 → 自动化测试 → 发证 | 7 天 | $500/SKU/年 |
| L2 | + 实物寄送 + 互通测试 + 联名外观签合同 | 30 天 | $5000 一次性入场费 |

---

### 3.4 Wi-Fi 直连（音箱 / 车机）

**适用**：固定供电的家居 / 车机 / 音箱

**协议**：MQTT over TLS + WebSocket fallback

**特性**：

- 双向高频、低延迟（< 100ms）
- 支持长会话 / 实时语音 streaming
- 无续航顾虑

**用户流程**：

```
设备首次开机 → AP 模式
   ↓
手机 App 连接 AP → 配网（BLE provisioning 或 SmartConfig）
   ↓
设备连家庭 Wi-Fi → 注册到 backend
   ↓
建立 MQTT topic: agentrix/devices/<device_id>/{up|down}
   ↓
绑定到用户的 LivingPet → 双向同步
```

**实现**：

- 后端 MQTT Broker：EMQX 或 AWS IoT Core
- 设备固件：ESP32-S3 + ESP-IDF + esp-mqtt
- 配网：`scripts/provisioning/` + 手机 App「添加设备」流程

---

### 3.5 厂商 App SDK（合作伙伴 App 内嵌）

**适用**：已有大型 App 生态的合作伙伴（米哈游、网易、字节）

**协议**：Android / iOS Native SDK（aar / xcframework），内含一个 mini ClawBuddy renderer

**集成方式**：

```kotlin
// Android Kotlin
val claw = ClawBuddy.builder()
    .userId("user-123")
    .embedMode(EmbedMode.FLOATING)
    .renderLevel(RenderLevel.RIVE_2D)  // 最重 VRM 不允许嵌入
    .scopes(setOf("read_emotion", "send_interaction"))
    .build()

claw.attachTo(rootView)
```

```swift
// iOS Swift
let claw = ClawBuddy.Builder()
  .userId("user-123")
  .embedMode(.floating)
  .renderLevel(.rive2D)
  .scopes([.readEmotion, .sendInteraction])
  .build()

claw.attach(to: window)
```

**约束**：

- 只能渲染 L0 / L1（不允许嵌入完整 Pro Mode）
- 钱包功能不开放（防止劫持）
- 需要 OAuth 授权用户登录 Agentrix
- SDK 体积 < 8 MB（避免合作伙伴抗拒）

**商业模式**：见主 PRD §5.4 硬件生态分成。

---

## 4. 跨端同步契约（SSoT）

### 4.1 核心契约

所有端共享 `shared/types/agentrix-presence.ts` 类型与 topic：

```typescript
// 已有，将扩展
export type PresenceTopic =
  | 'presence:agent.heartbeat'
  | 'presence:pet.state'           // 情绪 / 亲密度 / 能量
  | 'presence:pet.skin.changed'    // 皮肤切换
  | 'presence:pet.soul.changed'    // 灵魂切换（Phase 1 新增）
  | 'presence:pet.approval.request' // L0-L3 审批请求
  | 'presence:pet.approval.reply'   // 审批回复
  | 'presence:pet.interaction'      // 交互上报
  | 'presence:pet.task.update';     // 任务进度

export interface PetState {
  petId: string;
  soulTemplateId: string;
  activeSkinId: string;
  emotion: PetEmotion;
  intimacyLevel: number;
  intimacyXp: number;
  energy: number;          // 0.0 - 1.0（V4 W7 新增）
  surfaces: SurfacePresence[];  // 当前在哪些端在线
  updatedAt: string;
}

export interface SurfacePresence {
  type: 'desktop' | 'mobile' | 'watch' | 'glass' | 'toy' | 'web';
  online: boolean;
  capability: SurfaceCapability;
  lastSeen: string;
}
```

### 4.2 写权威性（Source of Truth）

| 字段 | 写权威端 | 其他端只读？ |
|------|------|:-:|
| `emotion` | 后端 `LivingPetService` | ✅ |
| `intimacyLevel / Xp` | 后端 | ✅ |
| `energy` | 后端 | ✅ |
| `activeSkinId` | 任意端可发起，后端确认 | — |
| `soulTemplateId` | 任意端可发起，后端确认 | — |
| `surfaces[].online` | 各端自己 heartbeat | ⚠️ 后端聚合 |

### 4.3 同步路径

```
任意端写操作
   ↓
POST /v1/pet/<resource>/<action>
   ↓
后端持久化 + 写 outbox
   ↓
Realtime broadcast PresenceTopics.*
   ↓
所有订阅端 5s 内收到
   ↓
本端 Reconciliation：
  - 比 last_local_state 更新 → 直接覆盖
  - 旧 → 丢弃
  - 冲突 → 后端时间戳为准
```

### 4.4 离线 / 弱网降级

```
1. WebSocket（首选）
2. SSE（WebSocket 失败时）
3. 长轮询（SSE 失败时）
4. 完全离线：本地缓存最近一次状态，操作进入 outbox 队列
```

### 4.5 冲突解决

| 冲突类型 | 解决策略 |
|------|------|
| 多端同时切灵魂 | 后端时间戳后到为准，前端 toast 提示「已被另一台设备覆盖」 |
| 多端同时审批 | 第一个返回 ack 的为准，其他端 toast「已被批准/拒绝」 |
| 离线操作冲云端 | 上线后回放 outbox，冲突由用户手动确认 |
| 能量耗尽时多端接单 | 后端拒绝第二个请求，pet 进入 sleepy |

### 4.6 同步性能目标

| 场景 | P50 | P95 |
|------|:-:|:-:|
| 桌面操作 → 移动端可见（同 WiFi） | 200ms | 500ms |
| 桌面操作 → 移动端可见（4G） | 500ms | 1.5s |
| 桌面操作 → 手表（经手机中转） | 800ms | 2s |
| 桌面操作 → 玩具（BLE） | 500ms | 1.5s |
| 桌面操作 → 玩具（Wi-Fi MQTT） | 300ms | 800ms |
| 桌面操作 → 玩具（仅 NFC，无主动） | — | — |

---

## 5. 端能力降级矩阵（弱设备 / 弱网）

| 端 | 强 | 中 | 弱 |
|------|------|------|------|
| Desktop | L3 VRM PBR + 满血视觉感知 | L2 VRM 低面 + 视觉感知开 | L0 SVG + 视觉关 |
| Mobile（旗舰） | L3 VRM + AR | L2 VRM | L1 Rive |
| Mobile（千元机） | L1 Rive | L0 SVG | L0 SVG（静态） |
| Watch | Complication 动画 | Complication 静态 | 仅 emoji |
| Glass | VRM 60 FPS + 空间锚 | VRM 30 FPS | 关闭 |
| Toy | Wi-Fi MQTT 实时 | BLE 双向 | 离线缓存 |
| Web | VRM | Rive | SVG |

降级触发条件：

- GPU benchmark < 阈值
- 网络 RTT > 500ms 持续 30s
- 设备电量 < 20%（Mobile / Watch）
- 用户显式关闭高级渲染

---

## 6. 端到端数据流示例

### 6.1 用户在手机生成新皮肤 → 桌面立即看到

```
[Mobile]
  PetCreator 提交文生 prompt
  POST /pet-generation/submit
[Backend]
  pet_generation_tasks insert (status=QUEUED)
  Meshy.submit() → providerRequestId
  status=PROCESSING
  @Interval(20s) pollPendingTasks
[Backend]
  Meshy 返回 .glb → auto-rig → .vrm
  pet_active_skin update activeSkinId
  Realtime broadcast PresenceTopics.pet.skin.changed
[Desktop]
  desktopSync 收到事件
  petAssets.fetchManifest() 拉新 .vrm
  petCreator.setActivePet()
  PetVRM 渲染新皮肤
  浮球轻闪 → "Claw 换了新衣服"
[Mobile]
  PetCompanionScreen 同步刷新
[Web]
  公开档案页若打开则 hot reload
```

### 6.2 玩具被拥抱 → 多端都看到 love 表情

```
[Toy]
  压力传感器触发（>2s, >50g）
  CLAW.send({ type: 'pet.interaction', kind: 'toy_hug', duration: 2.5 })
[ClawCore Bridge (Mobile)]
  转发到 backend
[Backend]
  LivingPetService.applyInteraction()
    - +5 xp
    - emotion = 'love'
    - 衰减 1h
  Realtime broadcast PresenceTopics.pet.state
[Desktop / Mobile / Web]
  浮球 / 全屏宠物切换 'love' 表情，飘心心
[Toy]
  收到 pet.state.sync(emotion=love)
  LED 切粉红 + 振动一次
```

### 6.3 L2 审批：桌面发起 → 手机生物认证

```
[Desktop]
  宠物准备发推文广告（L2 风险）
  PUT /v1/pet/approval/request
[Backend]
  approval_requests insert (status=PENDING, riskLevel=L2)
  推送通知到 Mobile
[Mobile]
  系统通知 → 点击进入 App
  ApprovalSheet 显示卡片 + Face ID prompt
  用户 Face ID 通过
  POST /v1/pet/approval/reply { approve: true, biometric: <token> }
[Backend]
  校验 biometric token → 通过
  广播 reply
[Desktop]
  收到 reply → 执行任务
  浮球 'busy' → 完成 → 'excited'
[Toy]
  LED 闪绿（任务执行中）
[Watch]
  Complication 显示 "+$0.02 earned"
```

---

## 7. 开发优先级

| 端 | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 | Phase 6 |
|------|:-:|:-:|:-:|:-:|:-:|:-:|
| Desktop | 灵魂切换 | Rive + 配额 | VRM 标准化 | 审批 + Auto-Earn | 摄像头扫描 | 多宠并存 |
| Mobile | 灵魂切换 | Rive + 配额 | Marketplace | 审批 + Bio | 摄像头扫描主入口 | AR 增强 |
| Web | 公开档案页 | 嵌入 SDK | Marketplace 主战场 | 协签 | — | PWA 离线 |
| Watch | — | — | — | Complication + 审批 | — | — |
| Glass | — | — | — | — | HUD + 空间锚 | 空间多宠 |
| Toy | — | — | — | — | ClawCore L1 / L2 / L3 | 联名扩展 |

---

## 8. Open Questions

1. Web 端的 PetCreator 是「完整版」还是「只能查看 / 提交」？倾向后者，桌面 / 移动是主路径。
2. Toy 端在多用户家庭里如何区分？同一玩具是否绑定多用户？倾向单用户绑定，家庭账号共享通过另一机制。
3. Glass HUD 宠物在用户开车 / 走路时是否自动隐藏？需要安全策略。
4. Watch 端能否独立用 4G / LTE 接后端而不通过手机？倾向不支持，Phase 6 再评估。

---

*本文档由 @dev 起草，@design / @hardware / @mobile / @desktop 共同评审。*
