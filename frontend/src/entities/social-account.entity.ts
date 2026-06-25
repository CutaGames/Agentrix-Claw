import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum SocialAccountType {
  GOOGLE = 'google',
  APPLE = 'apple',
  X = 'x',
  TELEGRAM = 'telegram',
  DISCORD = 'discord',
}

@Entity('social_accounts')
@Index(['userId', 'type'], { unique: true }) // 一个用户每种类型只能有一个账号
@Index(['socialId', 'type'], { unique: true }) // 同一个社交账号不能绑定多个用户
export class SocialAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.socialAccounts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @Column({
    type: 'enum',
    enum: SocialAccountType,
  })
  type: SocialAccountType;

  @Column({ length: 255 })
  socialId: string; // 第三方平台的用户ID

  @Column({ nullable: true })
  email?: string;

  @Column({ nullable: true })
  username?: string;

  @Column({ nullable: true })
  displayName?: string;

  @Column({ nullable: true, length: 500 })
  avatarUrl?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>; // 存储额外的第三方平台信息

  @CreateDateColumn()
  connectedAt: Date;

  @UpdateDateColumn()
  lastUsedAt: Date;
}

