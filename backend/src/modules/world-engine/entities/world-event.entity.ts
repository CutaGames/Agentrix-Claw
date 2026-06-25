import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * WorldEvent — 活世界剧情事件 (append-only)。
 *
 * design: docs/WORLD_ENGINE_X_AGENTRIX_ABILITY_BINDING_DESIGN_2026-05-29 §7 (Phase A2)。
 *
 * 把 agent-binding 现有的 idle actions(greet/comment/suggest_battle/interact_collection,
 * 此前 log-only)升级为**会落库的剧情事件**。WorldSimService.tick 推进世界一步时写入。
 * 用户的 World tab feed 时间线即读此表。
 *
 * 决定论:tick 的随机性用 (日期 + assetId) 派生 seed(见 WorldSimService),保证可复现 + 防刷。
 */
@Entity('world_events')
@Index(['userId', 'createdAt'])
@Index(['actorAssetId', 'createdAt'])
export class WorldEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 事件归属用户(资产 owner) */
  @Column({ type: 'uuid' })
  userId: string;

  /** 触发事件的主角资产 (FK → world_assets.id) */
  @Column({ type: 'uuid' })
  actorAssetId: string;

  /** 主角名(冗余, 便于 feed 直接展示不必 join) */
  @Column({ type: 'varchar', length: 64 })
  actorName: string;

  /**
   * 事件类型:
   *   work          — 打工(对应 agent 真实任务类型), 产出 AXP + XP
   *   social        — 社交(与其它居民互动)
   *   greet         — 问候 owner
   *   reflect       — 自省 / 评论时间
   *   explore       — 探索(为副本/远征埋点)
   *   level_up      — 升级(派生事件)
   */
  @Column({ type: 'varchar', length: 24 })
  type: string;

  /** 一句话剧情摘要(中文, feed 直接展示) */
  @Column({ type: 'varchar', length: 280 })
  summary: string;

  /** 结果标签(success/neutral/setback), 用于 feed 配色/图标 */
  @Column({ type: 'varchar', length: 16, default: 'neutral' })
  outcome: string;

  /** 本次事件对资产的属性增量(可空, 仅养成类事件有) */
  @Column({ type: 'jsonb', nullable: true })
  deltaStats: Record<string, number> | null;

  /** 本次事件产出的 XP */
  @Column({ type: 'integer', default: 0 })
  deltaXp: number;

  /** 本次事件产出的 AXP(打工收益, 软分;Phase A2 仅记录不结算真实账户) */
  @Column({ type: 'integer', default: 0 })
  deltaAxp: number;

  /** 派生该事件用的 tick seed(可复现/审计) */
  @Column({ type: 'bigint', nullable: true })
  tickSeed: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
