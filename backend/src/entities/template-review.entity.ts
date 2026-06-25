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
import { AgentTemplate } from './agent-template.entity';

@Entity('template_reviews')
export class TemplateReview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  templateId: string;

  @ManyToOne(() => AgentTemplate)
  @JoinColumn()
  template: AgentTemplate;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn()
  user: User;

  @Column({ type: 'int' })
  rating: number; // 1-5

  @Column({ type: 'text', nullable: true })
  comment?: string;

  @Column({ default: false })
  isVerified: boolean; // 是否已验证购买/使用

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

