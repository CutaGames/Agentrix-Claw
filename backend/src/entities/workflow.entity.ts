import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

export type WorkflowTriggerType = 'cron' | 'webhook' | 'manual';
export type WorkflowRunStatus = 'success' | 'error' | 'running' | 'pending';

@Entity('workflows')
@Index(['userId'])
export class Workflow {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ default: 'manual' })
  triggerType: WorkflowTriggerType;

  @Column({ nullable: true })
  cronExpression: string;

  @Column({ nullable: true })
  webhookUrl: string;

  /** Unique webhook token (for incoming POST callbacks) */
  @Column({ nullable: true, unique: true })
  webhookToken: string;

  @Column({ type: 'text' })
  prompt: string;

  @Column({ default: true })
  enabled: boolean;

  @Column({ nullable: true })
  lastRunAt: Date;

  @Column({ nullable: true })
  lastRunStatus: WorkflowRunStatus;

  @Column({ default: 0 })
  runCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
