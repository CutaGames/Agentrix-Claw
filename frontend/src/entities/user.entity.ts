import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { SocialAccount } from './social-account.entity';

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

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  agentrixId: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    array: true,
    default: [UserRole.USER],
  })
  roles: UserRole[];

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  passwordHash: string;

  @Column({ nullable: true, unique: true })
  googleId: string;

  @Column({
    type: 'enum',
    enum: KYCLevel,
    default: KYCLevel.NONE,
  })
  kycLevel: KYCLevel;

  @Column({
    type: 'varchar',
    default: 'none',
  })
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
      timestamp: Date;
    }>;
    [key: string]: any;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => SocialAccount, (account) => account.user)
  socialAccounts: SocialAccount[];
}

