import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, Unique } from 'typeorm';

/**
 * ArenaEntryEntity — 一次锦标赛报名(每人每赛事一条)。
 * paid=报名费;bestScore/payout 在结算时回填;refunded=取消退款。
 */
@Entity('arena_entries')
@Index(['tournamentId'])
@Index(['userId'])
@Unique('uq_arena_entry_user', ['tournamentId', 'userId'])
export class ArenaEntryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tournamentId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'integer' })
  paid: number;

  @Column({ type: 'integer', nullable: true })
  bestScore: number | null;

  @Column({ type: 'integer', nullable: true })
  payout: number | null;

  @Column({ type: 'boolean', default: false })
  refunded: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
