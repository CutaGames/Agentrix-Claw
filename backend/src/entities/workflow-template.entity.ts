import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('workflow_templates')
@Index(['authorUserId', 'visibility'])
@Index(['visibility', 'category'])
export class WorkflowTemplateEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'uuid' })
  authorUserId: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'varchar', length: 24 })
  category: string;

  @Column({ type: 'jsonb' })
  steps: Array<{
    id: string;
    kind: string;
    description: string;
    agent_role?: string;
    params?: Record<string, any>;
  }>;

  @Column({ type: 'jsonb' })
  requiredSkills: string[];

  @Column({ type: 'varchar', length: 16 })
  visibility: string;

  @Column({ type: 'integer', default: 0 })
  installCount: number;

  @Column({ type: 'bigint' })
  createdAtMs: string;

  @Column({ type: 'bigint' })
  updatedAtMs: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
