import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum AgentTemplateVisibility {
  PRIVATE = 'private',
  PUBLIC = 'public',
}

@Entity('agent_templates')
export class AgentTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 150 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ length: 50 })
  category: string;

  @Column({ length: 50, nullable: true })
  persona?: string;

  @Column({ type: 'text', array: true, default: '{}' })
  tags: string[];

  @Column({ type: 'jsonb', nullable: true })
  config?: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  prompts?: Record<string, any>;

  @Column({
    type: 'enum',
    enum: AgentTemplateVisibility,
    default: AgentTemplateVisibility.PRIVATE,
  })
  visibility: AgentTemplateVisibility;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  createdBy?: string | null;

  @Column({ default: false })
  isFeatured: boolean;

  @Column({ default: 0 })
  usageCount: number;

  @Column({ type: 'varchar', length: 150, nullable: true })
  coverImage?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

