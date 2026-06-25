import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

/**
 * 人类推荐链 — 记录用户之间的推荐关系
 * A 推荐 B → B 推荐 C → C 购买 → A 和 B 都获得佣金
 */
@Entity('human_referral_chains')
@Index(['referrerId', 'referredId'], { unique: true })
@Index(['referredId'])
export class HumanReferralChain {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  referrerId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'referrer_id' })
  referrer: User;

  @Column()
  referredId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'referred_id' })
  referred: User;

  /** 推荐层级: 1=直接推荐, 2=二级推荐 */
  @Column({ default: 1 })
  level: number;

  /** 来源推广链接ID */
  @Column({ nullable: true })
  referralLinkId: string;

  /** 该推荐关系是否有效 */
  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
