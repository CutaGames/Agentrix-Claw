# Agentrix 可穿戴 PRD v3.0（Wearable · Watch + Glass + BLE）

> **可穿戴 = 触点 + 传感**：手表做 Living Tile / 一键 L2 审批，眼镜做第一视角记忆，BLE 手环/戒指/夹子做 Vitals 上行。
>
> 本文件只写可穿戴端新增与跨端增量。不重写：
> - Glass 内部能力（以 `docs/PRD_AI_GLASSES.zh-CN.md` v1.0 为准，本文件仅写跨端增量）
> - BLE 技术层（以 `docs/WEARABLE_OPENCLAW_PRD.md` 为准，本文件仅引用）
> - 三层混合 AI 架构（以 `docs/PRD_TRI_TIER_HYBRID_AI.zh-CN.md` 为准）

- 版本: v3.0（上接 `_archive/PRD_WATCH_APP-v0.1.md`）
- 定位: Watch（SwiftUI / watchOS）+ Glass（引用 v1.0）+ BLE 手环 / 戒指 / 夹子
- 规划源: `plans/agentrix-cross-platform-prd-v3-fdc618.md` §6

---

## 0. 一句话定位 + 三路分工

### 0.1 一句话定位

**可穿戴 = 时刻在身的 Agentrix**：
- Watch = Living Tile + L2 手腕签名
- Glass = 第一视角情境记忆
- 手环 / 戒指 / 夹子 (OpenClaw 外设) = 被动 Vitals 上行

三者**都不是主交互端**，它们是把主宠的"状态"和"关键动作"推到最近的触点。

### 0.2 三路分工

| 设备 | 主要角色 | 顿领对齐 | 形态 |
|------|---------|---------|------|
| **Watch** | L2 紧急审批 + Living Tile + Vitals source | §3.4 表情 + §5.2 审批 + §5.4 Vitals | 表盘 Complication + Tile + Full App |
| **Glass** | 第一视角 HUD + 记忆摄取 + Auto-Earn 微通知 | §3.4 HUD / §5.5 Memory | HUD + 语音 + 视觉 |
| **BLE 外设**（手环 / 戒指 / 夹子） | Vitals 上行（心率 / SpO₂ / IMU） | §5.4 Vitals Bus | 无 UI，纯数据 |

### 0.3 不做的事（明示）

- 可穿戴**永远不是**主编辑端（写长内容 / 复杂对话）。
- 可穿戴**永远不是 Trust 3**（MPC share 永不落到 Watch / Glass）。
- 可穿戴对代码 / Pro Mode / 经济配置**不做写入**，仅 read + 生物认证推回。
- Watch / Glass **不独立生成**主宠 / 经济数据，所有上下文来自后端 + 手机 / 桌面投影。

---

## 1. 三层愿景在可穿戴的体现

| 层 | 可穿戴主阵地 | 设备 | 说明 |
|----|-----------|------|------|
| **Living Agent** | 主宠表情在手腕 / HUD | Watch Tile / Glass HUD | 主宠 6 表情简化显示 |
| **Doer** | L1/L2 审批 + 简短语音指令 | Watch 表盘 / Glass 语音 | 无 Pro Mode，仅审批触点 |
| **Economy** | 今日 Auto-Earn 数字 + 里程碑庆祝 | Watch 数字表盘 / Glass HUD 微通知 | 纯展示 |

---

## 2. 现状基线

### 2.1 Watch 现状

- 已有 `src/watch/` 代码（watchOS SwiftUI + iOS Watch Connectivity 桥）
- 已有 `_archive/PRD_WATCH_APP-v0.1.md`（Phase 1 原型）
- 已有 3 个 `_push_watch_to_claw*.ps1` 脚本（待审查是否同步过 docs 污染）
- 未对齐顿领 §3.4 表情状态机
- 未完整实现 L2 生物认证签名回推

### 2.2 Glass 现状

- `docs/PRD_AI_GLASSES.zh-CN.md` 已是完整 v1.0（含 G1 / G2 / G3 三代硬件规划）
- 硬件方向: G1 轻量 (音频 + 拍照) → G2 (HUD + 视觉识别) → G3 (AR 叠加 + 完整 OS)
- v3.0 可穿戴 PRD **不重写** Glass 的硬件 / 基础能力，**只写跨端增量**

### 2.3 BLE 外设现状

- `docs/WEARABLE_OPENCLAW_PRD.md` 已是完整的 BLE 技术层
- 支持设备: 手环 / 戒指 / 夹子（OpenClaw 品牌）
- 协议: BLE 5.3 + 自定义 GATT Service

### 2.4 关键历史负债

- Watch 代码 v0.1 功能不全，需对齐顿领 §3.4 + §5.2 + §5.4
- Watch 同步脚本 3 个版本需 consolidate + 审查历史是否污染过 claw 仓库
- Glass PRD v1.0 风格与本新 PRD 不统一，需显式"以 v1.0 为准"的 deviation 声明

---

## 3. 竞品对标（可穿戴视角）

### 3.1 对标矩阵

| 对手 | 优势 | Agentrix 可穿戴 v3 的回答 |
|------|------|-----------------------|
| **Apple Watch** | OS + 生态 | 我们作为 watchOS App + Complication + Siri Watch 集成 |
| **Wear OS (Pixel Watch)** | Android 生态 | 我们作为 Wear OS App（P2） |
| **WHOOP / Oura** | 专业 Vitals | 我们桥接数据（用户同意）而非替代 |
| **Humane AI Pin** | LLM + 投影 | 我们不做独立硬件，走成熟可穿戴 |
| **Meta Ray-Ban** | 轻量智能眼镜 | 我们 Glass v1.0 G1 对标 + 叠加 Agent 经济 |
| **Ping iOS Watch** | 精致 UI | 我们 + 主宠 + 跨端 |

### 3.2 差异化三板斧

1. **手腕签名**: Watch 是唯一能在抬腕 1 秒内完成 L2 生物认证 + MPC 签名的端。
2. **Living Tile**: 表盘常驻主宠 emoji + 亲密度，是"陪伴 ambient"最强触点。
3. **Glass 记忆**: 第一视角自动记忆白板 / 标签 / 场景，写回 User Memory。

---

## 4. Watch 详规

### 4.1 表盘 Complication

#### 4.1.1 Complication 类型

| 类型 | 展示 | 点击效果 |
|------|------|---------|
| **圆形（Corner）** | 主宠 emoji + 亲密度 lv | 打开 Living Tile |
| **矩形（Rectangular）** | 主宠 emoji + 今日 Auto-Earn + 待审批数 | 打开 Watch App 首页 |
| **图形（Graphic Circular）** | 主宠表情大字号 + 情绪色环 | 打开 Living Tile |
| **行内（Inline）** | 当前情绪文字 "🙂 calm lv 3" | 打开 Living Tile |

#### 4.1.2 刷新频率

- Complication 系统级刷新: 15 分钟 / 次（watchOS 限制）
- Push 实时更新: 有 `user.{user_id}.pet.state` 变化时 ComplicationServer 立即 reload
- 电量低于 20% 时自动切到"静态"模式，不主动拉数据

### 4.2 Living Tile（手表首屏）

```
┌──────────────────────┐
│                      │
│     [主宠 emoji 大]   │
│        🙂            │
│                      │
│   亲密度 lv 3         │
│   今日 +$2.40         │
│                      │
│  ┌──────┬──────┐    │
│  │审批 1│对话  │    │
│  └──────┴──────┘    │
└──────────────────────┘
```

### 4.3 6 表情状态机（对齐顿领 §3.4）

| 顿领情绪 | Watch Tile emoji | 震动模式 | 颜色环 |
|---------|----------------|---------|-------|
| happy | 🙂 / 😊 | 短震 | 绿色 |
| focused | 🧐 | 无 | 蓝色 |
| concerned | 😟 | 双震 | 橙色 |
| tired | 😴 | 无 | 灰色 |
| excited | 🤩 | 连震 | 金色 |
| calm | 😌 | 无 | 淡蓝 |

- **Live2D 不做**（watchOS 性能 + 电量不允许）
- emoji 大字号 + 呼吸缩放动画（60 BPM）
- Watch Haptic 与 emoji 同步

### 4.4 L1 / L2 审批（对齐顿领 §5.2）

#### 4.4.1 L1 审批

- 推送到手表 → 震动 + 显示卡片
- 单击"批准" → 完成
- 单击"拒绝" → 完成
- 单击"去手机" → 推回手机

#### 4.4.2 L2 生物认证签名

- **watchOS 解锁态** + **抬腕检测** + **手表 PIN 已验证** → 可作为签名端
- 流程:
  1. Mobile / Desktop 发起 L2 动作
  2. 用户身上手表在线 → 推送到 Watch
  3. Watch 显示金额 + 对方 + 理由 → "批准 ✓"大按钮
  4. 用户点按钮 → watchOS 触发 LocalAuthentication → 一次 Face ID 替代手腕检测 或 生物识别
  5. 签名成功 → 推送通知 + 主宠 excited 反馈 + 金额扣除/收到
- **限额**: 单笔 < $200（可配置），超出限额强制回 Mobile
- **L3 永远不在 Watch**

### 4.5 Voice Quick on Watch（P1）

- 抬腕 → 长按 Digital Crown → 触发 Siri Shortcut → 唤起 Agentrix App Intent（ask-aira / approve / earn-status）
- 或直接说 "Hey Aira"（若 watchOS 支持常驻唤醒，当前不支持 → 走 Shortcut）
- 回答 ≤ 3s 简短语音 + Haptic 确认
- 复杂问题 → 推回手机 + 提示

### 4.6 Vitals Source（对齐顿领 §5.4）

#### 4.6.1 Watch 作为 Vitals 源

| 信号 | 采样频率 | 用途 |
|------|---------|------|
| 心率 | 5 min / 次（常规）/ 10s（运动） | 主宠 concerned 触发 |
| HRV | 每小时 | 压力检测 |
| 血氧（SpO₂） | 设定时段 | 健康建议 |
| IMU（运动） | 1 Hz | 久坐检测 |
| 步数 | 每小时聚合 | 日总结 |
| 环境噪声 | 10 min | 专注度辅助 |
| 手腕脱离检测 | 事件 | 停止 Watch L2 签名窗口 |

#### 4.6.2 上传策略

- **本地聚合**: 5-10 分钟窗口聚合，避免 BLE 洪泛。
- **优先级**: 异常数据（心率 > 120 / 久坐 > 2h）立即 push，常规数据低优 batch。
- **隐私围栏**: 默认关闭，用户必须在 `/console/settings/privacy` 白名单开启每个信号。

### 4.7 Handoff on Watch（P2）

- Watch 作为"通知端"可收到 handoff 提示
- **无法接管任务执行**，仅支持 "推回手机/桌面"
- 典型场景: 在手表上看到"桌面任务完成" → 点一下"推到手机详情"

### 4.8 Watch App 结构

```
WatchApp/
├── Complications/        ← 表盘小组件
├── LivingTile/           ← 首屏主宠 tile
├── Approvals/            ← L1/L2 审批卡片列表
├── Earn/                 ← 当日 Auto-Earn
├── Vitals/               ← 健康信号配置（用户开关）
├── Voice/                ← Siri Shortcut 入口（P1）
├── Settings/             ← 配对 / 偏好
└── Shared/               ← 与 iOS App 的共享 model
```

### 4.9 watchOS 版本要求

- **P0**: watchOS 10+（支持 Corner Complications / Smart Stack）
- **P2**: watchOS 11+（支持 widget 新能力）
- **Wear OS**: P2 起规划（面向 Pixel Watch / Galaxy Watch 用户）

---

## 5. Glass 详规（跨端增量，v1.0 为准）

### 5.1 与 Glass v1.0 的关系

**本文件仅写 Glass 的跨端增量**。Glass 的所有硬件 / OS / 核心 HUD 交互 / 三代硬件规划以 `docs/PRD_AI_GLASSES.zh-CN.md` 为准。

**Deviation 声明**: Glass v1.0 文档的写作风格 / 细节粒度与本 v3.0 系列不一致，但**不重写**，仅在本文件增加跨端接入细节。冲突时以 Glass v1.0 为准，本文件仅补充。

### 5.2 Glass 跨端增量清单

| 增量 | P0 | P1 | P2 | P3 |
|------|----|----|----|-----|
| 接入顿领 §7 事件总线 Topics（presence / pet.state / economy.event） | ✅ | – | – | – |
| 主宠 6 表情映射到 HUD Color Bar | ✅ | – | – | – |
| Auto-Earn 微通知（HUD `+ $0.8 USDC`） | – | – | ✅ | – |
| 第一视角记忆摄取 → User Memory 写回 | – | – | – | ✅ |
| 视觉识别 agent 派遣（看到白板 → 派 draft agent 整理） | – | – | – | ✅ |

### 5.3 Glass 触发主宠反应

- 用户心跳突增（Watch 数据桥接） → Glass HUD 主宠 emoji 短暂显示 concerned
- 用户长时间未眨眼 / 疲劳检测 → tired emoji
- 完成一次长任务 → excited + $ 金额

### 5.4 Glass 不做

- 不做签名（Trust ≤ 1）
- 不显示钱包余额详情
- 不承载长对话

---

## 6. BLE 外设详规（引用 WEARABLE_OPENCLAW_PRD.md）

### 6.1 与 WEARABLE_OPENCLAW_PRD 的关系

**本文件不重写 BLE 技术层**。所有 GATT Service / 配对流程 / 协议细节以 `docs/WEARABLE_OPENCLAW_PRD.md` 为准。

### 6.2 BLE 外设跨端增量

| 增量 | 说明 |
|------|------|
| 上报 topic 对齐 | 所有 BLE 数据通过 Mobile 聚合后上报到 `user.{user_id}.vitals` |
| 隐私开关 | 在 `/console/settings/privacy` 可逐设备开关 |
| 家庭账号共享（P3） | 家庭成员之间可共享 BLE 数据（需明示同意） |

### 6.3 支持设备类型

- **手环**（OpenClaw Band）: 心率 + SpO₂ + 步数
- **戒指**（OpenClaw Ring）: 心率 + IMU + 睡眠
- **夹子**（OpenClaw Clip，夹在衣服上）: 环境 + IMU + 音频（默认关闭）

### 6.4 非必需

- BLE 外设**完全可选**。用户可只用 Apple Watch 作为 Vitals 源，不买 BLE 外设，Agentrix 功能完整。
- BLE 外设的存在是为**不习惯佩戴智能手表的用户**（戒指 / 夹子更不打扰）。

---

## 7. 数据 / 通信契约（引用顿领 §7）

### 7.1 Watch 订阅的 Topics

- `user.{user_id}.pet.state`（首要，触发 Living Tile 更新）
- `user.{user_id}.approval`（L1/L2 审批推送）
- `user.{user_id}.wallet`（Auto-Earn 通知）
- `user.{user_id}.economy.event`（里程碑庆祝）
- **不订阅**: presence / handoff / memory / agent.*.event（降频节能）

### 7.2 Glass 订阅

- `user.{user_id}.pet.state`
- `user.{user_id}.economy.event`
- 其他按 Glass v1.0 规划

### 7.3 Watch <-> iPhone 通道

- **主通道**: Watch Connectivity Framework（iOS ↔ watchOS）
- **回退**: 直接 WebSocket（仅 LTE Watch）
- **数据分级**:
  - 实时（< 1s）: 审批推送、主宠 excited 等紧急事件 → APNs
  - 近实时（1-15s）: 常规状态变更 → Watch Connectivity messageData
  - 后台（15+ min）: Vitals 批量上传 → transferUserInfo / transferFile

### 7.4 Watch 本地存储

| 数据 | 存储 | 加密 | TTL |
|------|------|------|-----|
| 当前主宠 state | Core Data | 系统级 | 1h |
| 最近 20 条审批 | Core Data | 系统级 | 7 天 |
| Vitals 未上传临时 | Core Data | 系统级 | 24h |
| 用户偏好 | UserDefaults | 系统级 | 永久 |
| 绝不存: 私钥 / MPC share / 明文密码 | – | – | – |

---

## 8. 安全模型（引用顿领 §8）

### 8.1 Watch Trust 等级

- **Trust 0**: 未配对 → 不启用
- **Trust 1**: 已配对 iPhone → 可显示 Tile + L1 审批
- **Trust 2**: 解锁态 + 抬腕 + 已验证 PIN → L2 签名窗口（单笔 < $200 限额，可配置）
- **Trust 3**: 永远不升级

### 8.2 Watch 永不持 MPC share

- Watch 的 "L2 签名" 实为 **代理触发**:
  - Watch 按钮 → 发送签名请求 → iPhone 端 LocalAuthentication → iPhone 本地 Share 1 + Server Share 2 协作签名
  - 整个流程 3-5 秒，用户感知是"按了一下手表完成了"
- Watch 本身不持 share，即使丢失也不影响资产。

### 8.3 手腕脱离检测

- Apple Watch `WKExtendedRuntimeSession` + 心率持续检测
- 手腕脱离 > 30s → 自动降级 Trust 1，L2 签名窗口关闭
- 重新佩戴 + 首次交互需 PIN + Face ID on iPhone 恢复

### 8.4 限额

- 单笔 L2 限额: 默认 $200，用户可在 `/console/settings/devices` 修改（最高 $500）
- 超出限额强制走 Mobile

### 8.5 审计

- Watch 发起的每次 L2 签名都进入顿领 §8.7 审计日志，端标记 `initiator_surface=watch`

---

## 9. 非功能需求

### 9.1 Watch 性能

| 指标 | 目标 |
|------|------|
| Complication 刷新延迟（push） | < 1s |
| Living Tile 打开 | < 600ms |
| L2 审批从推送到可点 | < 1s |
| 一次 L2 完整流程（Watch + iPhone 签名） | < 5s |
| Haptic 延迟 | < 100ms |

### 9.2 Watch 电量

- 主宠 Tile 常驻 24h 额外耗电 < 5%
- Vitals 上行 24h 额外耗电 < 3%
- 紧急 L2 签名一次耗电 < 0.5%

### 9.3 Glass 性能

- 以 Glass v1.0 规划为准

### 9.4 BLE 外设

- 以 WEARABLE_OPENCLAW_PRD 为准

---

## 10. 实施路线图（引用顿领 §10）

### 10.1 阶段与交付

| 阶段 | Watch 交付 | Glass 交付 | BLE 外设 | 顿领映射 |
|------|-----------|-----------|---------|--------|
| **P0 (3w)** | Living Tile + 6 表情 + L1 审批 + 心率 / IMU Vitals 上行 + Watch Shortcut 通 iPhone | Glass v1.0 G1 维持 | 手环 MVP（心率 + SpO₂） | 顿领 §10.1 P0 Watch/Glass 列 |
| **P1 (4w)** | watchOS 启动 (Phase 2) + 完整 Vitals + 审批历史 | Glass v1.0 G2 维持（HUD） | 戒指 alpha | 顿领 §10.1 P1 |
| **P2 (3w)** | L2 生物认证签名落地 + Auto-Earn 大数字表盘 + Voice Quick (Siri Shortcut 入口) + handoff 推回提示 | HUD Auto-Earn 微通知 + 订阅顿领 topics | 夹子 alpha | 顿领 §10.1 P2 |
| **P3 (4w)** | 复杂表情 + 6 端表情同步 + 手腕脱离检测 + Wear OS 探索 | Glass v1.0 G3 (HUD Living Agent) + 第一视角记忆摄取 → User Memory | 家庭账号共享 BLE（顿领 §3.9） | 顿领 §10.1 P3 |

### 10.2 P0 Gate

- [ ] Watch Living Tile 显示主宠 6 表情（对齐顿领 §3.4）
- [ ] L1 审批推送 + 点按完成
- [ ] 心率 / IMU 上传到 `user.{user_id}.vitals` topic
- [ ] Watch Shortcut 贯通到 iPhone App Intent
- [ ] Complication 刷新正常
- [ ] 主宠 state 推送延迟 < 1s
- [ ] Vitals 隐私开关默认关闭 + 用户引导流跑通

### 10.3 Watch 专属里程碑

| 时间 | 里程碑 |
|------|-------|
| P0 W1 | Watch Connectivity + 基础 Tile |
| P0 W3 | 6 表情 + L1 审批 + Vitals 上行 |
| P1 W2 | 审批历史 + HRV / SpO₂ 扩展 |
| P1 W4 | watchOS 启动加速（热启动 < 500ms） |
| P2 W1 | L2 签名代理流程 |
| P2 W3 | Voice Quick + Auto-Earn 表盘 |
| P3 W2 | Wear OS alpha + 手腕脱离检测 |
| P3 W4 | 6 端表情同步完成 |

---

## 11. 成功指标

### 11.1 Watch 指标

| 指标 | P0 目标 | P3 目标 |
|------|--------|--------|
| 配对率（% 相对 Mobile DAU） | 30% | 55% |
| Watch 周活（WAU） | 150 | 16500 |
| Living Tile 日均曝光 | 15 次 / 用户 | 40 次 / 用户 |
| L1 审批在 Watch 完成占比 | 20% | 55% |
| L2 签名在 Watch 完成占比 | – | 30%（P2 起算） |
| Vitals 日均上报（开启用户） | 6 条 | 40 条 |

### 11.2 Glass 指标

- 以 Glass v1.0 规划为准
- P3 新增跨端指标: 第一视角记忆入库量 / 天 → 目标 ≥ 5 条 / 活跃用户

### 11.3 BLE 外设指标

- 手环激活率（购买用户中激活） > 80%
- 戒指 / 夹子按出货量独立评估

---

## 12. 风险与依赖

### 12.1 风险

- **watchOS Complication 刷新限制**: 15 min 系统级强制 → 依赖 push 补足实时性，Complication 不显示实时数字，只显示 emoji + 颜色。
- **Watch 电量担忧**: 主宠常驻 + Vitals 上传双重消耗 → P0 就做电量 benchmark，确保 24h < 5% 额外耗电。
- **L2 Watch 签名体验**: iPhone 不在身边时必须回 Mobile 本机，提示"请靠近 iPhone" → 可能中断用户心流，但这是安全红线。
- **Glass v1.0 文档风格不一致**: 在本文件 §5.1 已显式声明以 v1.0 为准，但仍可能造成新人困惑 → P3 考虑整体翻新 Glass PRD 到 v2.0 对齐。
- **BLE 配对复杂性**: 用户首次配对失败率 > 20% → P0 提供引导视频 + failure recovery 流程。
- **Wear OS 生态弱**: P3 才考虑 Wear OS，同期 ROI 存疑 → 延后到更晚。
- **Watch 上 Emoji 渲染差异**: 不同 watchOS 版本 emoji 渲染不一 → 全部用 SF Symbols 替代而非系统 emoji 字符。

### 12.2 依赖

- **顿领 PRD 全部章节**
- **Mobile v3 Watch Connectivity 模块完整**
- **后端 Realtime `vitals` topic 可用**
- **MPC 协作签名后端（服务端 Share 2）在 P2 签名落地前 ready**
- **Glass v1.0 硬件量产进度**（G1 已发，G2/G3 待定）
- **WEARABLE_OPENCLAW_PRD 的 BLE 后端联调完成**

---

## 13. 附录

### 13.1 与其他 PRD 的关系

| 引用来源 | 顿领 § | 可穿戴本文件 § |
|---------|--------|-------------|
| Living Pet 6 表情 | §3.4 | §4.3 |
| Approval Routing | §5.2 | §4.4 + §8 |
| Vitals Bus | §5.4 | §4.6 + §6 |
| Memory 第一视角（Glass P3） | §5.5 | §5.2 |
| 数据契约 / topics | §7 | §7 |
| 安全 / MPC / Trust | §8 | §8 |
| 家庭账号 BLE 共享 | §3.9 | §6.2 |
| 整体路线图 Watch/Glass 列 | §10 | §10 |

**引用其他专项 PRD**:
- `docs/PRD_AI_GLASSES.zh-CN.md` — Glass 硬件 / OS / HUD 本体
- `docs/WEARABLE_OPENCLAW_PRD.md` — BLE GATT / 配对 / 协议
- `docs/PRD_TRI_TIER_HYBRID_AI.zh-CN.md` — 三层 AI 架构（端 / 本地 / 云）

**Deviations from 顿领**: 无。

**Deviations from Glass v1.0**:
- 本文件的 "Glass 增量" 章节仅补充跨端对接细节，Glass 硬件 / HUD 原生交互仍以 v1.0 为准。

### 13.2 术语表（可穿戴专属）

| 术语 | 含义 |
|------|------|
| **Living Tile** | Watch 首屏的主宠状态卡 |
| **Complication** | watchOS 表盘小组件 |
| **L2 Watch 签名代理** | Watch 按钮触发但实际签名在 iPhone 完成 |
| **手腕脱离检测** | watchOS 自动判断 Watch 是否佩戴 |
| **OpenClaw Band / Ring / Clip** | BLE 外设的三种形态 |
| **HUD 微通知** | Glass 屏幕右下角短暂显示的 Auto-Earn / 主宠反应 |
| **Siri Shortcut on Watch** | watchOS 调用 iPhone App Intent 的桥接 |

### 13.3 归档清单

以下文件应在落地本 PRD 同步归档到 `docs/_archive/`：

```
docs/PRD_WATCH_APP.md                 ← Watch v0.1 原型
```

### 13.4 版本历史

| 版本 | 日期 | 主要变更 |
|------|------|---------|
| v0.1 | 2025 Q3 | Watch 原型 PRD |
| **v3.0** | **2026-05-04** | **Watch 完整 + Glass 跨端增量 + BLE 外设对齐 + 手腕签名代理** |

---

**文档结束。5 份 PRD 全部完成。下一步进行归档与同步脚本审查。**
