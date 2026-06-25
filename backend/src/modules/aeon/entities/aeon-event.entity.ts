import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * AeonEvent — 现场活动/演出排期(社交场所 Step 3 / Stage 原语调度层)。
 *
 * 一个 Event 就是一场有主题、有时间、有主办方的现场活动(脱口秀/分享会/拍卖/演唱会…)。
 * 进入活动时连的实时房间 id 由 event id 派生(`aeon-live-<id>`),因此每场活动天然是
 * 一个独立并行的舞台直播厅——多场活动可同时进行,互不串场。
 *
 * 活动可选挂在某地块的某个"舞台建筑"上(buildItemId / plotId):从地图点进那栋楼即进现场。
 * 不挂建筑的活动是"全服线上活动",从活动列表直接进。
 *
 * status 由开始/结束时间派生展示(scheduled/live/ended),并允许主办方手动 cancel。
 * 全局 SnakeNamingStrategy:列名自动 snake_case,`@Column()` 不写 `name:`。
 */
@Entity('aeon_events')
@Index(['epoch'])
@Index(['startsAt'])
@Index(['hostUserId'])
@Index(['plotId'])
export class AeonEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 所属纪元(MVP earth)。 */
  @Column({ type: 'varchar', length: 16, default: 'earth' })
  epoch: string;

  /** 活动类型:talk_show/share/auction/concert/meetup/other。 */
  @Column({ type: 'varchar', length: 24, default: 'talk_show' })
  kind: string;

  @Column({ type: 'varchar', length: 80 })
  title: string;

  @Column({ type: 'varchar', length: 500, default: '' })
  description: string;

  /** 主办方用户(创建者,进场即为该活动 host)。 */
  @Column({ type: 'uuid' })
  hostUserId: string;

  /** 主办方展示名(快照)。 */
  @Column({ type: 'varchar', length: 64, default: '主办方' })
  hostName: string;

  /** 计划开始/结束时间。 */
  @Column({ type: 'timestamp' })
  startsAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  endsAt: Date | null;

  /** 可选:挂在某地块(从地图建筑进场)。 */
  @Column({ type: 'uuid', nullable: true })
  plotId: string | null;

  /** 可选:挂在某地块的舞台建筑(aeon_build_items.id)。 */
  @Column({ type: 'uuid', nullable: true })
  buildItemId: string | null;

  /** 主办方手动取消标记(true 即不再展示为可进)。 */
  @Column({ type: 'boolean', default: false })
  cancelled: boolean;

  /** 封面图(可空,用活动横幅)。 */
  @Column({ type: 'varchar', length: 512, nullable: true })
  coverUrl: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
