# Desktop Live2D Blocker 清单（2026-05-05）

> **状态更新（2026-05-05 晚）**：决策已锁定路线 B（Rive 短期 + VRM 中期）替代 Live2D Cubism 商用 license。Blocker §2/§3/§4/§6 已通过当前桌面端代码部分或全部解决；本文档保留作为历史与 V4 排期参考。

## 当前已核实状态（已更新）

- ✅ Pet SDK 已落地：[desktop/src/services/petSdk.ts](../desktop/src/services/petSdk.ts) 提供 `EMOTION_MOTION_MAP`（10 表情）/ `INTIMACY_LEVELS`（v2 6 等级）/ `INTERACTION_TABLE`（6 种交互）/ `PetRenderer` 接口 + 注册表。
- ✅ Fallback 渲染器：[desktop/src/components/PetCanvas.tsx](../desktop/src/components/PetCanvas.tsx) 提供 SVG 浮球，已映射 10 表情 + 双击 +5xp + 悬停 3s 微互动 + 亲密度等级徽章。
- ✅ Rive / VRM 占位渲染器：`petSdk.ts` 已注册 `rive` 与 `vrm` 两个 stub，按 `localStorage.agentrix_pet_rive_url` / `agentrix_pet_vrm_url` 自动激活，避免引入运行时依赖即可保留升级位。
- ✅ 视觉感知链路：[desktop/src/services/visionPerception.ts](../desktop/src/services/visionPerception.ts) 截图原语已接回 `setLocalEmotion` + `triggerPetInteraction('vision_match')`；隐私边界（默认关闭 / 30s 采样下限 / 安静时段 / 黑名单 / 60s 冷却 / hash-only）已生效。
- ❌ 无 Live2D Cubism runtime 与 `.moc3` 资产 — **路线 A 已放弃，不再需要**。
- ❌ Rive `.riv` 与 VRM `.vrm` 真实资产、`@rive-app/canvas` 与 `@pixiv/three-vrm` 运行时依赖尚未落地，留 V4 排期。

## Blocker 清单（已更新状态）

| # | Blocker | 当前状态 | 备注 |
|---|---|---|---|
| 1 | 授权与资产 | ✅ 已绕过 | 路线 B 改用 Rive (MIT) + VRM (MIT runtime + VRoid 免费模型)，无需 Cubism license |
| 2 | 运行时缺失 | 🟡 接口已就绪 | `PetRenderer` 接口 + `rive` / `vrm` stub 已注册；真实 runtime 留 V4 W1-W6 |
| 3 | 状态映射缺失 | ✅ 已完成 | `EMOTION_MOTION_MAP`（10 表情）+ `INTIMACY_LEVELS`（6 级）+ `INTERACTION_TABLE`（6 类）已落地于 `petSdk.ts` |
| 4 | 视觉感知链路缺失 | ✅ 已完成 | `visionPerception.ts` 已接通；隐私默认关闭 |
| 5 | 离线与分发策略缺失 | 🟡 占位 | 当前 stub 用 `localStorage` URL 切换；V4 W1-W6 落地时升级为带签名/校验的资产清单 |
| 6 | SDK / 对外能力缺失 | ✅ 已完成（v0.1） | `bootPetSdk` / `triggerPetInteraction` / `setLocalEmotion` / `registerPetRenderer` 已对外；外部插件可注册自定义 `PetRenderer` |

## 落地前置条件

1. 先拿到 Live2D license，并确定模型来源与可商用范围。
2. 明确桌面技术选型：JS runtime 方案、Tauri 打包方式、资源目录与更新策略。
3. 先写清 emotion / intimacy / interaction 三张映射表，再开始做 renderer。
4. 先定义视觉感知的隐私边界与产品策略，再把截图原语接进主宠行为链。
5. 先定义离线降级方案：无模型资源时退回浮球；无视觉感知时仍可保留基础互动。
6. 先确定 Pet SDK 的最小 API 面，再决定是否把 Live2D 实现暴露给外部插件或只保留内部能力。

## 建议落地顺序

1. 授权 / 模型 / runtime 选型
2. 最小 renderer + 6 个 emotion 动作映射
3. 双击互动 / idle / intimacy v2
4. 视觉感知回写
5. 离线资源与更新策略

---

## 替代路线评估（2026-05-05 追加）

Live2D Cubism 商用 license + 委托设计是路线 A，但工程与商务成本高（license fee + 模型 ~$2k+ + Cubism SDK 审查）。以下为 0 license 成本的等价替代，建议作为主路径推进。

### 路线 B（推荐）: Rive + VRM 双轨

| 阶段 | 方案 | License | 工作量 | 适配 §3.4 10 表情 |
|---|---|---|---|---|
| **P0 应急** | emoji + CSS 辉光（已实现 [PetEmotionOverlay.tsx](../desktop/src/components/PetEmotionOverlay.tsx)） | 0 | 0 | ✅ 直接对齐枚举 |
| **P1 短期** | **Rive**：编辑器免费 + runtime MIT；内置状态机原生承接 10 表情；Tauri WebView2 直接嵌 `@rive-app/canvas` | MIT | 1-2 周（美术为主） | ✅ Rive State Machine 1:1 映射 emotion |
| **P2 中期** | **VRM + three-vrm**：VRoid Studio 免费出图（2023 后条款已放宽可商用）；BlendShape 标准已含 happy/sad/angry/surprised/neutral；模型可跨 web/mobile/desktop 复用 | MIT (runtime) / 模型自定 | 2-3 周 | ✅ VRM Expression 标准映射 |
| **P3 高质量** | **DragonBones**（白鹭引擎，编辑器与 runtime 完全免费可商用）或委托独立画师（~$500-2000 一只） | 完全免费 | 3-4 周 | ✅ 骨骼动画过渡平滑 |

### 路线 C: 像素 / 程序化（极简 / 应急）

- **Shimeji-ee**（LGPL 桌宠引擎）+ XML 行为脚本
- **Lottie**（After Effects → JSON, MIT）做帧动画
- **30 行 canvas** 画一只会眨眼的方块 buddy（MVP 完全够）

### 决策建议

- **主路径切换为路线 B**（Rive → VRM 渐进升级），理由:
  - 0 license 成本 + 0 SDK 审查依赖
  - Rive runtime（MIT）与 Tauri WebView2 兼容良好，无需引入 Cubism native runtime
  - VRM 资产可在 desktop / mobile / web 三端复用同一份模型，符合 v3 跨端理念
  - 上述 §Blocker 1（授权/资产）和 §Blocker 2（运行时缺失）均可绕过
- **路线 A（Live2D）保留为可选高质量分支**，仅当委托独立画师时才决定是否走 Cubism license（成本对比不优）
- §Blocker 3-6（状态映射 / 视觉感知 / 离线分发 / Pet SDK）与所选 runtime **无关**，必须独立完成

### 跟进任务（同步加入 [WEB_REMEDIATION_PLAN_20260505.zh-CN.md](WEB_REMEDIATION_PLAN_20260505.zh-CN.md) §Pet Asset Pipeline）

1. **W24** Pet Asset Pipeline 决策会：路线 B 锁定（Rive 短期 + VRM 中期）
2. **V4 W1-W2** Rive 集成：编辑器出 1 只默认宠物 + 10 表情 state machine + Tauri runtime 接入 + 接 `pet.state` topic
3. **V4 W3-W6** VRM 升级：VRoid Studio 自制模型 + three-vrm 渲染 + BlendShape 驱动 + 跨端资源 CDN
4. **V4 W7+** Pet SDK：抽象 `PetRenderer` 接口（Rive / VRM / Live2D 三实现可插拔）+ 视觉感知 wiring + 离线资源策略
6. Pet SDK 文档与开放接口