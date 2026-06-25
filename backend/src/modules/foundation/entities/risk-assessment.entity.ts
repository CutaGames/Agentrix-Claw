import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('risk_assessments')
@Index(['transactionId'])
@Index(['userId'])
export class RiskAssessment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  transactionId: string;

  @Column({ type: 'uuid', nullable: true })
  userId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  agentId: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, comment: '风险评分 0-100' })
  riskScore: number;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true, // 允许NULL，用于迁移现有数据
    default: 'medium', // 设置默认值
    comment: "风险等级: 'low' | 'medium' | 'high' | 'critical'",
  })
  riskLevel: 'low' | 'medium' | 'high' | 'critical';

  @Column({ type: 'jsonb' })
  riskFactors: {
    amount: number;
    frequency: number;
    kycStatus: string;
    historyScore: number;
    [key: string]: any;
  };

  @Column({ type: 'text', nullable: true })
  recommendation: string;

  @CreateDateColumn()
  createdAt: Date;
}

