import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  OneToOne,
  Index,
} from 'typeorm';
import { SocialAccount } from './social-account.entity';
import { WorkspaceMember } from './workspace.entity';

export enum UserRole {
  USER = 'user',
  AGENT = 'agent',
  MERCHANT = 'merchant',
  DEVELOPER = 'developer',
}

export enum KYCLevel {
  NONE = 'none',
  BASIC = 'basic',
  VERIFIED = 'verified',
}

/**
 * 用户账户状态
 */
export enum UserStatus {
  ACTIVE = 'active',           // 正常
  PENDING = 'pending',         // 待验证
  SUSPENDED = 'suspended',     // 临时冻结
  FROZEN = 'frozen',           // 风控冻结
  CLOSED = 'closed',           // 主动注销
  BANNED = 'banned',           // 永久封禁
}

@Entity('users')
@Index(['status'])
@Index(['email'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'paymind_id', unique: true })
  agentrixId: string;

  @Column({ type: 'text',
    array: true,
    nullable: false,
    default: [UserRole.USER] })
  roles: UserRole[];

  /**
   * 用户账户状态
   */
  @Column({ type: 'enum',
    enum: UserStatus,
    default: UserStatus.ACTIVE })
  status: UserStatus;

  /**
   * 状态变更原因
   */
  @Column({ nullable: true, length: 500 })
  statusReason?: string;

  /**
   * 状态变更时间
   */
  @Column({ nullable: true })
  statusUpdatedAt?: Date;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  passwordHash: string;

  @Column({ nullable: true, unique: true })
  googleId: string;

  @Column({ nullable: true, unique: true })
  appleId: string;

  @Column({ nullable: true, unique: true })
  twitterId: string;

  @Column({ type: 'enum',
    enum: KYCLevel,
    default: KYCLevel.NONE })
  kycLevel: KYCLevel;

  @Column({ type: 'varchar',
    default: 'none' })
  kycStatus: string;

  @Column({ nullable: true })
  avatarUrl: string;

  @Column({ nullable: true })
  nickname: string;

  @Column({ nullable: true, type: 'text' })
  bio: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    preferences?: Record<string, any>;
    sessionSummaries?: Array<{
      sessionId: string;
      summary: string;
      source?: string;
      timestamp: Date;
    }>;
    [key: string]: any;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /**
   * 最后活跃时间
   */
  @Column({ nullable: true })
  lastActiveAt?: Date;

  /**
   * 默认资金账户 ID
   * 关联到 Account 实体
   */
  @Column({ nullable: true })
  defaultAccountId?: string;

  @OneToMany(() => SocialAccount, (account) => account.user)
  socialAccounts: SocialAccount[];

  /**
   * 工作空间成员关系
   */
  @OneToMany(() => WorkspaceMember, (member) => member.user)
  workspaceMemberships: WorkspaceMember[];

  @OneToOne('MerchantProfile', 'user')
  merchantProfile: any; // Use any to avoid circular dependency import issues or import it properly
}

