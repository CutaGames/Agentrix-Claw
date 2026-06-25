/**
 * 世界创作与浏览(World Creation & Feed)— 统一 REST 契约草案(`/v1/creations/*`)
 * 与 MCP 工具描述符契约(跨端单一来源)。
 *
 * spec: .kiro/specs/world-creation-feed/{requirements,design}.md
 *   - design §Components and Interfaces — REST 接口(统一前缀 `/v1/creations`)
 *   - design §MCP 接口(机器面) / §Agent Invocation (Machine Surface)
 *
 * 本文件定义 `/v1/creations/*` 各端点的请求/响应 DTO,以及 Agent 机器面所用的
 * MCP 工具描述符契约。供 NestJS 后端(校验/控制器签名)与移动端/Web(类型安全)
 * 共用 —— 遵循 AGENTS.md:被 ≥2 个 app 使用的类型放在 `shared/types/`。
 *
 * 复用既有共享类型,不重复定义:
 *  - 核心对象/枚举复用 `./creation`(task 0.1:Creation / Offering / CapabilityManifest /
 *    McpToolDescriptor / CreationDiscoveryItem / CreationType / CreationVerb / ...)。
 *  - ECS / Tier / 错误码复用 `./world-creation`。
 *  - 连续谱编辑/派发/只读资产句柄复用 `./world-creation-api`(v6)。
 *  - 货币复用 `./world-engine-api`;信任等级复用 `./agentrix-presence`;POI 复用 `./aeon-world`。
 *
 * 所有属性命名使用 camelCase;线上 JSON 载荷亦为 camelCase(遵循全局 SnakeNamingStrategy)。
 */

import type {
  Creation,
  CreationDiscoveryItem,
  CreationGeo,
  CreationPreview,
  CreationType,
  CreationVerb,
  CapabilityManifest,
  McpToolDescriptor,
  Offering,
} from './creation';

import type {
  EcsWorld,
  EcsDiff,
  JsonPatchOp,
  SandboxIsolationLevel,
  SubstrateTier,
  WorldCreationError,
} from './world-creation';

import type {
  ContinuumEditRequest,
  ContinuumEditResponse,
  CreationDispatchDecision,
  CreationMode,
  CreationSurface,
  CreationTaskDto,
  ReadonlyAssetHandle,
} from './world-creation-api';

import type { MarketplaceCurrency } from './world-engine-api';
import type { TrustLevel } from './agentrix-presence';
import type { AeonPlotPoi } from './aeon-world';

// 便捷再导出:让前后端可从单一契约模块同时拿到核心对象与端点 DTO。
export type {
  Creation,
  CreationDiscoveryItem,
  CreationGeo,
  CreationPreview,
  CreationType,
  CreationVerb,
  CapabilityManifest,
  McpToolDescriptor,
  Offering,
} from './creation';

// ============================================================
// §0 通用信封 / 分页
// ============================================================

/**
 * 统一可失败响应信封 —— 各写操作端点在被拒绝时返回结构化错误(复用 v6
 * `WorldCreationError`:TIER_VIOLATION / CAP_DENIED / QUOTA_EXCEEDED /
 * ECONOMY_REJECTED / MODERATION_REJECTED / LOAD_TIMEOUT / PLOT_TAKEN ...)。
 */
export interface CreationApiError {
  /** 结构化错误(机器可读 code + 人类可读 detail)。 */
  error: WorldCreationError;
}

/** 游标分页响应基类(创作流 feed / Agent 检索复用)。 */
export interface CursorPage<TItem> {
  /** 当前页条目。 */
  items: TItem[];
  /** 下一页游标;为 null 表示无更多。 */
  nextCursor: string | null;
}

// ============================================================
// §1 POST /v1/creations — 新建创作(可仅 geo / 仅内容 / 两者)
// design: REST 表 — `POST /v1/creations`(aeon claim + v6 plot)
// 需求 1.1 / 1.6 / 1.7
// ============================================================

/**
 * POST /v1/creations — 新建创作请求。
 * 三种形态:仅地理(geo,占地不必有内容)、仅内容(纯线上,无 geo)、两者皆有。
 */
export interface CreateCreationRequest {
  /** 创作类型。 */
  type: CreationType;
  /** 标题。 */
  title: string;
  /** 摘要(可空)。 */
  summary?: string;
  /** 声明的基底层级(默认 'A')。 */
  substrateTier?: SubstrateTier;
  /** 可选地理锚点(经纬度);省略则为纯内容创作(仅进创作流,需求 1.7)。 */
  geo?: { lat: number; lng: number };
  /** 发起端(驱动 Tier_C 强制派发路由,需求 2.6)。 */
  surface?: CreationSurface;
  /**
   * 可选首段提示词:提供则在新建后立即触发一次提示词生成(promptDrive),
   * 等价于 create + generate 合并的低门槛"单一动作"入口(需求 2.1/2.9)。
   */
  prompt?: string;
}

/** POST /v1/creations — 响应。 */
export interface CreateCreationResponse {
  /** 新建的 Creation(status=draft)。 */
  creation: Creation;
  /** 当 `prompt` 提供并即时生成时,返回生成的版本 id。 */
  ecsVersionId?: string;
  /**
   * 当 inline prompt 触发的生成为 Mobile Tier_C 时的强制派发决策(需求 2.6);
   * 出现时生成未在本地执行,而是经 Creation_Task_Queue 派发离线。
   */
  dispatch?: CreationDispatchDecision;
  /** 派发离线时入队的 Creation_Task 状态快照(需求 2.6)。 */
  task?: CreationTaskDto;
  /** 被拒绝时的结构化错误(geo 抢占 PLOT_TAKEN / Tier 越界等)。 */
  error?: WorldCreationError;
}

// ============================================================
// §2 POST /v1/creations/:id/generate — 提示词生成 ECS(复用 v6 generate)
// 需求 2.1 / 2.7 / 2.8
// ============================================================

/** POST /v1/creations/:id/generate — 请求。 */
export interface GenerateCreationRequest {
  /** 自然语言提示词。 */
  prompt: string;
  /** 生成须遵守的基底层级(默认沿用 Creation 声明的 tier)。 */
  substrateTier?: SubstrateTier;
  /** 发起端;Tier_C 自移动端发起时强制派发(需求 2.6)。 */
  surface?: CreationSurface;
}

/** POST /v1/creations/:id/generate — 响应。 */
export interface GenerateCreationResponse {
  /** 生成产物版本 id(被强制派发离线时为空,见 `dispatch`)。 */
  ecsVersionId?: string;
  /** 生成的 ECS_World 草稿(被强制派发离线时为空)。 */
  ecsWorld?: EcsWorld;
  /** 月度成本软阈值提醒(达硬上限改为 QUOTA_EXCEEDED 错误,需求 2.7)。 */
  quotaWarning?: { usedUsd: number; capUsd: number; message: string };
  /**
   * Mobile 发起的 Tier_C 生成被强制派发离线时的路由决策(需求 2.6)。
   * 出现时生成不在本地执行,而是经 Creation_Task_Queue 派发到桌面端/Agent_Builder。
   */
  dispatch?: CreationDispatchDecision;
  /**
   * 派发离线时入队的 Creation_Task 状态快照(需求 2.6:向用户反馈任务状态)。
   * 仅在 `dispatch.mustDispatch` 为真时出现。
   */
  task?: CreationTaskDto;
  /** 被拒绝时的结构化错误(TIER_VIOLATION / QUOTA_EXCEEDED)。 */
  error?: WorldCreationError;
}

// ============================================================
// §3 POST /v1/creations/:id/continue — 连续谱编辑(prompt/coEdit/handBuild)
// 直接复用 v6 ContinuumEditRequest/Response(同一 ECS_World,版本/回滚)
// 需求 2.2 / 2.3 / 2.4 / 2.6
// ============================================================

/** POST /v1/creations/:id/continue — 请求(复用 v6 连续谱编辑)。 */
export type ContinueCreationRequest = ContinuumEditRequest;

/**
 * POST /v1/creations/:id/continue — 响应(applied 本地编辑 / dispatched 派发离线)。
 *
 * 在 v6 `ContinuumEditResponse` 之上附加可选 `task`:当 Mobile Tier_C 被强制派发离线
 * (`outcome='dispatched'`)时,统一创作入口经 Creation_Task_Queue 实际入队任务,并把其
 * 状态快照透出供用户跟踪(需求 2.6)。本地编辑(`applied`)不带 `task`。
 */
export type ContinueCreationResponse = ContinuumEditResponse & {
  /** 派发离线时入队的 Creation_Task 状态快照(需求 2.6)。 */
  task?: CreationTaskDto;
};

// 透传再导出,便于前端从契约模块单点引入。
export type { ContinuumEditRequest, ContinuumEditResponse, CreationMode, CreationSurface } from './world-creation-api';

// ============================================================
// §4 POST /v1/creations/:id/publish — 审核→发布→shareCode + 派生 manifest
// design: REST 表(v6 publish + moderation);需求 3.1 / 3.2 / 3.6 / 1.11
// ============================================================

/** POST /v1/creations/:id/publish — 请求(预览物缺失时可请求自动生成占位)。 */
export interface PublishCreationRequest {
  /** 显式提供/覆盖预览物;省略且无既有预览物时由系统生成占位(需求 3.2)。 */
  preview?: CreationPreview;
}

/** POST /v1/creations/:id/publish — 响应。 */
export interface PublishCreationResponse {
  /** 是否过审并已发布。 */
  published: boolean;
  /** 发布成功后的可分享短码(需求 3.6)。 */
  shareCode?: string;
  /** 发布时派生的能力清单版本(单调递增,需求 1.11 / Property 5)。 */
  manifestVersion?: number;
  /** 审核拒绝时的结构化原因(MODERATION_REJECTED);内容保留不丢失(需求 3.3)。 */
  error?: WorldCreationError;
}

// ============================================================
// §5 GET /v1/creations/discover — 统一发现(map / feed / agentSearch 三形态)
// design: §Discovery Surfaces — 三面共用一个查询层,读同一注册表
// 需求 1.2 / 1.8 / 4.1 / 5.1 / 13.1
// ============================================================

/** 发现查询形态判别符。 */
export type DiscoverMode = 'map' | 'feed' | 'agentSearch';

/** 创作流排序/推荐口径(需求 5.6 / 5.9)。 */
export type FeedSort = 'newest' | 'hot' | 'following' | 'nearby';

/** ① 地图模式查询(人·意图):视口 bbox 或 中心点+半径(需求 4.1)。 */
export interface DiscoverMapQuery {
  mode: 'map';
  /** 视口包围盒(与 center/radius 二选一)。 */
  viewport?: { minLat: number; minLng: number; maxLat: number; maxLng: number };
  /** 中心点 + 半径(米)。 */
  center?: { lat: number; lng: number };
  /** 半径(米);配合 center 使用。 */
  radiusMeters?: number;
  /** 可选类型过滤。 */
  type?: CreationType;
}

/** ② 创作流模式查询(人·娱乐,类抖音):游标 + 排序(需求 5.1/5.6)。 */
export interface DiscoverFeedQuery {
  mode: 'feed';
  /** 分页游标;首屏省略。 */
  cursor?: string;
  /** 每页条数(默认 10)。 */
  limit?: number;
  /** 排序/推荐口径。 */
  sort?: FeedSort;
  /** `nearby` 排序时的定位中心(可空)。 */
  near?: { lat: number; lng: number };
  /**
   * 浏览者账户 id(可空)。`following` 口径据此解析其关注的创作者图谱并筛选创作
   * (需求 5.6/8.3)。social 关注关系在阶段 8 落地;缺省或关注图不可用时,
   * `following` 优雅降级为 `newest`(需求 5.9 保证新用户始终有内容可刷)。
   */
  viewerAccountId?: string;
}

/** ③ Agent 能力检索查询(机器):语义 + 能力/类目/价格/地理/信任过滤(需求 13.1)。 */
export interface DiscoverAgentSearchQuery {
  mode: 'agentSearch';
  /** 需求语义文本(自然语言)。 */
  query?: string;
  /** 按支持的标准动词过滤(如只要可 `order` 的)。 */
  verbs?: CreationVerb[];
  /** 类目/类型过滤。 */
  type?: CreationType;
  /** 价格上限(AXP)。 */
  maxPriceAxp?: number;
  /** 价格上限(USD)。 */
  maxPriceUsd?: number;
  /** 地理范围(中心+半径,米)。 */
  near?: { lat: number; lng: number; radiusMeters?: number };
  /** 最低信任级要求。 */
  minTrustLevel?: TrustLevel;
  /** 分页游标。 */
  cursor?: string;
  /** 每页条数(默认 20)。 */
  limit?: number;
}

/** GET /v1/creations/discover — 统一查询(判别联合,三形态)。 */
export type DiscoverCreationsQuery =
  | DiscoverMapQuery
  | DiscoverFeedQuery
  | DiscoverAgentSearchQuery;

/** ① 地图模式响应:带 geo 的 Creation 标记(需求 4.1/4.3)。 */
export interface DiscoverMapResponse {
  mode: 'map';
  /** 视口/附近的 Creation 标记(已含类型/预览/can-enter,需求 1.8)。 */
  markers: CreationDiscoveryItem[];
}

/** ② 创作流模式响应:游标分页的 Creation 投影。 */
export interface DiscoverFeedResponse extends CursorPage<CreationDiscoveryItem> {
  mode: 'feed';
  /** 实际生效的排序口径。 */
  sort: FeedSort;
}

/**
 * Agent 检索结果项 —— 在发现投影基础上附带能力清单(需求 13.1:返回 Creation
 * 及其 offerings 的能力清单),返回即可直接 `invoke`。
 */
export interface CreationAgentSearchItem extends CreationDiscoveryItem {
  /** 机器可读能力清单(MCP 工具集合)。 */
  manifest: CapabilityManifest;
  /** 语义匹配度(0..1,可空)。 */
  relevance?: number;
}

/** ③ Agent 能力检索响应。 */
export interface DiscoverAgentSearchResponse extends CursorPage<CreationAgentSearchItem> {
  mode: 'agentSearch';
}

/** GET /v1/creations/discover — 统一响应(与 query.mode 对应)。 */
export type DiscoverCreationsResponse =
  | DiscoverMapResponse
  | DiscoverFeedResponse
  | DiscoverAgentSearchResponse;

// ============================================================
// §6 POST /v1/creations/:id/enter — 进入体验(人端)
// design: REST 表(v6 enter + aeon enter);需求 6.1–6.7
// ============================================================

/** POST /v1/creations/:id/enter — 请求。 */
export interface EnterCreationRequest {
  /** 携带入场的只读资产 id(只读句柄,无所有权证明,需求 6.7)。 */
  bringAssetIds?: string[];
}

/** POST /v1/creations/:id/enter — 响应。 */
export interface EnterCreationResponse {
  /** 实例化的体验会话 id。 */
  sessionId: string;
  /** 待渲染的 ECS_World。 */
  ecsWorld: EcsWorld;
  /** 沙箱隔离级(由 substrateTier 决定)。 */
  isolationLevel: SandboxIsolationLevel;
  /** 注入的只读资产句柄(复用 v6 ReadonlyAssetHandle)。 */
  readonlyAssetHandles: ReadonlyAssetHandle[];
  /** 该创作的供给项(shop 下单用;由 Creation.offerings 投影,空数组表示无可售)。 */
  offerings?: Offering[];
  /** 进入超时(如 10s)等失败原因(LOAD_TIMEOUT),客户端据此回退来源(需求 6.5)。 */
  error?: WorldCreationError;
}

// ============================================================
// §7 GET /v1/creations/:id/manifest — 机器可读能力清单(MCP 工具)
// design: REST 表(新增);需求 1.11 / 13.3
// ============================================================

/** GET /v1/creations/:id/manifest — 响应(只读视图,对应当前 ecsVersionId+offerings)。 */
export interface GetCreationManifestResponse {
  /** 能力清单(MCP 工具集合 + Tier_C customTools)。 */
  manifest: CapabilityManifest;
}

// ============================================================
// §8 POST /v1/creations/:id/invoke — 标准动词调用入口(Agent,经网关)
// design: §Agent Invocation;需求 13.2 / 13.4 / 13.5 / 13.7
// ============================================================

/**
 * POST /v1/creations/:id/invoke — Agent 标准动词调用请求。
 * 经网关:鉴权(代谁)→ 预设额度核销 → Economy_Bridge 权威结算 → 审计。
 */
export interface InvokeCreationRequest {
  /** 要调用的标准动词。 */
  verb: CreationVerb;
  /** 目标工具名(对应 manifest 中的 McpToolDescriptor.name)。 */
  toolName: string;
  /** 目标 offering id(消费类动词必填;message/query 可空)。 */
  offeringId?: string;
  /** 工具参数(其 schema 由 manifest 的 inputSchema 约束,需求 1.11/13.3)。 */
  args: Record<string, unknown>;
  /** Agent 代表的用户账户 id(鉴权/额度核销主体,需求 13.4/13.5)。 */
  onBehalfOfAccountId: string;
  /** 高风险/真实货币时所需的签名确认(达 Trust Level 门槛,需求 7.3)。 */
  signedConfirmation?: string;
}

/** Agent 调用结果状态。 */
export type InvokeOutcome = 'ok' | 'rejected';

/** POST /v1/creations/:id/invoke — 响应。 */
export interface InvokeCreationResponse {
  /** 调用结果状态。 */
  outcome: InvokeOutcome;
  /** 调用动词。 */
  verb: CreationVerb;
  /** 审计记录 id(写入 agent_invocations,需求 13.5)。 */
  invocationId: string;
  /** 消费类动词成交后的权威金额(由 Economy_Bridge 计算,需求 7.1)。 */
  authoritativeAmount?: number;
  /** 平台抽成(成交时)。 */
  platformCut?: number;
  /** 工具返回的业务数据(query 信息 / order 凭证 / book 预约号等)。 */
  result?: Record<string, unknown>;
  /**
   * 被拒原因(rejected 时):CAP_DENIED(越权)/ QUOTA_EXCEEDED(超预设额度)/
   * ECONOMY_REJECTED(结算被拒,余额不变,需求 13.4)。
   */
  error?: WorldCreationError;
}

// ============================================================
// §9 社交:POST /:id/comment · like · share · follow
// design: REST 表(aeon messages + 新增);需求 8.1–8.4
// ============================================================

/** POST /v1/creations/:id/comment — 请求。 */
export interface CommentCreationRequest {
  /** 留言文本。 */
  text: string;
  /** 可选父留言 id(楼中楼)。 */
  parentCommentId?: string;
}

/** 留言 DTO。 */
export interface CreationComment {
  id: string;
  creationId: string;
  authorAccountId: string;
  authorName?: string;
  text: string;
  parentCommentId?: string;
  createdAt: number;
}

/** POST /v1/creations/:id/comment — 响应。 */
export interface CommentCreationResponse {
  comment: CreationComment;
  /** 更新后的留言计数。 */
  commentCount: number;
}

/** POST /v1/creations/:id/like — 请求(幂等点赞/取消,需求 8.2)。 */
export interface LikeCreationRequest {
  /** true=点赞,false=取消点赞。 */
  liked: boolean;
}

/** POST /v1/creations/:id/like — 响应。 */
export interface LikeCreationResponse {
  /** 当前是否已点赞。 */
  liked: boolean;
  /** 更新后的点赞计数。 */
  likeCount: number;
}

/** POST /v1/creations/:id/follow — 请求(关注/取关创作者,需求 8.3)。 */
export interface FollowCreatorRequest {
  /** true=关注,false=取关。 */
  following: boolean;
}

/** POST /v1/creations/:id/follow — 响应。 */
export interface FollowCreatorResponse {
  /** 被关注的创作者账户 id。 */
  creatorAccountId: string;
  /** 当前是否已关注。 */
  following: boolean;
}

/** POST /v1/creations/:id/share — 响应:深链 + Web 预览兜底(需求 8.4)。 */
export interface ShareCreationResponse {
  /** 可分享短码。 */
  shareCode: string;
  /** App 深链。 */
  deepLink: string;
  /** 未安装 App 的访客 Web 预览页。 */
  webPreviewUrl: string;
  /** Web 预览页上的下载引导链接。 */
  appDownloadLink: string;
}

// ============================================================
// §9b 举报 / 下架 / 审核审计:POST /:id/report · takedown · unpublish · GET /:id/moderation
// design: REST 表(aeon messages + 新增);需求 3.3 / 3.4 / 3.5
// ============================================================

/** 审核决策审计阶段(对齐后端 CreationModerationStage)。 */
export type CreationModerationStage = 'report' | 'takedown' | 'unpublish';

/** 审核决策结果(需求 3.5「结论」)。 */
export type CreationModerationDecision =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'unpublished';

/**
 * POST /v1/creations/:id/report — 任意用户对已发布 Creation 提交举报(需求 3.4)。
 * 受理后写入审计(decision=pending),按审核 SLA 处理。
 */
export interface ReportCreationRequest {
  /** 举报者账户 id。 */
  reporterId: string;
  /** 举报原因(结构化拒绝/违规理由载体,需求 3.3)。 */
  reason: string;
}

/** POST /v1/creations/:id/report — 响应。 */
export interface ReportCreationResponse {
  /** 受理生成的举报审计记录 id(供 SLA 跟踪)。 */
  reportId: string;
  /** 受理阶段(恒为 'report')。 */
  stage: 'report';
  /** 被拒原因(如对未发布 Creation 举报)。 */
  error?: WorldCreationError;
}

/**
 * POST /v1/creations/:id/takedown — 确认违规下架:status→suspended,即时移出发现面
 * (需求 3.4)。
 */
export interface TakedownCreationRequest {
  /** 下架原因(写入审计,需求 3.5)。 */
  reason: string;
  /** 裁决者 id(审核员;自动决策可空)。 */
  reviewerId?: string;
}

/** POST /v1/creations/:id/takedown — 响应。 */
export interface TakedownCreationResponse {
  /** 是否已下架(幂等:已 suspended 亦返回 true)。 */
  taken: boolean;
  /** 下架后的状态(suspended)。 */
  status: CreationStatus;
}

/**
 * POST /v1/creations/:id/unpublish — 创作者主动下架:published/listed→unpublished
 * (可逆,内容保留;需求 3.4)。
 */
export interface UnpublishCreationRequest {
  /** 下架原因(可空,写入审计)。 */
  reason?: string;
  /** 发起下架的创作者账户 id(写入审计 reviewerId)。 */
  actorId?: string;
}

/** POST /v1/creations/:id/unpublish — 响应。 */
export interface UnpublishCreationResponse {
  /** 是否已下架。 */
  unpublished: boolean;
  /** 下架后的状态(unpublished)。 */
  status: CreationStatus;
  /** 非法状态流转(如对 draft/suspended 下架)时的结构化错误。 */
  error?: WorldCreationError;
}

/** 审核决策审计记录(需求 3.5:谁 / 何时 / 结论 / 原因)。 */
export interface CreationModerationDecisionEntry {
  /** 审计记录 id。 */
  id: string;
  /** 被审核的 Creation id。 */
  creationId: string;
  /** 审核阶段。 */
  stage: CreationModerationStage;
  /** 决策结果(结论)。 */
  decision: CreationModerationDecision;
  /** 决策理由(原因)。 */
  reason: string | null;
  /** 举报者 id(谁举报;stage=report 时填)。 */
  reporterId: string | null;
  /** 裁决者 id(谁裁决;stage=takedown/unpublish 时填)。 */
  reviewerId: string | null;
  /** 决策时间(何时,epoch millis)。 */
  ts: number;
}

/** GET /v1/creations/:id/moderation — 读取某 Creation 的审核决策审计日志(需求 3.5)。 */
export interface GetCreationModerationDecisionsResponse {
  /** 按时间升序的审计记录。 */
  decisions: CreationModerationDecisionEntry[];
}

// ============================================================
// §10 现实关联:POST /:id/poi · checkin
// design: REST 表(aeon poi/checkin);需求 9.1 / 9.2
// ============================================================

/** POST /v1/creations/:id/poi — 请求:绑定真实商家 POI(需求 9.1)。 */
export interface BindCreationPoiRequest {
  /** 真实商家 POI 信息(复用 aeon-world AeonPlotPoi)。 */
  poi: AeonPlotPoi;
}

/** POST /v1/creations/:id/poi — 响应。 */
export interface BindCreationPoiResponse {
  /** 绑定后的 Creation。 */
  creation: Creation;
  /** 被拒原因(如非认证商家)。 */
  error?: WorldCreationError;
}

/** POST /v1/creations/:id/checkin — 请求:到访签到(需求 9.2)。 */
export interface CheckinCreationRequest {
  /** 用户当前定位(用于判定半径)。 */
  location: { lat: number; lng: number };
}

/** POST /v1/creations/:id/checkin — 响应。 */
export interface CheckinCreationResponse {
  /** 是否签到成功(在判定半径内)。 */
  checkedIn: boolean;
  /** 发放的 AXP 奖励(含连续签到加成)。 */
  awardedAxp?: number;
  /** 当前连续签到天数。 */
  streakDays?: number;
  /** 失败原因(如不在判定半径内/重复签到/反作弊拒绝)。 */
  error?: WorldCreationError;
}

// ============================================================
// §11 MCP 工具描述符契约(机器面)
// design: §MCP 接口 / §Agent Invocation — 每个已发布 Creation 自动暴露一组工具
// 需求 13.2 / 13.3 / 13.6
// ============================================================

/**
 * 线上 MCP 工具描述符 —— 在 `./creation` 的最小 `McpToolDescriptor` 基础上扩展
 * 网关执行所需的元数据。仍由 `(offering, verb)` 自动派生,创作者从不手写
 * schema(需求 1.11、2.9);Tier_C 可 opt-in customTools(需求 13.6)。
 */
export interface CreationMcpToolDescriptor extends McpToolDescriptor {
  /** 中文工具描述(本地化展示)。 */
  zhDescription?: string;
  /** 输出 schema(JSON Schema 风格,可空)。 */
  outputSchema?: Record<string, unknown>;
  /** 调用所需的最低信任级(消费/高风险动词更高,需求 7.3)。 */
  requiredTrustLevel?: TrustLevel;
  /** 该工具是否走预设额度核销(消费类动词为 true,需求 13.4)。 */
  budgetGated?: boolean;
  /** 成交计价币种(消费类动词,展示用;权威金额仍由 Economy_Bridge 计算)。 */
  currency?: MarketplaceCurrency;
  /** 是否为 Tier_C opt-in 的自定义工具(经审核 + 沙箱,需求 13.6)。 */
  isCustomTool?: boolean;
}

/**
 * Creation 的对外能力清单(线上完整形态)—— 网关从 CapabilityManifest 投影,
 * 使用扩展后的工具描述符,供平台内/外部 Agent 检索与调用。
 */
export interface CreationCapabilityManifestDto {
  /** 所属 Creation id。 */
  creationId: string;
  /** 清单版本(对应 Creation.manifestVersion,单调递增)。 */
  version: number;
  /** 标准工具(每个 offering×verb 一个)。 */
  tools: CreationMcpToolDescriptor[];
  /** Tier_C opt-in 自定义工具(可空)。 */
  customTools?: CreationMcpToolDescriptor[];
  /** 派生溯源:对应的 ECS 版本(用于一致性校验,Property 5)。 */
  ecsVersionId: string | null;
}
