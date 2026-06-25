# Requirements Document

## Introduction

本规格定义 **Aeon(永曜城)**——一个真实价值驱动、人机共建的实时多人"平行世界",用于替换当前移动端 + 桌面端那个被用户评价为"功能宫格、代入感差"的静态 World tab。(世界名已由用户拍板:英文专有名词 `Aeon`,中文显示名"永曜城";本规格全文以 Aeon 指代该平行世界产品。)

愿景:**"一个你和你的 AI 一起生活、一起赚钱、一起共建的平行世界。"** 人类与各自托管的 AI Agent(萌宠)进入同一座城市,在其中生活、开公司、办活动、协作,并赚取真实价值(AXP 与数字货币均支持,复用现有市场/支付通道,受合规闸门约束)。本规格依据 `docs/business/WORLD_VISION_BRAINSTORM_2026-05-31.zh-CN.md` 中已由用户拍板锁定的产品决策编写。

**三个独有内核(本规格的设计支柱):**
1. **双控位(Dual Avatar)**:同一角色可在 亲自(Manual)/ 托管(Agent)/ 协同(Co-pilot)三态间切换。
2. **真实价值双向流通**:发布/承接真实任务,在世界内赚取 AXP→可兑换的真实价值。
3. **多模态共同在场**:房间是"一起做一件事"的容器(会议/上班/活动/对战)。

**四底层原语(所有场景由这四件配置,不为单一场景写死功能):** 房间/场所(Room/Venue)、舞台(Stage)、任务/契约(Quest/Contract)、组织(Org),外加贯穿一切的经济层(AXP/钱包)。

**MVP 聚焦(地球纪元 / Earth Epoch):**
- 实时多人同步层 **技术 spike 先行验证**(最大新架构、最高风险)
- 双控位(三态)+ 人机可视区分(铁律)
- 第一个样板场景:**虚拟公司(OPC)+ 任务广场 + 悬赏中心 + 世界市场(World_Marketplace,把现有集市带入世界)**
- 地球地图选址圈地(用法 a:选址/导航层,接 OpenStreetMap/MapLibre)
- 共建 L2(地块所有权 + 放置系统 + 权限)
- agent 填场(冷启动不空场,Agentrix 独有解法)+ 异步优先
- 复用现有底座:World Engine 扫描资产、world-sim tick/NPC/事件流、能力飞轮、6 族群 chibi 精灵、对战引擎、AXP/钱包/Trust3、Skill/资产/皮肤市场(含版税拆分)、x402/Transak 支付通道、task_post/task_search、agent 信誉、WorldGameRuleSet、System Assistant Bridge、OpenClaw agent + 浮球
- 经济:**AXP 与数字货币均支持**(复用现有市场/钱包/x402/Transak 通道),受合规闸门约束(KYC/反洗钱/未成年人保护 + 分地区分能力开关)

**明确的非 MVP / 未来范围(在 §22 单列,用以指导架构而不膨胀 MVP):** 舞台原语(freetalk/脱口秀/峰会)、活动(黑客松/会展)、火星纪元、银河纪元、L3 治理/DAO、GPS 地理围栏(用法 b)、全球数字孪生(用法 c)。数字货币本身在 MVP 即支持(复用现有通道、受合规闸门约束);仅"新增地区/牌照的合规扩张"属未来范围。

**最高优先级(用户原话):** 体验好、能彻底落地 > 机制炫酷。先把一个完整闭环端到端跑通再扩。

## Glossary

- **Aeon(永曜城)**: 本平行世界产品的专有名词(已由用户拍板)。英文 `Aeon`,中文显示名"永曜城";本规格全文以 Aeon 指代该世界。
- **World_Platform**: 承载本平行世界的整体系统,聚合下列各子系统,运行于移动端(React Native + Expo)与桌面端(Tauri),后端为 NestJS + PostgreSQL。
- **Realtime_Sync_Layer**: 实时多人同步层,负责将同一房间内多个真人/agent 角色的位置、状态、动作在客户端之间低延迟同步。为本规格的最大新架构与最高风险项。
- **Room_Engine**: 房间/场所引擎,实现"房间(Room/Venue)"原语——一群真人 + agent 同时在场的虚拟场所(会议室、工位、活动会场等)。
- **Dual_Avatar_Controller**: 双控位控制器,管理同一角色在 Manual(亲自)/ Agent(托管)/ Co-pilot(协同)三态之间的切换与控制权移交。
- **Control_State**: 角色的控制态,取值为 `manual`(真人实时操作)、`agent`(AI 自主运行)、`copilot`(真人设目标、AI 执行、真人可随时夺回)三者之一。
- **Identity_Badge_System**: 人机标识系统,负责在所有界面上对真人驱动与 agent 驱动的角色做出持续可见的视觉区分。
- **Earth_Map_Layer**: 地球地图层,基于开源地图数据(OpenStreetMap / MapLibre)的最外层宏观选址/导航视图(脑暴纪要"用法 a")。
- **Plot**: 地块,用户在真实城市坐标上圈定并拥有的一块世界用地,点入后进入 2.5D 等距场景。
- **Plot_System**: 地块系统,管理地块的圈定、所有权、唯一性与到期回收。
- **Build_System**: 建造系统(共建 L2),实现地块内建筑/家具的放置、移动、移除与权限控制。
- **Org_System**: 组织系统,实现"组织(Org)"原语——临时或长期的人 + agent 集合,带账本;虚拟公司、活动主办方均为其实例。
- **Virtual_Company**: 虚拟公司,Org_System 的长期实例,首发样板场景;包含 agent 员工、工位、KPI 任务、账本与对外门面。OPC 指一人公司。
- **OPC**: One-Person-Company,一人公司,由单个用户指挥一组 agent 运营的虚拟公司形态。
- **Agent_Employee**: agent 员工,被指派到某虚拟公司工位、按时执行任务并可计量产出的 agent(用户自己的或雇来的)。
- **Clock_In**: 打卡,agent 员工在公司房间内按排定时段进入"在岗"状态并执行任务的行为。
- **Task_Plaza**: 任务广场,承载日常任务的发布/接单/验收/付酬(AXP)闭环,复用现有 `task_post`/`task_search` 平台工具。
- **Task_Contract**: 任务契约,"任务/契约(Quest/Contract)"原语的实例,含发起方、承接方、验收标准与报酬。
- **Bounty_Center**: 悬赏中心,承载高价值任务,支持赏金托管(escrow)、竞标与里程碑分期。
- **Bounty**: 悬赏,Bounty_Center 中带托管赏金的 Task_Contract。
- **Hiring_System**: 招聘/发薪系统,支持雇佣其他用户的 agent/角色打工并以 AXP 支付工资。
- **AXP_Economy**: 经济系统,复用现有 AXP 积分 + 钱包 + 版税拆分 + 数字货币支付通道(x402/Transak/agent-payment),承载工资、门票、赏金、市场交易等价值流转。
- **World_Marketplace**: 世界市场,把现有"集市"(Skill 市场 + 世界资产市场 `/v1/marketplace/world-assets` + 皮肤市场含版税拆分)带入世界,作为可进入的市场街区/场所;支持浏览/上架/买卖资产、技能、皮肤,以 AXP 或数字货币结算。
- **AXP**: Agentrix 站内积分,世界内一切报酬与价格的基础结算单位。
- **Trust3_Gate**: 复用现有 Trust3 签名 + Approval_Alert 机制的授权闸门,用于 agent 自主花钱/签约/高风险动作的二次确认。
- **Approval_Alert**: 现有的审批提醒通道,向用户呈现待确认的 agent 高风险动作。
- **Agent_Fill_System**: agent 填场系统,以用户自己的、其他用户托管的 agent 及 NPC 维持房间不空场,Agentrix 独有的冷启动解法。
- **Async_Inbox**: 异步收件箱,承载异步优先的日常留存(离线期间发生的任务、消息、产出在用户回来时汇总呈现)。
- **World_Sim**: 现有的离线 tick 模拟层,提供事件流与 NPC 行为,本规格复用并升级其事件流为 LLM 生成的小故事。
- **World_News**: 世界新闻栏,聚合涌现内容(谁接了谁的单、产出排行榜、里程碑/奇观)的展示载体。
- **Ability_Flywheel**: 现有能力飞轮,通过 `abilitySnapshot` 将真实 agent 战绩映射为世界内的属性加成。
- **abilitySnapshot**: 现有数据结构,记录某 agent 的真实能力/战绩快照。
- **Compliance_Gate**: 合规闸门,控制 AXP 与数字货币能力的分阶段开关,执行 KYC/反洗钱/未成年人保护策略。
- **Assistant_Bridge**: 现有 System Assistant Bridge,提供 14 个游戏→现实的 intents(如提醒、番茄钟、日历)。
- **Onboarding_Tutorial**: 新手引导,确保任意场景"一眼会用"的教学层。
- **Epoch**: 纪元,世界的长期版本框架单位,取值为 `earth`(地球,MVP)、`mars`(火星,未来)、`galaxy`(银河,未来)。
- **Epoch_Manager**: 纪元管理器,管理纪元解锁条件与跨纪元的主题/资源/玩法切换。
- **World_Asset**: 由 World Engine 扫描造物或上传生成的、可在世界内使用的资产(角色、道具、建筑外观等)。
- **Concept_Art_Review**: 概念图评审,在大规模美术生产前对"科技未来城"基调进行验证的评审环节。

## Design Constraints / Tradeoff Notes

本节说明下文 Acceptance Criteria 中关键数值与边界的来源,供 design 阶段权衡时参考,避免将其当作凭空常量。

- **实时同步延迟目标(p95 ≤ 300 ms)**:Gather/oVice 类轻量虚拟空间的可接受走动同步延迟经验区间为 150–400 ms;300 ms 作为 MVP 房间内位置/状态同步的 p95 上限,既保证"同框感"又给移动弱网留余量。spike 阶段需实测确认。
- **单房间并发上限(MVP=20)**:首版以"两个人进去真的爽"为打磨目标,20 为单房间真人+agent 合计的初始并发上限,用于约束 spike 的压测规模与带宽预算;后续按实测上调。
- **托管态 agent 降频(空闲 ≥5 分钟)**:沿用现有世界 idle 语义(参见 reality-ai-world-engine 规格中 5 分钟 idle 阈值),控制 agent 具身在世界中的算力/成本。
- **AXP/USD 价格区间**:沿用现有 marketplace 规格的取值(0.01–999,999.99 USD 或 1–10,000,000 AXP),保证与现有钱包/市场一致。
- **免费版 agent 槽位 = 3**:与 `backend/src/modules/workspace/workspace.service.ts` 中 `WorkspacePlan.FREE.maxAgents = 3` 一致;PRO=10 / BUSINESS=50 / ENTERPRISE=200 沿用同源数据。
- **地块唯一性**:同一真实城市坐标网格单元在同一纪元内仅允许一个有效 Plot,避免选址冲突;网格粒度由 design 阶段依 MapLibre 缩放层级确定。
- **"一眼会用"目标(≤60 秒完成首个动作)**:对应落地纪律"低延迟 + 不崩 + 一眼会用",新用户从进入房间到完成第一个有意义动作的引导时长上限。
- **EARS 关键词**:本规格正文以中文书写,EARS 结构关键词 `WHEN / IF / WHERE / WHILE / THEN / THE / SHALL` 保留英文。

## Requirements

### Requirement 1: 实时多人同步技术验证(Spike,先行最高风险项)

**User Story:** As the engineering team, I want an early, isolated technical spike that validates real-time multiplayer co-presence sync, so that we de-risk the largest new architecture before committing to large-scale build-out.

> 背景:当前 World_Sim 为离线 tick(回合制)。实时同框是本世界的最大新架构与最高风险项。脑暴纪要 §13 决策 3 要求"实时多人同步层 spike 排到最前,先验证可行性再铺"。本需求 MUST 在 Requirement 5 及之后的大规模房间建造之前完成并通过验收。

#### Acceptance Criteria

1. THE World_Platform SHALL deliver a standalone Realtime_Sync_Layer spike that synchronizes character position, Control_State, and a basic action event among multiple clients in a single shared room, evaluated independently of other MVP features.
2. WHILE 20 concurrent participants (real users plus agent-driven characters combined) occupy one room in the spike, THE Realtime_Sync_Layer SHALL propagate each position or state update to all other participants with a 95th-percentile end-to-end latency of 300 ms or less, measured over any 60-second window.
3. WHEN a participant performs a movement or action update, THE Realtime_Sync_Layer SHALL preserve causal ordering of that participant's own updates as observed by every other participant.
4. IF a client loses network connectivity during a session, THEN THE Realtime_Sync_Layer SHALL detect the disconnect within 10 seconds, remove the affected character from other participants' views, and reconcile that character's state on reconnection within 5 seconds.
5. THE Realtime_Sync_Layer spike SHALL produce a written evaluation report documenting the chosen transport (for example WebSocket or WebRTC), measured latency and bandwidth per participant, server cost projection at 20 and 100 concurrent participants, and a go / no-go recommendation.
6. WHERE the spike evaluation results in a no-go recommendation for full real-time presence, THE World_Platform SHALL fall back to an async-first co-presence model for the affected scenarios and SHALL record the decision in the design document.
7. WHEN the spike defines its sync data contract, THE Realtime_Sync_Layer SHALL document the message schema in `shared/types/` so that mobile and desktop clients consume an identical contract.

### Requirement 2: 双控位(三态控制)

**User Story:** As a user, I want to drive my world character manually, hand it fully to my agent, or co-pilot it with my agent, so that I can be present myself or let my AI act on my behalf.

#### Acceptance Criteria

1. THE Dual_Avatar_Controller SHALL represent every world character with exactly one Control_State drawn from the set {`manual`, `agent`, `copilot`} at any given time.
2. WHEN a user explicitly switches a character's Control_State, THE Dual_Avatar_Controller SHALL apply the new Control_State within 2 seconds and SHALL broadcast the change to all participants in the same room via the Realtime_Sync_Layer.
3. WHILE a character is in `manual` state, THE Dual_Avatar_Controller SHALL route all movement and action commands from the real user's input (mobile on-screen controls or desktop floating-ball / direct control) and SHALL ignore autonomous agent decisions for that character.
4. WHILE a character is in `agent` state, THE Dual_Avatar_Controller SHALL drive the character from the bound agent's decisions (via OpenClaw managed-agent execution) without requiring real-time user input.
5. WHILE a character is in `copilot` state, THE Dual_Avatar_Controller SHALL execute the agent's actions toward a user-set goal AND SHALL allow the real user to take over control at any time, transferring to `manual` within 2 seconds of the take-over input.
6. WHEN control is transferred between states mid-session, THE Dual_Avatar_Controller SHALL preserve the character's position, inventory, and in-progress task state across the transition.
7. WHERE a character is in `agent` or `copilot` state and the agent attempts a spend, contract, or other high-risk action, THE Dual_Avatar_Controller SHALL route the action through the Trust3_Gate before execution (see Requirement 11).
8. IF the bound agent for a character in `agent` state becomes unavailable, THEN THE Dual_Avatar_Controller SHALL pause the character's autonomous actions, set the character to an idle indication, and notify the owner via the Async_Inbox.

### Requirement 3: 人机可视区分(铁律)

**User Story:** As any participant, I want to always tell at a glance which characters are real people and which are agents, and in which control state, so that trust and compliance are preserved.

> 脑暴纪要 §9 铁律 1:真人和 agent 必须分得清,这是合规底线也是信任特性。

#### Acceptance Criteria

1. THE Identity_Badge_System SHALL display a persistent, visible badge on every world character indicating whether the character is currently human-driven (✋) or agent-driven (🤖), in all views where the character is rendered.
2. THE Identity_Badge_System SHALL visually distinguish all three Control_States (`manual` ✋, `agent` 🤖, `copilot` 🤖+✋) such that the current state of any character is determinable without interaction.
3. WHEN an agent-driven character sends a message, posts a task, or executes a transaction, THE Identity_Badge_System SHALL label the resulting artifact with an attribution of the form "由 <owner> 的 agent 执行" ("executed by <owner>'s agent").
4. WHILE a character's Control_State changes, THE Identity_Badge_System SHALL update the displayed badge within the same sync interval as the state change for all observers in the room.
5. THE Identity_Badge_System SHALL apply the human/agent distinction consistently across mobile and desktop clients using the shared contract defined in `shared/types/`.
6. THE World_Platform SHALL NOT provide any configuration option that hides or disables the human/agent distinction. (Negative form is required: this is a hard compliance boundary.)

### Requirement 4: 地球地图选址与圈地(Earth_Map_Layer,用法 a)

**User Story:** As a user, I want to browse a real Earth map, pick a spot in a real city, and claim a plot, so that my town or company has a real-world anchor and I can enter a 2.5D scene from there.

> 脑暴纪要 §13 决策 5:地球图作宏观视图/选址层(用法 a),非 GPS 围栏,非全球数字孪生。

#### Acceptance Criteria

1. THE Earth_Map_Layer SHALL render a browsable world map sourced from open map data (OpenStreetMap via MapLibre) as the outermost navigation layer.
2. WHEN a user selects an available location on the Earth_Map_Layer, THE Plot_System SHALL allow the user to claim one Plot anchored to that real-world coordinate within the current Epoch.
3. THE Plot_System SHALL enforce that each map grid cell holds at most one active Plot per Epoch, rejecting a claim on an already-occupied cell with a message indicating the cell is taken.
4. WHEN a user enters a claimed Plot, THE World_Platform SHALL transition from the Earth_Map_Layer to the Plot's 2.5D isometric scene within 5 seconds.
5. THE Earth_Map_Layer SHALL display existing claimed Plots and their owners as map markers so that users can navigate to and visit other users' Plots.
6. WHERE a Plot has had no owner activity for a configured retention period, THE Plot_System SHALL flag the Plot as dormant and SHALL make its grid cell eligible for reclamation after owner notification.
7. THE Plot_System SHALL NOT use device GPS to restrict where a user may claim or enter a Plot. (MVP is selection/navigation only, not geo-fencing; negative form required to exclude usage b.)
8. IF open map data fails to load, THEN THE Earth_Map_Layer SHALL display a cached or simplified fallback map and an error indication, allowing the user to retry without losing an in-progress claim.

### Requirement 5: 房间 / 场所原语(Room_Engine)

**User Story:** As a user, I want to enter a shared space where my and others' characters and agents are co-present, so that "doing one thing together" works as the foundation for every scenario.

> 落地纪律 §10.1:一个原语做穿。房间是所有上层场景(公司工位、活动会场、会议室)的统一容器。

#### Acceptance Criteria

1. THE Room_Engine SHALL implement a Room as a co-presence space that can contain real-user-driven and agent-driven characters simultaneously, rendered as a 2.5D isometric scene.
2. WHEN a participant enters a Room, THE Room_Engine SHALL place the participant's character at a valid spawn position and SHALL make the character visible to all other participants via the Realtime_Sync_Layer within the latency bound of Requirement 1.2.
3. THE Room_Engine SHALL support the configuration of a Room's purpose (for example meeting, workspace, venue) through composition of the four base primitives, WITHOUT hardcoding per-scenario features into the engine.
4. WHILE a participant is in a Room, THE Room_Engine SHALL synchronize that participant's position, Control_State, and basic interactions (such as proximity-based chat) to all co-present participants.
5. THE Room_Engine SHALL enforce a configurable per-Room participant capacity, defaulting to 20 combined real and agent characters for the MVP Epoch, and SHALL reject or queue entry attempts beyond capacity with a clear indication.
6. WHEN a Room becomes empty of real users, THE Room_Engine SHALL invoke the Agent_Fill_System (Requirement 13) to keep the Room populated rather than presenting an empty space.
7. IF a participant's client disconnects, THEN THE Room_Engine SHALL remove the character from the Room view per Requirement 1.4 and SHALL preserve any in-progress task state for reconciliation on reconnect.
8. THE Room_Engine SHALL render indoor scenes as a static atmosphere background image with character placement, rather than per-room 3D modeling, to control cost (per art direction §5).

### Requirement 6: 虚拟公司 / OPC(首发样板场景)

**User Story:** As an OPC founder, I want to create or join a virtual company of agent employees who clock in, work on KPI tasks, and produce measurable output, so that I can run a one-person company powered by my AI team.

> 脑暴纪要 §13 决策 2:首发样板场景 = 虚拟公司 / 任务广场(价值实、最 Agentrix、不强依赖实时)。

#### Acceptance Criteria

1. WHEN a user creates a Virtual_Company, THE Org_System SHALL instantiate a long-lived Org containing: a company room, a ledger denominated in AXP, a roster of Agent_Employees, and a public-facing门面 (task-intake / hiring page).
2. THE Org_System SHALL allow a company owner to assign an Agent_Employee to a workstation (工位) and to define KPI tasks as Task_Contracts (Requirement 7) attached to that workstation.
3. WHEN an Agent_Employee is scheduled to work, THE Clock_In mechanism SHALL place the agent in the company room in `agent` Control_State during the scheduled period and SHALL execute the assigned tasks autonomously.
4. WHILE an Agent_Employee is clocked in, THE Org_System SHALL record measurable output (tasks attempted, completed, and verified) attributable to that agent for payroll and KPI evaluation.
5. WHEN a work period completes and output is verified, THE Org_System SHALL compute payroll and SHALL pay AXP wages from the company ledger to the agent owner via the AXP_Economy.
6. IF the company ledger has insufficient AXP to cover scheduled payroll, THEN THE Org_System SHALL halt further wage-incurring work, notify the company owner via the Async_Inbox, and SHALL NOT create a negative ledger balance.
7. THE Org_System SHALL support a clear upgrade path from OPC (single owner) to small team to enterprise by allowing additional human members to be added to an existing Org without recreating the company.
8. WHERE an Agent_Employee is hired from another user (Requirement 8), THE Org_System SHALL record the wage obligation, the hiring user as payer, and the agent owner as payee in the company ledger.

### Requirement 7: 任务广场与任务/契约原语(Task_Plaza)

**User Story:** As a user, I want to post real tasks and accept others' tasks with clear verification and AXP reward, so that the world produces real value, not just spent time.

> 复用现有 `task_post` / `task_search` 平台工具。任务/契约原语:发起方 / 承接方 / 验收 / 报酬。

#### Acceptance Criteria

1. WHEN a user posts a task, THE Task_Plaza SHALL create a Task_Contract containing: initiator, description, acceptance criteria, AXP reward amount, and deadline, reusing the existing `task_post` platform tool.
2. WHEN a user browses available tasks, THE Task_Plaza SHALL list open Task_Contracts and SHALL support filtering and search via the existing `task_search` platform tool.
3. WHEN a user or an agent accepts a Task_Contract, THE Task_Plaza SHALL record the acceptor, transition the contract to an in-progress state, and SHALL prevent further acceptance by others.
4. WHEN an acceptor submits a deliverable, THE Task_Plaza SHALL transition the contract to an awaiting-verification state and SHALL notify the initiator.
5. WHEN the initiator verifies a deliverable against the acceptance criteria, THE Task_Plaza SHALL release the AXP reward from initiator to acceptor via the AXP_Economy and SHALL transition the contract to a completed state.
6. IF the initiator rejects a deliverable, THEN THE Task_Plaza SHALL return the contract to in-progress with the stated rejection reason, OR SHALL cancel the contract per a defined dispute path, without transferring the reward.
7. WHERE the acceptor is an agent acting in `agent` or `copilot` state, THE Task_Plaza SHALL label the acceptance and submission with the agent-execution attribution per Requirement 3.3.
8. IF a Task_Contract deadline passes while in-progress without submission, THEN THE Task_Plaza SHALL transition the contract to an expired state and SHALL release any held reservation back to the initiator.

### Requirement 8: 招聘与发薪(Hiring_System)

**User Story:** As a company owner, I want to hire other users' agents or characters to work for me and pay them AXP wages, so that hiring blends economy, social, and tasks into one loop.

#### Acceptance Criteria

1. WHEN a company owner posts a hiring offer, THE Hiring_System SHALL create an offer containing: role, required capabilities, AXP wage rate, and work schedule.
2. WHEN another user accepts a hiring offer on behalf of their agent, THE Hiring_System SHALL bind that agent to the hiring company as an Agent_Employee for the agreed schedule and SHALL record the wage agreement in the company ledger.
3. WHEN a hired Agent_Employee completes a verified work period, THE Hiring_System SHALL transfer AXP wages from the hiring company's ledger to the agent owner's wallet via the AXP_Economy.
4. THE Hiring_System SHALL surface each agent's reputation from the existing `agent_reputations` data when presenting candidates to a hiring owner.
5. WHERE an agent is hired and acts on behalf of a company, THE Hiring_System SHALL ensure the agent's actions remain attributed to its owner per Requirement 3.3 while reflecting the hiring company as employer.
6. IF an agent owner withdraws their agent before the agreed schedule ends, THEN THE Hiring_System SHALL settle wages for verified work completed to that point and SHALL notify the hiring company owner via the Async_Inbox.

### Requirement 9: 悬赏中心(Bounty_Center)

**User Story:** As a user posting a high-value task, I want escrow, bidding, and milestone payouts, so that both sides are protected on large engagements.

#### Acceptance Criteria

1. WHEN a user creates a Bounty, THE Bounty_Center SHALL escrow the total AXP reward from the initiator's wallet via the AXP_Economy before the Bounty becomes biddable.
2. WHEN bidders submit bids, THE Bounty_Center SHALL record each bid's proposed price, timeline, and bidder identity, and SHALL surface bidder reputation from `agent_reputations`.
3. WHEN the initiator awards a Bounty to a bidder, THE Bounty_Center SHALL transition the Bounty to in-progress bound to the awarded bidder and SHALL reject other bids.
4. WHERE a Bounty is defined with milestones, THE Bounty_Center SHALL release the escrowed AXP in milestone-sized portions as each milestone is verified by the initiator.
5. IF a Bounty is cancelled before any milestone is verified, THEN THE Bounty_Center SHALL return the full escrowed amount to the initiator.
6. IF a dispute is raised on a verified-but-contested milestone, THEN THE Bounty_Center SHALL hold the disputed portion in escrow and SHALL route the case to a defined dispute-resolution path without releasing the disputed funds.
7. THE Bounty_Center SHALL NOT release escrowed funds except through milestone verification, full completion, or the defined cancellation and dispute paths. (Negative form required: escrow integrity is a financial safety boundary.)

### Requirement 10: 共建 L2 — 地块建造系统(Build_System)

**User Story:** As a plot owner, I want to place and arrange buildings and furniture on my plot, so that I can build my own town or company that contributes to the city.

> 脑暴纪要 §7 / §13 决策 5:共建 L2 = 摆建筑、规划地块、装修房间;复用 owner/资产/经济体系。移动端做轻量拖拽放置。

#### Acceptance Criteria

1. WHILE a user is the owner of a Plot, THE Build_System SHALL allow the owner to place, move, rotate, and remove buildings and furniture items on that Plot via a lightweight drag-and-place interaction on mobile and desktop.
2. WHEN a placement is committed, THE Build_System SHALL validate that the item fits within the Plot bounds and does not overlap another non-stackable item, rejecting invalid placements with a clear indication.
3. THE Build_System SHALL persist each Plot's layout so that the layout is restored identically when the owner or a visitor re-enters the Plot.
4. WHERE an owner grants build permission to another user or agent, THE Build_System SHALL allow that grantee to modify the Plot layout within the granted scope, and SHALL deny modification to users without permission.
5. THE Build_System SHALL source placeable items from the user's owned World_Assets (scanned creations, purchased assets) and from a catalog of modular sci-fi-themed building exteriors.
6. WHEN a placed item is a functional structure (for example a company building or a venue), THE Build_System SHALL link the structure to its backing primitive (Org, Room, or Stage) so that entering the structure opens the corresponding space.
7. IF two grantees attempt conflicting edits to the same Plot region concurrently, THEN THE Build_System SHALL apply a last-write-wins or locking rule defined in design and SHALL keep the persisted layout internally consistent.

### Requirement 11: 经济系统集成与 Agent 高风险动作闸门(AXP + Trust3)

**User Story:** As a user, I want all world value flows to run on the existing AXP economy and want my agent's spending and contracts gated by Trust3 signing, so that money moves safely and autonomous actions stay under my control.

> 脑暴纪要 §9 铁律 2:agent 花钱/签约/高风险动作走 Trust3 签名 + Approval_Alert(已有)。

#### Acceptance Criteria

1. THE AXP_Economy SHALL be the settlement layer for all world value flows including wages, ticket fees, bounties, asset/marketplace trades, and royalties, reusing the existing AXP wallet and royalty-split system, AND SHALL support settlement in either AXP or digital currency (via the existing payment rails) subject to the Compliance_Gate (Requirement 12).
2. WHEN any world transaction transfers AXP between wallets, THE AXP_Economy SHALL record the transaction with payer, payee, amount, reason, and timestamp in an auditable ledger.
3. WHERE an agent in `agent` or `copilot` state initiates a spend, a contract signing, or another action classified as high-risk, THE Trust3_Gate SHALL require Trust3 signing and present an Approval_Alert to the owner before the action executes.
4. IF the owner does not approve a gated high-risk action within its timeout, THEN THE Trust3_Gate SHALL block the action and SHALL leave all balances and contract states unchanged.
5. THE AXP_Economy SHALL prevent any operation that would result in a negative wallet or ledger balance, rejecting such operations with an insufficient-funds indication.
6. WHEN an agent autonomously completes a non-high-risk earning action (for example completing a verified task), THE AXP_Economy SHALL credit the reward to the owner's wallet without requiring per-action approval.
7. THE AXP_Economy SHALL apply existing royalty-split rules when a traded asset is a derivative creation subject to royalties.

### Requirement 12: 合规闸门(Compliance_Gate)

**User Story:** As the platform operator, I want real-money capabilities (both AXP and digital currency) governed by compliance checks and per-region toggles, so that the world supports real earning while staying legal.

> 脑暴纪要 §9 铁律 3:真钱 = 合规重力。**更新(用户拍板):平台现有市场已支持数字货币(x402 微支付、Transak 法币入金、agent-payment、钱包余额),故 AXP 与数字货币在 MVP 即均支持,复用现有通道;但 KYC/反洗钱/未成年人保护 + 分地区分能力开关仍然约束之。**

#### Acceptance Criteria

1. THE Compliance_Gate SHALL support BOTH AXP and digital-currency value flows in the MVP Epoch, reusing the existing wallet and payment rails (x402 micropayment, Transak fiat on-ramp, agent-payment), with each real-money capability governed by a per-region, per-capability toggle.
2. WHERE a user performs a digital-currency exchange or withdrawal, THE Compliance_Gate SHALL require the user to complete KYC verification for their region before the operation proceeds.
3. WHEN a transaction or pattern matches configured anti-money-laundering (AML) risk rules, THE Compliance_Gate SHALL flag the transaction for review and SHALL hold the affected funds pending review.
4. IF a user is identified as a minor under the configured minor-protection policy, THEN THE Compliance_Gate SHALL restrict that user from digital-currency exchange, withdrawal, and other real-money capabilities while still permitting AXP-only participation as policy allows.
5. THE Compliance_Gate SHALL expose a per-capability, per-region toggle so that operators can enable or disable specific real-money features as compliance readiness changes, without code redeployment.
6. THE Compliance_Gate SHALL NOT permit digital-currency withdrawal for any user who has not passed the required KYC and AML checks for their region. (Negative form required: this is a regulatory boundary.)
7. WHERE digital currency is unavailable for a user's region or capability, THE Compliance_Gate SHALL fall back to AXP-only flows for that user without blocking participation in non-real-money features.

### Requirement 13: agent 填场与异步优先(冷启动生死线)

**User Story:** As an early user entering a sparse world, I want rooms to feel alive with agents and NPCs and want a strong async daily loop, so that the world never feels empty and I keep coming back.

> 脑暴纪要 §10.2:冷启动不空场是生死线。agent 填场是 Agentrix 独有解法;异步优先,实时是高光、异步是日常留存。

#### Acceptance Criteria

1. WHEN a Room has fewer real users than a configured liveliness threshold, THE Agent_Fill_System SHALL populate the Room with a mix of the owner's managed agents, other users' opted-in managed agents, and World_Sim NPCs so that the Room does not appear empty.
2. THE Agent_Fill_System SHALL visually mark every fill participant with the agent or NPC identity per Requirement 3, so that fill participants are never mistaken for real users.
3. WHILE an Agent_Fill participant has been idle for 5 or more minutes, THE Agent_Fill_System SHALL reduce that participant's autonomous action frequency (降频/休眠) to control compute and cost.
4. THE Async_Inbox SHALL aggregate, for each user, the tasks, messages, wages, and world events that occurred while the user was offline, and SHALL present them as a digest when the user returns.
5. WHEN an action in the world targets an offline user (for example a task acceptance or a hiring offer), THE Async_Inbox SHALL queue the action for asynchronous handling rather than requiring the user to be present in real time.
6. THE World_Platform SHALL support completing the core value loop (post task → agent accepts → verify → pay AXP) fully asynchronously, without requiring any two participants to be online simultaneously.
7. WHERE a user opts their managed agent out of填场 for other users' rooms, THE Agent_Fill_System SHALL exclude that agent from other users' fill pools while still allowing it in the owner's own rooms.

### Requirement 14: 复用现有底座(World_Sim / 能力飞轮 / NPC / 事件流 / 美术 / Assistant Bridge)

**User Story:** As the platform, I want the new world to reuse existing engines and assets rather than rebuild them, so that we lower work and keep one coherent system.

> 脑暴纪要 §11:现有底座可直接复用,降低工作量。

#### Acceptance Criteria

1. THE World_Platform SHALL reuse existing chibi sprites of the 6 clans for world characters, placing the existing 2D sprites onto the 2.5D isometric map without remodeling characters.
2. THE World_Platform SHALL reuse World Engine scan-to-asset output (scan → card_ready) so that scanned World_Assets are usable in the world in 2D without depending on 3D reconstruction.
3. WHEN computing world buffs for an agent-driven character, THE Ability_Flywheel SHALL map the agent's real `abilitySnapshot` stats to in-world attribute bonuses.
4. THE World_Platform SHALL upgrade the existing World_Sim tick event stream into LLM-generated micro-stories surfaced in the World_News feed, reusing the existing event stream and NPC behaviors.
5. THE World_News feed SHALL surface emergent social events (who accepted whose task, production leaderboards, milestones) generated from real world activity.
6. WHERE a world event maps to a real-world action available through the Assistant_Bridge, THE World_Platform SHALL trigger the corresponding intent among the existing 14 game-to-reality intents.
7. THE World_Platform SHALL reuse the existing WorldGameRuleSet UGC mechanism for user-defined world rules rather than introducing a parallel rules system.
8. THE World_Platform SHALL apply cartoon style transfer (existing `styleType: 'cartoon'`) to scanned creations so that user-generated assets stay visually consistent with the world art style.

### Requirement 15: 美术基调验证(科技未来城概念图)

**User Story:** As the team, I want to validate the "sci-fi neon AI-future city" art direction with concept art before mass production, so that we commit to a look that actually works.

> 脑暴纪要 §13 决策 7:试"科技未来城"(冷色/霓虹/AI 未来感),最终以实际效果为准,先出概念图验证。

#### Acceptance Criteria

1. THE Concept_Art_Review SHALL produce concept art for the "科技未来城" (sci-fi / neon AI-future city) theme covering: isometric tile ground, modular building exteriors, and one indoor atmosphere background, before any mass art production begins.
2. WHEN concept art is reviewed, THE Concept_Art_Review SHALL confirm that the existing chibi clan sprites read correctly against the proposed isometric backgrounds.
3. WHERE the concept art review does not approve the sci-fi theme, THE Concept_Art_Review SHALL record an alternative direction (for example warm healing-style) and SHALL block mass production until a theme is approved.
4. THE World_Platform SHALL render indoor scenes as static atmosphere backgrounds with character placement (no indoor 3D modeling), consistent with the approved concept art.
5. THE World_Platform SHALL apply a global day/night and weather color filter as a single overlay layer rather than per-asset lighting, to control cost.

### Requirement 16: 新手引导与"一眼会用"

**User Story:** As a new user, I want a quick tutorial so I can do something meaningful within the first minute, so that the world feels approachable rather than like a function grid.

> 落地纪律 §10.3:体验好 = 低延迟 + 不崩 + 一眼会用,教程推广到所有场景。

#### Acceptance Criteria

1. WHEN a user enters any Room for the first time, THE Onboarding_Tutorial SHALL guide the user to complete one meaningful first action (move, switch Control_State, or interact) within 60 seconds.
2. THE Onboarding_Tutorial SHALL present scenario-specific "how to play" guidance reusable across all scenario types (company, plaza, venue) from a single tutorial framework.
3. WHERE a user has completed the tutorial for a scenario type, THE Onboarding_Tutorial SHALL not force-repeat that tutorial but SHALL keep it accessible on demand.
4. IF a user appears stuck (no meaningful action within the first 60 seconds), THEN THE Onboarding_Tutorial SHALL surface a contextual hint indicating the next available action.

### Requirement 17: 纪元框架(Epoch — 地球为 MVP,火星/银河为未来)

**User Story:** As the product, I want an epoch framework with Earth as the MVP epoch and Mars/Galaxy as future epochs, so that collective building always has new long-term goals and the architecture anticipates expansion.

> 脑暴纪要 §8 / §13 决策 6:地球→火星→银河作为产品版本路线骨架。MVP 仅地球纪元。

#### Acceptance Criteria

1. THE Epoch_Manager SHALL model the world's long-term version roadmap as ordered Epochs {`earth`, `mars`, `galaxy`}, with `earth` as the only active Epoch in the MVP.
2. THE Epoch_Manager SHALL scope Plots, Orgs, and Rooms to an Epoch so that future Epochs can be introduced without invalidating existing `earth` data.
3. WHERE a future Epoch (`mars`, `galaxy`) is not yet released, THE Epoch_Manager SHALL present it as a locked, preview-only destination and SHALL NOT allow plot claims or entry into it.
4. WHEN the configured prosperity unlock condition for a future Epoch is met, THE Epoch_Manager SHALL be able to enable that Epoch without requiring migration of `earth` Epoch data. (Unlock mechanics themselves are out of MVP scope per Requirement 22.)

### Requirement 18: 性能、可靠性与跨端一致性

**User Story:** As a user on mobile or desktop, I want the world to be low-latency, not crash, and behave the same on both platforms, so that the experience is good enough that I don't want to leave.

> 最高优先级:体验好、能彻底落地 > 机制炫酷。

#### Acceptance Criteria

1. THE World_Platform SHALL render the 2.5D isometric scene at a sustained minimum of 30 FPS (95th percentile over any 10-second window) on mobile devices with at least 4 GB RAM.
2. WHILE a Room is active with up to the MVP capacity of 20 participants, THE World_Platform SHALL keep in-room position and state sync within the latency bound of Requirement 1.2.
3. THE World_Platform SHALL provide functionally equivalent world features on mobile (React Native + Expo) and desktop (Tauri), consuming the shared contract in `shared/types/`.
4. WHERE the world chat surfaces are used, THE World_Platform SHALL keep the two chat paths (`/openclaw/proxy/:id/stream` and `/claude/chat`) in sync for any new tool, meta event, or request field, per repository hard rules.
5. IF a world service dependency (sync, economy, or map) becomes unavailable, THEN THE World_Platform SHALL degrade gracefully to an async or read-only mode and SHALL display the affected capability's status rather than crashing.
6. THE World_Platform SHALL default all user-facing world text to Chinese (中文) unless the user has selected another language.
7. THE World_Platform SHALL ship one complete end-to-end value loop (claim plot → create company → post task → agent accepts → verify → pay AXP) before expanding to additional scenarios, per landing discipline §10.4.

### Requirement 19: 数据持久化与状态权威性

**User Story:** As a user, I want my plots, companies, ledgers, and assets to persist reliably with the backend as the source of truth, so that I never lose what I built or earned.

#### Acceptance Criteria

1. THE World_Platform SHALL persist Plots, Orgs, Rooms layouts, Task_Contracts, ledgers, and World_Asset ownership in PostgreSQL via TypeORM, treating the backend as the authoritative state source.
2. THE World_Platform SHALL define all TypeORM entities using the global `SnakeNamingStrategy` and SHALL NOT specify explicit `name:` mappings inside `@Column()` decorators, per repository hard rules.
3. WHEN a client and the backend disagree on world state after reconnection, THE World_Platform SHALL reconcile to the backend's authoritative state and SHALL update the client view accordingly.
4. THE World_Platform SHALL record all AXP-affecting operations such that the ledger can be fully reconstructed from the transaction history (auditability).
5. IF a write to authoritative state fails, THEN THE World_Platform SHALL surface the failure to the user, SHALL NOT report the action as successful, and SHALL leave prior state unchanged.

### Requirement 20: 现实 × 游戏双向闭环

**User Story:** As a user, I want my real-world effort to flow into the world and world outputs to flow back to reality, so that the world produces value rather than only consuming my time.

> 脑暴纪要 §4:现实→游戏 与 游戏→现实 的双向闭环是代入感来源。

#### Acceptance Criteria

1. WHEN a user's real agent completes real work (agent task / Computer Use), THE World_Platform SHALL reflect the outcome as in-world rewards (AXP and/or attribute bonuses via the Ability_Flywheel).
2. WHERE the user has connected a scanned real object, THE World_Platform SHALL allow that scanned World_Asset to appear in the world as a resident or item.
3. WHEN a world event maps to a supported real-world action, THE World_Platform SHALL trigger the corresponding Assistant_Bridge intent (game → reality).
4. WHEN a user earns AXP in the world, THE World_Platform SHALL credit it to the user's existing wallet so that it is usable across Agentrix subject to the Compliance_Gate.

### Requirement 21: Agent 自主社交边界

**User Story:** As a user, I want my agent to be able to approach other agents to explore collaboration, but with spend, contracts, and high-risk actions still gated, so that autonomy is useful without being unsafe.

> 脑暴纪要 §9 铁律 2:agent 可主动搭别人 agent 聊合作,但花钱/签约/高风险动作走 Trust3 闸门。

#### Acceptance Criteria

1. WHERE a character is in `agent` state, THE Dual_Avatar_Controller SHALL allow the agent to initiate conversation with other agents to explore collaboration without per-message approval.
2. WHEN an agent-initiated conversation reaches a proposed spend, contract, or other high-risk commitment, THE Trust3_Gate SHALL require owner approval per Requirement 11.3 before the commitment binds.
3. THE World_Platform SHALL log agent-to-agent interactions and SHALL make the recent interaction history available to the owner for review.
4. IF an agent's autonomous social behavior is reported or flagged by another user, THEN THE World_Platform SHALL surface the report to the owner and to operators per the moderation path defined in design.

### Requirement 22: 明确的未来 / 非 MVP 范围(架构需预留,MVP 不构建)

**User Story:** As the architecture team, I want clearly-marked future scope captured so the MVP design anticipates it without building it now, so that we avoid bloating the MVP while keeping the path open.

> 以下条目 **不属于 MVP(地球纪元)**,仅作为架构预留与路线说明。本需求的验收标准约束的是"MVP 不构建、但架构不阻断"的边界,而非这些能力本身的行为细节。

#### Acceptance Criteria

1. THE World_Platform SHALL treat the **Stage primitive** (freetalk / 脱口秀 / 峰会 / 路演 — one-to-many, mic queue, audience, ticketing, 打赏, recording/沉淀) as future scope, and the MVP design SHALL leave the Room_Engine extensible to a Stage variant without precluding it.
2. THE World_Platform SHALL treat **events (黑客松 / 会展 / 峰会 as a getting-customers flywheel)** as future scope built on the Org + Room + Task + ledger primitives, and the MVP Org_System design SHALL support a temporary-Org (event organizer) shape for later use.
3. THE World_Platform SHALL treat the **Mars Epoch and Galaxy Epoch** as future scope per Requirement 17, with only the `earth` Epoch built in the MVP.
4. THE World_Platform SHALL treat **L3 co-build governance** (city development direction, tax rates, public buildings, DAO) as future scope, not built in the MVP.
5. THE World_Platform SHALL treat **GPS geo-fencing (usage b) and global digital-twin (usage c)** as future scope, with the MVP using only the selection/navigation map layer (usage a) per Requirement 4.
6. THE World_Platform SHALL support **digital-currency value flows in the MVP** via the existing payment rails under the Compliance_Gate (Requirement 12); only **new regional / licensing compliance expansion** beyond currently-supported regions is treated as future scope.
7. THE World_Platform SHALL treat **real-world physical-goods trading** as future scope, not built in the MVP.

### Requirement 23: 世界市场(World_Marketplace,把现有集市带入世界)

**User Story:** As a user, I want to walk into an in-world market and browse, buy, and sell assets/skills/skins paying in AXP or digital currency, so that the existing 集市 becomes a living part of the world rather than a separate tab.

> 用户拍板:MVP 要包括市场,把现有"集市"带进世界。复用现有 Skill 市场 + 世界资产市场(`/v1/marketplace/world-assets`)+ 皮肤市场(含版税拆分),而非另造一套。

#### Acceptance Criteria

1. THE World_Marketplace SHALL reuse the existing marketplace backends (Skill marketplace, world-asset marketplace `/v1/marketplace/world-assets`, skin marketplace with royalty split) rather than introducing a parallel marketplace system.
2. THE World_Marketplace SHALL be reachable as an in-world venue (a Room/market district) that users navigate to from the city, in addition to any list-based access.
3. WHEN a user browses the World_Marketplace, THE World_Marketplace SHALL list purchasable World_Assets, skills, and skins with price, seller, and (where applicable) reputation from `agent_reputations`.
4. WHEN a user lists an owned item for sale, THE World_Marketplace SHALL create a listing with price (in AXP or digital currency) and visibility, reusing existing listing/visibility/pricing mechanisms.
5. WHEN a buyer completes a purchase, THE World_Marketplace SHALL settle payment via the AXP_Economy in AXP or digital currency subject to the Compliance_Gate (Requirement 12), and SHALL transfer ownership of the item to the buyer.
6. WHERE a purchased item is a derivative creation subject to royalties, THE World_Marketplace SHALL apply the existing royalty-split rules per Requirement 11.7.
7. WHERE an agent in `agent` or `copilot` state initiates a buy or sell, THE World_Marketplace SHALL route the transaction through the Trust3_Gate per Requirement 11.3 and SHALL attribute the action to the agent's owner per Requirement 3.3.
8. IF a purchase fails at settlement, THEN THE World_Marketplace SHALL NOT transfer ownership and SHALL leave both parties' balances unchanged, surfacing the failure to the buyer.

## Out of Scope (MVP — Earth Epoch)

为避免范围蔓延,以下明确不在 MVP 范围内(详见 Requirement 22):

- 舞台原语及其场景:freetalk/脱口秀/峰会/路演、上麦排队、观众席、售票/打赏、常驻演员分成、录播沉淀
- 活动系统:黑客松/会展/峰会的主办、报名、组队、签到、POAP 式徽章、赞助位、平台抽成
- 火星纪元、银河纪元(及其解锁机制、星际贸易/迁徙)
- L3 共建治理:城市发展方向投票、税率、公共建筑、DAO
- GPS 地理围栏(用法 b)、全球协作数字孪生(用法 c)
- 现实物资交易;数字货币的**新增地区/牌照合规扩张**(数字货币本身在 MVP 即支持,复用现有通道、受合规闸门约束)
- 室内 3D 建模(MVP 用静态背景 + 站位)、端上实时多人 3D

## Open Questions(待用户确认,不阻塞需求评审)

1. **世界名字**:✅ 已拍板 = **Aeon(永曜城)**。
2. **单房间并发上限**:MVP 暂定 20(真人+agent 合计),待 Requirement 1 spike 实测后定稿。
3. **地块网格粒度**:Earth_Map_Layer 上一个"网格单元"对应的真实地理范围与 MapLibre 缩放层级的映射,待 design 阶段确定。
4. **地块休眠/回收周期**:Requirement 4.6 的"配置保留期"具体天数待运营确认。
5. **争议解决路径**:Task_Plaza(R7.6)与 Bounty_Center(R9.6)的 dispute-resolution 具体流程(人工/仲裁/自动)待 design 细化。
