import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum AgentRiskTier {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

@Entity('agent_registry')
export class AgentRegistry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  agentId: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @ManyToOne(() => User)
  @JoinColumn()
  owner: User;

  @Column()
  ownerId: string;

  @Column({ nullable: true })
  publicKey: string;

  @Column({ nullable: true, select: false })
  clientSecret: string;

  @Column({
    type: 'enum',
    enum: AgentRiskTier,
    default: AgentRiskTier.MEDIUM,
  })
  riskTier: AgentRiskTier;

  @Column({ nullable: true })
  easAttestationUid: string; // EAS 链上存证 UID

  @Column({ type: 'jsonb', nullable: true })
  capabilities: string[];

  @Column({ type: 'jsonb', nullable: true })
  callbacks: {
    authSuccessUrl?: string;
    paymentSuccessUrl?: string;
    webhookUrl?: string;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
