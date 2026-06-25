# 移动端宠物系统 Audit + Sprint Q1 修复记录

> 日期：2026-05-30 · 范围：移动端（React Native + Expo SDK 54）宠物/陪伴系统
> 基线：P-9 Companion Redesign Phase 1（`198b04496`，2026-05-23 ship 到 0% 灰度）
> 关联记忆：`memories/repo/companion-ball-dead-fix-sprint-q1-2026-05-30.md`

## 一、总体完成度

P-9 重塑在**架构和后端**上完成度高（24/24 主任务，后端 8 endpoint + 2 migration 全上生产，330/330 jest 绿）。但从"**用户能在真机跑通宠物全流程**"口径看，实际约 **65%**，且存在多处会导致运行时崩溃 / 体验"死掉"的硬伤。

| 维度 | 完成度 | 说明 |
|---|---|---|
| 后端契约 + presence 总线 | ✅ ~95% | 11 topics、sign_requests、greet、cross-device 全上生产 |
| 浮球 / 8-mode / 事件总线 | 🔴 实测"死的" | 代码在，但真机 mount 抛错被吞 → 用户看到静态 🦊 兜底球 |
| 4-tab IA 重构 | 🟠 ~70% | IA 搭好，但 flag 形同虚设 + legacy 屏幕成孤儿 |
| 对话气泡 ConversationBubble | 🟠 ~55% | 仅 launcher，未共享 message state |
| Trust3 签名 sheet | ✅ ~85% | 全链路通，PIN fallback 部分 |
| 宠物业务屏（衣柜/灵魂/繁育/玩乐） | 🔴→✅ Q1 修复 | 屏幕存在但脱挂，点击即崩 → Q1 已 re-home |
| Sprite 渲染 | 🟠 ~60% | PNG sprite 稳；Rive 占位 gradient；仅 default 族群打包 |
| Native 在场层 | 🔴 ~20% | Live Activity / Overlay native code 全留 Phase 2 |
| E2E 测试真实性 | 🔴 ~40% | 多数 Maestro flow 用旧 IA 标签 + `optional:true` 假绿 |

## 二、浮球"死掉"根因（用户头号反馈）

用户现象：浮球形象不是默认灵狐、无法移动、点击无反应、无萌宠形态变化。

**根因 1：单一 ErrorBoundary 吞掉整棵 companion 子树。**
`CompanionLayer` 原本把 浮球 + 4 个 bottom-sheet + 3 个 capsule 包在**同一个** `CompanionErrorBoundary` 里。任一 sheet 在 mount 抛错（如 @gorhom/bottom-sheet v5 ⇄ reanimated worklet），boundary 就把**整棵子树**（含健康的浮球）换成 `CompanionFallbackBall`——一个静态 `🦊` emoji、固定屏角、不可拖、点击只导航。这与用户描述**完全吻合**。
> 2026-05-30 上一轮已确认真机看到 🦊 兜底球（`memories/repo/world-engine-quickscan-timeout-fix-2026-05-29.md`），但真正抛错的子组件一直没定位。

**根因 2：legacy 浮球冷启动就 minimized + 停在屏外。**
`GlobalFloatingBall` 初始 `isMinimized = true`，位置 `x = screenW - 18`（只露 18px），首次点击只是"展开"，8 秒后又自动缩回。即便不崩，也"看起来死的"。

## 三、Sprint Q1 已修内容（本次）

### 浮球修复
1. **拆分 ErrorBoundary（核心修复）**：每个 companion 子组件各自 `IsolatedBoundary`；浮球用专门的 `BallBoundary`——若浮球子树 mount 抛错，**回退到可见可用的 `CompanionFallbackBall`**（真实 idle 灵狐 sprite + 点击进 World + 长按开 PetDetailSheet），而不是连累整层或留空。任一 sheet 崩溃再也无法波及浮球。
2. **浮球冷启动可见**：`isMinimized` 初始改 `false`，位置改 `screenW - BALL_SIZE - EDGE_MARGIN`（完整在屏内），首屏即可见、可点、可拖。
3. **PetSpriteImage 加固**：未知/缺失 sprite key 或 `require()` 返回 undefined 时降级到 `idle`、再降级到透明占位，**绝不抛错**（这是浮球 mount crash 的主嫌之一）。
4. **兜底球升级**：渲染真实灵狐 sprite 而非通用 emoji；🦊 仅作为 sprite 也渲染失败时的最末兜底。

### Sprint Q1（audit P0）
5. **孤儿宠物屏 re-home（T6.7 完成）**：`WardrobeScreen`/`SoulPickerScreen`/`BreedScreen`/`PetPlaygroundScreen`/`SkinMarketplaceScreen`/`MemoryManagementScreen` 注册进 `MeStackNavigator`（路由名 `PetWardrobe`/`SoulPicker`/`PetBreed`/`PetPlayground`/`PetSkinMarketplace`/`MemoryManagement`），并加进 `MeStackParamList`。
6. **PetDetailSheet 动作网格修复**：衣柜/灵魂/繁育/玩乐/记忆 改为经 `Main > Me > <screen>` 导航（此前指向未注册路由 → 运行时崩溃；legacyRouteTable 并未覆盖，已核实）。
7. **喂食接真实 API**：🍖 改调 `POST /v1/pet/intimacy { xp:5 }`（新增 `feedPet()` in `mobilePetSdk.ts`），此前只 emit mode-change。喂食/打招呼**就地执行**不关闭 sheet。
8. **re-home 屏内部导航名修正**：WardrobeScreen → `PetSkinMarketplace`/`PetBreed`；BreedScreen → `PetWardrobe` + `Main>World>PetCreator`。
9. **新增 Maestro** `.maestro/48-companion-action-grid.yaml`：逐个点击 8 个动作格，断言不崩 + 落到正确屏。

## 四、仍待处理（未做，已标记）

- **P0：`isCompanionRedesignEnabledSync()` 是死标志**——`src/` 内零调用者，`RootNavigator` 无条件挂载 4-tab IA，0% 灰度在客户端无效。需产品决策：放弃 legacy 回退（删 flag + 悬空类型）或恢复门控。
- **浮球真机 mount 抛错根因未定位**——需新 APK 带 `globalThis.__companionBallError` / `__companionChildErrors` 回传后确认。本次修复保证无论谁抛错都有可用浮球，但理想是消除抛错本身。
- **babel plugin 存疑（未验证）**——stack 是 reanimated@4 + worklets@0.5 + newArch，`babel.config.js` 仍用废弃的 `react-native-reanimated/plugin`。Reanimated 4 文档要求迁到 `react-native-worklets/plugin`。本地 node_modules 是 stub 无法 build 验证；但近期 APK（build #341-344）能正常出包运行，说明 bundler 健康，暂不动。
- **P1**：ConversationBubble 仅 launcher（T5.2/5.4）；formVariant work/journey 永不自动触发（硬编码 false）；clan 类型双轨（`A..F` vs `A_office..F_family`）。
- **P2**：Rive 渲染占位 gradient；仅 default 族群 sprite 打包；Native 在场层全缺；Maestro 旧 flow 假绿。
- **遗留孤儿**：`PetCompanionScreen.tsx` / `NfcRedeemScreen.tsx` 仍未注册且持旧导航名——今日无害（不会 mount），单独清理。

## 五、验证状态

- 所有改动文件 getDiagnostics 干净。
- **本地无法跑 tsc/jest**（Windows checkout 的 node_modules 是 stub，真实安装在 WSL）。需在真实 build 环境（WSL）跑 `npx tsc --noEmit` + jest + APK build 后真机验证。

## 六、改动文件清单

- `src/components/companion/CompanionLayer.tsx`（BallBoundary + 逐子 IsolatedBoundary + sprite 兜底）
- `src/components/GlobalFloatingBall.tsx`（冷启动可见 + 在屏内）
- `src/components/PetSpriteImage.tsx`（sprite 加固，永不抛错）
- `src/components/companion/PetDetailSheet.tsx`（动作网格导航 + 真实喂食）
- `src/services/mobilePetSdk.ts`（`feedPet()`）
- `src/navigation/MeStackNavigator.tsx` + `types.ts`（re-home 6 屏）
- `src/screens/pet/WardrobeScreen.tsx`、`BreedScreen.tsx`（内部导航名）
- `.maestro/48-companion-action-grid.yaml`（新增）
