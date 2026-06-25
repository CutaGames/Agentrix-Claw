import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Multi-Agent v2 W7 — Marketplace-hire escrow.
 *
 * Lightweight purpose-built escrow for sub-task hire flow.
 *
 * Lifecycle:
 *   reserved   → on agent_run dispatch with target='marketplace-hire'
 *   released   → AgentTaskWorker sees task succeeded, no dispute window
 *                hold (auto-release after 24h with no dispute) or admin
 *                manual release
 *   refunded   → task failed/canceled, or admin upheld a dispute
 *   disputed   → hirer raised dispute within 24h of release; funds
 *                pause until admin resolves
 *
 * Reuses the existing `Escrow` entity for blockchain/shopping flows
 * was deliberately rejected — that one couples paymentId/merchantId/
 * commission split which doesn't apply here. This row is owner-internal
 * and tied to a specific AgentTask; no on-chain footprint until v2.3.
 */
export type AgentHireEscrowStatus =
  | 'reserved'
  | 'released'
  | 'refunded'
  | 'disputed';

@Entity('agent_hire_escrow')
@Index(['hirerUserId', 'createdAt'])
@Index(['sellerUserId', 'createdAt'])
@Index(['status', 'createdAt'])
export class AgentHireEscrow {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Sub-task this escrow funds. ON DELETE CASCADE so escrow vanishes
   *  with the task (no orphan rows). */
  @Column({ type: 'uuid' })
  @Index()
  taskId: string;

  /** Hirer (the user whose Leader chat called agent_run with marketplace-hire). */
  @Column({ length: 64 })
  hirerUserId: string;

  /** Seller (owner of the listed pet that will execute the sub-task). */
  @Column({ length: 64 })
  sellerUserId: string;

  /** Pet that the seller listed. Mirrors `agent_tasks.agent_id` for audit. */
  @Column({ length: 64, nullable: true })
  agentId: string | null;

  /** Estimated cost agreed at hire time (USD). The actual cost may
   *  differ slightly; release uses min(agreedUsd, actualCostUsd). */
  @Column({ type: 'double precision' })
  agreedUsd: number;

  /** Final amount released to seller after agent task completion.
   *  Null until release. */
  @Column({ type: 'double precision', nullable: true })
  releasedUsd: number | null;

  @Column({ length: 16, default: 'reserved' })
  status: AgentHireEscrowStatus;

  /** Free-form note set by the dispute caller. */
  @Column({ type: 'text', nullable: true })
  disputeReason: string | null;

  /** When the hirer can no longer dispute. Set when transitioning
   *  to `released`; usually `releasedAt + 24h`. */
  @Column({ type: 'timestamptz', nullable: true })
  disputeWindowEndsAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  releasedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  refundedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  disputedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
