import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

/**
 * 工作空间状态
 */
export enum WorkspaceStatus {
  ACTIVE = 'active',       // 活跃
  SUSPENDED = 'suspended', // 暂停
  ARCHIVED = 'archived',   // 归档
  DELETED = 'deleted',     // 已删除
}

/**
 * 工作空间类型
 */
export enum WorkspaceType {
  PERSONAL = 'personal',     // 个人空间（默认）
  TEAM = 'team',             // 团队空间
  ORGANIZATION = 'organization', // 组织空间
  ENTERPRISE = 'enterprise', // 企业空间
}

/**
 * 工作空间计划
 */
export enum WorkspacePlan {
  FREE = 'free',           // 免费版
  PRO = 'pro',             // 专业版
  BUSINESS = 'business',   // 商业版
  ENTERPRISE = 'enterprise', // 企业版
}

/**
 * 工作空间成员角色
 */
export enum WorkspaceMemberRole {
  OWNER = 'owner',         // 所有者
  ADMIN = 'admin',         // 管理员
  MEMBER = 'member',       // 成员
  VIEWER = 'viewer',       // 只读
  GUEST = 'guest',         // 访客
}

/**
 * 工作空间实体
 * 支持多租户和团队协作
 */
@Entity('workspaces')
@Index(['ownerId'])
@Index(['status'])
@Index(['slug'], { unique: true })
export class Workspace {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * 工作空间名称
   */
  @Column({ length: 100 })
  name: string;

  /**
   * URL 友好标识（唯一）
   */
  @Column({ length: 50, unique: true })
  slug: string;

  /**
   * 工作空间描述
   */
  @Column({ nullable: true, length: 500 })
  description: string;

  /**
   * 工作空间图标/Logo URL
   */
  @Column({ nullable: true })
  iconUrl: string;

  /**
   * 所有者用户ID
   */
  @ManyToOne(() => User)
  @JoinColumn()
  owner: User;

  @Column()
  ownerId: string;

  /**
   * 工作空间类型
   */
  @Column({
    type: 'enum',
    enum: WorkspaceType,
    default: WorkspaceType.PERSONAL,
  })
  type: WorkspaceType;

  /**
   * 订阅计划
   */
  @Column({
    type: 'enum',
    enum: WorkspacePlan,
    default: WorkspacePlan.FREE,
  })
  plan: WorkspacePlan;

  /**
   * 状态
   */
  @Column({
    type: 'enum',
    enum: WorkspaceStatus,
    default: WorkspaceStatus.ACTIVE,
  })
  status: WorkspaceStatus;

  /**
   * 最大成员数量（根据计划）
   */
  @Column({ default: 1 })
  maxMembers: number;

  /**
   * 最大 Agent 数量
   */
  @Column({ default: 3 })
  maxAgents: number;

  /**
   * 最大存储空间（MB）
   */
  @Column({ default: 100 })
  maxStorageMB: number;

  /**
   * 已使用存储空间（MB）
   */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  usedStorageMB: number;

  /**
   * 计划到期时间
   */
  @Column({ type: 'timestamp', nullable: true })
  planExpiresAt: Date;

  /**
   * 工作空间设置
   */
  @Column({ type: 'jsonb', nullable: true })
  settings: {
    defaultCurrency?: string;
    defaultLanguage?: string;
    timezone?: string;
    features?: string[];
    branding?: {
      primaryColor?: string;
      logoUrl?: string;
    };
    notifications?: {
      email?: boolean;
      slack?: boolean;
      webhook?: string;
    };
  };

  /**
   * 额外元数据
   */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  /**
   * 成员关系
   */
  @OneToMany(() => WorkspaceMember, (member) => member.workspace)
  members: WorkspaceMember[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/**
 * 工作空间成员实体
 * 管理用户与工作空间的关联关系
 */
@Entity('workspace_members')
@Index(['workspaceId', 'userId'], { unique: true })
@Index(['userId'])
export class WorkspaceMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Workspace, (workspace) => workspace.members, { onDelete: 'CASCADE' })
  @JoinColumn()
  workspace: Workspace;

  @Column()
  workspaceId: string;

  @ManyToOne(() => User)
  @JoinColumn()
  user: User;

  @Column()
  userId: string;

  /**
   * 成员角色
   */
  @Column({
    type: 'enum',
    enum: WorkspaceMemberRole,
    default: WorkspaceMemberRole.MEMBER,
  })
  role: WorkspaceMemberRole;

  /**
   * 显示昵称（在该工作空间内的昵称）
   */
  @Column({ nullable: true, length: 50 })
  displayName: string;

  /**
   * 是否接受邀请
   */
  @Column({ default: false })
  accepted: boolean;

  /**
   * 邀请时间
   */
  @Column({ type: 'timestamp', nullable: true })
  invitedAt: Date;

  /**
   * 接受邀请时间
   */
  @Column({ type: 'timestamp', nullable: true })
  acceptedAt: Date;

  /**
   * 邀请人
   */
  @Column({ nullable: true })
  invitedBy: string;

  /**
   * 成员权限覆盖（细粒度权限控制）
   */
  @Column({ type: 'jsonb', nullable: true })
  permissions: {
    canManageAgents?: boolean;
    canManageMembers?: boolean;
    canManageSettings?: boolean;
    canManageBilling?: boolean;
    canViewAnalytics?: boolean;
    canExportData?: boolean;
    restrictedAgentIds?: string[];
  };

  /**
   * 最后活跃时间
   */
  @Column({ type: 'timestamp', nullable: true })
  lastActiveAt: Date;

  @CreateDateColumn()
  joinedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
