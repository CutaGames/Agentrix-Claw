import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum DreamPhase {
  LIGHT = 'light',
  DEEP = 'deep',
  REM = 'rem',
}

export enum DreamStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity()
export class DreamingSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @Column({ nullable: true })
  agentId: string;

  @Column({ type: 'enum', enum: DreamPhase, default: DreamPhase.LIGHT })
  phase: DreamPhase;

  @Column({ type: 'enum', enum: DreamStatus, default: DreamStatus.PENDING })
  status: DreamStatus;

  /** Number of memories processed in this session */
  @Column({ type: 'int', default: 0 })
  memoriesProcessed: number;

  /** Number of new insights generated */
  @Column({ type: 'int', default: 0 })
  insightsGenerated: number;

  /** Dream insights and consolidated knowledge */
  @Column({ type: 'jsonb', default: [] })
  insights: Array<{
    type: 'connection' | 'pattern' | 'consolidation' | 'creative';
    content: string;
    sourceMemoryIds: string[];
    confidence: number;
    createdAt: string;
  }>;

  /** Processing metadata */
  @Column({ type: 'jsonb', default: {} })
  metadata: {
    triggerType?: 'idle' | 'scheduled' | 'manual';
    durationMs?: number;
    memoryScopes?: string[];
    consolidationStrategy?: string;
  };

  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
