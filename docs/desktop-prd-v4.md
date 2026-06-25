# Agentrix 桌面端 PRD v4.0（Desktop）

> **桌面 = 战场 + 工坊**：V3 双形态（Pro Mode + Living Agent）保留，V4 把 PetCreator 升级为主路径，让桌面成为「灵魂×皮肤」最重度的创作端。
>
> 本文件只写桌面端 V4 增量。所有跨端契约引用 `agentrix-cross-platform-prd-v4.md`。V3 已落地的 Pro Mode / Living Agent / 系统集成等内容仍以 `desktop-prd-v3.md` 为基线，V4 不重写。

- 版本: v4.0（与 V3 共存，便于对照）
- 状态: Draft，建立在 V3 已交付实现之上（`desktop/src/` 当前代码 = V3 + Phase 6 修复）
- 技术栈: Tauri 2.0 + React + Rust + WebView2（不变）
- 上游: `agentrix-cross-platform-prd-v4.md`（顿领）/ `desktop-prd-v3.md`（基线）
- 已落地的 V3→V4 过渡修复（不重复说）：
  - Tencent Cloud Hunyuan3D Provider（替换 HuggingFace）
  - 浮球 Native Menu（Tauri Menu API）
  - Pro Mode 下右键菜单不再退回浮球
  - 创建梦聪 → 创建萌宠 文案
  - 工作区 2 级深度文件树自动注入

---

## 0. V4 vs V3 桌面端对照速读

| 维度 | V3 | V4 |
|------|-----|-----|
| 形态 | 双形态（Living Agent / Pro Mode） | 不变（保留双形态） |
| 主宠层级 | 单层 LivingPet（V3 §3） | **双层（灵魂 × 皮肤）** |
| 渲染器 | SVG fallback + Live2D 占位 + VRM 已上线 | 增加 Rive 2D，VRM 升级到高面 + PBR |
| PetCreator | 已上线（侧边面板，文生 / 图生） | **主路径化**：双图融合繁殖、多图扫描预览（接收 Mobile 推送） |
| Marketplace | 不存在 | 桌面浏览 + 购买 + 上架（嵌入 Web `/console/marketplace` 或原生）|
| Toy 联动 | 不存在 | 桌面通过 BLE / Wi-Fi 直接驱动 Toy 灯效（开发者模式） |
| 工作区文件 | 部分实现 | **2 级深度自动注入**（已上线，V4 默认行为） |
| 文档地图 | desktop-prd-v3.md 单文件 | desktop-prd-v4.md 与 v3 共存 |

**未变内容**（V4 沿用 V3，不重写）：

- 双形态切换契约（V3 §0.3）
- Pro Mode IDE / 多 Agent 编排（V3 §4）
- 系统助手浅集成（Spotlight / Raycast / URL Scheme，V3 §10）
- Tauri / React 工程结构

---

## 1. 一句话定位（V4 升级）

**Agentrix Desktop V4 = Cursor 级 Pro Mode + Living Pet 陪伴 + 灵魂×皮肤工坊**：开发者一边写代码，一边训宠、做皮肤、上 Marketplace 卖设计。

---

## 2. 三层愿景在桌面（V4 修订）

| 层 | 桌面主阵地 | 形态 | V4 增量 |
|----|-----------|------|--------|
| Living Pet（灵魂） | 浮球 / 桌宠 / Pro Mode 顶部状态徽 | Living Agent | 灵魂模板切换器（默认 6 族群快速切换） |
| Pet（皮肤） | 同上 | Living Agent | 衣柜（Wardrobe）+ Marketplace 入口 + .vrm 高保真渲染 |
| Doer | Pro Mode 多 Agent 编辑 | Pro Mode | 不变 |
| Economy | AgentEconomyPanel + Marketplace 销售面板 | 两形态共用 | 加 Skin GMV 收入卡片 + Remix 分成时间线 |

---

## 3. 形态体系（V4 不变 + 新子形态）

### 3.1 双形态保留

V3 双形态完全保留：

- **Living Agent**：浮球 / 矢量 / 高保真 VRM（V4 默认 VRM）
- **Pro Mode**：多面板 IDE 风（V4 不变）

### 3.2 新子形态：Wardrobe（衣柜）

V4 在 Living Agent 下新增 **Wardrobe**子面板：

- 触发：浮球右键 → 「衣柜」/ Pro Mode 顶部状态徽 → 「换皮肤」
- 内容：
  - 当前装备的皮肤（大图）
  - 已拥有皮肤网格（缩略图，每张 200×200）
  - 「市场」入口 → 嵌入 Web `/console/marketplace`（iframe，单点登录）
  - 「PetCreator」入口 → 弹出已上线的 `PetCreatorPanel`
- 底部：当前灵魂模板 + 「切换灵魂」按钮 → 弹 6 族群选择器

### 3.3 新子形态：PetCreator 重度版

V3 已上线 `PetCreatorPanel`（侧边）。V4 升级为：

- **三模式 Tab**：文生 / 图生 / **双图融合（繁殖）**
- **进度条 + 缩略图**：30s-90s 异步任务，进度通过 SSE `pet.gen.progress` 回流
- **批量队列**：Pro+ 用户可并行 3 个生成任务（队列展示在面板底部）
- **Mobile 联动**：移动端摄像头扫描完成后推送到桌面，桌面弹 toast「📷 手机刚扫了一只新宠物，是否预览?」

---

## 4. 渲染器（V4 强约束）

V4 桌面渲染优先级（与 `desktop/src/services/petSdk.ts :: RENDERER_PRIORITY` 一致）：

```ts
['live2d', 'vrm', 'rive', 'fallback']
```

| 渲染器 | 桌面落地 | V4 节点 |
|--------|---------|---------|
| SVG fallback | 已上线 | – |
| Rive 2D | **V4 W3 新增** | Rive Web Runtime + .riv 包通过 CDN |
| VRM 低面 | 已上线 | – |
| VRM 高面 + PBR | **V4 W6 升级** | three-vrm + 质量分级（基于 GPU tier）|
| Live2D | 占位（保留不主推） | – |

### 4.1 GPU Tier 自适应

```ts
function chooseRenderer(): Renderer {
  if (isLowEndGpu()) return 'rive';   // <= Intel UHD 620
  if (isMidGpu()) return 'vrm-low';
  return 'vrm-high';
}
```

GPU 检测通过 WebGL `WEBGL_debug_renderer_info` + Tauri-side `wgpu` 兜底。

---

## 5. 工作区与文件上下文（V4 已落地基线）

V4 桌面端默认行为（已在 Phase 6 修复中上线）：

- 当用户消息含 `@file path` 或包含 `path/to/file.ext` 形式 → 自动读取（≤5 个文件，每个 ≤64KB，总 ≤200KB）
- 工作区目录树：发送时附 2 级深度树作为系统上下文
  - HEAVY_DIRS（`node_modules` / `target` / `.git` / `dist` / `build` / `.next` / `__pycache__`）跳过
  - 每个目录最多 60 项
  - 总行数 ≤ 400

实现位置：

- `desktop/src/services/workspace.ts :: extractFilePathMentions / autoAttachMentionedFiles`
- `desktop/src/components/chatPanel/useStreamingTurn.ts :: workspaceListingRef + serializeMessageForModel`

V4 不再修改本节，**这是 V4 的默认基线**。

---

## 6. 与跨端 7 大主路径的桌面适配

| 路径 | 桌面行为 | V4 增量 |
|------|---------|--------|
| Handoff（V3 §5.1） | 顶部 toast Banner | 不变 |
| Approval Routing（V3 §5.2） | L1 桌面确认 / L2+ 推到 Mobile | 不变 |
| Wallet（V3 §5.3） | AgentEconomyPanel | + Skin Marketplace 收入卡片 |
| Vitals（V3 §5.4） | 接收 Watch/Glass 推送 | 不变 |
| Memory（V3 §5.5） | 4 层共享 | 不变 |
| **Pet Creation（V4 新）** | PetCreatorPanel 主入口 + 双图融合 + 接收 Mobile 摄像头推送 | 全新 |
| **Skin Marketplace（V4 新）** | Wardrobe 入口 → iframe 嵌入 `/console/marketplace`，单点登录 | 全新 |

---

## 7. Toy 联动（V4 桌面新增）

桌面作为「开发者主战场」，V4 新增 Toy 调试能力：

### 7.1 ClawCore Inspector（开发者模式）

- 触发：设置 → 开发者 → 「ClawCore 设备调试」
- 功能：
  - 列出附近 BLE / Wi-Fi 上线的 Toy 设备
  - 实时显示帧流（双向 JSON-line）
  - 手动构造 `pet.state.sync` / `pet.approval.notify` 帧推送
  - 模拟 `pet.interaction` 触发（hug / nfc_touch / wrist_tap）
  - OTA 镜像上传（仅签名固件）

### 7.2 桌面作为 Toy 中继

家庭 / 办公场景：

- 桌面常驻在 Wi-Fi 局域网，Toy 通过 mDNS 发现桌面
- 桌面充当 BLE/Wi-Fi gateway，把 Toy 帧反向上行到后端（即使 Toy 离线）
- 实现位置：`desktop/src-tauri/plugins/clawcore/`（V4 W11 新增）

---

## 8. Phase 6 已落地修复（V4 起点）

> 这些修复在本对话内已 commit + 部署 + .exe 重建（commit `85bebe2f`）。V4 PRD 把它们作为既定事实，便于后续阶段引用。

| 修复 | 文件 | 备注 |
|------|------|------|
| Tencent Cloud Hunyuan3D Provider | `backend/src/modules/pet-generation/hunyuan3d.provider.ts` | TC3-HMAC-SHA256，`ai3d.tencentcloudapi.com`，async submit + poll |
| 浮球 Native Menu | `desktop/src/components/FloatingBall.tsx :: showNativeBallMenu()` | Tauri Menu API；右键悬浮态可见 |
| Pro Mode 右键不退回浮球 | `desktop/src/components/ChatPanelImpl.tsx`（菜单项不再调 `onTap()`） | 通过 `desktopBus.dispatchUiAction()` 派发 |
| 文案 梦聪→萌宠 | `desktop/src/components/PetCreatorPanel.tsx`（4 处） | – |
| 工作区 2 级深度 + Mention | `desktop/src/services/workspace.ts` + `chatPanel/useStreamingTurn.ts` | HEAVY_DIRS 跳过，限额防 token 爆炸 |

---

## 9. 路线图（V4 桌面）

| 阶段 | 周期 | 交付 |
|------|------|------|
| V4 P1 | W1-W2 | 灵魂模板切换器、Wardrobe 子面板、6 族群快速切换 |
| V4 P2 | W3-W4 | Rive 2D 渲染器、PetCreator 双图融合 Tab、配额 UI |
| V4 P3 | W5-W6 | VRM 高面 + PBR、Wardrobe 嵌入 Web Marketplace、Mobile 摄像头联动 |
| V4 P4 | W7-W8 | AgentEconomyPanel + Skin GMV 卡片、Remix 时间线 |
| V5 P5 | W9-W12 | ClawCore Inspector（开发者模式）、桌面作为 Toy 中继 |

---

## 10. 测试与监控（V4 增量）

- E2E：Playwright 全流程「文生 → 装备 → 切换灵魂 → 查看 Marketplace 收入」
- 性能基线：
  - VRM 高面渲染 60fps @ 1080p（中端 GPU）
  - PetCreator 提交后 30s 内出现进度反馈
  - 工作区注入消息长度 ≤ 200KB
- 监控指标：
  - `pet.skin.applied.success` / `pet.skin.applied.fail`
  - `pet.gen.task.duration_seconds`（p50/p95）
  - `marketplace.iframe.load_duration_ms`

---

## 11. 与 V3 文档的引用

| V4 主题 | 引用 V3 位置 |
|--------|-------------|
| Pro Mode 多面板 | `desktop-prd-v3.md` §4 |
| Living Agent 表情状态机 | `agentrix-cross-platform-prd-v3.md` §3.4 |
| 系统助手浅集成 | `desktop-prd-v3.md` §10 |
| Handoff 协议 | `agentrix-cross-platform-prd-v3.md` §5.1 |


---

## 2026-05-24 双人群对齐补丁

> 触发:`.kiro/specs/positioning-revision-2026-05/`(commit `f93365552`)
> 主决策文档:`docs/agentrix-positioning-2026-05.zh-CN.md`(2026-05-24 修订版)

**SSOT 声明**:本 PRD 的所有用户画像 / Mode 行为 / 路线图条款,**以
`docs/agentrix-positioning-2026-05.zh-CN.md` (2026-05-24 修订版) 为准**。
任何与该主文档冲突的具体段落,本次**不重写正文**,仅在此处登记 follow-up。

### 已知需要回看的段落(follow-up TODO)

| 段落主题 | 当前状态 | follow-up |
|---------|---------|-----------|
| Pro Mode 章节(§4 多面板) | 仅描述 More 菜单 9 项可见性 | TODO: 加入 Pro Mode coding 视图三件套(Workspace Diff workbench / Open in IDE button / `@symbol` mention),引用 `pro-mode-coding-views-2026-05` spec |
| Simple Mode 默认承诺 | 未写明"首次进入 = Simple,无自动检测" | TODO: 加入硬承诺章节,引用 positioning §3.3 |
| 路线图 | 未列 P3 (VS Code / Cursor 扩展) | TODO: 路线图末尾追加 P3 sprint(2026-08+) |
| Living Agent ↔ Pro Mode 双形态 | 描述偏 V3,未匹配新分段 (L1/L2/L3 + Simple/Standard/Pro) | TODO: 双形态描述需要与 P-3 已落地 mode picker 对齐 |
| IDE 桥接 | 现有 `ideBridge.ts` 仅 `openInIde`,未规范双向协议 | TODO: 在 P3 sprint 落地时补 PRD,IdeBridge 双向协议留 v5 |

### 本次 sprint(`pro-mode-coding-views-2026-05`)落地的项

- ✅ Pro Mode 暴露 raw diff workbench(Workspace Diff)
- ✅ Pro Mode 暴露 Open in IDE button(消息工具卡上)
- ✅ Pro Mode 暴露 `@symbol` mention(MentionAutocomplete + 后端 grep)
- ✅ Simple / Standard 模式下三件套全隐藏(回归测试覆盖)

上述四件事**已实现并通过 e2e 测试**,但本 PRD 正文**未同步更新**——
留待 v5 正式立项时一并整合。

### 对应 spec

`.kiro/specs/positioning-revision-2026-05/{requirements.md, tasks.md}`
`.kiro/specs/pro-mode-coding-views-2026-05/{requirements.md, tasks.md}`(本次 sprint)
