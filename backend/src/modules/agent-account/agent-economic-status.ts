/**
 * 前台可信展示(H 组)— Agent 经济身份「真实状态」枚举与派生
 *
 * 需求 7.25、design C1「前台(H 组)」:
 *   Agent 详情 SHALL 展示钱包/限额/信用/链上身份/能力的**真实状态**,
 *   未落地项标「未启用(not_enabled)」而非空占位误导,且与后端字段一致。
 *
 * 本模块只承载**从 `AgentAccount` 真实字段派生状态**的纯逻辑(无 I/O),
 * 保证前台展示与后端持久化字段一一对应,不出现「空占位」。
 */

import { AgentAccount, AgentRiskLevel } from '../../entities/agent-account.entity';

/**
 * 单项能力的真实状态枚举。
 *  - `enabled`     已落地且生效(后端字段已就绪);
 *  - `not_enabled` 未启用(后端无对应数据 / 未配置)—— 显式「未启用」,非空占位;
 *  - `failed`      曾尝试启用但失败(后端记录了失败标记,如链上注册降级)。
 */
export type EconomicCapabilityStatus = 'enabled' | 'not_enabled' | 'failed';

/** Agent 经济身份各维度的真实状态 + 关键派生字段。 */
export interface AgentEconomicIdentityStatus {
  /** 钱包(MPC 托管 / 外部非托管)。 */
  wallet: {
    status: EconomicCapabilityStatus;
    type: 'mpc' | 'external' | 'none';
    mpcWalletId?: string;
    externalWalletAddress?: string;
  };
  /** 支出限额(单笔/日/月)。 */
  limit: {
    status: EconomicCapabilityStatus;
    dailyLimit?: number;
    monthlyLimit?: number;
    singleTxLimit?: number;
    currency?: string;
    usedTodayAmount: number;
    usedMonthAmount: number;
  };
  /** 信用评分。 */
  credit: {
    status: EconomicCapabilityStatus;
    creditScore: number;
    riskLevel: AgentRiskLevel;
    creditScoreUpdatedAt?: string;
  };
  /** 链上身份(ERC-8004 + EAS)。 */
  onchain: {
    status: EconomicCapabilityStatus;
    erc8004SessionId?: string;
    easAttestationUid?: string;
    chain?: string;
    sessionActive: boolean;
  };
  /** 能力声明(MCP tools,G 组单一权威来源)。 */
  capabilities: {
    status: EconomicCapabilityStatus;
    declared: string[];
    count: number;
  };
}

/** 约定的 metadata 失败标记键(链上注册降级时由 onchain identity service 写入)。 */
function readFailureFlag(metadata: Record<string, any> | undefined, key: string): boolean {
  if (!metadata) return false;
  const onchain = metadata.onchainIdentity;
  if (onchain && (onchain.status === 'failed' || onchain.failed === true)) return true;
  return metadata[key] === true || metadata[key] === 'failed';
}

/**
 * 从 `AgentAccount` 的真实字段派生各维度状态。
 *
 * 纯函数:仅依据实体已持久化的字段判定,不做任何远程查询,
 * 因此前台拿到的状态与后端字段严格一致(无空占位、无伪装)。
 */
export function deriveEconomicIdentityStatus(agent: AgentAccount): AgentEconomicIdentityStatus {
  // ===== 钱包 =====
  const hasMpc = !!agent.mpcWalletId;
  const hasExternal = !!agent.externalWalletAddress;
  const walletFailed = readFailureFlag(agent.metadata, 'walletBindingFailed');
  const walletStatus: EconomicCapabilityStatus = hasMpc || hasExternal
    ? 'enabled'
    : walletFailed
      ? 'failed'
      : 'not_enabled';

  // ===== 限额 =====
  const limits = agent.spendingLimits;
  const hasLimits = !!limits
    && (Number(limits.dailyLimit) > 0 || Number(limits.monthlyLimit) > 0 || Number(limits.singleTxLimit) > 0);

  // ===== 信用 =====
  // 信用自动更新(任务 4)已落地:creditScoreUpdatedAt 有值表示已被真实评分;
  // 否则仍为默认初始分 → 标「未启用」,避免把默认值误导成已评估。
  const creditEnabled = !!agent.creditScoreUpdatedAt;

  // ===== 链上身份 =====
  const hasOnchain = !!(agent.erc8004SessionId || agent.easAttestationUid);
  const onchainFailed = readFailureFlag(agent.metadata, 'onchainRegistrationFailed');
  const sessionActive = hasOnchain && agent.sessionExpiry ? agent.sessionExpiry > new Date() : false;
  const onchainStatus: EconomicCapabilityStatus = hasOnchain
    ? 'enabled'
    : onchainFailed
      ? 'failed'
      : 'not_enabled';

  // ===== 能力声明 =====
  const declared = Array.isArray(agent.capabilities) ? agent.capabilities : [];

  return {
    wallet: {
      status: walletStatus,
      type: hasMpc ? 'mpc' : hasExternal ? 'external' : 'none',
      mpcWalletId: agent.mpcWalletId || undefined,
      externalWalletAddress: agent.externalWalletAddress || undefined,
    },
    limit: {
      status: hasLimits ? 'enabled' : 'not_enabled',
      dailyLimit: limits?.dailyLimit,
      monthlyLimit: limits?.monthlyLimit,
      singleTxLimit: limits?.singleTxLimit,
      currency: limits?.currency,
      usedTodayAmount: Number(agent.usedTodayAmount ?? 0),
      usedMonthAmount: Number(agent.usedMonthAmount ?? 0),
    },
    credit: {
      status: creditEnabled ? 'enabled' : 'not_enabled',
      creditScore: Number(agent.creditScore ?? 0),
      riskLevel: agent.riskLevel,
      creditScoreUpdatedAt: agent.creditScoreUpdatedAt?.toISOString(),
    },
    onchain: {
      status: onchainStatus,
      erc8004SessionId: agent.erc8004SessionId || undefined,
      easAttestationUid: agent.easAttestationUid || undefined,
      chain: agent.registrationChain || undefined,
      sessionActive,
    },
    capabilities: {
      status: declared.length > 0 ? 'enabled' : 'not_enabled',
      declared,
      count: declared.length,
    },
  };
}
