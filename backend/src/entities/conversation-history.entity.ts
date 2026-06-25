import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('conversation_histories')
@Index(['merchantId', 'customerId'])
@Index(['merchantId', 'createdAt'])
export class ConversationHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'merchant_id' })
  @Index()
  merchantId: string;

  @Column({ name: 'customer_id' })
  @Index()
  customerId: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'text', nullable: true })
  response?: string;

  @Column({ type: 'json', nullable: true })
  context?: Record<string, any>;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

