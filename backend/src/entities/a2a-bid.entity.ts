import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('a2a_match_bids')
@Index(['taskId', 'status'])
@Index(['bidderUserId', 'createdAtMs'])
export class A2ABidEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'varchar', length: 64 })
  taskId: string;

  @Column({ type: 'uuid' })
  bidderUserId: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  bidderAgentId?: string | null;

  @Column({ type: 'integer' })
  priceCents: number;

  @Column({ type: 'integer' })
  etaMinutes: number;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @Column({ type: 'varchar', length: 16 })
  status: string;

  @Column({ type: 'bigint' })
  createdAtMs: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
