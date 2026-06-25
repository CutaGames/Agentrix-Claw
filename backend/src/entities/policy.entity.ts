import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum PolicyType {
  DAILY_LIMIT = 'daily_limit',
  SINGLE_LIMIT = 'single_limit',
  PROTOCOL_WHITELIST = 'protocol_whitelist',
  ACTION_WHITELIST = 'action_whitelist',
  AUTO_CLAIM_AIRDROP = 'auto_claim_airdrop',
}

@Entity('policies')
@Index(['userId'])
@Index(['workspaceId'])
export class Policy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  userId: string;

  @Column({ type: 'uuid', nullable: true })
  workspaceId: string;

  @Column({
    type: 'enum',
    enum: PolicyType,
  })
  type: PolicyType;

  @Column({ length: 150 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'jsonb' })
  value: any;

  @Column({ default: true })
  enabled: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
