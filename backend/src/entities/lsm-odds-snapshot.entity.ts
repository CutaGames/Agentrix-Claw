import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * LSM — 盘口某结果(outcome)的赔率快照，由 feed-bridge 落地。
 * 公允赔率(decimal)，成交时按 pricing 施加 edge 得到可成交赔率。
 */
@Entity('lsm_odds_snapshots')
@Index(['marketId', 'outcomeIdx', 'ts'])
export class LsmOddsSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  marketId: string;

  /** 结果序号：0=home,1=away,2=draw */
  @Column({ type: 'int' })
  outcomeIdx: number;

  /** 公允赔率（小数制，如 1.85） */
  @Column({ type: 'decimal', precision: 12, scale: 4 })
  fairOdds: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  source: string | null;

  @Column({ type: 'timestamptz' })
  @Index()
  ts: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
