import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';

/**
 * DevicePresence — persistent device registry for cross-device sync.
 *
 * Tracks all devices a user has connected, their online status,
 * capabilities, and last heartbeat time.
 */
@Entity('device_presence')
@Unique(['userId', 'deviceId'])
@Index(['userId', 'isOnline'])
export class DevicePresence {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ length: 100 })
  deviceId: string;

  @Column({ length: 30 })
  deviceType: string; // 'mobile' | 'desktop' | 'web' | 'watch' | 'band' | 'iot'

  @Column({ length: 200, nullable: true })
  deviceName?: string;

  @Column({ length: 50, nullable: true })
  platform?: string; // 'ios' | 'android' | 'windows' | 'macos' | 'linux' | 'web'

  @Column({ length: 30, nullable: true })
  appVersion?: string;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  lastSeenAt: Date;

  @Column({ default: false })
  isOnline: boolean;

  @Column({ type: 'jsonb', default: '[]' })
  capabilities: string[]; // ['voice', 'camera', 'notification', 'ble', 'nfc']

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
