import { IsString, IsOptional, IsEnum, IsArray, IsNumber, IsDateString, IsObject, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BudgetPoolStatus, FundingSource } from '../../../entities/budget-pool.entity';
import { MilestoneParticipant, ApprovalType, QualityGate, Artifact } from '../../../entities/milestone.entity';

// ===== Budget Pool DTOs =====

export class CreateBudgetPoolDto {
  @ApiProperty({ description: '预算池名称' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: '描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '关联的项目ID' })
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiProperty({ description: '总预算 (微单位)' })
  @IsNumber()
  @Min(0)
  totalBudget: number;

  @ApiProperty({ description: '币种', default: 'USDC' })
  @IsString()
  currency: string;

  @ApiPropertyOptional({ description: '关联的分佣计划ID' })
  @IsOptional()
  @IsString()
  splitPlanId?: string;

  @ApiPropertyOptional({ description: '过期时间' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({ description: '元数据' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class UpdateBudgetPoolDto {
  @ApiPropertyOptional({ description: '预算池名称' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: '描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '关联的分佣计划ID' })
  @IsOptional()
  @IsString()
  splitPlanId?: string;

  @ApiPropertyOptional({ description: '过期时间' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({ description: '元数据' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class FundBudgetPoolDto {
  @ApiProperty({ description: '充值金额 (微单位)' })
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiProperty({ description: '资金来源', enum: FundingSource })
  @IsEnum(FundingSource)
  fundingSource: FundingSource;

  @ApiPropertyOptional({ description: '支付意图ID (如果是 payment)' })
  @IsOptional()
  @IsString()
  paymentIntentId?: string;

  @ApiPropertyOptional({ description: '钱包地址 (如果是 wallet)' })
  @IsOptional()
  @IsString()
  walletAddress?: string;

  @ApiPropertyOptional({ description: '交易哈希' })
  @IsOptional()
  @IsString()
  txHash?: string;
}

// ===== Milestone DTOs =====

export class MilestoneParticipantDto implements MilestoneParticipant {
  @ApiProperty({ description: 'Agent ID' })
  @IsString()
  agentId: string;

  @ApiProperty({ description: '钱包地址' })
  @IsString()
  address: string;

  @ApiProperty({ description: '角色' })
  @IsString()
  role: string;

  @ApiPropertyOptional({ description: '分佣比例覆盖 (bps)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  shareOverride?: number;
}

export class QualityGateDto implements QualityGate {
  @ApiProperty({ description: '指标名称', enum: ['test_pass_rate', 'score', 'custom'] })
  @IsEnum(['test_pass_rate', 'score', 'custom'])
  metric: 'test_pass_rate' | 'score' | 'custom';

  @ApiProperty({ description: '阈值' })
  @IsNumber()
  threshold: number;

  @ApiProperty({ description: '比较操作符', enum: ['>=', '>', '=', '<', '<='] })
  @IsEnum(['>=', '>', '=', '<', '<='])
  operator: '>=' | '>' | '=' | '<' | '<=';

  @ApiPropertyOptional({ description: '自定义指标名称' })
  @IsOptional()
  @IsString()
  customMetricName?: string;
}

export class ArtifactDto implements Artifact {
  @ApiProperty({ description: '类型', enum: ['document', 'code', 'design', 'report', 'other'] })
  @IsEnum(['document', 'code', 'design', 'report', 'other'])
  type: 'document' | 'code' | 'design' | 'report' | 'other';

  @ApiPropertyOptional({ description: 'URL' })
  @IsOptional()
  @IsString()
  url?: string;

  @ApiPropertyOptional({ description: '内容哈希' })
  @IsOptional()
  @IsString()
  hash?: string;

  @ApiPropertyOptional({ description: '描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '元数据' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class CreateMilestoneDto {
  @ApiProperty({ description: '里程碑名称' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: '描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: '预算池ID' })
  @IsString()
  budgetPoolId: string;

  @ApiProperty({ description: '预留金额 (微单位)' })
  @IsNumber()
  @Min(0)
  reservedAmount: number;

  @ApiPropertyOptional({ description: '参与者列表', type: [MilestoneParticipantDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MilestoneParticipantDto)
  participants?: MilestoneParticipantDto[];

  @ApiPropertyOptional({ description: '验收类型', enum: ApprovalType, default: ApprovalType.MANUAL })
  @IsOptional()
  @IsEnum(ApprovalType)
  approvalType?: ApprovalType;

  @ApiPropertyOptional({ description: '质量门槛', type: QualityGateDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => QualityGateDto)
  qualityGate?: QualityGateDto;

  @ApiPropertyOptional({ description: '截止日期' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ description: '排序顺序' })
  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @ApiPropertyOptional({ description: '元数据' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class SubmitMilestoneDto {
  @ApiProperty({ description: '产出证明', type: [ArtifactDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ArtifactDto)
  artifacts: ArtifactDto[];

  @ApiPropertyOptional({ description: '提交备注' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class ApproveMilestoneDto {
  @ApiPropertyOptional({ description: '审核备注' })
  @IsOptional()
  @IsString()
  reviewNote?: string;

  @ApiPropertyOptional({ description: '质量评分 (如果使用 quality_gate)' })
  @IsOptional()
  @IsNumber()
  qualityScore?: number;
}

export class RejectMilestoneDto {
  @ApiProperty({ description: '拒绝原因' })
  @IsString()
  reason: string;

  @ApiPropertyOptional({ description: '审核备注' })
  @IsOptional()
  @IsString()
  reviewNote?: string;
}
