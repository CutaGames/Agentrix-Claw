import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * LSM 盘口承接绑定（P3 承接路由结果）。
 * 同一盘口可有多行（多金库按比例分摊）；allocBps 合计 = 10000。
 * 官方金库始终兜底剩余比例。
 */
@Entity('lsm_market_house')
@Index(['marketId'])
export class LsmMarketHouse {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  marketId: string;

  @Column({ type: 'uuid' })
  @Index()
  vaultId: string;

  /** 该金库承接本盘口的比例（bps），同盘所有行合计 10000 */
  @Column({ type: 'int' })
  allocBps: number;

  @CreateDateColumn({ type: 'timestamptz' })
  assignedAt: Date;
}
