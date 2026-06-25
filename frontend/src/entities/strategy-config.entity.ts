import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum StrategyType {
  ARBITRAGE = 'arbitrage',
  LAUNCHPAD = 'launchpad',
  DCA = 'dca',
  GRID = 'grid',
  COPY_TRADING = 'copy_trading',
}

@Entity('strategy_configs')
@Index(['userId', 'type'])
@Index(['agentId', 'enabled'])
export class StrategyConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  userId: string;

  @Column({ nullable: true })
  @Index()
  agentId?: string;

  @Column({
    type: 'enum',
    enum: StrategyType,
  })
  type: StrategyType;

  @Column({ default: false })
  enabled: boolean;

  @Column({ type: 'json' })
  config: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

