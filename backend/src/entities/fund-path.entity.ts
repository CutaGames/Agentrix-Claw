import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum FundPathType {
  MERCHANT_NET = 'merchant_net',       // 商户实收
  PLATFORM_FEE = 'platform_fee',       // 平台费用
  CHANNEL_FEE = 'channel_fee',         // X402/ARN 通道费 (0.3%)
  PROMOTER_SHARE = 'promoter_share',   // 推广者分成
  EXECUTOR_SHARE = 'executor_share',   // 执行Agent分成
  REFERRER_SHARE = 'referrer_share',   // 推荐Agent分成
  PLATFORM_FUND = 'platform_fund',     // 平台基金池（无Agent时）
  TAX = 'tax',                         // 税费
  GAS_FEE = 'gas_fee',                 // Gas费用
}

@Entity('fund_paths')
@Index(['paymentId'])
@Index(['transactionHash'])
@Index(['createdAt'])
export class FundPath {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  paymentId: string;

  @Column({ nullable: true })
  orderId: string;

  @Column({ nullable: true })
  transactionHash: string;

  @Column({ type: 'enum',
    enum: FundPathType })
  pathType: FundPathType;

  @Column({ nullable: true })
  fromAddress: string;

  @Column({ nullable: true })
  fromLabel: string;

  @Column({ nullable: true })
  toAddress: string;

  @Column({ nullable: true })
  toLabel: string;

  @Column('numeric', { precision: 20, scale: 6 })
  amount: string;

  @Column({ length: 10 })
  currency: string;

  @Column('numeric', { precision: 10, scale: 6, nullable: true })
  rate: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ default: false })
  isX402: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;
}
