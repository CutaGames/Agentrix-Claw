import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';

/**
 * AeonPlotCheckin — 地理签到(到访真实地点的领地 → 奖励 AXP)。
 *
 * 基于实时 GPS 的地理社交:用户到达某地块附近(CHECKIN_RADIUS_M 内)可签到,
 * 每个地块每个用户每天一次(day = UTC yyyy-mm-dd)。防刷:唯一约束 (plot,user,day)。
 * 全局 SnakeNamingStrategy:`@Column()` 不写 `name:`。
 */
@Entity('aeon_plot_checkins')
@Unique(['plotId', 'userId', 'day'])
@Index(['userId'])
@Index(['plotId'])
export class AeonPlotCheckin {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  plotId: string;

  @Column({ type: 'uuid' })
  userId: string;

  /** 签到日(UTC yyyy-mm-dd),用于每天一次限制。 */
  @Column({ type: 'varchar', length: 10 })
  day: string;

  /** 签到时的实测坐标(留痕)。 */
  @Column({ type: 'double precision', nullable: true })
  lat: number | null;

  @Column({ type: 'double precision', nullable: true })
  lng: number | null;

  /** 本次发放的 AXP。 */
  @Column({ type: 'int', default: 0 })
  rewardAxp: number;

  @CreateDateColumn()
  createdAt: Date;
}
