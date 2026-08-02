/**
 * 世界创作与浏览(World Creation & Feed)— 统一 Creation 契约(跨端单一来源)。
 *
 * spec: .kiro/specs/world-creation-feed/{requirements,design}.md(§Data Models)
 *
 * 本文件定义把 A(Aeon 真实地理)与 B(v6 ECS 内容创作)深合并后的单一原子单位
 * —— **Creation(创作)**。Creation 是一个"双接口单元":对人是可体验的应用/场所,
 * 对 Agent 是可被检索/调用/交易的服务/能力。两个接口是同一份内容(ECS_World +
 * offerings)的两个投影(需求 1.9)。
 *
 * 复用既有共享类型,不重复定义:
 *  - 内容维度(ECS/Tier/能力白名单)复用 `./world-creation`(SubstrateTier 等)。
 *  - 地理维度(经纬度/网格/商家 POI/坐标换算)复用 `./aeon-world`(AeonPlotPoi 等)。
 *
 * 所有属性命名使用 camelCase,遵循全局 TypeORM SnakeNamingStrategy(列名自动 snake_case)。
 */

import type { SubstrateTier } from './world-creation';
import type { AeonPlotPoi } from './aeon-world';

// ============================================================
// §1 Creation 枚举(类型 / 状态 / 作者)
// design: §Data Models — Creation(主对象)
// ============================================================

/**
 * 创作类型(开放式,决定卡片渲染与流内主行动)。
 *  - game:      可玩游戏(▶️玩)
 *  - drama:     互动剧/分支短剧(🎭 看·选)
 *  - shop:      店铺/超市,可流内或宿主内下单(🛒买)
 *  - livestream:直播(🔴看)
 *  - stage:     现场活动/演出舞台(🎤现场)
 *  - place:     通用场所(学校/医院/咖啡馆/博物馆等,🚪逛)
 */
export type CreationType = 'game' | 'shop' | 'livestream' | 'stage' | 'place' | 'drama';

/**
 * Creation 生命周期状态(需求 1.4)。
 * 深合并:统一 v6 `PlotStatus` 与 Aeon 地块状态,并新增 `under_review`。
 *  - draft:        草稿(未提交审核)
 *  - under_review: 审核中(已提交,等待过审)
 *  - published:    已发布(可进入发现面)
 *  - listed:       已上架交易(在发现面 + 可交易)
 *  - unpublished:  已下架(创作者主动)
 *  - suspended:    已封禁(违规,立即移出发现面)
 */
export type CreationStatus =
  | 'draft'
  | 'under_review'
  | 'published'
  | 'listed'
  | 'unpublished'
  | 'suspended';

/** 作者类型 —— 区分人创作与 Agent 自治建造的归属(需求 2.4)。 */
export type CreationAuthorType = 'user' | 'agent';

// ============================================================
// §2 预览物(Preview)
// glossary: 供创作流滑动时轻量展示的封面图/短视频/回放/首帧截图
// 需求 3.2:发布必须具备至少一个预览物
// ============================================================

/** 预览物类型(轻量,创作流滑动时渲染,不实例化完整体验)。 */
export type CreationPreviewKind = 'cover' | 'video' | 'replay' | 'first_frame';

/**
 * 预览物(Preview)—— 创作流卡片的轻量展示物(需求 5.2 预览 vs 进入分离)。
 * 发布时必须具备至少一个(需求 3.2),否则拒绝发布或自动生成占位。
 */
export interface CreationPreview {
  /** 预览物类型:封面图 / 短视频 / 回放 / 首帧截图。 */
  kind: CreationPreviewKind;
  /** 预览资源地址(图片/视频 URL 或资产句柄)。 */
  url: string;
  /** 可选缩略图(用于流内快速渲染/省流模式)。 */
  thumbnailUrl?: string;
  /** 像素宽度(用于布局,避免抖动)。 */
  width?: number;
  /** 像素高度。 */
  height?: number;
  /** 视频/回放时长(毫秒);静态封面可空。 */
  durationMs?: number;
}

// ============================================================
// §3 Offering(供给项)与标准动词
// design: §Data Models — Offering(供给项)与能力清单
// 需求 1.10 / 2.10:人端展示与机器端 MCP 工具都从 Offering 派生
// ============================================================

/** 供给项类型(产品 / 服务 / 票务 / 订阅 / 打赏)。 */
export type OfferingKind = 'product' | 'service' | 'ticket' | 'subscription' | 'tip';

/**
 * 履约类型(FulfillmentType)—— offering 声明"买到后如何真实交付"(world-shop-fulfillment R1)。
 *  - voucher: 数字凭证 / 兑换码(下单成功即从库存发放唯一 code)。
 *  - agent:   触发创作者 agent 履约(经 agent-gateway 派发办事任务)。
 *  - support: 支持创作者(不承诺实物/法币收益的合规回执,即时放款)。
 *  - manual:  创作者手动交付(通知创作者 → pending → 标记完成)。
 *
 * 集市并入接缝(登记约定,非本 spec 实现):技能/皮肤 → voucher(数字授予);
 * 任务 → agent;预测市场自有结算不接本引擎。详见
 * `docs/world-shop-fulfillment-marketplace-mapping.zh-CN.md`。
 */
export type FulfillmentType = 'voucher' | 'agent' | 'support' | 'manual';

/** voucher(数字凭证/兑换码)码来源:自动生成或使用预置码表。 */
export type VoucherCodeMode = 'auto' | 'list';

/**
 * 履约声明(Fulfillment)—— 随 offering 一并保存的交付方式声明。
 *
 * 质量门在 `SHOP_FULFILLMENT_ENFORCED` 开启时,要求每个"可下单"(有价 + 含消费动词)的
 * shop/place offering 具备一份**合法** fulfillment 声明,否则 commerce 维度不通过
 * (world-shop-fulfillment R1.1/1.2)。合法性判定:
 *  - voucher: `voucher.stock` 为非负整数;codeMode=list 时 `codes` 至少 1 条。
 *  - agent:   `agent.verb` 为 'message'。
 *  - support/manual: 仅声明 type 即可(support 文案不承诺实物/法币收益,合规红线)。
 */
export interface Fulfillment {
  /** 履约类型。 */
  type: FulfillmentType;
  /** voucher 型配置:库存 + 码来源。 */
  voucher?: {
    /** 可发放库存(非负整数;codeMode=list 时应与 codes 数量一致或不超过)。 */
    stock: number;
    /** 码来源:auto 自动生成唯一码;list 使用预置码表。 */
    codeMode: VoucherCodeMode;
    /** 预置码表(codeMode=list 时必填,至少 1 条)。 */
    codes?: string[];
  };
  /** agent 型配置:目标办事动词 + 简报。 */
  agent?: {
    /** 派发给创作者 agent 的动词(V1 收敛为 message)。 */
    verb: 'message';
    /** 履约简报(交给 agent 的办事说明,可空)。 */
    brief?: string;
  };
  /** support 型配置:合规文案(不得承诺实物/法币收益)。 */
  support?: {
    /** 支持创作者的说明文案(可空)。 */
    note?: string;
  };
}

/**
 * Agent 标准化调用动词(需求 13.2)—— V1 统一调用面。
 *  - query:     查询信息/库存/价格/可用时段(无副作用)
 *  - order:     下单购买(走权威结算)
 *  - book:      预约服务/活动/座位
 *  - message:   留言或请求创作/其 Agent 办事
 *  - subscribe: 订阅
 *  - donate:    打赏
 */
export type CreationVerb = 'query' | 'order' | 'book' | 'message' | 'subscribe' | 'donate';

/**
 * Offering(供给项)—— "创作提供的产品/服务/能力"的统一描述。
 * 人端展示与机器端 MCP 工具都从它派生(需求 1.10、2.10);一次标注,两端复用。
 */
export interface Offering {
  /** 供给项 id(在 Creation 内唯一)。 */
  id: string;
  /** 供给项类型。 */
  kind: OfferingKind;
  /** 名称(人端展示 + 工具描述)。 */
  name: string;
  /** 描述(可空)。 */
  description?: string;
  /**
   * 展示价(AXP/USD/稳定币,可空)。
   * NON-AUTHORITATIVE:权威成交金额始终由 Economy_Bridge 服务端计算(需求 7.1)。
   *
   * world-shop-stablecoin-settlement R1.1：新增 `stablecoin` 结算币种声明——按链上稳定币
   * (chainId, tokenSymbol) 定价，`amount` 为人类可读金额字符串（避免浮点精度丢失，结算时按
   * 该稳定币 tokenDecimals 精确换算为链上最小整数单位）。发布/更新时校验 (chainId, tokenSymbol)
   * 在 Stablecoin_Registry 中存在且 `enabled=true`，否则拒绝 `UNKNOWN_STABLECOIN`（R1.2）。
   */
  price?: {
    axp?: number;
    usd?: number;
    stablecoin?: { chainId: number; tokenSymbol: string; amount: string };
  };
  /** 该 offering 支持的标准动词集合。 */
  verbs: CreationVerb[];
  /** 可空:库存 / 时段 / 容量。 */
  availability?: {
    /** 库存件数。 */
    stock?: number;
    /** 可用时段(开始/结束 unix ms)。 */
    schedule?: { startsAt: number; endsAt?: number }[];
    /** 容量(如座位/同时在场上限)。 */
    capacity?: number;
  };
  /** 来源溯源:多数 offering 自 ECS 实体的 price/ui 组件派生(可空)。 */
  derivedFromEntityId?: string;
  /**
   * 履约声明(可选)——"买到后如何真实交付"(world-shop-fulfillment R1.1)。
   * 由创作器 UI 采集,随 offering 一并保存。可下单 offering 缺此声明时,
   * 质量门在 `SHOP_FULFILLMENT_ENFORCED` 开启时会拦截 commerce 维度(R1.2/1.3)。
   */
  fulfillment?: Fulfillment;
}

// ============================================================
// §4 能力清单(CapabilityManifest)与 MCP 工具描述符
// design: §Data Models / §Agent Invocation
// 需求 1.11、13.2、13.3:发布时从 ECS_World + offerings 自动派生 MCP 风格工具
// ============================================================

/**
 * MCP 风格工具描述符 —— 由 `(offering, verb)` 自动投影生成,创作者从不手写
 * schema(需求 1.11、2.9)。参数 schema 从 offering 字段派生。
 *
 * 注:统一 REST/MCP 契约的更完整定义见 task 0.2;此处为 CapabilityManifest
 * 自洽所需的最小描述符,作为跨端单一来源。
 */
export interface McpToolDescriptor {
  /** 工具名(标准化,如 "order" / "book" / "query")。 */
  name: string;
  /** 工具描述(人/Agent 可读)。 */
  description?: string;
  /** 该工具对应的标准动词。 */
  verb: CreationVerb;
  /** 派生来源 offering id(标准工具有值;Tier_C customTools 可空)。 */
  offeringId?: string;
  /** 参数 schema(JSON Schema 风格;从 offering 字段派生)。 */
  inputSchema: Record<string, unknown>;
  /** 是否消费类动词(order/book/subscribe/donate)—— 触发预设额度核销。 */
  consumes?: boolean;
}

/**
 * 机器可读能力清单 —— 从 Creation + offerings 自动派生的 MCP 工具集合(只读视图)。
 * SHALL 始终对应当前 `ecsVersionId + offerings`;变更后旧清单失效或重派生,
 * `version` 单调递增(Property 5,需求 1.5/1.11)。
 */
export interface CapabilityManifest {
  /** 所属 Creation id。 */
  creationId: string;
  /** 清单派生版本(单调递增,对应 Creation.manifestVersion)。 */
  version: number;
  /** 每个 offering×verb → 一个标准化工具。 */
  tools: McpToolDescriptor[];
  /** 仅 Tier_C opt-in 的自定义工具(经审核 + 沙箱,deny-by-default)。 */
  customTools?: McpToolDescriptor[];
}

// ============================================================
// §5 Creation(主对象)
// design: §Data Models — Creation(主对象)
// 需求 1.1 / 1.9 / 1.10 / 1.11
// ============================================================

/** Creation 的地理锚点(原 Aeon 维度,可空):仅内容创作可无地理(需求 1.6/1.7)。 */
export interface CreationGeo {
  /** 真实地理纬度(WGS-84 存库;渲染国内底图时转 GCJ-02,见 aeon-world 坐标换算)。 */
  lat: number;
  /** 真实地理经度。 */
  lng: number;
  /** 量化网格单元键(由 aeon-world `toGridCell(lat,lng)` 派生)。 */
  gridCell: string;
}

/** Creation 互动计数(需求 1.3)。 */
export interface CreationMetrics {
  /** 浏览数。 */
  views: number;
  /** 点赞数。 */
  likes: number;
  /** 成交数。 */
  sales: number;
  /** 留言数。 */
  comments: number;
}

/**
 * Creation(创作)—— 统一的可发布 / 可发现 / 可进入 / 可分享 / 可计数对象(需求 1.1)。
 * 单一真相源:地图、创作流、Agent 检索读同一对象。
 */
export interface Creation {
  /** 唯一 id。 */
  id: string;
  /** 当前所有者账户 id。 */
  ownerAccountId: string;
  /** 首创者账户 id(抽成区分,沿用 v6 originalCreator 语义)。 */
  originalCreatorAccountId: string;
  /** 创作类型。 */
  type: CreationType;
  /** 生命周期状态。 */
  status: CreationStatus;
  /** 标题。 */
  title: string;
  /** 摘要(可空)。 */
  summary?: string;

  // ── 内容维度(原 v6):指向当前 ECS_World 版本与基底层级 ──
  /** 声明的基底层级(复用 world-creation 的 SubstrateTier)。 */
  substrateTier: SubstrateTier;
  /** 当前 ECS_World 版本引用;纯地理创作初始可为 null(需求 1.5)。 */
  ecsVersionId: string | null;
  /** 绑定的 Agent_Builder id(离线自治建造,可空)。 */
  boundAgentId: string | null;

  // ── 地理维度(原 Aeon,均可空):仅内容创作可无地理(需求 1.6/1.7) ──
  /** 地理锚点(经纬度 + 网格);纯内容创作为 null。 */
  geo?: CreationGeo | null;
  /** 真实商家绑定 POI(复用 aeon-world AeonPlotPoi,可空)。 */
  poi?: AeonPlotPoi | null;

  // ── 双接口投影 ──
  /** 预览物(发布必备,需求 3.2)。 */
  preview: CreationPreview;
  /** 0..N 供给项 → 人端展示 + 机器清单(需求 1.10)。 */
  offerings: Offering[];
  /** 能力清单派生版本(随内容/offerings 变更单调递增,需求 1.11)。 */
  manifestVersion: number;

  // ── 发现 / 社交 ──
  /** 可分享短码;未发布为 null。 */
  shareCode: string | null;
  /** 互动计数(需求 1.3)。 */
  metrics: CreationMetrics;
  /** 创建时间(unix ms)。 */
  createdAt: number;
  /** 更新时间(unix ms)。 */
  updatedAt: number;
}

// ============================================================
// §6 发现接口投影(需求 1.2 / 1.8)
// ============================================================

/**
 * 发现接口返回的 Creation 投影 —— 卡片渲染无需二次请求(需求 1.8):
 * 同时返回类型、预览物、创作者摘要、互动计数与"可进入(can-enter)"判定。
 */
export interface CreationDiscoveryItem {
  /** Creation id。 */
  id: string;
  /** 创作类型(决定卡片渲染与主行动)。 */
  type: CreationType;
  /** 标题。 */
  title: string;
  /** 摘要(可空)。 */
  summary?: string;
  /** 预览物引用。 */
  preview: CreationPreview;
  /** 创作者摘要。 */
  creator: { accountId: string; name?: string; avatarUrl?: string };
  /** 互动计数。 */
  metrics: CreationMetrics;
  /** 地理锚点(地图模式用,可空)。 */
  geo?: CreationGeo | null;
  /** 是否绑定真实商家 POI(地图区分店铺/居民创作)。 */
  poi?: AeonPlotPoi | null;
  /** 可进入判定 —— 卡片是否展示"进入体验"行动。 */
  canEnter: boolean;
  /** 流内可用的主行动(由 type + offerings 派生)。 */
  offerings?: Offering[];
}
