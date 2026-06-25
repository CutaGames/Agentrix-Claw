/**
 * AP2 Mandate Entity
 * 
 * Persistent storage for AP2 (Agent Payment Protocol) mandates.
 * Replaces in-memory Map in UCP Service for production use.
 * Mandates authorize agents to make autonomous payments within defined limits.
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum MandateStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
  EXHAUSTED = 'exhausted',
}

@Entity('ap2_mandates')
@Index(['agentId', 'status'])
@Index(['principalId', 'status'])
@Index(['status', 'validUntil'])
export class AP2MandateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Agent authorized to use this mandate */
  @Column({ name: 'agent_id' })
  @Index()
  agentId: string;

  /** Principal (user/agent) who granted the mandate */
  @Column({ nullable: true, name: 'principal_id' })
  principalId: string;

  /** Maximum per-transaction amount (micro units) */
  @Column({ type: 'bigint', name: 'max_amount' })
  maxAmount: string;

  /** Currency */
  @Column({ length: 10, default: 'USD' })
  currency: string;

  /** Mandate validity start */
  @Column({ type: 'timestamp', name: 'valid_from' })
  validFrom: Date;

  /** Mandate validity end */
  @Column({ type: 'timestamp', name: 'valid_until' })
  validUntil: Date;

  /** Allowed merchant IDs (empty = all) */
  @Column({ type: 'jsonb', default: '[]', name: 'allowed_merchants' })
  allowedMerchants: string[];

  /** Allowed categories (empty = all) */
  @Column({ type: 'jsonb', default: '[]', name: 'allowed_categories' })
  allowedCategories: string[];

  /** Total amount used so far (micro units) */
  @Column({ type: 'bigint', default: '0', name: 'used_amount' })
  usedAmount: string;

  /** Number of transactions made */
  @Column({ type: 'int', default: 0, name: 'transaction_count' })
  transactionCount: number;

  /** Mandate status */
  @Column({
    type: 'enum',
    enum: MandateStatus,
    default: MandateStatus.ACTIVE,
  })
  status: MandateStatus;

  /** Metadata */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
