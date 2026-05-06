# Agentrix Toy 端 PRD v4.0（NEW · 物理化身 · ClawCore 生态）

> **Toy = 同一只灵魂的物理化身**：把 Living Pet 从屏幕带进客厅、卧室、办公桌、车里、教室。Agentrix **不自研、不出货硬件**，只做协议（ClawCore SDK）+ 认证（L2 联名 / L3 认证），让全行业的玩偶 / 潮玩 / 智能音箱 / 学习机 / 车载终端都能成为 Agentrix 萌宠的"分身"。
>
> 本文件是 V4 全新文档，V3 没有对应文件（V3 仅在跨端文档里把 Watch / Glass 算作"可穿戴"，未独立处理"非穿戴硬件"）。所有跨端契约引用 `agentrix-cross-platform-prd-v4.md`。

- 版本: v4.0（首版，无 V3 对照）
- 状态: Draft
- 上游: `agentrix-cross-platform-prd-v4.md`（顿领）/ `PRD_DESKTOP_PET_AGENTRIX_CLAW.zh-CN.md`（ClawBuddy v2.0 思想源）
- 关键引用：`PRD_PET_CROSS_PLATFORM_CAPABILITY_MATRIX.zh-CN.md` / `PRD_PET_MONETIZATION_QUOTA_MODEL.zh-CN.md`

---

## 0. 一句话定位

**Agentrix Toy = 用 ClawCore SDK + 厂商联名 / 认证，让全世界的硬件成为 Agentrix 萌宠的物理身体**。一只灵魂可同时挂载到 Mobile + Desktop + Watch + Toy（毛绒 / 卡牌 / 音箱 / 车机）N 个 Surface。

---

## 1. 三层愿景在 Toy

| 层 | Toy 主阵地 | 说明 |
|----|----------|------|
| Living Pet（灵魂） | Toy 通过 LED / 震动 / TTS / 屏幕反映同一只灵魂的实时情绪 | 不分裂出新灵魂 |
| Pet（皮肤） | 皮肤切换时 Toy 灯效 + 屏幕缩略 + TTS 自报身份 | 皮肤数据不下载到 Toy（占用大），仅元数据 |
| Doer | Toy 不执行 Working Agent 任务 | – |
| Economy | Toy 显示余额 + 收益庆祝灯效，不持账户 | – |

---

## 2. 不做的事（V4 强约束 — 严格画地为牢）

- Agentrix **不出货** 任何 Agentrix 品牌硬件（参考实现仓除外）
- Toy **永远不持** MPC share / 钱包私钥
- Toy **永远不签名** 任何 L1+ 操作
- Toy **不独立**渲染高保真 3D（屏幕端最多 eink/OLED 表情图）
- Toy **不预装** AI 大模型（仅本地嵌入式情绪 → LED 映射表，对话仍走云端）

---

## 3. 5 种接入方式（V4 完整规格）

> 详细矩阵 → `PRD_PET_CROSS_PLATFORM_CAPABILITY_MATRIX.zh-CN.md`

### 3.1 NFC 标签（最轻 · L3 入门）

| 项 | 说明 |
|----|------|
| 硬件 | 普通 NFC NDEF 标签（NTAG215 等）/ 卡牌 / 贴纸 / 盲盒底贴 |
| 通信 | 单向：Mobile App 读取 NDEF URI |
| 协议帧 | URI 形式 `agentrix://nfc/<token>` |
| 触发能力 | `pet.interaction { kind: 'nfc_touch', token }` |
| 可解锁 | 限定皮肤 / 灵魂模板 / 道具 / 亲密度 +xp |
| 防刷 | token 后端唯一性校验，每 token 一次兑换；24h 重复 tap 仅触发情绪 |
| 成本 | 单标签 $0.05-0.20 |
| 适用 | 盲盒 / 卡牌 / 联名贴纸 / 周边 |

### 3.2 BLE Beacon（最低成本识别 · L3）

| 项 | 说明 |
|----|------|
| 硬件 | nRF52810 Beacon / 第三方 iBeacon |
| 通信 | 单向广播 |
| 协议帧 | iBeacon Major/Minor 编码 device_id |
| 触发能力 | 进 / 出范围 → `pet.proximity { in/out, device_id }` |
| 适用 | 钥匙扣 / 公仔底座 / 桌面摆件 |
| 成本 | $5-15 |

### 3.3 ClawCore 完整 SDK（L2 主推 · 双向 · 联名标准）

| 项 | 说明 |
|----|------|
| 硬件最低要求 | ESP32-S3 / nRF52840 / 同级（含 BLE 5 + Wi-Fi 可选 + Flash 4MB+） |
| 推荐外设 | LED RGB × N、振动马达、压力传感器（拥抱）/ 触摸传感器、扬声器 + I2S TTS、可选 eink/OLED 屏 |
| 通信 | 双向：BLE GATT（必需）+ Wi-Fi/MQTT（可选） |
| 协议帧 | JSON-line（详 §5） |
| 关键能力 | `pet.state.sync` / `pet.interaction` / `pet.approval.notify` / OTA |
| 离线缓存 | 最近 N 个表情码 + 默认 LED 模式（Wi-Fi 断时仍可呼吸灯） |
| 认证 | 必须通过 SDK 自检 + Agentrix 抽样测试 |
| 适用 | 联名毛绒 / 潮玩 / 智能桌摆 / 投影娃娃机 |

### 3.4 Wi-Fi 直连 + MQTT（L2 高带宽）

| 项 | 说明 |
|----|------|
| 硬件 | Wi-Fi 模组（ESP32-S3 / 高通智能音箱模组） |
| 通信 | TLS-MQTT 长连接 |
| 协议帧 | 同 ClawCore JSON 帧，承载于 MQTT topic |
| 适用 | 智能音箱 / 桌面常驻设备 / 车机 / 学习机 |
| 优势 | 长 TTS 流、宠物多轮对话、视频流（V5+） |

### 3.5 厂商 App SDK（深度合作 · L2 / L3 皆可）

| 项 | 说明 |
|----|------|
| 形式 | iOS / Android Library，由厂商集成到自家 App |
| 通信 | 厂商 App ↔ Agentrix Backend（HTTPS） |
| 触发 | 用户在厂商 App 内呼出 Agentrix 萌宠 |
| 渲染 | 厂商 App 内嵌 Web 渲染或调用 SDK 提供的 native View |
| 适用 | 学习机 / 早教机厂商 / 健身镜 / 教育平板 |

---

## 4. 2 层硬件生态

| 层 | 描述 | 谁制造 | 入场费 | 年费 | GMV 抽成 | 联名分成 |
|----|------|-------|-------|-----|---------|---------|
| **L1**（自有，仅 V3 沿用） | Watch / Glass | – | – | – | – | – |
| **L2 联名** | 合作方造，Agentrix 共同设计 + 共担 SKU 发布 | 合作方 | $5k-$10k | $1k | 15-25% | 50/50 |
| **L3 认证** | 合作方独立设计 + 制造，仅过 SDK 认证拿 Logo | 合作方 | – | $500-$5k/SKU | 5-10% | – |

> 详细商业条款 → `PRD_PET_MONETIZATION_QUOTA_MODEL.zh-CN.md`

### 4.1 L2 联名典型 SKU

| 类型 | 示例 | 价位 | 上线节点 |
|------|------|------|---------|
| 毛绒玩具 | 「萌宠 · 萌宠抱抱」联名 | $39-89 | V5 P5 W10 |
| 潮玩盲盒 | 「6 族群签名宠盲盒」 | $19-29/个 | V5 P5 W11 |
| 智能桌摆 | 「ClawBuddy Tabletop」 | $129 | V5 P5 W12 |

### 4.2 L3 认证典型场景

| 类型 | 厂商 | 接入方式 |
|------|------|---------|
| 智能音箱 | 第三方 | Wi-Fi/MQTT 调度 + 厂商 App SDK |
| 学习机 | 第三方 | 厂商 App SDK |
| 卡牌 / 贴纸 | 第三方 IP | NFC 标签兑换码 |
| 车载语音 | 车厂 | Wi-Fi/MQTT + 车机 OS App |

---

## 5. ClawCore Wire Protocol v0（核心规范）

### 5.1 传输

| 通道 | 必选 | 用途 |
|------|-----|------|
| BLE GATT (Nordic UART Service) | ✅ | 短连接、低带宽、高响应 |
| Wi-Fi TCP + MQTT/TLS | ⭐ | 长连接、TTS / 大流量 |

UUID（Nordic UART Service 标准）：

```
Service:       6E400001-B5A3-F393-E0A9-E50E24DCCA9E
TX (Notify):   6E400002-...   后端→Toy
RX (Write):    6E400003-...   Toy→后端
```

### 5.2 帧格式（JSON-line, UTF-8）

每行一个 JSON 对象：

```json
{ "v": 1, "ts": 1735000000000, "type": "<string>", "payload": {...}, "sig": "<hmac>" }
```

字段：

- `v`：协议版本（v0 = 1）
- `ts`：发送方时间戳（ms）
- `type`：帧类型（见 §5.3）
- `payload`：业务数据
- `sig`：HMAC-SHA256(secret, v||ts||type||payload)，secret 在配对时建立

### 5.3 核心帧类型

| type | 方向 | 必选 | 用途 | payload 字段 |
|------|------|-----|------|-------------|
| `hello` | Toy → 后端 | ✅ | 上线握手 | `{ device_id, fw_version, capability_flags[] }` |
| `auth` | 后端 → Toy | ✅ | 配对应答 | `{ device_jwt, server_pub }` |
| `pet.state.sync` | 后端 → Toy | ✅(L2) | 推送主宠状态 | `{ emotion, intimacy, skin_thumbnail_url? }` |
| `pet.interaction` | Toy → 后端 | ✅ | 上报交互 | `{ kind: 'hug'/'nfc_touch'/'wrist_tap'/...,  amount? }` |
| `pet.approval.notify` | 后端 → Toy | ✅(L2) | 显示审批红点 | `{ request_id, risk_level, ttl_s }` |
| `ota.check` | Toy → 后端 | ⭐ | 检查 OTA | `{ current_fw }` |
| `ota.chunk` | 后端 → Toy | ⭐ | OTA 分片 | `{ index, total, data_b64 }` |
| `vitals.report` | Toy → 后端 | ⭕ | 上报健康信号（如戒指） | `{ kind, value, unit, confidence }` |
| `tts.play` | 后端 → Toy | ⭕(L2) | 播 TTS | `{ audio_url 或 text + voice_id }` |
| `error` | 双向 | – | 协议错误 | `{ code, msg }` |

### 5.4 状态机

```
[powered] -hello-> [pairing] -auth-> [bound]
[bound] <-pet.state.sync-> [active]
[active] -pet.interaction-> [active]
[active] -ota.check-> [updating] -ota.chunk*-> [active]
任何状态 -错误超时-> [bound] (软重连)
```

### 5.5 离线缓存策略

L2 设备必须实现：

- 最近 8 个 `pet.state.sync` payload 缓存（断网时仍可循环展示）
- 默认 LED 模式：3 秒呼吸灯（蓝）
- Wi-Fi 重连时强制重发 `hello`，后端通过 `device_id` 恢复 session

---

## 6. 安全模型（V4 Toy 专属）

### 6.1 OOB 配对（防中间人）

详见 `agentrix-cross-platform-prd-v4.md` §8.2。Mobile 是唯一发起端。

### 6.2 设备 JWT

- 配对成功后颁发 device JWT，绑定 user_id + device_id
- TTL：默认 90 天，自动续期；用户撤销后立即失效

### 6.3 帧签名

- 所有帧带 HMAC，secret 在 OOB 配对时通过 BLE 短期密钥交换 + Mobile 中转固化
- 重放攻击：服务端记录 last_ts，<= last_ts - 30s 直接丢弃

### 6.4 固件签名

- OTA 固件必须 Agentrix Code Signing CA 签名
- Toy 启动时校验签名链；失败拒绝刷写

### 6.5 儿童安全（F 族群家庭账号挂载 Toy）

详见 `agentrix-cross-platform-prd-v4.md` §8.4。Toy TTS 在 COPPA 模式下禁用价格 / 链上信息。

---

## 7. 与跨端 7 大主路径的 Toy 适配

| 路径 | Toy 行为 |
|------|---------|
| Handoff | 不参与 Handoff 主路径，但作为 secondary surface 接收 broadcast |
| Approval | L1：触摸传感器 = tap 通过；L2+：仅显示 LED 红点 + TTS 提示 |
| Wallet | 收益庆祝灯效（彩虹 1 次） |
| Vitals | 戒指 / 手环 BLE 上报心率（沿用 §5.4 Vitals Bus） |
| Memory | 不参与 |
| **Pet Creation** | 不参与生成，新皮肤完成时 LED 庆祝 |
| **Skin Marketplace** | 不参与；皮肤切换由 Mobile/Desktop 推送 → Toy 屏幕换缩略图 |

---

## 8. 参考实现（Agentrix 仓库 · 不出货）

| 平台 | 仓库 | 维护 | 节点 |
|------|------|------|------|
| ESP32-S3（Rust + Embassy） | `agentrix/clawcore-esp32-ref` | Agentrix + 社区 | V5 W9 |
| nRF52（Zephyr） | `agentrix/clawcore-nrf-ref` | 社区 | V5 W11 |
| Android Bridge | `agentrix/clawcore-android-bridge` | Agentrix | V5 W10 |
| iOS Bridge | `agentrix/clawcore-ios-bridge` | Agentrix | V5 W10 |
| 协议测试套件 | `agentrix/clawcore-test-suite` | Agentrix | V5 W11 |

参考实现仅用于 SDK 自检 + 第三方接入参考，**不在 Agentrix 渠道发售**。

---

## 9. 开发者门户 `developer.agentrix.top`

V5 W9 上线（托管在 Web 项目下）：

- SDK 下载 + 协议文档
- 认证流程：
  1. 申请 L2/L3
  2. 提交样品 + SKU 资料
  3. SDK 自检报告
  4. Agentrix 抽样测试
  5. 颁发认证 + Logo + 渠道
- 厂商收入仪表盘（GMV / 抽成 / Remix 分成）
- 工单系统

---

## 10. 路线图（V4 / V5 Toy）

| 阶段 | 周期 | 交付 |
|------|------|------|
| V4 P3 | W5-W6 | NFC 标签接入（Mobile 端 §3.1）+ token 兑换后端 |
| V4 P4 | W7-W8 | BLE Beacon 接入 + `pet.proximity` |
| V5 P5 | W9-W10 | ClawCore SDK v1（BLE 完整集）+ 配对中心（Mobile）+ 开发者门户 |
| V5 P5 | W11 | Wi-Fi/MQTT 通道 + TTS 帧 + nRF52 参考实现 |
| V5 P5 | W12 | L2 联名首发 1-2 款（毛绒 / 潮玩） + L3 认证首批 3-5 家接入 |
| V5 P6 | W13-W14 | 厂商 App SDK（iOS/Android）+ 学习机 / 健身镜接入 |
| V5 P6 | W15-W16 | 车机 / 智能音箱 / 投影娃娃机 |

---

## 11. 成功指标（V5 末）

| 指标 | 目标 |
|------|------|
| 已认证 L2 厂商 | 3+ |
| 已认证 L3 厂商 | 10+ |
| 累计 SKU 在售 | 30+ |
| 月活 Toy 设备 | 10k+ |
| Toy 端日均交互（NFC/Hug/Touch） | 50k+ |
| 硬件 GMV 月度 | $50k+ |

---

## 12. 与其它 V4 PRD 的引用

| V4 主题 | 引用位置 |
|--------|---------|
| 顿领契约 / Toy 在 6 端中的位置 | `agentrix-cross-platform-prd-v4.md` §2 / §3 |
| Mobile 是唯一配对发起端 | `mobile-prd-v4.md` §6 |
| Desktop ClawCore Inspector 调试 | `desktop-prd-v4.md` §7 |
| Web 开发者门户 | `web-prd-v4.md` §8 |
| Glass Toy 视觉识别 | `wearable-prd-v4.md` §3.2 |
| 思想源（28 签名宠 + ClawBuddy） | `PRD_DESKTOP_PET_AGENTRIX_CLAW.zh-CN.md` |
| 5 接入方式矩阵 | `PRD_PET_CROSS_PLATFORM_CAPABILITY_MATRIX.zh-CN.md` |
| GMV / 抽成 | `PRD_PET_MONETIZATION_QUOTA_MODEL.zh-CN.md` |
