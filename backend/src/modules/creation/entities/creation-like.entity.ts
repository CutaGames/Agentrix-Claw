import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * CreationLikeEntity — 对 Creation 的点赞(world-creation-feed task 8.1)。
 *
 * spec: 需求 8.2 —— 幂等点赞/取消。`(creationId, accountId)` 唯一,保证幂等。
 * SnakeNamingStrategy:列名自动派生,禁止手写 name。
 */
@Entity('creation_likes')
@Index(['creationId', 'accountId'], { unique: true })
@Index(['accountId'])
export class CreationLikeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  creationId: string;

  @Column({ type: 'uuid' })
  accountId: string;

  @CreateDateColumn()
  createdAt: Date;
}
