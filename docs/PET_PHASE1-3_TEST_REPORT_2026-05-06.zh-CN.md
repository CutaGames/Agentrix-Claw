# Agentrix 电子宠物系统 Phase 1-3 实测报告

日期：2026-05-06

说明：

- 本报告只记录本次实际在仓库里执行过的测试与编译验证。
- 所有结论以命令真实输出为准，不引用历史“已完成”口头结论。

## 实测结果总览

| 维度 | 结果 | 备注 |
|---|---|---|
| Backend Phase 1-3 关键测试 | 通过 | 26 suites / 331 tests |
| Mobile SDK 测试 | 通过 | 1 suite / 7 tests |
| Frontend pet/marketplace/embed 测试 | 通过 | 6 files / 32 tests |
| Desktop pet/Rive 映射测试 | 通过 | 3 files / 17 tests |
| Backend TypeScript 编译 | 通过 | `tsc -p tsconfig.build.json` 无报错 |
| Frontend TypeScript 编译 | 初始失败，修复后通过 | 初始 9 个错误，已修复 |
| Desktop TypeScript 编译 | 通过 | `tsc --noEmit` 无报错 |
| Root/mobile TypeScript 编译 | 通过 | `npm run typecheck:root` 无报错输出 |

## 实际执行命令

### 1. Backend Phase 1-3 测试矩阵

执行命令：

```powershell
Set-Location backend
npx jest src/modules/living-pet/living-pet.service.spec.ts \
  src/modules/living-pet/living-pet.broadcast.integration.spec.ts \
  src/modules/pet-soul-template \
  src/modules/pet-skin \
  src/modules/pet-gen-quota \
  src/modules/moderation \
  src/modules/marketplace-pet \
  src/modules/dmca --runInBand
```

结果：

- 26 suites 通过
- 331 tests 通过
- 关键覆盖：
  - Phase 1：`living-pet`、`pet-soul-template`、`pet-skin`
  - Phase 2：`pet-gen-quota`、`moderation`、`phase2-e2e.spec.ts`
  - Phase 3：`marketplace-pet` 全套、`phase3-e2e.spec.ts`、`dmca`

备注：

- 输出中出现的 Stripe transfer / webhook warn/error 均来自 mock 场景覆盖，不是测试失败。

### 2. Mobile SDK 测试

执行命令：

```powershell
npm test -- --runTestsByPath src/services/__tests__/mobilePetSdk.test.ts
```

结果：

- 1 suite 通过
- 7 tests 通过
- 覆盖：`listSouls`、`getSoul`、`switchSoul`、`activateSkin`、`getActiveSkinId`、`getPetState`

### 3. Frontend Phase 1/3 测试

执行命令：

```powershell
Set-Location frontend
npm test -- __tests__/PetSoulBadge.test.tsx \
  __tests__/petPublicPage.test.tsx \
  __tests__/marketplace.index.test.tsx \
  __tests__/marketplace.detail.test.tsx \
  __tests__/embedScript.test.ts \
  __tests__/embedScript.xss.test.ts
```

结果：

- 6 files 通过
- 32 tests 通过

覆盖：

- Phase 1：公开档案页、Soul badge
- Phase 3：Marketplace 列表页、详情页、embed SDK、安全/XSS

修复记录：

- 初次执行时出现 jsdom teardown 的 iframe 递归错误，已修复测试清理逻辑后复跑通过。

### 4. Desktop 测试

执行命令：

```powershell
Set-Location desktop
npm test -- src/test/petSoulSdk.test.ts \
  src/test/SoulPicker.test.tsx \
  src/test/riveEmotionMap.test.ts
```

结果：

- 3 files 通过
- 17 tests 通过

覆盖：

- `petSoulSdk`
- `SoulPicker`
- Rive 情绪映射契约

修复记录：

- 初次执行存在 React `act()` warning，已修复测试事件派发方式后复跑通过。

## 编译/类型检查结果

### Backend

执行命令：

```powershell
Set-Location backend
npx tsc -p tsconfig.build.json --incremental false
```

结果：通过，无输出。

### Frontend

执行命令：

```powershell
Set-Location frontend
npx tsc --noEmit
```

首次结果：失败，共 9 个错误。

问题位置：

- `frontend/__tests__/marketplace.detail.test.tsx`
- `frontend/__tests__/marketplace.index.test.tsx`
- `frontend/pages/marketplace/pets/[id].tsx`

修复后结果：通过，无输出。

### Desktop

执行命令：

```powershell
Set-Location desktop
npx tsc --noEmit
```

结果：通过，无输出。

### Root / Mobile

执行命令：

```powershell
npm run typecheck:root
```

结果：通过，无报错输出。

## 本次修复的具体问题

1. `frontend/__tests__/embedScript.test.ts`
   - 补充 jsdom iframe 清理，消除 teardown 假失败。

2. `frontend/__tests__/embedScript.xss.test.ts`
   - 同步补充清理逻辑，避免 iframe 残留导致的递归 `window.close`。

3. `desktop/src/test/SoulPicker.test.tsx`
   - 将自定义事件派发包入 `act()`，去掉 React 测试 warning。

4. `frontend/__tests__/marketplace.index.test.tsx`
   - 为测试夹具补显式类型，修复 `tsc` 错误。

5. `frontend/__tests__/marketplace.detail.test.tsx`
   - 为测试夹具补显式类型，修复 `tsc` 错误。

6. `frontend/pages/marketplace/pets/[id].tsx`
   - 为 bids fallback 补充显式 `Bid[]` 类型，修复 `tsc` 错误。

## 无法在本次实测中证明的项

以下项当前仓库里没有现成自动化脚本或真实 benchmark，因此本次不能给出“已通过”的结论：

- Phase 1：桌面与移动之间真实 5 秒内同步
- Phase 1：离线后重连同步
- Phase 2：Rive 多端真实情绪切换 < 200ms
- Phase 2：跨端 Rive 同步 < 1s
- Phase 3：真实多端 Marketplace 交易 UI E2E
- Phase 3：Web VRM 渐进加载性能

## 实测结论

- 可以确认：Phase 1-3 的后端核心逻辑、Web 公开页/Marketplace/embed、桌面与移动基础 SDK 层整体是可测且当前为绿的。
- 不能确认：Phase 1-3 已经完成所有跨端 E2E 与性能验收项。
- 本次修复后，测试与类型检查基线比审计前更干净，报告可信度已提升。
