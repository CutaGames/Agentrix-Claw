import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum OpenClawInstanceStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  PROVISIONING = 'provisioning',
  ERROR = 'error',
  UNLINKED = 'unlinked',
}

export enum OpenClawInstanceType {
  CLOUD = 'cloud',
  SELF_HOSTED = 'self_hosted',
  LOCAL = 'local',
}

@Entity('openclaw_instances')
export class OpenClawInstance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ length: 150 })
  name: string;

  @Column({ type: 'enum', enum: OpenClawInstanceType, default: OpenClawInstanceType.SELF_HOSTED })
  instanceType: OpenClawInstanceType;

  @Column({ type: 'enum', enum: OpenClawInstanceStatus, default: OpenClawInstanceStatus.ACTIVE })
  status: OpenClawInstanceStatus;

  @Column({ type: 'text', nullable: true })
  instanceUrl?: string;

  @Column({ type: 'text', nullable: true })
  instanceToken?: string;

  @Column({ nullable: true })
  cloudInstanceId?: string;

  @Column({ type: 'text', nullable: true })
  personality?: string;

  @Column({ default: false })
  isPrimary: boolean;

  @Column({ type: 'bigint', nullable: true })
  telegramChatId?: string;

  @Column({ length: 128, nullable: true, unique: true })
  relayToken?: string;

  @Column({ default: false })
  relayConnected: boolean;

  @Column({ nullable: true })
  subscriptionId?: string;

  @Column({ nullable: true })
  subscriptionStatus?: string;

  @Column({ nullable: true })
  localOs?: string;

  @Column({ type: 'jsonb', nullable: true })
  capabilities?: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
