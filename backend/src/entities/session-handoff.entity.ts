import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum HandoffStatus {
  INITIATED = 'initiated',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
  COMPLETED = 'completed',
}

/**
 * SessionHandoff — tracks cross-device session transfer requests.
 *
 * When a user wants to move an Agent conversation from one device
 * to another (e.g. mobile → desktop), a handoff record is created.
 * The target device can accept or reject it.
 */
@Entity('session_handoffs')
@Index(['userId', 'status'])
@Index(['targetDeviceId', 'status'])
export class SessionHandoff {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  agentId: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  sessionId?: string;

  // Source device
  @Column({ length: 100 })
  sourceDeviceId: string;

  @Column({ length: 30, nullable: true })
  sourceDeviceType?: string; // 'mobile' | 'desktop' | 'web' | 'watch'

  // Target device
  @Column({ length: 100, nullable: true })
  targetDeviceId?: string; // null = broadcast to all devices

  @Column({ length: 30, nullable: true })
  targetDeviceType?: string;

  // Handoff state
  @Column({
    type: 'enum',
    enum: HandoffStatus,
    default: HandoffStatus.INITIATED,
  })
  status: HandoffStatus;

  // Context snapshot to transfer
  @Column({ type: 'jsonb', nullable: true })
  contextSnapshot?: {
    lastMessages?: any[];
    agentState?: Record<string, any>;
    scrollPosition?: number;
    inputDraft?: string;
  };

  @Column({ type: 'timestamptz', nullable: true })
  acceptedAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
