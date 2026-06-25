import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('a2a_match_trades')
@Index(['buyerUserId', 'createdAtMs'])
@Index(['sellerUserId', 'createdAtMs'])
export class A2ATradeEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'varchar', length: 64 })
  taskId: string;

  @Column({ type: 'varchar', length: 64 })
  bidId: string;

  @Column({ type: 'uuid' })
  buyerUserId: string;

  @Column({ type: 'uuid' })
  sellerUserId: string;

  @Column({ type: 'integer' })
  amountCents: number;

  @Column({ type: 'varchar', length: 16 })
  status: string;

  @Column({ type: 'bigint' })
  createdAtMs: string;

  @Column({ type: 'bigint', nullable: true })
  settledAtMs?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
