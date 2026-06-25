import type { RiskTier } from '../agent/policy-evaluator.service';

/**
 * 安全防护 — 公共类型与可注入契约(crypto-native-agent-ops 任务 17)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - design §C5「SecurityGuard」:授权扫描(读链上 approvals)+ 风险标注 +
 *     引导撤销(撤销交易走人确认签名);交易模拟/解读(集成模拟 RPC,如 Tenderly/anvil fork,
 *     适配器待选);地址/合约/域名骗局检查。**只读为主,不代执行资金操作**。
 *   - 需求 10.1:扫描钱包代币/合约授权并标注高风险项,支持引导撤销(撤销交易需人工签名确认)。
 *   - 需求 10.2:用户即将签署交易时提供交易模拟/解读(资产变动、目标合约风险)供决策。
 *   - 需求 10.3:对目标地址/合约/域名做骗局与风险检查并给出明确提示。
 *   - 需求 10.4:安全检查以只读为主,不代用户执行资金操作。
 *   - Property 4「资金写操作必经人确认」:撤销交易(transaction_sign)在无人工确认时不得执行。
 *   - Property 8「降级显式」:交易模拟/骗局情报不可用时进入显式「未启用/未知」态,绝不静默伪装。
 *
 * 设计要点:
 *   - 授权扫描复用 Task 12 的只读采集路径(`ReadOnlyFetcher`:navigate + browser_eval)。
 *   - 撤销动作的风险分级复用 Task 9 的 `PolicyEvaluatorService.classifyActionRisk`
 *     (`transaction_sign` → high → 人确认),SecurityGuard 只产出**未签名计划**,绝不代执行。
 *   - 交易模拟器、骗局情报源抽象在可注入接口后(占位实现 explicit degraded,便于测试 mock)。
 */

// ───────────────────────── 授权扫描与标注(需求 10.1) ─────────────────────────

/** 授权风险档(对扫描出的单条 approval 标注)。 */
export type ApprovalRiskTier = 'low' | 'medium' | 'high';

/**
 * 一条链上代币/合约授权(approval)。
 *
 * 由扫描器从只读数据源(区块浏览器授权页)解析;无法核实的字段一律留空(不编造)。
 */
export interface TokenApproval {
  /** 链标识(slug),如 'ethereum' / 'bsc'。 */
  chain: string;
  /** 被授权的代币合约地址。 */
  token: string;
  /** 代币 symbol(若可解析)。 */
  tokenSymbol?: string;
  /** 被授权的 spender(合约/地址)。 */
  spender: string;
  /** spender 已知标签(若可解析,如协议名)。 */
  spenderLabel?: string;
  /**
   * 授权额度(十进制字符串原值;`'unlimited'` 或缺省 isUnlimited=true 表示无限授权)。
   * 不可解析时留空(不编造)。
   */
  allowance?: string;
  /** 是否为无限授权(由扫描器解析;或额度逼近 uint256 上限)。 */
  isUnlimited?: boolean;
  /** spender 合约是否在区块浏览器已验证(可解析时填)。 */
  spenderVerified?: boolean;
  /** spender 是否被骗局情报/本地名单标记(可解析时填)。 */
  spenderFlagged?: boolean;
}

/** 标注后的授权(原始字段 + 风险档 + 信号 + 建议)。 */
export interface AnnotatedApproval extends TokenApproval {
  /** 风险档:high(建议立即撤销)/ medium(关注)/ low。 */
  riskTier: ApprovalRiskTier;
  /** 触发该风险档的具体信号(可核、可解释)。 */
  riskSignals: string[];
  /** 面向用户的明确提示/建议(如「建议撤销该无限授权」)。 */
  recommendation: string;
}

/** 授权扫描请求(只读)。 */
export interface ApprovalScanRequest {
  userId: string;
  agentId: string;
  /** 待扫描的钱包地址。 */
  wallet: string;
  /** 链标识(slug)。 */
  chain: string;
  deviceId?: string;
  sessionId?: string;
}

/** 授权扫描结果。 */
export interface ApprovalScanResult {
  wallet: string;
  chain: string;
  /** 可核来源链接(区块浏览器授权检查页)。 */
  sourceUrl: string;
  /** 扫描是否成功取数(失败时为 false,approvals 为空,explicit degraded)。 */
  fetched: boolean;
  /** 标注后的授权列表(按风险档降序)。 */
  approvals: AnnotatedApproval[];
  /** 高风险条目数(便于 UI 红点)。 */
  highRiskCount: number;
  /** 采集时间(ISO 8601)。 */
  scannedAt: string;
  /** 取数失败时的结构化原因(不编造)。 */
  note?: string;
}

// ───────────────────────── 引导撤销(需求 10.1 / Property 4) ─────────────────────────

/**
 * 未签名的撤销交易计划(SecurityGuard **绝不代执行**,仅产出供人确认签名)。
 *
 * ERC-20 撤销 = `approve(spender, 0)`;调用 `to` 为代币合约。
 */
export interface RevokeTransactionPlan {
  chain: string;
  /** 交易目标 = 代币合约地址。 */
  to: string;
  /** 标准方法(撤销固定为 approve)。 */
  method: 'approve';
  /** 调用参数:把对 spender 的额度置 0。 */
  args: { spender: string; amount: '0' };
  /** 人类可读说明。 */
  description: string;
}

/**
 * 撤销引导结果(需求 10.1 + Property 4)。
 *
 * 硬约束:`autoExecuted` 恒为 `false`,`requiresUserConfirmation` 恒为 `true`,
 * `decision` 恒为 `'user_confirmation'`;SecurityGuard 不持有/不调用任何签名或转账能力。
 */
export interface RevokeGuidance {
  /** 未签名的撤销交易计划(交由人确认 UI 签名后由钱包执行)。 */
  plan: RevokeTransactionPlan;
  /** 撤销动作的风险档(经 PolicyEvaluator,固定为 high)。 */
  riskTier: RiskTier;
  /** 是否需要人工确认签名(恒为 true)。 */
  requiresUserConfirmation: boolean;
  /** 是否已由系统自动执行(恒为 false —— 不代执行资金,Property 4)。 */
  autoExecuted: boolean;
  /** 后端决策(恒为 user_confirmation,桌面端据此弹 `requireDesktopActionApproval`)。 */
  decision: 'user_confirmation';
  /** 决策原因码(审计用)。 */
  reason: string;
}

// ───────────────────────── 交易模拟/解读适配器(需求 10.2 / Property 8) ─────────────────────────

/** 待模拟的交易(只读模拟,不上链)。 */
export interface TransactionSimulationRequest {
  chain: string;
  from: string;
  to: string;
  /** 调用数据(calldata,hex)。 */
  data?: string;
  /** 随交易发送的原生币数量(wei,十进制字符串)。 */
  value?: string;
}

/** 模拟出的资产变动条目。 */
export interface SimulatedAssetChange {
  /** 资产标识(token 合约地址或 'native')。 */
  asset: string;
  symbol?: string;
  /** 方向:in(流入用户)/ out(流出用户)。 */
  direction: 'in' | 'out';
  /** 变动数量(十进制字符串原值;不可解析留空)。 */
  amount?: string;
}

/**
 * 交易模拟/解读结果(需求 10.2)。
 *
 * Property 8:适配器未配置/不可用时 `available=false`(explicit degraded),
 * **绝不伪造** assetChanges(留空)。
 */
export interface TransactionSimulationResult {
  /** 模拟是否可用且成功(占位适配器为 false)。 */
  available: boolean;
  /** 提供方标识('placeholder' / 'tenderly' / 'anvil-fork' …)。 */
  provider: string;
  /** 模拟出的资产变动(仅 available=true 时有意义;不编造)。 */
  assetChanges?: SimulatedAssetChange[];
  /** 目标合约风险解读(若可得)。 */
  targetContractRisk?: {
    verified?: boolean;
    flagged?: boolean;
    signals?: string[];
  };
  /** 人类可读摘要。 */
  summary: string;
  /** 备注(如「模拟适配器未配置」)。 */
  note?: string;
}

/**
 * 交易模拟器(可注入,待选 Tenderly / anvil fork;默认占位实现)。
 *
 * 实现约束(硬):
 *   1. **只读**:仅模拟,绝不上链/不签名/不转账。
 *   2. **不抛出**:任何失败归一为 `available:false` + `note`。
 *   3. **不编造**:不可用时不产出 assetChanges。
 */
export interface TransactionSimulator {
  /** 提供方稳定标识。 */
  readonly name: string;
  /** 只读模拟一笔交易。 */
  simulate(req: TransactionSimulationRequest): Promise<TransactionSimulationResult>;
}

/** 交易模拟器注入令牌。 */
export const TRANSACTION_SIMULATOR = Symbol('TRANSACTION_SIMULATOR');

// ───────────────────────── 骗局/风险检查(需求 10.3 / Property 8) ─────────────────────────

/** 检查标的类型。 */
export type ScamTargetKind = 'address' | 'contract' | 'domain';

/** 风险等级:safe(无信号)/ caution(可疑)/ danger(高危)/ unknown(情报不可得,显式)。 */
export type ScamRisk = 'safe' | 'caution' | 'danger' | 'unknown';

/** 骗局检查请求。 */
export interface ScamCheckRequest {
  kind: ScamTargetKind;
  /** 标的值(地址 / 合约地址 / 域名)。 */
  value: string;
  /** 链标识(address/contract 时可选)。 */
  chain?: string;
  userId?: string;
  agentId?: string;
}

/** 骗局检查结果(需求 10.3:给出明确提示)。 */
export interface ScamCheckResult {
  kind: ScamTargetKind;
  value: string;
  /** 综合风险等级。 */
  risk: ScamRisk;
  /** 触发的风险信号(可解释)。 */
  signals: string[];
  /** 面向用户的明确建议提示。 */
  advice: string;
  /** 参考来源(情报源 / 本地规则)。 */
  sources: string[];
  /** 检查时间(ISO 8601)。 */
  checkedAt: string;
}

/**
 * 骗局情报源(可注入;默认占位实现返回 `flagged:null` = 未知,explicit degraded)。
 *
 * 真实实现可接 Chainabuse / ScamSniffer / GoPlus 等只读情报 API;
 * 占位实现不臆造结论,SecurityGuard 据此与本地启发式规则合并判定。
 */
export interface ScamIntelProvider {
  readonly name: string;
  /**
   * 查询标的情报。`flagged`:
   *   - true  = 被标记为骗局/恶意;
   *   - false = 情报源明确未标记;
   *   - null  = 情报不可得(未知,不编造)。
   */
  lookup(req: ScamCheckRequest): Promise<{
    flagged: boolean | null;
    signals: string[];
    sources: string[];
  }>;
}

/** 骗局情报源注入令牌。 */
export const SCAM_INTEL_PROVIDER = Symbol('SCAM_INTEL_PROVIDER');
