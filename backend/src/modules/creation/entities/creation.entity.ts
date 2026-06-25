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
  CreationType,
  CreationStatus,
  CreationGeo,
  CreationMetrics,
  CreationPreview,
  Offering,
} from '../../../../shared/types/creation';
import type { SubstrateTier } from '../../../../shared/types/world-creation';
import type { AeonPlotPoi } from '../../../../shared/types/aeon-world';

/**
 * CreationEntity — 统一「创作(Creation)」注册表主表(world-creation-feed task 1.1)。
 *
 * spec: .kiro/specs/world-creation-feed/{requirements,design}.md(§Data Models)
 *
 * 深合并(需求 12.6):把 A(Aeon 真实地理)与 B(v6 ECS 内容)合并为单一对象,
 * 同时承载两个维度 —— 二者均可空,一个 Creation 可:
 *   - 仅内容(纯线上游戏/场所,只进创作流,无 geo —— 需求 1.7);
 *   - 仅地理(地图上的点,内容维度初始为空 —— 需求 1.6);
 *   - 两者皆有(地图上可进入的店/游戏)。
 *
 * 单一真相源:地图、创作流、Agent 检索读同一对象。本实体属性与
 * `shared/types/creation.ts` 的 `Creation` 接口对齐(跨端单一来源)。
 *
 * 仓库硬规则(AGENTS.md):全局 SnakeNamingStrategy —— `@Column()` 禁止手写
 * `name:`,列名由 camelCase 属性自动派生为 snake_case。
 *
 * 注:状态机转换守卫(task 1.2)、派生表(creation_offerings / previews /
 * manifests / agent_invocations,task 1.3)、CRUD 服务(task 1.5)为后续任务,
 * 本任务仅落地实体 + 仓储 + 模块骨架。
 */
@Entity('creations')
@Index(['ownerAccountId'])
@Index(['originalCreatorAccountId'])
@Index(['status'])
@Index(['type'])
// 地图模式按网格单元检索(需求 4.1);nullable —— 纯内容创作无 geo。
@Index(['geoGridCell'])
export class CreationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 当前所有者账户 id(FK → agent_accounts.id)。 */
  @Column({ type: 'uuid' })
  ownerAccountId: string;

  /**
   * 首创者账户 id —— 抽成区分(一级/二级销售),沿用 v6 originalCreator 语义。
   * 转让后 ownerAccountId 翻转为买家,originalCreatorAccountId 永久保留。
   */
  @Column({ type: 'uuid' })
  originalCreatorAccountId: string;

  /** 创作类型(决定卡片渲染与流内主行动)。 */
  @Column({ type: 'enum', enum: ['game', 'shop', 'livestream', 'stage', 'place', 'drama'] })
  type: CreationType;

  /** 生命周期状态(需求 1.4),转换守卫见 task 1.2。 */
  @Column({
    type: 'enum',
    enum: ['draft', 'under_review', 'published', 'listed', 'unpublished', 'suspended'],
    default: 'draft',
  })
  status: CreationStatus;

  /** 标题。 */
  @Column({ type: 'varchar', length: 120 })
  title: string;

  /** 摘要(可空)。 */
  @Column({ type: 'varchar', length: 512, nullable: true })
  summary: string | null;

  // ── 内容维度(原 v6):指向当前 ECS_World 版本与基底层级 ──

  /** 声明的基底层级(A/B/C),决定 ECS_World 能力天花板。 */
  @Column({ type: 'enum', enum: ['A', 'B', 'C'], default: 'A' })
  substrateTier: SubstrateTier;

  /**
   * 当前 ECS_World 版本引用(FK → ecs_world_versions.id)。
   * null = 纯地理创作尚未生成内容(需求 1.5);内容编辑产生新版本而非覆盖。
   */
  @Column({ type: 'uuid', nullable: true })
  ecsVersionId: string | null;

  /** 绑定的 Agent_Builder id(离线自治建造,需求 2.5;可空)。 */
  @Column({ type: 'uuid', nullable: true })
  boundAgentId: string | null;

  // ── 地理维度(原 Aeon,均可空):仅内容创作可无地理(需求 1.6/1.7) ──

  /**
   * 地理锚点(经纬度 + 网格单元);纯内容创作为 null。
   * jsonb 承载 CreationGeo{lat,lng,gridCell};lat/lng 真实坐标做地图 marker。
   */
  @Column({ type: 'jsonb', nullable: true })
  geo: CreationGeo | null;

  /**
   * 网格单元键的扁平投影 —— 由 `geo.gridCell` 派生(服务层保持一致,task 1.5)。
   * 作为地图模式检索的可索引锚点(jsonb 内字段不便直接建索引);null = 无地理。
   */
  @Column({ type: 'varchar', length: 32, nullable: true })
  geoGridCell: string | null;

  /**
   * 真实商家入驻 POI 绑定(AeonPlotPoi):店名/类目/外部 POI id/认证/门店入口。
   * null = 普通创作(非商家绑定,需求 9.1)。
   */
  @Column({ type: 'jsonb', nullable: true })
  poi: AeonPlotPoi | null;

  // ── 双接口投影 ──

  /**
   * 预览物(封面/短视频/回放/首帧)。发布必备(需求 3.2);草稿期可为 null,
   * 发布时由 task 2.3 校验/自动生成占位。
   */
  @Column({ type: 'jsonb', nullable: true })
  preview: CreationPreview | null;

  /**
   * 0..N 供给项 → 人端展示 + 机器清单(需求 1.10)。
   * 派生缓存表见 task 1.3(creation_offerings);此处内联快照便于读取。
   */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  offerings: Offering[];

  /**
   * 能力清单派生版本 —— 随内容/offerings 变更单调递增(需求 1.11 / Property 5)。
   */
  @Column({ type: 'integer', default: 0 })
  manifestVersion: number;

  // ── 发现 / 社交 ──

  /**
   * 可分享短码(需求 3.6);发布后生成。唯一索引(非空时)保证全局唯一,
   * 复用 v6 / dungeon 同款 6–12 位字母数字格式。null = 未发布。
   */
  @Index({ unique: true, where: '"share_code" IS NOT NULL' })
  @Column({ type: 'varchar', length: 12, nullable: true })
  shareCode: string | null;

  /** 互动计数(需求 1.3):浏览/点赞/成交/留言。 */
  @Column({
    type: 'jsonb',
    default: () => "'{\"views\":0,\"likes\":0,\"sales\":0,\"comments\":0}'",
  })
  metrics: CreationMetrics;

  // ── Remix 血缘(P0-③):衍生作品成交时按血缘给上游分润 ──

  /** 直接母版 creation id(remix/fork 自此而来);原创为 null。 */
  @Column({ type: 'uuid', nullable: true })
  parentCreationId: string | null;

  /** 血缘根 creation id(整条 remix 链的源头);原创为 null。 */
  @Column({ type: 'uuid', nullable: true })
  rootCreationId: string | null;

  /**
   * 乐观锁版本 —— 支撑地理选址/圈地并发争抢(PLOT_TAKEN)与所有权转移
   * (与 aeon_plot / world_plots 一致)。
   */
  @VersionColumn()
  version: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
