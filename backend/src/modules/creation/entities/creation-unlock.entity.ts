import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

/**
 * CreationUnlockEntity — 互动剧(及未来付费内容)的"按集解锁" entitlement。
 *
 * 用途:用户用 AXP 解锁某集后写入一行;再次进入时据此免重复扣费(幂等)。
 * (creationId, userId, episode) 唯一 —— 同一用户对同一集只解锁一次。
 *
 * 仓库硬规则(AGENTS.md):全局 SnakeNamingStrategy,`@Column()` 禁止手写 `name:`,
 * 列名由 camelCase 自动派生 snake_case(creationId → creation_id 等)。
 */
@Entity('creation_unlocks')
@Index(['creationId', 'userId'])
@Index(['creationId', 'userId', 'episode'], { unique: true })
export class CreationUnlockEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 所属创作 id(FK 语义 → creations.id)。 */
  @Column({ type: 'uuid' })
  creationId: string;

  /** 解锁者用户 id。 */
  @Column({ type: 'uuid' })
  userId: string;

  /** 解锁的集号(1 起)。 */
  @Column({ type: 'integer' })
  episode: number;

  /** 解锁时实际扣除的 AXP(审计用)。 */
  @Column({ type: 'integer', default: 0 })
  chargedAxp: number;

  @CreateDateColumn()
  createdAt: Date;
}
