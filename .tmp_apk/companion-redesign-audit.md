# Pre-flight Audit: Mobile Pet Companion Redesign Phase 1

> Generated 2026-05-22 — Task 0(0.1-0.4) audit output for `.kiro/specs/mobile-pet-companion-redesign/`
> Methodology: read existing code only; no modifications. Findings drive task implementation order.

## TL;DR

**3 surprise wins, 2 surprise costs.**

| 维度 | spec 假设 | 实际现状 | 影响 |
|---|---|---|---|
| Android 系统级悬浮窗 | "Phase 1 新建 SystemOverlayService" | **`AndroidBackgroundWakeWordService.kt` 已经在用 TYPE_APPLICATION_OVERLAY,有现成 ball UI** | ⭐ **大利好** —— Task 13 工作量从"新建原生 service"降为"扩展现有 service" |
| Feature flag | "新建 `pet_companion_redesign_enabled`" | **`WorldEngineFeatureFlagService` 模式成熟可照搬** | ⭐ 利好 —— Task 0.3 直接复用 |
| activeInstance 多宠物切换 | "ActivePetPicker 新建" | **`MyAgentsScreen` 已 ship 完整 setActiveInstance(id) flow** | ⭐ 利好 —— Task 6.2 ActivePetPicker 是 MyAgentsScreen 的 BottomSheet 简化版 |
| 11 个 presence 主题订阅 | "扩展现有 4 个订阅到全部 11" | **手机端只订阅了 2 个(state + proactive),11 主题契约存在但 4 个新主题(wallet.delta / world-engine.* / skill.update)后端不存在** | ⚠️ **大开销** —— Task 8 + Task 18 + Task 21 都需要先在后端新增 4 个主题 |
| MPC sign-request 队列 | "Trust3 sheet 调用 createSignRequest / completeSignRequest API + signRequestId dedup" | **后端只有 signMessage(),没有 sign-request 队列模型** | ⚠️ **额外工作** —— Task 7 / Task 18 需要后端新建 sign-request 表 + 端点 |

净影响:Phase 1 工作量预估**少 2 周(Android overlay)+ 多 1 周(后端 presence/sign-request 新增)** = 净省 1 周。

---

## 0.1 — Presence socket subscriptions audit

### 11 个 `presence:pet.*` 主题契约(已 shipped, `shared/types/pet-presence.ts`)

```
PET_PRESENCE_TOPICS = {
  STATE                  → 'presence:pet.state'                  ✅ 后端 producer 已 ship (living-pet.service)
  SOUL_CHANGED           → 'presence:pet.soul.changed'           ✅ 后端 producer 已 ship (living-pet.service)
  SKIN_CHANGED           → 'presence:pet.skin.changed'           ✅ 后端 producer 已 ship (living-pet.service)
  PROACTIVE              → 'presence:pet.proactive'              ✅ 后端 producer 已 ship (pet-companion-engine)
  ENERGY                 → 'presence:pet.energy'                 ✅ 后端 producer 已 ship (pet-energy.service)
  ACHIEVEMENT_UNLOCKED   → 'presence:pet.achievement.unlocked'   ✅ 后端 producer 已 ship
  MEMORY_ADDED           → 'presence:pet.memory.added'           ✅ 后端 producer 已 ship (pet-memory-album.service)
  BREEDING_INVITED       → 'presence:pet.breeding.invited'       ✅ 后端 producer 已 ship (pet-breeding.service)
  BREEDING_HATCHING      → 'presence:pet.breeding.hatching'      ✅ 后端 producer 已 ship
  BREEDING_HATCHED       → 'presence:pet.breeding.hatched'       ✅ 后端 producer 已 ship
  SOCIAL_VISIT           → 'presence:pet.social.visit'           ✅ 后端 producer 已 ship (pet-social.service)
}
```

### 移动端**当前实际订阅**(`src/services/petPresence.ts` + 调用方)

只在 2 处订阅了 socket,且只用了 2 个主题:

| 文件 | 订阅主题 | 用途 |
|---|---|---|
| `src/services/petModeAdapters.ts` | `presence:pet.state` | emotion → mode mapping |
| `src/components/pet/MobilePetProactiveBanner.tsx` | `presence:pet.proactive` | proactive bubble banner |
| `src/components/PetProactiveToast.tsx` | (注释里说要订 proactive,实际未生效) | 待激活 |

**未订阅(但后端已 emit)**:soul.changed, skin.changed, energy, achievement.unlocked, memory.added, breeding.*, social.visit。
- → R8.1 spec 的"扩展订阅完整 11 主题"是**纯前端工作**,后端无需改动。
- → 但需注意:每个主题可能需要触发不同的 UI 反应(例如 social.visit 触发 `whisper` mode,具体行为已写在 R8.2-R8.3)。

### **Phase 1 需要新增的主题**(R8.1 / R12.2 spec 假设)

| 主题 | spec R 编号 | 后端现状 | 实施路径 |
|---|---|---|---|
| `presence:wallet.delta` | R6.7, R11 | ❌ **不存在** | 后端新增,在 mpc-wallet 的 transfer/receive flow 末加 emitDesktopSyncEvent |
| `presence:world-engine.battle-pending` | R12.7 | ❌ **不存在** | 后端新增,在 battle.service 的 createBattle/72h cron 加 emit |
| `presence:world-engine.asset.ready` | R12.10 | ❌ **不存在** | 后端新增,在 reconstruction.service 完成后加 emit |
| `presence:skill.update` | R13.10 | ❌ **不存在** | 后端新增,在 skill 升级时(skill-approval.service.ts 有 updatedAt 时间戳但没 broadcast)加 emit |

**4 个新主题的 producer 工作**:每个约 30 分钟(增加 `desktopSyncEventBus.emit({ event: 'presence:xxx', userId, payload })` + 类型契约更新到 `shared/types/pet-presence.ts`)。

**需要更新 `shared/types/pet-presence.ts`**:
- 在 `PET_PRESENCE_TOPICS` 加 4 个新 const(`WALLET_DELTA` / `WORLD_ENGINE_BATTLE_PENDING` / `WORLD_ENGINE_ASSET_READY` / `SKILL_UPDATE`)
- 加对应的 `PetXxxPayload` 接口
- 加到 `PetPresenceEventMap`

### 推荐 task 1.x 调整

原 task 1 包含 8.1(扩展订阅)只到客户端层。建议**新增 task 0.5**:

```
- [ ] 0.5 后端新增 4 个 presence 主题(P-9.1 wave 0)
  - [ ] 0.5.1 在 shared/types/pet-presence.ts 添加 WALLET_DELTA / WORLD_ENGINE_BATTLE_PENDING / WORLD_ENGINE_ASSET_READY / SKILL_UPDATE 4 个 topic + payload 类型
  - [ ] 0.5.2 wallet.delta producer:在 mpc-wallet 的 transfer 端点末 emit (~30min)
  - [ ] 0.5.3 world-engine.battle-pending producer:在 battle.service 的 createBattle / cron 加 emit (~30min)
  - [ ] 0.5.4 world-engine.asset.ready producer:在 reconstruction.service 完成后 emit (~30min)
  - [ ] 0.5.5 skill.update producer:在 skill-approval / skill-version-bump 加 emit (~30min)
```

---

## 0.2 — authStore.activeInstance audit

### 现状

`src/stores/authStore.ts` 定义:

```typescript
interface AuthState {
  activeInstance: OpenClawInstance | null;
  setActiveInstance: (instanceId: string) => void;
  addInstance / updateInstance / removeInstance: ...
}
```

`MyAgentsScreen.tsx` 已经实现:
- FlatList 列出 `user.openClawInstances`
- 点 card → `setActiveInstance(item.instanceId)` → navigate to AgentChat
- 这就是 R5 ActivePetPicker 的完整原型

### 推荐复用 path

Task 6.2 (PetDetailSheet ActivePetPicker) 直接:
1. 抽 `MyAgentsScreen` 的 list-rendering 函数 → 新文件 `src/components/companion/ActivePetPicker.tsx`(BottomSheet 版本)
2. 在 PetDetailSheet 顶部 ▾ 触发,present BottomSheet 50% 高度
3. 选中后 `setActiveInstance(id)` + `companionEvents.emit('active-pet-changed', { from, to })` + close BottomSheet

工作量:T6.2 从"新建组件"降为"重排 MyAgentsScreen 的 list 为 BottomSheet"。

---

## 0.3 — Feature flag scaffold

### 现状

`backend/src/modules/world-engine/feature-flag.service.ts` 已有完整模式:

- `WorldEngineFeatureFlagService.isFeatureEnabled(userId)` 方法
- 支持 `metadata: { rolloutPercentage, allowlist, denylist, rolloutStrategy: 'user_id_hash' }`
- 60s in-memory cache
- `WorldEngineFlagGuard` Nest guard 用法
- Seed 文件 `world-engine-flag.seed.ts`

### 推荐 task 0.3 实施

```typescript
// backend/src/modules/companion-redesign/feature-flag.service.ts(新建,完全克隆 world-engine pattern)
@Injectable()
export class CompanionRedesignFeatureFlagService {
  private static readonly FLAG_KEY = 'pet_companion_redesign_enabled';
  // ...rest copy-paste from WorldEngineFeatureFlagService
}
```

或者**更简单**:这个 flag 只控制前端 UI 渲染,不需要后端守门。可以:
- backend 不新建 service,直接 seed 一行 `pet_companion_redesign_enabled` 到 `admin_configs`
- 前端 `src/config/featureFlags.ts` 新建 `useCompanionRedesignEnabled()` hook,通过 `apiFetch('/admin/configs/pet_companion_redesign_enabled')` 拉取(路径已存在的 admin-config controller)
- 用 react-query stale-time 60s 缓存

**推荐方案**:**轻量前端 only** —— 因为 Phase 1 几乎所有改动是 UI 层,后端 R8.1 / R8.2 / Trust3 / remote-control / agentic-commerce 这些 backend 都是新模块,自然分离。1% cohort rollout 用 flag 的 metadata.rolloutPercentage + user_id_hash 即可。

工作量:Task 0.3 从"新建后端 service"降为"插一行 seed + 写一个 react-query hook"。

---

## 0.4 — Android SYSTEM_ALERT_WINDOW + 现有原生模块

### Manifest 现状

```
android/app/src/main/AndroidManifest.xml:                    declared ✅
android/app/src/debug/AndroidManifest.xml:                   declared ✅
android/app/src/debugOptimized/AndroidManifest.xml:          declared ✅
android/app/src/release/AndroidManifest.xml:                 (no separate manifest, inherits main)
```

### **重大利好** — `AndroidBackgroundWakeWordService.kt` 已实现完整 overlay 管线

`android/app/src/main/java/app/agentrix/claw/AndroidBackgroundWakeWordService.kt`:
- line 180: `class AndroidBackgroundWakeWordService : Service()`
- line 326: 已用 `WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY` 创建 overlay
- line 325: ballSize × ballSize 配置(完整 overlay ball UI)
- line 525-528: tap → `Intent.ACTION_VIEW + agentrix:// deeplink → MainActivity` flow 已实现
- 完整 lifecycle:`enqueueStart / enqueueRefresh / enqueueStop` static methods
- Foreground service notification (line 257) 已搭建

### 推荐 task 13 调整

**Task 13.1**(原"创建 SystemOverlayService.kt")改为:

```
- [ ] 13.1 提取 AndroidBackgroundWakeWordService 的 overlay logic 为通用 CompanionOverlayService
  - 抽 line 320-340 的 overlay window setup 到新类 `CompanionOverlayWindow.kt`
  - 创建 `CompanionOverlayService.kt`(新),重用 CompanionOverlayWindow + 添加宠物 sprite UI + 拖拽 + 长按
  - 保持 AndroidBackgroundWakeWordService 不动(它和 CompanionOverlayService 可以同时运行,但优先级:companion overlay > wake-word ball)
  - 当两个 service 同时启动时,只渲染 companion overlay,wake-word ball 背景运行不渲染 UI
```

工作量:从 1 周降为 2-3 天。

### 现有 ReactPackage 模式

`AndroidBackgroundWakeWordPackage.kt`(line 9)展示了 native module → RN bridge 标准模式。`CompanionOverlayPackage.kt`(T13.2)直接照搬即可。

`AgentrixWearDataLayerPackage.kt`(line 9)是另一个先例,确认这种模块化模式在仓库稳定。

---

## 风险点 + 推荐调整

### 后端工作量隐藏

原 spec 把 backend 新增工作分散在多个 task(T9.1 GET /pet/greet / T18.1 remote-control gateway / T0.5 隐含 4 个 presence)。**推荐**集中到一个新 backend module `companion-redesign`:

```
backend/src/modules/companion-redesign/
├─ companion-redesign.module.ts
├─ feature-flag.service.ts                   (或不要,见 0.3 推荐)
├─ controllers/
│   ├─ greet.controller.ts                   (T9.1: GET /pet/greet)
│   └─ sign-request.controller.ts            (T7: createSignRequest / completeSignRequest)
├─ services/
│   ├─ greet.service.ts
│   └─ sign-request.service.ts
├─ entities/
│   └─ sign-request.entity.ts                (新建表 sign_requests)
├─ migrations/
│   └─ 1795000000000-CreateSignRequests.ts
├─ events/
│   ├─ wallet-delta.emitter.ts               (T0.5.2)
│   ├─ world-engine-battle-pending.emitter.ts (T0.5.3)
│   ├─ world-engine-asset-ready.emitter.ts   (T0.5.4)
│   └─ skill-update.emitter.ts               (T0.5.5)
└─ remote-control/                           (T18.1)
    ├─ remote-control.gateway.ts
    ├─ remote-control.service.ts
    ├─ cross-device-token.service.ts
    └─ entities/
        └─ remote-control-session.entity.ts  (新建表 remote_control_sessions)
```

### 推荐新增 Task 0.5(merge 4 个 backend 新主题)

见上文 0.1 章节末尾。

### 推荐新增 Task 0.6(sign-request 队列模型)

```
- [ ] 0.6 后端新增 sign-request 队列模型(支持 Trust3SigningSheet dedup + Cross_Device 签名)
  - 创建 `sign_requests` 表(id uuid pk, userId, reason, metadata jsonb, status enum [pending/completed/cancelled/expired], signature text nullable, createdAt, completedAt, expiresAt)
  - controller: POST /v1/wallet/sign-request (创建) / GET /:id (查) / POST /:id/complete (提交签名) / POST /:id/cancel (60s timeout)
  - dedup logic:同一 idempotencyKey 24h 内查到 status=completed → 直接返回 cached signature
  - 复用 mpc-signer.service.ts.signMessage() 完成实际签名
```

### 整体 Phase 1 工时再评估

| Sprint | 原估 | 调整后 | 主因 |
|---|---|---|---|
| P-9.1 | 2 周 | 2 周 | 不变 + 加 0.5/0.6 后端 task 1.5 天 |
| P-9.2 | 2 周 | 1.5 周 | Trust3 后端复用 sign-request,工作量降 |
| P-9.3 | 2 周 | 1 周 | Android overlay 已有基础设施,工作量大幅降 |
| P-9.4 | 2-3 周 | 2 周 | 不变 |
| **合计** | **8-9 周** | **6.5-7.5 周** | -1.5 周 |

---

## 执行清单(给后续 task 使用)

立即可开始(不阻塞):
- ✅ T0.5(后端 4 个新 presence 主题 — 1.5 天)
- ✅ T0.6(后端 sign-request 队列模型 — 1.5 天)
- ✅ T1.1(@gorhom/bottom-sheet + expo-battery — 30min)
- ✅ T1.2(companionEvents 总线 — 1 天)
- ✅ T1.3(petMode 8 mode + transitions — 1 天)
- ✅ T2(navigation 重塑 — 2-3 天)

需先 audit 完才动:
- ⏳ T3+(浮球升级,依赖 T1 + T2)
- ⏳ T13(简化为"扩展现有 service",依赖 T0 完成)
- ⏳ T18(依赖 T0.6 sign-request)

延后到 P-9.4 末尾:
- T19(Agentic Commerce — 工作量适中,但依赖 T7 Trust3 → T0.6)
- T22(健康陪伴 — 可选)
- T24(发布)

---

## 已 verify 的事实(用于 task 0.x 验收)

✅ 11 个 `presence:pet.*` 主题契约已存在(`shared/types/pet-presence.ts`)
✅ `connectPetPresence` mobile 桥已 ship,加新主题只需扩展 handlers map
✅ `WorldEngineFeatureFlagService` 模式可照搬(`feature-flag.service.ts`)
✅ `admin_configs` 表 + cohort hash 算法已 ship
✅ `MyAgentsScreen` 已实现 `setActiveInstance(id)` flow
✅ Android `SYSTEM_ALERT_WINDOW` 已声明(main / debug / debugOptimized)
✅ `AndroidBackgroundWakeWordService` 已实现 TYPE_APPLICATION_OVERLAY + 完整 lifecycle + ball UI
✅ `AndroidBackgroundWakeWordPackage` + `AgentrixWearDataLayerPackage` 是 RN native module 模板先例
✅ `mpc-signer.service.ts.signMessage()` 已 ship,可作为 sign-request 后端实施基础

❌ 4 个新 presence 主题(wallet.delta / world-engine.* / skill.update)后端不存在 → T0.5 必做
❌ sign-request 队列模型不存在 → T0.6 必做
❌ Cross-device token 模型不存在 → T18 自带,无依赖问题
❌ `presence:device.list` API 不存在 → T6.3 跨端设备列表需要 fallback(只用 authStore 的 instances 数据)

---

**Generated**: 2026-05-22
**Action**: 进入 task 0.5 + 0.6(2 个新增的 backend pre-flight task),然后启动 P-9.1 wave 1。
