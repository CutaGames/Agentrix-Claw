import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { User } from './user.entity';

@Entity('user_provider_configs')
@Unique(['userId', 'providerId'])
@Index(['userId'])
export class UserProviderConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  /** Provider identifier: anthropic, openai, chatgpt-subscription, copilot-subscription, gemini, bedrock, deepseek, groq, zhipu, moonshot, baidu, alibaba */
  @Column({ name: 'provider_id', length: 50 })
  providerId: string;

  /** AES-256-GCM encrypted API key */
  @Column({ name: 'encrypted_api_key', type: 'text' })
  encryptedApiKey: string;

  /** AES-256-GCM encrypted secret key (Bedrock, Baidu) */
  @Column({ name: 'encrypted_secret_key', type: 'text', nullable: true })
  encryptedSecretKey?: string;

  /** Custom base URL (Azure OpenAI, self-hosted, etc.) */
  @Column({ name: 'base_url', length: 500, nullable: true })
  baseUrl?: string;

  /** AWS region for Bedrock */
  @Column({ length: 30, nullable: true })
  region?: string;

  /** Currently selected model ID for this provider */
  @Column({ name: 'selected_model', length: 100 })
  selectedModel: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'last_tested_at', nullable: true })
  lastTestedAt?: Date;

  @Column({ name: 'last_test_result', length: 20, nullable: true })
  lastTestResult?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
