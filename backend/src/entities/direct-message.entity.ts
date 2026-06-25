import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  UpdateDateColumn,
} from 'typeorm';

export enum DMStatus {
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
}

@Entity('direct_messages')
export class DirectMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  senderId: string;

  @Column({ length: 150, nullable: true })
  senderName?: string;

  @Column({ length: 255, nullable: true })
  senderAvatar?: string;

  @Index()
  @Column({ type: 'uuid' })
  receiverId: string;

  @Column({ type: 'text' })
  content: string;

  @Column({
    type: 'enum',
    enum: DMStatus,
    default: DMStatus.SENT,
  })
  status: DMStatus;

  /** Composite room key for quick conversation lookup — always sorted: minId_maxId */
  @Index()
  @Column({ length: 73 })
  conversationKey: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/** Conversation summary (not persisted — derived) */
export interface ConversationSummary {
  partnerId: string;
  partnerName: string;
  partnerAvatar?: string;
  lastMessage: string;
  lastMessageAt: Date;
  unreadCount: number;
}
