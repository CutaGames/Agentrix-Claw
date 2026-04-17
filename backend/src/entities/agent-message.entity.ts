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
    archived?: boolean;
    compaction?: boolean;
    compactedAt?: string;
    archivedCount?: number;
    [key: string]: any;
  };

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  sequenceNumber: number; // 消息序号（用于排序）

  // Phase 1.3: LLM stop reason for assistant turns (end_turn | max_tokens | tool_use | stop_sequence | error | abort)
  @Column({ type: 'varchar', length: 32, nullable: true })
  stopReason: string | null;

  // Phase 1.3: Structured tool calls emitted by the assistant turn.
  // Stored separately from metadata so analytics queries don't have to unpack the
  // oversized metadata jsonb. Null for user/system messages.
  @Column({ type: 'jsonb', nullable: true })
  toolCalls: Array<{ id?: string; name: string; input?: any; result?: any }> | null;
}

