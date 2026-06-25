import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  VersionColumn,
  Index,
} from 'typeorm';
import type {
  PlotSaleType,
  PlotListingStatus,
} from '../../../../shared/types/world-creation';

/**
 * PlotListing — 地块/体验在 Marketplace 的上架记录 (design §7.1, §12, R2.4 / R11.2)。
 *
 * 价格区间 0.01–999,999.99 USD 或 1–10,000,000 AXP。所有权转移复用 v5 两阶段提交
 * + 乐观锁 (@VersionColumn)。抽成：一级 5% / 二级 30% (R2.5 / R11.4)。
 * 仅原创者可首次上架 (saleType='first', R11.3)。
 *
 * 全局 SnakeNamingStrategy：列名自动派生，禁止手写 name。
 */
@Entity('plot_listings')
@Index(['plotId'])
@Index(['sellerAccountId'])
@Index(['status'])
export class PlotListing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 上架的 Plot (FK → world_plots.id)。 */
  @Column({ type: 'uuid' })
  plotId: string;

  /** 卖家 AgentAccount (FK → agent_accounts.id)。 */
  @Column({ type: 'uuid' })
  sellerAccountId: string;

  /** 标价 USD (0.01–999,999.99)，与 priceAxp 至少其一。 */
  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  priceUsd: string | null;

  /** 标价 AXP (1–10,000,000)。 */
  @Column({ type: 'bigint', nullable: true })
  priceAxp: string | null;

  /** 销售类型 — 决定平台抽成比例 (first=5% / secondary=30%)。 */
  @Column({ type: 'enum', enum: ['first', 'secondary'] })
  saleType: PlotSaleType;

  /** 上架生命周期状态。 */
  @Column({
    type: 'enum',
    enum: ['active', 'sold', 'cancelled', 'pending_review'],
    default: 'active',
  })
  status: PlotListingStatus;

  /** 乐观锁版本，支撑两阶段提交所有权转移 (design §7.1)。 */
  @VersionColumn()
  version: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
