import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('intent_records')
@Index(['userId'])
export class IntentRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  agentId: string;

  @Column({ type: 'text' })
  intentText: string;

  @Column({ type: 'jsonb', comment: '识别的意图和实体' })
  recognizedIntent: {
    intent: string;
    entities: {
      amount?: number;
      percentage?: number;
      token?: string;
      frequency?: string;
      [key: string]: any;
    };
  };

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    comment: '识别置信度 0-100',
  })
  confidence: number;

  @Column({ type: 'uuid', nullable: true, comment: '生成的策略图ID' })
  strategyGraphId: string;

  @CreateDateColumn()
  createdAt: Date;
}

