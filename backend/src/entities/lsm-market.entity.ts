import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * LSM — 杠杆滚球预测市场盘口。
 * 由 KMarket 赔率采集源经 feed-bridge 同步而来（external_market_id 关联采集侧）。
 * 资金口径全程整数 AXP；本表仅承载盘口元信息与状态。
 */
export enum LsmMarketStatus {
  PRE = 'pre', // 赛前
  LIVE = 'live', // 滚球中
  SUSPENDED = 'suspended', // 暂停（赔率过期/采集中断）
  FINAL = 'final', // 已结束/已结算
  VOIDED = 'voided', // 取消/作废
}

@Entity('lsm_markets')
@Index(['status', 'kickoffAt'])
@Index(['league'])
export class LsmMarket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 采集侧（KMarket）盘口唯一标识，用于幂等 upsert 与赔率关联 */
  @Column({ type: 'varchar', length: 128 })
  @Index({ unique: true })
  externalMarketId: string;

  /** 赛事标识：同一场比赛的多个盘口共享，用于风控单赛事聚合敞口。默认=externalMarketId（1:1） */
  @Column({ type: 'varchar', length: 128, nullable: true })
  @Index()
  eventId: string | null;

  @Column({ type: 'varchar', length: 64, default: 'soccer' })
  sport: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  league: string | null;

  @Column({ type: 'varchar', length: 128 })
  homeTeam: string;

  @Column({ type: 'varchar', length: 128 })
  awayTeam: string;

  /** 结果数量 K：2-way（胜负）/ 3-way（1X2 含平局），数据驱动不写死 */
  @Column({ type: 'int', default: 2 })
  outcomeCount: number;

  @Column({ type: 'enum', enum: LsmMarketStatus, default: LsmMarketStatus.PRE })
  @Index()
  status: LsmMarketStatus;

  @Column({ type: 'timestamptz', nullable: true })
  kickoffAt: Date | null;

  /** 最近一次有效赔率时间，用于 odds_stale 判定 */
  @Column({ type: 'timestamptz', nullable: true })
  lastOddsAt: Date | null;

  /** 结算获胜结果序号（0=home,1=away,2=draw）；未结算为 null */
  @Column({ type: 'int', nullable: true })
  winningOutcomeIdx: number | null;

  /** 主队比分（来自 KMarket，live/final 展示用）；未知为 null */
  @Column({ type: 'int', nullable: true })
  homeScore: number | null;

  /** 客队比分（来自 KMarket，live/final 展示用）；未知为 null */
  @Column({ type: 'int', nullable: true })
  awayScore: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
