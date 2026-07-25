/**
 * creationApi — 统一「创作(Creation)」移动端 API 薄封装(World Creation & Feed)。
 *
 * spec: .kiro/specs/world-creation-feed/{requirements,design}.md
 *   - task 0.2 契约:`shared/types/creation-api.ts`(`/v1/creations/*` 统一 REST DTO)。
 *   - task 0.1 对象:`shared/types/creation.ts`(Creation / Offering / ...)。
 *
 * 定位(task 0.3):本文件对齐 0.2 的统一契约对外暴露 Creation 形状的 API 面,
 * **初期是一层适配器(adapter)**——把既有 `worldCreationApi`(v6 ECS)与
 * `aeonApi`(永曜城真实地理)的行为原样包住,使现网行为不变;同时为后续切换到
 * 真正的 `/v1/creations/*` 后端端点(需求 12.4 灰度迁移)**留出唯一接缝**:
 * 模块级开关 `USE_UNIFIED_CREATION_BACKEND`。
 *
 *   - `USE_UNIFIED_CREATION_BACKEND = false`(默认):走适配层,委托既有服务,
 *     行为与今天完全一致;新增的机器面/社交面(无 legacy 对应)直接打统一端点。
 *   - 翻转为 `true`:所有方法直连 `/v1/creations/*`,完成切流(后端就绪后)。
 *
 * 约定:与既有服务一致——薄封装 `apiFetch`(自动带鉴权 + baseURL + JSON),
 * 全部 camelCase,复用 `shared/types/` 单一来源,不重复定义类型。
 *
 * @see shared/types/creation-api.ts
 * @see src/services/worldCreationApi.ts
 * @see src/services/aeon/aeonApi.ts
 */

import { apiFetch } from './api';
import * as worldCreationApi from './worldCreationApi';
import * as aeonApi from './aeon/aeonApi';

import type {
  // §1 create
  CreateCreationRequest,
  CreateCreationResponse,
  // §2 generate
  GenerateCreationRequest,
  GenerateCreationResponse,
  // §3 continue
  ContinueCreationRequest,
  ContinueCreationResponse,
  // §4 publish
  PublishCreationRequest,
  PublishCreationResponse,
  QualityCheckCreationResponse,
  // §5 discover
  DiscoverCreationsQuery,
  DiscoverCreationsResponse,
  DiscoverMapResponse,
  DiscoverFeedResponse,
  DiscoverAgentSearchResponse,
  FeedSort,
  // §6 enter
  EnterCreationRequest,
  EnterCreationResponse,
  // §7 manifest
  GetCreationManifestResponse,
  // §8 invoke
  InvokeCreationRequest,
  InvokeCreationResponse,
  // §9 social
  CommentCreationRequest,
  CommentCreationResponse,
  LikeCreationRequest,
  LikeCreationResponse,
  FollowCreatorRequest,
  FollowCreatorResponse,
  ShareCreationResponse,
  // §9b moderation
  ReportCreationRequest,
  ReportCreationResponse,
  // §10 reality
  BindCreationPoiRequest,
  BindCreationPoiResponse,
  CheckinCreationRequest,
  CheckinCreationResponse,
  // §12 履约视图(world-shop-fulfillment task 5)
  MyFulfillmentOrdersResponse,
  MyFulfillmentVouchersResponse,
  SellingFulfillmentOrdersResponse,
  RedeemVoucherResponse,
  FulfillmentOrderStatus,
} from '../../shared/types/creation-api';

import type {
  Creation,
  CreationDiscoveryItem,
  CreationMetrics,
} from '../../shared/types/creation';

import type {
  DiscoverPlotsResponse,
  EnterPlotResponse,
  GenerateEcsWorldResponse,
  MapPlotSummary,
  PublishPlotResponse,
} from '../../shared/types/world-creation-api';

import type { AeonPlotDto, AeonPlotMarker } from '../../shared/types/aeon-world';

/**
 * 唯一接缝:统一后端 `/v1/creations/*` 就绪后翻转为 `true`,即从「适配既有服务」
 * 一键切换为「直连统一端点」。默认 `false` —— 现网行为完全不变(需求 12.4)。
 */
export const USE_UNIFIED_CREATION_BACKEND = true;

const BASE = '/v1/creations';

/** 从对象构造 query string,跳过 undefined/null,避免 `?foo=undefined` 上线。 */
function toQuery(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/** 直连统一端点的透传(切流后所有方法走此路径)。 */
function unified<T>(path: string, init?: RequestInit): Promise<T> {
  return apiFetch<T>(`${BASE}${path}`, init);
}

const EMPTY_METRICS: CreationMetrics = { views: 0, likes: 0, sales: 0, comments: 0 };

// ============================================================
// 适配映射:legacy DTO → 统一 Creation 形状(仅适配层使用)
// 缺失字段以保守默认填充(metrics 归零、空预览),行为等价于今天的客户端展示。
// ============================================================

/** Aeon 地图 marker(真实地理)→ 统一发现项(地图模式)。 */
function aeonMarkerToDiscoveryItem(m: AeonPlotMarker): CreationDiscoveryItem {
  return {
    id: m.id,
    // 有 POI 的视为店铺,否则按通用场所渲染(需求 4.3 区分商家/居民创作)。
    type: m.poiName ? 'shop' : 'place',
    title: m.displayName,
    preview: { kind: 'cover', url: '' },
    creator: { accountId: m.ownerUserId, name: m.ownerName },
    metrics: { ...EMPTY_METRICS },
    geo: { lat: m.lat, lng: m.lng, gridCell: '' },
    poi: m.poiName ? { name: m.poiName, category: m.poiCategory ?? 'other' } : null,
    canEnter: true,
  };
}

/** v6 地图/发现 Plot 摘要 → 统一发现项(创作流模式)。 */
function plotSummaryToDiscoveryItem(p: MapPlotSummary): CreationDiscoveryItem {
  return {
    id: p.plotId,
    type: 'place',
    title: p.title,
    preview: { kind: 'cover', url: p.previewUrl ?? '' },
    creator: { accountId: '', name: p.ownerDisplayName },
    metrics: { ...EMPTY_METRICS },
    canEnter: true,
  };
}

/** Aeon 地块 DTO(真实地理)→ 统一 Creation(POI 绑定等场景)。 */
function aeonPlotToCreation(p: AeonPlotDto): Creation {
  return {
    id: p.id,
    ownerAccountId: p.ownerUserId,
    originalCreatorAccountId: p.ownerUserId,
    type: p.poi ? 'shop' : 'place',
    status: p.status === 'active' ? 'published' : 'unpublished',
    title: p.displayName,
    substrateTier: 'A',
    ecsVersionId: null,
    boundAgentId: null,
    geo: { lat: p.lat, lng: p.lng, gridCell: p.gridCell },
    poi: p.poi ?? null,
    preview: { kind: 'cover', url: '' },
    offerings: [],
    manifestVersion: 0,
    shareCode: null,
    metrics: { ...EMPTY_METRICS },
    createdAt: p.createdAt,
    updatedAt: p.lastActivityAt,
  };
}

/** 统一 FeedSort → v6 discover sort(legacy 仅支持 newest/popularity/tier)。 */
function feedSortToLegacy(sort?: FeedSort): 'newest' | 'popularity' | 'tier' {
  return sort === 'hot' ? 'popularity' : 'newest';
}

// ============================================================
// §1 POST /v1/creations — 新建创作(可仅 geo / 仅内容 / 两者)
// 需求 1.1 / 1.6 / 1.7
// ============================================================

/**
 * 新建创作。适配层:带 geo → 委托 Aeon `claimPlot` 圈地;无 geo(纯内容)无 legacy
 * 单步入口,直连统一端点(后端就绪后)。
 */
export async function createCreation(
  req: CreateCreationRequest,
): Promise<CreateCreationResponse> {
  if (!USE_UNIFIED_CREATION_BACKEND && req.geo) {
    const plot = await aeonApi.claimPlot({
      lat: req.geo.lat,
      lng: req.geo.lng,
      displayName: req.title,
    });
    return { creation: aeonPlotToCreation(plot) };
  }
  return unified<CreateCreationResponse>('', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

// ============================================================
// §2 POST /v1/creations/:id/generate — 提示词生成 ECS(复用 v6 generate)
// 需求 2.1 / 2.7 / 2.8
// ============================================================

/** 提示词生成 ECS_World 草稿。适配层委托 v6 `generateEcsWorld`。 */
export async function generateCreation(
  id: string,
  req: GenerateCreationRequest,
): Promise<GenerateCreationResponse> {
  if (USE_UNIFIED_CREATION_BACKEND) {
    return unified<GenerateCreationResponse>(`/${encodeURIComponent(id)}/generate`, {
      method: 'POST',
      body: JSON.stringify(req),
    });
  }
  const r: GenerateEcsWorldResponse = await worldCreationApi.generateEcsWorld(id, {
    prompt: req.prompt,
    substrateTier: req.substrateTier,
  });
  return {
    ecsVersionId: r.versionId,
    ecsWorld: r.ecsWorld,
    quotaWarning: r.quotaWarning
      ? {
          usedUsd: r.quotaWarning.currentCost,
          capUsd: r.quotaWarning.ceiling,
          message: r.quotaWarning.message,
        }
      : undefined,
    error: r.error,
  };
}

// ============================================================
// §3 POST /v1/creations/:id/continue — 连续谱编辑(prompt/coEdit/handBuild)
// 直接复用 v6 ContinuumEdit(同一 ECS_World,版本/回滚)— 请求/响应同形,直通。
// 需求 2.2 / 2.3 / 2.4 / 2.6
// ============================================================

/** 连续谱编辑。请求/响应与 v6 同形,适配层直通委托 `continueEditing`。 */
export async function continueCreation(
  id: string,
  req: ContinueCreationRequest,
): Promise<ContinueCreationResponse> {
  if (USE_UNIFIED_CREATION_BACKEND) {
    return unified<ContinueCreationResponse>(`/${encodeURIComponent(id)}/continue`, {
      method: 'POST',
      body: JSON.stringify(req),
    });
  }
  return worldCreationApi.continueEditing(id, req);
}

// ============================================================
// §4 POST /v1/creations/:id/publish — 审核→发布→shareCode + 派生 manifest
// 需求 3.1 / 3.2 / 3.6 / 1.11
// ============================================================

/**
 * 发布创作(过审 → shareCode)。适配层委托 v6 `publishPlot`;legacy 无 manifest
 * 派生信息,`manifestVersion` 留空,待统一后端补齐(需求 1.11)。
 */
export async function publishCreation(
  id: string,
  req: PublishCreationRequest = {},
): Promise<PublishCreationResponse> {
  if (USE_UNIFIED_CREATION_BACKEND) {
    return unified<PublishCreationResponse>(`/${encodeURIComponent(id)}/publish`, {
      method: 'POST',
      body: JSON.stringify(req),
    });
  }
  const r: PublishPlotResponse = await worldCreationApi.publishPlot(id);
  return {
    published: r.published,
    shareCode: r.shareCode,
    error: r.error,
  };
}

/**
 * 发布前质量门预检(world-growth-engine 阶段 3.1)。只读、不改状态;
 * 返回各维度 pass/fail + 可行动 reasons + 该类型是否会被强制拦截(enforced)。
 * 机器面新能力,直连统一端点。
 */
export async function checkCreationQuality(
  id: string,
): Promise<QualityCheckCreationResponse> {
  return unified<QualityCheckCreationResponse>(`/${encodeURIComponent(id)}/quality-check`, {
    method: 'POST',
  });
}

// ============================================================
// §5 GET /v1/creations/discover — 统一发现(map / feed / agentSearch 三形态)
// 需求 1.2 / 1.8 / 4.1 / 5.1 / 13.1
// ============================================================

/**
 * 统一发现。适配层按形态委托:
 *  - map  → Aeon `listPlotMarkers`(真实地理标记)。
 *  - feed → v6 `discoverPlots`(已发布 Plot 流)。
 *  - agentSearch → 机器面新能力,无 legacy 对应,直连统一端点。
 */
export async function discoverCreations(
  query: DiscoverCreationsQuery,
): Promise<DiscoverCreationsResponse> {
  if (USE_UNIFIED_CREATION_BACKEND) {
    return unified<DiscoverCreationsResponse>(`/discover${toQuery(query as Record<string, unknown>)}`);
  }

  if (query.mode === 'map') {
    const markers = await aeonApi.listPlotMarkers();
    const res: DiscoverMapResponse = {
      mode: 'map',
      markers: markers.map(aeonMarkerToDiscoveryItem),
    };
    return res;
  }

  if (query.mode === 'feed') {
    const r: DiscoverPlotsResponse = await worldCreationApi.discoverPlots({
      sort: feedSortToLegacy(query.sort),
      limit: query.limit,
    });
    const res: DiscoverFeedResponse = {
      mode: 'feed',
      items: r.items.map(plotSummaryToDiscoveryItem),
      nextCursor: null,
      sort: query.sort ?? 'newest',
    };
    return res;
  }

  // agentSearch:机器发现面为新能力(无 legacy),直连统一端点。
  return unified<DiscoverAgentSearchResponse>(`/discover${toQuery(query as Record<string, unknown>)}`);
}

/**
 * 游客(未登录)发现 —— 走公开只读端点 `/v1/creations/public/discover`(G1)。
 * 仅 feed/map;无个性化;后端只返回 published/listed + 匿名限流。
 */
export async function discoverCreationsPublic(
  query: DiscoverCreationsQuery,
): Promise<DiscoverCreationsResponse> {
  return apiFetch<DiscoverCreationsResponse>(
    `${BASE}/public/discover${toQuery(query as Record<string, unknown>)}`,
  );
}

// ============================================================
// §6 POST /v1/creations/:id/enter — 进入体验(人端)
// 需求 6.1–6.7
// ============================================================

/** 进入体验。适配层委托 v6 `enterPlot`(隔离级/只读资产句柄)。 */
export async function enterCreation(
  id: string,
  req: EnterCreationRequest = {},
): Promise<EnterCreationResponse> {
  if (USE_UNIFIED_CREATION_BACKEND) {
    return unified<EnterCreationResponse>(`/${encodeURIComponent(id)}/enter`, {
      method: 'POST',
      body: JSON.stringify(req),
    });
  }
  const r: EnterPlotResponse = await worldCreationApi.enterPlot(id);
  return {
    sessionId: r.sessionId,
    ecsWorld: r.ecsWorld,
    isolationLevel: r.isolationLevel,
    readonlyAssetHandles: r.readonlyAssetHandles,
  };
}

// ============================================================
// §7 GET /v1/creations/:id/manifest — 机器可读能力清单(MCP 工具)
// 需求 1.11 / 13.3 —— 机器面新能力,无 legacy 对应。
// ============================================================

/** 获取能力清单。机器面新能力,直连统一端点。 */
export async function getCreationManifest(
  id: string,
): Promise<GetCreationManifestResponse> {
  return unified<GetCreationManifestResponse>(`/${encodeURIComponent(id)}/manifest`);
}

// ============================================================
// §8 POST /v1/creations/:id/invoke — 标准动词调用(Agent,经网关)
// 需求 13.2 / 13.4 / 13.5 / 13.7 —— 机器面新能力,无 legacy 对应。
// ============================================================

/** Agent 标准动词调用。机器面新能力,直连统一端点。 */
export async function invokeCreation(
  id: string,
  req: InvokeCreationRequest,
): Promise<InvokeCreationResponse> {
  return unified<InvokeCreationResponse>(`/${encodeURIComponent(id)}/invoke`, {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

// ============================================================
// §9 社交:comment / like / share / follow
// 需求 8.1–8.4 —— 统一社交计数为新增,直连统一端点。
// ============================================================

/** 留言。统一留言计数为新能力,直连统一端点。 */
export async function commentCreation(
  id: string,
  req: CommentCreationRequest,
): Promise<CommentCreationResponse> {
  return unified<CommentCreationResponse>(`/${encodeURIComponent(id)}/comment`, {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

/** Remix(fork)一个已发布创作 → 衍生作品(血缘分润,P0-③)。 */
export async function forkCreation(id: string): Promise<CreateCreationResponse> {
  return unified<CreateCreationResponse>(`/${encodeURIComponent(id)}/fork`, { method: 'POST' });
}

/** 拉取留言列表(详情页打开时加载,需求 8.1)。 */
export async function listCreationComments(
  id: string,
  limit = 50,
): Promise<{ items: CommentCreationResponse['comment'][] }> {
  return unified(`/${encodeURIComponent(id)}/comments?limit=${limit}`, { method: 'GET' });
}

/** 点赞/取消(幂等)。直连统一端点。 */
export async function likeCreation(
  id: string,
  req: LikeCreationRequest,
): Promise<LikeCreationResponse> {
  return unified<LikeCreationResponse>(`/${encodeURIComponent(id)}/like`, {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

/** 关注/取关创作者。直连统一端点。 */
export async function followCreator(
  id: string,
  req: FollowCreatorRequest,
): Promise<FollowCreatorResponse> {
  return unified<FollowCreatorResponse>(`/${encodeURIComponent(id)}/follow`, {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

/** 分享(深链 + Web 预览兜底)。直连统一端点。 */
export async function shareCreation(id: string): Promise<ShareCreationResponse> {
  return unified<ShareCreationResponse>(`/${encodeURIComponent(id)}/share`, {
    method: 'POST',
  });
}

/**
 * 举报已发布创作(需求 5.10 举报入口 / 3.4 受理)。受理后写入审核审计
 * (decision=pending),按 SLA 处理。机器面/审核为新增能力,直连统一端点。
 */
export async function reportCreation(
  id: string,
  req: ReportCreationRequest,
): Promise<ReportCreationResponse> {
  return unified<ReportCreationResponse>(`/${encodeURIComponent(id)}/report`, {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

/**
 * 创作者主动下架(published/listed → unpublished,可逆,内容保留;需求 3.4)。
 * 「我的世界」作品管理用。直连统一端点。
 */
export async function unpublishCreation(
  id: string,
  reason?: string,
): Promise<{ unpublished: boolean; status: string; error?: { detail: string } }> {
  return unified(`/${encodeURIComponent(id)}/unpublish`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

// ============================================================
// §10 现实关联:poi / checkin
// 需求 9.1 / 9.2
// ============================================================

/** 绑定真实商家 POI。适配层委托 Aeon `bindPlotPoi`。 */
export async function bindCreationPoi(
  id: string,
  req: BindCreationPoiRequest,
): Promise<BindCreationPoiResponse> {
  if (USE_UNIFIED_CREATION_BACKEND) {
    return unified<BindCreationPoiResponse>(`/${encodeURIComponent(id)}/poi`, {
      method: 'POST',
      body: JSON.stringify(req),
    });
  }
  const plot = await aeonApi.bindPlotPoi(id, {
    name: req.poi.name,
    category: req.poi.category,
    externalPoiId: req.poi.externalPoiId,
    storeUrl: req.poi.storeUrl,
    address: req.poi.address,
  });
  return { creation: aeonPlotToCreation(plot) };
}

/** 到访签到(发放 AXP)。适配层委托 Aeon `checkInPlot`。 */
export async function checkinCreation(
  id: string,
  req: CheckinCreationRequest,
): Promise<CheckinCreationResponse> {
  if (USE_UNIFIED_CREATION_BACKEND) {
    return unified<CheckinCreationResponse>(`/${encodeURIComponent(id)}/checkin`, {
      method: 'POST',
      body: JSON.stringify(req),
    });
  }
  const r = await aeonApi.checkInPlot(id, req.location.lat, req.location.lng);
  return {
    checkedIn: r.ok,
    awardedAxp: r.rewardAxp,
    streakDays: r.streakDays,
  };
}

// ============================================================
// §11 我的创作 + Agent 代付额度(task 7.3 / 9.4)
// ============================================================

/** 我的创作列表(「我的世界」管理,需求 10.4)。 */
export async function listMyCreations(): Promise<{ items: Creation[] }> {
  return unified<{ items: Creation[] }>(`/mine`);
}

/** Agent 预设额度快照(需求 13.4,task 9.4)。 */
export interface AgentBudgetSnapshot {
  preset: number;
  spent: number;
  remaining: number;
  periodStart: number;
  whitelist: string[];
}

/** 读取我的 Agent 预设额度与用量。 */
export async function getAgentBudget(): Promise<AgentBudgetSnapshot> {
  return unified<AgentBudgetSnapshot>(`/agent/budget`);
}

/** 设置我的 Agent 预设额度(授权,需求 13.4)。 */
export async function setAgentBudget(
  presetBudgetAxp: number,
  whitelistCreationIds?: string[],
): Promise<{ preset: number; whitelist: string[] }> {
  return unified<{ preset: number; whitelist: string[] }>(`/agent/budget`, {
    method: 'POST',
    body: JSON.stringify({ presetBudgetAxp, whitelistCreationIds }),
  });
}

/** 实时同框加入描述符(需求 8.5):客户端据此用既有 `/aeon` socket 连入。 */
export interface CreationPresenceDescriptor {
  roomId: string;
  namespace: string;
  joinEvent: string;
  isStage: boolean;
  capacity: number;
}

/** 取某 Creation 的实时同框加入描述符(直播/舞台/同框)。 */
export async function getCreationPresence(
  id: string,
): Promise<CreationPresenceDescriptor> {
  return unified<CreationPresenceDescriptor>(`/${encodeURIComponent(id)}/presence`);
}

/** 可玩游戏包(方案 A):自包含 HTML5(srcdoc)或外链网页游戏(直接 WebView 加载)。 */
export interface CreationGameBundle {
  creationId: string;
  title: string;
  engine: string;
  source: 'llm' | 'template' | 'embed';
  version: number;
  /** 生成所用模型(友好名;template/embed 时为 null)。 */
  modelUsed?: string | null;
  /** 外链游戏 URL(source=embed 时有效)。 */
  url?: string | null;
  /** 外链来源分类(opensource/distribution/upload/host)。 */
  provider?: string | null;
  /** 自包含 HTML 文档(llm/template;embed 为空)。 */
  html: string;
}

/** 取 game 创作的当前可玩包(无则后端按类型懒生成;非 game 返回 404)。 */
export async function getCreationGame(id: string): Promise<CreationGameBundle> {
  return unified<CreationGameBundle>(`/${encodeURIComponent(id)}/game`);
}

/** owner 把已有网页游戏(外链)接入为创作的当前可玩包。URL 须 https + 命中后端白名单。 */
export async function embedCreationGame(
  id: string,
  url: string,
  title?: string,
): Promise<CreationGameBundle> {
  return unified<CreationGameBundle>(`/${encodeURIComponent(id)}/embed-game`, {
    method: 'POST',
    body: JSON.stringify({ url, title }),
  });
}

/** owner 导入「自己网站上的游戏」(任意公网 https URL,非白名单)。 */
export async function importCreationGame(
  id: string,
  url: string,
  title?: string,
): Promise<CreationGameBundle> {
  return unified<CreationGameBundle>(`/${encodeURIComponent(id)}/import-game`, {
    method: 'POST',
    body: JSON.stringify({ url, title }),
  });
}

/** 打赏创作作者(AXP,服务端权威结算)。 */
export async function tipCreation(
  id: string,
  amount: number,
): Promise<{ ok: boolean; amount: number; toAccountId: string }> {
  return unified<{ ok: boolean; amount: number; toAccountId: string }>(
    `/${encodeURIComponent(id)}/tip`,
    { method: 'POST', body: JSON.stringify({ amount }) },
  );
}

/**
 * 设置店铺商品(owner):{name, priceAxp, description} + 可选「如何交付」声明
 * （world-shop-fulfillment R1.4）。fulfillment 随 offering 一并保存，供质量门约束与履约引擎使用。
 */
export async function setCreationOfferings(
  id: string,
  offerings: Array<{
    name: string;
    priceAxp: number;
    description?: string;
    fulfillment?: import('../../shared/types/creation').Fulfillment;
  }>,
): Promise<{ ok: boolean; count: number }> {
  return unified<{ ok: boolean; count: number }>(`/${encodeURIComponent(id)}/offerings`, {
    method: 'POST',
    body: JSON.stringify({ offerings }),
  });
}

/** 购买店铺商品(买家,AXP 服务端权威结算)。 */
export async function purchaseCreation(
  id: string,
  offeringId: string,
  qty = 1,
): Promise<{ ok: boolean; amount: number; offeringId: string; toAccountId: string }> {
  return unified<{ ok: boolean; amount: number; offeringId: string; toAccountId: string }>(
    `/${encodeURIComponent(id)}/purchase`,
    { method: 'POST', body: JSON.stringify({ offeringId, qty }) },
  );
}

// ============================================================
// §12 履约视图:买家「我的订单/凭证」· 卖家「待履约/待核销」· 核销 voucher
// world-shop-fulfillment task 5 · R5.2/5.3/5.4 —— 单一履约引擎的读侧视图。
// ============================================================

/** 买家「我的订单/凭证」：本人全部订单，含凭证 code、履约状态、托管状态（R5.2）。 */
export async function listMyOrders(): Promise<MyFulfillmentOrdersResponse> {
  return unified<MyFulfillmentOrdersResponse>(`/orders/mine`);
}

/** 买家「我的凭证」：本人全部凭证（凭证钱包，R5.2）。 */
export async function listMyVouchers(): Promise<MyFulfillmentVouchersResponse> {
  return unified<MyFulfillmentVouchersResponse>(`/vouchers/mine`);
}

/** 卖家「待履约/待核销」：本人为卖家的订单，可按状态过滤（R5.3）。 */
export async function listSellingOrders(
  status?: FulfillmentOrderStatus,
): Promise<SellingFulfillmentOrdersResponse> {
  return unified<SellingFulfillmentOrdersResponse>(
    `/orders/selling${toQuery({ status })}`,
  );
}

/** 卖家核销一张 voucher（仅卖家可核销，至多一次；R5.3 / Property 4）。 */
export async function redeemVoucher(voucherId: string): Promise<RedeemVoucherResponse> {
  return unified<RedeemVoucherResponse>(
    `/vouchers/${encodeURIComponent(voucherId)}/redeem`,
    { method: 'POST' },
  );
}

// ============================================================
// 互动剧(短剧 MVP):生成→播放→选择→AXP解锁→打赏。
// 故事载体复用 game bundle(engine='drama-vn');解锁走服务端权威 AXP。
// ============================================================

import type { DramaStory, DramaState, UnlockEpisodeResponse } from '../../shared/types/drama';

/** 取互动剧故事(分支场景)。 */
export async function getDramaStory(id: string): Promise<DramaStory> {
  return unified<DramaStory>(`/${encodeURIComponent(id)}/drama`);
}

/** 取当前用户已解锁集号(第 1 集恒免费)。 */
export async function getDramaState(id: string): Promise<DramaState> {
  return unified<DramaState>(`/${encodeURIComponent(id)}/drama/state`);
}

/** 用 AXP 解锁某集(服务端权威 + 幂等)。 */
export async function unlockDramaEpisode(
  id: string,
  episode: number,
): Promise<UnlockEpisodeResponse> {
  return unified<UnlockEpisodeResponse>(`/${encodeURIComponent(id)}/drama/unlock`, {
    method: 'POST',
    body: JSON.stringify({ episode }),
  });
}

/** 生成/重生成互动剧(owner;LLM→JSON,失败兜底自研 demo,保证可玩)。 */
export async function generateDrama(id: string): Promise<DramaStory> {
  return unified<DramaStory>(`/${encodeURIComponent(id)}/generate-drama`, { method: 'POST' });
}

/** 生成 AI 封面并写入预览(owner)。 */
export async function generateCreationCover(id: string): Promise<{ url: string }> {
  return unified<{ url: string }>(`/${encodeURIComponent(id)}/generate-cover`, { method: 'POST' });
}

/** 为互动剧生成封面 + 每集主场景图(owner)。 */
export async function illustrateDrama(id: string): Promise<{ coverUrl: string | null; sceneImages: number }> {
  return unified<{ coverUrl: string | null; sceneImages: number }>(
    `/${encodeURIComponent(id)}/drama/illustrate`,
    { method: 'POST' },
  );
}
