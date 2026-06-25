import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum BudgetPeriod {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

export enum BudgetStatus {
  ACTIVE = 'active',
  EXCEEDED = 'exceeded',
  COMPLETED = 'completed',
}

@Entity('budgets')
@Index(['userId'])
@Index(['status'])
export class Budget {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @Column({ length: 100, nullable: true })
  category?: string;

  @Column('decimal', { precision: 18, scale: 2 })
  amount: number;

  @Column({ length: 3 })
  currency: string;

  @Column({
    type: 'enum',
    enum: BudgetPeriod,
  })
  period: BudgetPeriod;

  @Column('date')
  startDate: Date;

  @Column('date')
  endDate: Date;

  @Column('decimal', { precision: 18, scale: 2, default: 0 })
  spent: number;

  @Column('decimal', { precision: 18, scale: 2 })
  remaining: number;

  @Column({
    type: 'enum',
    enum: BudgetStatus,
    default: BudgetStatus.ACTIVE,
  })
  status: BudgetStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

