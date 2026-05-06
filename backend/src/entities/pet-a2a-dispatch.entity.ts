import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * PetA2ADispatch — record of a pet (as source) dispatching a sub-task to
 * another agent via the A2A protocol.
 *
 * PRD: BE-T4.7 — pet as task issuer; tracks status + reward + recovery.
 */
@Entity('pet_a2a_dispatches')
@Index(['userId', 'petSkinId', 'status'])
export class PetA2ADispatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  /** The pet that issued the dispatch. */
  @Column({ type: 'uuid' })
  petSkinId: string;

  /** Free-form task name, e.g. "fetch_market_summary". */
  @Column({ type: 'varchar', length: 80 })
  taskName: string;

  /** Target agent identifier (worker pet / external). */
  @Column({ type: 'varchar', length: 120 })
  targetAgentId: string;

  /** JSON payload sent. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  payload: Record<string, unknown>;

  /** Reward offered to executor (USD cents). */
  @Column({ type: 'integer', default: 0 })
  rewardCents: number;

  /** Lifecycle: queued -> running -> completed | failed | recovered (timeout) */
  @Column({ type: 'varchar', length: 16, default: 'queued' })
  status: 'queued' | 'running' | 'completed' | 'failed' | 'recovered';

  @Column({ type: 'jsonb', nullable: true })
  result: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
