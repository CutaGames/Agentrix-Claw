import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum UserAgentStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  PAUSED = 'paused',
}

@Entity('user_agents')
export class UserAgent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  templateId?: string | null;

  @Column({ length: 150 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'enum', enum: UserAgentStatus, default: UserAgentStatus.DRAFT })
  status: UserAgentStatus;

  @Column({ default: false })
  isPublished: boolean;

  @Column({ length: 150, nullable: true })
  slug?: string;

  @Column({ type: 'jsonb', nullable: true })
  settings?: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

