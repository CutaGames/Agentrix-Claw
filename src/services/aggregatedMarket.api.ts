/**
 * aggregatedMarket.api — 萌宠「全网可接机会」聚合检索 + 半自主代成交 client
 * （Agent Protocol Stack 需求 10.1 / 10.2 / 10.3，task 21.1；对应
 * universal-agent-marketplace-aggregation 需求 1/2/3）。
 *
 * 落地验证场景的移动端入口：萌宠（其绑定的 AgentAccount）在 `spendingLimits` / AP2
 * 双围栏内，对「内部自营 + 全网已聚合外部」混合条目一键接单 / 购买 / 订阅。
 *
 * 后端落点（已审计）：
 *   - **检索（L1 ARD，需求 10.1）**：统一经 `POST /api/ard/search`
 *     （`ArdRegistryController` → `ArdRegistryService` → `UnifiedMarketplaceService`），
 *     返回内部 + 已聚合外部条目混合排序，带 `score` 与 `source` 徽标（task 19.1 已接入）。
 *     移动端 API_BASE 已含 `/api` 前缀，故此处路径为 `/ard/search`。
 *   - **代成交（L3 执行核 + 围栏，需求 10.2）/ 结算（L4，需求 10.3）**：业务逻辑在
 *     `AggregationParticipationService.participate`（走 `mcp.service` 执行核 +
 *     `OnchainFenceGuard`/`spendingLimits`/AP2 双围栏 + `SettlementCoreService` + 单一
 *     `FeeResolverService` 费率源），面向用户 REST 端点 `POST /api/aggregation/participate`
 *     （`AggregationController`）已就绪，并在 `canAccept=true` 时按连接器分流至聚合引擎执行序
 *     （内部自营 offering x402 链上结算即经此路径）。
 *
 * 本 client 按既有约定（user 维度，服务端从 JWT 解析用户萌宠的 AgentAccount）调用
 * `/aggregation/participate`；检索失败时返回空集，避免界面崩溃。
 */
import { apiFetch } from './api';
import { getLsmChain } from './lsm.api';

// ── 品类（与聚合 spec 的 5 品类对齐） ─────────────────────────────────────────
export type AggCategory = 'task' | 'prediction' | 'skill' | 'agent_rental' | 'resource';

export const AGG_CATEGORY_ORDER: AggCategory[] = [
  'task',
  'prediction',
  'skill',
  'agent_rental',
  'resource',
];

/** 各品类的默认语义查询（无自定义文本时按品类命中语义检索后端）。 */
const CATEGORY_DEFAULT_QUERY: Record<AggCategory, { en: string; zh: string }> = {
  task: { en: 'outsourcing / bounty tasks to accept', zh: '可接的外包 / 赏金任务' },
  prediction: { en: 'prediction market odds', zh: '预测市场行情与赔率' },
  skill: { en: 'callable agent skills and tools', zh: '可调用的 agent 技能与工具' },
  agent_rental: { en: 'agents available to rent or hire', zh: '可租赁 / 雇佣的 agent' },
  resource: { en: 'data sources / APIs / subscription resources', zh: '可用的数据源 / API / 订阅资源' },
};

export const INTERNAL_SOURCE = 'internal';

// ── 归一化后的「全网机会」条目（移动端视图） ────────────────────────────────
export interface AggregatedListing {
  /** ARD URN（urn:air:<publisher>:<ns>:<name>）。 */
  identifier: string;
  displayName: string;
  description?: string;
  /** IANA media type（application/ai-skill 等）。 */
  type?: string;
  /** 语义相关度 0-100。 */
  score: number;
  /** 归一化来源标签：`internal` 或外部连接器名 / host。 */
  source: string;
  /** 是否 Agentrix 内部条目。 */
  internal: boolean;
  /** 推导品类。 */
  category: AggCategory | null;
  /** 能力位（需求 10.2）：是否可代成交。 */
  canAccept: boolean;
  canDiscover: boolean;
  canPublish: boolean;
  /** 是否聚合外部条目（影响 canAccept 缺省推导）。 */
  aggregated: boolean;
  /** 成交额（GMV，结算币种计价）。 */
  gmv: number;
  currency: string;
  /** 受监管品类（gambling/securities/cross_border）；null/undefined 跳过合规门。 */
  regulated?: 'gambling' | 'securities' | 'cross_border' | null;
  /** 收款商户 ID（用于 mandate allowedMerchants 校验）。 */
  merchantId?: string;
  /** 外部跳转链接（仅链接发现条目）。 */
  externalUrl?: string;
  /** 连接器侧条目 ID（代成交 listing.externalId）。 */
  externalId: string;
  /** 连接器原始来源（agenton/polymarket/internal…，代成交 listing.source）。 */
  connectorSource: string;
  /** 原始 entry（兜底取数）。 */
  raw?: any;
}

// ── 归一化辅助（兼容后端 snake_case / camelCase / data.* 嵌套） ───────────────

function num(v: any, fallback = 0): number {
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : fallback;
}

/** 提取 identifier 的 <publisher> 段：urn:air:<publisher>:<ns>:<name>。 */
function extractPublisher(identifier?: string): string | null {
  if (!identifier) return null;
  const parts = identifier.split(':');
  if (parts.length < 5 || parts[0] !== 'urn' || parts[1] !== 'air') return null;
  return parts[2] || null;
}

function shortHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0] || url;
  }
}

/** 是否为 Agentrix 内部条目（publisher=agentrix.io 或 source 标注 internal）。 */
function isInternal(entry: any, source?: string): boolean {
  const pub = (extractPublisher(entry?.identifier) || '').toLowerCase();
  const raw = (source || '').toLowerCase();
  if (pub === 'agentrix.io') return true;
  if (raw === INTERNAL_SOURCE || raw.includes('agentrix')) return true;
  const dataAgg = entry?.data?.aggregated;
  if (dataAgg === false && !entry?.data?.source) return true;
  return false;
}

/** 归一化来源标签：data.source > internal > 外部 host。 */
function sourceLabelOf(entry: any): string {
  const dataSource = entry?.data?.source;
  if (typeof dataSource === 'string' && dataSource.trim()) return dataSource.trim();
  if (isInternal(entry, entry?.source)) return INTERNAL_SOURCE;
  if (entry?.source) return String(entry.source);
  const url = entry?.url || entry?.data?.externalUrl;
  return url ? shortHost(String(url)) : 'unknown';
}

/** 从条目推导品类（identifier ns > data.category > type > tags）。 */
function categoryOf(entry: any): AggCategory | null {
  const parts = String(entry?.identifier || '').split(':');
  const ns = (parts[3] || '').toLowerCase();
  if (AGG_CATEGORY_ORDER.includes(ns as AggCategory)) return ns as AggCategory;
  const dc = String(entry?.data?.category || '').toLowerCase();
  if (AGG_CATEGORY_ORDER.includes(dc as AggCategory)) return dc as AggCategory;
  if (entry?.type === 'application/ai-skill') return 'skill';
  if (entry?.type === 'application/a2a-agent-card+json') return 'agent_rental';
  const tags = (Array.isArray(entry?.tags) ? entry.tags : []).map((x: any) => String(x).toLowerCase());
  for (const c of AGG_CATEGORY_ORDER) if (tags.includes(c)) return c;
  return null;
}

function readCapabilities(entry: any): { canDiscover: boolean; canAccept: boolean; canPublish: boolean } {
  const caps = (Array.isArray(entry?.capabilities) ? entry.capabilities : []).map((c: any) =>
    String(c).toLowerCase(),
  );
  const dataCaps = entry?.data?.capabilities;
  const has = (...keys: string[]) => {
    for (const k of keys) {
      if (caps.includes(k.toLowerCase())) return true;
      if (dataCaps && typeof dataCaps === 'object' && dataCaps[k] === true) return true;
      if (entry?.data && entry.data[k] === true) return true;
    }
    return false;
  };
  return {
    canDiscover: has('candiscover', 'discover'),
    canAccept: has('canaccept', 'accept'),
    canPublish: has('canpublish', 'publish'),
  };
}

/** GMV 兜底取数：data.gmv > data.price > data.budget > data.amount。 */
function gmvOf(entry: any): number {
  const d = entry?.data ?? {};
  return num(d.gmv ?? d.price ?? d.budget ?? d.amount, 0);
}

function normalizeListing(entry: any): AggregatedListing {
  const internal = isInternal(entry, entry?.source);
  const aggregated = entry?.data?.aggregated === true || (!internal && !!entry?.data?.source);
  const caps = readCapabilities(entry);
  // 能力位缺省推导（与后端 AggregationListingRef.canAccept 语义一致）：
  // 内部条目默认可代成交；聚合外部条目默认仅链接发现。
  const explicitAccept =
    entry?.data?.canAccept === true || caps.canAccept
      ? true
      : entry?.data?.canAccept === false
        ? false
        : !aggregated;
  const d = entry?.data ?? {};
  return {
    identifier: String(entry?.identifier ?? ''),
    displayName: String(entry?.displayName ?? entry?.identifier ?? ''),
    description: entry?.description ? String(entry.description) : undefined,
    type: entry?.type ? String(entry.type) : undefined,
    score: num(entry?.score, 0),
    source: sourceLabelOf(entry),
    internal,
    category: categoryOf(entry),
    canAccept: explicitAccept,
    canDiscover: caps.canDiscover,
    canPublish: caps.canPublish,
    aggregated,
    gmv: gmvOf(entry),
    currency: String(d.currency ?? 'USDC'),
    regulated: (d.regulated ?? null) as AggregatedListing['regulated'],
    merchantId: d.merchantId ?? d.merchant_id ?? undefined,
    externalUrl:
      (typeof d.externalUrl === 'string' && d.externalUrl) ||
      (typeof entry?.url === 'string' && entry.url) ||
      undefined,
    externalId: String(d.externalId ?? d.external_id ?? entry?.identifier ?? ''),
    connectorSource: String(d.source ?? (internal ? INTERNAL_SOURCE : sourceLabelOf(entry))),
    raw: entry,
  };
}

// ── 检索（L1 ARD，需求 10.1） ───────────────────────────────────────────────

export interface SearchOpportunitiesParams {
  /** 自然语言查询（留空则按品类默认文案）。 */
  text?: string;
  /** 品类过滤（不传 = 全部品类）。 */
  category?: AggCategory;
  /** 来源过滤（internal 或外部连接器名；不传 = 全部）。 */
  source?: string;
  /** 语言（用于默认查询文案）。 */
  lang?: 'en' | 'zh';
  pageSize?: number;
}

/**
 * 检索「全网可接机会」（内部 + 已聚合外部混合）。
 * 统一经 ARD `/ard/search`（UnifiedMarketplaceService 后端，task 19.1）。
 * 检索失败 / 端点缺失时静默降级为空集，界面据此展示空态。
 */
export async function searchAggregatedOpportunities(
  params: SearchOpportunitiesParams = {},
): Promise<AggregatedListing[]> {
  const lang = params.lang ?? 'zh';
  const effectiveText =
    (params.text && params.text.trim()) ||
    (params.category
      ? CATEGORY_DEFAULT_QUERY[params.category][lang]
      : lang === 'en'
        ? 'all-network opportunities to accept'
        : '全网可接机会');

  const filter: Record<string, string[]> = {};
  if (params.category) filter.category = [params.category];
  if (params.source && params.source !== 'all') filter.source = [params.source];

  try {
    const raw = await apiFetch<any>('/ard/search', {
      method: 'POST',
      body: JSON.stringify({
        query: {
          text: effectiveText,
          ...(Object.keys(filter).length ? { filter } : {}),
        },
        federation: 'auto',
        pageSize: params.pageSize ?? 50,
      }),
    });
    const results = Array.isArray(raw) ? raw : raw?.results ?? [];
    const listings = (results as any[]).map(normalizeListing);
    // 客户端按品类 / 来源二次过滤（防御性：保证语义稳定，即使后端过滤未完全支持）。
    return listings.filter((l) => {
      if (params.category && l.category !== params.category) return false;
      if (params.source && params.source !== 'all') {
        const s = l.source.toLowerCase();
        if (params.source === INTERNAL_SOURCE) {
          if (!(s === INTERNAL_SOURCE || s.includes('agentrix'))) return false;
        } else if (s !== params.source.toLowerCase()) {
          return false;
        }
      }
      return true;
    });
  } catch {
    return [];
  }
}

// ── 代成交（L3 执行核 + 围栏 / L4 结算，需求 10.2 / 10.3） ─────────────────────

export type ParticipationAction = 'accept' | 'purchase' | 'subscribe';

/** 单一费率源（FeeResolverService）产出的费率明细（移动端视图）。 */
export interface FeeBreakdownView {
  /** 平台净抽佣率（0-1）。 */
  baseRate: number;
  /** 激励池率（0-1）。 */
  poolRate: number;
  /** 平台净抽佣金额 = gmv * baseRate。 */
  platformFee: number;
  /** 激励池金额。 */
  poolAmount: number;
  /** 卖家净收入。 */
  sellerNet: number;
}

export type ParticipationStatus =
  | 'settled'
  | 'rejected'
  | 'payment_required'
  | 'executed_unsettled';

export interface ParticipateResult {
  ok: boolean;
  status: ParticipationStatus;
  reason?: string;
  feeBreakdown?: FeeBreakdownView;
  l3?: {
    lane: 'onchain' | 'offchain';
    executed: boolean;
    toolName?: string;
    txHash?: string;
  };
  /** x402 支付要求（status=payment_required 时给出，简化展示）。 */
  paymentRequirements?: any;
  /**
   * 本次成交使用的幂等键（精确一次）。`payment_required` 时**必须**复用它携 proof 重放
   * （需求 4.1），故一并回传给调用方。
   */
  idempotencyKey?: string;
}

/**
 * x402 付款凭证（用户主权钱包 pay-first 回填，需求 4.1 / 4.2）。
 * 与后端 `X402PaymentProof`（`settlement.types.ts`）同形：客户端在对应链完成 USDC 支付后，
 * 携 `{ txHash, network, asset }` 重放**同一 idempotencyKey**，后端经多链验真精确一次结算。
 */
export interface X402Proof {
  /** 链上交易哈希（用户钱包付款回执）。 */
  txHash?: string;
  /** x402 付款载荷（如签名授权，可选）。 */
  paymentPayload?: string;
  /** 付款方声明金额（与要求额比对，可选）。 */
  paidAmount?: number;
  /** 结算网络（如 `injective-testnet` / `bsc`）。 */
  network?: string;
  /** 结算资产（如 `USDC`）。 */
  asset?: string;
}

export interface ParticipateInput {
  listing: AggregatedListing;
  action: ParticipationAction;
  /** UCP AP2 mandate ID（双围栏之一，可选）。 */
  mandateId?: string;
  /** 通道（默认 offchain）。 */
  lane?: 'onchain' | 'offchain';
  /**
   * 幂等键（精确一次）。**proof 回填重放时必须复用**首次 `payment_required` 返回的
   * 同一 idempotencyKey（需求 4.1），否则会被后端视为新成交、可能重复扣款。
   * 缺省时自动生成（首次成交路径）。
   */
  idempotencyKey?: string;
  /**
   * x402 付款凭证（用户钱包链上付款后回填，需求 4.1）。携带时后端跳过 402、经多链验真结算。
   */
  proof?: X402Proof;
}

/** 生成幂等键（Hermes 无 crypto.randomUUID 时的可移植实现）。 */
function makeIdempotencyKey(): string {
  return `pe-agg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeFeeBreakdown(f: any): FeeBreakdownView | undefined {
  if (!f || typeof f !== 'object') return undefined;
  return {
    baseRate: num(f.baseRate ?? f.base_rate),
    poolRate: num(f.poolRate ?? f.pool_rate),
    platformFee: num(f.platformFee ?? f.platform_fee),
    poolAmount: num(f.poolAmount ?? f.pool_amount),
    sellerNet: num(f.sellerNet ?? f.seller_net),
  };
}

/**
 * 对聚合条目代成交（接单 / 购买 / 订阅）。
 *
 * 调用面向用户端点 `POST /api/aggregation/participate`（`AggregationController` 包裹
 * `AggregationParticipationService.participate`）：L3 执行核 + spendingLimits/AP2 双围栏 +
 * L4 结算 + 单一 FeeResolver 费率源；`canAccept=true` 时按连接器分流至聚合引擎执行序。
 * 服务端从 JWT 解析用户萌宠的 AgentAccount（承载 spendingLimits/usedTodayAmount 围栏），
 * 故请求体不下发任何凭证（需求 9.2）。
 */
export async function participateInListing(input: ParticipateInput): Promise<ParticipateResult> {
  const { listing } = input;
  // 仅链接发现条目（无授权代成交能力）：前端直接给出可读拒绝，避免无谓请求（需求 3.4）。
  if (!listing.canAccept) {
    return {
      ok: false,
      status: 'rejected',
      reason: 'link-discovery-only',
    };
  }

  // 幂等键：proof 回填重放时复用首次返回的同一 key（需求 4.1），否则自动生成。
  const idempotencyKey = input.idempotencyKey || makeIdempotencyKey();

  const body: Record<string, any> = {
    listing: {
      source: listing.connectorSource,
      externalId: listing.externalId,
      category: listing.category ?? 'task',
      gmv: listing.gmv,
      currency: listing.currency,
      regulated: listing.regulated ?? null,
      canAccept: listing.canAccept,
      aggregated: listing.aggregated,
      externalUrl: listing.externalUrl,
      merchantId: listing.merchantId,
    },
    action: input.action,
    mandateId: input.mandateId,
    lane: input.lane ?? 'offchain',
    idempotencyKey,
  };
  // x402 proof 回填（需求 4.1）：后端 adaptParticipate 把顶层 proof 并入 settlement.proof，
  // 经 toEngineContext 透传至引擎 ctx.proof → 跳过 402 → 多链验真结算。仅传白名单字段。
  if (input.proof && (input.proof.txHash || input.proof.paymentPayload)) {
    body.proof = {
      ...(input.proof.txHash ? { txHash: input.proof.txHash } : {}),
      ...(input.proof.paymentPayload ? { paymentPayload: input.proof.paymentPayload } : {}),
      ...(input.proof.network ? { network: input.proof.network } : {}),
      ...(input.proof.asset ? { asset: input.proof.asset } : {}),
      ...(typeof input.proof.paidAmount === 'number' ? { paidAmount: input.proof.paidAmount } : {}),
    };
  }

  try {
    const raw = await apiFetch<any>('/aggregation/participate', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return {
      ok: !!raw?.ok,
      status: (raw?.status ?? (raw?.ok ? 'settled' : 'rejected')) as ParticipationStatus,
      reason: raw?.reason,
      feeBreakdown: normalizeFeeBreakdown(raw?.feeBreakdown),
      l3: raw?.l3
        ? {
            lane: raw.l3.lane ?? 'offchain',
            executed: !!raw.l3.executed,
            toolName: raw.l3.toolName,
            txHash: raw.l3.txHash,
          }
        : undefined,
      paymentRequirements: raw?.paymentRequirements,
      idempotencyKey,
    };
  } catch (e: any) {
    const msg = String(e?.message || '');
    return { ok: false, status: 'rejected', reason: msg || 'participate failed', idempotencyKey };
  }
}

// ── 用户主权钱包 x402 proof 回填（需求 4.1 / 4.2 / 4.3）─────────────────────

/**
 * x402 网络名 → 结算链 chainId 映射（测试网优先）。
 * token 地址由 `lsm.api` 的 `LSM_CHAINS` 单一来源解析（避免散落硬编码，与充值/结算同一口径）。
 */
const X402_NETWORK_CHAIN: Record<string, number> = {
  injective: 1439,
  'injective-testnet': 1439,
  'injective-evm-testnet': 1439,
  bsc: 97,
  'bsc-testnet': 97,
  bnb: 97,
};

/** 从 x402 支付要求解析出用户钱包付款所需的链上参数（需求 4.1）。 */
export interface X402PaymentOption {
  /** 结算网络名（回填 proof.network）。 */
  network: string;
  /** 结算资产符号（回填 proof.asset）。 */
  asset: string;
  /** 收款地址（分佣合约）。 */
  payTo: string;
  /** 结算链 chainId。 */
  chainId: number;
  /** 该链 USDC 代币合约地址。 */
  usdcToken: string;
  /** 人类可读付款金额（USDC，供钱包 erc20_transfer 按 decimals 换算）。 */
  amountHuman: string;
}

/**
 * 从后端 `payment_required` 的 `paymentRequirements`（x402 信封）解析首个可用支付方案，
 * 归一为用户钱包链上付款所需参数。网络不在支持表 / 收款地址缺失时返回 null（失败闭合，
 * 不发起链上付款），需求 4.1 / 6.1。
 */
export function extractX402PaymentOption(
  paymentRequirements: any,
  fallbackAmount?: number,
): X402PaymentOption | null {
  const accept = paymentRequirements?.accepts?.[0];
  if (!accept || typeof accept !== 'object') return null;
  const network = String(accept.network ?? '').trim();
  const payTo = String(accept.payTo ?? '').trim();
  if (!network || !payTo) return null;

  const chainId = X402_NETWORK_CHAIN[network.toLowerCase()];
  if (!chainId) return null; // 未支持的链：失败闭合。
  const chain = getLsmChain(chainId);
  if (!chain) return null;

  const asset = String(accept.asset ?? 'USDC').trim() || 'USDC';
  // maxAmountRequired 为最小单位（USDC 6 位精度）字符串；换算回人类可读金额供钱包按 decimals 转账。
  const atomic = Number(accept.maxAmountRequired);
  let amountHuman: string;
  if (Number.isFinite(atomic) && atomic > 0) {
    amountHuman = String(atomic / 1e6);
  } else if (typeof fallbackAmount === 'number' && fallbackAmount > 0) {
    amountHuman = String(fallbackAmount);
  } else {
    return null;
  }

  return { network, asset, payTo, chainId, usdcToken: chain.usdc, amountHuman };
}

/**
 * 用户钱包链上付款函数（依赖注入，避免服务层直接耦合 expo / mpcWallet 原生依赖，
 * 且便于测试与「平台托管 autopay」路径并存，需求 4.3）。
 *
 * 典型实现：调 `mpcWallet.signAndSendManaged({ intent:{ kind:'erc20_transfer', ... } })`，
 * 用**用户自己的**（MPC 自托管）钱包在对应链把 USDC 转给 `to`（分佣合约），返回真 txHash。
 */
export type UserWalletPayFn = (params: {
  chainId: number;
  token: string;
  to: string;
  amountHuman: string;
}) => Promise<{ txHash: string; status: 'submitted' | 'confirmed' | 'failed'; reason?: string }>;

/**
 * 用户主权钱包 x402 proof 回填：pay-first → 用户钱包链上付 USDC → 携 proof 重放**同一
 * idempotencyKey**（需求 4.1 / 4.2）。
 *
 * @param input   首次成交的入参（listing/action 等）。
 * @param pending 首次返回的 `payment_required` 结果（携 paymentRequirements + idempotencyKey）。
 * @param pay     用户钱包付款函数（返回 txHash）。
 *
 * 流程：
 *  ① 校验 pending 为 payment_required 且带 paymentRequirements + idempotencyKey；
 *  ② 解析支付方案（网络/收款地址/金额/token）；不支持则失败闭合、不发起付款；
 *  ③ 用户钱包链上付 USDC（失败/未开放 → 返回结构化 rejected，不重放）；
 *  ④ 携 proof + **同一 idempotencyKey** 重放 `participateInListing`（后端多链验真、精确一次）。
 *
 * 与平台托管 agent autopay 并存：autopay 在后端引擎内对平台托管 agent 生效（无需 proof），
 * 本路径是**用户主权钱包**在客户端完成付款后回填 proof，二者互不影响（需求 4.3）。
 */
export async function payWithUserWalletAndReplay(
  input: ParticipateInput,
  pending: ParticipateResult,
  pay: UserWalletPayFn,
): Promise<ParticipateResult> {
  if (pending.status !== 'payment_required') {
    return { ok: false, status: 'rejected', reason: 'not-payment-required' };
  }
  if (!pending.idempotencyKey) {
    // 无法复用同一 idempotencyKey → 拒绝重放（避免重复扣款，需求 4.1）。
    return { ok: false, status: 'rejected', reason: 'missing-idempotency-key' };
  }
  const option = extractX402PaymentOption(pending.paymentRequirements, input.listing.gmv);
  if (!option) {
    return { ok: false, status: 'rejected', reason: 'unsupported-payment-network' };
  }

  let payResult: { txHash: string; status: string; reason?: string };
  try {
    payResult = await pay({
      chainId: option.chainId,
      token: option.usdcToken,
      to: option.payTo,
      amountHuman: option.amountHuman,
    });
  } catch (e: any) {
    return { ok: false, status: 'rejected', reason: `wallet-pay-error: ${String(e?.message || e)}` };
  }
  if (!payResult || payResult.status === 'failed' || !payResult.txHash) {
    return {
      ok: false,
      status: 'rejected',
      reason: payResult?.reason ? `wallet-pay-failed: ${payResult.reason}` : 'wallet-pay-failed',
      idempotencyKey: pending.idempotencyKey,
    };
  }

  // 携 proof + 同一 idempotencyKey 重放（需求 4.1 / 4.2）。
  return participateInListing({
    ...input,
    idempotencyKey: pending.idempotencyKey,
    proof: {
      txHash: payResult.txHash,
      network: option.network,
      asset: option.asset,
    },
  });
}

// ── 聚合成交流水 / 对账（需求 10.3，收益中心展示） ───────────────────────────

export interface AggregatedSettlementRow {
  id: string;
  /** 来源连接器（internal / agenton / polymarket…）。 */
  source: string;
  category: string;
  /** 成交额（结算币种计价）。 */
  gmv: number;
  currency: string;
  /** 平台费（FeeResolverService）。 */
  platformFee: number;
  /** 卖家净收入。 */
  sellerNet: number;
  status: 'settled' | 'pending' | 'failed';
  /** 资产类型（aggregated_web2 / aggregated_web3）。 */
  assetType?: string;
  createdAt?: number | string;
}

function normalizeSettlement(s: any): AggregatedSettlementRow {
  return {
    id: String(s?.id ?? ''),
    source: String(s?.source ?? s?.connectorSource ?? 'internal'),
    category: String(s?.category ?? ''),
    gmv: num(s?.gmv ?? s?.amount),
    currency: String(s?.currency ?? 'USDC'),
    platformFee: num(s?.platformFee ?? s?.platform_fee ?? s?.fee),
    sellerNet: num(s?.sellerNet ?? s?.seller_net ?? s?.net),
    status: (s?.status ?? 'settled') as AggregatedSettlementRow['status'],
    assetType: s?.assetType ?? s?.asset_type ?? undefined,
    createdAt: s?.createdAt ?? s?.created_at ?? undefined,
  };
}

/**
 * 拉取聚合成交流水与对账（需求 10.3：聚合成交真实收支入统一账本、参与偿付能力对账）。
 *
 * 调用 `GET /api/ard/aggregated-settlements`（`ArdManagementController`，聚合
 * `AggregationParticipation` 引擎代成交记录 + 关联 `Payment` 落账，返回每笔
 * { 金额、feeBreakdown、链上 txHash、状态 }）；出错时静默降级为空列表，收益中心展示空态引导。
 */
export async function fetchAggregatedSettlements(limit = 20): Promise<AggregatedSettlementRow[]> {
  try {
    const raw = await apiFetch<any>(`/ard/aggregated-settlements?limit=${limit}`);
    const list = Array.isArray(raw) ? raw : raw?.items ?? raw?.settlements ?? [];
    return (list as any[]).map(normalizeSettlement);
  } catch {
    return [];
  }
}
