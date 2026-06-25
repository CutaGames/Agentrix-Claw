/**
 * Skill Analytics Entity
 * 
 * V2.0: Skill 调用统计表，记录每次 Skill 调用的详细信息
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Skill } from './skill.entity';

export enum CallerType {
  AGENT = 'agent',
  HUMAN = 'human',
  SYSTEM = 'system',
}

export enum CallPlatform {
  AGENTRIX_WEB = 'agentrix_web',
  AGENTRIX_API = 'agentrix_api',
  CLAUDE_MCP = 'claude_mcp',
  OPENAI_GPT = 'openai_gpt',
  GEMINI = 'gemini',
  GROK = 'grok',
  SDK = 'sdk',
  OTHER = 'other',
}

@Entity('skill_analytics')
@Index(['skillId', 'createdAt'])
@Index(['callerId', 'createdAt'])
@Index(['platform', 'createdAt'])
export class SkillAnalytics {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 关联的 Skill
  @Column()
  skillId: string;

  @ManyToOne(() => Skill, { onDelete: 'CASCADE' })
  @JoinColumn()
  skill: Skill;

  // 调用者类型
  @Column({
    type: 'enum',
    enum: CallerType,
  })
  callerType: CallerType;

  // 调用者 ID (用户 ID 或 Agent ID)
  @Column({ length: 100, nullable: true })
  callerId: string;

  // 调用平台
  @Column({
    type: 'enum',
    enum: CallPlatform,
    default: CallPlatform.AGENTRIX_API,
  })
  platform: CallPlatform;

  // 执行时间 (毫秒)
  @Column({ type: 'int', nullable: true })
  executionTimeMs: number;

  // 是否成功
  @Column({ default: true })
  success: boolean;

  // 错误信息
  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  // 输入参数 (脱敏后)
  @Column({ type: 'jsonb', nullable: true })
  inputParams: Record<string, any>;

  // 产生的收益 (USD)
  @Column({ type: 'decimal', precision: 20, scale: 6, default: 0 })
  revenueGenerated: number;

  // 分账金额 (USD)
  @Column({ type: 'decimal', precision: 20, scale: 6, default: 0 })
  commissionAmount: number;

  // 关联的订单 ID
  @Column({ nullable: true })
  orderId: string;

  // 关联的会话 ID
  @Column({ nullable: true })
  sessionId: string;

  // 用户 IP (脱敏)
  @Column({ length: 50, nullable: true })
  userIpHash: string;

  // 用户 Agent
  @Column({ length: 500, nullable: true })
  userAgent: string;

  // 额外元数据
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;
}
