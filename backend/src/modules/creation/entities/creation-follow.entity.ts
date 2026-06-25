import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * CreationFollowEntity — 关注创作者(world-creation-feed task 8.1)。
 *
 * spec: 需求 8.3 —— 关注创作者后,其后续作品纳入「关注」创作流口径(需求 5.6)。
 * `(followerAccountId, creatorAccountId)` 唯一(幂等)。供 CreationFollowResolver
 * 解析 following 口径(feed-personalization 接缝)。
 * SnakeNamingStrategy:列名自动派生,禁止手写 name。
 */
@Entity('creation_follows')
@Index(['followerAccountId', 'creatorAccountId'], { unique: true })
@Index(['followerAccountId'])
@Index(['creatorAccountId'])
export class CreationFollowEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 关注者账户 id。 */
  @Column({ type: 'uuid' })
  followerAccountId: string;

  /** 被关注的创作者账户 id。 */
  @Column({ type: 'uuid' })
  creatorAccountId: string;

  @CreateDateColumn()
  createdAt: Date;
}
