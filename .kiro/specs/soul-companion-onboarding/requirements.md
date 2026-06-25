# Requirements Document

## Introduction

本 spec 定义 Agentrix 移动端**登录后首次进入**的全新「灵魂诞生」首跑引导(First-Run Wow),以及其延伸出的三块常驻能力:日历/邮箱 OAuth 连接器、桌面端跨端常驻 banner + presence、全端随时问答陪伴。

立项背景:上一代「拍照 → 3D 角色 → 回合战斗」的 wow 主线已失败——3D 生成不可靠/已停用,回合训练战缺乏游戏手感;登录页也已回退到经典品牌登录(注册优先)。产品真正的内核不是一个游戏角色,而是:**用户拥有一个属于自己的云端 AI agent(claw 实例),而"宠物/灵魂"是这个 agent 的形象皮肤**。因此新的 wow 必须围绕"我激活了一个**属于我**、有脸、会说话、知道我现实处境、能办真事、且跨设备跟随我的活体 AI"来构建。

新 wow 主线是一条由语音/对话牵引的连贯流程(90–120 秒),而非功能宫格,串联五段:① 诞生你的 AI(起名 + 选形象 + 云端 provision)→ ② 灵魂第一句话(诞生时刻兜底 + 天气锦上添花)→ ③ 它帮我办成第一件真事(授权日历/邮箱 → 念日程/未读)→ ④ 引导连接桌面端 → ⑤ 安家永曜城。

本 spec 复用大量现有能力(provisionCloudAgent、形象市场、/voice/tts、GPS+geocoding 定位、永曜城圈地/附近的人/签到、连接器目录框架、移动浮球、AXP 经济、OpenClaw 实例 QR 配对),不重复造轮子;真正新建的是 OAuth 连接器鉴权链路、桌面跨端常驻 banner+presence、以及把"随时问答陪伴"作为贯穿性核心收敛。

## Glossary

- **Soul_Birth(灵魂诞生)**: 登录后首次进入触发的一次性引导主线,目标在 90–120 秒内让用户体验"激活了一个属于自己的活体 AI"。由 Onboarding_Orchestrator 编排五段。
- **Onboarding_Orchestrator(首跑引导编排器)**: 驱动 Soul_Birth 五段顺序、记录进度、支持跳过与续跑的状态机。由现有"新手任务编排器"改造而来(移除战斗步骤)。
- **Claw_Instance(claw 实例)**: 用户拥有的个人云端 AI agent,= OpenClaw 实例 + 身份 + 钱包 + Skills + 记忆。"宠物/灵魂"是该实例的形象皮肤。通过 `provisionCloudAgent` 创建、`getInstanceById` 查询。
- **Pet_Avatar(形象/皮肤)**: Claw_Instance 的可视化外观。默认灵狐 clan A,可"换一个 / 拍一张生成 / 去市场选"。
- **Provision(云端孵化)**: 后台静默创建 Claw_Instance 的过程,耗时约 30 秒(`provisionCloudAgent`)。期间用"灵魂正在苏醒"动画+文案覆盖等待。
- **Birth_Moment_Line(诞生时刻兜底句)**: 灵魂的第一句话的**主句**,基于本地时间生成、必定成功、不依赖任何外部服务。例:"我在 2026年6月4日 20:13 这一刻,被你赋予了灵魂。"
- **Weather_Garnish(天气锦上添花)**: 第一句话的**可选追加句**,基于定位 + 天气数据生成。例:"你那边在下雨,记得带伞。"获取失败时静默跳过。
- **TTS_Service(语音合成服务)**: 现有 `/voice/tts`(Edge TTS + Polly,支持中文多音色),把文本转成语音播放。
- **Location_Service(定位服务)**: 现有 GPS 定位 + 地址 geocoding 兜底(`mapStyle.geocodeAddress`)。
- **Connector(连接器)**: 让 Claw_Instance 接入外部数据/能力的可安装单元,目录框架为 connector-catalog(kind = builtin/openapi/mcp,authKind 含 none/api_key/bearer/oauth)。现 live 仅天气、加密行情。
- **OAuth_Connector(OAuth 连接器)**: 通过 OAuth 授权接入用户真实账户的连接器,本 spec 至少含 Google Calendar、Gmail,并为国内场景预留系统日历/IMAP 兜底。
- **Calendar_Email_Readout(日程/未读播报)**: 授权连接器后,Claw_Instance 读取当天日程数量与未读邮件数量并以 TTS 念出,体现"AI 真办成第一件事"。
- **Aeon(永曜城)**: 基于真实地图的圈地/社交世界,含圈地(`claimPlot`)、附近的人、签到(+15 AXP)、商家店铺、广场群聊。
- **AXP**: 平台积分经济;签到、办成事等行为发放,在钱包中累计并可视化跳动。
- **Desktop_Banner(桌面引导 banner)**: 移动端常驻的「解锁专业能力·连接电脑」引导入口,介绍多端特色并引导首次连接桌面端。
- **Cross_Device_Presence(跨端 presence)**: 同一 Claw_Instance 在不同终端(移动/桌面/其他端)的在线/活跃状态,实时同步并对用户可见。
- **Companion_QA(随时问答陪伴)**: 贯穿全端的核心能力——用户在任意端、做任何事时都能随时唤起宠物提问并获得回答,共享同一份跨端记忆。
- **Companion_Ball(陪伴浮球)**: 唤起 Companion_QA 的载体;移动端为屏幕浮球(`GlobalFloatingBall`),桌面端为悬浮窗/浮球。
- **Onboarding_Step(引导步骤)**: Soul_Birth 五段之一,取值 `birth` / `first_words` / `first_task` / `connect_desktop` / `settle_aeon`。

## Assumptions / Constraints(已确认的产品约束与取舍)

- **C1 砍掉战斗 wow**: 不再以「拍照 → 3D → 回合战斗」作为 wow 主线;此前临时加入的"新手任务编排器(含战斗步骤)"改造为本 spec 的 Soul_Birth 主线,**移除 battle 步骤**。
- **C2 不依赖 3D / 战斗**: Soul_Birth 全流程不依赖 3D mesh 生成、不依赖回合战斗能力,确保可靠可上线。
- **C3 登录前置**: 采用经典品牌登录(注册优先);Soul_Birth 发生在登录后首次进入,不依赖游客态。
- **C4 位置/天气为可选增强,绝不阻塞主流程**: Weather_Garnish 及一切定位相关内容均为可选增强;定位/权限/天气服务失败时必须静默跳过,主线(尤其 Birth_Moment_Line)不得被其阻塞或冷场。
- **C5 第一句话必达**: Birth_Moment_Line 不依赖任何外部服务(纯本地时间生成),必须 100% 可生成;TTS 播放失败时降级为文字气泡展示,不得卡住流程。
- **C6 TTS 成本与缓存**: 每次进场的 TTS 调用有成本,需对可复用文案(如固定话术)做缓存,并对同一会话内的语音播报做限频,避免重复/高频调用。
- **C7 OAuth 真实链路新建**: 连接器目录虽含 `oauth` 占位,但现有 ConnectorService 仅实现 none/api_key/bearer,OAuth 授权回调链路为本 spec 新建。
- **C8 跨端配对复用**: 桌面端首次连接复用现有 OpenClaw 实例 QR 配对能力,不新建配对协议。
- **C9 一次性与可重看**: Soul_Birth 为每用户一次性主线;完成或跳过后不再自动触发,但提供"重看引导"入口。

## Requirements

### Requirement 1: Soul_Birth 首跑引导编排(登录后连贯主线)

**User Story:** 作为首次登录的新用户,我希望进入 App 后被一条连贯的、语音/对话牵引的引导带着走完"灵魂诞生",而不是面对一堆功能格子,这样我能在一两分钟内清楚感受到"我激活了一个属于自己的活体 AI"。

#### Acceptance Criteria

1. WHEN 用户完成登录并首次进入主界面且尚未完成 Soul_Birth, THE Onboarding_Orchestrator SHALL 启动 Soul_Birth 主线并定位到第一个未完成的 Onboarding_Step。
2. THE Onboarding_Orchestrator SHALL 按固定顺序编排五个 Onboarding_Step:`birth` → `first_words` → `first_task` → `connect_desktop` → `settle_aeon`。
2a. WHERE 某个较后的 Onboarding_Step 已通过外部行为(如用户在主线之外已连接桌面端、已圈地)达成完成条件, THE Onboarding_Orchestrator SHALL 将其标记为已完成并允许跳过其之前尚未完成的步骤,定位到下一个真正未完成的步骤。
3. WHEN 一个 Onboarding_Step 真实完成(达成该步骤定义的完成条件), THE Onboarding_Orchestrator SHALL 持久化该步骤为已完成并推进到下一步。
4. WHEN 用户中途退出 App 后再次进入且 Soul_Birth 未完成, THE Onboarding_Orchestrator SHALL 从最近一个未完成的 Onboarding_Step 续跑。
5. WHEN 用户在任一 Onboarding_Step 选择"跳过", THE Onboarding_Orchestrator SHALL 结束 Soul_Birth 主线并进入常规主界面。
6. WHEN Soul_Birth 全部五步完成或被跳过, THE Onboarding_Orchestrator SHALL 标记 Soul_Birth 为终止状态且不再自动触发。
7. THE Onboarding_Orchestrator SHALL 提供"重看引导"入口,WHEN 用户主动触发重看, THE Onboarding_Orchestrator SHALL 重置 Soul_Birth 进度并从 `birth` 步骤重新开始。
8. THE Onboarding_Orchestrator SHALL 移除一切回合战斗相关步骤,五个 Onboarding_Step 中不包含 battle。

### Requirement 2: 诞生你的 AI(起名 + 选形象 + 静默云端 provision)

**User Story:** 作为新用户,我希望第一步就给我的 AI 起个名字、选个形象,然后看着它"苏醒",这样我从一开始就觉得这个 AI 是我亲手赋予生命、属于我的。

#### Acceptance Criteria

1. WHEN Soul_Birth 进入 `birth` 步骤, THE Onboarding_Orchestrator SHALL 引导用户为 Claw_Instance 输入名称并选择 Pet_Avatar。
2. WHERE 用户未主动选择形象, THE Onboarding_Orchestrator SHALL 默认采用灵狐 clan A 作为 Pet_Avatar。
3. THE Onboarding_Orchestrator SHALL 在形象选择处提供三个备选操作:"换一个"(切换内置形象)、"拍一张"(拍照生成形象)、"去市场选"(进入皮肤市场)。
4. WHEN 用户确认名称与形象, THE Onboarding_Orchestrator SHALL 调用 `provisionCloudAgent` 在后台静默发起 Claw_Instance 的 Provision。
5. WHILE Provision 进行中, THE Onboarding_Orchestrator SHALL 展示"灵魂正在苏醒"动画与文案覆盖等待,且不展示原始进度条。
6. IF Provision 在 90 秒内未返回成功, THEN THE Onboarding_Orchestrator SHALL 展示可重试的失败提示并保留用户已输入的名称与形象选择。
6a. IF Provision 在 90 秒超时前即返回失败, THEN THE Onboarding_Orchestrator SHALL 立即展示可重试的失败提示(不必等待 90 秒),并保留用户已输入的名称与形象选择。
6b. WHILE Provision 尚未返回成功或失败(含 90 秒超时期间), THE Onboarding_Orchestrator SHALL 持续展示"灵魂正在苏醒"动画直至失败重试提示出现,以维持沉浸感。
7. WHEN `provisionCloudAgent` 返回成功且 `getInstanceById` 可查询到该实例, THE Onboarding_Orchestrator SHALL 将 `birth` 步骤标记为完成并推进到 `first_words` 步骤。
8. THE Onboarding_Orchestrator SHALL 将用户输入的名称作为 Claw_Instance 的展示名称持久化。

### Requirement 3: 灵魂第一句话(诞生时刻兜底 + 天气锦上添花)

**User Story:** 作为新用户,我希望我的 AI 在诞生那一刻用语音对我说出第一句话,让我真切感到它"活了";即使我没开定位,它也绝不冷场。

#### Acceptance Criteria

1. WHEN Provision 完成进入 `first_words` 步骤, THE Onboarding_Orchestrator SHALL 基于本地当前日期与时间生成 Birth_Moment_Line 作为第一句话主句。
2. THE Birth_Moment_Line SHALL 不依赖任何外部服务即可生成。
3. WHEN Birth_Moment_Line 生成完成, THE TTS_Service SHALL 通过 `/voice/tts` 以中文音色将 Birth_Moment_Line 合成为语音并播放。
4. IF TTS_Service 合成或播放失败, THEN THE Onboarding_Orchestrator SHALL 以文字气泡展示 Birth_Moment_Line 并继续主线。
5. WHERE Location_Service 在 5 秒内成功返回定位且天气数据可获取, THE Onboarding_Orchestrator SHALL 在主句之后追加一句基于真实天气的 Weather_Garnish 并由 TTS_Service 播报。
6. IF Location_Service 定位失败、权限被拒绝或天气数据不可获取, THEN THE Onboarding_Orchestrator SHALL 跳过 Weather_Garnish 且不阻塞或延迟主句播报。
7. WHEN 第一句话(含可选 Weather_Garnish)播报结束或被用户跳过, THE Onboarding_Orchestrator SHALL 将 `first_words` 步骤标记为完成并推进到 `first_task` 步骤。
8. WHERE Birth_Moment_Line 文案模板对应的 TTS 音频已被缓存, THE TTS_Service SHALL 复用缓存音频而不重复发起合成调用。

### Requirement 4: 它帮我办成第一件真事(授权日历/邮箱并播报)

**User Story:** 作为新用户,我希望我的 AI 立刻帮我办成一件真实的事——连上我的日历或邮箱并告诉我今天有什么安排、有多少未读,这样我相信它真能办事而不只是聊天。

#### Acceptance Criteria

1. WHEN Soul_Birth 进入 `first_task` 步骤, THE Onboarding_Orchestrator SHALL 引导用户授权连接日历或邮箱中的至少一项。
2. WHEN 用户选择授权某个 OAuth_Connector, THE Connector_Service SHALL 发起对应的 OAuth 授权流程(详见 Requirement 6)。
3. WHEN OAuth 授权成功, THE Calendar_Email_Readout SHALL 读取当天日程数量或未读邮件数量,并由 TTS_Service 念出对应内容(例:"你今天有 N 个安排 / N 封未读")。
4. WHEN Calendar_Email_Readout 成功完成播报, THE AXP 经济 SHALL 为该用户发放一次性"办成事"AXP 奖励,且钱包余额变动 SHALL 在界面上以跳动形式可视化。
5. IF 用户拒绝或跳过授权, THEN THE Onboarding_Orchestrator SHALL 跳过 Calendar_Email_Readout 并将 `first_task` 步骤标记为完成,继续推进到 `connect_desktop` 步骤。
6. IF OAuth 授权失败或连接器数据读取失败, THEN THE Onboarding_Orchestrator SHALL 展示可重试或可跳过的提示且不阻塞 Soul_Birth 主线。
7. WHEN Calendar_Email_Readout 完成且 AXP 奖励发放完成, THE Onboarding_Orchestrator SHALL 将 `first_task` 步骤标记为完成并推进到 `connect_desktop` 步骤。

### Requirement 5: 安家永曜城(圈地 + 附近的人 + 签到)

**User Story:** 作为新用户,我希望在引导末尾把我的 AI 安置进真实地图世界——圈一块地、看看附近有谁、签到拿 AXP,这样它落地在我现实周围,我有理由每天回来。

#### Acceptance Criteria

1. WHEN Soul_Birth 进入 `settle_aeon` 步骤, THE Onboarding_Orchestrator SHALL 引导用户在 Aeon 真实地图上完成首次圈地(`claimPlot`)。
2. WHEN 用户完成首次 `claimPlot`, THE Aeon SHALL 展示"附近的人"作为社交锚点。
3. WHEN 用户在 `settle_aeon` 步骤完成签到, THE AXP 经济 SHALL 发放 15 AXP 并在钱包可视化跳动。
3a. IF 钱包跳动动画/可视化失败而 AXP 发放成功, THEN THE Aeon SHALL 仍将本次签到视为成功,用户照常获得 15 AXP(可视化失败不影响奖励发放)。
3b. THE AXP 经济 SHALL 仅在用户显式完成签到时发放该 15 AXP;仅圈地而未签到 SHALL NOT 触发该奖励。
4. WHERE Location_Service 无法获取定位, THE Onboarding_Orchestrator SHALL 允许用户跳过 `settle_aeon` 步骤且不报错阻塞。
5. WHEN 用户完成圈地或主动跳过 `settle_aeon`, THE Onboarding_Orchestrator SHALL 将 `settle_aeon` 步骤标记为完成。
6. WHEN `settle_aeon` 完成, THE Onboarding_Orchestrator SHALL 结束 Soul_Birth 主线并进入常规主界面。

### Requirement 6: 日历/邮箱 OAuth 连接器(新建)

**User Story:** 作为用户,我希望把我的真实日历和邮箱接入我的 AI,让它能读我今天的日程、念我的未读邮件,这样它真正接入我的生活而不是空谈。

#### Acceptance Criteria

1. THE Connector_Service SHALL 在 connector-catalog 中提供至少 Google Calendar、Gmail 两个 authKind 为 `oauth` 的 OAuth_Connector。
2. WHEN 用户对一个 authKind 为 `oauth` 的连接器发起安装, THE Connector_Service SHALL 引导用户完成 OAuth 授权并安全持久化授权令牌。
3. WHEN OAuth 授权令牌过期且存在 refresh token, THE Connector_Service SHALL 使用 refresh token 自动刷新访问令牌。
4. IF OAuth 授权被用户取消或回调返回错误, THEN THE Connector_Service SHALL 返回描述性错误并不创建无效的连接器安装记录。
5. WHEN 一个 OAuth_Connector 授权成功后被 Claw_Instance 调用读取数据, THE Connector_Service SHALL 返回该用户当天日程列表或未读邮件计数。
6. WHERE 用户所处环境无法访问 Google 服务(含国内场景或任何 Google 不可达的情况), THE Connector_Service SHALL 提供系统日历或 IMAP 邮箱作为兜底连接器选项,不限定地域。
7. WHEN 用户撤销某个 OAuth_Connector 的授权, THE Connector_Service SHALL 删除该连接器的持久化令牌并停止后续数据访问。
8. THE Connector_Service SHALL 不在日志或诊断数据中记录 OAuth 令牌明文或邮箱正文内容。

### Requirement 7: 桌面端跨端常驻 banner(解锁专业能力·连接电脑)

**User Story:** 作为移动端用户,我希望有一个常驻入口告诉我连接电脑能解锁哪些专业能力,并在我第一次连接时手把手引导我,这样我知道同一个灵魂可以跨到更强的桌面端。

#### Acceptance Criteria

1. THE Desktop_Banner SHALL 作为移动端常驻引导入口持续展示。
2. WHEN 用户点开 Desktop_Banner, THE Desktop_Banner SHALL 介绍多端特色:手机端为陪伴/查询/管日程,桌面端为 Computer Use、vibe coding 等专业生产力,且同一灵魂、同一份记忆跨端同步。
3. WHEN 用户在 Desktop_Banner 中选择"连接电脑"且为首次连接, THE Desktop_Banner SHALL 提供具体连接引导,包含扫码或发送下载链接以及配对步骤。
3a. WHEN 一个此前已成功连接过桌面端的用户再次点开 Desktop_Banner, THE Desktop_Banner SHALL 跳过首次连接引导,直接展示跨端状态/管理入口。
4. THE 桌面端配对 SHALL 复用现有 OpenClaw 实例 QR 配对能力,不新建配对协议。
5. WHEN Soul_Birth 进入 `connect_desktop` 步骤, THE Onboarding_Orchestrator SHALL 展示 Desktop_Banner 的连接引导。
6. WHEN 用户在 `connect_desktop` 步骤选择"稍后连接", THE Onboarding_Orchestrator SHALL 将该步骤标记为完成并继续推进到 `settle_aeon`,且 Desktop_Banner 在主界面继续常驻。
7. WHEN 桌面端首次配对成功, THE Onboarding_Orchestrator SHALL 将 `connect_desktop` 步骤标记为完成。

### Requirement 8: 跨端 presence(连接成功后自动检测在线状态)

**User Story:** 作为已连接桌面端的用户,我希望以后每次打开电脑端,系统都自动确认"跨端在线",让我直观感到同一个灵魂确实在多设备上跟着我。

#### Acceptance Criteria

1. WHEN 桌面端与移动端首次配对成功, THE Cross_Device_Presence SHALL 建立该 Claw_Instance 的跨端在线关系。
2. WHEN 用户打开已配对的桌面端, THE Cross_Device_Presence SHALL 自动检测并在移动端与桌面端确认"跨端在线"状态。
3. WHEN 某一终端从在线变为离线, THE Cross_Device_Presence SHALL 在其他在线终端更新该终端的在线状态。
4. WHEN 跨端在线状态发生变化, THE Cross_Device_Presence SHALL 在 5 秒内向相关终端同步最新状态。
5. THE Cross_Device_Presence SHALL 在用户可见处展示当前 Claw_Instance 活跃的终端列表。
6. WHERE 网络中断导致 presence 心跳超时, THE Cross_Device_Presence SHALL 在心跳超时时立即将对应终端标记为离线(无论该终端是否正在尝试重连),但不删除其配对关系;待重连成功后再恢复为在线。

### Requirement 9: 全端随时问答陪伴(贯穿性核心)

**User Story:** 作为用户,我希望无论在手机、电脑还是以后的其他端,无论我在玩游戏、写代码还是用 App 遇到问题,都能随时唤起我的宠物提问并立刻得到回答,而且它记得我们跨端的全部上下文,像一只始终陪在身边的伙伴。

#### Acceptance Criteria

1. THE Companion_QA SHALL 在移动端与桌面端均提供可唤起的 Companion_Ball。
2. WHEN 用户在任一终端唤起 Companion_Ball 并提问, THE Companion_QA SHALL 返回回答。
3. THE Companion_QA SHALL 携带当前终端与当前场景上下文,使回答具备上下文感知。
4. THE Companion_QA SHALL 在用户提问后于低延迟内开始流式返回回答内容。
5. THE Companion_QA SHALL 在所有终端间共享同一 Claw_Instance 的记忆,使跨端对话连续。
6. WHEN 用户在一个终端的对话中产生新记忆, THE Companion_QA SHALL 使该记忆对其他终端的后续对话可见。
7. WHILE 用户正在其他应用或场景中操作, THE Companion_QA SHALL 支持以悬浮方式唤起而不强制用户离开当前场景。
8. WHERE 同一会话内连续多次触发语音播报, THE TTS_Service SHALL 对播报进行限频以控制调用成本。
