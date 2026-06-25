import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export type TournamentStatus = 'open' | 'settled' | 'cancelled';

/**
 * ArenaTournamentEntity — 技能对赛奖池(P0-②)。
 *
 * 玩家付 AXP 报名费进奖池;结算时按"赛事窗口内该游戏的个人最高分"排名,前 N 名按 splits 瓜分
 * `奖池×(1-rake)`。纯技巧(非随机),规避博彩定性;仍需地区合规确认。
 */
@Entity('arena_tournaments')
@Index(['creationId'])
@Index(['status'])
export class ArenaTournamentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 关联的游戏创作 id。 */
  @Column({ type: 'uuid' })
  creationId: string;

  @Column({ type: 'varchar', length: 160 })
  title: string;

  /** 报名费(AXP)。 */
  @Column({ type: 'integer' })
  entryFeeAxp: number;

  /** 平台抽成(基点;1000=10%)。 */
  @Column({ type: 'integer', default: 1000 })
  rakeBps: number;

  /** 名次分成比例(和≈1),如 [0.5,0.3,0.2]。 */
  @Column({ type: 'jsonb', default: () => "'[0.5,0.3,0.2]'" })
  payoutSplits: number[];

  @Column({ type: 'varchar', length: 16, default: 'open' })
  status: TournamentStatus;

  /** 报名费累计(AXP);奖池 = 该值。 */
  @Column({ type: 'integer', default: 0 })
  prizePool: number;

  /** 计分窗口起点(默认创建时刻);结算读 game_scores 此后的最高分。 */
  @Column({ type: 'timestamptz', default: () => 'now()' })
  startsAt: Date;

  /** 截止报名/计分时间(可空=手动结算)。 */
  @Column({ type: 'timestamptz', nullable: true })
  endsAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  settledAt: Date | null;
}
