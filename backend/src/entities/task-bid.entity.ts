/**
 * Task Bid Entity
 * 
 * 任务竞标实体，支持多方竞标任务
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { MerchantTask } from './merchant-task.entity';

export enum BidStatus {
  PENDING = 'pending',         // 等待审核
  ACCEPTED = 'accepted',       // 已接受
  REJECTED = 'rejected',       // 已拒绝
  WITHDRAWN = 'withdrawn',     // 已撤回
}

@Entity('task_bids')
@Index(['taskId', 'status'])
@Index(['bidderId', 'status'])
@Index(['createdAt'])
export class TaskBid {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'task_id' })
  taskId: string;

  @ManyToOne(() => MerchantTask, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_id' })
  task: MerchantTask;

  @Index()
  @Column({ name: 'bidder_id' })
  bidderId: string; // 竞标者（商户/Agent）ID

  @ManyToOne(() => User)
  @JoinColumn({ name: 'bidder_id' })
  bidder: User;

  @Column('decimal', { precision: 15, scale: 2 })
  proposedBudget: number; // 报价

  @Column({ length: 10 })
  currency: string;

  @Column({ type: 'int' })
  estimatedDays: number; // 预计完成时间（天数）

  @Column({ type: 'text' })
  proposal: string; // 方案描述

  @Column({ type: 'jsonb', nullable: true })
  portfolio: {
    // 作品集/证明材料
    samples?: string[]; // 样品链接
    certifications?: string[]; // 证书
    previousWork?: Array<{
      title: string;
      description: string;
      link?: string;
    }>;
  };

  @Column({
    type: 'enum',
    enum: BidStatus,
    default: BidStatus.PENDING,
  })
  @Index()
  status: BidStatus;

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    skills?: string[]; // 相关技能
    rating?: number; // 竞标者评分
    completionRate?: number; // 历史完成率
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  respondedAt: Date; // 任务发布者回复时间
}
