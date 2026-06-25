import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CommissionSettlement } from './commission-settlement.entity';

@Entity('commission_allocations_v4')
export class CommissionAllocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'settlement_id' })
  settlementId: string;

  @Column()
  agentWallet: string;

  @Column()
  role: string;

  @Column('numeric', { precision: 20, scale: 6 })
  amount: string;

  @Column()
  status: string;

  @ManyToOne(() => CommissionSettlement, (settlement) => settlement.allocations)
  @JoinColumn()
  settlement: CommissionSettlement;
}
