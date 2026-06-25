import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * PetProactiveEvent — 主动陪伴事件审计表（顿领 §3.5 Phase 6 S2）
 *
 * Cron 每 30 min 评估，每个候选事件落库一行，无论是否真正下发：
 *   - status='sent' 实际经 WS 推送
 *   - status='suppressed' 被防爆量 / 静音 / 频次拦截
 *   - status='ack' 用户在桌宠气泡上点了"知道了"或开启了相关动作
 *
 * 设计取舍：
 *   - 不做幂等键，靠 (user_id, kind, dedupe_window) 软去重（service 层）
 *   - payload 用 jsonb 存渲染需要的字段（title/body/icon/cta_action）
 *   - intimacy_required 是事件触发时的门槛，方便事后做"用户应该升到 lv N"分析
 */
@Entity('pet_proactive_events')
@Index(['userId', 'createdAt'])
@Index(['userId', 'kind', 'createdAt'])
export class PetProactiveEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  /**
   * 事件种类：
   *   morning_greet | pomodoro | night_wind_down | birthday |
   *   intimacy_unlock_<lv> | mood_followup | anxiety_help | weekly_recap
   */
  @Column({ length: 64 })
  kind: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  payload: Record<string, unknown>;

  @Column({ type: 'smallint', default: 0 })
  intimacyRequired: number;

  /** 'sent' | 'suppressed' | 'ack' | 'dismissed' */
  @Column({ length: 16, default: 'sent' })
  status: string;

  @Column({ length: 64, nullable: true })
  suppressedReason: string | null;

  @Column({ type: 'timestamp', nullable: true })
  ackAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
