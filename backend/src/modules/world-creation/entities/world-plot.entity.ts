import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  VersionColumn,
  Index,
} from 'typeorm';
import type {
  SubstrateTier,
  PlotStatus,
} from '../../../../shared/types/world-creation';

/**
 * WorldPlot — World_Map 上的一个可拥有单元 (design §7 Land_Economy, §12 数据模型)。
 *
 * 每个 Plot 绑定 **唯一** 一个 owner AgentAccount、一个 Substrate_Tier、
 * 一个 ECS_World (经 ecsVersionId 指向当前版本)，位于地图有限网格的 (mapX, mapY)。
 *
 * 乐观锁 @VersionColumn 支撑稀缺地块的获取与两阶段所有权转移
 * (design §7.1, R2.2 / R2.3): `UPDATE ... WHERE id=? AND version=?`，
 * 并发争抢时仅一人成功，另一人收到 PLOT_TAKEN。
 *
 * 全局 SnakeNamingStrategy：列名自动派生为 snake_case，禁止手写 name。
 */
@Entity('world_plots')
@Index(['ownerAccountId'])
@Index(['status'])
@Index(['mapX', 'mapY'], { unique: true })
export class WorldPlot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * 当前拥有者 AgentAccount (FK → agent_accounts.id)。
   * null = 尚未被获取的可获取地块 (稀缺池)。
   */
  @Column({ type: 'uuid', nullable: true })
  ownerAccountId: string | null;

  /**
   * 原创者 AgentAccount (FK → agent_accounts.id) — 首次获取该地块并创作体验的账户。
   * Marketplace 首次上架 (saleType='first') 仅限原创者 (R11.3)：转让后 ownerAccountId
   * 翻转为买家，但 originalCreatorAccountId 永久保留，用于区分一级 / 二级销售抽成与
   * 首次上架门控。null = 尚未被任何账户获取的空地块 (稀缺池)。
   */
  @Column({ type: 'uuid', nullable: true })
  originalCreatorAccountId: string | null;

  /** 声明的生成基底层级 (A/B/C)，决定 ECS_World 的能力天花板。 */
  @Column({ type: 'enum', enum: ['A', 'B', 'C'] })
  substrateTier: SubstrateTier;

  /**
   * 指向该 Plot 当前 ECS_World 版本 (FK → ecs_world_versions.id)。
   * null = 尚未生成任何 ECS_World (空地块)。
   */
  @Column({ type: 'uuid', nullable: true })
  ecsVersionId: string | null;

  /** 地图网格横坐标 (有限网格，与 mapY 组成唯一坐标)。 */
  @Column({ type: 'integer' })
  mapX: number;

  /** 地图网格纵坐标。 */
  @Column({ type: 'integer' })
  mapY: number;

  /** Plot 生命周期状态。 */
  @Column({
    type: 'enum',
    enum: ['draft', 'published', 'listed', 'unpublished', 'suspended'],
    default: 'draft',
  })
  status: PlotStatus;

  /** 可选展示名称。 */
  @Column({ type: 'varchar', length: 60, nullable: true })
  title: string | null;

  /** 绑定的 Agent_Builder (FK → agents.id)，用于离线自治维护 (design §9.2)。 */
  @Column({ type: 'uuid', nullable: true })
  boundAgentId: string | null;

  /**
   * 可分享 Plot 短码 (R11.5, design §10/§11.1)。发布后生成，格式与 v5 dungeon
   * `share_code` 一致 (6–12 位字母数字，SHA-256 派生，DB 唯一)，复用
   * `agentrix://world-engine/dungeon/{share_code}` 同款深链/卡片模型。
   * null = 尚未发布 / 未生成。唯一索引保证全局唯一 (与 dungeon 一致)。
   */
  @Index({ unique: true, where: '"share_code" IS NOT NULL' })
  @Column({ type: 'varchar', length: 12, nullable: true })
  shareCode: string | null;

  /** 乐观锁版本，用于地块获取/转让的两阶段提交 (design §7.1, R2.2)。 */
  @VersionColumn()
  version: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
