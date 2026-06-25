import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserReferral } from '../../entities/user-referral.entity';
import { AxpService } from '../axp/axp.service';
import { FeeResolverService } from '../commission/fee-resolver.service';
import { ReferralLinkService } from './referral-link.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SignupAttributionResult {
  attributed: boolean;
  reason?: string;
  relationId?: string;
  inviterUserId?: string;
  alreadyExisted?: boolean;
}

export interface GmvRewardResult {
  rewarded: boolean;
  reason?: string;
  inviterUserId?: string;
  axpReward?: number;
}

/**
 * ReferralFlywheelService — C 端拉新裂变（Pet Earning Flywheel 需求 4）。
 *
 * onSignup：新用户经深链(ref)注册 → 建 user_referrals 关系（幂等）+ 双边各 200 AXP
 *           （referral_signup，refId=关系 id / 关系 id:invitee，AXP 层精确一次）。
 * onInviteeGmv：被邀人集市成交 → 邀请人得 GMV×2% 作为 AXP 积分奖励
 *           （referral_gmv_pct，refId=成交单 id，幂等）。AXP 为平台积分、无法币定价，
 *           返佣 = 成交额数值的 2% 直接作为 AXP 点数（不含任何法币估值）。
 */
@Injectable()
export class ReferralFlywheelService {
  private readonly logger = new Logger(ReferralFlywheelService.name);

  constructor(
    @InjectRepository(UserReferral)
    private readonly repo: Repository<UserReferral>,
    private readonly axp: AxpService,
    private readonly fees: FeeResolverService,
    private readonly linkService: ReferralLinkService,
  ) {}

  /** 解析 ref：uuid → 直接 inviterId；否则当作 shortCode 查 link.ownerId。 */
  private async resolveInviter(ref: string): Promise<{ inviterUserId?: string; shortCode?: string }> {
    if (!ref) return {};
    if (UUID_RE.test(ref)) return { inviterUserId: ref };
    try {
      const link = await this.linkService.getLinkByShortCode(ref);
      if (link?.ownerId) return { inviterUserId: link.ownerId, shortCode: ref };
    } catch (e) {
      this.logger.warn(`resolveInviter shortCode=${ref} failed: ${(e as Error).message}`);
    }
    return {};
  }

  async onSignup(
    inviteeUserId: string,
    ref: string,
    channel?: string,
  ): Promise<SignupAttributionResult> {
    if (!inviteeUserId || !ref) return { attributed: false, reason: 'missing inviteeUserId or ref' };

    const { inviterUserId, shortCode } = await this.resolveInviter(ref);
    if (!inviterUserId) return { attributed: false, reason: 'unresolved ref' };
    if (inviterUserId === inviteeUserId) return { attributed: false, reason: 'self-referral' };

    // 首次归因：被邀人只能归属一个邀请人（unique on invitee）。
    const existing = await this.repo.findOne({ where: { inviteeUserId } });
    if (existing) {
      return {
        attributed: true,
        alreadyExisted: true,
        relationId: existing.id,
        inviterUserId: existing.inviterUserId,
      };
    }

    let relation: UserReferral;
    try {
      relation = await this.repo.save(
        this.repo.create({ inviterUserId, inviteeUserId, shortCode: shortCode ?? null, channel: channel ?? null }),
      );
    } catch (e: any) {
      if (e?.code === '23505') {
        const r = await this.repo.findOne({ where: { inviteeUserId } });
        return { attributed: true, alreadyExisted: true, relationId: r?.id, inviterUserId: r?.inviterUserId };
      }
      throw e;
    }

    // 双边一次性奖励（AXP 层以 refId 精确一次，重复回调不双发）。
    const inviterAxp = this.fees.referralSignupInviter();
    const inviteeAxp = this.fees.referralSignupInvitee();
    try {
      await this.axp.earn({ userId: inviterUserId, source: 'referral_signup', amount: inviterAxp, refId: relation.id, note: 'referral signup (inviter)' });
      await this.axp.earn({ userId: inviteeUserId, source: 'referral_signup', amount: inviteeAxp, refId: `${relation.id}:invitee`, note: 'referral signup (invitee)' });
      relation.signupRewarded = true;
      await this.repo.save(relation);
    } catch (e) {
      this.logger.warn(`signup reward failed relation=${relation.id}: ${(e as Error).message}`);
    }

    if (shortCode) {
      try { await this.linkService.recordConversion(shortCode); } catch { /* non-blocking */ }
    }

    return { attributed: true, relationId: relation.id, inviterUserId };
  }

  async onInviteeGmv(inviteeUserId: string, orderId: string, gmv: number): Promise<GmvRewardResult> {
    if (!inviteeUserId || !orderId) return { rewarded: false, reason: 'missing args' };
    const relation = await this.repo.findOne({ where: { inviteeUserId } });
    if (!relation) return { rewarded: false, reason: 'no referral relation' };

    // 返佣 = 成交额数值的 2%，直接作为 AXP 积分（无法币定价/估值）。
    const axpReward = Math.round(this.fees.resolveReferralGmv(gmv));
    if (axpReward <= 0) return { rewarded: false, reason: 'reward rounds to 0' };

    try {
      await this.axp.earn({
        userId: relation.inviterUserId,
        source: 'referral_gmv_pct',
        amount: axpReward,
        refId: orderId, // 幂等：同一成交单只返一次
        note: `referral GMV ${gmv} → ${axpReward} AXP`,
      });
      relation.gmvRewardedAxp = String(Number(relation.gmvRewardedAxp) + axpReward);
      await this.repo.save(relation);
    } catch (e) {
      this.logger.warn(`gmv reward failed relation=${relation.id} order=${orderId}: ${(e as Error).message}`);
      return { rewarded: false, reason: 'earn failed' };
    }
    return { rewarded: true, inviterUserId: relation.inviterUserId, axpReward };
  }

  /** 我的拉新战绩。 */
  async getMyFlywheel(userId: string): Promise<{
    invited: number;
    rewardedSignups: number;
    totalGmvRewardAxp: number;
  }> {
    const rows = await this.repo.find({ where: { inviterUserId: userId } });
    return {
      invited: rows.length,
      rewardedSignups: rows.filter((r) => r.signupRewarded).length,
      totalGmvRewardAxp: rows.reduce((s, r) => s + Number(r.gmvRewardedAxp), 0),
    };
  }
}
