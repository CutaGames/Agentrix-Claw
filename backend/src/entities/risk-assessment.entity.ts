import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Payment } from './payment.entity';
import { User } from './user.entity';

export enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export enum RiskDecision {
  APPROVE = 'approve',
  REVIEW = 'review',
  REJECT = 'reject',
}

@Entity('risk_assessments')
@Index(['paymentId'])
@Index(['userId'])
@Index(['createdAt'])
export class RiskAssessment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Payment, { nullable: true })
  payment: Payment;

  @Column({ nullable: true })
  paymentId: string;

  @ManyToOne(() => User, { nullable: true })
  user: User;

  @Column({ nullable: true })
  userId: string;

  @Column('decimal', { precision: 5, scale: 2 })
  riskScore: number; // 0-100

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true, // 允许NULL，用于迁移现有数据
    default: 'medium', // 设置默认值
    comment: "风险等级: 'low' | 'medium' | 'high' | 'critical'",
  })
  riskLevel: 'low' | 'medium' | 'high' | 'critical';

  @Column({
    type: 'enum',
    enum: RiskDecision,
    nullable: true, // 允许NULL，用于迁移现有数据
    default: RiskDecision.REVIEW, // 设置默认值
  })
  decision: RiskDecision;

  @Column('jsonb', { nullable: true })
  riskFactors: Array<{
    name: string;
    score: number;
    weight: number;
    description: string;
  }>;

  @Column('text', { nullable: true })
  recommendation: string;

  @Column('jsonb', { nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;
}

