import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { User } from './user.entity';
import { AdminUser } from './admin-user.entity';

export enum TicketStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

export enum TicketType {
  ACCOUNT = 'account',
  PAYMENT = 'payment',
  ORDER = 'order',
  REFUND = 'refund',
  TECHNICAL = 'technical',
  OTHER = 'other',
}

export enum TicketPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

@Entity('support_tickets')
export class SupportTicket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  ticketNumber: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ nullable: true })
  userId: string;

  @Column({
    type: 'enum',
    enum: TicketType,
  })
  type: TicketType;

  @Column({
    type: 'enum',
    enum: TicketStatus,
    default: TicketStatus.PENDING,
  })
  status: TicketStatus;

  @Column({
    type: 'enum',
    enum: TicketPriority,
    default: TicketPriority.MEDIUM,
  })
  priority: TicketPriority;

  @Column()
  subject: string;

  @Column('text')
  description: string;

  @ManyToOne(() => AdminUser, { nullable: true })
  @JoinColumn({ name: 'assignedToId' })
  assignedTo: AdminUser;

  @Column({ nullable: true })
  assignedToId: string;

  @Column({ type: 'jsonb', nullable: true })
  attachments: Array<{
    url: string;
    filename: string;
    mimeType: string;
  }>;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  resolvedAt: Date;

  @Column({ nullable: true })
  closedAt: Date;
}

@Entity('support_ticket_replies')
export class SupportTicketReply {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  ticketId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ nullable: true })
  userId: string;

  @ManyToOne(() => AdminUser, { nullable: true })
  @JoinColumn({ name: 'adminUserId' })
  adminUser: AdminUser;

  @Column({ nullable: true })
  adminUserId: string;

  @Column('text')
  content: string;

  @Column({ type: 'jsonb', nullable: true })
  attachments: Array<{
    url: string;
    filename: string;
    mimeType: string;
  }>;

  @Column({ default: false })
  isInternal: boolean;

  @CreateDateColumn()
  createdAt: Date;
}

