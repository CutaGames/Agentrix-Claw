import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('transaction_routes')
@Index(['sourceChain', 'targetChain'])
export class TransactionRoute {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  sourceChain: string;

  @Column({ type: 'varchar', length: 50 })
  targetChain: string;

  @Column({ type: 'varchar', length: 50 })
  paymentMethod: string;

  @Column({ type: 'jsonb' })
  feeStructure: {
    baseFee: number;
    percentageFee: number;
    minFee: number;
    maxFee?: number;
  };

  @Column({ type: 'varchar', length: 20 })
  riskLevel: 'low' | 'medium' | 'high' | 'critical';

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  successRate: number;

  @Column({ type: 'integer', nullable: true, comment: '平均执行时间（毫秒）' })
  avgExecutionTime: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

