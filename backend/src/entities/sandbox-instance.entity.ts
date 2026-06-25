import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * SandboxInstance — 真 Docker 沙箱实例
 *
 * 由 DockerSandboxService 管理；每个 task / chat session 可分配一个实例，
 * 内置 shell / fs 工具通过 instanceId 路由到对应容器。
 */
export type SandboxStatus = 'creating' | 'running' | 'stopped' | 'destroyed' | 'error';

export interface SandboxResourceLimits {
  /** Memory limit in MB */
  memoryMb?: number;
  /** CPU shares (1024 = 1 core) */
  cpuShares?: number;
  /** Time-to-live in seconds (auto-destroy after) */
  ttlSec?: number;
}

@Entity('sandbox_instances')
@Index(['userId', 'status'])
@Index(['containerId'], { unique: false })
export class SandboxInstance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  taskId: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  sessionId: string | null;

  /** Docker container ID (full long ID) */
  @Column({ type: 'varchar', length: 128, nullable: true })
  containerId: string | null;

  /** Image name used (e.g. 'agentrix/sandbox:latest' or 'alpine:3.20') */
  @Column({ type: 'varchar', length: 256 })
  image: string;

  @Column({
    type: 'enum',
    enum: ['creating', 'running', 'stopped', 'destroyed', 'error'],
    default: 'creating',
  })
  status: SandboxStatus;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  limits: SandboxResourceLimits;

  /** Working directory inside container (default /workspace) */
  @Column({ type: 'varchar', length: 256, default: '/workspace' })
  workDir: string;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'bigint', nullable: true })
  startedAtMs: string | null;

  @Column({ type: 'bigint', nullable: true })
  destroyedAtMs: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
