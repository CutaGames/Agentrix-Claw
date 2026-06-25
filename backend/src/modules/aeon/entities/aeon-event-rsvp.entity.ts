import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';

/**
 * AeonEventRsvp — 活动预约/报名(社交场所 Step 3)。
 *
 * 用户对某场 Event 表达"我要来"。用于:开演提醒、报名人数展示、主办方预估到场。
 * (user_id, event_id) 唯一,重复预约幂等。
 * 全局 SnakeNamingStrategy:列名自动 snake_case,`@Column()` 不写 `name:`。
 */
@Entity('aeon_event_rsvps')
@Unique(['eventId', 'userId'])
@Index(['eventId'])
@Index(['userId'])
export class AeonEventRsvp {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  eventId: string;

  @Column({ type: 'uuid' })
  userId: string;

  /** 预约者展示名(快照)。 */
  @Column({ type: 'varchar', length: 64, default: '居民' })
  userName: string;

  @CreateDateColumn()
  createdAt: Date;
}
