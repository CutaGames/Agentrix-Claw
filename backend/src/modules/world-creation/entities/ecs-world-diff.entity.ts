import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import type {
  JsonPatchOp,
  EcsAuthorType,
} from '../../../../shared/types/world-creation';

/**
 * EcsWorldDiff — ECS_World 的增量 diff 链 (design §2.3, R3.2 / R4.5 / R9.7)。
 *
 * 每次创作 (prompt 生成 / NL 编辑 / 直接操作 / Agent 自治) 产出一个结构化
 * JSON Patch (RFC 6902) diff，而非整体覆盖。diff 标注 author (user / agent)，
 * 保证可读、可 diff、可回滚，并支撑 Agent 自治产物的归因。
 *
 * 全局 SnakeNamingStrategy：列名自动派生，禁止手写 name。
 */
@Entity('ecs_world_diffs')
@Index(['plotId'])
@Index(['parentVersionId'])
export class EcsWorldDiff {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 所属 Plot (FK → world_plots.id)。 */
  @Column({ type: 'uuid' })
  plotId: string;

  /**
   * 此 diff 应用到的父版本 (FK → ecs_world_versions.id)。
   * null = 应用到初始空世界。
   */
  @Column({ type: 'uuid', nullable: true })
  parentVersionId: string | null;

  /** 作者类型 — 用于 revert 与 Agent 自治归因 (R9.7)。 */
  @Column({ type: 'enum', enum: ['user', 'agent'] })
  authorType: EcsAuthorType;

  /** 作者 id (user id 或 Agent_Builder id)。 */
  @Column({ type: 'varchar' })
  authorId: string;

  /** 有序 JSON Patch (RFC 6902) 操作列表。 */
  @Column({ type: 'jsonb' })
  opsJson: JsonPatchOp[];

  /** diff 产生时间 (Unix epoch millis，bigint 以 string 表示)。 */
  @Column({ type: 'bigint' })
  ts: string;

  @CreateDateColumn()
  createdAt: Date;
}
