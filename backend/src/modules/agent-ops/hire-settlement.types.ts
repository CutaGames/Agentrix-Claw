import type { SplitConfig } from '../commission/split-tree-generator.service';

/**
 * 被雇佣结算 + 多跳分佣闭环 · 公共类型(crypto-native-agent-ops 任务 14)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - design §C6「Auto-Earn / A2A 被雇佣 + 结算」:
 *     挂牌(x402 discovery + agent-marketplace listing)→ 服务端权威定价 →
 *     `agent_hire_escrow` 或直接 USDC 结算(relayer)→ `split-tree-generator` 多跳分佣 →
 *     Commission 合约一次提交 → `recordSpending` 入账。
 *   - 需求 5.1(服务端权威定价 + USDC 结算)/ 5.2(多方多跳分佣,链上一次提交)/
 *     5.3(AXP 与 USDC 边界清晰,不混用)/ 5.4(可审计记录)/ 12.1(被雇佣赚钱)/ 12.4(可审计)。
 *   - Correctness Property 6(分佣守恒):商户净额 + 各方分佣 + 平台/渠道费 = 成交总额。
 */

/** 结算结算轨道:软托管(escrow,24h 争议窗口)或直接 USDC(relayer)。 */
export type SettlementRail = 'escrow' | 'relayer';

/** 结算币种 —— 仅 USDC。AXP 为 App 内积分层,严禁混入结算余额(需求 5.3 边界)。 */
export type SettlementCurrency = 'USDC';

/** 产品类型,决定平台/渠道/激励池费率(对接 split-tree-generator)。 */
export type ListingProductType = 'physical' | 'service' | 'virtual' | 'nft';

/**
 * 多跳分佣血缘中的一方(推荐方 / 作者 / 调优方等)。
 * 经 `split-tree-generator` 在链上合并为单次 SplitConfig 提交(需求 5.2)。
 */
export interface SettlementParty {
  /** 角色(审计与展示用)。 */
  role: 'referrer' | 'author' | 'channel';
  /** 该方的 AgentAccount id(为 agent 时记账;非 agent 可空)。 */
  agentId?: string | null;
  /** 收款钱包地址(USDC)。 */
  wallet: string;
  /** 占激励池的分成比例 (0–1)。各方之和 ≤ 1。 */
  poolShare: number;
}

/**
 * 可被付费调用的 agent 服务挂牌(复用 x402 discovery + agent-marketplace listing)。
 *
 * 注意:挂牌仅承载**定价输入**与血缘,真实成交金额由服务端权威重算
 * (见 {@link HireRequest},不信任客户端传入金额 —— 需求 5.1)。
 */
export interface AgentServiceListing {
  /** 挂牌 id(x402 service id / marketplace listing id)。 */
  listingId: string;
  /** 执行方(被雇佣)agent 的 AgentAccount id —— 结算受益主体。 */
  executingAgentId: string;
  /** 卖方(执行 agent 的所有者)用户 id —— escrow 的 seller。 */
  sellerUserId: string;
  /** 执行 agent 的收款钱包(USDC),作为分账树的 merchant 钱包。 */
  merchantWallet: string;
  /** 服务端权威单价(USD)—— 客户端不可覆盖。 */
  unitPriceUsd: number;
  /** 产品类型(费率档)。 */
  productType: ListingProductType;
  /** 是否经 x402 协议挂牌(true → 计渠道费)。 */
  x402Enabled: boolean;
  /** 多跳分佣血缘(推荐方/作者等);为空表示无分佣方,净额全归执行 agent。 */
  parties?: SettlementParty[];
}

/** 一次被雇佣调用的结算请求。 */
export interface HireRequest {
  /** 被调用的挂牌。 */
  listing: AgentServiceListing;
  /** 雇主用户 id(escrow 的 hirer)。 */
  hirerUserId: string;
  /** 调用次数 / 计量单位(默认 1);服务端据此 × 权威单价得总额。 */
  quantity?: number;
  /** 结算币种 —— 必须为 'USDC';传入 AXP 或其它将被拒(需求 5.3)。 */
  currency: SettlementCurrency;
  /** 结算轨道。 */
  rail: SettlementRail;
  /** 关联任务 id(escrow 以 taskId 为幂等键)。 */
  taskId: string;
  /**
   * 客户端建议金额(USD,仅用于展示/比对告警),**不参与定价**。
   * 服务端始终以 unitPriceUsd × quantity 为权威总额。
   */
  clientSuggestedUsd?: number;
}

/** 单方分佣的明细(审计用,需求 5.4)。 */
export interface SettlementShare {
  role: 'merchant' | 'referrer' | 'author' | 'platform' | 'channel';
  agentId?: string | null;
  wallet: string;
  /** 分得金额(USD)。 */
  amountUsd: number;
  /** 占成交总额的百分比(两位小数)。 */
  percentage: number;
}

/**
 * 结算分账明细(守恒口径)。
 *
 * **不变量(Property 6):** merchantNetUsd + Σ(partyShares) + platformFeeUsd + channelFeeUsd
 * 恰好等于 totalUsd(浮点以 cent 容差校验)。执行 agent 收净额(merchant 角色)。
 */
export interface SettlementBreakdown {
  totalUsd: number;
  merchantNetUsd: number;
  platformFeeUsd: number;
  channelFeeUsd: number;
  /** 各分佣方(推荐方/作者等)。 */
  partyShares: SettlementShare[];
  /** 扁平化的全部分账(含 merchant/platform/channel),便于审计与看板。 */
  shares: SettlementShare[];
}

/**
 * Commission 合约一次提交的产物(需求 5.2「链上一次性提交」)。
 *
 * 多跳血缘经 split-tree-generator 合并为单个 {@link SplitConfig} + 哈希,
 * 链上仅提交一次(本 P0 阶段不真正发链,产出可审计的提交凭据/引用)。
 */
export interface CommissionSubmission {
  /** 合并后的链上分账配置。 */
  flatConfig: SplitConfig;
  /** 分账配置哈希(split-tree-generator 生成,用于验证)。 */
  splitHash: string;
  /** 单次提交引用(BSC testnet 默认;P0 为软引用,真实上链待 relayer 风控开关)。 */
  submissionRef: string;
  /** 提交时间戳。 */
  submittedAt: string;
}

/** 一笔被雇佣结算的最终结果(全链路审计)。 */
export interface HireSettlementResult {
  taskId: string;
  listingId: string;
  executingAgentId: string;
  currency: SettlementCurrency;
  rail: SettlementRail;
  /** 守恒的分账明细。 */
  breakdown: SettlementBreakdown;
  /** Commission 合约一次提交凭据。 */
  commission: CommissionSubmission;
  /** 结算轨道凭据(escrow id 或 relayer 参考)。 */
  settlementRef: string;
  /** 已驱动的 recordSpending 入账事件(agentId + 金额 + 幂等键),审计用。 */
  spendingEvents: Array<{ agentId: string; amountUsd: number; idempotencyKey: string }>;
}
