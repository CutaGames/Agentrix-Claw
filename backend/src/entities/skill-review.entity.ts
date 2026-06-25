/**
 * Skill Review Entity
 * 
 * P1 优化: 新增 Skill 评分/评价系统
 * 允许用户和 Agent 对已使用的 Skill 进行评分和评价
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Skill } from './skill.entity';

@Entity('skill_reviews')
@Index(['skillId', 'createdAt'])
@Index(['reviewerId', 'skillId'], { unique: true })
export class SkillReview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  skillId: string;

  @ManyToOne(() => Skill, { nullable: false })
  @JoinColumn({ name: 'skill_id' })
  skill: Skill;

  @Column()
  reviewerId: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'reviewer_id' })
  reviewer: User;

  /** 评分 1-5 */
  @Column('decimal', { precision: 2, scale: 1 })
  rating: number;

  @Column({ type: 'text', nullable: true })
  title: string;

  @Column({ type: 'text', nullable: true })
  comment: string;

  /** 评价来源: user 或 agent */
  @Column({ length: 20, default: 'user' })
  reviewerType: 'user' | 'agent';

  /** 该评价者调用 Skill 的次数（评价时快照） */
  @Column({ default: 0 })
  usageCount: number;

  /** 是否已验证使用（真实调用过） */
  @Column({ default: false })
  verifiedUsage: boolean;

  /** 点赞数 */
  @Column({ default: 0 })
  helpfulCount: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
