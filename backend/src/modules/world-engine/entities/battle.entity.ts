import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Battle — 两个 WorldAsset 角色之间的对战记录。
 *
 * 支持同步对战和异步挑战（72h 过期）。
 * 使用确定性战斗公式 + seeded RNG 确保可重放。
 */
@Entity('battles')
@Index(['challengerUserId'])
@Index(['defenderUserId'])
export class Battle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Challenger's WorldAsset (FK → world_assets.id) */
  @Column()
  challengerAssetId: string;

  /** Defender's WorldAsset (FK → world_assets.id) */
  @Column()
  defenderAssetId: string;

  /** Challenger user (FK → users.id) */
  @Column()
  challengerUserId: string;

  /** Defender user (FK → users.id) */
  @Column()
  defenderUserId: string;

  @Column({ type: 'enum', enum: ['pending', 'active', 'completed', 'cancelled', 'expired'] })
  status: string;

  /** Deterministic battle seed for reproducible combat */
  @Column({ type: 'bigint' })
  randomSeed: string;

  /** Full round-by-round battle log */
  @Column({ type: 'jsonb', nullable: true })
  rounds: Record<string, unknown>[] | null;

  /** Winner's WorldAsset ID (null if draw or incomplete) */
  @Column({ nullable: true })
  winnerAssetId: string | null;

  /** Number of rounds played */
  @Column({ default: 0 })
  totalRounds: number;

  /** S3 URL to the 15s replay video */
  @Column({ nullable: true })
  replayVideoUrl: string | null;

  /** XP awarded to each participant */
  @Column({ type: 'jsonb', nullable: true })
  xpAwarded: { challenger: number; defender: number } | null;

  /**
   * Phase B 玩家决策战斗。区分自动战斗('auto', 默认)与交互战斗('interactive')。
   */
  @Column({ type: 'varchar', length: 16, default: 'auto' })
  mode: string;

  /**
   * Phase B。交互战斗逐回合决策序列(challenger 一方;防守方 AI 由 seed 派生)。
   * 存 decisions[] + randomSeed 即可完整重放, 无需存每帧。null = 自动战斗/未开始。
   */
  @Column({ type: 'jsonb', nullable: true })
  decisions: Record<string, unknown>[] | null;

  /**
   * Phase B。交互战斗进行中的可序列化局面(InteractiveBattleState)。
   * 战斗结束后保留最终态。null = 自动战斗。
   */
  @Column({ type: 'jsonb', nullable: true })
  interactiveState: Record<string, unknown> | null;

  /** Async challenge expiration (72h for async challenges) */
  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
