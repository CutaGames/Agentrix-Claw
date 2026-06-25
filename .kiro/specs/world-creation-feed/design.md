# Design Document

> 世界创作与浏览(World Creation & Feed)— 技术设计文档
> 关联需求:`./requirements.md`

## Overview

### 设计目标

把移动端「世界」Tab 重构为一个统一的"活世界",其原子单位是 **Creation(创作)**——一个**双接口单元**:对人是可体验的应用/场所,对 Agent 是可被检索/调用/交易的服务。系统据此提供**三个发现面**(人·娱乐流、人·意图地图、机器·能力检索),共享同一个 Creation 真相源。

本设计落实需求中的关键决策:

- **深合并**:A(Aeon 真实地理 + 经济/社交/现实关联)与 B(v6 ECS 内容 + 分层基底 + 创作连续谱)合并为单一 Creation 模型与注册表;分阶段迁移、可回滚。
- **低门槛创作**:创作者只做"一个动作"(描述/搭建),offering 与 Agent 能力清单(MCP 风格工具)由系统自动派生。
- **Agent 为 V1 一等消费者**:标准动词 `query/order/book/message/subscribe/donate`,预设额度授权,经 Economy_Bridge 权威结算,全程审计;与人端共用同一套权威逻辑。
- **退役战斗子系统**(含后端),但保留扫描→资产生成管线作为创作输入(带质量门槛)。

### 设计原则

1. **单一真相源**:Creation 注册表是地图、创作流、Agent 检索的唯一数据来源。
2. **同一份内容,多个投影**:人接口与机器接口都从 `ECS_World + offerings` 派生,不存在并行的两套规则或旁路。
3. **服务端权威**:价格、库存、结算、能力授权一律服务端计算;客户端/沙箱供给值仅为提示。
4. **deny-by-default 安全**:能力白名单 + 沙箱隔离 + 审核前置;Agent 调用全程鉴权/限额/审计。
5. **复用既有基建**:最大化复用 v6 `world-creation` 的 ECS/审核/经济桥、Aeon 的地理/社交/现实关联、平台既有 MCP 与 Trust Level。

### 范围与依赖(现状代码)

- 复用后端:`backend/src/modules/world-creation/**`(ECS、generation、moderation、economy、arena、presence、sandbox)、`backend/src/modules/aeon/**`(plot、room、build、org、task、event、news、reality、marketplace)。
- 复用移动端:`src/services/worldCreationApi.ts`、`src/services/aeon/aeonApi.ts`、`src/screens/world/*`、`src/screens/aeon/*`、`src/navigation/WorldStackNavigator.tsx`。
- 共享类型:`shared/types/world-creation.ts`、`shared/types/aeon-world.ts` → 新增统一 `shared/types/creation.ts`。
- 退役删除:`world-engine` 的战斗/副本/决策对战/UGC 战斗规则;`PetCameraScan`;保留 `world-engine` 的扫描/资产生成。

## Architecture

### 分层总览

```
┌─────────────────────────────────────────────────────────────┐
│  发现面 (Discovery Surfaces)                                  │
│  ① 人·娱乐:创作流 Feed   ② 人·意图:世界地图   ③ 机器:Agent 能力检索 │
└───────────────┬───────────────┬───────────────┬─────────────┘
                │               │               │
        ┌───────▼───────────────▼───────────────▼────────┐
        │  统一发现/查询层 Discovery API                    │
        │  (按地理/类目/能力/价格/信任/推荐 统一检索)        │
        └───────────────────────┬─────────────────────────┘
                                │  读
        ┌───────────────────────▼─────────────────────────┐
        │  Creation 注册表 (单一真相源)                      │
        │  Creation · Offering · CapabilityManifest · Preview │
        │  ├─ 地理维度 (lat/lng, POI, 签到)  ← 原 Aeon        │
        │  └─ 内容维度 (ECS_World, Substrate Tier) ← 原 v6    │
        └───┬───────────────┬───────────────┬──────────────┘
            │ 写/编辑        │ 进入/体验      │ 调用
   ┌────────▼──────┐ ┌──────▼───────┐ ┌─────▼──────────────┐
   │ 创作引擎       │ │ 体验运行时    │ │ Agent 调用网关      │
   │ generate/     │ │ enter + 沙箱  │ │ MCP 工具 + 标准动词  │
   │ continue/     │ │ (L0/L1/L2)   │ │ 预设额度/鉴权/审计   │
   │ 自动派生清单   │ │              │ │                    │
   └───────┬───────┘ └──────┬───────┘ └─────┬──────────────┘
           │                │                │
   ┌───────▼────────────────▼────────────────▼──────────────┐
   │  横切服务: Moderation 审核 · Economy_Bridge 权威结算 ·    │
   │           Trust Level · 审计日志 · 现实关联(POI/签到/奖励) │
   └─────────────────────────────────────────────────────────┘
```

### 关键架构决策

1. **Creation 注册表为单一真相源(深合并)。** 新建统一注册表,承载两个维度:
   - *地理维度*(来自原 Aeon):经纬度锚点、网格单元、商家 POI、签到。
   - *内容维度*(来自原 v6):当前 ECS_World 版本、Substrate Tier、offerings。
   一个 Creation 可只有内容(纯线上游戏,只进流)、只有地理(地图上的点),或两者皆有(地图上可进入的店/游戏)。

2. **三个发现面共用一个查询层。** 地图(视口/附近)、创作流(竖向分页/推荐)、Agent 检索(语义+能力过滤)都是同一 Discovery API 的不同查询形态,读同一注册表,保证 counter/offering/清单一致。

3. **人接口与机器接口同源。** 体验运行时(人 enter)与 Agent 调用网关(机器 invoke)都作用于同一 `ECS_World + offerings`,经同一个 Economy_Bridge 结算。Agent 网关把 offerings + 标准动词**自动投影**为 MCP 工具,不另写规则。

4. **既有模块归并而非重写。** `world-creation` 的 ECS/generation/moderation/economy/sandbox 直接作为创作引擎与体验运行时的核心;`aeon` 的 plot/room/org/task/event/reality 作为地理维度与现实关联能力,挂到统一 Creation 上;两套 marketplace 收敛为统一交易模型。

5. **战斗子系统下线。** `world-engine` 中对战/副本/决策对战/UGC 规则相关 controller/service/entity/migration 删除;**保留**扫描会话与资产生成(scan→asset)作为"扫描现实资产"创作输入。

### 与既有后端模块的映射

| 统一架构组件 | 复用/归并自 | 处置 |
|---|---|---|
| Creation 注册表(内容维度) | `world-creation` WorldPlot + ECS_World | 扩展为 Creation 主表 |
| Creation 注册表(地理维度) | `aeon` AeonPlot(lat/lng/POI/checkin) | 字段并入 Creation;迁移回填 |
| 创作引擎 | `world-creation` generation/ecs/sandbox | 直接复用 |
| 体验运行时 | `world-creation` enter/world-api + `aeon` room/stage | 统一 enter 协议 |
| Agent 调用网关(新) | 平台 MCP + `world-creation` economy + `aeon` connectors | 新建中介层 |
| 审核 | `world-creation` moderation | 直接复用 |
| 经济结算 | `world-creation` Economy_Bridge + `aeon` AXP/orgs | 统一抽成模型 |
| 现实关联 | `aeon` reality/poi/checkin | 挂到 Creation |
| 扫描创作输入 | `world-engine` scan→asset(仅此保留) | 作为创作素材源 |
| 战斗子系统 | `world-engine` battle/dungeon/ugc | **删除** |



## Components and Interfaces

### 后端模块(NestJS)

- **`creation` 模块(新增,核心):** Creation 注册表的 CRUD、状态机、offering/manifest 派生、统一 Discovery API。聚合调用下列既有服务。
- **`creation/discovery`(新增):** 统一查询层。三种查询形态:`map(viewport/nearby)`、`feed(分页/推荐)`、`agentSearch(语义+能力过滤)`。
- **`creation/agent-gateway`(新增):** MCP 工具暴露 + 标准动词执行;前置鉴权、预设额度核销、限流、审计;内部转调 Economy_Bridge / 体验运行时 / 留言。
- **复用 `world-creation`:** generation/ecs/sandbox/moderation/economy/arena → 创作引擎、体验运行时、审核、结算。
- **归并 `aeon`:** plot(geo)、room/stage(可进入空间)、org(公司/经营)、task(悬赏)、event(直播/活动)、reality(签到/现实奖励)、poi → 作为 Creation 的地理与现实关联能力。
- **保留 `world-engine` 子集:** 仅扫描会话 + 资产生成(scan→asset);删除 battle/dungeon/interactive-battle/ugc-ruleset。

### REST 接口(统一前缀建议 `/v1/creations`)

| 方法/路径 | 说明 | 复用 |
|---|---|---|
| `POST /v1/creations` | 新建创作(可仅 geo / 仅内容 / 两者) | aeon claim + v6 plot |
| `POST /v1/creations/:id/generate` | 提示词生成 ECS | v6 generate |
| `POST /v1/creations/:id/continue` | 连续谱编辑(prompt/coEdit/handBuild) | v6 continue |
| `POST /v1/creations/:id/publish` | 审核→发布→生成 shareCode + 派生 manifest | v6 publish + moderation |
| `GET  /v1/creations/discover` | 统一发现(map/feed/agentSearch 三形态) | v6 discover + aeon markers |
| `POST /v1/creations/:id/enter` | 进入体验(人端) | v6 enter + aeon enter |
| `GET  /v1/creations/:id/manifest` | 机器可读能力清单(MCP 工具) | 新增 |
| `POST /v1/creations/:id/invoke` | 标准动词调用入口(Agent,经网关) | 新增 |
| `POST /v1/creations/:id/comment` `like` `share` `follow` | 社交 | aeon messages + 新增 |
| `POST /v1/creations/:id/poi` `checkin` | 现实关联 | aeon poi/checkin |

### MCP 接口(机器面)

- 每个已发布 Creation 自动暴露一组 MCP 工具:`query / order / book / message / subscribe / donate`,工具参数从 offerings 派生。
- 平台中介层在 MCP 工具执行前后插入:鉴权(代谁)、预设额度核销、Economy_Bridge 权威结算、审计写入 `agent_invocations`。

### 移动端(导航与屏幕)

`WorldStackNavigator` 重构:

- **新增 `CreationFeedScreen`**:竖向抖音式流(预览卡 + 流内行动)。
- **`WorldMapScreen` 统一**:取代当前 Aeon 地图 + v6 WorldMap 两张图,标记 = Creation。
- **`WorldHubScreen` 重构**:围绕单一核心循环(创作 / 浏览 / 我的世界),按新/老用户渐进披露(需求 10)。
- **创作入口统一**:`CreationCreatorScreen`(合并 PlotCreator 的 prompt/coEdit/handBuild + 选址 + 扫描素材入口)。
- **`CreationExperienceScreen`**:统一进入体验宿主(合并 v6 PlotExperience + Aeon Scene/Room/Stage)。
- **删除屏幕**:WorldBattlePicker/Arena/InteractiveBattle、WorldDungeonExplorer、WorldUgcRuleSets、PetCameraScan。
- 旧路由保留薄重定向(深链降级,需求 11.5)。

## Discovery Surfaces

三面共用 `GET /v1/creations/discover`,仅查询形态不同:

### ① 地图模式(人·意图)
- 输入:视口 bbox 或 `lat/lng + radius`;输出:带 geo 的 Creation 标记(区分商家 POI / 居民创作 / 可进入体验)。
- 复用 Aeon 真实地图 + 坐标换算(WGS-84↔GCJ-02);MapLibre 不可用时降级列表选址。
- 点标记 → 预览卡 → `enter`。

### ② 创作流模式(人·娱乐,类抖音)
- 输入:`cursor + 排序口径(newest/hot/following/nearby)`;输出:分页 Creation + 预览物。
- **预览 vs 进入分离(需求 5.2)**:流内只渲染轻量预览(封面/短视频/回放/首帧);显式上滑/点击才 `enter` 重型体验。
- **带类型卡片协议**:卡片按 `CreationType` 渲染并给出主行动(▶️玩 / 🛒买 / 🔴看 / 💬聊);shop 可流内 `order`,livestream/stage 进行中可直接进。
- **冷启动(需求 5.9)**:内容稀少时以官方/种子/跨地域内容填充;预加载下一屏保证流畅。

### ③ Agent 能力检索(机器)
- 输入:需求语义 + 能力/类目/价格/地理/信任过滤;输出:匹配的 Creation + offerings 能力清单(MCP 工具)。
- 与人端读同一注册表;返回结果即可直接 `invoke`(见 Agent Invocation)。



## Data Models

统一类型定义放在新文件 `shared/types/creation.ts`(跨端单一来源),既有 `world-creation.ts`(ECS/Tier/能力白名单)与 `aeon-world.ts`(地理/坐标换算)被引用复用,不重复定义。

### Creation(主对象)

```ts
// shared/types/creation.ts
export type CreationType = 'game' | 'shop' | 'livestream' | 'stage' | 'place';
export type CreationStatus =
  | 'draft' | 'under_review' | 'published' | 'listed' | 'unpublished' | 'suspended';
export type CreationAuthorType = 'user' | 'agent';

export interface Creation {
  id: string;
  ownerAccountId: string;
  originalCreatorAccountId: string;        // 首创者(抽成区分),沿用 v6 语义
  type: CreationType;
  status: CreationStatus;
  title: string;
  summary?: string;

  // 内容维度(原 v6):指向当前 ECS_World 版本与基底层级
  substrateTier: import('./world-creation').SubstrateTier;
  ecsVersionId: string | null;
  boundAgentId: string | null;             // Agent_Builder 离线自治

  // 地理维度(原 Aeon,均可空):仅内容创作可无地理
  geo?: { lat: number; lng: number; gridCell: string } | null;
  poi?: import('./aeon-world').AeonPlotPoi | null;   // 真实商家绑定

  // 双接口投影
  preview: CreationPreview;                // 发布必备(需求 3.2)
  offerings: Offering[];                   // 0..N 供给项 → 人端展示 + 机器清单
  manifestVersion: number;                 // 能力清单派生版本(随内容/offerings 变更)

  // 发现/社交
  shareCode: string | null;
  metrics: { views: number; likes: number; sales: number; comments: number };
  createdAt: number;
  updatedAt: number;
}
```

### Offering(供给项)与能力清单

`Offering` 是"创作提供的产品/服务/能力"的统一描述,**人端展示与机器端 MCP 工具都从它派生**(需求 1.10、2.10)。

```ts
export type OfferingKind = 'product' | 'service' | 'ticket' | 'subscription' | 'tip';
export type CreationVerb = 'query' | 'order' | 'book' | 'message' | 'subscribe' | 'donate';

export interface Offering {
  id: string;
  kind: OfferingKind;
  name: string;
  description?: string;
  price?: { axp?: number; usd?: number };  // 展示价;权威价由 Economy_Bridge 计算
  verbs: CreationVerb[];                    // 该 offering 支持的标准动词
  availability?: {                          // 可空:库存/时段/容量
    stock?: number; schedule?: { startsAt: number; endsAt?: number }[]; capacity?: number;
  };
  // 来源溯源:多数 offering 自 ECS 实体的 price/ui 组件派生
  derivedFromEntityId?: string;
}

/** 机器可读能力清单 = 从 Creation + offerings 自动派生的 MCP 工具集合(只读视图)。 */
export interface CapabilityManifest {
  creationId: string;
  version: number;
  tools: McpToolDescriptor[];               // 每个 offering×verb → 一个标准化工具
  customTools?: McpToolDescriptor[];         // 仅 Tier_C opt-in
}
```

> **派生规则(关键):** 发布时,系统遍历 ECS_World 中带 `price`/`ui`/`affordance` 的实体与显式 offerings,生成 offerings;再把 `(offering, verb)` 组合投影为标准化 MCP 工具(如 `order(offeringId, qty)`)。创作者从不手写工具 schema(需求 1.11、2.9)。

### 与既有实体的字段映射(深合并)

| Creation 字段 | v6 `world_plots` / `ecs_world` | Aeon `aeon_plot` 等 |
|---|---|---|
| id / owner / originalCreator | ✔ 直接来源 | 迁移生成 |
| substrateTier / ecsVersionId | ✔ | — |
| geo{lat,lng,gridCell} / poi | — | ✔ 来源 |
| offerings | 由 ECS `price` 实体派生 | 由 `market-stall`/POI/`org` 派生 |
| status | plot.status(扩展枚举) | plot.status 映射 |
| shareCode / metrics | ✔ shareCode;metrics 新增 | checkin/news 汇总 |

迁移时:v6 plot → Creation(内容维度齐全,geo 多为空);Aeon plot → Creation(geo/poi 齐全,内容维度初始为空 ECS,可后续生成)。详见 Migration Strategy。

### 新增/变更的持久化

- 新表 `creations`(主)、`creation_offerings`、`creation_previews`、`creation_capability_manifests`(派生缓存)、`agent_invocations`(审计 + 额度核销)。
- 复用表:`ecs_world_versions` / `ecs_world_diffs` / `creation_tasks` / `plot_listings`(v6);`aeon_*`(room/org/task/event/checkin/poi)按维度挂到 Creation。
- 遵循全局 `SnakeNamingStrategy`:实体属性 camelCase,列名自动 snake_case,**不手写 `name`**。



## Creation Authoring

### 单一动作创作流(低门槛)

创作者只经历"一个动作",其余自动:

```
描述/搭建 ──▶ 生成 ECS_World 草稿 ──▶ (可选)选址到地图 ──▶ 发布
   │                                                    │
   │              系统自动:派生 offerings + 能力清单(MCP 工具)
   └────────────────────────────────────────────────────┘
```

- **三档连续谱**(复用 v6):`promptDrive` 提示词生成、`coEdit` 自然语言增改、`handBuild` 手动微调,作用于同一 ECS_World;每次改动产生结构化 diff + 版本,支持回滚。
- **选址可选**:绑定 geo 则进地图;不绑定则仅进创作流。两者皆可。
- **offering / 清单自动派生**:发布时从 ECS `price`/`ui` 实体与显式标注派生 offerings,再投影为标准动词 MCP 工具。创作者只"标价/标明提供什么",两端复用。

### Substrate 层级与 Tier_C 派发

- Tier_A 声明式 / Tier_B 受限 DSL:移动端本地即可生成与运行。
- Tier_C(图灵完备逻辑模块):移动端发起时**强制派发**到桌面端或 Agent_Builder(复用 v6 Creation_Task_Queue),并回报任务状态。
- 越界(超出声明 Tier 的组件/能力)返回 `TIER_VIOLATION`。

### 扫描作为创作输入(质量门槛)

- 复用 `world-engine` 扫描会话 + 资产生成,产物作为创作素材(角色/资产/建材)。
- **质量门槛(需求 2.12 / 11.4)**:产物须风格化、连贯、可用;**绝不直出原始照片**。未达门槛不作为成品呈现。门槛的客观判定标准为开放项,设计上预留一个 `qualityGate(assetGenResult) → pass|fail` 钩子,初期可用"是否有风格化 mesh/立绘 + 基本完整度"为占位判据,后续替换为更严格指标。

### 共创与 Agent 自治建造

- 多作者:Creation owner 可授予 grantee 协同创作权限(复用 Aeon `buildGrantees` 思路,扩展到 ECS 编辑)。
- Agent_Builder:绑定后可在用户离线时自治建造/维护(复用 v6 `boundAgentId` + Creation_Task)。
- 作者归属:每个 diff 记录 `authorType(user/agent)` 以区分。

## Agent Invocation (Machine Surface)

### MCP 工具自动生成

发布时,网关为 Creation 生成 `CapabilityManifest`:

- 对每个 `(offering, verb)` 生成一个标准化 MCP 工具,例如:
  - `query`(无副作用)→ 返回信息/库存/价格/可用时段。
  - `order(offeringId, qty, ...)` → 下单(走结算)。
  - `book(offeringId, slot)` → 预约。
  - `message(text)` → 转交创作/其 Agent。
  - `subscribe(offeringId, period)` / `donate(amount)` → 订阅 / 打赏。
- 工具参数 schema 从 offering 字段派生;创作者不手写。
- Tier_C 可 opt-in 追加 `customTools`(经审核 + 沙箱,deny-by-default 能力子集)。

### 调用链与预设额度授权

```
Agent ─invoke(tool,args)→ Agent 网关
   1. 鉴权:确认 Agent 代表哪个用户、是否被授权该 Creation/动词
   2. 额度:对消费类动词(order/book/subscribe/donate)核销用户【预设额度 preset budget】
        - 额度内:免逐次确认,放行
        - 超额/越权:拒绝(CAP_DENIED / QUOTA_EXCEEDED),要求用户重新授权
   3. 执行:转调 体验运行时 / Economy_Bridge(权威金额) / 留言通道
   4. 审计:写 agent_invocations(谁/代谁/创作/动词/金额/结果)
   5. 回流:成交计入 metrics、可生成世界动态
```

- **同源保证(需求 13.7)**:Agent 与人端调用同一 offering/ECS 与同一 Economy_Bridge,无机器旁路。
- **预设额度模型(需求 13.4)**:用户为"Agent 代付"设单笔/周期上限与可选创作白名单;额度内自动、超出阻断。撤销/调整额度的 UX 为开放细节。

### 与外部 MCP / 连接器的关系

- 站内 Creation 的能力清单以 MCP 风格暴露,外部 Agent 亦可调用(平台中介鉴权/结算)。
- 既有 Aeon「派 agent 办真事」连接器与外部 MCP 工具,作为 Agent 侧"可用工具"的另一来源,与 Creation 工具在同一调用框架下统一(统一边界为开放项)。



## Migration Strategy

### 深合并分阶段迁移(可回滚)

```
阶段 0  新建 creations 注册表 + 派生表(creation_offerings / previews / manifests / agent_invocations)
        —— 不影响现网,旧 aeon / world_plots 仍为各自真相源

阶段 1  双写过渡:对新创建/编辑的对象,同时写旧表与 creations
        —— 读仍走旧路径;creations 作为影子表校验一致性

阶段 2  回填:批量把存量 aeon_plot → Creation(geo 维度)、world_plots/ecs → Creation(内容维度)
        —— 幂等回填脚本;两侧 id 建立映射表 creation_legacy_map

阶段 3  读切换(灰度):Discovery / enter / invoke 改读 creations,按 cohort 灰度放量
        —— 出问题可一键切回旧读路径(回滚点)

阶段 4  收口:旧写路径下线,creations 成为唯一真相源;旧表保留只读一段时间后归档
```

- **一致性校验**:阶段 1–2 期间用对账任务比对影子表与旧表(关键字段 + offering/价格),不一致告警。
- **货币/抽成统一**:AXP(Aeon)与 AXP/USD(v6)收敛为统一 Economy_Bridge 抽成模型(首/二级销售沿用 v6 费率常量),迁移期保持金额服务端权威,避免双算。
- **停机评估**:回填可后台分批,无需停机;读切换为灰度,无停机窗口需求。

### 退役战斗的清理顺序

1. 前端:从导航与首屏移除战斗/副本/决策对战/UGC 入口与屏幕;旧路由留薄重定向。
2. 后端:删除 `world-engine` 战斗/副本/决策对战/UGC 规则的 controller/service/entity;**保留**扫描会话 + 资产生成。
3. 数据:战斗相关表与迁移评估后清理(对历史资产无引用方可删);E2E 删除对应 `.maestro` 战斗用例。
4. 兼容:旧战斗深链/分享码 → 降级提示或重定向,不报硬错误。

## Error Handling

复用并扩展 v6 结构化错误码(`shared/types/world-creation.ts` 的 `WorldCreationErrorCode`):

| 错误码 | 触发 | 处理 |
|---|---|---|
| `TIER_VIOLATION` | 创作超出声明 Tier | 拒绝并指明越界项 |
| `CAP_DENIED` | Agent 调用未授权能力/创作 | 拒绝,提示需用户授权 |
| `QUOTA_EXCEEDED` | 超预设额度 / 月度成本上限 | 阻断,要求重新授权/升级 |
| `ECONOMY_REJECTED` | 结算被拒 | **余额不变**,返回原因 |
| `MODERATION_REJECTED` | 审核未过 | 不入流/地图,内容保留 |
| `LOAD_TIMEOUT` | 进入体验超时(如 10s) | 回退来源(地图/流),给原因 |
| `ASSET_NOT_OWNED` | 引用非自有资产 | 拒绝 |
| `PLOT_TAKEN` | 选址/圈地并发争抢 | 乐观锁失败,提示重选 |

- **Agent 调用失败语义**:消费类动词失败保证幂等且余额不变;`message`/`query` 失败不产生副作用。
- **迁移期降级**:读切换灰度出错 → 单 cohort 回退旧读路径,不影响整体。

## Correctness Properties

### Property 1: 人机同源
对同一 Creation 的同一 offering,人端 `enter→购买` 与 Agent `invoke(order)` SHALL 经过同一权威逻辑与同一 Economy_Bridge,产生一致的扣款与库存结果;不存在机器旁路。

**Validates: Requirements 13.6, 13.7**

### Property 2: Agent 代付不超额
对任一用户,其 Agent 在任意时间窗内经 `order/book/subscribe/donate` 产生的累计消费 SHALL NOT 超过该用户设定的预设额度;超出的调用被拒绝且不扣款。

**Validates: Requirements 13.3, 13.4**

### Property 3: 价格服务端权威
任何成交金额 SHALL 由 Economy_Bridge 服务端计算;ECS/offering 中的展示价仅为提示,篡改展示价不影响实际扣款。

**Validates: Requirements 7.1**

### Property 4: 审核前置
状态非 `published/listed` 的 Creation SHALL NOT 出现在任何发现面(地图/创作流/Agent 检索);被 `suspended` 的立即移出。

**Validates: Requirements 3.1, 3.4**

### Property 5: 能力清单与内容一致
Creation 的 `CapabilityManifest` SHALL 始终对应其当前 `ecsVersionId + offerings`;内容/offering 变更后,旧清单 SHALL 失效或重派生(manifestVersion 单调递增)。

**Validates: Requirements 1.5, 1.11**

### Property 6: 迁移一致性
双写/回填期间,creations 中对象的关键字段(owner/geo/tier/offerings/价格)SHALL 与其 legacy 源最终一致;不一致须被对账任务检出。

**Validates: Requirements 12.2, 12.5**

### Property 7: 删战斗不伤扫描
退役战斗子系统后,扫描→资产生成管线 SHALL 仍可用,且既有非战斗资产引用不被破坏。

**Validates: Requirements 11.2**

## Testing Strategy

- **单元**:offering/清单派生逻辑(ECS→tools)、预设额度核销、Tier 校验、坐标换算。
- **集成**:发布→审核→入流/地图 全链;`invoke` 全链(鉴权→额度→结算→审计→回流);人端与 Agent 端同源结算对比(验证 Property 1/3)。
- **契约**:每类 CreationType 的 MCP 工具 schema 与标准动词语义契约测试。
- **迁移**:双写一致性对账、回填幂等、灰度读切换 + 回滚演练(验证 Property 6)。
- **E2E(Maestro)**:创作流上下滑 + 进入/下单/看直播;地图点建筑进入;新增用例,删除战斗用例。
- **性能**:创作流滑动帧率与预加载、进入体验超时(LOAD_TIMEOUT)回退、地图视口加载。
- **安全**:能力白名单 deny-by-default、Tier_C 沙箱、Agent 越权/超额拒绝(验证 Property 2/4)。

