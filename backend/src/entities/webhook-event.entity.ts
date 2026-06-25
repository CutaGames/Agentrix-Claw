import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('webhook_events')
export class WebhookEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  configId: string;

  @Column()
  eventType: string;

  @Column({ type: 'jsonb' })
  payload: any;

  @Column({
    type: 'enum',
    enum: ['pending', 'delivered', 'failed'],
    default: 'pending',
  })
  status: string;

  @Column({ default: 0 })
  attempts: number;

  @Column({ type: 'timestamp', nullable: true })
  lastAttemptAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  deliveredAt: Date;

  @Column({ type: 'text', nullable: true })
  error: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
