# Design Document

## Overview

本设计为 `soul-companion-onboarding` 给出落地方案:登录后首次进入的「灵魂诞生(Soul_Birth)」五段引导主线,以及由它延伸出的三块常驻能力——日历/邮箱 OAuth 连接器、桌面端跨端常驻 banner + presence、全端随时问答陪伴(Companion_QA)。

设计的第一原则是 **最大化复用、最小化新建**。需求引言已确认产品内核是「用户拥有一个属于自己的云端 AI agent(Claw_Instance),宠物/灵魂是它的皮肤」,因此本设计:

- **复用** 现有的云端孵化(`provisionCloudAgent` / `getInstanceById`)、QR 配对(`createBindSession` / `pollBindSession`)、relay 状态(`getRelayStatus`)、语音合成(`/voice/tts`)、定位与 geocoding(`mapStyle.geocodeAddress`)、永曜城圈地/附近的人/签到、连接器目录框架(`connector-catalog` + `ConnectorService`)、移动浮球(`CompanionLayer` / `GlobalFloatingBall`)、AXP 经济(`RealityLoopService.rewardFromReality`)、WS 流式对话(`streamAgentChat`)。
- **新建** 三处真正缺失的能力:① 移动端 `soulBirthStore` 五段编排器(由现有 4 步 `firstRunStore` 改造、移除 battle);② 后端 OAuth 连接器鉴权链路(授权 URL 生成 + 回调换 token + 加密存储 + 刷新 + 撤销 + 日程/未读读取);③ 跨端 presence(心跳上报 + 状态查询/推送 + 离线检测)。

### 设计目标与约束映射

| 约束 | 设计应对 |
| --- | --- |
| C1 砍掉战斗 | `soulBirthStore` 五步枚举不含 `battle`;`firstRunStore` 的 battle 步骤及其自动推进点全部移除。 |
| C2 不依赖 3D/战斗 | 五段全部基于「起名+选皮肤+云端 provision+语音+OAuth+地图」,无任何 3D mesh / 回合战斗依赖。 |
| C3 登录前置 | 编排器在 `RootNavigator` 的已登录(Main)分支首次进入时挂载,不在游客态触发。 |
| C4 位置/天气可选 | `Weather_Garnish` 与定位走「超时即跳过」短路;主线状态机不 await 天气结果。 |
| C5 第一句话必达 | `Birth_Moment_Line` 纯本地时间模板生成;TTS 失败降级为文字气泡。 |
| C6 TTS 成本与缓存 | TTS 模板文案做本地音频缓存 + 同会话播报限频(节流闸)。 |
| C7 OAuth 新建 | 新增 `ConnectorOAuthService` + `OAuthToken` 实体 + 授权/回调/读取端点,`ConnectorService.install` 增加 `oauth` 分支。 |
| C8 跨端配对复用 | Desktop_Banner 首连直接复用 `bind-session` QR 链路,不新建协议。 |
| C9 一次性与可重看 | `soulBirthStore` MMKV 持久化「已完成/已终止」;提供 reset 入口供「重看引导」。 |

### Requirements 覆盖对照

| 需求 | 主要设计章节 | 性质 |
| --- | --- | --- |
| R1 Soul_Birth 编排 | §2 Soul_Birth 编排器 | 改造(firstRunStore→soulBirthStore) |
| R2 诞生你的 AI | §2 + §3.1(provision 覆盖动画) | 复用 provision + 改造 banner |
| R3 灵魂第一句话 | §3 第一句话 + TTS | 新建文案层 + 复用 /voice/tts |
| R4 办成第一件真事 | §4 OAuth 读取 + §2 编排 | 复用 AXP + 依赖 §5 OAuth |
| R5 安家永曜城 | §2 编排(settle_aeon 段) | 复用 Aeon 既有能力 |
| R6 OAuth 连接器 | §5 OAuth 连接器后端 | **净新建(最大块)** |
| R7 桌面端常驻 banner | §6 Desktop_Banner | 新建 UI + 复用 QR 配对 |
| R8 跨端 presence | §7 Cross_Device_Presence | **净新建** |
| R9 全端随时问答陪伴 | §8 Companion_QA | 复用浮球 + 流式对话,跨端收敛 |

## Architecture

### 组件总览

```
┌──────────────────────────── 移动端 (React Native / Expo) ───────────────────────────┐
│  RootNavigator (已登录 Main 分支)                                                     │
│    └─ SoulBirthHost (新)  ── 监听 soulBirthStore，按 step 渲染覆盖层/引导            │
│         soulBirthStore (新, 由 firstRunStore 改造)  ── 5 步状态机 + MMKV 持久化      │
│           steps: birth → first_words → first_task → connect_desktop → settle_aeon   │
│    ├─ BirthMomentLine 文案层 (新)  ── 本地时间主句 + 可选天气追加                     │
│    ├─ Desktop_Banner (新)  ── 常驻入口 + 首连引导(复用 QR）+ presence 状态          │
│    └─ CompanionLayer / GlobalFloatingBall (复用)  ── Companion_QA 唤起入口           │
└──────────┬───────────────────────────┬──────────────────────┬───────────────────────┘
           │ provision / instances      │ /voice/tts            │ /v1/connectors/*
           │ bind-session / relay-status │ streamAgentChat (WS)  │ presence/* (新)
           ▼                             ▼                       ▼
┌──────────────────────────── 后端 (NestJS + PostgreSQL) ──────────────────────────────┐
│  openclaw-connection (复用)  provision / bind-session / relay-status                  │
│  voice (复用)  /voice/tts (Edge TTS + Polly)                                          │
│  connector (扩展)                                                                     │
│    ├─ ConnectorService.install  ── 增加 oauth 分支 (新)                               │
│    ├─ ConnectorOAuthService (新)  authorizeUrl / handleCallback / refresh / revoke    │
│    ├─ CalendarEmailReadoutService (新)  todayEventsCount / unreadCount                │
│    └─ OAuthToken entity (新, 加密存储)                                                │
│  presence (新模块)  PresenceService  report / query  + 心跳超时离线                   │
│  aeon/reality (复用)  RealityLoopService.rewardFromReality                            │
└──────────┬────────────────────────────────────────────────────────────────────────┘
           │ relay-status / presence query / streamAgentChat (WS)
           ▼
┌──────────────────────────── 桌面端 (Tauri 2.0) ──────────────────────────────────────┐
│  启动自动检测 relay → 上报 presence(desktop 端)                                      │
│  ChatPanelImpl (复用)  ── 桌面侧 Companion_QA 常驻问答面板                            │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### Soul_Birth 状态机

编排器是一个「已完成步骤集合 + 当前指针 + 终止标志」的状态机。指针解析规则同时满足 R1.1 / R1.2 / R1.2a / R1.4:

```
解析当前步骤 currentStep(completed):
  按固定顺序 [birth, first_words, first_task, connect_desktop, settle_aeon] 遍历
  返回第一个 completed[step] == false 的 step
  若全部完成 → null(进入终止)

"skip-earlier-if-later-done"(R1.2a):
  在解析前先用外部事实回填 completed:
    - 已有可用 Claw_Instance(getMyInstances 非空)        → birth = true
    - 已成功配对过桌面端(relay-status.connected 曾为真)  → connect_desktop = true
    - 已圈过地(claimPlot 历史非空)                       → settle_aeon = true
  回填后再取「第一个未完成」即自动跳过较早但已达成的步骤。
```

状态转移:

```
                 markStep(step)            skip()
   [active] ─────────────────────────▶ 推进指针 ──▶ 指针==null ─▶ [terminated]
      │                                                              ▲
      │  skip() / 任意步骤"跳过"                                      │
      └──────────────────────────────────────────────────────────────┘
   [terminated] ──reset()(重看引导)──▶ 清空 completed + 回到 birth ─▶ [active]
```

终止后 `terminated=true` 持久化到 MMKV,`SoulBirthHost` 不再自动挂载覆盖层(R1.6 / C9)。「重看引导」调用 `reset()` 把 `completed` 清空且 `terminated=false`(R1.7)。

## Components and Interfaces

### §1 概览:新建 vs 复用清单

**净新建(NET-NEW)**

1. 后端 `ConnectorOAuthService` + `OAuthToken` 实体 + OAuth 授权/回调/读取/撤销端点(R6,§5)。
2. 后端 `presence` 模块:`PresenceService` + `DevicePresence` 状态 + 心跳超时离线(R8,§7)。
3. 移动端 `soulBirthStore`(由 `firstRunStore` 改造,5 步、移除 battle)+ `SoulBirthHost` 挂载层(R1/R2,§2)。
4. 移动端 `BirthMomentLine` 文案层 + TTS 节流缓存封装(R3,§3)。
5. 移动端 `DesktopBanner` 常驻组件(R7,§6)。

**复用(REUSED,不重写)**

- `provisionCloudAgent` / `getInstanceById`(云端孵化与轮询)。
- `createBindSession` / `pollBindSession`(桌面首连 QR 配对)、`getRelayStatus`(relay 连接判定)。
- `/voice/tts`(TTS 合成)、`AudioQueuePlayer`(播放队列)。
- `mapStyle.geocodeAddress` / GPS 定位、Aeon `claimPlot` / `findNearbyPeople` / `checkInPlot`(+15 AXP)。
- `ConnectorService` 目录/安装框架、`connector-catalog`。
- `CompanionLayer` / `GlobalFloatingBall` / `companionSheets.conversation`、`streamAgentChat`(WS 流式)。
- 桌面 `ChatPanelImpl`(桌面侧问答面板)。
- `RealityLoopService.rewardFromReality`(AXP 发放)。

---

### §2 Soul_Birth 编排器(移动端)

#### 2.1 soulBirthStore(改造 firstRunStore)

把现有 `src/stores/firstRunStore.ts` 改造为 `src/stores/soulBirthStore.ts`(保留 MMKV + zustand persist 约定,沿用 `firstRunStore` 的 `complete/reset` 模式)。关键差异:4 步 → 5 步、移除 `battle`、新增 `terminated` 终止标志与 `recompute`(外部事实回填)。

```ts
export type OnboardingStep =
  | 'birth' | 'first_words' | 'first_task' | 'connect_desktop' | 'settle_aeon';

export const SOUL_BIRTH_STEPS: OnboardingStep[] =
  ['birth', 'first_words', 'first_task', 'connect_desktop', 'settle_aeon'];

interface SoulBirthState {
  completed: Record<OnboardingStep, boolean>;
  terminated: boolean;            // 完成或跳过后置真,不再自动触发(R1.6/C9)
  instanceId: string | null;      // birth 段 provision 出的 Claw_Instance
  petName: string | null;         // 用户输入名称(R2.8)
  avatarId: string | null;        // 选定皮肤(默认灵狐 clan A)
  complete: (s: OnboardingStep) => void;   // 幂等标记完成 + 推进(R1.3)
  skip: () => void;                         // 结束主线(R1.5)
  reset: () => void;                        // 重看引导(R1.7)
  recompute: (facts: ExternalFacts) => void;// skip-earlier-if-later-done 回填(R1.2a)
}

// 当前步骤:第一个未完成;全部完成返回 null
export function currentStep(c: Record<OnboardingStep, boolean>): OnboardingStep | null;
```

`ExternalFacts = { hasInstance: boolean; desktopPairedBefore: boolean; hasClaimedPlot: boolean }`,由 `SoulBirthHost` 挂载时拉取(`getMyInstances` / relay 历史 / `claimPlot` 历史)填入。

> **迁移说明**:`firstRunStore`(`agentrix-first-run-v1`)与 `FirstRunQuestBanner` 一并退役;`soulBirthStore` 使用新持久化 key `agentrix-soul-birth-v1`,不复用旧数据(旧 4 步语义含 battle,无法平滑映射)。WorldHubScreen 中 `<FirstRunQuestBanner/>` 的挂载点移除。原 battle 自动推进点(`WorldInteractiveBattleScreen`)删除其 `markFirstRunStep('battle')` 调用。

#### 2.2 SoulBirthHost(挂载与渲染)

新增 `src/components/onboarding/SoulBirthHost.tsx`,挂载在 `RootNavigator` 已登录(Main)分支之上(覆盖层形式,不替换路由树),满足 R1.1「登录后首次进入主界面」。

```
SoulBirthHost 渲染决策:
  if (!isAuthenticated || isGuest) return null            // C3 登录前置
  if (terminated) return null                             // C9
  step = currentStep(completed)
  if (step == null) { store.markTerminated(); return null }
  switch(step):
    birth          → <BirthStep/>          (起名 + 选皮肤 + provision 覆盖动画)
    first_words    → <FirstWordsStep/>     (Birth_Moment_Line + 可选天气 + TTS)
    first_task     → <FirstTaskStep/>      (OAuth 授权 + 日程/未读播报)
    connect_desktop→ <ConnectDesktopStep/> (复用 DesktopBanner 首连引导)
    settle_aeon    → <SettleAeonStep/>     (圈地 + 附近的人 + 签到)
```

每个 Step 组件顶部有统一「跳过」入口(调用 `skip()`,R1.5)。各 Step 在真实完成点调用 `complete(step)` 推进(R1.3)。

#### 2.3 birth 段(R2)

- 复用 `CloudDeployScreen` 的「起名 + 选 LLM」表单要素,但收敛为引导内嵌卡片:名称输入 + 皮肤选择器(默认灵狐 clan A,R2.2)+ 三按钮「换一个 / 拍一张 / 去市场选」(R2.3,分别切换内置 / 进 WorldEngineScanner 拍照 / 进皮肤市场)。
- 确认后调用 `provisionCloudAgent({ name, llmProvider })`(R2.4),进入「灵魂正在苏醒」覆盖动画(见 §3.1),**隐藏原始进度条**(R2.5)。
- 轮询 `getInstanceById` 直到 `status` 可用:成功 → 存 `instanceId/petName/avatarId`,`complete('birth')` 推进(R2.7);失败/超时处理见 §3.1。

---

### §3 第一句话 + provision 等待动画 + TTS

#### 3.1 「灵魂正在苏醒」覆盖动画与重试(R2.5/R2.6/R2.6a/R2.6b)

```
启动 provision → 立即显示苏醒动画(全屏柔光呼吸 + 文案轮播)
并行:
  poll = setInterval(getInstanceById, 3s)
  hardTimeout = setTimeout(90s)
状态判定:
  poll 成功(实例可用)         → 停动画, complete('birth')
  poll/provision 返回失败(早于 90s) → 立即停动画, 显示可重试提示(R2.6a)
  hardTimeout 触发(仍无结果)   → 停动画, 显示可重试提示(R2.6)
  在任一结束态出现前           → 动画持续(R2.6b)
重试:
  保留 petName/avatarId(R2.6/R2.6a),重新 provision;不要求用户重输。
```

#### 3.2 Birth_Moment_Line(本地必达,R3.1/R3.2/C5)

纯本地时间模板,新增 `src/services/onboarding/birthMomentLine.ts`:

```ts
// 不依赖任何外部服务(C5)
export function buildBirthMomentLine(now = new Date(), petName?: string): string {
  // 例:"我在 2026年6月4日 20:13 这一刻,被你赋予了灵魂。"
  // petName 存在时可个性化:"我是{petName}……"
}
```

#### 3.3 Weather_Garnish(可选追加,R3.5/R3.6/C4)

```
追加句获取(全程非阻塞主句):
  loc = await withTimeout(getLocation(), 5s)        // 失败/超时 → 跳过
  if (!loc) return null                              // R3.6 静默跳过
  wx  = await withTimeout(fetchWeather(loc), 5s)     // 失败 → 跳过
  if (!wx) return null
  return weatherGarnishLine(wx)   // 例:"你那边在下雨,记得带伞。"
```

主句先播,天气句作为后续追加;天气链路任一环失败都不影响主句,也不延迟主句(C4)。天气数据可复用后端 `connector weather`(Open-Meteo)或前端直连;定位复用 GPS + `geocodeAddress` 兜底。

#### 3.4 TTS 封装:缓存 + 限频(R3.3/R3.4/R3.8/C6)

新增 `src/services/onboarding/ttsSpeaker.ts` 包裹 `/voice/tts`:

```
speak(text, { lang='zh', voice }):
  key = hash(text + voice + lang)
  if (audioCache.has(key)) play(cached)          // R3.8 模板复用缓存
  else:
    if (rateLimiter.blocked()) skipOrText()      // R9.8/C6 同会话限频
    audio = await fetch(/voice/tts?...) → cache.set(key)
    play(audio)
  onError → 文字气泡展示 text(R3.4 降级,不卡流程)
```

- 缓存键基于「模板化文本 + 音色 + 语言」;Birth_Moment_Line 这类高复用文案命中缓存即不再请求(C6)。
- `rateLimiter`:同一会话内最小播报间隔 + 并发上限,超出则丢弃或降级文字(C6 / R9.8)。
- 播放复用现有 `AudioQueuePlayer`。

播报结束(或用户跳过)→ `complete('first_words')`(R3.7)。

---

### §4 办成第一件真事:OAuth 授权 → 日程/未读播报(R4)

`FirstTaskStep` 编排(移动端):

```
进入 first_task:
  展示「让它帮你办成第一件事」选择:连接日历 / 连接邮箱 / 跳过
  用户选 OAuth 连接器:
    → ConnectorService oauth 安装流程(§5.3,打开授权页 → 回调)
    授权成功:
      readout = GET /v1/connectors/:id/readout   // 当天日程数 / 未读数(§5.4)
      ttsSpeaker.speak("你今天有 N 个安排" / "有 N 封未读")   // R4.3
      reward = rewardFromReality(userId, AXP, 'first_task_done', idemKey)  // R4.4 一次性
      钱包跳动可视化(失败不影响发放,参考 R5.3a 同款降级)
      complete('first_task')                       // R4.7
    授权失败/读取失败:
      可重试或可跳过提示,不阻塞主线(R4.6)
  用户拒绝/跳过:
      complete('first_task')(跳过 readout,R4.5)
```

AXP 发放复用 `RealityLoopService.rewardFromReality(userId, amount, reason, idempotencyKey)`,`idempotencyKey` 用固定串(如 `soul-birth-first-task-{userId}`)保证「一次性」(R4.4)。

---

### §5 日历/邮箱 OAuth 连接器后端(净新建,最大块,R6)

现状:`connector-catalog` 含 `oauth` 占位(notion 等标 coming_soon),但 `ConnectorService.install` **仅实现 none/api_key/bearer**(C7)。本节新建完整 OAuth 链路。

#### 5.1 目录条目(connector-catalog.ts)

新增并置为 `status: 'live'`:

```ts
{ id: 'google-calendar', name: 'Google 日历', category: 'productivity',
  kind: 'builtin', status: 'live', authKind: 'oauth',
  description: '读取你的 Google 日历,念出今天的安排。', reality: true, rewardAxp: 12 },
{ id: 'gmail', name: 'Gmail', category: 'productivity',
  kind: 'builtin', status: 'live', authKind: 'oauth',
  description: '读取未读邮件数量,帮你盯收件箱。', reality: true, rewardAxp: 12 },
// 国内/Google 不可达兜底(R6.6,不限定地域):
{ id: 'system-calendar', name: '系统日历', category: 'productivity',
  kind: 'builtin', status: 'live', authKind: 'none', chinaAvailable: true,
  description: '读取本机系统日历的今日日程(无需 Google)。' },
{ id: 'imap-email', name: 'IMAP 邮箱', category: 'productivity',
  kind: 'builtin', status: 'live', authKind: 'api_key', chinaAvailable: true,
  description: '通过 IMAP 连接任意邮箱,统计未读(无需 Google)。' },
```

> `ConnectorDef` 需为 oauth 类补充可选元信息字段:`oauthProvider`、`oauthScopes: string[]`。`system-calendar` 走端侧系统日历读取(移动端本地 API),`imap-email` 走 api_key 既有分支(host/port/user/pass 存 credentials)。

#### 5.2 OAuthToken 实体(加密存储,R6.2/R6.8)

新增 `backend/src/modules/connector/oauth-token.entity.ts`(全局 SnakeNamingStrategy,`@Column()` 不写 `name:`):

```ts
@Entity('connector_oauth_tokens')
@Unique(['userId', 'connectorId'])
export class OAuthToken {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) userId: string;
  @Column({ type: 'varchar', length: 64 }) connectorId: string;
  @Column({ type: 'text' }) accessTokenEnc: string;     // AES-256-GCM 密文
  @Column({ type: 'text', nullable: true }) refreshTokenEnc: string | null;
  @Column({ type: 'timestamptz', nullable: true }) expiresAt: Date | null;
  @Column({ type: 'text', nullable: true }) scope: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
```

加密:新增 `TokenCipher`(Node `crypto` AES-256-GCM),密钥取环境变量 `CONNECTOR_TOKEN_KEY`(32 字节)。token 永不落明文日志(R6.8);日志只记 connectorId + 用户 id + 成功/失败。

> **迁移**:新增 migration 建 `connector_oauth_tokens` 表(`backend/src/migrations/`),按既有命名约定。

#### 5.3 ConnectorOAuthService(净新建,R6.2/R6.3/R6.4/R6.7)

新增 `backend/src/modules/connector/connector-oauth.service.ts`:

```ts
authorizeUrl(userId, connectorId): { url, state }
  // 生成 provider 授权 URL(client_id + redirect_uri + scope + state)
  // state = 签名串(userId + connectorId + nonce + ts),回调校验防 CSRF

handleCallback(code, state): ConnectorInstallResult
  // 校验 state → 用 code 向 provider 换 access/refresh token
  // 加密落 OAuthToken;ConnectorService 落 UserConnector(enabled, kind=oauth)
  // 失败(用户取消/provider error)→ 抛描述性错误,不建无效安装记录(R6.4)

getValidAccessToken(userId, connectorId): string
  // 读 OAuthToken;若 expiresAt 临近且有 refreshToken → 刷新并回写(R6.3)

revoke(userId, connectorId): void
  // 调 provider revoke(best-effort)+ 删 OAuthToken + 卸 UserConnector(R6.7)
```

`ConnectorService.install` 增加 `oauth` 分支:不直接装,而是返回 `{ needsOAuth: true, authorizeUrl }` 引导前端跳转;真正落库在 `handleCallback`。

#### 5.4 CalendarEmailReadout(R4.3/R6.5)

新增 `backend/src/modules/connector/calendar-email-readout.service.ts`:

```ts
todaySummary(userId, connectorId): { kind:'calendar'|'email', count:number, items?:string[] }
  google-calendar → Calendar API events.list(timeMin=今日0点,timeMax=次日0点) → count
  gmail           → Gmail API users.messages.list(q='is:unread') → resultSizeEstimate
  system-calendar → 由移动端本地读取后回传 count(端侧)
  imap-email      → IMAP SEARCH UNSEEN → count
```

#### 5.5 控制器端点(connector.controller.ts 扩展)

```
GET  /v1/connectors/:id/oauth/authorize-url   → { url, state }     (R6.2)
GET  /v1/connectors/oauth/callback            ← provider 回调(Public,内部校验 state)(R6.2/R6.4)
GET  /v1/connectors/:id/readout               → 当天日程/未读(R4.3/R6.5)
DELETE /v1/connectors/:id/oauth               → 撤销授权(R6.7)
```

回调端点用 `@Public()` + state 校验(非 JWT,因 provider 跳回无 Bearer);其余沿用 `JwtAuthGuard`。

---

### §6 桌面端跨端常驻 banner(R7)

新增 `src/components/desktop/DesktopBanner.tsx`,在主界面常驻(R7.1)。

```
DesktopBanner 状态:
  pairedBefore = relay 历史 / getMyInstances 中存在 local 实例
  展开点击:
    介绍多端特色(R7.2):手机=陪伴/查询/管日程;桌面=Computer Use/vibe coding;
                        同一灵魂、同一记忆跨端同步
    if (!pairedBefore):  「连接电脑」→ 首连引导(R7.3)
        复用 createBindSession() → 展示 QR + 下载链接 + 配对步骤(C8/R7.4)
        轮询 pollBindSession(sessionId) until confirmed
        confirmed → 建立 presence(§7)+ 若在 connect_desktop 段则 complete (R7.7)
    else (R7.3a):  直接展示跨端状态/管理入口(presence 设备列表),跳过首连引导
```

与编排器衔接(R7.5/R7.6):`ConnectDesktopStep` 内嵌 `DesktopBanner` 的首连引导;用户选「稍后连接」→ `complete('connect_desktop')` 且 banner 在主界面继续常驻(R7.6)。

---

### §7 跨端 presence(净新建,R8)

新增后端模块 `backend/src/modules/presence/`。沿用 `geo-presence.service.ts` 的「内存 TTL map」先例做轻量实现,跨端推送复用现有 WS 通道。

#### 7.1 PresenceService

```ts
report(userId, instanceId, device: 'mobile'|'desktop', ttlSec=30): void
  // 心跳:写/刷新 map[(instanceId, device)] = { lastSeen: now, online: true }
  // 状态变化(offline→online)→ 推送 presence:update 给该实例其它在线端(R8.1/R8.2)

query(userId, instanceId): DevicePresence[]
  // 返回该实例各端在线状态 + lastSeen(供设备列表展示,R8.5)

sweep():  // 定时(如每 5s)扫描
  // lastSeen 超过 ttl → 立即标记 offline 并推送(R8.6 心跳超时即离线,不删配对)
```

`DevicePresence = { device, online, lastSeen }`。

#### 7.2 端点 / 通道

```
POST /v1/presence/heartbeat   { instanceId, device }   → 心跳上报(R8.1/R8.3)
GET  /v1/presence/:instanceId                          → 设备在线列表(R8.5)
WS   presence:update 事件(复用现有 openclaw WS 网关广播)→ 5s 内同步(R8.4)
```

#### 7.3 客户端行为

- 移动端:进入主界面后周期 `heartbeat(device='mobile')`;订阅 `presence:update` 更新 UI 设备列表;`DesktopBanner` 展示「桌面端在线/离线」。
- 桌面端(Tauri):启动即检测 relay(`getRelayStatus`)并 `heartbeat(device='desktop')`(R8.2「打开桌面端自动检测」);失去网络 → 心跳停 → 后端 sweep 在 ttl 超时即判离线(R8.6)。
- 离线判定优先级:心跳超时立即离线(R8.6),即便该端正尝试重连;重连成功后心跳恢复 → 重新在线。配对关系(UserConnector/local 实例)不因离线删除。

---

### §8 全端随时问答陪伴 Companion_QA(R9)

收敛为「移动浮球 + 桌面面板 共用同一 Claw_Instance 流式对话与记忆」,不新建对话引擎。

```
移动端:CompanionLayer → GlobalFloatingBall(常驻浮球,R9.1/R9.7)
        tap → companionSheets.conversation.present()(ConversationBubble)
        提问 → streamAgentChat(instanceId, message, ctx)(WS 流式,R9.2/R9.4)
桌面端:ChatPanelImpl 作为常驻问答面板(R9.1)
        同 instanceId 走同一后端会话/记忆
上下文(R9.3):payload 携带 { device, scene/route, 当前任务态 } 使回答上下文感知
记忆(R9.5/R9.6):同一 Claw_Instance 的会话记忆由后端按 instanceId 存取,
        任一端新增记忆对其它端后续对话可见(后端单一记忆源)
限频(R9.8):语音播报复用 §3.4 ttsSpeaker 的同会话节流
```

「在其它应用/场景中悬浮唤起而不离开当前场景」(R9.7):移动端复用 `GlobalFloatingBall` 屏内浮层;桌面端复用悬浮窗/浮球形态(`docs/desktop-pet-interaction-spec.md` 既定形态)。

## Data Models

### 新增数据表

**connector_oauth_tokens**(R6.2/R6.8)

| 列 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid PK | |
| user_id | uuid | 所属用户 |
| connector_id | varchar(64) | 目录连接器 id |
| access_token_enc | text | AES-256-GCM 密文 |
| refresh_token_enc | text null | 刷新令牌密文 |
| expires_at | timestamptz null | 访问令牌过期时刻 |
| scope | text null | 授权范围 |
| created_at / updated_at | timestamptz | |

唯一约束 `(user_id, connector_id)`。需新建 migration。

**device_presence**(R8;MVP 可纯内存,持久化为可选增强)

若选择落库:`(instance_id, device)` 唯一,字段 `online boolean`、`last_seen timestamptz`。MVP 优先内存 TTL map(参考 `geo-presence.service.ts`),重启后由心跳自然重建。

### 复用/扩展的现有模型

- `UserConnector`(扩展使用):oauth 类安装后 `enabled=true`,`credentials` 仅存非敏感元信息(敏感 token 入 `connector_oauth_tokens`,**不**进 `credentials` 明文)。
- `ConnectorDef`(扩展类型):新增可选 `oauthProvider?: string`、`oauthScopes?: string[]`。

### 移动端持久化(MMKV)

`agentrix-soul-birth-v1`:`{ completed, terminated, instanceId, petName, avatarId }`(沿用 `mmkvStorage` + zustand persist 约定)。

### 共享类型(shared/types/)

- `shared/types/connector.ts`:扩展 `ConnectorInstallResult` 增加可选 `needsOAuth?: boolean`、`authorizeUrl?: string`;新增 `CalendarEmailReadout`、`DevicePresence` 类型(≥2 端使用,按 AGENTS.md 落 `shared/types/`)。

## Error Handling

| 场景 | 处理 | 依据 |
| --- | --- | --- |
| provision 90s 超时 | 停动画 → 可重试提示,保留 name/avatar | R2.6 |
| provision 提前失败 | 立即可重试提示(不等 90s) | R2.6a |
| TTS 合成/播放失败 | 降级文字气泡,继续主线 | R3.4/C5 |
| 定位/天气失败或超时(5s) | 静默跳过 Weather_Garnish,不阻塞主句 | R3.6/C4 |
| OAuth 用户取消/回调 error | 描述性错误,不建无效安装记录 | R6.4 |
| OAuth 读取失败 | first_task 可重试/可跳过,不阻塞主线 | R4.6 |
| Google 不可达 | 提供 system-calendar / imap-email 兜底 | R6.6 |
| 钱包跳动动画失败 | AXP 仍发放成功,签到/办事照常计成功 | R5.3a/R4.4 |
| 无定位无法圈地 | 允许跳过 settle_aeon,不报错阻塞 | R5.4 |
| presence 心跳超时 | 立即标离线,不删配对,重连后恢复 | R8.6 |
| TTS 同会话高频 | 节流闸丢弃/降级文字 | R9.8/C6 |

统一原则:**任何外部依赖失败都不得卡住 Soul_Birth 主线**;主线只在「真实完成」或「用户跳过」时推进。

## Security Considerations

- **OAuth 令牌加密落库**:`access_token` / `refresh_token` 经 AES-256-GCM 加密存 `connector_oauth_tokens`,密钥来自环境变量,不入 `UserConnector.credentials` 明文(R6.8)。
- **回调防 CSRF**:授权 URL 带签名 `state`(userId + connectorId + nonce + ts),回调严格校验,过期/不匹配拒绝(R6.4)。
- **最小权限 scope**:Google Calendar 仅 `calendar.readonly`,Gmail 仅 `gmail.readonly`/`gmail.metadata`,只读不写。
- **日志脱敏**:令牌、邮件正文、日程标题不写日志/诊断;只记 connectorId + 计数(R6.8)。
- **撤销即清除**:revoke 删除本地令牌并 best-effort 调用 provider revoke,之后拒绝该连接器数据访问(R6.7)。
- **presence 鉴权**:心跳/查询走 `JwtAuthGuard`,只能上报/查询自己拥有的 instance。
- **回调端点暴露面**:`oauth/callback` 为必要的公开端点,但仅接受合法 state;无 state 或校验失败直接 400,避免成为开放重定向。

## Testing Strategy

> 环境约束:当前 Windows 检出无法本地跑 tsc/jest/Metro;落地时以 `getDiagnostics` + CI(APK build-apk step 18 JS bundle/Kotlin)为主要门禁。下列为实现阶段应补的测试。

**后端单测(jest)**
- `ConnectorOAuthService`:authorizeUrl 生成 state、handleCallback 成功/取消/error、刷新令牌、revoke 清除。
- `TokenCipher`:加解密往返、密钥缺失报错、密文不含明文。
- `CalendarEmailReadout`:google/gmail/imap 计数(provider mock)。
- `PresenceService`:report/query、sweep 超时离线、重连恢复在线。

**移动端单测**
- `soulBirthStore`:currentStep 解析、skip-earlier-if-later-done 回填(R1.2a)、续跑(R1.4)、reset(R1.7)、terminated 不再触发(R1.6)。
- `birthMomentLine`:固定时间生成稳定文案(R3.1/R3.2)。
- `ttsSpeaker`:缓存命中不重复请求、限频丢弃、失败降级文字(R3.4/R3.8/C6)。
- Weather_Garnish:定位/天气超时即返回 null,主句不受影响(R3.6/C4)。

**集成 / E2E(Maestro,接现有 `.maestro/` 体系)**
- Soul_Birth happy path:登录 → 起名选皮肤 → 苏醒动画 → 第一句话 → 跳过 OAuth → 桌面 banner 稍后 → 圈地签到 → 终止。
- 续跑:中途杀进程重进,从未完成步续跑。
- OAuth 兜底:模拟 Google 不可达,出现 system-calendar/imap 选项。

**手动验证(无自动化覆盖处)**
- 真实 Google OAuth 授权回跳与读取(需真实 client_id/secret 配置)。
- 跨端 presence:移动端 + 桌面端真机,断网后离线判定与恢复。

## Correctness Properties

以下不变式贯穿实现,任何改动都应保持成立:

### Property 1: 主线必达
无论 provision / TTS / 定位 / 天气 / OAuth / presence 任一外部依赖失败,Soul_Birth 主线都不会卡死——`currentStep` 始终能因「真实完成」或「用户跳过」而推进或终止。
**Validates: Requirements 1.5, 3.4, 3.6, 4.6**

### Property 2: 第一句话纯本地
`buildBirthMomentLine` 的输出只依赖本地时钟与可选 petName,不发起任何网络调用,因此 100% 可生成。
**Validates: Requirements 3.1, 3.2**

### Property 3: 步骤单调推进
`completed[step]` 一旦置真不会在同一生命周期内被自动置假;只有 `reset()`(重看引导)能整体清空。
**Validates: Requirements 1.3, 1.7**

### Property 4: 指针 = 第一个未完成
`currentStep` 永远返回固定顺序中第一个 `false` 的步骤;全 true 时返回 null 并触发 `terminated`。
**Validates: Requirements 1.1, 1.2, 1.6**

### Property 5: 较后已达成则跳过较早
经 `recompute` 回填外部事实后,已达成的较后步骤为 true,指针自动跳过其之前未完成项。
**Validates: Requirements 1.2, 1.4**

### Property 6: 令牌不外泄
任何代码路径都不把 `access_token`/`refresh_token`/邮件正文/日程标题写入日志或 `UserConnector.credentials` 明文;落库一律密文。
**Validates: Requirements 6.8**

### Property 7: OAuth 原子性
`handleCallback` 仅在成功换取 token 后才创建 `UserConnector` + `OAuthToken`;取消/错误路径不产生任何安装记录。
**Validates: Requirements 6.4**

### Property 8: AXP 幂等
`first_task` 与 `settle_aeon` 的 AXP 发放使用固定 `idempotencyKey`,重复触发不重复发放;可视化失败不回滚已发放金额。
**Validates: Requirements 4.4, 5.3**

### Property 9: presence 离线即时
心跳超过 ttl 即判离线,与该端是否重连无关;配对关系不因离线删除。
**Validates: Requirements 8.6**

### Property 10: TTS 节流
同一会话内播报受 `rateLimiter` 约束,命中缓存的模板文案不重复发起合成。
**Validates: Requirements 3.8, 9.8**

### Property 11: 跨端单一记忆源
Companion_QA 记忆按 `instanceId` 由后端单点存取,任一端写入对其它端后续对话可见,不存在端本地分叉。
**Validates: Requirements 9.5, 9.6**
