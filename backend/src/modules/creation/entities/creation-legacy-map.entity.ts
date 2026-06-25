import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Legacy 源类型:深合并迁移的两个旧真相源。
 * - `world_plot`:原 B(v6 世界创作平台)的 `world_plots`(+ ECS 内容维度)。
 * - `aeon_plot`:原 A(Aeon / 永曜城)的真实地理地块(geo 维度)。
 *
 * 同一个 Creation 在深合并后可同时拥有这两类来源(geo + content 两个维度),
 * 因此映射以 (sourceType, legacyId) 为单位记录,而非"一个 Creation 一行"。
 */
export type CreationLegacySourceType = 'world_plot' | 'aeon_plot';

/**
 * CreationLegacyMapEntity — legacy ↔ Creation 映射表(world-creation-feed task 1.4)。
 *
 * spec: .kiro/specs/world-creation-feed/{requirements,design}.md(§Migration Strategy 阶段 2)
 *
 * 深合并迁移把原 A(aeon_plot,真实地理)与原 B(world_plots/ecs,内容)收敛为单一
 * Creation 真相源。本表是迁移期的"接缝":
 *   - 需求 12.1:定义统一 Creation 与既有两套表之间的**映射关系**。
 *   - 需求 12.2:回填(aeon_plot→Creation(geo)、world_plots/ecs→Creation(内容))期间
 *     建立 legacy id ↔ creation id 双向映射,保证幂等回填与对账(不重复建对象)。
 *
 * 双向查询:
 *   - 正向(双写 12.1):给定 legacy 源 → 解析其 creationId(影子写时去重/更新)。
 *   - 反向(对账 / 读切换 12.4):给定 creationId → 回溯其 legacy 源(按 sourceType)。
 *
 * 约束:
 *   - UNIQUE(sourceType, legacyId):一个 legacy 对象最多映射到一个 Creation(幂等回填基石)。
 *   - UNIQUE(creationId, sourceType):一个 Creation 在同一来源维度最多有一个 legacy 源
 *     (geo 与 content 各一,体现"同一对象两个维度"而非两套对象,需求 12.6)。
 *
 * 仓库硬规则(AGENTS.md):全局 SnakeNamingStrategy —— `@Column()` 禁止手写 `name:`,
 * 列名由 camelCase 属性自动派生为 snake_case。
 */
@Entity('creation_legacy_map')
// 反向解析(creationId → legacy 源)用。
@Index(['creationId'])
// 正向解析 + 幂等回填:同一 legacy 对象唯一映射。
@Index(['sourceType', 'legacyId'], { unique: true })
// 同一 Creation 在每个来源维度至多一个 legacy 源(geo / content 各一)。
@Index(['creationId', 'sourceType'], { unique: true })
export class CreationLegacyMapEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** legacy 源类型:`world_plot`(内容维度)/ `aeon_plot`(geo 维度)。 */
  @Column({ type: 'enum', enum: ['world_plot', 'aeon_plot'] })
  sourceType: CreationLegacySourceType;

  /**
   * legacy 对象主键。源表(world_plots / aeon_plot)均为 uuid,
   * 但此处以 varchar(64) 承载以保持来源无关、便于回填脚本通用化。
   */
  @Column({ type: 'varchar', length: 64 })
  legacyId: string;

  /** 映射到的统一 Creation id(FK → creations.id)。 */
  @Column({ type: 'uuid' })
  creationId: string;

  /**
   * 可空:回填时间戳。null 表示该映射由"双写过渡"(需求 12.1)在新建/编辑时
   * 即时写入;非 null 表示由"批量回填脚本"(需求 12.2)生成。便于对账区分来源。
   */
  @Column({ type: 'timestamptz', nullable: true })
  backfilledAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
