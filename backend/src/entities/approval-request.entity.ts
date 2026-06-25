import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * ApprovalRequest — 顿领 §5.2 4 级风险审批路由
 *
 * L0 读 / L1 低写 / L2 高写或单笔支付（Mobile 生物认证） /
 * L3 跨链或大额或团队预算（Mobile 生物 + ≥ 1 协签）
 */
@Entity('approval_requests')
@Index(['userId', 'status'])
@Index(['riskLevel', 'status'])
export class ApprovalRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  /** action.kind */
  @Column({ length: 20 })
  actionKind: string; // 'write' | 'pay' | 'transfer' | 'deploy' | 'delete'

  /** action.resource */
  @Column({ length: 64 })
  resource: string;

  @Column({ type: 'integer', nullable: true })
  amountCents?: number;

  @Column({ length: 20, nullable: true })
  chain?: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  payload: Record<string, unknown>;

  /** 0-3 */
  @Column({ type: 'smallint' })
  riskLevel: number;

  @Column({ length: 16 })
  initiatorSurface: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  requiredSurfaces: string[];

  @Column({
    type: 'enum',
    enum: ['pending', 'approved', 'denied', 'timeout', 'cancelled'],
    default: 'pending',
  })
  status: 'pending' | 'approved' | 'denied' | 'timeout' | 'cancelled';

  @Column({ type: 'bigint' })
  expiresAt: string;

  /** ApprovalRecord[] */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  approvals: Array<{
    surface: string;
    deviceId: string;
    at: number;
    method: 'tap' | 'biometric' | 'voice' | 'wrist-tap';
  }>;

  @CreateDateColumn()
  createdAt: Date;
}
