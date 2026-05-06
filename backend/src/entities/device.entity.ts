import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Device — physical ClawCore device bound to a user (Phase 5 BE-10.2).
 *
 * Created during the QR/BLE pair flow. Stores the device session token
 * (DST) hash and connection metadata so the MQTT broker can authorise
 * frames and so OTA / approval flows can address the device.
 *
 * PRD: docs/PRD_PET_PHASED_TEST_PLAN.zh-CN.md §8.2 HW-T5.4 / HW-T5.5 / HW-T5.7
 */
@Entity('clawcore_devices')
@Index(['userId'])
@Index(['deviceId'], { unique: true })
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Owner. */
  @Column({ type: 'uuid' })
  userId: string;

  /** Stable device identifier (ESP32 MAC / nRF52 UUID / vendor SN). */
  @Column({ type: 'varchar', length: 64 })
  deviceId: string;

  /** Friendly user-facing label. */
  @Column({ type: 'varchar', length: 80, nullable: true })
  label: string | null;

  /** Device class: `claw_stick`, `plush`, `glass`, `wear_os`, `watch_os`, `other`. */
  @Column({ type: 'varchar', length: 32, default: 'other' })
  deviceClass: string;

  /** Vendor / ODM partner key (e.g. 'reference-claw-stick', 'partner-xyz'). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  vendor: string | null;

  /** Firmware version reported by device (semver). */
  @Column({ type: 'varchar', length: 32, nullable: true })
  firmwareVersion: string | null;

  /** SHA-256 of the Device Session Token (DST). Raw token never persisted. */
  @Column({ type: 'varchar', length: 64 })
  dstHash: string;

  /** Last accepted nonce (per-session monotonic guard). */
  @Column({ type: 'bigint', default: '0' })
  lastNonce: string;

  /** Online status reported via MQTT presence retained message. */
  @Column({ type: 'boolean', default: false })
  online: boolean;

  /** Last presence change. */
  @Column({ type: 'timestamptz', nullable: true })
  lastSeenAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
