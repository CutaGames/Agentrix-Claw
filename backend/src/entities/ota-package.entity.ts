import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * OtaPackage — firmware build available for download by ClawCore devices.
 *
 * PRD: docs/PRD_PET_PHASED_DEV_PLAN.zh-CN.md §8.3 BE-10.3 (OTA chunk service, L1)
 * Test:  docs/PRD_PET_PHASED_TEST_PLAN.zh-CN.md §8.2 HW-T5.8 / HW-T5.15
 *
 * The actual firmware bytes are stored on disk / object storage at
 * `storagePath`; this row is the metadata + integrity manifest. Devices fetch
 * it in fixed-size chunks (default 4 KiB) via `OtaService.getChunk`.
 */
@Entity('clawcore_ota_packages')
@Index(['deviceClass', 'channel'])
@Index(['deviceClass', 'version'], { unique: true })
export class OtaPackage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Same vocabulary as Device.deviceClass. */
  @Column({ type: 'varchar', length: 32 })
  deviceClass: string;

  /** Semver. */
  @Column({ type: 'varchar', length: 32 })
  version: string;

  /** 'stable' | 'staging' | 'dev'. */
  @Column({ type: 'varchar', length: 16, default: 'stable' })
  channel: string;

  /** Total firmware size in bytes. */
  @Column({ type: 'bigint' })
  sizeBytes: string;

  /** SHA-256 hex of the full firmware blob (lowercase). */
  @Column({ type: 'varchar', length: 64 })
  sha256: string;

  /** Local filesystem or object-storage URL. */
  @Column({ type: 'varchar', length: 512 })
  storagePath: string;

  /** Optional release notes (markdown). */
  @Column({ type: 'text', nullable: true })
  notes: string | null;

  /** When set, devices below this version MUST upgrade. */
  @Column({ type: 'boolean', default: false })
  mandatory: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
