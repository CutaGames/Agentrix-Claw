import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * AeonLedgerEntry — Aeon 经济账本分录(Task 3.2 / R11.2 / R19.4)。
 *
 * Property 1(账本守恒):org 权威余额 = 其分录代数和(可重建,审计)。
 * 每笔价值流转记 payer/payee/amount/currency/reason/ref。append-only,不更新不删除。
 *
 * 遵循 SnakeNamingStrategy:`@Column()` 不写 `name:`。
 */
@Entity('aeon_ledger_entries')
@Index(['orgId'])
@Index(['payerUserId'])
@Index(['payeeUserId'])
export class AeonLedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 关联组织(公司账本);广场任务/个人交易可为 null。 */
  @Column({ type: 'uuid', nullable: true })
  orgId: string | null;

  /** 付款方用户。 */
  @Column({ type: 'uuid' })
  payerUserId: string;

  /** 收款方用户。 */
  @Column({ type: 'uuid' })
  payeeUserId: string;

  /** 金额(正整数;以最小单位计:AXP 为积分,数字货币为 cents)。 */
  @Column({ type: 'bigint' })
  amount: string;

  /** 币种:AXP / USDC / ...(数字货币复用现有支付通道)。 */
  @Column({ type: 'varchar', length: 16, default: 'AXP' })
  currency: string;

  /** 流转原因:wage/task/bounty/trade/royalty/ticket/escrow_hold/escrow_release。 */
  @Column({ type: 'varchar', length: 24 })
  reason: string;

  /** 关联业务 id(task/bounty/listing/...),便于追溯。 */
  @Column({ type: 'uuid', nullable: true })
  refId: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
