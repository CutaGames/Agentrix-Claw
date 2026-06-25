# Sprint P-6 — Pet Forms Mobile Mirror ✅ shipped 2026-05-22

> **状态**: 5 个 phase 全部 shipped。
> **依赖**: 桌面端 13 形态系统已稳定 (v0.3.9 + `docs/PET_FORMS_DESIGN_v5.zh-CN.md`)
> **目标**: 把 13 形态系统镜像到 React Native(Expo SDK 54)移动端

## 是的,把宠物这套东西在移动端也呈现

回到你的问题:"原来有设计 mobile mirror,是把宠物这套东西在移动端也呈现吗?" —— **正是如此**。

桌面端做的核心(13 形态 + PetMode 总线 + 跨窗口同步 + sprite 渲染)
都是平台无关的逻辑,移动端**只需要换渲染层 + IO 层**就能复用。

## 当前移动端已有的部分

- `assets/pets/sprites/default/*.png` —— **13 张 sprite 已经全部就位**
  (桌面端 ETL pipeline 同时输出到桌面 + 移动两个目录)
- `src/screens/PetCompanionScreen.tsx` —— 当前是单独的桌宠**全屏页面**,
  不是全局浮层
- `src/services/petMode.ts` —— **不存在**,目前只有桌面端 `desktop/src/services/petMode.ts`
- 全局浮球(`GlobalFloatingBall.tsx`)已经存在,但渲染抽象的紫色球,
  没接形态系统

## 移动端 vs 桌面端形态对照

| # | sprite | 桌面端触发 | 移动端等效触发 | 适用 |
|---|---|---|---|---|
| 1 | idle | 默认 | 默认 | ✅ |
| 2 | walk | wander 引擎 | App 内导航切换页面时短暂显示 | ✅ |
| 3 | sit | wander rest | 长时间停留某页面 | ✅ |
| 4 | sleep | 10min 无操作 | App 后台 / 锁屏 | ✅ |
| 5 | jump | 随机 | AXP 涨级时庆祝 | ✅ |
| 6 | eat | 喂食按钮 | 同 | ✅ |
| 7 | listen | 长按 / 唤醒词 | 长按浮球 / 系统语音 | ✅ |
| 8 | talk | AI 流式回复 | AgentChatScreen 流式 | ✅ |
| 9 | pro-thinking | Pro Mode | 移动端**没有 Pro Mode**,降级到 talk | ⚠️ 降级 |
| 10 | pro-typing | Pro Mode 长输出 | 同上,**降级到 talk** | ⚠️ 降级 |
| 11 | pro-done | turn 完成 | turn 完成 | ✅ |
| 12 | cu-mouse | Computer Use | 移动端**无 CU**,**移除** | ❌ N/A |
| 13 | alert | 高风险审批 | 同(remote approval push) | ✅ |

**移动端实际只用 11/13 形态**,#12 完全移除,#9-10 降级到 #8(talk)。

## P-6 实施计划

### 阶段 6.1 — 基础架构 ✅ shipped 2026-05-22

- [x] `src/services/petMode.ts` — RN-flavored bus,纯 JS Set listeners,
  无 Tauri 广播;`computer-use` 自动转 `idle`;`thinking`/`typing` resolve
  到 `talk` sprite(没有 Pro Mode)
- [x] `src/components/PetSpriteImage.tsx` — outer View overflow:hidden +
  inner Image translateX 帧切换;非 loop sprite(jump / pro-done)hold 末帧
  + 触发 `onActionComplete`
- [x] `SPRITE_SPECS` 内嵌(没移到 shared/,避免跨 package import 折腾)

### 阶段 6.2 — GlobalFloatingBall 接形态 ✅ shipped 2026-05-22

- [x] subscribe PetMode bus,本地 state 跟随
- [x] 替换 "AX" 文字 mark 为 `PetSpriteImage` (BALL_SIZE - 8)
- [x] capsule 模式 brand slot 改用 28×28 sprite
- [x] cross-wire 现有 ballState ↔ petMode,legacy 调用路径不破坏
- [ ] 光晕颜色按 mode 切换 — deferred(光晕仍跟 ballState,真机看不到混淆再补)

### 阶段 6.3 — 触发源接入 ✅ shipped 2026-05-22

- [x] AgentChatScreen 流式 → `setPetMode('speaking')` / 完成 → `setPetMode('done', ttl 1200)`
- [x] AXP 涨级 → `celebratePet('axp-level-up', 1500)` (PetTapGameModal `level_up=true`)
- [x] 系统语音 / 唤醒 → `setPetMode('listening')` (`SpeechWakeWordService` 已调
  `setBallState('listening')`,通过 cross-wire 间接覆盖)

### 阶段 6.4 — 联动桌面端(后端) ✅ shipped 2026-05-22

- [x] `src/services/petModeAdapters.ts` — `bootPetModeAdapters({ token, deviceId })`
  在 App.tsx 登录后启动 socket,把 `presence:pet.state` payload 的 `emotion`
  通过 `mapEmotionToMode` 翻译成 `PetMode` 推到总线。
  设计原则:**本地动作优先**(emotion 仅在 `idle` 时生效),避免聊天进行中被
  emotion 抢回到 sleep。
- [x] DeviceEventEmitter `presence:approval:wrist-trigger` → `setPetMode('approval', ttl 4000)`

### 阶段 6.5 — 测试 + 文档 ✅ shipped 2026-05-22

- [x] vitest/jest 单测 — `src/services/__tests__/petMode.test.ts` 8 + `petModeAdapters.test.ts` 7 = 15/15 通过
- [x] Maestro E2E — `.maestro/44-mobile-pet-forms.yaml` (sprite testID 挂载断言 + 3 张截图)
- [x] 用户手册 — `docs/USER_MANUAL_MOBILE_PETS.zh-CN.md`(中文,跨平台对照表 + emotion 映射表)

## 总工时

预计 6 天 — 实际 6.1/6.2/6.3 主体在 1 天内完成。剩余 6.3 余项 + 6.4 + 6.5
预计 2-3 天补完。

## 验证

- `npx jest src/services/__tests__/petMode.test.ts` → 8/8 通过
- `npx tsc --noEmit` → P-6 surface (petMode / PetSpriteImage /
  GlobalFloatingBall / AgentChatScreen / App.tsx) 全部 type 干净。
  仓库其他位置已存在的 World Engine routing / HomeScreen 错误是预存的,
  与 P-6 无关。
- 13 个 sprite PNG 全部在 `assets/pets/sprites/default/` 就位 (`cu-mouse.png`
  存在但 `SPRITE_SOURCES` 故意不引用)。

## 不做的事(明确范围)

- ❌ Mobile **不**做 Pro Mode(产品定位:Pro Mode = Desktop only)
- ❌ Mobile **不**做 Computer Use(系统级 API 不可用)
- ❌ Mobile **不**做 wander engine(浮球永远在用户拖到的位置,不漫游)
- ❌ Mobile **不**做小窗口/系统级浮窗(Android `SYSTEM_ALERT_WINDOW`
  申请要审核,iOS 完全不可能)— 浮球永远在 App 内
