import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * PetLlmUsageEvent — per-call LLM usage record for risk control.
 *
 * PRD: BE-T4.9 / PF-4.3 — 1h 100 calls → pause + alert; daily budget cap.
 *
 * Lightweight append-only log; rolled up by RiskControlService into a
 * sliding-window count.
 */
@Entity('pet_llm_usage_events')
@Index(['userId', 'petSkinId', 'createdAt'])
export class PetLlmUsageEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  petSkinId: string;

  /** LLM model identifier (e.g. claude-3.5-sonnet). */
  @Column({ type: 'varchar', length: 64 })
  model: string;

  /** Cost in USD cents. */
  @Column({ type: 'integer', default: 0 })
  costCents: number;

  @CreateDateColumn()
  createdAt: Date;
}
