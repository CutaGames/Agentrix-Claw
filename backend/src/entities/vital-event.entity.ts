import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('vitals_events')
@Index(['userId', 'eventTsMs'])
@Index(['userId', 'metric', 'eventTsMs'])
export class VitalEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 32 })
  metric: string;

  @Column({ type: 'double precision' })
  value: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  sourceDeviceId?: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  sourceSurface?: string | null;

  @Column({ type: 'bigint' })
  eventTsMs: string;

  @Column({ type: 'jsonb', nullable: true })
  reaction?: {
    emotion?: string;
    intensity?: 0 | 1 | 2 | 3;
    reason: string;
  } | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
