import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import type { OfferingKind, CreationVerb } from '../../../../shared/types/creation';

/**
 * CreationOfferingEntity — 「供给项(Offering)」派生缓存表(world-creation-feed task 1.3)。
 *
 * spec: .kiro/specs/world-creation-feed/{requirements,design}.md(§Data Models — Offering)
 *
 * Offering 是"创作提供的产品/服务/能力"的统一描述,人端展示与机器端 MCP 工具都从它
 * 派生(需求 1.10)。发布时由派生器(task 2.1)从 ECS_World 的 `price`/`ui`/`affordance`
 * 实体 + 显式标注生成,写入本表作为规范化缓存;`creations.offerings`(jsonb)保留内联
 * 快照便于读取,本表用于按动词/类目/价格检索(Agent 能力检索,需求 13.1)。
 *
 * 仓库硬规则(AGENTS.md):全局 SnakeNamingStrategy —— `@Column()` 禁止手写 `name:`,
 * 列名由 camelCase 属性自动派生为 snake_case。
 */
@Entity('creation_offerings')
@Index(['creationId'])
// 同一 Creation 内 offeringId 唯一(对齐 shared Offering.id 语义:在 Creation 内唯一)。
@Index(['creationId', 'offeringId'], { unique: true })
export class CreationOfferingEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 所属 Creation id(FK → creations.id)。 */
  @Column({ type: 'uuid' })
  creationId: string;

  /** 在所属 Creation 内唯一的供给项 id(对齐 shared `Offering.id`)。 */
  @Column({ type: 'varchar', length: 64 })
  offeringId: string;

  /** 供给项类型(产品 / 服务 / 票务 / 订阅 / 打赏)。 */
  @Column({ type: 'enum', enum: ['product', 'service', 'ticket', 'subscription', 'tip'] })
  kind: OfferingKind;

  /** 名称(人端展示 + 工具描述)。 */
  @Column({ type: 'varchar', length: 200 })
  name: string;

  /** 描述(可空)。 */
  @Column({ type: 'text', nullable: true })
  description: string | null;

  /**
   * 展示价(AXP/USD,可空)。
   * NON-AUTHORITATIVE:权威成交金额始终由 Economy_Bridge 服务端计算(需求 7.1)。
   * jsonb 承载 `{ axp?: number; usd?: number }`。
   */
  @Column({ type: 'jsonb', nullable: true })
  price: { axp?: number; usd?: number } | null;

  /** 该 offering 支持的标准动词集合(CreationVerb[]),驱动 MCP 工具派生(需求 1.11)。 */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  verbs: CreationVerb[];

  /**
   * 可空:库存 / 时段 / 容量。
   * jsonb 承载 `{ stock?: number; schedule?: {startsAt;endsAt?}[]; capacity?: number }`。
   */
  @Column({ type: 'jsonb', nullable: true })
  availability: {
    stock?: number;
    schedule?: { startsAt: number; endsAt?: number }[];
    capacity?: number;
  } | null;

  /** 来源溯源:多数 offering 自 ECS 实体的 price/ui 组件派生(可空)。 */
  @Column({ type: 'varchar', length: 64, nullable: true })
  derivedFromEntityId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
