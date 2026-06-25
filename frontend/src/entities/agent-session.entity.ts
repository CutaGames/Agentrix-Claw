import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { AgentMessage } from './agent-message.entity';

export enum SessionStatus {
  ACTIVE = 'active',
  REVOKED = 'revoked',
  EXPIRED = 'expired',
  ARCHIVED = 'archived', // 添加 ARCHIVED 状态以支持原有代码
}

@Entity('agent_sessions')
@Index(['userId', 'status'])
@Index(['sessionId'])
export class AgentSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'session_id', length: 66, unique: true, nullable: true })
  sessionId?: string; // bytes32 hex string (用于支付 Session)

  @Column({ name: 'user_id', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @Column({ name: 'agent_id', nullable: true })
  agentId?: string;

  @Column({ name: 'signer_address', length: 42, nullable: true })
  signerAddress?: string; // Session Key 地址（用于支付 Session）

  @Column({ name: 'owner_address', length: 42, nullable: true })
  ownerAddress?: string; // 主钱包地址（用于支付 Session）

  @Column('decimal', { name: 'single_limit', precision: 18, scale: 6, nullable: true })
  singleLimit?: number; // USDC, 6 decimals（用于支付 Session）

  @Column('decimal', { name: 'daily_limit', precision: 18, scale: 6, nullable: true })
  dailyLimit?: number; // USDC, 6 decimals（用于支付 Session）

  @Column('decimal', { name: 'used_today', precision: 18, scale: 6, default: 0, nullable: true })
  usedToday?: number; // USDC, 6 decimals（用于支付 Session）

  @Column('decimal', { precision: 18, scale: 6, default: 0, nullable: true })
  usedToday?: number; // USDC, 6 decimals（用于支付 Session）

  @Column('timestamp', { nullable: true })
  expiry?: Date; // 过期时间（用于支付 Session）

  // ========== 原有 AgentSession 属性（用于 Agent 对话） ==========
  @Column({ type: 'text', nullable: true })
  title?: string; // 会话标题

  @Column({ type: 'jsonb', nullable: true })
  metadata?: any; // 元数据

  @Column({
    type: 'enum',
    enum: SessionStatus,
    default: SessionStatus.ACTIVE,
  })
  status: SessionStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // ========== 原有 AgentSession 属性（用于 Agent 对话） ==========
  // 注意：这个实体现在同时用于支付 Session 和 Agent 对话 Session
  // 支付 Session 使用：sessionId, signerAddress, ownerAddress, singleLimit, dailyLimit 等
  // Agent 对话 Session 使用：messages, context, lastMessageAt 等

  @OneToMany(() => AgentMessage, (message) => message.session)
  messages: AgentMessage[];

  @Column({ type: 'jsonb', nullable: true })
  context?: {
    intent?: string | null;
    entities?: Record<string, any>;
    userProfile?: Record<string, any>;
  };

  @Column({ type: 'timestamp', nullable: true })
  lastMessageAt?: Date;
}
