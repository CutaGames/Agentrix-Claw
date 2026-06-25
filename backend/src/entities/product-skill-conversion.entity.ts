/**
 * Product Skill Conversion Entity
 * 
 * V2.0: 商品-Skill 转换关系表，记录商品自动转换为 Skill 的映射
 */

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
import { Skill } from './skill.entity';
import { Product } from './product.entity';

export enum ConversionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  OUTDATED = 'outdated',  // 商品更新后需要重新转换
}

export interface ConversionConfig {
  // 是否自动同步商品更新
  autoSync: boolean;
  // 是否使用 LLM 生成描述
  useLLMDescription: boolean;
  // 是否自动发布到marketplace
  autoPublish?: boolean;
  // 自定义描述模板
  descriptionTemplate?: string;
  // 自定义输入参数
  customInputFields?: Array<{
    name: string;
    type: string;
    description: string;
    required: boolean;
  }>;
  // 分佣比例覆盖
  commissionRateOverride?: number;
}

@Entity('product_skill_conversions')
@Index(['productId'], { unique: true })
export class ProductSkillConversion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 关联的商品
  @Column()
  productId: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn()
  product: Product;

  // 生成的 Skill
  @Column({ nullable: true })
  skillId: string;

  @ManyToOne(() => Skill, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn()
  skill: Skill;

  // 转换状态
  @Column({
    type: 'enum',
    enum: ConversionStatus,
    default: ConversionStatus.PENDING,
  })
  status: ConversionStatus;

  // 转换配置
  @Column({ type: 'jsonb', default: '{"autoSync": true, "useLLMDescription": true}' })
  conversionConfig: ConversionConfig;

  // LLM 生成的描述
  @Column({ type: 'text', nullable: true })
  generatedDescription: string;

  // 生成的输入 Schema
  @Column({ type: 'jsonb', nullable: true })
  generatedInputSchema: Record<string, any>;

  // 生成的输出 Schema
  @Column({ type: 'jsonb', nullable: true })
  generatedOutputSchema: Record<string, any>;

  // 转换错误信息
  @Column({ type: 'text', nullable: true })
  conversionError: string;

  // 最后转换时间
  @Column({ type: 'timestamp', nullable: true })
  lastConvertedAt: Date;

  // 商品最后更新时间 (用于检测是否需要重新转换)
  @Column({ type: 'timestamp', nullable: true })
  productLastUpdatedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
