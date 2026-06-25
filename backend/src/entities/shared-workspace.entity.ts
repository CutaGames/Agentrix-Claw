import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

// ── Shared Workspace (P8.4 — multi-user agent collaboration) ─────────────────

export enum WorkspaceRole {
  OWNER = 'owner',
  EDITOR = 'editor',
  VIEWER = 'viewer',
}

export enum WorkspaceInviteStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
  REVOKED = 'revoked',
}

@Entity('shared_workspaces')
export class SharedWorkspace {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  ownerId: string;

  @Column({ length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'jsonb', default: '{}' })
  settings: Record<string, unknown>;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('shared_workspace_members')
export class SharedWorkspaceMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  workspaceId: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'enum', enum: WorkspaceRole, default: WorkspaceRole.VIEWER })
  role: WorkspaceRole;

  @Column({ type: 'enum', enum: WorkspaceInviteStatus, default: WorkspaceInviteStatus.PENDING })
  inviteStatus: WorkspaceInviteStatus;

  @Column({ length: 200, nullable: true })
  invitedBy?: string;

  @Column({ type: 'timestamptz', nullable: true })
  joinedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('shared_workspace_sessions')
export class SharedWorkspaceSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  workspaceId: string;

  @Index()
  @Column({ length: 120 })
  sessionId: string;

  @Column({ type: 'uuid' })
  createdByUserId: string;

  @Column({ length: 200, default: 'Shared Chat' })
  title: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

// ── Device Media Transfer (P8.3 — cross-device media/file sharing) ───────────

@Entity('device_media_transfers')
export class DeviceMediaTransfer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ length: 120 })
  sourceDeviceId: string;

  @Column({ length: 120, nullable: true })
  targetDeviceId?: string;

  @Column({ length: 50 })
  mediaType: string; // 'photo', 'screenshot', 'file', 'gps'

  @Column({ length: 500, nullable: true })
  fileName?: string;

  @Column({ length: 100, nullable: true })
  mimeType?: string;

  @Column({ type: 'int', nullable: true })
  fileSize?: number;

  @Column({ type: 'text', nullable: true })
  dataUrl?: string; // base64 data URL for small payloads

  @Column({ type: 'text', nullable: true })
  storagePath?: string; // server-side file path for larger files

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>; // GPS coords, dimensions, etc.

  @Column({ length: 120, nullable: true })
  sessionId?: string;

  @Column({ length: 20, default: 'pending' })
  status: string; // 'pending', 'delivered', 'processed', 'expired'

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
