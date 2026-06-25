import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('auto_pay_grants')
export class AutoPayGrant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  user: User;

  @Column()
  userId: string;

  @Column()
  agentId: string;

  @Column('decimal', { precision: 15, scale: 2 })
  singleLimit: number;

  @Column('decimal', { precision: 15, scale: 2 })
  dailyLimit: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  usedToday: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  totalUsed: number;

  @Column()
  expiresAt: Date;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

