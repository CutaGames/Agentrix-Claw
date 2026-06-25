import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { TransactionRoute } from './transaction-route.entity';

@Entity('fee_estimates')
export class FeeEstimate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  routeId: string;

  @ManyToOne(() => TransactionRoute, { nullable: true })
  @JoinColumn({ name: 'routeId' })
  route: TransactionRoute;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  amount: string;

  @Column({ type: 'varchar', length: 10 })
  currency: string;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  estimatedFee: string;

  @Column({ type: 'jsonb' })
  feeBreakdown: {
    baseFee: number;
    percentageFee: number;
    gasFee?: number;
    bridgeFee?: number;
    totalFee: number;
  };

  @CreateDateColumn()
  createdAt: Date;
}

