import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
} from 'typeorm';
import { AgentLaneJob } from './agent-lane-job.entity';

@Entity('agent_lane_events')
@Index(['jobId', 'sequence'])
@Index(['parentJobId', 'createdAt'])
@Index(['type', 'createdAt'])
export class AgentLaneEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  jobId: string;

  @ManyToOne(() => AgentLaneJob, job => job.events, { onDelete: 'CASCADE' })
  job: AgentLaneJob;

  @Column({ type: 'uuid', nullable: true })
  parentJobId?: string;

  @Column()
  sequence: number;

  @Column({ length: 80 })
  type: string;

  @Column({ type: 'jsonb', nullable: true })
  payload?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;
}