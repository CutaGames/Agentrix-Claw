import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum WithdrawalStatus {
  PENDING = 'pending', // 待处理
  PROCESSING = 'processing', // 处理中（转换中）
  COMPLETED = 'completed', // 已完成
  FAILED = 'failed', // 失败
  CANCELLED = 'cancelled', // 已取消
}

@Entity('withdrawals')
export class Withdrawal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  merchant: User;

  @Column()
  merchantId: string;

  @Column('decimal', { precision: 15, scale: 2 })
  amount: number; // 提现金额（数字货币）

  @Column({ length: 10 })
  fromCurrency: string; // 源货币（如 USDC）

  @Column({ length: 10 })
  toCurrency: string; // 目标货币（如 CNY）

  @Column('decimal', { precision: 15, scale: 2 })
  exchangeRate: number; // 汇率

  @Column('decimal', { precision: 15, scale: 2 })
  finalAmount: number; // 最终到账金额（法币）

  @Column('decimal', { precision: 15, scale: 2 })
  providerFee: number; // Provider手续费（0.3 USDC）

  @Column('decimal', { precision: 15, scale: 2 })
  paymindFee: number; // PayMind手续费（0.1 USDC）

  @Column({
    type: 'enum',
    enum: WithdrawalStatus,
    default: WithdrawalStatus.PENDING,
  })
  status: WithdrawalStatus;

  @Column({ nullable: true })
  providerId: string; // Provider ID（如 moonpay, alchemy）

  @Column({ nullable: true })
  providerTransactionId: string; // Provider交易ID

  @Column({ nullable: true })
  transactionHash: string; // 链上交易哈希

  @Column({ nullable: true })
  bankAccount: string; // 银行账户（法币收款账户）

  @Column({ nullable: true })
  failureReason: string; // 失败原因

  @Column({ type: 'jsonb', nullable: true })
  metadata: any; // 元数据

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

