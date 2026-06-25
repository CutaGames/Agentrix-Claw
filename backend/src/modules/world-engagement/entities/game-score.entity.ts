import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * GameScoreEntity — 创作(游戏)分数提交 + 周榜真相源(P0 keystone)。
 *
 * 玩法验证(render_game_to_text / postMessage 上报)落库;每条提交记 weekKey(ISO 周)
 * 以支持"本周高分榜"。服务端做轻量反作弊(上限/频次),分数权威以本表为准。
 * 仓库硬规则:全局 SnakeNamingStrategy —— @Column 禁止手写 name:。
 */
@Entity('game_scores')
@Index(['creationId', 'weekKey', 'score'])
@Index(['creationId', 'userId'])
export class GameScoreEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 被玩的创作 id(FK → creations.id)。 */
  @Column({ type: 'uuid' })
  creationId: string;

  /** 玩家用户 id。 */
  @Column({ type: 'uuid' })
  userId: string;

  /** 本局分数(服务端夹取上限后的权威值)。 */
  @Column({ type: 'integer' })
  score: number;

  /** ISO 周键(如 2026-W24),用于周榜窗口。 */
  @Column({ type: 'varchar', length: 12 })
  weekKey: string;

  /** 可选:本局状态文本快照(render_game_to_text),供审计/反作弊。 */
  @Column({ type: 'jsonb', nullable: true })
  stateSnapshot: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;
}
