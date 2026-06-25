import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

@Entity()
@Index(['userId', 'slug'], { unique: true })
export class WikiPage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @Column({ nullable: true })
  agentId: string;

  /** URL-friendly unique identifier */
  @Column()
  slug: string;

  @Column()
  title: string;

  /** Markdown content with [[wikilinks]] */
  @Column({ type: 'text', default: '' })
  content: string;

  /** Extracted outgoing [[wikilinks]] for graph traversal */
  @Column({ type: 'jsonb', default: [] })
  outgoingLinks: string[];

  /** Tags for categorization */
  @Column({ type: 'jsonb', default: [] })
  tags: string[];

  /** Linked memory IDs from agent-memory system */
  @Column({ type: 'jsonb', default: [] })
  linkedMemoryIds: string[];

  @Column({ type: 'int', default: 0 })
  viewCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
