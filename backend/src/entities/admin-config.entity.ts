import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ConfigCategory {
  PLATFORM = 'platform',
  PAYMENT = 'payment',
  COMMISSION = 'commission',
  MARKETING = 'marketing',
  RISK = 'risk',
  SYSTEM = 'system',
}

@Entity('admin_configs')
export class AdminConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  key: string;

  @Column({
    type: 'enum',
    enum: ConfigCategory,
  })
  category: ConfigCategory;

  @Column('text')
  value: string;

  @Column({ nullable: true })
  description: string;

  @Column({ default: true })
  isPublic: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

