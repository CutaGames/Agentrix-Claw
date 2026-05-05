import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('a2a_match_tasks')
@Index(['ownerUserId', 'status'])
@Index(['status', 'createdAtMs'])
export class A2AMatchTaskEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'uuid' })
  ownerUserId: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  ownerAgentId?: string | null;

  @Column({ type: 'varchar', length: 160 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'integer' })
  budgetCents: number;

  @Column({ type: 'jsonb' })
  skillTags: string[];

  @Column({ type: 'varchar', length: 20 })
  status: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  matchedBidId?: string | null;

  @Column({ type: 'bigint' })
  createdAtMs: string;

  @Column({ type: 'bigint' })
  updatedAtMs: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
