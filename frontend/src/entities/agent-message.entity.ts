import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { AgentSession } from './agent-session.entity';

export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
}

export enum MessageType {
  TEXT = 'text',
  PRODUCT = 'product',
  SERVICE = 'service',
  ONCHAIN_ASSET = 'onchain_asset',
  ORDER = 'order',
  PAYMENT = 'payment',
  CODE = 'code',
  ACTION = 'action',
}

@Entity('agent_messages')
export class AgentMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => AgentSession, (session) => session.messages, { onDelete: 'CASCADE' })
  session: AgentSession;

  @Column()
  sessionId: string;

  @ManyToOne(() => User, { nullable: true })
  user: User;

  @Column({ nullable: true })
  userId: string;

  @Column({
    type: 'enum',
    enum: MessageRole,
  })
  role: MessageRole;

  @Column({
    type: 'enum',
    enum: MessageType,
    default: MessageType.TEXT,
  })
  type: MessageType;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    intent?: string;
    entities?: Record<string, any>;
    actions?: Array<{
      type: string;
      data: any;
      executed?: boolean;
      result?: any;
    }>;
    searchResults?: any;
    comparison?: any;
    orderId?: string;
    paymentId?: string;
    productIds?: string[];
  };

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  sequenceNumber: number; // 消息序号（用于排序）
}

