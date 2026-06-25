import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { PayeeType } from './commission.entity';
import { CommissionAllocation } from './commission-allocation.entity';

export enum SettlementStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('commission_settlements_v4')
export class CommissionSettlement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  orderId: string;

  @Column({ nullable: true })
  payeeId: string;

  @Column({ type: 'enum',
    enum: PayeeType,
    nullable: true })
  payeeType: PayeeType;

  @Column('decimal', { precision: 15, scale: 6, nullable: true })
  amount: number;

  @Column('decimal', { precision: 20, scale: 6, nullable: true, name: 'total_amount' })
  totalAmount: string;

  @Column('decimal', { precision: 20, scale: 6, nullable: true, name: 'merchant_amount' })
  merchantAmount: string;

  @Column('decimal', { precision: 20, scale: 6, nullable: true, name: 'platform_fee' })
  platformFee: string;

  @Column('decimal', { precision: 20, scale: 6, nullable: true, name: 'channel_fee' })
  channelFee: string;

  @Column({ length: 10, default: 'USDT' })
  currency: string;

  @Column({ type: 'date', nullable: true, name: 'settlement_date' })
  settlementDate: Date;

  @Column({
    type: 'enum',
    enum: SettlementStatus,
    default: SettlementStatus.PENDING,
  })
  status: SettlementStatus;

  @Column({ nullable: true })
  transactionHash: string;

  @OneToMany(() => CommissionAllocation, (allocation) => allocation.settlement)
  allocations: CommissionAllocation[];

  @CreateDateColumn()
  createdAt: Date;
}

