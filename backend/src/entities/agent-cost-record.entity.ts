import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Persistent LLM cost audit trail.
 *
 * One row per LLM call. Produced by CostTrackerService.persistCost() and
 * primarily consumed by billing/reporting. Safe to query by (user_id, created_at)
 * for monthly summaries.
 *
 * Introduced by Phase 0 of the 2026-04-17 audit follow-up — replaces the previous
 * in-memory-only SessionCostRecord which was lost on every restart.
 */
@Entity('agent_cost_records')
@Index(['userId', 'createdAt'])
@Index(['sessionId', 'createdAt'])
export class AgentCostRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', nullable: true })
  @Index()
  userId: string | null;

  @Column({ name: 'session_id' })
  sessionId: string;

  @Column({ name: 'agent_id', nullable: true })
  agentId: string | null;

  @Column({ name: 'instance_id', nullable: true })
  instanceId: string | null;

  @Column({ name: 'model', length: 128 })
  model: string;

  @Column({ name: 'provider', length: 64, nullable: true })
  provider: string | null;

  @Column({ name: 'input_tokens', type: 'bigint', default: 0 })
  inputTokens: number;

  @Column({ name: 'output_tokens', type: 'bigint', default: 0 })
  outputTokens: number;

  @Column({ name: 'cache_read_tokens', type: 'bigint', default: 0 })
  cacheReadTokens: number;

  @Column({ name: 'cache_write_tokens', type: 'bigint', default: 0 })
  cacheWriteTokens: number;

  /** Monetary cost in USD (double precision for aggregation safety). */
  @Column({ name: 'cost_usd', type: 'double precision', default: 0 })
  costUsd: number;

  /** Routing reason when cost was recorded (e.g. 'local_only_fallback_to_cloud', 'primary', 'failover'). */
  @Column({ name: 'routing_reason', length: 64, nullable: true })
  routingReason: string | null;

  /**
   * Codex-borrow P1 — user-facing tier preference at the time of the request.
   * One of: 'local' | 'smart' | 'cloud'. Null for legacy rows.
   */
  @Column({ length: 16, nullable: true })
  tier: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
