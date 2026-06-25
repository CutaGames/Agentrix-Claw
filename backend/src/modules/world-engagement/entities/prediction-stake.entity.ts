import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * PredictionStakeEntity — 一笔预测下注(AXP)。
 *
 * 下注即扣 AXP(prediction_stake)写本行;结算时若命中写 payout 并入账(prediction_payout);
 * 市场取消则 refunded=true 并退款(prediction_refund)。SnakeNamingStrategy 自动列名。
 */
@Entity('prediction_stakes')
@Index(['marketId'])
@Index(['userId'])
@Index(['marketId', 'userId'])
export class PredictionStakeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  marketId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 64 })
  optionId: string;

  /** 下注额(AXP)。 */
  @Column({ type: 'integer' })
  amount: number;

  /** 结算后实际派彩(AXP);未结算/未命中为 null/0。 */
  @Column({ type: 'integer', nullable: true })
  payout: number | null;

  /** 是否已退款(市场取消)。 */
  @Column({ type: 'boolean', default: false })
  refunded: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
