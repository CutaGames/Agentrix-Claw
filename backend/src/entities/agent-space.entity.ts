import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

// ── Agent Space (collaboration room) ─────────────────────────────────────────

export enum SpaceStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

export enum SpaceType {
  TASK_ROOM = 'task_room',
  COLLABORATION = 'collaboration',
  GENERAL = 'general',
}

@Entity('agent_spaces')
export class AgentSpace {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Index()
  @Column({ type: 'uuid' })
  ownerId: string;

  @Column({ type: 'enum', enum: SpaceType, default: SpaceType.GENERAL })
  type: SpaceType;

  @Column({ type: 'enum', enum: SpaceStatus, default: SpaceStatus.ACTIVE })
  status: SpaceStatus;

  /** Optional reference to an agent task that spawned this room */
  @Column({ type: 'uuid', nullable: true })
  taskId?: string;

  /** Optional reference to an agent instance */
  @Column({ type: 'uuid', nullable: true })
  agentInstanceId?: string;

  /** JSON array of member user IDs */
  @Column({ type: 'simple-json', nullable: true })
  memberIds?: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

// ── Agent Space Message ──────────────────────────────────────────────────────

export enum SpaceMessageType {
  TEXT = 'text',
  SYSTEM = 'system',
  AGENT_REPLY = 'agent_reply',
  TASK_UPDATE = 'task_update',
  ANNOUNCEMENT = 'announcement',
}

@Entity('agent_space_messages')
export class AgentSpaceMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  spaceId: string;

  @Index()
  @Column({ length: 100 })
  senderId: string;

  @Column({ length: 150, nullable: true })
  senderName?: string;

  @Column({ length: 20, nullable: true })
  senderAvatar?: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'enum', enum: SpaceMessageType, default: SpaceMessageType.TEXT })
  type: SpaceMessageType;

  /** Optional metadata (e.g., task progress %, agent call chain) */
  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;
}
