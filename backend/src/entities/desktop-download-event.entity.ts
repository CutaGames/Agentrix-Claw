import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Download intent event — fired when a user clicks the desktop download
 * button on agentrix.top/download. Used to attribute installs to UTM /
 * referrer / country.
 *
 * @see .kiro/specs/desktop-ga-internal-beta/design.md §2
 */
@Entity({ schema: 'agentrix_desktop', name: 'download_events' })
@Index('idx_dl_time', ['occurredAt'])
@Index('idx_dl_source', ['utmSource', 'occurredAt'])
export class DesktopDownloadEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  utmSource: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  utmCampaign: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  utmMedium: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  inviteCode: string | null;

  @Column({ type: 'text', nullable: true })
  referrer: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  userAgentHash: string | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  ipCountry: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  platform: string | null;

  @CreateDateColumn()
  occurredAt: Date;
}
