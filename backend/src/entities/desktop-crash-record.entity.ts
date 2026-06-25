import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Crash report aggregation. Same fingerprint within 10 minutes from same
 * device increments `count` instead of inserting a new row.
 *
 * Both opt-in users and opt-out users emit crash reports — the report only
 * carries a `device_id_hash` (SHA256), no user content is captured beyond
 * a sanitized stack trace.
 *
 * @see .kiro/specs/desktop-go-live/design.md §3.3
 */
@Entity({ schema: 'agentrix_desktop', name: 'crash_records' })
@Index('idx_crash_fingerprint_window', ['fingerprint', 'reportedAt'])
@Index('idx_crash_version', ['appVersion', 'reportedAt'])
@Index('idx_crash_device', ['deviceIdHash', 'reportedAt'])
export class DesktopCrashRecordEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64 })
  deviceIdHash: string;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ type: 'varchar', length: 32 })
  appVersion: string;

  @Column({ type: 'varchar', length: 128 })
  fingerprint: string;

  @Column({ type: 'varchar', length: 64 })
  type: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'text', nullable: true })
  stack: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  location: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  osPlatform: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  osVersion: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  arch: string | null;

  @Column({ type: 'timestamp' })
  occurredAt: Date;

  @CreateDateColumn()
  reportedAt: Date;

  @Column({ type: 'integer', default: 1 })
  count: number;
}
