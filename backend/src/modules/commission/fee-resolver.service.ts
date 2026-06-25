import { Injectable } from '@nestjs/common';
import { AssetType } from '../../entities/order.entity';
import {
  resolveRates,
  RateComputationContext,
  NAMED_FEE_PROFILES,
  EXECUTOR_SHARE_OF_POOL,
  REFERRER_SHARE_OF_POOL,
  REFERRAL_GMV_RATE,
  REFERRAL_SIGNUP_INVITER,
  REFERRAL_SIGNUP_INVITEE,
} from './financial-architecture.config';

export interface PlatformFeeBreakdown {
  /** 平台净抽佣率 */
  baseRate: number;
  /** 激励/分销池率 */
  poolRate: number;
  /** 平台净抽佣金额 = gmv * baseRate */
  platformFee: number;
  /** 激励池金额 = gmv * poolRate */
  poolAmount: number;
  /** 执行方分得（池 * 0.7） */
  executorShare: number;
  /** 推荐方分得（池 * 0.3） */
  referrerShare: number;
  /** 卖家净收入 = gmv - platformFee - poolAmount */
  sellerNet: number;
}

export interface ResolveFeeParams {
  /** 二选一：按 AssetType（走 FINANCIAL_PROFILES.resolveRates）或按命名类别（NAMED_FEE_PROFILES）。 */
  assetType?: AssetType;
  category?: string;
  gmv: number;
  ctx?: RateComputationContext;
}

/**
 * FeeResolverService — 全平台抽佣/分成的**唯一解析入口**（需求 9 统一抽佣口径）。
 *
 * 所有赚钱线计算平台抽佣/激励池/推荐分成都应调用本服务，不得在业务代码内
 * 新增硬编码费率常量。费率单一来源 = `financial-architecture.config.ts`
 * （AssetType 走 resolveRates；其余赚钱线走 NAMED_FEE_PROFILES）。
 */
@Injectable()
export class FeeResolverService {
  /**
   * 解析一笔成交的平台费拆分。category 优先于 assetType。
   */
  resolvePlatformFee(params: ResolveFeeParams): PlatformFeeBreakdown {
    const { gmv, category, assetType, ctx } = params;

    let baseRate: number;
    let poolRate: number;
    if (category && NAMED_FEE_PROFILES[category]) {
      baseRate = NAMED_FEE_PROFILES[category].baseRate;
      poolRate = NAMED_FEE_PROFILES[category].poolRate;
    } else if (assetType) {
      const r = resolveRates(assetType, ctx ?? {});
      baseRate = r.baseRate;
      poolRate = r.poolRate;
    } else {
      // 兜底：与 resolveRates 未知类型一致
      baseRate = 0.01;
      poolRate = 0.02;
    }

    const safeGmv = Number.isFinite(gmv) && gmv > 0 ? gmv : 0;
    const platformFee = safeGmv * baseRate;
    const poolAmount = safeGmv * poolRate;
    const executorShare = poolAmount * EXECUTOR_SHARE_OF_POOL;
    const referrerShare = poolAmount * REFERRER_SHARE_OF_POOL;
    const sellerNet = safeGmv - platformFee - poolAmount;

    return {
      baseRate,
      poolRate,
      platformFee,
      poolAmount,
      executorShare,
      referrerShare,
      sellerNet,
    };
  }

  /** 拉新返佣金额（被邀人 GMV 的固定 2%）。需求 4。 */
  resolveReferralGmv(gmv: number): number {
    const safeGmv = Number.isFinite(gmv) && gmv > 0 ? gmv : 0;
    return safeGmv * REFERRAL_GMV_RATE;
  }

  /** 拉新返佣率（用于展示/文案）。 */
  referralGmvRate(): number {
    return REFERRAL_GMV_RATE;
  }

  /** 邀请人一次性奖励 AXP。 */
  referralSignupInviter(): number {
    return REFERRAL_SIGNUP_INVITER;
  }

  /** 被邀人一次性奖励 AXP。 */
  referralSignupInvitee(): number {
    return REFERRAL_SIGNUP_INVITEE;
  }
}
