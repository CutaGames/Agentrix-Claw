import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum ReferralLinkType {
  GENERAL = 'general',       // 通用推广链接
  PRODUCT = 'product',       // 商品级推广链接
  SKILL = 'skill',           // Skill 推广链接
  CAMPAIGN = 'campaign',     // 活动推广链接
}

export enum ReferralLinkStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  EXPIRED = 'expired',
  ARCHIVED = 'archived',
}

@Entity('referral_links')
@Index(['ownerId', 'type'])
@Index(['shortCode'], { unique: true })
export class ReferralLinkEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  ownerId: string;  // 推广者 ID (user/agent)

  @Column({ length: 16 })
  @Index()
  shortCode: string;  // 短链码，如 "a3x9kf"

  @Column({
    type: 'enum',
    enum: ReferralLinkType,
    default: ReferralLinkType.GENERAL,
  })
  type: ReferralLinkType;

  @Column({
    type: 'enum',
    enum: ReferralLinkStatus,
    default: ReferralLinkStatus.ACTIVE,
  })
  status: ReferralLinkStatus;

  @Column({ nullable: true })
  title?: string;  // 推广链接标题/备注

  @Column({ nullable: true })
  targetId?: string;  // 目标 ID（商品/Skill/活动 ID）

  @Column({ nullable: true })
  targetType?: string;  // 目标类型 ('product' | 'skill' | 'campaign')

  @Column({ nullable: true })
  targetName?: string;  // 目标名称（冗余存储，方便展示）

  @Column({ type: 'text', nullable: true })
  fullUrl?: string;  // 完整推广 URL

  @Column({ nullable: true })
  channel?: string;  // 推广渠道 ('twitter' | 'telegram' | 'wechat' | 'direct' | ...)

  @Column({ type: 'int', default: 0 })
  clicks: number;  // 点击次数

  @Column({ type: 'int', default: 0 })
  uniqueClicks: number;  // 独立访客点击

  @Column({ type: 'int', default: 0 })
  conversions: number;  // 转化次数（注册/购买）

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  totalCommission: number;  // 通过此链接产生的累计佣金

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  totalGMV: number;  // 通过此链接产生的累计 GMV

  @Column({ nullable: true })
  splitPlanId?: string;  // 关联的分佣计划 ID

  @Column({ nullable: true })
  expiresAt?: Date;  // 过期时间（null = 永不过期）

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;  // 额外信息（UTM参数、自定义标签等）

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
