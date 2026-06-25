import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { PayIntent } from './pay-intent.entity';

@Entity('audit_proofs')
export class AuditProof {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  payIntentId: string;

  @Column({ nullable: true })
  authorizationId: string;

  @Column({ nullable: true })
  agentId: string;

  @Column({ type: 'jsonb' })
  decisionLog: {
    timestamp: Date;
    action: string;
    reason?: string;
    policyResults?: any;
    riskScore?: number;
  };

  @Column({ type: 'text', nullable: true })
  signature: string; // 对证据链的签名

  @Column({ type: 'varchar', length: 64, nullable: true })
  proofHash: string; // 当前证据的哈希值 (SHA-256)

  @Column({ type: 'varchar', length: 64, nullable: true })
  previousProofHash: string; // 前一个证据的哈希值，形成链式结构

  @CreateDateColumn()
  createdAt: Date;
}
