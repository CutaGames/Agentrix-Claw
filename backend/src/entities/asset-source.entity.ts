import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum AssetSourceStatus {
  ACTIVE = 'active',
  DISABLED = 'disabled',
}

@Entity('asset_sources')
export class AssetSource {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  url?: string;

  @Column({ type: 'enum', enum: AssetSourceStatus, default: AssetSourceStatus.ACTIVE })
  status: AssetSourceStatus;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @Column({ type: 'timestamp', nullable: true })
  lastRunAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastSuccessAt?: Date;

  @Column({ type: 'text', nullable: true })
  lastError?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

