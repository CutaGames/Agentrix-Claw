import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
} from 'typeorm';
import { AgentLaneJob } from './agent-lane-job.entity';

@Entity('agent_lane_artifacts')
@Index(['jobId', 'kind'])
export class AgentLaneArtifact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  jobId: string;

  @ManyToOne(() => AgentLaneJob, job => job.artifacts, { onDelete: 'CASCADE' })
  job: AgentLaneJob;

  @Column({ length: 60 })
  kind: string;

  @Column({ type: 'text', nullable: true })
  uri?: string;

  @Column({ type: 'text', nullable: true })
  content?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;
}