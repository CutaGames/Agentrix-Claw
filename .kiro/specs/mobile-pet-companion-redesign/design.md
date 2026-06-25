# Design Document — Mobile Pet Companion Redesign

> 配套 `requirements.md` v2(2026-05-22 最终版,12 个 R)。本文档把 R1–R12 落地为可实施的架构图、组件树、数据流、文件改动清单、Sprint 路线、回滚方案。

## Overview

### 设计目标(从 requirements 提炼)

1. **宠物 = App 化身**:浮球承载产品品牌,SplashScreen / 通知 / Live Activity / Wallet Capsule 全部呈现宠物 sprite
2. **简单 > 强大**:4 tab 极简 IA + 浮球双手势(单击对话 / 长按全景)+ BottomSheet 拇指交互区,不引入新菜单层级
3. **签名权陪伴一体**:Trust3_Signing_Sheet 把所有 L2 高风险确认收敛到浮球
4. **跨端真正一体**:订阅完整 `presence:pet.*` + 浮球同步 sprite + 远程控制
5. **本地优先 / 云端兜底**:沿用已 shipped `mobileLocalMultimodalRouting.service`,对话气泡显示路由
6. **不破坏现有架构**:复用 `desktopSyncEventBus / mpc-wallet / pet-companion-engine / world-engine` 等已 shipped 模块,仅新增 UI 层与跨端控制后端 API

## Architecture

### 高层架构图(文字版)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           Mobile Pet Companion v2                        │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────┐         │
│  │  CompanionLayer(全局,跨 tab)                              │         │
│  │  ┌──────────────────────────────────────────────────────┐  │         │
│  │  │  Companion_Ball ← PetMode 总线 ← presence:pet.*     │  │         │
│  │  │  ↓ 单击  ↓ 长按  ↓ 右滑  ↓ 拖拽  ↓ 自动胶囊         │  │         │
│  │  └──┬─────────┬───────┬───────┬──────┬────────────────┘  │         │
│  │     │         │       │       │      │                    │         │
│  │     ▼         ▼       ▼       ▼      ▼                    │         │
│  │  Convers   PetDetail  Camera  (移   WalletCapsule        │         │
│  │  ationBu   Sheet      →Convo  开)   ApprovalAlert        │         │
│  │  bble      (85%)      Bubble        Trust3SigningSheet   │         │
│  │  (65%)                              VoiceGreetCapsule    │         │
│  └────────────────────────────────────────────────────────────┘         │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────┐         │
│  │  Tab Bar(4 tab)                                            │         │
│  │  🌍 World   🔮 Summon   🎪 Plaza   👤 Me                   │         │
│  │  ↓ 浮球     (无浮球)    ↓ 浮球     ↓ 浮球                  │         │
│  └────────────────────────────────────────────────────────────┘         │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────┐         │
│  │  全局 Modal(Stack 顶层)                                    │         │
│  │  🔔 Inbox    📷 GlobalScan                                 │         │
│  └────────────────────────────────────────────────────────────┘         │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────┐         │
│  │  Ambient Presence(出 App 的在场感)                          │         │
│  │  ┌─ iOS ───────────────┐  ┌─ Android ───────────────────┐ │         │
│  │  │ Live Activity       │  │ SYSTEM_ALERT_WINDOW(已申请) │ │         │
│  │  │ 灵动岛               │  │ 桌面级悬浮浮球               │ │         │
│  │  │ 锁屏 widget          │  │ Material You widget         │ │         │
│  │  │ 通知 large icon     │  │ Themed Icons                │ │         │
│  │  └────────────────────┘  └────────────────────────────┘ │         │
│  └────────────────────────────────────────────────────────────┘         │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────┐         │
│  │  Backend(已 shipped,本 spec 仅新增 2 个轻量 API)           │         │
│  │  desktopSyncEventBus → presence:pet.* (10 主题)             │         │
│  │  mpc-wallet (Trust 3 签名) / pet-companion-engine (LLM)     │         │
│  │  living-pet (emotion/intimacy/skin/soul/social)             │         │
│  │  world-engine (扫描/战斗/副本/Marketplace)                  │         │
│  │  ★ 新增:remote-control gateway(R8 跨端控制)              │         │
│  │  ★ 新增:agentic-commerce 限额校验 service(R7)            │         │
│  └────────────────────────────────────────────────────────────┘         │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## Data Models

### 模块依赖图

```
┌─────────────────┐  subscribe  ┌──────────────────┐
│ presence:pet.*  │────────────▶│ companionEvents  │ (新建,中央事件总线)
│ (10 主题)       │             │ Service          │
└─────────────────┘             └────────┬─────────┘
                                         │ broadcast
                  ┌──────────────────────┼──────────────────────┐
                  ▼                      ▼                      ▼
         ┌────────────────┐    ┌──────────────────┐   ┌──────────────────┐
         │ petMode bus    │    │ activePetStore   │   │ ambientPresence  │
         │ (已 shipped)   │    │ (新建,基于      │   │ Service(新建)    │
         │ + 扩展 8 mode  │    │  authStore活动) │   │  iOS LiveActivity│
         └────────┬───────┘    └────────┬─────────┘   │  Android Overlay │
                  │                     │             └────────┬─────────┘
                  └─────────┬───────────┘                      │
                            ▼                                   ▼
                  ┌──────────────────┐                ┌──────────────────┐
                  │ Companion_Ball   │                │ Lock Screen Pet  │
                  │ (升级现有        │                │ (新组件)         │
                  │  GlobalFloating  │                └──────────────────┘
                  │  Ball.tsx)       │
                  └──────┬───────────┘
                         │ on user gesture
                         ▼
            ┌────────────────────────────────────────┐
            │ BottomSheet 层(全局 SheetProvider)     │
            │  ┌──────────────────────────────┐     │
            │  │ ConversationBubble (单击)    │     │
            │  ├──────────────────────────────┤     │
            │  │ PetDetailSheet (长按)        │     │
            │  ├──────────────────────────────┤     │
            │  │ Trust3SigningSheet (高风险)  │     │
            │  ├──────────────────────────────┤     │
            │  │ SkillInstallCard (装 skill)  │     │
            │  └──────────────────────────────┘     │
            └────────────────────────────────────────┘
```

### 关键术语 → 代码位置映射

| spec 术语 | 文件路径 | 状态 |
|---|---|---|
| `Companion_Ball` | `src/components/GlobalFloatingBall.tsx` | 升级现有 |
| `Companion_Mode` 8 模式 | `src/services/petMode.ts` | 扩展现有 |
| `Conversation_Bubble` | `src/components/companion/ConversationBubble.tsx` | **新建** |
| `Pet_Detail_Sheet` | `src/components/companion/PetDetailSheet.tsx` | **新建** |
| `Trust3_Signing_Sheet` | `src/components/companion/Trust3SigningSheet.tsx` | **新建** |
| `Active_Pet` | `authStore.activeInstance`(已支持) | 复用,UI 同步 |
| `Wallet_Capsule` | `src/components/companion/WalletCapsule.tsx` | **新建** |
| `Approval_Alert` | `src/components/companion/ApprovalAlertCapsule.tsx` | **新建** |
| `Voice_Greet` | `src/components/companion/VoiceGreetCapsule.tsx` | **新建**(后端 LLM 已 shipped) |
| `Skill_Install_Card` | `src/components/companion/SkillInstallCard.tsx` | **新建**(改造现有 SkillInstallScreen) |
| `Local_Multimodal_Routing` | `src/services/mobileLocalMultimodalRouting.service.ts` | 已 shipped,加 UI 标识 |
| `Cross_Device_Token` | `src/services/crossDeviceToken.service.ts` | **新建** |
| `Ambient_Presence` | `src/services/ambientPresence.service.ts` | **新建** |
| `System_Assistant_Bridge` | `src/services/systemAssistantBridge.ts` | **新建** |
| `Agentic_Commerce` | `src/services/agenticCommerce.service.ts` | **新建** |
| `Form_Variant` | `src/services/formVariant.service.ts` | **新建** |

### 数据模型与状态机

#### Companion_Mode 状态机(R1.13 表格的程序化版本)

```typescript
// src/services/petMode.ts(扩展现有)
export type CompanionMode =
  // 陪伴组(6 个)
  | 'companion'    // 默认陪伴 → idle sprite
  | 'vigil'        // 守候(emotion=tired/sleepy 或后端连失败) → sit sprite
  | 'journey'      // 同行(走路 ≥ 60s) → walk sprite
  | 'whisper'      // 私语(Voice_Greet / missed_you) → talk sprite 4s
  | 'slumber'      // 安睡(Quiet_Hours 或 night variant) → sleep sprite
  | 'nudge'        // 提醒(Approval / 高优先级通知) → alert sprite
  // 工作组(2 个)
  | 'signing'      // 签名中(Trust3 sheet 展开) → alert + 紫脉冲边框
  | 'working';     // 工作模式(Form_Variant=work) → sit / talk

// 转换矩阵(简化版,详见 src/services/petMode.transitions.ts)
const TRANSITION_RULES: TransitionRule[] = [
  // 高优先级:用户主动操作 + 锁定模式
  { from: '*', to: 'signing', trigger: 'trust3_sheet_open', priority: 100 },
  { from: 'signing', to: '*', trigger: 'trust3_sheet_closed', priority: 100 },
  // 中优先级:外部事件
  { from: '*', to: 'nudge', trigger: 'approval_high_risk', priority: 80 },
  { from: '*', to: 'whisper', trigger: 'voice_greet | missed_you', priority: 70, ttlMs: 4000 },
  { from: '*', to: 'journey', trigger: 'health_walking_60s', priority: 60 },
  // 低优先级:emotion 推送(local_action_wins)
  { from: 'companion', to: 'vigil', trigger: 'emotion_tired_sleepy', priority: 30 },
  { from: 'companion', to: 'slumber', trigger: 'quiet_hours_started', priority: 50 },
  // 默认回退:回到 companion(用户活跃时)或 working(work variant)
  { from: '*', to: 'companion', trigger: 'fallback', priority: 0 },
];

// Local_Action_Wins:用户在 5s 内有触屏 / 滚动 / 输入 → 抑制低优先级转换
function shouldSuppressTransition(rule: TransitionRule, lastUserActionMs: number): boolean {
  if (rule.priority < 50 && Date.now() - lastUserActionMs < 5000) return true;
  return false;
}
```

#### CompanionEvents 中央事件总线(新建)

```typescript
// src/services/companionEvents.service.ts
export type CompanionEvent =
  | { type: 'mode-changed'; from: CompanionMode; to: CompanionMode; source: string }
  | { type: 'active-pet-changed'; from: string | null; to: string }
  | { type: 'wallet-delta'; delta: number; currency: 'USDC' | 'AXP' | 'BTC' }
  | { type: 'approval-incoming'; approvalId: string; risk: 'L0' | 'L1' | 'L2' | 'L3' }
  | { type: 'voice-greet'; scenario: 'morning' | 'evening' | 'comeback' | 'milestone' | 'manual'; text: string }
  | { type: 'cross-device-event'; sourceDevice: string; eventType: PetPresenceTopic; payload: unknown }
  | { type: 'world-engine-event'; kind: 'asset-ready' | 'battle-pending' | 'asset-bought'; assetId?: string }
  | { type: 'skill-update'; skillId: string }
  | { type: 'agentic-commerce'; action: 'executed' | 'blocked' | 'over-limit'; amount?: number }
  | { type: 'trust3-signing-request'; signRequestId: string; reason: string; metadata: SignMetadata };

export const companionEvents = createEventBus<CompanionEvent>();
// 所有 UI 组件订阅这一个 bus,而不是直接订阅 socket / store / 其他细节。
```



## Components and Interfaces

### CompanionLayer 全局挂载点

App.tsx 改造重点(对应 R11.7-11.10):

```typescript
// App.tsx(改造后骨架)
export default function App() {
  return (
    <SafeAreaProvider>
      <AppErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <BottomSheetModalProvider>  {/* @gorhom/bottom-sheet 全局 provider */}
            <NavigationContainer ref={navigationRef} linking={linking}>
              <StatusBar style="light" />
              <AppNavigator />            {/* RootNavigator → MainTabNavigator */}

              {/* 全局 toast / banner(已 shipped 保留) */}
              <AxpToastHost />
              <MobilePetProactiveBanner />

              {/* ★ 新增:CompanionLayer ★
                  必须在 NavigationContainer 内部、Tab 之外的 root scope,
                  才能跨 tab 持续存在又能调用 useNavigation()。
                  通过 portal 挂到 root,而不是 sibling-of-NavigationContainer
                  (后者在 Phase C v0.4.6 验证过会崩溃)。 */}
              <CompanionLayer navigationRef={navigationRef} />
            </NavigationContainer>
          </BottomSheetModalProvider>
        </QueryClientProvider>
      </AppErrorBoundary>
    </SafeAreaProvider>
  );
}
```

CompanionLayer 内部组件树:

```typescript
// src/components/companion/CompanionLayer.tsx(新建)
function CompanionLayer({ navigationRef }) {
  const currentRoute = useCurrentRouteName(navigationRef);
  const showBall = ['World', 'Plaza', 'Me'].includes(currentRoute) // R1.1-R1.2
                  && !['AgentChat', 'VoiceChat', 'ClawSettings'].includes(deepRoute);
  const lowPower = useLowPowerMode();
  const { activePet } = useActivePet();

  return (
    <>
      {/* 浮球本体(R1):跨 3 tab 持续存在,Summon Tab 隐藏 */}
      {showBall && (
        <CompanionBall
          activePet={activePet}
          lowPower={lowPower}
          onSingleTap={() => sheetRef.openConversation()}
          onLongPress={() => sheetRef.openPetDetail()}
          onRightSwipe={() => sheetRef.openCameraConversation()}
        />
      )}

      {/* BottomSheet 层(R2/R4/R6):全局 portal,根据 companionEvents 弹出对应 sheet */}
      <ConversationBubble ref={sheetRef.conversation} />
      <PetDetailSheet ref={sheetRef.petDetail} />
      <Trust3SigningSheet ref={sheetRef.trust3} />
      <SkillInstallCard ref={sheetRef.skillInstall} />

      {/* 浮球内置 transient overlay(无单独 sheet,直接画在浮球上) */}
      <WalletCapsule />
      <ApprovalAlertCapsule />
      <VoiceGreetCapsule />

      {/* iOS Live Activity / Android 系统级悬浮(R1.5/R1.6) */}
      <AmbientPresenceBridge />
    </>
  );
}
```

`sheetRef` 通过 `BottomSheetRef` 传递,各 sheet 用 `useImperativeHandle` 暴露 `present()` / `dismiss()` API,避免 props drilling。

### 核心组件 1:CompanionBall(升级现有 GlobalFloatingBall)

```typescript
// src/components/GlobalFloatingBall.tsx → 改名 src/components/companion/CompanionBall.tsx
interface CompanionBallProps {
  activePet: ActivePet;
  lowPower: boolean;
  onSingleTap: () => void;
  onLongPress: () => void;
  onRightSwipe: () => void;
  onUpSwipe?: () => void;       // 临时静音 30 分钟(R6.10 备用,Phase 1 可不接)
}

interface CompanionBallState {
  position: { x: number; y: number };  // 全局唯一(R1.3),挂在 companionLayoutStore
  mode: CompanionMode;                  // 来自 petMode 总线,8 个 mode
  capsuleType: 'none' | 'wallet' | 'approval' | 'voice-greet'; // 内置 transient 形态
  capsulePayload?: any;
  isMinimized: boolean;
  isLocked: boolean;                    // mode=signing 时 true,锁定不可拖
}
```

关键 effects:

```typescript
// 1. 订阅 petMode 总线 → 切换 sprite + 边框颜色
useEffect(() => subscribePetMode(setMode), []);

// 2. 订阅 companionEvents → 处理 wallet-delta / approval / voice-greet 等触发 capsule
useEffect(() => companionEvents.subscribe((evt) => {
  if (evt.type === 'wallet-delta') showCapsule('wallet', { delta: evt.delta, currency: evt.currency }, 3000);
  if (evt.type === 'approval-incoming') showCapsule('approval', { id: evt.approvalId }, 4000);
  if (evt.type === 'voice-greet') showCapsule('voice-greet', { text: evt.text }, 4000);
  if (evt.type === 'trust3-signing-request') {
    setLocked(true); // R1.11 浮球锁定
    bottomSheetManager.present('trust3', evt);
  }
}), []);

// 3. 拖动 + 边缘吸附(沿用现有 PanResponder 实现,加锁定支持)
const panResponder = useMemo(() => createPanResponder({
  onMove: !isLocked,
  onTap: onSingleTap,
  onLongPress: onLongPress,
  onRightSwipe: onRightSwipe,
}), [isLocked]);

// 4. Active_Pet 切换 → sprite 800ms 渐变(R5.3)
useEffect(() => {
  Animated.timing(petTransitionAnim, { toValue: 1, duration: 800, useNativeDriver: true });
}, [activePet.id]);

// 5. lowPower 模式 → 帧率 12 fps → 6 fps(R1.10)
const fps = lowPower ? 6 : 12;
```

视觉规格(R1.7 品牌一致):

- 默认尺寸:56×56pt(从 48 升)
- sprite 内嵌 48pt 内容区(留 4pt 边距 + 圆形剪裁 mask)
- 边框颜色随 mode 变化:
  - companion / vigil:紫色 `var(--accent-pet)`(默认)
  - whisper:渐变蓝 `#6C5CE7 → #a78bfa`
  - signing:紫色脉冲(2s 周期 alpha 0.4 → 1.0)
  - nudge:橙色脉冲 `#F59E0B`
  - slumber:深蓝静止
- 半隐藏:贴边 < 16pt 时只露 18pt,持续 8s 自动微缩
- Voice_Greet / Approval / Wallet capsule 触发时**强制展开**到 56pt + capsule 模式(R1.4)

### 核心组件 2:ConversationBubble(对话气泡 BottomSheet)

```typescript
// src/components/companion/ConversationBubble.tsx(新建)
interface ConversationBubbleProps {
  // 通过 forwardRef 暴露 present/dismiss API,不直接接 props
}

interface ConversationBubbleHandle {
  present(opts?: {
    autoActivateVoice?: boolean;  // 默认 true(单击浮球唤起时)
    autoOpenCamera?: boolean;     // 右滑浮球时 true
    initialPrompt?: string;       // 拍照默认 "这是什么?"
  }): void;
  dismiss(): void;
  expandToFull(): void;          // 上滑到 100% = 跳 Summon Tab
}
```

内部架构(关键:**复用 AgentChatScreen 现有 chat state**,通过 conversation id 共享):

```
ConversationBubble
├─ <BottomSheetModal snapPoints={['65%', '100%']}>
│  ├─ Header(40pt): 🐾 [pet name] · [mode label]   ✕   ⛶
│  ├─ RoutingBadge(右上): 🌐 云端 / 📱 本地  ← from mobileLocalMultimodalRouting
│  ├─ MessageList(scroll): 复用 AgentChatScreen 的 messages state
│  │   ├─ assistant streaming 气泡
│  │   ├─ user 气泡 + 多模态附件缩略图
│  │   └─ STT 实时草稿(transcriptPreview, 灰色)
│  ├─ AttachmentTray(可选 60pt): 已选附件预览 + 移除
│  └─ ComposerBar(60pt):
│      📷 拍照  📁 相册  🎤 录音  [TextInput]  🌐(长按切换路由)  ▶
└─ on snapPoint='100%' → navigation.navigate('Main', { screen: 'Summon' }) 同时 dismiss bubble
```

关键设计决策:

- **复用 useVoiceSession**:不重写 voice 逻辑,直接 import 现有 hook,避免重复维护
- **conversation id 共享**:Bubble 和 Summon Tab 用同一个 `conversationId`(基于 activePet + sessionId),底层 state 跨两个 UI 同步
- **路由可视化**:右上角 28pt 标识根据 `mobileLocalMultimodalRouting.resolveLocalTurnExecution()` 实时显示
- **右滑浮球开相机**:`onRightSwipe` 直接调用 `expo-image-picker.launchCameraAsync()` → 拿到 photo URI → `present({ autoOpenCamera:false, attachments:[{uri,kind:'image'}], initialPrompt:'这是什么?' })`
- **跨 sheet 不冲突**:Bubble 展开时如果触发 `trust3-signing-request`,Bubble 自动收到 65%(snap point 0),Trust3 sheet 在上层展开

### 核心组件 3:PetDetailSheet(长按宠物全景)

```typescript
// src/components/companion/PetDetailSheet.tsx(新建)
interface PetDetailSheetHandle {
  present(): void;
  dismiss(): void;
  expandSection(section: PetDetailSection): void; // 跳到全屏二级页
}

type PetDetailSection =
  | 'wallet' | 'skills' | 'cross-device' | 'companion-actions'
  | 'co-raising' | 'settings';
```

内部布局(垂直 ScrollView + 9 section,与 R4.2 一一对应):

```
PetDetailSheet
├─ <BottomSheetModal snapPoints={['85%']}>
│  ├─ HeroBlock(120pt):
│  │   ├─ 大头像 80×80 sprite(右上角 ▾ 切换宠物)
│  │   ├─ 名字 + Lv + emotion + XP 进度条 + energy %
│  │   └─ 切宠物 Picker(子 sheet 50% 高度,叠加上层)
│  │
│  ├─ StatusOverview(60pt):
│  │   ├─ "它在做什么"(基于 activePet.lastAction)
│  │   └─ 跨端活跃设备 emoji 横排 🖥️ 📱 ⌚ 👓
│  │
│  ├─ WalletCard(可展开):
│  │   ├─ Pet AgentAccount: USDC + AXP + BTC
│  │   ├─ 我的钱包入口 + 转账(→ Trust3SigningSheet)
│  │   └─ 它今日自主交易记录(Agentic Commerce)
│  │
│  ├─ SkillsCard(可展开):
│  │   ├─ 已装 Skills list(emoji + name + 上次使用)
│  │   └─ + 装新的(→ SkillInstallCard 叠加 sheet)
│  │
│  ├─ CrossDeviceCard(可展开):
│  │   ├─ 已配对设备 list(emoji + name + 在线 + 最后活跃)
│  │   ├─ "选目标设备" → 命令模板 → Trust3 签名 → 发送
│  │   └─ 跨端配对 → 跳 WalletConnect deeplink 流程(复用)
│  │
│  ├─ CompanionActionsGrid(4×2 grid):
│  │   🍖 喂食  🎙 打招呼  👕 衣柜  💫 灵魂
│  │   🧬 繁育  🧠 记忆  🎮 玩乐  ✨ 创造新宠物
│  │
│  ├─ CoRaisingEntry: 邀请朋友共养 → CoRaisingInviteScreen
│  │
│  └─ SettingsEntry: → CompanionSettingsScreen
└─ pull-down ≥ 30% → dismiss
```

关键设计决策:

- **Active_Pet 顶部下拉切换**(R5.2):点 ▾ 触发子 BottomSheet 50% 高度,展示 `user.openClawInstances`,选择后调 `authStore.setActiveInstance(petId)` + 触发 `companionEvents.emit('active-pet-changed', ...)`
- **section 展开 = 全屏深路径**(R4.4):某个 card 上向上滑或点"展开"button → `navigation.push()` 进入对应全屏 screen(钱包 → AssetsScreen, 技能 → MySkillsScreen, 跨端 → 新建 RemoteControlScreen)
- **mode 锁定**(R4.6):浮球 `mode === 'signing'` 时 PetDetailSheet 长按手势 disabled,防止 sheet 叠加冲突
- **night/slumber 模式**(R4.7):顶部显示提示横条"现在是深夜模式,陪伴动作已静音",喂食/打招呼按钮 disabled
- **VoiceOver 自动聚焦**(R4.8):present 后 0.5s focus 到 HeroBlock 顶部
- **无登录降级**(R4.9):未登录只显示 sprite + "请先登录" CTA,所有 section disabled
- **CompanionActionsGrid 分流**:
  - 喂食/打招呼:本地动作,直接调 `/v1/pet/intimacy` API,不跳屏
  - 衣柜/灵魂/繁育/记忆/玩乐:`navigation.push('PetWardrobe' / 'PetSoul' / ...)` 跳现有 PetStack screen
  - 创造新宠物:`navigation.navigate('Main', { screen: 'World' })` 跳 World Tab(R3.6)



### 核心组件 4:Trust3SigningSheet(签名底片)

```typescript
// src/components/companion/Trust3SigningSheet.tsx(新建)
interface Trust3SigningSheetHandle {
  present(req: SignRequest): void;
  dismiss(): void;
}

interface SignRequest {
  signRequestId: string;
  reason: 'wallet-transfer' | 'marketplace-purchase' | 'skill-install'
        | 'remote-control' | 'approval' | 'agentic-commerce-overlimit';
  metadata: {
    petId: string;
    summary: { from?: string; to?: string; amount?: string; gas?: string };
    risk: 'L0' | 'L1' | 'L2' | 'L3';
    riskExplanationZh: string;
    riskExplanationEn: string;
  };
  timeoutMs?: number;            // 默认 60000(R6.10)
  onConfirm: (signature: string) => Promise<void>;
  onCancel: () => void;
}
```

布局(R6.2):

```
Trust3SigningSheet
├─ <BottomSheetModal snapPoints={['70%']}>
│  ├─ Header(40pt): 🐾 [pet name] 见证签名   ✕
│  ├─ ActionSummary(可滚动):
│  │   ├─ 来自 → 接收方
│  │   ├─ 金额 + Gas 估算 + 风险等级 emoji
│  │   └─ 风险摘要文字(中英,基于 risk + LLM,Phase 1 用模板)
│  ├─ CountdownBar: 60s 进度条 + remaining seconds
│  └─ Actions:
│      [取消]  [🔐 Face ID / 指纹]
└─ on confirm: 调用 mpcWalletService.sign(signRequestId)
   → 成功:dismiss + companionEvents.emit('wallet-delta', ...) + Wallet_Capsule 反馈
   → 失败:Toast "签名失败,请重试" + sheet 保持
```

关键设计:

- **浮球锁定**(R1.11/R6.2):present 时 `companionEvents.emit('mode-changed', { to: 'signing' })`,浮球进入 `signing` 模式自动锁定 + 紫脉冲
- **生物识别降级**(R6.5):无 Face ID / 指纹 → 6 位 PIN(沿用现有 wallet PIN UI)
- **night 模式柔和**(R6.6):form variant=night 时 haptic 强度 light、TTS 提示音 30%
- **不记录 PII**(R6.11):voiceDiagnostics 只 log `{ reason, success, durationMs }`
- **已签去重**(R6.12):present 前 `useQuery` 查后端 `signRequestId` 状态,已签直接返回 cached signature

### 核心组件 5:WalletCapsule / ApprovalAlertCapsule / VoiceGreetCapsule

这三个是**浮球内置 transient overlay**,不是独立 BottomSheet,直接画在浮球上方。所有共用同一个组件骨架:

```typescript
// src/components/companion/CapsuleOverlay.tsx(基础组件)
interface CapsuleOverlayProps {
  visible: boolean;
  duration: number;             // ms,自动消散
  ballPosition: { x: number; y: number };
  emoji: string;
  text: string;
  textColor?: string;
  bgColor?: string;
  onPress?: () => void;
}
```

具体三个:

| Capsule | 触发 | 持续时间 | 内容 |
|---|---|---|---|
| `WalletCapsule` | `companionEvents:wallet-delta` | 3s | 💰 +$N USDC / -$N(绿/红) |
| `ApprovalAlertCapsule` | `presence:approval:wrist-trigger` / push approval | 4s + 自动重弹直到响应 | 🚨 待审批 N · "查看" |
| `VoiceGreetCapsule` | `pet-companion-engine` Voice_Greet | 4s | 🐾 [TTS 同句文字气泡] |

### 核心组件 6:WorldHubScreen(World Tab Root)

```typescript
// src/screens/world/WorldHubScreen.tsx(新建)
function WorldHubScreen() {
  const quotaQ = useQuery(['we-quota'], fetchWorldEngineQuota);
  const pendingBattlesQ = useQuery(['battles-pending'], fetchPendingBattles);
  const recentAssetsQ = useQuery(['recent-assets'], fetchRecentAssets);

  return (
    <ScrollView>
      {/* Top Banner(可滑卡片)*/}
      <SwipeableBanners>
        <QuotaBanner data={quotaQ.data} />
        <BattlePendingBanner battles={pendingBattlesQ.data} />
        <AssetReadyBanner assets={recentAssetsQ.data} />
      </SwipeableBanners>

      {/* 4 主 CTA grid(2x2)*/}
      <CTAGrid>
        <CTACard emoji="📷" title="扫描物体" longPressOptions={['Quick','Detail','Room']}
                 onPress={() => navigate('WorldEngineScanner', { mode: 'quick' })} />
        <CTACard emoji="🎒" title="我的资产库存" onPress={() => navigate('WorldAssetInventory')} />
        <CTACard emoji="⚔️" title={pendingBattlesQ.data?.length ? `进入战斗(${count})` : '发起战斗'}
                 onPress={() => navigate('WorldBattlePicker')} />
        <CTACard emoji="🏰" title="副本(分享码 / 扫房)" onPress={() => navigate('WorldDungeonExplorer')} />
      </CTAGrid>

      {/* 创造数字角色 section(R3.2 第 3 区块)*/}
      <SectionHeader>✨ 创造数字角色</SectionHeader>
      <CreatorRow>
        <CreatorCard emoji="✨" title="Pet Creator(文生)" onPress={() => navigate('PetCreator')} />
        <CreatorCard emoji="📷" title="Photo→3D Pet" onPress={() => navigate('PetCameraScan')} />
        <CreatorCard emoji="🌍" title="World Engine 扫描" onPress={() => navigate('WorldEngineScanner', { mode: 'detail' })} />
      </CreatorRow>

      {/* World Asset 市场入口(底部)*/}
      <MarketEntry onPress={() => navigate('WorldAssetMarketplace')} />
    </ScrollView>
  );
}
```

cohort 守门(R3.5):

```typescript
const flagQ = useQuery(['we-flag'], fetchWorldEngineFlag);
if (!flagQ.data?.enabled) {
  return <ComingSoonScreen />;  // "World Engine 即将开放,加入候补名单"
}
```

### 核心组件 7:CompanionSettingsScreen

9 section ScrollView,每个 section 是独立 React.memo 子组件,改一个不重渲染整页:

```
CompanionSettingsScreen
├─ TodaySummaryCard(顶部小结)
├─ <Section title="勿扰时段">: QuietHoursPicker
├─ <Section title="语音问候">: VoiceGreetSettings
├─ <Section title="推送通知">: PushChannelToggles
├─ <Section title="锁屏陪伴">: AmbientPresenceSettings
├─ <Section title="形态变体">: FormVariantPicker
├─ <Section title="Trust 与签名">: Trust3Settings
├─ <Section title="本地模型">: LocalModelRouting
├─ <Section title="系统助手桥">: SystemAssistantBridgeSettings
└─ <Section title="宠物自主交易">: AgenticCommerceSettings
```

每个 section 都通过 `useSettingsStore` 订阅,改动**立即生效**(R10.4)。

### 核心服务 1:companionEvents.service.ts(中央事件总线)

已在 part 1 给出基础类型,实施细节:

```typescript
// src/services/companionEvents.service.ts
class CompanionEventBus {
  private listeners = new Map<CompanionEvent['type'], Set<(evt: any) => void>>();

  emit<T extends CompanionEvent>(evt: T): void {
    this.listeners.get(evt.type)?.forEach(cb => {
      try { cb(evt); } catch { /* never propagate */ }
    });
    // 同时写 voiceDiagnostics(R12.1)
    addVoiceDiagnostic('companion-events', evt.type, redactPII(evt));
  }

  subscribe<T extends CompanionEvent['type']>(
    type: T,
    cb: (evt: Extract<CompanionEvent, { type: T }>) => void,
  ): () => void { /* ... */ }

  subscribeAll(cb: (evt: CompanionEvent) => void): () => void { /* ... */ }
}

export const companionEvents = new CompanionEventBus();
```

订阅 source(谁往 bus 上推事件):

| Source | 事件 |
|---|---|
| `petPresence` socket(已 shipped) | 桥接所有 `presence:pet.*` 主题 → companionEvents `cross-device-event` |
| `petPresence:wallet.delta`(新订) | → `wallet-delta` |
| `petPresence:approval:wrist-trigger`(已订) | → `approval-incoming` |
| `petPresence:world-engine.*`(新订) | → `world-engine-event` |
| `petPresence:skill.update`(新订) | → `skill-update` |
| `pet-companion-engine` Voice_Greet API(新调用) | → `voice-greet` |
| `mpc-wallet` 侧回 | → `trust3-signing-request` |
| `agenticCommerce.service`(新建) | → `agentic-commerce` |
| `authStore.setActiveInstance` 改变 | → `active-pet-changed` |

订阅 sink(谁监听 bus):

- `CompanionBall` 组件(整体监听)
- `ConversationBubble` / `PetDetailSheet`(只关心 active-pet-changed + cross-device-event)
- `Lock_Screen_Pet`(监听 mode-changed + voice-greet + approval + wallet-delta)
- `voiceDiagnostics`(全监听记录)

### 核心服务 2:formVariant.service.ts(形态变体自动检测)

```typescript
// src/services/formVariant.service.ts(新建)
export type FormVariant = 'default' | 'work' | 'night' | 'journey';

interface AutoDetectionContext {
  isInCalendarMeeting?: boolean;       // expo-calendar
  isWalking?: boolean;                  // HealthKit / GoogleFit
  isInQuietHours?: boolean;             // local time + user pref
  manualLockedUntilMs?: number;         // user 手动切换的 lock 时间
}

// 优先级:manual lock > Quiet_Hours > 会议中 > 走路 > default
export function resolveCurrentVariant(ctx: AutoDetectionContext): FormVariant {
  if (ctx.manualLockedUntilMs && Date.now() < ctx.manualLockedUntilMs) {
    return useSettingsStore.getState().manualVariant;
  }
  if (ctx.isInQuietHours) return 'night';
  if (ctx.isInCalendarMeeting) return 'work';
  if (ctx.isWalking) return 'journey';
  return 'default';
}

// 由 App.tsx 启动一个低频轮询(15min)+ 关键事件触发
export function bootFormVariantWatcher() {
  const tick = async () => {
    const ctx = await collectContext();
    const next = resolveCurrentVariant(ctx);
    const cur = useSettingsStore.getState().currentVariant;
    if (cur !== next) {
      useSettingsStore.setState({ currentVariant: next });
      companionEvents.emit({ type: 'mode-changed', from: ..., to: ..., source: 'form-variant' });
    }
  };
  const id = setInterval(tick, 15 * 60_000);
  // 关键事件触发:Quiet_Hours boundary、HealthKit subscription
  return () => clearInterval(id);
}
```

### 核心服务 3:agenticCommerce.service.ts(R7 自主交易框架)

```typescript
// src/services/agenticCommerce.service.ts(新建)
interface AgenticCommerceLimits {
  enabled: boolean;
  perTransactionMax: number;          // USD
  dailyMax: number;
  whitelistCategories: AgenticCategory[];
  emergencyFreezeUntilMs?: number;
}

export type AgenticCategory =
  | 'world-engine-quota' | 'task-market-accept'
  | 'free-skill-install' | 'subscribed-skill-renew' | 'world-asset-purchase';

export interface AgenticCommerceRequest {
  petId: string;
  category: AgenticCategory;
  amount: number;
  description: string;
}

export interface AgenticCommerceDecision {
  action: 'auto-execute' | 'request-approval' | 'block';
  reason: string;
}

// 在 LLM 决定动作前调用,Phase 1 LLM 端不主动发起,只在用户明确说"帮我买 X"时执行
export async function evaluateAgenticAction(
  req: AgenticCommerceRequest,
): Promise<AgenticCommerceDecision> {
  const limits = useSettingsStore.getState().agenticCommerce;
  if (!limits.enabled) return { action: 'block', reason: 'feature-disabled' };
  if (limits.emergencyFreezeUntilMs && Date.now() < limits.emergencyFreezeUntilMs) {
    return { action: 'block', reason: 'emergency-frozen' };
  }
  if (!limits.whitelistCategories.includes(req.category)) {
    return { action: 'block', reason: 'category-not-allowed' };
  }
  if (req.amount > limits.perTransactionMax) {
    return { action: 'request-approval', reason: 'over-per-tx-limit' };
  }
  const todayTotal = await getTodayAgenticTotal(req.petId);
  if (todayTotal + req.amount > limits.dailyMax) {
    return { action: 'request-approval', reason: 'over-daily-limit' };
  }
  // 余额安全检查
  const balance = await getPetWalletBalance(req.petId);
  const minBalance = useSettingsStore.getState().minSafeBalance ?? 5;
  if (balance - req.amount < minBalance) {
    return { action: 'block', reason: 'below-min-balance' };
  }
  return { action: 'auto-execute', reason: 'within-limits' };
}
```

集成到 LLM tool calling:Phase 1 在 AgentChatScreen / Conversation_Bubble 处理 mcp tool result 时,如果是 commerce 类 tool,**先**走 `evaluateAgenticAction()`,根据决定要么直接调 `agentAccount.transfer()`,要么 `companionEvents.emit('trust3-signing-request', ...)`。

### 核心服务 4:crossDeviceToken.service.ts + 后端配套(R8 远程控制)

**Phase 1 后端必须新增**:`backend/src/modules/remote-control/`

```typescript
// backend/src/modules/remote-control/remote-control.gateway.ts(新建)
@WebSocketGateway()
export class RemoteControlGateway {
  // socket event: remote-control:execute
  // 移动端发起 → 携带 Cross_Device_Token → 校验 → 转发到目标设备
  @SubscribeMessage('remote-control:execute')
  async execute(client: Socket, payload: {
    targetDeviceId: string;
    command: PresetCommand;
    token: string;        // 30s 有效,移动端 Trust 3 签名生成
    args?: Record<string, unknown>;
  }): Promise<void> {
    const userId = this.auth.userIdOf(client);
    const valid = await this.tokenSvc.verify(payload.token, userId);
    if (!valid) { client.emit('remote-control:nack', { reason: 'invalid-token' }); return; }
    if (!WHITELISTED_COMMANDS.includes(payload.command)) {
      client.emit('remote-control:nack', { reason: 'command-not-allowed' }); return;
    }
    // 转发到目标设备
    this.server.to(`device:${payload.targetDeviceId}`).emit('remote-control:run', {
      command: payload.command,
      args: payload.args,
      requestedBy: userId,
    });
    // 5s 内若没收到 ack,client 端自己重试(spec R8.7)
  }

  @SubscribeMessage('remote-control:ack')
  async ack(client: Socket, payload: { requestId: string; success: boolean }): Promise<void> {
    // 转发回 originator
  }
}
```

```typescript
// src/services/crossDeviceToken.service.ts(新建,移动端)
export async function generateCrossDeviceToken(targetDeviceId: string): Promise<string> {
  const nonce = randomUUID();
  const exp = Date.now() + 30_000;
  const payload = { targetDeviceId, nonce, exp };
  const signature = await mpcWalletService.signMessage(JSON.stringify(payload));
  return base64url(JSON.stringify({ ...payload, signature }));
}
```

预设命令白名单(R8.10):

```typescript
// shared/types/remote-control.ts(新建)
export const WHITELISTED_COMMANDS = [
  'desktop.computer-use.start',     // 启动 Computer Use task
  'desktop.pro-mode.toggle',        // 打开 Pro Mode
  'desktop.aira-work-mode.start',   // 启动 Aira 工作模式
  'speaker.tts.broadcast',          // 智能音箱播报
  'speaker.white-noise.start',
  'speaker.stop',
  'watch.notifications.silence',    // Watch 静音 30 分钟
  'device.status.query',            // 查询状态
] as const;

// 明确禁止(R8.10 黑名单)
export const FORBIDDEN_COMMANDS = [
  'device.shutdown',
  'app.data.clear',
  'wallet.config.modify',
];
```



## Data Flow & Sequences

### Sequence 1:用户单击浮球 → 对话气泡展开 + 拍照问

```
User              CompanionBall      ConversationBubble    AgentChatScreen      Backend
 │                     │                    │                    │                    │
 │  单击浮球           │                    │                    │                    │
 ├────────────────────▶│                    │                    │                    │
 │                     │  setMode('listen') │                    │                    │
 │                     ├──┐                 │                    │                    │
 │                     │◀─┘                 │                    │                    │
 │                     │  present({autoActivateVoice:true})      │                    │
 │                     ├───────────────────▶│                    │                    │
 │                     │                    │  useVoiceSession   │                    │
 │                     │                    │  (复用 hook)       │                    │
 │                     │                    ├──────────┐         │                    │
 │                     │                    │          │ STT 监听│                    │
 │                     │                    │◀─────────┘         │                    │
 │  "这是什么"         │                    │  transcriptPreview │                    │
 ├──────────────────────────────────────────▶│ (灰色草稿)         │                    │
 │                     │                    │                    │                    │
 │  右滑浮球           │                    │                    │                    │
 ├────────────────────▶│  expo-image-picker.launchCameraAsync()  │                    │
 │                     ├──────────┐         │                    │                    │
 │                     │  📷 拍照│          │                    │                    │
 │                     │◀─────────┘         │                    │                    │
 │                     │  present({autoOpenCamera, attachments:[{uri}],            │
 │                     │           initialPrompt:'这是什么?'})                       │
 │                     ├───────────────────▶│                    │                    │
 │                     │                    │  buildOutgoingMessageContent()         │
 │                     │                    ├───────────────────▶│                    │
 │                     │                    │                    │  resolveLocalTurn  │
 │                     │                    │                    │  Execution()       │
 │                     │                    │                    ├─────┐              │
 │                     │                    │                    │     │ 决策本地/云端│
 │                     │                    │                    │◀────┘              │
 │                     │                    │                    │                    │
 │                     │                    │  RoutingBadge 📱本地│                   │
 │                     │                    │◀───────────────────┤                    │
 │                     │                    │                    │  generateText      │
 │                     │                    │                    │  Stream(本地)      │
 │                     │                    │                    ├─────┐              │
 │                     │                    │                    │     │ llama.rn     │
 │                     │                    │                    │     │ + mmproj     │
 │                     │                    │                    │◀────┘              │
 │                     │                    │  streaming chunk   │                    │
 │                     │                    │◀───────────────────┤                    │
 │  看到答案文字气泡    │                    │                    │                    │
 │◀────────────────────────────────────────│                    │                    │
 │                     │  setMode('companion')                   │                    │
 │                     │◀───────────────────┤  done              │                    │
```

关键约束:
- 单击浮球后 200ms 内 ConversationBubble 必须 present(R12.8 性能基线)
- STT 转写实时显示草稿(灰色),用户开口说话时持续更新
- 右滑浮球到拍照完成→气泡 present 整体 ≤ 1.5s
- 多模态本地推理首字 ≤ 5s 文本 / ≤ 90s 多模态(R12.8)

### Sequence 2:跨端事件 → 浮球同步 sprite

```
Desktop App         Backend          presence socket    Mobile petPresence    CompanionBall
   │                   │                    │                    │                    │
   │  用户切换灵魂      │                    │                    │                    │
   ├──────────────────▶│  desktopSyncEvent  │                    │                    │
   │                   │  Bus.emit          │                    │                    │
   │                   ├───────────────────▶│  presence:pet.soul.changed              │
   │                   │                    ├───────────────────▶│                    │
   │                   │                    │                    │  bridge to companion│
   │                   │                    │                    │  Events            │
   │                   │                    │                    ├───────────────────▶│
   │                   │                    │                    │                    │  setMode('whisper',
   │                   │                    │                    │                    │   'cross-device')
   │                   │                    │                    │                    ├──┐
   │                   │                    │                    │                    │  │ 800ms sprite 渐变
   │                   │                    │                    │                    │◀─┘
   │  用户给宠物喂食    │                    │                    │                    │
   ├──────────────────▶│                    │                    │                    │
   │                   │  intimacy.add()    │                    │                    │
   │                   │  → presence:pet.state                   │                    │
   │                   ├───────────────────▶│                    │                    │
   │                   │                    ├───────────────────▶│                    │
   │                   │                    │                    │  emotion=happy     │
   │                   │                    │                    │  setSprite('eat')  │
   │                   │                    │                    ├───────────────────▶│
   │                   │                    │                    │                    │  sprite eat 1.6s
```

关键约束(R8.3):
- 跨端 sprite 同步延迟 P95 ≤ 1s(socket round-trip)
- 桌面动作 → 移动同步形成"它跨端是同一只"体感

### Sequence 3:Trust3 签名底片完整流程

```
User       CompanionBall    Trust3SigningSheet     mpc-wallet     Backend     CompanionEvents
 │              │                  │                   │              │              │
 │  长按浮球    │                  │                   │              │              │
 ├─────────────▶│  PetDetailSheet open                 │              │              │
 │              │                                      │              │              │
 │  点"转账"    │                                      │              │              │
 ├──────────────────▶ navigate('QuickPayScreen')       │              │              │
 │  填金额+收款方                                      │              │              │
 ├──────────────────▶ submit                           │              │              │
 │              │                                      │              │              │
 │              │                  │                   │  api.createSignRequest()    │
 │              │                  │                   ├──────────────▶              │
 │              │                  │                   │  signRequestId◀─────────────│
 │              │                  │                   │              │              │
 │              │                  │                   │              │  emit trust3-│
 │              │                  │                   │              │  signing-req │
 │              │                  │                   │              │              │
 │              │  setMode('signing')                  │              │              │
 │              │  锁定不可拖                          │              │              │
 │              │◀─────────────────────────────────────────────────────────────────────│
 │              │                  │                   │              │              │
 │              │  present(req)    │                   │              │              │
 │              ├─────────────────▶│                   │              │              │
 │              │                  │  60s countdown    │              │              │
 │              │                  ├──┐                │              │              │
 │  Face ID     │                  │  │                │              │              │
 ├─────────────────────────────────▶│                   │              │              │
 │              │                  │  mpcSign(reqId)   │              │              │
 │              │                  ├──────────────────▶│              │              │
 │              │                  │                   │  share1+local│              │
 │              │                  │                   ├──┐           │              │
 │              │                  │                   │  │ 生物识别  │              │
 │              │                  │                   │◀─┘           │              │
 │              │                  │  signature        │              │              │
 │              │                  │◀──────────────────┤              │              │
 │              │                  │                   │  api.completeSignRequest    │
 │              │                  │                   │  (sig)        │              │
 │              │                  │                   ├──────────────▶              │
 │              │                  │                   │  done◀────────│              │
 │              │                  │  dismiss()        │              │              │
 │              │  setMode('companion')                │              │              │
 │              │◀─────────────────┤                   │              │              │
 │              │                  │                   │              │  emit wallet-│
 │              │                  │                   │              │  delta       │
 │              │  Wallet_Capsule "+$N 转出" 3s        │              │              │
 │              │  ◀───────────────────────────────────────────────────              │
```

关键约束(R6 + R12.8):
- present P95 ≤ 200ms
- 60s 自动取消(R6.10)
- 浮球 signing 模式期间锁定移动(R1.11)
- 已签 signRequestId 跳过(R6.12,后端去重)
- voiceDiagnostics 不记录 PII(R6.11)

### Sequence 4:Voice_Greet 主动语音问候

```
Time         pet-companion-engine    Backend     Mobile (背景)        CompanionBall      User
 │                  │                   │             │                    │              │
07:30 用户解锁       │                   │             │                    │              │
 ├─────────────────────────────────────────────────────▶                    │              │
 │  app foreground │                   │             │                    │              │
 │                  │                   │             │  detect morning    │              │
 │                  │                   │             │  scenario          │              │
 │                  │                   │             ├───────────┐        │              │
 │                  │                   │             │           │ check  │              │
 │                  │                   │             │◀──────────┤ quotas │              │
 │                  │                   │             │           │        │              │
 │                  │                   │             │  fetch greet text  │              │
 │                  │                   │  api.GET   │             │      │              │
 │                  │                   │  /pet/greet ◀─────────────       │              │
 │                  │  generate text   │             │             │      │              │
 │                  ◀───────────────────│             │             │      │              │
 │                  │  reuse pet_diary │             │             │      │              │
 │                  │  LLM chain       │             │             │      │              │
 │                  ├───┐              │             │             │      │              │
 │                  │   │ Bedrock /    │             │             │      │              │
 │                  │   │ Hunyuan3D    │             │             │      │              │
 │                  │◀──┘              │             │             │      │              │
 │                  │  text(zh):"早安, │             │             │      │              │
 │                  │  我看到外面有点雾"│             │             │      │              │
 │                  │──────────────────▶│             │             │      │              │
 │                                     │  → mobile   │             │      │              │
 │                                     ├─────────────▶             │      │              │
 │                                     │             │             │      │              │
 │                                     │             │  emit voice-greet  │              │
 │                                     │             ├──────────────────▶ │              │
 │                                     │             │             │      │  setMode('whisper', 4s)
 │                                     │             │             │      ├──┐           │
 │                                     │             │             │      │  │ TTS 播报  │
 │                                     │             │             │      │◀─┘           │
 │                                     │             │             │  VoiceGreetCapsule  │
 │                                     │             │             │      │  气泡同句文字│
 │                                     │             │             │      ├─────────────▶│
 │                                     │             │             │      │              │ 看到 + 听到
```

关键约束(R10.10):
- TTS 4s 内说完 / 文字气泡同句呈现(聋哑用户也可读)
- 静音模式 / 耳机断开仅文字不 TTS
- 用户在播报中点浮球 → 暂停 TTS 进入 ConversationBubble 接续对话
- 用户在播报中上滑浮球 → 跳过 TTS,当日不再触发同场景 Voice_Greet

### Sequence 5:Agentic Commerce 自主交易决策

```
User       Conversation     LLM (Bedrock)    AgenticCommerce    AgentAccount    CompanionBall
 │              │                │                  │                  │              │
 │  "帮我装翻译技能"                                 │                  │              │
 ├─────────────▶│                │                  │                  │              │
 │              │  send to LLM   │                  │                  │              │
 │              ├───────────────▶│                  │                  │              │
 │              │                │  tool_call:      │                  │              │
 │              │                │  install_skill('translate-pro',    │              │
 │              │                │  $30)            │                  │              │
 │              │                │                  │                  │              │
 │              │  evaluateAction({                                    │              │
 │              │    petId, category:'subscribed-skill-renew',         │              │
 │              │    amount: 30 })                                      │              │
 │              ├──────────────────────────────────▶│                  │              │
 │              │                │                  │  check limits    │              │
 │              │                │                  ├──┐               │              │
 │              │                │                  │  │ perTx max=$50│              │
 │              │                │                  │  │ daily=$0+30=$30 < $100      │
 │              │                │                  │  │ category 在白名单           │
 │              │                │                  │  │ balance ok   │              │
 │              │                │                  │◀─┘               │              │
 │              │  decision:auto-execute            │                  │              │
 │              │◀──────────────────────────────────│                  │              │
 │              │                │                  │                  │              │
 │              │  agentAccount.purchase('translate-pro', $30)         │              │
 │              ├─────────────────────────────────────────────────────▶│              │
 │              │                │                  │  扣款            │              │
 │              │                │                  │  ◀───────────────┤              │
 │              │                │                  │                  │              │
 │              │  emit wallet-delta + agentic-commerce               │              │
 │              ├───────────────────────────────────────────────────────────────────▶│
 │              │                │                  │                  │  Wallet_Capsule
 │              │                │                  │                  │  "-$30 USDC" 3s
 │              │                │                  │                  │◀─────────────┤
 │  系统通知:🐾 Aira 自主装了 translate-pro 花了 $30  │                  │              │
 │◀──────────────────────────────────────────────────────────────────────────────────│
```

如果**超额**(amount > perTx 或 daily 超):
- decision = 'request-approval' → emit `trust3-signing-request`
- 浮球 → ApprovalAlert "Aira 想买 X 花费 $N,超额了" → Trust3SigningSheet 走 R6 流程



## Navigation Restructure

### MainTabNavigator 改造(R11.1-R11.6)

```typescript
// src/navigation/MainTabNavigator.tsx(改造)
export function MainTabNavigator() {
  const { t } = useI18n();
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const approvalCount = useNotificationStore((s) => s.approvalCount);

  return (
    <Tab.Navigator
      id={undefined}
      initialRouteName="World"            // ← 默认启动 World(R3.1)
      screenOptions={{ ... }}
    >
      <Tab.Screen
        name="World"
        component={WorldStackNavigator}
        options={{ title: t({ en: 'World', zh: '世界' }),
                   tabBarIcon: ({ focused }) => <TabIcon emoji="🌍" focused={focused} /> }}
      />
      <Tab.Screen
        name="Summon"
        component={SummonStackNavigator}
        options={{ title: t({ en: 'Summon', zh: '召唤' }),
                   tabBarIcon: ({ focused }) => <TabIcon emoji="🔮" focused={focused} /> }}
      />
      <Tab.Screen
        name="Plaza"
        component={PlazaStackNavigator}
        options={{ title: t({ en: 'Plaza', zh: '集市' }),
                   tabBarIcon: ({ focused }) => <TabIcon emoji="🎪" focused={focused} /> }}
      />
      <Tab.Screen
        name="Me"
        component={MeStackNavigator}
        options={{ title: t({ en: 'Me', zh: '我' }),
                   tabBarIcon: ({ focused }) => (
                     <TabIcon emoji="👤" focused={focused}
                              badge={unreadCount + approvalCount} />),
                 }}
      />
      {/* ✗ 移除:Home / Today / Agent / Pet / Team / Wallet / Discover 7 个隐藏 tab */}
    </Tab.Navigator>
  );
}
```

### WorldStackNavigator 新建(R3.3)

```typescript
// src/navigation/WorldStackNavigator.tsx(新建)
export function WorldStackNavigator() {
  return (
    <Stack.Navigator id={undefined} screenOptions={{ ... }}>
      <Stack.Screen name="WorldRoot" component={WorldHubScreen} options={{ headerShown: false }} />
      <Stack.Screen name="WorldEngineScanner" component={WorldEngineScannerScreen} />
      <Stack.Screen name="WorldAssetInventory" component={WorldAssetInventoryScreen} />
      <Stack.Screen name="WorldBattleArena" component={WorldBattleArenaScreen} />
      <Stack.Screen name="WorldBattlePicker" component={WorldBattlePickerScreen} />
      <Stack.Screen name="WorldDungeonExplorer" component={WorldDungeonExplorerScreen} />
      <Stack.Screen name="WorldAssetListing" component={WorldAssetListingScreen} />
      <Stack.Screen name="ReconstructionProgress" component={ReconstructionProgressScreen} />
      <Stack.Screen name="WorldAssetMarketplace" component={WorldAssetMarketplaceScreen} />  {/* 新建 */}
      {/* 创造数字角色(从 HomeStack/PetStack 移过来)*/}
      <Stack.Screen name="PetCreator" component={PetCreatorScreen} />
      <Stack.Screen name="PetCameraScan" component={CameraScanScreen} />
    </Stack.Navigator>
  );
}
```

### MeStackNavigator 改造(R11.9 + R10.1)

新增 CompanionSettings,挂在 Settings section 上方:

```typescript
// src/navigation/MeStackNavigator.tsx(改造)
export function MeStackNavigator() {
  return (
    <Stack.Navigator id={undefined}>
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="CompanionSettings" component={CompanionSettingsScreen} />  {/* 新增 */}
      {/* 其余保持不变:Account / Settings / ApiKeys / Wallet* / NotificationCenter / 
          MySkills / MyOrders / SocialListener / LocalAiModel / WearableHub / Subscribe / 
          AxpCenter / AxpRewardShop / ToyBinding / ReferralDashboard / Scan / ShareCard */}
    </Stack.Navigator>
  );
}
```

### Linking config 更新(R11.13)

```typescript
// App.tsx linking config(改造)
const linking = {
  prefixes: [...],
  getStateFromPath: (path, options) => {
    const normalized = resolveLegacyPath(path);  // 复用现有 legacyRouteTable
    return defaultGetStateFromPath(normalized, options);
  },
  config: {
    screens: {
      Auth: { /* 不变 */ },
      InvitationGate: 'invitation-gate',
      Onboarding: { /* 不变 */ },
      Main: {
        screens: {
          World: {
            screens: {
              WorldRoot: 'world',
              WorldEngineScanner: 'world/scan',
              WorldAssetInventory: 'world/inventory',
              WorldBattleArena: 'world/battle/:challengerAssetId?',
              WorldBattlePicker: 'world/battle-picker',
              WorldDungeonExplorer: 'world/dungeon/:shareCode?',
              WorldAssetListing: 'world/listing/:assetId',
              ReconstructionProgress: 'world/reconstruction/:jobId',
              WorldAssetMarketplace: 'world/marketplace',
              PetCreator: 'world/create/text',
              PetCameraScan: 'world/create/photo',
            },
          },
          Summon: {
            screens: { SummonRoot: 'summon', VoiceChat: 'summon/voice' },
          },
          Plaza: { /* 现状不变 */ },
          Me: {
            screens: {
              Profile: 'me',
              CompanionSettings: 'me/companion',  // ← 新增
              Account: 'me/account',
              Settings: 'me/settings',
              /* 其余不变 */
            },
          },
        },
      },
      Inbox: 'inbox',
      Scan: 'scan',
    },
  },
};
```

### Legacy Route Table 扩展(R11.13)

```typescript
// src/navigation/legacyRouteTable.ts(扩展)
const LEGACY_REWRITES: Array<[RegExp, string]> = [
  // Home Tab → 拆分
  [/^home\/?$/, 'world'],                                     // Home root → World root
  [/^home\/pet\/companion$/, 'me/companion'],                 // 进 Pet_Detail_Sheet
  [/^home\/pet\/wallet/, 'me/wallet'],
  [/^home\/pet\/wardrobe/, 'me/companion/wardrobe'],          // 详情卡内的二级
  [/^home\/pet\/soul/, 'me/companion/soul'],
  [/^home\/pet\/breed/, 'me/companion/breed'],
  [/^home\/pet\/skills$/, 'me/skills'],                       // 用户视角
  [/^home\/pet\/memory/, 'me/companion/memory'],
  [/^home\/pet\/play/, 'me/companion/play'],
  [/^home\/pet\/identity/, 'me/companion/identity'],
  [/^home\/pet\/creator/, 'world/create/text'],               // 跳 World
  [/^home\/pet\/camera-scan/, 'world/create/photo'],
  [/^home\/co-raising/, 'me/companion/co-raising'],
  [/^home\/approvals/, 'inbox'],

  // Pet Tab(隐藏)→ 全部进 Me/companion
  [/^pet\/(.*)$/, 'me/companion/$1'],

  // Wallet Tab(隐藏)→ Me/wallet
  [/^wallet\/(.*)$/, 'me/wallet/$1'],

  // Agent Tab(隐藏)→ Summon
  [/^agent\/?$/, 'summon'],
  [/^agent\/chat/, 'summon'],

  // 9 个系统助手 intents 全部保留兼容(不动)
  [/^intent\//, '$&'],
];
```

## Ambient Presence 实现

### iOS Live Activity + 灵动岛(R1.6 + R4.* 状态文字)

用社区库 `expo-live-activity` 或自建 Swift Extension。Phase 1 先用 `expo-live-activity`,如果遇到限制升级到自建。

```typescript
// src/services/ambientPresence/iosLiveActivity.ts(新建)
import LiveActivity from 'expo-live-activity';

export async function startPetLiveActivity(state: PetActivityState): Promise<string | null> {
  if (Platform.OS !== 'ios') return null;
  const supportedIos = parseFloat(Platform.Version as string) >= 16.1;
  if (!supportedIos) return null;

  return await LiveActivity.start({
    activityType: 'PetCompanionActivity',
    content: {
      sprite: state.spriteUrl,
      petName: state.petName,
      modeText: getModeStateText(state.mode), // 来自 R4.4 表
      relativeTime: 'now',
    },
    pushTokenEnabled: true,  // 后端可推送更新
  });
}

export async function updatePetLiveActivity(activityId: string, state: PetActivityState) {
  await LiveActivity.update(activityId, { content: ... });
}

export async function startDynamicIslandPresentation(activityId: string, mode: CompanionMode) {
  // 紧凑岛 / 展开岛
  // CTA: "打招呼" | "确认审批" | "查看余额"(基于 mode)
}

// 12h 自动 dismiss + 重启(Apple 限制)
function scheduleAutoRecycle(activityId: string) {
  setTimeout(async () => {
    await LiveActivity.end(activityId);
    const newId = await startPetLiveActivity(/* current state */);
  }, 12 * 60 * 60 * 1000);
}
```

灵动岛 CTA 路由(R4.7-R4.8):

```swift
// ios/AgentrixLiveActivity/PetCompanionActivity.swift(新建)
// 灵动岛 CTA "打招呼" → DeepLink agentrix://intent/voice-greet?manual=true
// "确认审批" → DeepLink agentrix://intent/approve-request?id=<approvalId>
// "查看余额" → DeepLink agentrix://intent/wallet-status
```

### Android SYSTEM_ALERT_WINDOW 桌面级悬浮(R1.5)

manifest 已申请 `SYSTEM_ALERT_WINDOW`,Phase 1 实现 native module 把 React Native 的 `<CompanionBall>` 渲染到 system overlay window:

```kotlin
// android/app/src/main/java/com/agentrix/companion/SystemOverlayService.kt(新建)
class SystemOverlayService : Service() {
  private var overlayView: View? = null
  private lateinit var windowManager: WindowManager

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (!Settings.canDrawOverlays(this)) {
      // 引导用户授权
      val perm = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:$packageName"))
      perm.flags = Intent.FLAG_ACTIVITY_NEW_TASK
      startActivity(perm)
      return START_NOT_STICKY
    }

    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.WRAP_CONTENT,
      WindowManager.LayoutParams.WRAP_CONTENT,
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
      PixelFormat.TRANSLUCENT
    )

    overlayView = LayoutInflater.from(this).inflate(R.layout.companion_ball_overlay, null)
    setupOverlayInteractions(overlayView!!)  // 拖动 + 单击 + 长按
    windowManager.addView(overlayView, params)

    return START_STICKY
  }

  private fun setupOverlayInteractions(view: View) {
    // 单击 → 启动 MainActivity + deeplink agentrix://companion-tap
    // 长按 → 启动 MainActivity + deeplink agentrix://companion-longpress
    // 拖动 → 更新 LayoutParams 位置 + persist 到 SharedPreferences
  }
}
```

```typescript
// src/services/ambientPresence/androidOverlay.ts(新建,JS 桥)
import { NativeModules, Linking } from 'react-native';

export async function ensureOverlayPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const { CompanionOverlayModule } = NativeModules;
  return await CompanionOverlayModule.hasPermission();
}

export async function startSystemOverlay(initialState: PetActivityState) {
  if (Platform.OS !== 'android') return;
  const { CompanionOverlayModule } = NativeModules;
  await CompanionOverlayModule.start(initialState);
}

export async function stopSystemOverlay() {
  if (Platform.OS !== 'android') return;
  const { CompanionOverlayModule } = NativeModules;
  await CompanionOverlayModule.stop();
}

// 桌面浮球点击 → deeplink 回 App
Linking.addEventListener('url', ({ url }) => {
  if (url.startsWith('agentrix://companion-tap')) {
    // 把 App 拉到前台 + 触发 ConversationBubble
    bottomSheetManager.present('conversation');
  }
});
```

启动时机(R1.5):

```typescript
// src/services/ambientPresence/index.ts(总入口)
export function bootAmbientPresence() {
  // App foreground:CompanionLayer 显示在 RN 内部浮球
  // App background:启动 Live Activity (iOS) / SystemOverlay (Android)
  AppState.addEventListener('change', async (state) => {
    if (state === 'background') {
      const settings = useSettingsStore.getState().ambientPresence;
      if (Platform.OS === 'ios' && settings.liveActivityEnabled) {
        const id = await startPetLiveActivity(getCurrentPetState());
        useSettingsStore.setState({ liveActivityId: id });
      }
      if (Platform.OS === 'android' && settings.systemOverlayEnabled) {
        await startSystemOverlay(getCurrentPetState());
      }
    } else if (state === 'active') {
      // 回到前台:停掉 Android overlay(Live Activity 保留作为补充展示)
      await stopSystemOverlay();
    }
  });
}
```

订阅 companionEvents 实时更新 ambient layer:

```typescript
companionEvents.subscribe('mode-changed', async (evt) => {
  const id = useSettingsStore.getState().liveActivityId;
  if (id) await updatePetLiveActivity(id, /* new state */);
  await CompanionOverlayModule.updateState(/* new state */); // Android
});
```

## Backend 新增 API

仅 2 个轻量 API,**不**新建大模块:

### 1. Remote Control Gateway(R8 / 已在 part 3 给出)

`backend/src/modules/remote-control/remote-control.gateway.ts`:WebSocket 跨设备命令转发 + Cross_Device_Token 校验。

### 2. Voice Greet API(R10.10)

`backend/src/modules/pet-companion-engine/pet-companion-engine.controller.ts` 新增:

```typescript
@Get('greet')
async getGreet(
  @Request() req,
  @Query('scenario') scenario: 'morning' | 'evening' | 'comeback' | 'milestone' | 'manual',
): Promise<{ text: string; ttsUrl?: string; lang: 'zh' | 'en' }> {
  const userId = req.user.id;
  const pet = await this.petSvc.findActivePet(userId);
  // 复用 pet_diary 同款 LLM 链路
  const text = await this.llmSvc.generateGreet({ pet, scenario, lang: req.user.preferredLang });
  // 可选:TTS audio URL
  const ttsUrl = await this.ttsSvc.synthesize(text, req.user.preferredLang);
  return { text, ttsUrl, lang: req.user.preferredLang };
}
```

### 3. Health Steps(R7 健康陪伴可选)

`backend/src/modules/pet-companion-engine/health-steps.controller.ts` 新增,Phase 1 可只本地存储,API 留作 Phase 2 Hook。



## File Change Inventory

完整文件改动清单(目标:你打开 IDE 就能照单全收)。

### 新建文件(28 个)

```
src/components/companion/
  ├─ CompanionLayer.tsx              ← 全局浮球 + sheet 总挂载
  ├─ CompanionBall.tsx               ← 升级版浮球(从 GlobalFloatingBall.tsx 改名 + 重写)
  ├─ ConversationBubble.tsx          ← R2 对话气泡 BottomSheet
  ├─ PetDetailSheet.tsx              ← R4 宠物全景 BottomSheet
  ├─ Trust3SigningSheet.tsx          ← R6 签名底片
  ├─ SkillInstallCard.tsx            ← R9 skill 安装(改造现有 SkillInstallScreen)
  ├─ CapsuleOverlay.tsx              ← Wallet/Approval/Voice 共用基础
  ├─ WalletCapsule.tsx
  ├─ ApprovalAlertCapsule.tsx
  ├─ VoiceGreetCapsule.tsx
  ├─ ActivePetPicker.tsx             ← R5 多宠物切换 picker
  └─ RemoteControlPanel.tsx          ← R8 跨端控制 panel(嵌在 PetDetailSheet 内)

src/screens/world/
  ├─ WorldHubScreen.tsx              ← R3 World Tab Root
  └─ WorldAssetMarketplaceScreen.tsx ← Phase 1 简版,Phase 2 完善

src/screens/me/
  └─ CompanionSettingsScreen.tsx     ← R10 集中配置中心

src/navigation/
  └─ WorldStackNavigator.tsx         ← R3.3 + R11.7

src/services/
  ├─ companionEvents.service.ts      ← 中央事件总线
  ├─ formVariant.service.ts          ← R6 形态变体自动检测
  ├─ agenticCommerce.service.ts      ← R7 自主交易框架
  ├─ crossDeviceToken.service.ts     ← R8 跨端令牌
  ├─ systemAssistantBridge.ts        ← R9 反向调用 5 个动作
  ├─ companionLayout.service.ts      ← 跨 tab 浮球位置共享 store
  └─ ambientPresence/
      ├─ index.ts                    ← 总入口 + AppState 监听
      ├─ iosLiveActivity.ts          ← iOS Live Activity 桥
      └─ androidOverlay.ts           ← Android SYSTEM_ALERT_WINDOW 桥

shared/types/
  ├─ remote-control.ts               ← WHITELISTED_COMMANDS / FORBIDDEN_COMMANDS
  └─ companion-events.ts             ← CompanionEvent discriminated union

ios/AgentrixLiveActivity/
  ├─ PetCompanionActivity.swift      ← Live Activity attribute schema
  └─ PetCompanionWidgetBundle.swift  ← Widget extension bundle

android/app/src/main/java/com/agentrix/companion/
  ├─ SystemOverlayService.kt         ← Android 系统级悬浮 service
  ├─ CompanionOverlayModule.kt       ← RN bridge module
  └─ CompanionOverlayPackage.kt      ← register

backend/src/modules/remote-control/
  ├─ remote-control.module.ts
  ├─ remote-control.gateway.ts       ← WebSocket gateway
  ├─ remote-control.service.ts
  └─ cross-device-token.service.ts   ← token 校验

.maestro/
  └─ 47-mobile-pet-companion-redesign.yaml  ← R12.3 E2E
```

### 修改文件(~25 个)

```
App.tsx                                 ← 加 BottomSheetModalProvider + CompanionLayer + 删 MobilePetProactiveBanner 注释里的旧浮球 mount

src/navigation/
  ├─ MainTabNavigator.tsx              ← 4 tab 终极版,删 6 个 hidden + 改 initialRoute='World'
  ├─ MeStackNavigator.tsx              ← 加 CompanionSettings screen
  ├─ legacyRouteTable.ts               ← 加 home/* / pet/* / wallet/* / agent/* 重定向
  └─ types.ts                          ← 加 WorldStackParamList,删 HomeStackParamList

src/services/
  ├─ petMode.ts                        ← 8 个 CompanionMode + 状态机扩展
  └─ petPresence.ts                    ← 订阅完整 11 主题(只是 handlers 写法变,基础设施已 shipped)
  ├─ petModeAdapters.ts                ← 桥接全部 presence:pet.* → companionEvents

src/components/
  ├─ GlobalFloatingBall.tsx → 重命名为 src/components/companion/CompanionBall.tsx + 重写
  └─ pet/MobilePetProactiveBanner.tsx  ← 改为只处理 banner,不再独立订阅 socket(改为 subscribe companionEvents)

src/screens/agent/AgentChatScreen.tsx  ← 加 conversation id 共享 + Bubble 双层兼容(主要是 props.parentSurface)

src/screens/inbox/InboxScreen.tsx      ← 不动,但 deeplink approve_request 走 R6 Trust3SigningSheet

src/stores/settingsStore.ts            ← 加 pet_companion_settings/v1 namespace + 9 section 字段

backend/src/modules/pet-companion-engine/
  ├─ pet-companion-engine.controller.ts ← 加 GET /pet/greet
  └─ pet-companion-engine.module.ts    ← register Voice_Greet 路径

ios/AgentrixIntents/AgentrixIntents.swift     ← 加 5 个新 AppIntent (start_world_scan / enter_dungeon / install_skill / remote_control / quiet_30)
android/app/src/main/res/xml/actions.xml      ← 加 5 个新 App Action
src/services/intents/chineseAssistants.ts     ← 加 5 个新 manifest entry
src/services/intents/defaultIntentHandlers.ts ← register 5 个新 handler

package.json                            ← 新增 @gorhom/bottom-sheet / expo-live-activity / expo-battery / expo-calendar / expo-health(可选)

app.json                                ← (可选)添加 expo-live-activity plugin / Android FOREGROUND_SERVICE 类型 SPECIAL_USE
android/app/src/main/AndroidManifest.xml ← 加 SystemOverlayService 注册

.github/workflows/mobile-test.yml       ← 加 47-* maestro 到 ci

docs/
  └─ MOBILE_PET_REDESIGN_USER_MANUAL.zh-CN.md  ← 用户手册,Phase 1 末发布
```

### 删除文件(~14 个)

```
src/screens/HomeScreen.tsx                      ← 整个文件删
src/navigation/HomeStackNavigator.tsx           ← 整个文件删
src/screens/home/                              ← 整个目录删(CoRaisingInvite/Landing/Activity 移到 me/companion/co-raising)
src/navigation/AgentStackNavigator.tsx          ← 隐藏 legacy 删
src/navigation/DiscoverStackNavigator.tsx       ← 隐藏 legacy 删
src/navigation/TeamStackNavigator.tsx           ← 隐藏 legacy 删
src/navigation/TodayStackNavigator.tsx          ← 隐藏 legacy 删
src/navigation/WalletStackNavigator.tsx         ← 隐藏 legacy 删(内容进 Me)
src/navigation/PetStackNavigator.tsx            ← 隐藏 legacy 删(World 接管 + 详情卡接管)
src/navigation/DrawerNavigator.tsx              ← 已废弃
src/screens/pet/PetHubScreen.tsx                ← 被 World Tab + PetDetailSheet 替代
src/components/MobilePetProactiveBanner.tsx     ← 改造而不是删,但行为变化大
.maestro/01-launch.yaml 中关于 Home Tab 的断言行  ← 行级删
src/navigation/__tests__/legacyNavWarn.test.ts  ← 更新预期
```

### 依赖新增

```json
{
  "dependencies": {
    "@gorhom/bottom-sheet": "^5.0.0",
    "expo-live-activity": "~0.4.0",
    "expo-battery": "~9.0.0",
    "expo-calendar": "~14.0.0"
  },
  "optionalDependencies": {
    "expo-health": "*"          // Android Google Fit 接入,iOS HealthKit
  }
}
```

`expo-live-activity` Phase 1 假设社区版够用;若 hit 限制升级到自建 Swift Extension(`ios/AgentrixLiveActivity/` 自研路径)。

## Sprint 路线(Phase 1, 6-10 周)

按工作量 + 依赖次序划分 4 个 sprint(每 sprint 2-3 周)。每 sprint 末必须有可验证的 Maestro E2E 通过。

### Sprint P-9.1(2 周):核心浮球 + IA 重塑 + 双层对话

**目标**:用户能看到新 IA + 浮球 + 对话气泡基础流程

- T1 [设计] 新建 `companionEvents` 中央事件总线 + 类型契约
- T2 [实施] App.tsx 加 BottomSheetModalProvider + CompanionLayer 骨架
- T3 [实施] MainTabNavigator 改 4 tab + initialRouteName='World' + 删 7 个 hidden tab
- T4 [新建] WorldStackNavigator + WorldHubScreen + cohort 守门
- T5 [改造] CompanionBall(从 GlobalFloatingBall 重写)+ 8 个 mode + 防抖 + 锁定
- T6 [新建] ConversationBubble + 集成 useVoiceSession + 路由标识 + 上滑展开
- T7 [新建] PetDetailSheet + 9 section + ActivePetPicker + section 展开二级页
- T8 [改造] legacyRouteTable 加 home/* 重定向
- T9 [删除] HomeScreen / HomeStackNavigator / 6 个 hidden stack 完全清掉
- T10 [验证] Maestro 47-* part1:启动 → World 默认 + 4 tab + 浮球可见跨 tab + 单击 Bubble + 长按 PetDetail

**验收门**:用户冷启动看到 World Tab + 浮球 + 单击/长按基础流程,Maestro 通过。

### Sprint P-9.2(2 周):签名 + 跨端 + 多宠物 + Voice_Greet

**目标**:签名权 + 跨端可视化 + 主动语音问候

- T11 [新建] Trust3SigningSheet + mpc-wallet 集成 + 60s timeout + signRequestId 去重
- T12 [新建] SkillInstallCard(改造 SkillInstallScreen 为 sheet)
- T13 [新建] WalletCapsule + ApprovalAlertCapsule
- T14 [改造] petPresence 订阅完整 11 主题 → 桥接 companionEvents
- T15 [实施] R5 Active_Pet 切换 + 浮球 sprite 800ms 渐变 + 详情卡数据刷新
- T16 [后端] pet-companion-engine `GET /pet/greet` API + Voice_Greet 5 场景触发
- T17 [新建] VoiceGreetCapsule + 静音/勿扰处理 + 上滑跳过逻辑
- T18 [新建] formVariant.service + 自动检测(Quiet_Hours / 会议 / 步数)
- T19 [验证] Maestro 47-* part2:模拟 cross-device sprite 同步 + 模拟 missed_you whisper + Trust3 一次完整签名

### Sprint P-9.3(2 周):Ambient Presence + 系统助手 + 远程控制

**目标**:让宠物走出 App + 系统助手桥完整 + 远程控制可用

- T20 [iOS] expo-live-activity 接入 + PetCompanionActivity Swift Extension
- T21 [iOS] 灵动岛 CTA 路由(打招呼 / 确认审批 / 查看余额)
- T22 [Android] SystemOverlayService 原生模块 + RN bridge + 引导授权流程
- T23 [Android] Material You widget(Phase 1 简版,Themed Icons 留 Phase 2)
- T24 [实施] 5 个新 intents 三平台同步(iOS App Intent + Android xml + 中文 manifest)
- T25 [新建] systemAssistantBridge.ts(反向调用 5 个动作)+ Approval_Alert 集成
- T26 [新建] crossDeviceToken.service + 后端 remote-control gateway + 命令白名单
- T27 [新建] RemoteControlPanel(嵌 PetDetailSheet)+ Trust3 集成 + 5s ack timeout
- T28 [实施] 唤醒词冲突让位策略(检测系统唤醒词 200ms+ → 自建唤醒暂停 8s)
- T29 [验证] Maestro 47-* part3:模拟 Siri start_world_scan + Live Activity 锁屏可见 + 远程控制流程

### Sprint P-9.4(2-3 周):Agentic Commerce + Companion_Settings + 文档 + 上线

**目标**:Phase 1 收尾 + 上线门

- T30 [新建] agenticCommerce.service + 限额校验 + 推送通知 + 紧急冻结
- T31 [集成] Phase 1 LLM tool calling 路径 evaluateAgenticAction()
- T32 [新建] CompanionSettingsScreen + 9 section + 立即生效订阅
- T33 [改造] settingsStore 加 pet_companion_settings/v1 namespace
- T34 [实施] 跨端记忆共享可视化(详情卡设备列表 + 桌面动作实时反映)
- T35 [实施] 健康陪伴(可选)— HealthKit/GoogleFit 步数 + 久坐
- T36 [文档] MOBILE_PET_REDESIGN_USER_MANUAL.zh-CN.md
- T37 [测试] 完整 Maestro 47-* + 单测 ≥ 80% 行覆盖率
- T38 [上线] feature flag `pet_companion_redesign_enabled` 1% cohort 灰度
- T39 [验证] 生产 checklist(R12.10 完整 12 项)
- T40 [收尾] 100% rollout + 老用户 deeplink 重定向监控 + sprint 总结写 `memories/repo/`

## Risk Matrix & Mitigation

| 风险 | 严重程度 | 缓解 |
|---|---|---|
| **Android SYSTEM_ALERT_WINDOW 用户授权率低** | 高 | onboarding 多步引导 + 每个 tab 切换提示一次(最多 3 次)+ Companion_Settings 始终可重新启用 + 不阻塞 App 内浮球 |
| **iOS Live Activity 配置复杂(开发 build vs prod)** | 高 | Phase 1 用社区 expo-live-activity,失败 fallback 到普通锁屏通知;Phase 2 升级自建 |
| **BottomSheet 多层叠加冲突** | 中 | 严格 z-order:Trust3(top) > SkillInstall > PetDetail > Conversation;`mode=signing` 时其他 sheet 全 disabled |
| **跨端 sprite 抖动**(Local_Action_Wins 没正确生效) | 中 | 30s 模式切换防抖(R1.8) + 用户主动操作 5s 内抑制低优先级转换 + voiceDiagnostics 监控抖动 |
| **Conversation_Bubble 与 Summon Tab 历史不同步** | 中 | 共享 conversation id + AgentChatScreen state 复用 + 双向 sync 测试覆盖 |
| **本地推理首字延迟 > 5s 用户感知差** | 中 | RoutingBadge 显示 📱 + "本地推理可能较慢" 提示 + auto fallback 到云端(可配) |
| **Plaza 25 屏未动 → 用户惯性找老入口** | 低 | legacyRouteTable 完整重定向 + onboarding 提示"Pet 入口已搬到浮球" |
| **多宠物切换数据 race(socket 还没切完用户已在新宠物对话)** | 中 | active-pet-changed 触发后强制 dismiss Conversation_Bubble + 新 session id 隔离 |
| **mpc-wallet Trust3 签名失败 vs 60s timeout 边界** | 中 | timeout 优先于 success,正在 sign 时 timeout 显示"签名超时,请重试" |
| **expo-live-activity 社区库维护停滞** | 低 | Phase 2 自建 Swift Extension 已计划 |
| **Agentic Commerce 用户开启率低**(认知门槛高) | 低 | Phase 1 默认关 + 7 天小结鼓励 + 引导文案突出"自动充配额"等小场景 |
| **5 个新 intents 商店审核失败** | 中 | iOS Apple 审核近年对 Approval/Wallet 类 Intent 严,准备 URL Scheme fallback;参考现有 9 intents shipped 经验 |
| **Sprint P-9.3 工作量超出**(原生模块多平台) | 高 | 把 Android Overlay 单拆出 P-9.3.5 + 准备只做 iOS 灵动岛先发版,Android Overlay 后续补 |
| **legacyRouteTable 漏改 deeplink 老用户白屏** | 中 | grep 全仓库 'home/' / 'pet/' / 'wallet/' deeplink + 每个旧 path 至少一个 Maestro 断言 |

## Monitoring & Verification

### voiceDiagnostics 埋点(R12.1 完整列表)

所有埋点写到 `companion-events` 命名空间,便于过滤:

```
companion-ball-mount { tab: 'World' | 'Plaza' | 'Me' }
companion-ball-missing { tab }                       (R12.2 健康检查)
companion-mode-changed { from, to, source }
voice-greet-triggered { scenario }
lock-screen-pet-started / -dismissed
mood-diary-push-tapped
form-variant-changed { from, to, source }
trust3-sheet-shown { reason }
trust3-signing-completed { reason, success, durationMs }
wallet-capsule-shown { kind: 'positive' | 'negative', delta }
pet-detail-sheet-opened
pet-detail-card-expanded { card }
active-pet-switched { from, to }
conversation-bubble-opened { source: 'tap' | 'right-swipe' | 'siri' }
conversation-bubble-routing { local: bool, model }
world-engine-shortcut { action }
skill-install-card-shown { skillId }
approval-alert-shown { approvalId }
remote-control-sent { target, command }
remote-control-ack { command, success, durationMs }
system-assistant-intent-resolved { name, source: 'siri' | 'gemini' | 'xiaoai' | 'xiaoyi' | 'xiaobu' | 'jovi' }
system-assistant-reverse { kind: 'callPhone' | 'openMaps' | ... }
agentic-commerce-executed { kind, amount }
agentic-commerce-blocked { reason }
agentic-commerce-overlimit { kind, amount, limit }
cross-device-sprite-sync { sourceDevice, eventType }
ambient-presence-permission { platform, granted }
```

### 性能基线监控

每个 P95 必须满足 R12.8,通过 react-native-performance / 自建 instrumentation 在生产采样:

```typescript
// src/services/performance.service.ts(扩展)
export const PERFORMANCE_BUDGETS = {
  'companion-ball-fps': { min: 60, p95: 60 },
  'companion-mode-transition-ms': { p95: 50 },
  'voice-greet-tts-start-ms': { p95: 1500 },
  'lock-screen-update-ms': { p95: 30000 },
  'trust3-sheet-present-ms': { p95: 200 },
  'wallet-capsule-total-anim-ms': { p95: 3200 },
  'pet-detail-sheet-present-ms': { p95: 250 },
  'conversation-bubble-first-token-cloud-ms': { p95: 2000 },
  'conversation-bubble-first-token-local-text-ms': { p95: 5000 },
  'conversation-bubble-first-token-local-multimodal-ms': { p95: 90000 },
};
```

### Feature Flag 回滚策略(R12.9)

```typescript
// src/config/featureFlags.ts(新建)
export const FEATURE_FLAGS = {
  petCompanionRedesignEnabled: useRemoteConfig('pet_companion_redesign_enabled', false),
  agenticCommerceEnabled: useRemoteConfig('agentic_commerce_enabled', false),
  androidSystemOverlayEnabled: useRemoteConfig('android_system_overlay_enabled', true),
  iosLiveActivityEnabled: useRemoteConfig('ios_live_activity_enabled', true),
};

// 在 CompanionLayer 顶部判断
if (!FEATURE_FLAGS.petCompanionRedesignEnabled) {
  return <LegacyHomeScreenFallback />;  // 临时 fallback,1% cohort 验证用
}
```

### 上线前 Checklist(R12.10)

```
[ ] 4 tab 启动默认 = World 验证(冷启动 5 次)
[ ] 浮球 World/Plaza/Me 可见 + Summon 隐藏
[ ] 长按 Pet_Detail_Sheet 9 section 全部可达
[ ] 单击 Conversation_Bubble + 拍照流程 + 本地路由切换
[ ] manual Voice_Greet 在静音/勿扰/`night` 各场景下符合预期
[ ] iOS Live Activity 锁屏可见 + 灵动岛 CTA 三个全部 deeplink 正确
[ ] Android Material You widget 显示 + Themed Icons fallback
[ ] Android SYSTEM_ALERT_WINDOW 浮球 mac/win/iphone 屏幕模拟器手动验证
[ ] Mood_Diary_Push 真实推送一条
[ ] Companion_Settings 切换 Form_Variant 立即生效
[ ] Trust3_Signing_Sheet 完整签名一次 USDC 转账
[ ] Trust3_Signing_Sheet 60s timeout 行为正确
[ ] 远程控制成功触发桌面 Computer Use task
[ ] 至少一个 system intent (Siri / Gemini / 小爱) 端到端 resolve
[ ] 至少一笔 Agentic Commerce 自主交易触发推送
[ ] feature flag 关闭后回退到基线
[ ] 老用户从 Home Tab 老 deep link 自动重定向(grep 测试 home/pet/companion / pet/wardrobe / wallet/connect 等 10 个)
[ ] 跨端记忆同步:在桌面切换灵魂 → 移动浮球 sprite 1s 内变化
[ ] Maestro 47-* 全部 pass(20+ 场景)
[ ] 单测行覆盖率 ≥ 80%
[ ] 性能基线全部满足
```

## Correctness Properties

本设计满足以下不变量(Phase 1 上线前必须由单测 + Maestro E2E 验证):

### Property 1: 唯一活跃宠物不变量

任意时刻 `authStore.activeInstance` 与浮球渲染的 sprite + Conversation_Bubble 上下文 + Lock_Screen_Pet 状态文字 三者**始终指向同一个 petId**。Active_Pet 切换时所有三处必须在 1s 内同步。

**Validates: Requirements 5.1, 5.3, 5.5**

### Property 2: 签名权独占不变量

Trust3_Signing_Sheet 在任意时刻最多展开 1 个;`mode === 'signing'` 期间禁止其他 sheet 同时展开;签名过程中浮球本体锁定不可拖动。

**Validates: Requirements 6.2, 1.11, 6.4**

### Property 3: 无菜单冗余不变量

浮球长按手势永远只触发 PetDetailSheet,**不**弹出菜单/Action Sheet/Modal,以防与 4 tab 入口语义冲突(R8 已删长按菜单设计)。

**Validates: Requirements 4.1, 4.6, 11.10**

### Property 4: 本地动作优先不变量

用户在 ≤5s 内有触屏/滚动/输入时,Companion_Mode **不**响应低优先级(< 50)的 emotion 推送转换。

**Validates: Requirements 2.12, 1.7**

### Property 5: Quiet_Hours 静默不变量

`night` Form_Variant 或 Quiet_Hours 时段内,Voice_Greet 自动触发 / push 通知 / haptic / TTS 全部静音(`manual` Voice_Greet 与 高风险 approval 除外)。

**Validates: Requirements 6.1, 6.4, 10.10**

### Property 6: 跨端 Active_Pet 一致性

桌面端切换 Active_Pet 时,移动浮球必须在 1s 内通过 socket 收到事件并切换 sprite + 详情卡数据 reload。

**Validates: Requirements 5.7, 8.2, 8.3**

### Property 7: 浮球模式防抖

30s 窗口内 mode 变化 > 3 次时,只渲染最后一次 mode 的 sprite,中间状态被吞掉(R1.8)。

**Validates: Requirements 1.8, 12.8**

### Property 8: 签名超时收敛

Trust3_Signing_Sheet 60s 未响应必须 dismiss + emit cancel 给后端,防止僵尸签名。

**Validates: Requirements 6.6, 6.10, 6.11**

### Property 9: 跨端命令权限收敛

Remote_Control 的 Cross_Device_Token 30s 后失效,服务端必须拒绝过期 token;白名单外命令必须直接拒绝。

**Validates: Requirements 8.6, 8.10**

### Property 10: Agentic_Commerce 限额收敛

超 perTransactionMax 或日累计 > dailyMax 必须走 Trust3 二次签名,不能 auto-execute。

**Validates: Requirements 7.4, 7.5, 6.7**

### Property 11: Active_Pet AgentAccount 隔离

每只宠物自主交易记录到自己的 `agent_cost_records.agentId`,切换宠物不影响其他宠物正在进行的自主任务。

**Validates: Requirements 5.8, 5.10, 7.3**

## Error Handling

### Backend 失联

| 场景 | 行为 |
|---|---|
| `/v1/pet/state` 连续失败 ≥ 3 次 | Companion_Mode 进入 `vigil`(守候)而**不**进入 idle 假装一切正常;浮球 capsule 显示"重连中…" |
| socket 断开 | 浮球**不**强制切到 idle,保持上一已知 mode 直到 socket 恢复或用户主动操作覆盖 |
| `/pet/greet` Voice_Greet 失败 | 当次 scenario 跳过,**不**回退到默认文案("早安"),避免重复 |
| Trust3_Signing_Sheet `mpcWalletService.sign()` 失败 | sheet 保持展开 + Toast "签名失败,请重试";不自动取消 |
| Cross_Device_Token 5s 内未收到 ack | 浮球切 `nudge` + 文案"对方设备未响应";命令缓存到 outbox,60s 内可手动重试 |

### Native Module 缺失 / 权限拒绝

| 场景 | 降级 |
|---|---|
| `expo-live-activity` 未安装 / iOS < 16.1 | Lock_Screen_Pet 整体不启用;Companion_Settings 提示"需要 iOS 16.1+ 启用锁屏陪伴" |
| Android `SYSTEM_ALERT_WINDOW` 未授权 | 桌面级悬浮 disabled,App 内浮球仍正常;Companion_Settings 提供"重新授权"按钮 |
| `expo-health` / `Google Fit` 权限拒绝 | journey 自动检测降级关闭,但用户仍可手动切换到 journey Form_Variant;Companion_Settings 持续显示"开启健康陪伴"卡 |
| `expo-calendar` 未授权 | 自动 work 模式降级,但用户可手动切;不弹反复权限请求 |
| 生物识别未注册(Face ID / 指纹) | Trust3_Signing_Sheet 降级为 6 位 PIN(沿用现有 wallet PIN UI) |
| 设备静音 / 耳机断开 | Voice_Greet 仅展示文字气泡,**不**播 TTS |
| `expo-battery` 检测低电量 | Sprite 帧率降到 6 fps,关装饰动画;不影响功能可用性 |

### LLM / 多模态推理

| 场景 | 降级 |
|---|---|
| 本地模型未下载且选了"纯本地" | 提示"未安装本地模型,请先下载或切换到智能/云端模式";不静默 fallback 到云端(尊重隐私意图) |
| 本地多模态首字 > 90s timeout | 若 `executionMode='auto'` 且 `allowCloudFallback`,失败快切到云端;否则提示"本地推理超时,请重试或切到云端模式" |
| 云端 LLM 5xx | 4 次指数退避重试 → fallback 到本地(如果 ready)→ 兜底 Toast "暂时无法回答,请稍后重试" |
| LLM 决定调用 `system.callPhone` 反向调用 | 必须经 Approval_Alert "Aira 想让你打电话给 X,确认?",**不**直接拨号;用户拒绝则 LLM 收到 feedback 并降级回纯文本 |

### 跨端事件冲突

| 场景 | 行为 |
|---|---|
| 同一 SignRequestId 被两个设备同时签 | 后端去重,后到的请求拒绝;前端收到 409 后显示"已在另一设备签名"+ dismiss sheet |
| Active_Pet 切换 race(socket 还没切完用户已在 Conversation_Bubble) | active-pet-changed 触发后强制 dismiss Conversation_Bubble + 1.5s 提示气泡"已切到 [新宠物名]" |
| presence:wallet.delta 与 Trust3_Signing 同时触发 | 优先级:Trust3 > Wallet_Capsule;Wallet_Capsule 排队等 sheet dismiss 后再展示(队列最大 3,超出丢弃最旧) |

### 用户操作错误

| 场景 | 处理 |
|---|---|
| 未登录长按浮球 | PetDetailSheet 仅显示 sprite + "请先登录" CTA,所有 section disabled |
| 未配置 MPC share 1 长按 → 钱包 | "需要先设置钱包" + 跳 WalletConnectScreen |
| 拍照后立即上滑取消 | 取消相机 + 不进 Conversation_Bubble + 浮球回 companion |
| Trust3 Sheet 弹出后用户 home 键回桌面 | sheet 保持挂起,App 切回前台 sheet 仍展开;60s 倒计时继续走;超时正常 dismiss |

## Testing Strategy

### Unit Tests(目标 ≥80% 行覆盖率)

新建 `src/services/__tests__/`:

```
companionEvents.test.ts            ← 事件 emit/subscribe 矩阵 + voiceDiagnostics 写入
petMode.transitions.test.ts        ← 8 mode 状态机转换 + Local_Action_Wins 抑制
formVariant.test.ts                ← 4 variant 自动检测优先级 + manual lock 4h
agenticCommerce.test.ts            ← evaluateAgenticAction 决策矩阵(限额 / 余额 / 类目 / 冻结)
crossDeviceToken.test.ts           ← token 生成 + 校验 + 30s 失效
ambientPresence/index.test.ts      ← AppState 切换 → start/stop logic(用 mock LiveActivity / Overlay)
systemAssistantBridge.test.ts      ← 5 个反向调用 + 用户拒绝 LLM feedback
```

复用现有但需新增测试:

```
petMode.test.ts(已 shipped)       ← 加 8 mode 全部覆盖
petModeAdapters.test.ts(已 shipped)← 加 11 个 presence 主题桥接
```

### Integration Tests

```
src/components/companion/__tests__/
  ├─ CompanionBall.integration.test.tsx   ← 单击/长按/右滑 → 对应 sheet 触发
  ├─ ConversationBubble.integration.test.tsx ← present + voice + 拍照 + 路由切换
  ├─ PetDetailSheet.integration.test.tsx     ← 9 section + 切宠物 + 展开二级页
  └─ Trust3SigningSheet.integration.test.tsx ← 完整签名流程 + 60s timeout + 锁定
```

### Maestro E2E(`.maestro/47-mobile-pet-companion-redesign.yaml`)

按 Sprint 分 part1/2/3 累计 20+ 场景:

- **part1(P-9.1 末)**:启动默认 World + 4 tab 切换 + 浮球可见跨 tab + Summon 隐藏 + 单击 Conversation_Bubble + 长按 PetDetailSheet
- **part2(P-9.2 末)**:Trust3 完整签名 + Active_Pet 切换 + Voice_Greet `manual` + Voice_Greet 静音/勿扰静默 + missed_you whisper 模拟
- **part3(P-9.3 末)**:Live Activity 锁屏可见(iOS)+ 灵动岛 CTA + 5 个新 intents 各至少 1 次端到端 + Remote Control 桌面 ack 模拟 + Android Overlay 授权流程
- **part4(P-9.4 末,完整版)**:CompanionSettings 切换 Form_Variant 立即生效 + Agentic_Commerce 自主交易触发 + 老 deeplink 重定向 + feature flag 关闭回退基线

### 性能采样(生产)

```typescript
// src/services/performance.service.ts(扩展)
// 每个组件挂载/sheet present 都打 timing,P95 取一周采样
const PERFORMANCE_BUDGETS = { /* 参见 §Monitoring */ };
```

每周由 ops 检查 P95 是否落在 budget 内,超出立 ticket。

### 跨端集成测试(手动)

桌面 + 移动 + Watch 三端配对账号,验证 R8/R9 场景:

- 桌面切灵魂 → 移动浮球 sprite 1s 内同步 ✓
- 移动喂食 → 桌面宠物 1s 内播 eat 动画 ✓
- 移动发"远程控制桌面开 Pro Mode" → 桌面 5s 内启动 Pro Mode ✓
- 桌面端高风险 approval → 移动浮球 nudge + Trust3 → 签名后桌面继续执行 ✓


- Q1(Voice_Greet 文案 LLM)→ ✅ 复用 pet_diary 链路,新增 `GET /pet/greet` 端点,见 backend 新增 API §2
- Q2(iOS Live Activity 实施)→ Phase 1 用 expo-live-activity 社区库,fallback 自建 Swift Extension
- Q5(Trust3 anti-tamper)→ 复用现有 mpc-wallet attestation,Phase 1 不增强
- Q8(Cross_Device 配对协议)→ 复用 WalletConnect deeplink,不新建 PairingScreen
- 其余 Q3 / Q4 / Q6 / Q7 / Q9 / Q10 / Q11 / Q12 留给 tasks 阶段实施时决定。

## Next Step

design 完成后进入 tasks.md(可执行任务清单)。Sprint 4 个段、~40 个 task 已经在 §Sprint 路线给出大纲,tasks.md 会把它们落到 `- [ ]` checkbox + 依赖图 + 验收条件。

