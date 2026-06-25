import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum TaskStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  IN_PROGRESS = 'in_progress',
  DELIVERED = 'delivered',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  DISPUTED = 'disputed',
}

export enum TaskType {
  CUSTOM_SERVICE = 'custom_service',
  CONSULTATION = 'consultation',
  DESIGN = 'design',
  DEVELOPMENT = 'development',
  CONTENT = 'content',
  OTHER = 'other',
}

@Entity('merchant_tasks')
export class MerchantTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  user: User;

  @Column()
  userId: string; // 发起任务的用户

  @ManyToOne(() => User)
  merchant: User;

  @Column()
  merchantId: string; // 接收任务的商户

  @Column({
    type: 'enum',
    enum: TaskType,
  })
  type: TaskType;

  @Column({
    type: 'enum',
    enum: TaskStatus,
    default: TaskStatus.PENDING,
  })
  status: TaskStatus;

  @Column()
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column('decimal', { precision: 15, scale: 2 })
  budget: number;

  @Column({ length: 10 })
  currency: string;

  @Column({ type: 'jsonb', nullable: true })
  requirements: {
    deadline?: Date;
    deliverables?: string[];
    specifications?: Record<string, any>;
  };

  @Column({ type: 'jsonb', nullable: true })
  progress: {
    currentStep?: string;
    completedSteps?: string[];
    percentage?: number;
    updates?: Array<{
      message: string;
      timestamp: Date;
      attachments?: string[];
    }>;
  };

  @Column({ nullable: true })
  orderId: string; // 关联的订单ID

  @Column({ nullable: true })
  agentId: string; // 如果是Agent发起的任务

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    source?: string;
    priority?: 'low' | 'medium' | 'high';
    tags?: string[];
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  completedAt: Date;
}

