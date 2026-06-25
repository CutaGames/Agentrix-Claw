import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum InvitationCodeStatus {
  AVAILABLE = 'available',
  USED = 'used',
  EXPIRED = 'expired',
  DISABLED = 'disabled',
}

@Entity('invitation_codes')
export class InvitationCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ length: 12 })
  code: string;

  @Column({ length: 50 })
  batch: string;

  @Column({
    type: 'enum',
    enum: InvitationCodeStatus,
    default: InvitationCodeStatus.AVAILABLE,
  })
  status: InvitationCodeStatus;

  @Column({ default: 1 })
  maxUses: number;

  @Column({ default: 0 })
  usedCount: number;

  /** User who redeemed this code (for single-use codes) */
  @Column({ type: 'uuid', nullable: true })
  usedByUserId?: string;

  @Column({ type: 'timestamp', nullable: true })
  usedAt?: Date;

  /** Distribution channel: twitter, discord, kol, friend, official */
  @Column({ length: 50, nullable: true })
  channel?: string;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt?: Date;

  @Column({ length: 50, default: 'system' })
  createdBy: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
