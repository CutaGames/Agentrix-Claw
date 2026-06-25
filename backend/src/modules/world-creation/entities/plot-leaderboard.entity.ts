import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * PlotLeaderboard — Plot 体验排行榜 (design §11.1 Battle Arena, §12, R16.4)。
 *
 * 竞技场等体验的赛季排行榜落库。运行时排行存于沙箱 state.kv:ranks，
 * 平台据此聚合并落本表 (赛季制刷新制造重复参与)。
 *
 * 全局 SnakeNamingStrategy：列名自动派生，禁止手写 name。
 */
@Entity('plot_leaderboards')
@Index(['plotId', 'season'], { unique: true })
export class PlotLeaderboard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 所属 Plot (FK → world_plots.id)。 */
  @Column({ type: 'uuid' })
  plotId: string;

  /** 赛季标识 (如 "2026-S1")。 */
  @Column({ type: 'varchar', length: 40 })
  season: string;

  /** 排行条目聚合 (从 state.kv:ranks 落库的有序榜单)。 */
  @Column({ type: 'jsonb' })
  entriesJson: Record<string, unknown>[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
