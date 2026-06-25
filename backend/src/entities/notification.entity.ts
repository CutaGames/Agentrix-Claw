import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum NotificationType {
  PAYMENT = 'payment',
  SYSTEM = 'system',
  SECURITY = 'security',
  PROMOTION = 'promotion',
  APPROVAL = 'approval',
  TRANSACTION = 'transaction',
}

// ── Device Push Token (persistent push token registry) ────────────────────────

@Entity('device_push_tokens')
export class DevicePushToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn()
  user: User;

  @Column({ length: 500 })
  token: string;

  @Column({ length: 20 })
  platform: string;

  @Column({ length: 100, nullable: true })
  deviceId?: string;

  @CreateDateColumn()
  registeredAt: Date;
}

// ── Notification ──────────────────────────────────────────────────────────────

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn()
  user: User;

  @Column({
    type: 'enum',
    enum: NotificationType,
    default: NotificationType.SYSTEM,
  })
  type: NotificationType;

  @Column()
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ default: false })
  read: boolean;

  @Column({ nullable: true })
  actionUrl: string;

  @Column({ type: 'jsonb', nullable: true })
  data: Record<string, any>;

  @Column({ length: 20, nullable: true })
  approvalStatus: 'pending' | 'approved' | 'rejected' | null;

  @CreateDateColumn()
  createdAt: Date;
}

