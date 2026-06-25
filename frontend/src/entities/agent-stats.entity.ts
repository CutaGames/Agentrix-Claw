import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('agent_stats')
export class AgentStats {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  agentId: string;

  @Column({ default: 0 })
  totalCalls: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  totalRevenue: number;

  @Column({ default: 0 })
  totalUsers: number;

  @Column('decimal', { precision: 3, scale: 2, default: 0 })
  avgRating: number;

  @Column({ nullable: true })
  lastActiveAt?: Date;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

