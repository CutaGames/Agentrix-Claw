# Agentrix 可穿戴 PRD v4.0（Wearable · Watch + Glass + BLE 外设）

> **可穿戴 = 触点 + 传感**：V3 三路分工（Watch / Glass / BLE 外设）保留。V4 把 Vitals 信号正式接入「灵魂 × 皮肤」情绪状态机，Watch 复杂功能（Complication）显示当前皮肤缩略，Glass HUD 触发与 Toy 联动。
>
> 本文件只写可穿戴端 V4 增量。所有跨端契约引用 `agentrix-cross-platform-prd-v4.md`。V3 的 Watch/Glass/BLE 基线沿用 `wearable-prd-v3.md`。Glass 内部能力以 `PRD_AI_GLASSES.zh-CN.md` v1.0 为准；BLE 技术层以 `WEARABLE_OPENCLAW_PRD.md` 为准。

- 版本: v4.0（与 V3 共存）
- 状态: Draft
- 上游: `agentrix-cross-platform-prd-v4.md` / `wearable-prd-v3.md`

---

## 0. V4 vs V3 可穿戴对照速读

| 维度 | V3 | V4 |
|------|-----|-----|
| 三路分工 | Watch / Glass / BLE 外设 | 不变 |
| 主宠表达 | 6 表情 emoji + 震动 | + **当前皮肤缩略图**（Watch Complication）|
| Vitals → 主宠 | Vitals Bus → Living Agent 反应 | **明确映射规则表** + 皮肤可触发"换装情绪" |
| L2 签名 | 手腕生物认证签名 | 不变 |
| Toy 联动 | 不存在 | Glass 视觉识别桌面 Toy → 高亮 + 声音 |
| Auto-Earn 通知 | Watch / Glass HUD | + Skin GMV 收入庆祝 |
| 渲染器 | emoji / HUD 字符 | 不变（端硬件不支持 Rive/VRM） |

---

## 1. 三路分工（V4 不变）

| 设备 | V4 角色 | 顿领对齐 |
|------|--------|---------|
| Watch | L2 紧急审批 + Living Tile + Vitals 主源 + **皮肤 Complication** | 顿领 §3 灵魂×皮肤 / §5.2 审批 / §5.4 Vitals |
| Glass | 第一视角 HUD + 记忆摄取 + Auto-Earn 微通知 + **Toy 视觉识别** | 顿领 §3.4 / §5.5 |
| BLE 外设（手环 / 戒指 / 夹子） | Vitals 上行 | 顿领 §5.4 |

---

## 2. Watch 端 V4 增量

### 2.1 Living Tile 升级（皮肤可视化）

V3 的 Tile 显示主宠 emoji，V4 增加：

```
┌──────────────────────┐
│ [skin thumbnail 60×60]│
│                      │
│ 萌宠 · happy ❤ 67   │
│                      │
│ 今日 +$0.42 💰        │
└──────────────────────┘
```

- 皮肤缩略图：100×100 静态 PNG（在跨端服务器侧预生成）
- 切换皮肤后 Tile 在 5s 内更新
- 灵魂模板切换会同步换 Tile 配色

### 2.2 Watch Complication（V4 新增）

| Complication 家族 | 内容 |
|-----------------|------|
| Circular Small | 主宠 emoji + 亲密度 |
| Modular Small | 同上 + 今日 Earn |
| Modular Large | + 当前 Skin 名称 |
| Graphic Circular | Skin 缩略 + 进度环（情绪到下一级亲密度） |

### 2.3 Vitals → 主宠情绪映射（V4 明确表）

| Vital 信号 | 阈值 | 主宠反应 | 跨端广播 |
|-----------|------|---------|---------|
| HR > 100 bpm + 无运动 5 min | 持续触发 | `concerned` + 主动问候 | `pet.state.changed` |
| 久坐 > 2h | 触发一次/2h | `tired` + Watch 震动提醒 | `pet.state.changed` |
| 睡眠 < 6h（昨晚） | 早上首次 unlock | 第二天主宠声调更关心 | `pet.state.changed` |
| HRV 低于个人基线 | 持续触发 | `calm` + 推荐冥想皮肤 | + `pet.skin.suggested` |
| 运动 > 30 min | 触发一次 | `excited` + 解锁运动皮肤碎片 | + `economy.event` |

### 2.4 L2 审批（V4 不变）

- 抬腕 → Face ID/Touch ID/PIN → MPC 签名 → 5s 内完成

### 2.5 Auto-Earn 通知（V4 增量）

V3 显示「+$0.42」；V4 增加 Skin GMV：

```
"+$2.10 — 你的'蓝色独角兽'皮肤被买走了"
```

---

## 3. Glass 端 V4 增量

### 3.1 HUD 显示

V4 追加：

- 当前主宠表情 + 灵魂族群 emoji（如 A 办公 = 💼 / B 生活 = 🌱）
- Auto-Earn 微通知（V3）+ Skin GMV 通知（V4）

### 3.2 Toy 视觉识别（V4 新增）

```
1. Glass 摄像头持续被动识别（用户授权后）
2. 识别到桌面 / 卧室 Toy（通过 Agentrix 视觉特征 + NFC 信号联合）
3. HUD 高亮 Toy + 显示「这是你的 [设备名]」
4. 同时触发 Toy LED 庆祝灯效（用户走近时点亮）
5. 触发跨端 broadcast `toy.proximity.detected`
```

### 3.3 摄像头识别用户表情（V3 沿用）

不变。识别到笑 → 主宠 happy + 轻量互动。

### 3.4 第一视角宠物记忆（V3 沿用）

不变。识别到白板 → 同步为笔记 → 桌面 Pro Mode 自动建项目。

---

## 4. BLE 外设（V4 不变）

完全沿用 V3 + `WEARABLE_OPENCLAW_PRD.md`。仅增加：

- 戒指 / 手环可作为 NFC 等价触点（碰触 Toy 触发 `pet.interaction { kind: 'wearable_touch' }`）

---

## 5. 与跨端 7 大主路径的可穿戴适配

| 路径 | Watch | Glass | BLE |
|------|-------|-------|-----|
| Handoff | 表冠 + 长按确认 | HUD 闪 + 语音 | – |
| Approval（L1） | tap 通过 | 语音确认 | – |
| Approval（L2） | **生物认证 + MPC** | 不可（推回 Mobile） | – |
| Wallet | 当日数字 | HUD 微通知 | – |
| Vitals | 主源 | 表情 / 语气 | 主源 |
| Memory | 不参与 | 视觉摄取 → User Memory | – |
| Pet Creation | 不发起；通知装备成功 | 不发起；HUD 通知 | – |
| Skin Marketplace | Tile 可看「今日推荐」 | 不参与 | – |

---

## 6. 路线图（V4 可穿戴）

| 阶段 | 周期 | 交付 |
|------|------|------|
| V4 P1 | W1-W2 | Watch Tile 接入皮肤缩略 + 灵魂族群可视化 |
| V4 P2 | W3-W4 | Vitals → 主宠情绪映射 5 条规则上线 |
| V4 P3 | W5-W6 | Watch Complication 4 类家族 + 皮肤切换 5s 同步 |
| V4 P4 | W7-W8 | Skin GMV 通知（Watch + Glass） |
| V5 P5 | W9-W12 | Glass Toy 视觉识别 + BLE 外设 NFC 等价触点 |

---

## 7. 不做的事（V4 强约束）

- 可穿戴**不渲染** VRM/Rive（端硬件性能不支持）
- 可穿戴**永远不是** Trust 3
- 可穿戴**不直接持** Skin 资产（皮肤资产仍归 Mobile/Web 主账户）
- Glass 摄像头识别**默认关闭**，需用户在 Mobile 设置中白名单

---

## 8. Marketplace Ecosystem + Economy Integration (V4.1 增量)

> 权威口径以跨端顿领 `agentrix-cross-platform-prd-v4.md` §13 为准。本节只写可穿戴端（Watch / Glass / BLE）在跨端经济中的位置。

### 8.1 可穿戴在 Marketplace 生态中的角色

可穿戴端不参与 Marketplace 的浏览 / 上架 / 购买闭环（屏幕小 / 无钱包 / 交互弱），仅作为**被动反射 + 微通知 + Vitals 触发 AXP** 的 surface：

| 维度 | Watch | Glass | BLE 外设 |
|------|:-----:|:-----:|:-------:|
| 浏览 Marketplace | Tile 仅看「今日推荐」 | HUD 不展示 | – |
| 购买 / 上架 | 不参与 | 不参与 | 不参与 |
| 皮肤切换反射 | Complication 缩略图 5s 同步 | HUD emoji 刷新 | – |
| Skin GMV 通知 | 表盘 "+$2.10 — '蓝色独角兽'被买走了" | HUD 微通知 | – |
| AXP 事件 | Tile 显示今日 AXP 增量 | HUD "+20 AXP 签到完成" | 触发源（Vitals → AXP） |

### 8.2 Vitals → AXP 映射（V4.1 新增经济维度）

V3 Vitals Bus 仅驱动主宠情绪；V4.1 在满足健康目标时发放 AXP，形成 Loop 1 的物理延伸：

| Vital 触发 | AXP | 日上限 | 说明 |
|-----------|----:|-------:|-----|
| 完成每日 10k 步 | 20 | 1 | 对应跨端 §13.6.2 发放来源 2 的物理等价 |
| 完成每日运动目标（Watch Activity Ring） | 30 | 1 | 激励健康闭环 |
| 睡眠 ≥ 7h（昨晚） | 10 | 1 | 次日晨起触发 |
| HRV 连续 7 天达标 | 100 | 1/周 | 鼓励长期健康投资 |
| 佩戴戒指 / 手环 24h 连续 | 5 | 1 | 鼓励设备保持佩戴 |

数据源：Vitals Bus → `/api/v1/axp/earn`（kind=`vitals`）。所有发放由 Mobile 代理签名，可穿戴本身不持账户。

### 8.3 Watch Complication 对 AXP / GMV 展示

V4.1 扩展 Watch Complication（V4 §2.2 的基础上增加经济家族）：

| Complication 家族 | V4 内容 | V4.1 新增经济内容 |
|-----------------|--------|-----------------|
| Circular Small | 主宠 emoji + 亲密度 | – |
| Modular Small | 同上 + 今日 Earn | 同上，Earn 含 Skin GMV |
| Modular Large | + 当前 Skin 名称 | + 今日 AXP 增量 |
| Graphic Circular | Skin 缩略 + 情绪进度环 | + AXP 签到环（7 天连击可视化） |
| **新：AXP Progress（独立家族）** | – | 今日 AXP 余额 + 距下一兑换目标差值 |

### 8.4 Glass HUD Marketplace 微通知

Glass 只被动展示以下 3 类 Marketplace 相关微通知（每日上限 5 条，防打扰）：

| 事件 | HUD 文案 | 持续时间 |
|------|---------|---------|
| 你的皮肤被购买 | "+$2.10 — '蓝色独角兽' sold" | 3s |
| 你的技能被调用 | "+$0.05 — Smart Checkout 被 5 只宠调用" | 2s |
| AXP 过期提醒（前 30 天） | "500 AXP 将于 6 天后过期" | 5s（可一眼 dismiss） |

Glass 不展示任何需要交互的 Marketplace 元素（不做浏览 / 不做购买）。

### 8.5 可穿戴订阅权益（跨端 §13.7 对应）

| 档位 | 活跃设备数 | Watch Complication 家族 | Glass HUD 微通知 |
|------|:----------:|:----------------------:|:--------------:|
| Free | 1 | 基础 2 家族 | – |
| Lite | 2 | 基础 2 家族 | 关闭 |
| Plus | 4 | 5 家族全开 | 开启 |
| Pro | 6 | 5 家族全开 + 自定义 | 开启 + 优先级配置 |
| Elite | 10 | 全开 + 季度限定 Watch Face | 开启 + HUD 风格皮肤 |

### 8.6 L1 审批 + 经济动作的 Trust 边界

**强约束**（与跨端 §13 + V4 §5.5 一致）：

- Watch 可执行 L1 审批（tap 通过小额 Marketplace 购买 ≤ $10）
- Watch **不可** 执行 L2+ 审批（必须推回 Mobile）
- Watch Complication 展示的 AXP / GMV 数值**不可** 作为授权凭证
- Glass HUD 展示的数值仅通知，**不接受**语音确认大额交易
- BLE 外设 Vitals 触发的 AXP 是平台单方面发放，**不经** 用户签名

### 8.7 共养 / 贺卡在可穿戴的反映

Phase 1 多人游戏（跨端 §13.9）的可穿戴反馈：

| 事件 | Watch | Glass |
|------|-------|-------|
| 好友帮主宠喂食 | 震动 + Tile 一行 "Mike 喂了 Alfred +18 能量" | HUD 2s 微通知 |
| 收到贺卡 | 震动 + 表盘显示贺卡缩略 | HUD "收到 @Lucy 的贺卡" |
| 主宠 Lv↑ | 金色震动序列 + 表盘动画 | HUD 闪 2s + 灵魂族群 emoji 变更 |

---

## 9. 与 V3 引用

| V4 主题 | V3 引用 |
|--------|--------|
| 三路分工 | `wearable-prd-v3.md` §0 |
| Vitals Bus | `agentrix-cross-platform-prd-v3.md` §5.4 |
| Glass 硬件 G1/G2/G3 | `PRD_AI_GLASSES.zh-CN.md` v1.0 |
| BLE 技术层 | `WEARABLE_OPENCLAW_PRD.md` |
