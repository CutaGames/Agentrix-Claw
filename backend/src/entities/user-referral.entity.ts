import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

/**
 * UserReferral — C 端拉新关系（Pet Earning Flywheel 需求 4）。
 *
 * 一个被邀人只归属一个邀请人（首次归因，unique on inviteeUserId）。
 * 与既有 MerchantReferral（Agent 推广商家）不同：这是用户→用户的拉新裂变，
 * 触发 referral_signup 双边 AXP 奖励 + referral_gmv_pct 成交返佣。
 */
@Entity({ name: 'user_referrals' })
@Index(['inviterUserId'])
@Index(['inviteeUserId'], { unique: true })
export class UserReferral {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** 邀请人 user id */
  @Column('uuid')
  inviterUserId!: string;

  /** 被邀人 user id（唯一：一人只归属一个邀请人） */
  @Column('uuid')
  inviteeUserId!: string;

  /** 来源短码（ReferralLinkEntity.shortCode），用于回写转化统计 */
  @Column({ type: 'varchar', length: 32, nullable: true })
  shortCode?: string | null;

  /** 渠道（分享场景：海报/链接/二维码…） */
  @Column({ type: 'varchar', length: 32, nullable: true })
  channel?: string | null;

  /** 注册双边奖励是否已发（与 AXP refId 幂等互为双保险） */
  @Column({ type: 'boolean', default: false })
  signupRewarded!: boolean;

  /** 已发放的 GMV 返佣累计（AXP，统计用） */
  @Column({ type: 'bigint', default: 0 })
  gmvRewardedAxp!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
