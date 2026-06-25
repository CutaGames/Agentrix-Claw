import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * First-run telemetry event. Only written when the user has explicitly
 * opted in (`localStorage.agentrix_telemetry_opt_in === '1'`).
 *
 * @see .kiro/specs/desktop-go-live/design.md §3.4
 * @see .kiro/specs/desktop-go-live/requirements.md US-G2-4
 */
@Entity({ schema: 'agentrix_desktop', name: 'analytics_events' })
@Index('idx_analytics_event_time', ['eventName', 'reportedAt'])
@Index('idx_analytics_device', ['deviceIdHash', 'reportedAt'])
export class DesktopAnalyticsEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64 })
  deviceIdHash: string;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  sessionId: string | null;

  @Column({ type: 'varchar', length: 64 })
  eventName: string;

  @Column({ type: 'jsonb', nullable: true })
  eventProps: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 32 })
  appVersion: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  osPlatform: string | null;

  @Column({ type: 'timestamp' })
  occurredAt: Date;

  @CreateDateColumn()
  reportedAt: Date;
}
