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
import { User } from './user.entity';
import { Plugin } from './plugin.entity';

@Entity('user_plugins')
export class UserPlugin {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn()
  user: User;

  @Index()
  @Column({ type: 'uuid' })
  pluginId: string;

  @ManyToOne(() => Plugin)
  @JoinColumn()
  plugin: Plugin;

  @Column({ length: 50 })
  installedVersion: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'jsonb', nullable: true })
  config?: Record<string, any>;

  @CreateDateColumn()
  installedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

