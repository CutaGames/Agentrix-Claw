import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { AdminUser } from './admin-user.entity';

export enum AdminLogAction {
  // 用户操作
  USER_CREATE = 'user_create',
  USER_UPDATE = 'user_update',
  USER_DELETE = 'user_delete',
  USER_FREEZE = 'user_freeze',
  USER_UNFREEZE = 'user_unfreeze',
  USER_KYC_APPROVE = 'user_kyc_approve',
  USER_KYC_REJECT = 'user_kyc_reject',

  // 商户操作
  MERCHANT_CREATE = 'merchant_create',
  MERCHANT_UPDATE = 'merchant_update',
  MERCHANT_DELETE = 'merchant_delete',
  MERCHANT_FREEZE = 'merchant_freeze',
  MERCHANT_UNFREEZE = 'merchant_unfreeze',
  MERCHANT_KYC_APPROVE = 'merchant_kyc_approve',
  MERCHANT_KYC_REJECT = 'merchant_kyc_reject',

  // 商品操作
  PRODUCT_APPROVE = 'product_approve',
  PRODUCT_REJECT = 'product_reject',
  PRODUCT_DELETE = 'product_delete',

  // 订单操作
  ORDER_REFUND = 'order_refund',
  ORDER_CANCEL = 'order_cancel',

  // 财务操作
  SETTLEMENT_PROCESS = 'settlement_process',
  WITHDRAWAL_APPROVE = 'withdrawal_approve',
  WITHDRAWAL_REJECT = 'withdrawal_reject',

  // 系统操作
  CONFIG_UPDATE = 'config_update',
  ROLE_UPDATE = 'role_update',
  PERMISSION_UPDATE = 'permission_update',

  // 风控操作
  RISK_RULE_CREATE = 'risk_rule_create',
  RISK_RULE_UPDATE = 'risk_rule_update',
  RISK_RULE_DELETE = 'risk_rule_delete',
  RISK_ORDER_BLOCK = 'risk_order_block',
  RISK_ORDER_RELEASE = 'risk_order_release',
}

@Entity('admin_logs')
export class AdminLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => AdminUser, { nullable: true })
  @JoinColumn({ name: 'adminUserId' })
  adminUser: AdminUser;

  @Column({ nullable: true })
  adminUserId: string;

  @Column({
    type: 'enum',
    enum: AdminLogAction,
  })
  action: AdminLogAction;

  @Column()
  resourceType: string; // user, merchant, order, etc.

  @Column({ nullable: true })
  resourceId: string;

  @Column('text', { nullable: true })
  description: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Column({ nullable: true })
  ipAddress: string;

  @Column({ nullable: true })
  userAgent: string;

  @CreateDateColumn()
  createdAt: Date;
}

