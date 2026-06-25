import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * CreationCommentEntity — 对 Creation 的留言(world-creation-feed task 8.1)。
 *
 * spec: 需求 8.1 —— 留言持久化并展示在该 Creation 下,创作者可在收件箱看到。
 * 支持楼中楼(parentCommentId)。SnakeNamingStrategy:列名自动派生,禁止手写 name。
 */
@Entity('creation_comments')
@Index(['creationId'])
@Index(['authorAccountId'])
export class CreationCommentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  creationId: string;

  @Column({ type: 'uuid' })
  authorAccountId: string;

  @Column({ type: 'text' })
  text: string;

  /** 父留言 id(楼中楼,可空)。 */
  @Column({ type: 'uuid', nullable: true })
  parentCommentId: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
