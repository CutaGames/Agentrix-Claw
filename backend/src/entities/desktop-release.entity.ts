import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Auto-update manifest entry for the desktop client.
 * Read by `GET /api/v1/desktop/update/:target/:arch/:current_version`.
 *
 * @see .kiro/specs/desktop-go-live/design.md §3.2
 */
@Entity({ schema: 'agentrix_desktop', name: 'releases' })
@Index('uniq_releases_version_target', ['version', 'channel', 'target', 'arch'], { unique: true })
@Index('idx_releases_active_lookup', ['channel', 'target', 'arch', 'isActive', 'pubDate'])
export class DesktopReleaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 32 })
  version: string;

  @Column({ type: 'varchar', length: 16, default: 'stable' })
  channel: string;

  @Column({ type: 'varchar', length: 32 })
  target: string;

  @Column({ type: 'varchar', length: 16 })
  arch: string;

  @Column({ type: 'text' })
  url: string;

  @Column({ type: 'text' })
  signature: string;

  @Column({ type: 'text', nullable: true })
  notesMd: string | null;

  @Column({ type: 'integer', default: 100 })
  rolloutPercent: number;

  @Column({ type: 'timestamp', default: () => 'NOW()' })
  pubDate: Date;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
