import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum PluginCategory {
  PAYMENT = 'payment',
  ANALYTICS = 'analytics',
  MARKETING = 'marketing',
  INTEGRATION = 'integration',
  CUSTOM = 'custom',
}

@Entity('plugins')
export class Plugin {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 150 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ length: 50 })
  version: string;

  @Column({ length: 100 })
  author: string;

  @Column({
    type: 'enum',
    enum: PluginCategory,
  })
  category: PluginCategory;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  price: number;

  @Column({ length: 10, default: 'USD' })
  currency: string;

  @Column({ default: false })
  isFree: boolean;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  rating: number;

  @Column({ default: 0 })
  downloadCount: number;

  @Column({ type: 'varchar', length: 200, nullable: true })
  icon?: string;

  @Column({ type: 'text', array: true, default: '{}' })
  screenshots?: string[];

  @Column({ type: 'text', array: true, default: '{}' })
  capabilities?: string[];

  @Column({ type: 'text', array: true, default: '{}' })
  dependencies?: string[]; // 依赖的其他插件ID

  @Column({ type: 'jsonb', nullable: true })
  metadata?: {
    changelog?: string[];
    license?: string;
    repository?: string;
    documentation?: string;
    minAgentVersion?: string;
    maxAgentVersion?: string;
  };

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

