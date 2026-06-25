import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export type PredictionStatus = 'open' | 'locked' | 'settled' | 'cancelled';

/** 一个预测选项(如"巴西胜"/"平"/"阿根廷胜")。 */
export interface PredictionOption {
  id: string;
  label: string;
}

/**
 * PredictionMarketEntity — 事件预测市场(parimutuel 彩池;如世界杯赛果)。
 *
 * 模型:**parimutuel(平分彩池)**——无固定赔率、平台不承担庄家风险。所有下注汇入按选项
 * 分桶的彩池;结算时命中选项的下注者按"个人下注/命中选项总下注 × (总彩池×(1-rake))"瓜分。
 * 货币为 AXP(实用积分)。结算需管理员/裁决(oracle),见 PredictionService。
 * 合规:不同地区对"竞猜/博彩"监管不同;上线前需法务确认并做地区门控 + 广告/年龄合规。
 */
@Entity('prediction_markets')
@Index(['status'])
@Index(['category'])
export class PredictionMarketEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  /** 分类(如 worldcup / esports / crypto / custom),用于前台分组。 */
  @Column({ type: 'varchar', length: 40, default: 'custom' })
  category: string;

  /** 可选副标题/说明。 */
  @Column({ type: 'varchar', length: 400, nullable: true })
  subtitle: string | null;

  /** 选项集合。 */
  @Column({ type: 'jsonb' })
  options: PredictionOption[];

  @Column({ type: 'varchar', length: 16, default: 'open' })
  status: PredictionStatus;

  /** 命中选项 id(settled 时写)。 */
  @Column({ type: 'varchar', length: 64, nullable: true })
  winningOptionId: string | null;

  /** 各选项累计下注额(AXP)。{ [optionId]: total } */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  poolByOption: Record<string, number>;

  /** 总彩池(AXP)。 */
  @Column({ type: 'integer', default: 0 })
  totalPool: number;

  /** 平台抽成(基点;500 = 5%)。 */
  @Column({ type: 'integer', default: 500 })
  rakeBps: number;

  /** 截止下注时间(到点后应 lock);可空表示手动锁。 */
  @Column({ type: 'timestamptz', nullable: true })
  locksAt: Date | null;

  /** 创建者用户 id(运营/管理员)。 */
  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  settledAt: Date | null;
}
