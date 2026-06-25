import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AssetType } from './order.entity';

export enum PayeeType {
  AGENT = 'agent',
  MERCHANT = 'merchant',
  AGENTRIX = 'agentrix',
}

export enum AgentType {
  EXECUTION = 'execution',
  RECOMMENDATION = 'recommendation',
  REFERRAL = 'referral',
}

@Entity('commissions')
export class Commission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  orderId?: string;

  @Column()
  paymentId: string;

  @Column()
  payeeId: string;

  @Column({
    type: 'enum',
    enum: PayeeType,
  })
  payeeType: PayeeType;

  @Column({ type: 'varchar', length: 50, nullable: true })
  agentType: AgentType;

  @Column('decimal', { precision: 15, scale: 2 })
  amount: number;

  @Column({ length: 10 })
  currency: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  commissionBase: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  channelFee: number;

  @Column({ type: 'uuid', nullable: true })
  sessionId: string;

  @Column({
    type: 'enum',
    enum: AssetType,
    nullable: true,
  })
  assetType?: AssetType;

  @Column({ type: 'timestamptz', nullable: true })
  settlementAvailableAt?: Date;

  @Column({ default: 'locked' })
  status: string;

  @Column({ type: 'jsonb', nullable: true })
  breakdown?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

