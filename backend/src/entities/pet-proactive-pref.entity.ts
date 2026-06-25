import {
  Entity,
  PrimaryColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';

/**
 * PetProactivePref — 用户主动陪伴偏好（per-user 单行）
 *
 * 默认值：
 *   max_per_4h = 1     防 Replika 翻车
 *   quiet_hours_start = 23, quiet_hours_end = 8
 *   enabled_kinds = ['morning_greet','pomodoro','night_wind_down','intimacy_unlock','weekly_recap']
 *   mute_until = 0     全局静音时间戳（ms）
 */
@Entity('pet_proactive_prefs')
export class PetProactivePref {
  @PrimaryColumn({ type: 'uuid' })
  userId: string;

  @Column({ type: 'smallint', default: 1 })
  maxPer4h: number;

  /** 静默时段开始小时（0-23 本地时间） */
  @Column({ type: 'smallint', default: 23 })
  quietHoursStart: number;

  @Column({ type: 'smallint', default: 8 })
  quietHoursEnd: number;

  /** 启用的事件种类（白名单） */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  enabledKinds: string[];

  /** 全局静音到此时间戳为止（ms） */
  @Column({ type: 'bigint', default: 0 })
  muteUntil: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
