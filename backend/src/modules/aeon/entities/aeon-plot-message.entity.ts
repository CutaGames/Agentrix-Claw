import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * AeonPlotMessage — 地块留言板(地图社交,R-social)。
 *
 * 访客在别人的领地留言("留言"动作)。轻量社交原语:谁、在哪块地、留了什么。
 * 全局 SnakeNamingStrategy:列名自动 snake_case,`@Column()` 不写 `name:`。
 */
@Entity('aeon_plot_messages')
@Index(['plotId'])
export class AeonPlotMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 留言所在地块(FK → aeon_plots.id)。 */
  @Column({ type: 'uuid' })
  plotId: string;

  /** 地块拥有者(冗余存,便于"我收到的留言"查询)。 */
  @Column({ type: 'uuid' })
  plotOwnerUserId: string;

  /** 留言者。 */
  @Column({ type: 'uuid' })
  authorUserId: string;

  /** 留言者展示名(快照,避免每次 join)。 */
  @Column({ type: 'varchar', length: 64, default: '匿名居民' })
  authorName: string;

  /** 留言正文。 */
  @Column({ type: 'varchar', length: 280 })
  body: string;

  @CreateDateColumn()
  createdAt: Date;
}
