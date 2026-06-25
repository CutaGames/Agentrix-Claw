import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * AeonBuildItem — 地块内的建造物布局(Task 4.1 / R10)。
 *
 * 共建建造系统的持久化单元:用户在自己(或被授权)的地块上放置来自 World_Assets
 * 的资产或模块化科技未来城建筑目录项;功能建筑通过 links_to 链接到背后的 Org/Room/Stage,
 * 进入建筑即打开对应空间(R10.6)。重进地块按此布局还原(R10.5)。
 *
 * 遵循仓库硬规则:全局 SnakeNamingStrategy,`@Column()` 不写 `name:`。
 */
@Entity('aeon_build_items')
@Index(['plotId'])
export class AeonBuildItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 所属地块(FK → aeon_plots.id)。 */
  @Column({ type: 'uuid' })
  plotId: string;

  /** 来自用户 World_Assets 的资产(可空)。 */
  @Column({ type: 'uuid', nullable: true })
  sourceAssetId: string | null;

  /** 模块化建筑目录 id(可空)。 */
  @Column({ type: 'varchar', length: 64, nullable: true })
  catalogId: string | null;

  /** 地块内网格坐标(R10 边界 + 重叠校验依据)。 */
  @Column({ type: 'int', default: 0 })
  x: number;

  @Column({ type: 'int', default: 0 })
  y: number;

  /** 朝向(0/90/180/270)。 */
  @Column({ type: 'int', default: 0 })
  rotation: number;

  /** 链接到的 Org/Room/Stage id(功能建筑,R10.6)。 */
  @Column({ type: 'uuid', nullable: true })
  linksToId: string | null;

  /** 链接目标类型:org/room/stage/none。 */
  @Column({ type: 'varchar', length: 16, default: 'none' })
  linksToKind: string;

  /** 展示名(目录项名或资产名)。 */
  @Column({ type: 'varchar', length: 80, default: '建筑' })
  label: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
