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
import { UserAgent } from './user-agent.entity';

export enum DeploymentStatus {
  PENDING = 'pending',
  DEPLOYING = 'deploying',
  ACTIVE = 'active',
  FAILED = 'failed',
  PAUSED = 'paused',
}

export enum DeploymentType {
  SAAS = 'saas',
  DOCKER = 'docker',
}

@Entity('agent_deployments')
export class AgentDeployment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  agentId: string;

  @ManyToOne(() => UserAgent)
  @JoinColumn()
  agent: UserAgent;

  @Column({
    type: 'enum',
    enum: DeploymentType,
    default: DeploymentType.SAAS,
  })
  deploymentType: DeploymentType;

  @Column({
    type: 'enum',
    enum: DeploymentStatus,
    default: DeploymentStatus.PENDING,
  })
  status: DeploymentStatus;

  @Column({ type: 'varchar', length: 500, nullable: true })
  url?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  region?: string;

  @Column({ type: 'jsonb', nullable: true })
  config?: {
    autoScale?: boolean;
    resources?: {
      memory?: number;
      cpu?: number;
    };
    environment?: Record<string, string>;
  };

  @Column({ type: 'jsonb', nullable: true })
  metadata?: {
    deploymentId?: string; // 云平台部署ID
    instanceId?: string;
    logs?: string[];
    errors?: string[];
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

