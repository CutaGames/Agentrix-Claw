import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import type { EcsWorld } from '../../../../shared/types/world-creation';

/**
 * EcsWorldVersion — ECS_World 的快照锚点 (design §2.3, §12 数据模型)。
 *
 * 每个 Plot 的世界历史由"快照锚点 (本表) + 增量 diff 链 (ecs_world_diffs)"组成。
 * 快照保存某个 versionId 下的完整 ECS_World JSON，revert 时从最近锚点重放 diff。
 *
 * 全局 SnakeNamingStrategy：列名自动派生，禁止手写 name。
 */
@Entity('ecs_world_versions')
@Index(['plotId'])
export class EcsWorldVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 所属 Plot (FK → world_plots.id)。 */
  @Column({ type: 'uuid' })
  plotId: string;

  /** 完整 ECS_World 快照 (canonical 可序列化表示)。 */
  @Column({ type: 'jsonb' })
  snapshotJson: EcsWorld;

  /** 快照产生时间 (Unix epoch millis，bigint 以 string 表示)。 */
  @Column({ type: 'bigint' })
  ts: string;

  @CreateDateColumn()
  createdAt: Date;
}
