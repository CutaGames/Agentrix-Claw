import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import type { McpToolDescriptor } from '../../../../shared/types/creation';

/**
 * CreationCapabilityManifestEntity — 「能力清单(CapabilityManifest)」派生缓存表
 * (world-creation-feed task 1.3)。
 *
 * spec: .kiro/specs/world-creation-feed/{requirements,design}.md
 *   (§Data Models — 能力清单 / §Agent Invocation)
 *
 * 能力清单 = 从 Creation + offerings 自动派生的 MCP 工具集合(只读视图)。发布时由派生器
 * (task 2.2)对每个 `(offering, verb)` 投影出一个标准化 MCP 工具,写入本表作为缓存。
 *
 * Property 5(需求 1.5 / 1.11):清单 SHALL 始终对应当前 `ecsVersionId + offerings`;
 * 内容/offering 变更后旧清单失效或重派生,`version` 单调递增(对应 `creations.manifestVersion`)。
 * 故本表按 `(creationId, version)` 唯一保留各版本,支持回溯与一致性校验。
 *
 * 仓库硬规则(AGENTS.md):全局 SnakeNamingStrategy —— `@Column()` 禁止手写 `name:`。
 */
@Entity('creation_capability_manifests')
@Index(['creationId'])
// 同一 Creation 的每个清单版本唯一(version 单调递增,Property 5)。
@Index(['creationId', 'version'], { unique: true })
export class CreationCapabilityManifestEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 所属 Creation id(FK → creations.id)。 */
  @Column({ type: 'uuid' })
  creationId: string;

  /** 清单派生版本(单调递增,对应 `creations.manifestVersion`)。 */
  @Column({ type: 'integer' })
  version: number;

  /**
   * 派生溯源:对应的 ECS_World 版本(用于一致性校验,Property 5);
   * 纯地理创作或无内容时可空。
   */
  @Column({ type: 'uuid', nullable: true })
  ecsVersionId: string | null;

  /** 标准工具集合(每个 offering×verb → 一个标准化 MCP 工具)。jsonb 承载 McpToolDescriptor[]。 */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  tools: McpToolDescriptor[];

  /** 仅 Tier_C opt-in 的自定义工具(经审核 + 沙箱,deny-by-default,可空)。 */
  @Column({ type: 'jsonb', nullable: true })
  customTools: McpToolDescriptor[] | null;

  /** 是否为该 Creation 当前生效的清单(最新版本为 true,旧版本失效为 false)。 */
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
