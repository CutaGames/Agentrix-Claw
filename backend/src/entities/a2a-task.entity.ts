/**
 * A2A Task Entity
 * 
 * Agent-to-Agent task delegation with full lifecycle tracking.
 * Supports task creation, acceptance, execution, delivery, and settlement.
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum A2ATaskStatus {
  /** Task created, waiting for target agent to accept */
  PENDING = 'pending',
  /** Target agent accepted the task */
  ACCEPTED = 'accepted',
  /** Target agent is working on the task */
  IN_PROGRESS = 'in_progress',
  /** Target agent submitted deliverables for review */
  DELIVERED = 'delivered',
  /** Requester approved the deliverables */
  COMPLETED = 'completed',
  /** Requester rejected the deliverables */
  REJECTED = 'rejected',
  /** Task was cancelled by requester or target */
  CANCELLED = 'cancelled',
  /** Task timed out without completion */
  EXPIRED = 'expired',
  /** Task failed due to an error */
  FAILED = 'failed',
}

export enum A2ATaskPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
}

/**
 * Deliverable attached to a task
 */
export interface A2ADeliverable {
  type: 'text' | 'json' | 'file' | 'url' | 'code';
  content: string;
  metadata?: Record<string, any>;
  submittedAt?: string;
}

/**
 * Quality assessment result
 */
export interface A2AQualityAssessment {
  score: number;          // 0-100
  assessedBy: 'auto' | 'requester' | 'third_party';
  assessorId?: string;
  criteria: Array<{
    name: string;
    score: number;
    weight: number;
    comment?: string;
  }>;
  overallComment?: string;
  assessedAt: string;
}

/**
 * Callback/webhook configuration
 */
export interface A2ACallback {
  url: string;
  events: string[];       // e.g., ['accepted', 'delivered', 'completed']
  headers?: Record<string, string>;
  secret?: string;         // HMAC signing secret
  retryCount?: number;
}

@Entity('a2a_tasks')
@Index(['requesterAgentId', 'status'])
@Index(['targetAgentId', 'status'])
@Index(['status', 'createdAt'])
@Index(['budgetPoolId'])
@Index(['mandateId'])
export class A2ATask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Agent requesting the task */
  @Column({ name: 'requester_agent_id' })
  @Index()
  requesterAgentId: string;

  /** Agent assigned to execute the task */
  @Column({ name: 'target_agent_id' })
  @Index()
  targetAgentId: string;

  /** User who owns the requester agent (for auth) */
  @Column({ nullable: true, name: 'requester_user_id' })
  requesterUserId: string;

  /** Task title */
  @Column({ length: 500 })
  title: string;

  /** Detailed task description / prompt */
  @Column({ type: 'text' })
  description: string;

  /** Task type for categorization */
  @Column({ length: 100, nullable: true, name: 'task_type' })
  taskType: string;

  /** Task status */
  @Column({
    type: 'enum',
    enum: A2ATaskStatus,
    default: A2ATaskStatus.PENDING,
  })
  status: A2ATaskStatus;

  /** Task priority */
  @Column({
    type: 'enum',
    enum: A2ATaskPriority,
    default: A2ATaskPriority.NORMAL,
  })
  priority: A2ATaskPriority;

  /** Input parameters for the task */
  @Column({ type: 'jsonb', nullable: true })
  params: Record<string, any>;

  /** Deliverables submitted by target agent */
  @Column({ type: 'jsonb', default: '[]' })
  deliverables: A2ADeliverable[];

  /** Quality assessment of deliverables */
  @Column({ type: 'jsonb', nullable: true, name: 'quality_assessment' })
  qualityAssessment: A2AQualityAssessment;

  /** Callback/webhook configuration */
  @Column({ type: 'jsonb', nullable: true })
  callback: A2ACallback;

  /** Maximum price the requester is willing to pay (micro units) */
  @Column({ type: 'bigint', nullable: true, name: 'max_price' })
  maxPrice: string;

  /** Agreed price after negotiation (micro units) */
  @Column({ type: 'bigint', nullable: true, name: 'agreed_price' })
  agreedPrice: string;

  /** Currency */
  @Column({ length: 10, default: 'USDC' })
  currency: string;

  /** Payment method */
  @Column({ length: 50, nullable: true, name: 'payment_method' })
  paymentMethod: string;

  /** Associated AP2 mandate ID */
  @Column({ nullable: true, name: 'mandate_id' })
  mandateId: string;

  /** Associated budget pool ID */
  @Column({ nullable: true, name: 'budget_pool_id' })
  budgetPoolId: string;

  /** Associated milestone ID */
  @Column({ nullable: true, name: 'milestone_id' })
  milestoneId: string;

  /** Associated split plan ID */
  @Column({ nullable: true, name: 'split_plan_id' })
  splitPlanId: string;

  /** Payment transaction ID after settlement */
  @Column({ nullable: true, name: 'payment_tx_id' })
  paymentTxId: string;

  /** Skill ID if this task maps to a marketplace skill */
  @Column({ nullable: true, name: 'skill_id' })
  skillId: string;

  /** Deadline for the task */
  @Column({ type: 'timestamp', nullable: true, name: 'deadline' })
  deadline: Date;

  /** When the target agent accepted */
  @Column({ type: 'timestamp', nullable: true, name: 'accepted_at' })
  acceptedAt: Date;

  /** When the target agent started working */
  @Column({ type: 'timestamp', nullable: true, name: 'started_at' })
  startedAt: Date;

  /** When deliverables were submitted */
  @Column({ type: 'timestamp', nullable: true, name: 'delivered_at' })
  deliveredAt: Date;

  /** When the task was completed/approved */
  @Column({ type: 'timestamp', nullable: true, name: 'completed_at' })
  completedAt: Date;

  /** When the task was cancelled */
  @Column({ type: 'timestamp', nullable: true, name: 'cancelled_at' })
  cancelledAt: Date;

  /** Retry count for failed tasks */
  @Column({ type: 'int', default: 0, name: 'retry_count' })
  retryCount: number;

  /** Max retries allowed */
  @Column({ type: 'int', default: 3, name: 'max_retries' })
  maxRetries: number;

  /** Error message if failed */
  @Column({ type: 'text', nullable: true, name: 'error_message' })
  errorMessage: string;

  /** Cancellation reason */
  @Column({ type: 'text', nullable: true, name: 'cancel_reason' })
  cancelReason: string;

  /** Parent task ID for sub-task chains */
  @Column({ nullable: true, name: 'parent_task_id' })
  parentTaskId: string;

  /** Metadata */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
