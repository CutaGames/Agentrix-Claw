import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('transaction_classifications')
@Index(['transactionId'])
export class TransactionClassification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  transactionId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 100 })
  category: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  subcategory: string;

  @Column({ type: 'text', array: true, nullable: true })
  tags: string[];

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    comment: '分类置信度 0-100',
  })
  confidence: number;

  @CreateDateColumn()
  classifiedAt: Date;
}

