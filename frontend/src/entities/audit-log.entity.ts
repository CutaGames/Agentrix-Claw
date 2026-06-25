import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum AuditAction {
  // Agent相关
  AGENT_MESSAGE = 'agent_message',
  AGENT_SEARCH = 'agent_search',
  AGENT_RECOMMEND = 'agent_recommend',
  AGENT_ORDER_CREATE = 'agent_order_create',
  AGENT_PAYMENT = 'agent_payment',
  AGENT_REFUND = 'agent_refund',
  
  // 订单相关
  ORDER_CREATE = 'order_create',
  ORDER_UPDATE = 'order_update',
  ORDER_CANCEL = 'order_cancel',
  
  // 支付相关
  PAYMENT_CREATE = 'payment_create',
  PAYMENT_COMPLETE = 'payment_complete',
  PAYMENT_FAIL = 'payment_fail',
  REFUND_CREATE = 'refund_create',
  REFUND_COMPLETE = 'refund_complete',
  
  // 用户相关
  USER_LOGIN = 'user_login',
  USER_LOGOUT = 'user_logout',
  USER_REGISTER = 'user_register',
  USER_UPDATE = 'user_update',
  
  // 商户相关
  MERCHANT_PRODUCT_CREATE = 'merchant_product_create',
  MERCHANT_PRODUCT_UPDATE = 'merchant_product_update',
  MERCHANT_SETTLEMENT = 'merchant_settlement',
  
  // 系统相关
  SYSTEM_CONFIG_UPDATE = 'system_config_update',
  SYSTEM_ERROR = 'system_error',
}

export enum AuditStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
  PENDING = 'pending',
}

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { nullable: true })
  user: User;

  @Column({ nullable: true })
  userId: string;

  @Column({
    type: 'enum',
    enum: AuditAction,
  })
  action: AuditAction;

  @Column({
    type: 'enum',
    enum: AuditStatus,
    default: AuditStatus.SUCCESS,
  })
  status: AuditStatus;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'jsonb', nullable: true })
  requestData: any; // 请求数据

  @Column({ type: 'jsonb', nullable: true })
  responseData: any; // 响应数据

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
    orderId?: string;
    paymentId?: string;
    productId?: string;
    agentId?: string;
    merchantId?: string;
    errorMessage?: string;
    stackTrace?: string;
  };

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  duration: number; // 操作耗时（毫秒）
}

