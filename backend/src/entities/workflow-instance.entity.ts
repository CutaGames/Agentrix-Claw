import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('workflow_instances')
@Index(['userId', 'startedAtMs'])
@Index(['templateId', 'status'])
export class WorkflowInstanceEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'varchar', length: 64 })
  templateId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 16 })
  status: string;

  @Column({ type: 'integer' })
  currentStep: number;

  @Column({ type: 'bigint', nullable: true })
  startedAtMs?: string | null;

  @Column({ type: 'bigint', nullable: true })
  finishedAtMs?: string | null;

  @Column({ type: 'jsonb' })
  results: Array<{ step_id: string; status: string; result?: string }>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
