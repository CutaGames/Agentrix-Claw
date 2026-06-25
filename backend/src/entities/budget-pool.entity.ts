import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { SplitPlan } from './split-plan.entity';
import { Milestone } from './milestone.entity';

export enum BudgetPoolStatus {
  DRAFT = 'draft',
  FUNDED = 'funded',
  ACTIVE = 'active',
  DEPLETED = 'depleted',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

export enum FundingSource {
  PAYMENT = 'payment',
  WALLET = 'wallet',
  CREDIT = 'credit',
}

/**
 * BudgetPool Entity - 预算池
 * 
 * 用于多 Agent 协作项目的资金托管和分阶段释放
 */
@Entity('budget_pools')
@Index(['ownerId', 'status'])
@Index(['projectId'])
export class BudgetPool {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 预算池名称 */
  @Column({ length: 200 })
  name: string;

  /** 描述 */
  @Column({ type: 'text', nullable: true })
  description: string;

  /** 关联的项目ID (可选) */
  @Column({ type: 'varchar', length: 100, nullable: true })
  projectId: string;

  /** 总预算 (微单位) */
  @Column({ type: 'bigint', default: 0 })
  totalBudget: string;

  /** 已充值金额 */
  @Column({ type: 'bigint', default: 0 })
  fundedAmount: string;

  /** 已预留金额 (给子任务/里程碑) */
  @Column({ type: 'bigint', default: 0 })
  reservedAmount: string;

  /** 已释放金额 */
  @Column({ type: 'bigint', default: 0 })
  releasedAmount: string;

  /** 币种 */
  @Column({ length: 10, default: 'USDC' })
  currency: string;

  /** 资金来源 */
  @Column({
    type: 'enum',
    enum: FundingSource,
    default: FundingSource.WALLET,
  })
  fundingSource: FundingSource;

  /** 关联的分佣计划ID */
  @Column({ type: 'uuid', nullable: true })
  splitPlanId: string;

  @ManyToOne(() => SplitPlan, { nullable: true })
  @JoinColumn({ name: 'split_plan_id' })
  splitPlan: SplitPlan;

  /** 状态 */
  @Column({
    type: 'enum',
    enum: BudgetPoolStatus,
    default: BudgetPoolStatus.DRAFT,
  })
  status: BudgetPoolStatus;

  /** 过期时间 */
  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date;

  /** 所有者ID */
  @Column({ type: 'uuid' })
  ownerId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  /** 关联的里程碑 */
  @OneToMany(() => Milestone, (milestone) => milestone.budgetPool)
  milestones: Milestone[];

  /** 元数据 */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;


  /** On-chain BudgetPool contract poolId */
  @Column({ nullable: true })
  onchainPoolId: number;

  /** Fund transaction hash */
  @Column({ type: 'varchar', nullable: true })
  fundTxHash: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /**
   * 计算可用余额
   */
  get availableAmount(): string {
    const safeBigInt = (v: string | null | undefined) => {
      if (!v) return 0n;
      return BigInt(String(v).split('.')[0] || '0');
    };
    const funded = safeBigInt(this.fundedAmount);
    const reserved = safeBigInt(this.reservedAmount);
    const released = safeBigInt(this.releasedAmount);
    return (funded - reserved - released).toString();
  }
}
