/**
 * Agent Reputation Entity
 * 
 * Tracks agent performance metrics for A2A trust scoring.
 * Updated after each completed/failed task.
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('agent_reputations')
@Index(['agentId'], { unique: true })
export class AgentReputation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Agent ID */
  @Column({ name: 'agent_id', unique: true })
  agentId: string;

  /** Overall reputation score (0-100) */
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 50, name: 'overall_score' })
  overallScore: number;

  /** Total tasks completed successfully */
  @Column({ type: 'int', default: 0, name: 'tasks_completed' })
  tasksCompleted: number;

  /** Total tasks failed or rejected */
  @Column({ type: 'int', default: 0, name: 'tasks_failed' })
  tasksFailed: number;

  /** Total tasks cancelled */
  @Column({ type: 'int', default: 0, name: 'tasks_cancelled' })
  tasksCancelled: number;

  /** Total tasks received */
  @Column({ type: 'int', default: 0, name: 'tasks_total' })
  tasksTotal: number;

  /** Average quality score from assessments (0-100) */
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0, name: 'avg_quality_score' })
  avgQualityScore: number;

  /** Average response time in seconds (time to accept) */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0, name: 'avg_response_time' })
  avgResponseTime: number;

  /** Average completion time in seconds */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0, name: 'avg_completion_time' })
  avgCompletionTime: number;

  /** On-time delivery rate (0-100) */
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 100, name: 'on_time_rate' })
  onTimeRate: number;

  /** Total volume transacted (micro units) */
  @Column({ type: 'bigint', default: '0', name: 'total_volume' })
  totalVolume: string;

  /** Specializations / categories the agent excels at */
  @Column({ type: 'jsonb', default: '[]' })
  specializations: string[];

  /** Detailed score breakdown by category */
  @Column({ type: 'jsonb', nullable: true, name: 'category_scores' })
  categoryScores: Record<string, { score: number; count: number }>;

  /** Recent review summaries (last 10) */
  @Column({ type: 'jsonb', default: '[]', name: 'recent_reviews' })
  recentReviews: Array<{
    taskId: string;
    score: number;
    comment?: string;
    reviewerId: string;
    createdAt: string;
  }>;

  /** Reputation tier */
  @Column({ length: 20, default: 'bronze' })
  tier: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
