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
    recommendation: number;
    execution: number;
    agentrix: number;
  };
}

export interface FinancialProfile {
  rates: AssetRateConfig;
  settlement: SettlementTimelineConfig;
}

export const SYSTEM_REBATE_POOL_ID = 'system_rebate_pool';
export const PROMOTER_SHARE_OF_BASE = 0.2;

export const FINANCIAL_PROFILES: Record<AssetType, FinancialProfile> = {
  [AssetType.PHYSICAL]: {
    rates: {
      assetType: AssetType.PHYSICAL,
      label: '实物商品',
      baseRate: 0.005,
      poolRate: 0.025,
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
      baseRate: 0.01,
      poolRate: 0.04,
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
      baseRate: 0.01,
      poolRate: 0.03,
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
      baseRate: 0.01,
      poolRate: 0.015,
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
      label: '开发者工具',
      baseRate: 0.05,
      poolRate: 0.95,
      developerSplit: {
        developer: 0.8,
        recommendation: 0.1,
        execution: 0.05,
        agentrix: 0.05,
      },
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

