import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('auto_earn_events')
@Index(['userId', 'eventTsMs'])
@Index(['userId', 'source', 'eventTsMs'])
export class AutoEarnEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64, unique: true })
  externalId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 32 })
  source: string;

  @Column({ type: 'integer' })
  amountCents: number;

  @Column({ type: 'varchar', length: 128, nullable: true })
  refId?: string | null;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @Column({ type: 'bigint' })
  eventTsMs: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
