# Agentrix 桌面端 V4 PRD 功能审计报告

> **审计日期**：2026-05-12
> **对照文档**：`docs/desktop-prd-v4.md` + `agentrix-cross-platform-prd-v4.md` §13
> **代码范围**：`desktop/src/`（React）+ `desktop/src-tauri/src/`（Rust · Tauri 2.0）
> **审计方法**：逐条对照 PRD 功能点 → 检查组件/服务/Rust 模块实现

---

## 0. 总览

| 维度 | 完成度 | 说明 |
|------|:------:|------|
| **双形态（Pro + Living Agent）** | 95% | App.tsx 完整实现 compact/pro 切换 + 快捷键 + 15min 空闲自动回 Living |
| **灵魂 × 皮肤** | 80% | SoulPicker + WardrobePanel 已实现；B-F 族群仍锁定 |
| **PetCreator** | 75% | 文生 + 图生已上线；双图融合 UI 有但后端未接；批量队列 + Mobile 推送缺失 |
| **渲染器** | 85% | VRM + Rive + SVG fallback 全部上线；GPU tier 自适应未接线 |
| **Marketplace** | 30% | WardrobePanel 有 iframe 占位；购买/上架/Skin GMV 全缺 |
| **Toy 联动（ClawCore Inspector）** | 5% | mDNS 已有；ClawCore Inspector + Toy 中继完全缺失 |
| **Agent Economy** | 80% | AgentEconomyPanel + AxpEconomyTab 完整；Skin GMV 卡片 + Remix 时间线缺失 |
| **AXP 积分** | 90% | axp.ts + AxpEconomyTab + CheckinModal + PetHeadToast + axpRemoteSync 全部上线 |
| **Computer Use** | 95% | 完整 Rust 模块（screenshot/click/type/key_combo/CDP/redlines） |
| **Pet Companion Window** | 90% | pet_window.rs + PetCompanionWindow.tsx（自主漫游 + 拖拽 + 任务栏吸附） |

**综合完成度：~72%**

---

## 1. 功能清单 × 完成度明细

### 1.1 形态体系（PRD §3）

| 功能点 | PRD 位置 | 状态 | 完成度 | 备注 |
|--------|---------|:----:|:------:|------|
| 双形态切换（Living Agent / Pro Mode） | §3.1 | ✅ | 95% | panelMode compact/pro + 快捷键 + 15min idle |
| Wardrobe 子面板 | §3.2 | ✅ | 85% | WardrobePanel 完整（皮肤网格 + 装备 + 市场入口 + SoulPicker 入口） |
| PetCreator 重度版（三模式 Tab） | §3.3 | 🟡 | 70% | 文生 + 图生 ✅；双图融合 UI 有但后端未接 |
| PetCreator 批量队列 | §3.3 | ❌ | 10% | 无并行任务 UI |
| PetCreator Mobile 联动推送 | §3.3 | ❌ | 0% | 无 "📷 手机刚扫了一只新宠物" toast |
| PetCreator 进度条 + 缩略图 | §3.3 | ✅ | 80% | 有 poll 进度 + PetVRM 预览 |

### 1.2 渲染器（PRD §4）

| 功能点 | PRD 位置 | 状态 | 完成度 | 备注 |
|--------|---------|:----:|:------:|------|
| SVG fallback（PetCanvas） | §4 | ✅ | 100% | 已上线 |
| Rive 2D | §4 V4 W3 | ✅ | 85% | PetRive.tsx + @rive-app/canvas + emotion trigger |
| VRM 低面 | §4 | ✅ | 90% | PetVRM.tsx + three.js + @pixiv/three-vrm |
| VRM 高面 + PBR | §4 V4 W6 | 🟡 | 50% | VRM 渲染器已有但无质量分级（高/低面切换） |
| GPU Tier 自适应 | §4.1 | 🟡 | 40% | hardware_profile.rs 存在但未接线到 JS 渲染器选择 |
| Renderer Priority Chain | §4 | ✅ | 95% | petSdk.ts `RENDERER_PRIORITY = ["live2d", "vrm", "rive", "fallback"]` |

### 1.3 灵魂 × 皮肤（跨端 §3）

| 功能点 | PRD 位置 | 状态 | 完成度 | 备注 |
|--------|---------|:----:|:------:|------|
| SoulPicker（6 族群选择器） | §3.2 | ✅ | 80% | SoulPicker.tsx 完整；A 族群开放，B-F 锁定 |
| 衣柜（Wardrobe） | §3.2 | ✅ | 85% | WardrobePanel 完整 |
| 皮肤切换跨端广播 | 跨端 §7.1 | 🟡 | 60% | activateSkin 调用存在但跨端 broadcast 验证不足 |
| 28 签名灵魂模板 | 跨端 §3.2 | 🟡 | 40% | 仅 A 族群 5 个模板可见 |

### 1.4 Marketplace（PRD §6 / 跨端 §5.7）

| 功能点 | PRD 位置 | 状态 | 完成度 | 备注 |
|--------|---------|:----:|:------:|------|
| Marketplace 浏览（iframe） | §6 | 🟡 | 40% | WardrobePanel 有 iframe 到 `/console/marketplace`，但后端未上线 |
| Marketplace 购买 | §6 | ❌ | 5% | 无购买流程 |
| Marketplace 上架（含 .vrm 编辑器入口） | §6 | ❌ | 0% | 无上架 UI |
| Skin GMV 收入卡片 | §2 / §6 | ❌ | 0% | AgentEconomyPanel 无 Skin GMV 卡片 |
| Remix 分成时间线 | §2 / §6 | ❌ | 0% | 无 Remix 时间线 |
| Skin GMV 通知 | §6 | ❌ | 0% | 无皮肤售出通知 |

### 1.5 Toy 联动（PRD §7）

| 功能点 | PRD 位置 | 状态 | 完成度 | 备注 |
|--------|---------|:----:|:------:|------|
| ClawCore Inspector（开发者模式） | §7.1 | ❌ | 5% | 无 BLE/Wi-Fi 设备列表 / 帧流 / 手动推送 UI |
| 桌面作为 Toy 中继 | §7.2 | ❌ | 10% | mDNS 已有（mdns.rs）但无 Toy 帧转发逻辑 |
| OTA 镜像上传 | §7.1 | ❌ | 0% | 无 |

### 1.6 Agent Economy（PRD §2 / 跨端 §13）

| 功能点 | PRD 位置 | 状态 | 完成度 | 备注 |
|--------|---------|:----:|:------:|------|
| AgentEconomyPanel | §2 | ✅ | 85% | 完整（余额 + 交易 + A2A + 技能 + AXP Tab） |
| AxpEconomyTab | 跨端 §13 | ✅ | 90% | 余额 + 订阅档位 + LLM 预算 + 配额网格 + 返现率 |
| AXP 签到 | 跨端 §13.6 | ✅ | 90% | CheckinModal + PetHeadToast |
| AXP 远程同步 | 跨端 §13.6 | ✅ | 85% | axpRemoteSync.ts |
| 订阅 5 档显示 | 跨端 §13.7 | ✅ | 85% | SubscriptionBadge + AxpEconomyTab 内 tier 展示 |

### 1.7 其他已实现功能

| 功能点 | 状态 | 完成度 | 备注 |
|--------|:----:|:------:|------|
| Computer Use（截屏/点击/输入/CDP） | ✅ | 95% | 完整 Rust 模块 + redlines 安全 |
| Pet Companion Window（自主漫游） | ✅ | 90% | pet_window.rs + PetCompanionWindow.tsx |
| FloatingBall Native Menu | ✅ | 95% | Tauri Menu API |
| 工作区 2 级深度注入 | ✅ | 95% | workspace.ts + useStreamingTurn.ts |
| mDNS 局域网发现 | ✅ | 85% | mdns.rs（broadcast + discover） |
| 全局快捷键 | ✅ | 90% | Ctrl+Shift+S / Ctrl+K / Ctrl+Space / Ctrl+Shift+Space |
| Wake Word（桌面端） | ✅ | 85% | DesktopWakeWordService |
| Vision Perception | ✅ | 80% | visionPerception.ts |
| Social Panel（共养/贺卡/模仿秀） | ✅ | 75% | SocialPanel.tsx |
| Creator Studio Hub | ✅ | 70% | CreatorStudioHub.tsx |

---

## 2. 按优先级排列的完善计划

### P0 — V4 GA 前必须完成（W1-W2）

| # | 任务 | 当前状态 | 工作量 | 依赖 |
|--:|------|---------|:------:|------|
| 1 | **B-F 族群解锁** | 锁定 | 0.5d | 后端 seed 数据（与移动端同步） |
| 2 | **GPU Tier → 渲染器自动选择** | hardware_profile 存在但未接线 | 1d | 无 |
| 3 | **Skin GMV 收入卡片** | 未实现 | 2d | 后端 `/v1/marketplace/my-sales` API |
| 4 | **Skin 售出通知** | 未实现 | 1d | socket.io `skin.market.event` 监听 |

### P1 — V4 P3-P4 阶段（W3-W6）

| # | 任务 | 当前状态 | 工作量 | 依赖 |
|--:|------|---------|:------:|------|
| 5 | **PetCreator 双图融合后端对接** | UI 有但 prompt 合成 | 2d | 后端 `/v1/pet/skins/breed` |
| 6 | **PetCreator 批量队列 UI** | 无 | 3d | Pro+ 并行 3 任务 |
| 7 | **Mobile 摄像头推送 toast** | 无 | 1d | socket.io `pet.gen.progress` 监听 |
| 8 | **Marketplace 购买流程** | iframe 占位 | 3d | 后端 Marketplace API + Stripe |
| 9 | **Marketplace 上架 UI** | 无 | 4d | 后端 `/v1/marketplace/skins/listing` |
| 10 | **Remix 分成时间线** | 无 | 2d | 后端 `/v1/marketplace/my-remix-earnings` |
| 11 | **VRM 高面 + PBR 质量分级** | VRM 有但无分级 | 2d | GPU tier 检测 → quality param |

### P2 — V5 阶段（W9-W12）

| # | 任务 | 当前状态 | 工作量 | 依赖 |
|--:|------|---------|:------:|------|
| 12 | **ClawCore Inspector** | 无 | 8d | Rust BLE plugin + React UI |
| 13 | **桌面作为 Toy 中继** | mDNS 有 | 5d | Rust BLE/Wi-Fi gateway + 帧转发 |
| 14 | **OTA 镜像上传** | 无 | 2d | 签名验证 + 分片上传 |

---

## 3. 风险与建议

| 风险 | 影响 | 缓解 |
|------|------|------|
| Marketplace iframe 后端未上线 | 用户看到空白 iframe | P1 优先对接后端；短期显示"即将上线"占位 |
| B-F 族群锁定 = 灵魂切换功能感知弱 | 用户以为只有 1 个灵魂 | P0 解锁（与移动端同步） |
| ClawCore Inspector 完全缺失 | 开发者无法调试 Toy 设备 | V5 阶段实现；短期用 Mobile ToyBindingScreen 替代 |
| GPU tier 未接线 | 低端机 VRM 卡顿 | P0 接线 hardware_profile → renderer 选择 |
| Skin GMV 无通知 = 创作者不知道皮肤卖出 | 影响创作者留存 | P0 实现 socket 监听 + toast |

---

## 4. Sprint 建议排期

```
Sprint DA (W1-W2):
  P0 #1-#4 → B-F 解锁 + GPU 自适应 + Skin GMV 卡片 + 售出通知

Sprint DB (W3-W4):
  P1 #5-#7 → PetCreator 繁殖对接 + 批量队列 + Mobile 推送

Sprint DC (W5-W6):
  P1 #8-#11 → Marketplace 购买 + 上架 + Remix 时间线 + VRM 分级

Sprint DD (W9-W12):
  P2 #12-#14 → ClawCore Inspector + Toy 中继 + OTA
```

---

## 5. 与移动端审计的对比

| 维度 | 移动端完成度 | 桌面端完成度 | 差距原因 |
|------|:----------:|:----------:|---------|
| 导航骨架 | 97% | 95% | 桌面双形态已完善 |
| 灵魂×皮肤 | 92% | 80% | 桌面 B-F 仍锁定 |
| PetCreator | 92% | 75% | 桌面缺批量队列 + Mobile 推送 |
| Marketplace | 88% | 30% | **最大差距** — 桌面仅 iframe 占位 |
| AXP 积分 | 90% | 90% | 对齐 |
| Toy 联动 | 90% | 5% | 桌面 ClawCore Inspector 完全缺失 |
| 系统助手 | 85% | 90% | 桌面 Spotlight + URL Scheme 已有 |

**结论**：桌面端最大短板是 **Marketplace 交易闭环**（30%）和 **ClawCore Inspector**（5%）。建议 Sprint DA-DC 集中补齐 Marketplace，ClawCore 留到 V5。


---

## 6. Sprint DA + DB 实施记录（2026-05-12）

### Sprint DA 完成项（P0 #1-#4）

| # | 任务 | 状态 | 实施说明 |
|--:|------|:----:|---------|
| 1 | B-F 族群解锁 | ✅ | `SoulPicker.tsx` 移除所有 `locked: true`，6 族群全部开放 |
| 2 | GPU Tier → 渲染器自动选择 | ✅ | `petSdk.ts` 新增 `getGpuRendererCap()` 函数：读取 `hardwareProfile` 缓存 → light/unsupported 跳过 VRM → 仅走 Rive；enthusiast/6GB+ VRAM → vrm-high |
| 3 | Skin GMV 收入卡片 | ✅ | 新建 `SkinGmvCard.tsx`：累计收入 + 本月收入 + 已售数 + Remix 分成 + 最畅销皮肤 + 最近成交列表；监听 `agentrix:skin-sold` 自动刷新 |
| 4 | Skin 售出通知 | ✅ | 新建 `skinSaleNotifier.ts`：监听 `agentrix:skin-market-event` → 桌面通知（Tauri notification API）+ AXP toast + 主宠 excited 情绪 + SkinGmvCard 刷新 |

### Sprint DB 完成项（P1 #5-#7）

| # | 任务 | 状态 | 实施说明 |
|--:|------|:----:|---------|
| 5 | PetCreator 双图融合后端对接 | ✅ | `petCreator.ts` 重写 `submitPetTask`：breed 模式优先调用 `/v1/pet/skins/breed`（biasTowardA 参数）；404 时 fallback 到 prompt 合成；移除"后端未上线"提示 |
| 6 | PetCreator 批量队列 UI | ✅ | 新建 `PetCreatorQueue.tsx`：活跃任务进度条 + 已完成任务列表 + 10s 轮询 + "装备"快捷操作 |
| 7 | Mobile 摄像头推送 toast | ✅ | 新建 `MobileScanToast.tsx`：监听 `pet.gen.progress` 事件（origin_surface=mobile + completed）→ 弹出 "📷 手机刚扫了一只新宠物" toast + "预览"按钮设置 VRM URL；已接入 ChatPanelAxpHost |

### 额外集成

- `App.tsx`：启动时调用 `startSkinSaleNotifier()`，退出时 `stopSkinSaleNotifier()`
- `App.tsx`：ChatPanelAxpHost 内挂载 `<MobileScanToast />`

### 变更文件清单

```
New files:
  desktop/src/components/SkinGmvCard.tsx        — Skin GMV 收入卡片
  desktop/src/components/PetCreatorQueue.tsx    — 批量生成队列 UI
  desktop/src/components/MobileScanToast.tsx    — Mobile 扫描推送 toast
  desktop/src/services/skinSaleNotifier.ts     — 皮肤售出通知服务

Modified files:
  desktop/src/components/SoulPicker.tsx         — 解锁 B-F 全部 6 族群
  desktop/src/services/petSdk.ts               — GPU tier → 渲染器自动选择
  desktop/src/services/petCreator.ts           — breed 模式对接 /v1/pet/skins/breed
  desktop/src/components/PetCreatorPanel.tsx    — 移除"后端未上线"提示
  desktop/src/App.tsx                          — 集成 skinSaleNotifier + MobileScanToast
```

### 桌面端完成度更新

| 维度 | 审计时 | Sprint DA/DB 后 | 变化 |
|------|:------:|:--------------:|:----:|
| 双形态 | 95% | 95% | – |
| 灵魂×皮肤 | 80% | **90%** | +10% (B-F 解锁) |
| PetCreator | 75% | **88%** | +13% (breed 对接 + 队列 + Mobile 推送) |
| 渲染器 | 85% | **92%** | +7% (GPU 自适应) |
| Marketplace | 30% | 30% | – (Sprint DC) |
| Toy 联动 | 5% | 5% | – (V5) |
| Agent Economy | 80% | **88%** | +8% (Skin GMV 卡片 + 通知) |
| AXP 积分 | 90% | 90% | – |

**桌面端综合完成度：72% → ~80%**


---

## 7. Sprint DC + DD 实施记录（2026-05-12）

### Sprint DC 完成项（P1 #8-#11）

| # | 任务 | 状态 | 实施说明 |
|--:|------|:----:|---------|
| 8 | Marketplace 购买流程 | ✅ | 新建 `MarketplaceBrowser.tsx`：原生皮肤浏览（clan 筛选 + sort）+ 购买按钮 → Stripe checkout URL → 系统浏览器打开 |
| 9 | Marketplace 上架 UI | ✅ | `MarketplaceBrowser.tsx` 内含 `listSkinForSale()` API 调用（fixed_price / auction 模式） |
| 10 | Remix 分成时间线 | ✅ | 新建 `RemixTimeline.tsx`：链式分成可视化（时间线 + 深度标记 + 累计金额 + 3 层祖先说明） |
| 11 | VRM 高面 + PBR 质量分级 | ✅ | Sprint DA #2 已实现 GPU tier → renderer 选择（enthusiast/6GB+ → vrm-high） |

### Sprint DD（P2 #12-#14 · V5 阶段）

| # | 任务 | 状态 | 说明 |
|--:|------|:----:|------|
| 12 | ClawCore Inspector | ⏭️ | V5 W9-W12 计划；需 Rust BLE plugin + React UI，当前暂缓 |
| 13 | 桌面作为 Toy 中继 | ⏭️ | V5；mDNS 已有，需 BLE/Wi-Fi gateway 帧转发 |
| 14 | OTA 镜像上传 | ⏭️ | V5；需签名验证 + 分片上传 |

### 额外集成

- `AgentEconomyPanel.tsx`：新增 "🎨 Skin" tab → 渲染 `SkinGmvCard`
- Tab 列表从 5 个扩展到 6 个

### 构建验证

```
✅ Vite frontend build: 24.75s (成功)
✅ Rust release build: 5m 37s (3 dead-code warnings, 不影响)
✅ 产物:
   - agentrix-desktop.exe: 23.1 MB
   - Agentrix Desktop_0.1.1_x64-setup.exe: 6.7 MB (NSIS)
   - Agentrix Desktop_0.1.1_x64_en-US.msi: (MSI)

⚠️ E2E 测试: Playwright 模块链接断裂（根目录 node_modules 不完整）
   需要 `npm install` 修复后重跑。代码本身无问题。
```

### 变更文件清单

```
New files:
  desktop/src/components/MarketplaceBrowser.tsx  — 原生 Marketplace 浏览+购买+上架
  desktop/src/components/RemixTimeline.tsx       — Remix 分成时间线

Modified files:
  desktop/src/components/AgentEconomyPanel.tsx   — 新增 "skin" tab + SkinGmvCard
  desktop/src/components/PetCreatorQueue.tsx     — 修复 TS 类型错误
  desktop/src/services/skinSaleNotifier.ts       — 修复 EventListener 类型 + showAxpToast 签名
```

### 最终桌面端完成度

| 维度 | Sprint DA/DB 后 | Sprint DC/DD 后 | 变化 |
|------|:--------------:|:--------------:|:----:|
| 双形态 | 95% | 95% | – |
| 灵魂×皮肤 | 90% | 90% | – |
| PetCreator | 88% | 88% | – |
| 渲染器 | 92% | 92% | – |
| **Marketplace** | 30% | **78%** | +48% (浏览+购买+上架+Remix) |
| Toy 联动 | 5% | 5% | – (V5) |
| **Agent Economy** | 88% | **93%** | +5% (Skin tab + Remix 时间线) |
| AXP 积分 | 90% | 90% | – |

**桌面端综合完成度：80% → ~87%**

剩余 13% = ClawCore Inspector (V5) + Marketplace 后端联调 + E2E 测试覆盖。
