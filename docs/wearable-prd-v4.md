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

## 8. 与 V3 引用

| V4 主题 | V3 引用 |
|--------|--------|
| 三路分工 | `wearable-prd-v3.md` §0 |
| Vitals Bus | `agentrix-cross-platform-prd-v3.md` §5.4 |
| Glass 硬件 G1/G2/G3 | `PRD_AI_GLASSES.zh-CN.md` v1.0 |
| BLE 技术层 | `WEARABLE_OPENCLAW_PRD.md` |
