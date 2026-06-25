import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * AeonRoom — 共同在场容器(Task 1.4 / R5)。
 *
 * 房间用途(company/venue/meeting/market/public)由 `kind` + `config` 原语组合声明,
 * 引擎不写死场景(R5.3)。室内渲染为静态背景 + 站位(R5.8)。一个房间挂在某个 Plot 上;
 * 公司房间额外关联 org_id。
 *
 * 遵循仓库硬规则:全局 SnakeNamingStrategy,`@Column()` 不写 `name:`。
 */
@Entity('aeon_rooms')
@Index(['plotId'])
@Index(['orgId'])
export class AeonRoom {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 所属地块(FK → aeon_plots.id)。 */
  @Column({ type: 'uuid' })
  plotId: string;

  /** 关联组织(公司房间);非公司房间为 null。 */
  @Column({ type: 'uuid', nullable: true })
  orgId: string | null;

  /** 所属纪元(冗余,便于按纪元查询)。 */
  @Column({ type: 'varchar', length: 16, default: 'earth' })
  epoch: string;

  /** 房间类型:company/venue/meeting/market/public。 */
  @Column({ type: 'varchar', length: 16, default: 'public' })
  kind: string;

  /** 容量(真人+agent 合计),默认 20(MVP)。 */
  @Column({ type: 'int', default: 20 })
  capacity: number;

  /** 展示名。 */
  @Column({ type: 'varchar', length: 64, default: '房间' })
  displayName: string;

  /**
   * 原语组合配置:声明该房间挂了哪些原语(任务台/工位/市场货架/舞台-future)。
   * 引擎据此组合行为,不为单一场景写死。
   */
  @Column({ type: 'jsonb', nullable: true })
  config: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
