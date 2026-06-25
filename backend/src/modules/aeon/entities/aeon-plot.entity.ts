import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  VersionColumn,
  Index,
  Unique,
} from 'typeorm';

/**
 * AeonPlot — 用户在真实城市坐标上圈定并拥有的世界用地(Task 1.2 / R4)。
 *
 * 设计:地球地图层(用法 a)选址锚。`grid_cell` 由 (lat,lng) 量化(共享
 * `toGridCell`),`@Unique(['epoch','gridCell'])` 保证同一纪元每格至多一个 active Plot。
 * lat/lng 保留真实坐标做地图 marker。设备 GPS 不用于限制圈地(R4.7)。
 *
 * 遵循仓库硬规则:全局 SnakeNamingStrategy,`@Column()` 不写 `name:`(列名自动 snake_case)。
 */
@Entity('aeon_plots')
@Index(['ownerUserId'])
@Unique(['epoch', 'gridCell'])
export class AeonPlot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 地块拥有者(FK → users.id) */
  @Column({ type: 'uuid' })
  ownerUserId: string;

  /** 所属纪元(earth/mars/galaxy)。MVP 仅 earth。 */
  @Column({ type: 'varchar', length: 16, default: 'earth' })
  epoch: string;

  /** 真实地理纬度(选址锚)。 */
  @Column({ type: 'double precision' })
  lat: number;

  /** 真实地理经度(选址锚)。 */
  @Column({ type: 'double precision' })
  lng: number;

  /** 量化网格单元键(epoch+grid_cell 唯一)。 */
  @Column({ type: 'varchar', length: 32 })
  gridCell: string;

  /** 地块状态:active / dormant(休眠待回收)。 */
  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: string;

  /** 展示名(小镇/公司名)。 */
  @Column({ type: 'varchar', length: 64, default: '未命名领地' })
  displayName: string;

  /** 最近 owner 活动时间(ms epoch),用于休眠回收判定(R4.6)。 */
  @Column({ type: 'bigint', nullable: true })
  lastActivityAt: string | null;

  /**
   * 地块配置(jsonb):建造授权名单 `buildGrantees: string[]`(R10.3)等。
   * 预留扩展(布局元信息/主题),不为单一用途焊死。
   */
  @Column({ type: 'jsonb', nullable: true })
  config: Record<string, unknown> | null;

  /**
   * 真实商家入驻 POI 绑定(AeonPlotPoi):店名/类目/外部 POI id/商家用户/认证/门店入口。
   * null = 普通居民地块(非商家)。
   */
  @Column({ type: 'jsonb', nullable: true })
  poi: Record<string, unknown> | null;

  /** 乐观锁(与现有 world-asset 一致,防并发圈地/转移竞态)。 */
  @VersionColumn()
  version: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
