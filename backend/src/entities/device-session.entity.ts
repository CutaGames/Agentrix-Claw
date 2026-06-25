import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type FabricDeviceType = 'phone' | 'desktop' | 'web' | 'glass' | 'watch';
export type FabricScreenSize = 'none' | 'small' | 'medium' | 'large';

/**
 * DeviceSession — binds a user's active agent/voice session to one or more devices.
 *
 * Session Fabric concept (Phase 7C):
 *   A single agent session can span multiple devices simultaneously.
 *   ONE device is the primary input source (mic ownership).
 *   Output is dispatched to all participating devices based on their capabilities.
 *
 * Examples:
 *   - Glasses (primary, voice+vision) → phone (relay, approvals) → desktop (detailed output)
 *   - Phone (primary) → watch (quick approvals) → desktop (charts/reports)
 */
@Entity('device_sessions')
@Index(['userId', 'sessionId'])
@Index(['userId', 'deviceId'], { unique: true })
@Index(['sessionId', 'isPrimary'])
export class DeviceSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  /** Unified session ID (voice or chat session) */
  @Column({ length: 100 })
  sessionId: string;

  /** Device unique identifier (matches DevicePresence.deviceId) */
  @Column({ length: 100 })
  deviceId: string;

  @Column({ length: 20 })
  deviceType: FabricDeviceType;

  /** Whether this device currently owns mic input */
  @Column({ default: false })
  isPrimary: boolean;

  /** Device capability declaration */
  @Column({ type: 'jsonb', default: '{}' })
  capabilities: {
    hasCamera: boolean;
    hasMic: boolean;
    hasSpeaker: boolean;
    hasScreen: boolean;
    screenSize: FabricScreenSize;
    hasLocalModel: boolean;
  };

  /** Socket ID for direct push (volatile, cleared on disconnect) */
  @Column({ length: 200, nullable: true })
  socketId?: string;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  lastActiveAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
