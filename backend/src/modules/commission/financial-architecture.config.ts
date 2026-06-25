import { AssetType } from '../../entities/order.entity';

export interface SettlementTimelineConfig {
  trigger: string;
  triggerDescription: string;
  lockupDays: number | 'instant' | 'upstream';
  payoutDescription: string;
  autoConfirm?: string;
  autoFallbackDays?: number;
  autoFallbackDescription?: string;
}

export interface RateComputationContext {
  poolRateOverride?: number;
  baseRateOverride?: number;
  upstreamCommissionRate?: number;
  swapFeeRate?: number;
}

export interface AssetRateConfig {
  assetType: AssetType;
  label: string;
  baseRate: number;
  poolRate: number;
  minPoolRate?: number;
  maxPoolRate?: number;
  dynamic?: 'virtual_band' | 'web2_upstream' | 'web3_fee';
  developerSplit?: {
    developer: number;
    agent: number; // 简化为单层 Agent
    paymind: number;
  };
}

export interface FinancialProfile {
  rates: AssetRateConfig;
  settlement: SettlementTimelineConfig;
}

export const SYSTEM_REBATE_POOL_ID = 'system_rebate_pool';
export const PROMOTER_SHARE_OF_BASE = 0.2;

// V5.0: Agent 分佣比例 (执行:推荐 = 7:3)
export const EXECUTOR_SHARE_OF_POOL = 0.7;
export const REFERRER_SHARE_OF_POOL = 0.3;

// V5.0: 扫描商品用户额外费用
export const SCANNED_UCP_FEE_RATE = 0.01;    // 1%
export const SCANNED_X402_FEE_RATE = 0.01;   // 1%
export const SCANNED_FT_FEE_RATE = 0.003;    // 0.3%
export const SCANNED_NFT_FEE_RATE = 0.003;   // 0.3%

// V5.0: X402 通道费 (可配置，默认0%，后续可调整为0.3%)
export const X402_CHANNEL_FEE_RATE_DEFAULT = 0;

// ── Pet Earning Flywheel（需求 9 统一抽佣 + 需求 4 裂变）──
// 拉新返佣率：被邀人 GMV 的固定 2%（以 AXP 发给邀请人），单一来源。
export const REFERRAL_GMV_RATE = 0.02;
// 拉新双边一次性奖励（AXP）。
export const REFERRAL_SIGNUP_INVITER = 200;
export const REFERRAL_SIGNUP_INVITEE = 200;

/**
 * 命名费率档（不属于 AssetType 枚举的赚钱线，收敛游离硬编码费率到单一来源）。
 * base+pool=平台总费率；pool 再按 EXECUTOR/REFERRER_SHARE_OF_POOL 分。
 * - creation：创作打赏/解锁/购买，平台抽 5%（从“无显式抽成”确立）。
 * - agent_hire：multi-agent 雇佣，平台抽 10%（从游离硬编码 30% 下调，已定）。
 */
export const NAMED_FEE_PROFILES: Record<
  string,
  { label: string; baseRate: number; poolRate: number }
> = {
  creation: { label: '创作', baseRate: 0.02, poolRate: 0.03 }, // 合计 5%
  agent_hire: { label: 'Agent 雇佣', baseRate: 0.04, poolRate: 0.06 }, // 合计 10%（原 30%）
};

export const FINANCIAL_PROFILES: Record<AssetType, FinancialProfile> = {
  [AssetType.PHYSICAL]: {
    rates: {
      assetType: AssetType.PHYSICAL,
      label: '实物商品',
      baseRate: 0.005, // 0.5% 平台费
      poolRate: 0.025, // 2.5% 激励池 (V4.1)
    },
    settlement: {
      trigger: 'logistics_confirmation',
      triggerDescription: '用户点击确认收货 或 物流签收事件',
      lockupDays: 7,
      payoutDescription: 'T + 7 天 00:00 释放资金',
      autoConfirm: '发货 30 天无更新 → 视为 T，开始倒计时',
      autoFallbackDays: 37,
      autoFallbackDescription: '最长锁定 37 天后强制结算，避免长期占用托管',
    },
  },
  [AssetType.SERVICE]: {
    rates: {
      assetType: AssetType.SERVICE,
      label: '服务类',
      baseRate: 0.01, // 1.0% 平台费
      poolRate: 0.04, // 4.0% 激励池 (V4.1)
    },
    settlement: {
      trigger: 'service_completed',
      triggerDescription: '服务单标记 Completed / 客户确认完成',
      lockupDays: 3,
      payoutDescription: 'T + 3 天 00:00 释放资金',
      autoConfirm: '开工 7 天仍未标记完成 → 需人工介入',
    },
  },
  [AssetType.VIRTUAL]: {
    rates: {
      assetType: AssetType.VIRTUAL,
      label: '虚拟资产 / 数字商品',
      baseRate: 0.005, // 0.5% 平台费
      poolRate: 0.025, // 2.5% 激励池 (V4.1)
      minPoolRate: 0.02,
      maxPoolRate: 0.04,
      dynamic: 'virtual_band',
    },
    settlement: {
      trigger: 'onchain_confirmation',
      triggerDescription: '链上确认 > 12 或卡密发放成功',
      lockupDays: 1,
      payoutDescription: 'T + 1 天 00:00',
    },
  },
  [AssetType.NFT_RWA]: {
    rates: {
      assetType: AssetType.NFT_RWA,
      label: 'NFT / RWA',
      baseRate: 0.005, // 0.5% 平台费
      poolRate: 0.02, // 2.0% 激励池 (V4.1)
    },
    settlement: {
      trigger: 'tx_success',
      triggerDescription: 'NFT/RWA 转移成功 (Tx Success)',
      lockupDays: 1,
      payoutDescription: 'T + 1 天 00:00',
    },
  },
  [AssetType.DEV_TOOL]: {
    rates: {
      assetType: AssetType.DEV_TOOL,
      label: '开发者工具 / 插件技能 (COMPOSITE)',
      baseRate: 0.03, // 3.0% 平台费 (V5.0)
      poolRate: 0.07, // 7.0% 激励池 (V5.0)
    },
    settlement: {
      trigger: 'payment_success',
      triggerDescription: '支付成功即视为履约完成',
      lockupDays: 'instant',
      payoutDescription: '即时释放',
    },
  },
  [AssetType.AGGREGATED_WEB2]: {
    rates: {
      assetType: AssetType.AGGREGATED_WEB2,
      label: '聚合 Web2 电商',
      baseRate: 0.2,
      poolRate: 0.8,
      dynamic: 'web2_upstream',
    },
    settlement: {
      trigger: 'upstream_statement',
      triggerDescription: '上游联盟平台标记 “已结算”',
      lockupDays: 'upstream',
      payoutDescription: '跟随上游，默认 Net30 / Net60',
      autoConfirm: '上游到账后 T + 1 日内向 Agent/平台分发',
    },
  },
  [AssetType.AGGREGATED_WEB3]: {
    rates: {
      assetType: AssetType.AGGREGATED_WEB3,
      label: '聚合 Web3 DEX',
      baseRate: 0.3,
      poolRate: 0.7,
      dynamic: 'web3_fee',
    },
    settlement: {
      trigger: 'swap_fee_realised',
      triggerDescription: 'Swap 手续费确认',
      lockupDays: 1,
      payoutDescription: '即时或 T + 1 天释放',
    },
  },
  [AssetType.SUBSCRIPTION]: {
    rates: {
      assetType: AssetType.SUBSCRIPTION,
      label: '订阅服务',
      baseRate: 0.005,
      poolRate: 0.025,
    },
    settlement: {
      trigger: 'periodic_renewal',
      triggerDescription: '订阅成功或续费成功',
      lockupDays: 3,
      payoutDescription: 'T + 3 天 00:00',
    },
  },
  [AssetType.OTHER]: {
    rates: {
      assetType: AssetType.OTHER,
      label: '其他',
      baseRate: 0.005,
      poolRate: 0.025,
    },
    settlement: {
      trigger: 'manual_confirmation',
      triggerDescription: '人工确认或超时确权',
      lockupDays: 1,
      payoutDescription: 'T + 1 天 00:00',
    },
  },
};

export function resolveRates(
  assetType: AssetType,
  ctx: RateComputationContext = {},
): { baseRate: number; poolRate: number } {
  const profile = FINANCIAL_PROFILES[assetType];
  if (!profile) {
    return { baseRate: 0.01, poolRate: 0.02 };
  }

  if (ctx.baseRateOverride || ctx.poolRateOverride) {
    return {
      baseRate: ctx.baseRateOverride ?? profile.rates.baseRate,
      poolRate: ctx.poolRateOverride ?? profile.rates.poolRate,
    };
  }

  switch (profile.rates.dynamic) {
    case 'virtual_band': {
      const desired = ctx.poolRateOverride ?? profile.rates.poolRate;
      const poolRate = Math.min(
        profile.rates.maxPoolRate ?? desired,
        Math.max(profile.rates.minPoolRate ?? desired, desired),
      );
      return { baseRate: profile.rates.baseRate, poolRate };
    }
    case 'web2_upstream': {
      const upstreamRate = ctx.upstreamCommissionRate ?? 0.04;
      return {
        baseRate: upstreamRate * profile.rates.baseRate,
        poolRate: upstreamRate * profile.rates.poolRate,
      };
    }
    case 'web3_fee': {
      const feeRate = ctx.swapFeeRate ?? 0.003; // 0.3%
      return {
        baseRate: feeRate * profile.rates.baseRate,
        poolRate: feeRate * profile.rates.poolRate,
      };
    }
    default:
      return { baseRate: profile.rates.baseRate, poolRate: profile.rates.poolRate };
  }
}

export function getSettlementConfig(assetType: AssetType): SettlementTimelineConfig {
  return FINANCIAL_PROFILES[assetType]?.settlement;
}

