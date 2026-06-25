import { IsString, IsOptional, IsEnum, IsArray, IsBoolean, IsObject, IsNumber, ValidateNested, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SplitPlanStatus, SplitSource, SplitRule, FeeConfig, AllocationTier, AllocationCap } from '../../../entities/split-plan.entity';

export class SplitRuleDto implements SplitRule {
  @ApiProperty({ description: '接收方地址 (钱包地址或用户ID)' })
  @IsString()
  recipient: string;

  @ApiProperty({ description: '分佣比例 (bps: 1 = 0.01%, 10000 = 100%)' })
  @IsNumber()
  @Min(0)
  @Max(10000)
  shareBps: number;

  @ApiProperty({ enum: ['executor', 'referrer', 'promoter', 'l1', 'l2', 'l3', 'custom'] })
  @IsEnum(['executor', 'referrer', 'promoter', 'l1', 'l2', 'l3', 'custom'])
  role: 'executor' | 'referrer' | 'promoter' | 'l1' | 'l2' | 'l3' | 'custom';

  @ApiProperty({ enum: SplitSource })
  @IsEnum(SplitSource)
  source: SplitSource;

  @ApiPropertyOptional({ description: '自定义角色名称' })
  @IsOptional()
  @IsString()
  customRoleName?: string;

  @ApiProperty({ description: '是否启用', default: true })
  @IsBoolean()
  active: boolean;
}

export class FeeConfigDto implements FeeConfig {
  @ApiProperty({ description: '法币入金费率 bps (默认 10 = 0.1%)', default: 10 })
  @IsNumber()
  @Min(0)
  @Max(1000)
  onrampFeeBps: number;

  @ApiProperty({ description: '法币出金费率 bps (默认 10 = 0.1%)', default: 10 })
  @IsNumber()
  @Min(0)
  @Max(1000)
  offrampFeeBps: number;

  @ApiProperty({ description: '分佣费率 bps (默认 30 = 0.3%)', default: 30 })
  @IsNumber()
  @Min(0)
  @Max(1000)
  splitFeeBps: number;

  @ApiProperty({ description: '最低分佣费 (微单位, 默认 100000 = 0.1 USDC)', default: 100000 })
  @IsNumber()
  @Min(0)
  minSplitFee: number;
}

export class CreateSplitPlanDto {
  @ApiProperty({ description: '计划名称' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: '计划描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ 
    description: '商品类型', 
    enum: ['physical', 'service', 'virtual', 'nft', 'skill', 'agent_task'],
    default: 'service'
  })
  @IsEnum(['physical', 'service', 'virtual', 'nft', 'skill', 'agent_task'])
  productType: 'physical' | 'service' | 'virtual' | 'nft' | 'skill' | 'agent_task';

  @ApiPropertyOptional({ description: '分佣规则列表', type: [SplitRuleDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SplitRuleDto)
  rules?: SplitRuleDto[];

  @ApiPropertyOptional({ description: '费率配置', type: FeeConfigDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => FeeConfigDto)
  feeConfig?: FeeConfigDto;

  @ApiPropertyOptional({ description: '阶梯规则' })
  @IsOptional()
  @IsArray()
  tiers?: AllocationTier[];

  @ApiPropertyOptional({ description: '封顶规则' })
  @IsOptional()
  @IsArray()
  caps?: AllocationCap[];

  @ApiPropertyOptional({ description: '元数据' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class UpdateSplitPlanDto {
  @ApiPropertyOptional({ description: '计划名称' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: '计划描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '分佣规则列表', type: [SplitRuleDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SplitRuleDto)
  rules?: SplitRuleDto[];

  @ApiPropertyOptional({ description: '费率配置', type: FeeConfigDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => FeeConfigDto)
  feeConfig?: FeeConfigDto;

  @ApiPropertyOptional({ description: '阶梯规则' })
  @IsOptional()
  @IsArray()
  tiers?: AllocationTier[];

  @ApiPropertyOptional({ description: '封顶规则' })
  @IsOptional()
  @IsArray()
  caps?: AllocationCap[];

  @ApiPropertyOptional({ description: '状态', enum: SplitPlanStatus })
  @IsOptional()
  @IsEnum(SplitPlanStatus)
  status?: SplitPlanStatus;

  @ApiPropertyOptional({ description: '元数据' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class PreviewAllocationDto {
  @ApiProperty({ description: '交易金额 (微单位)' })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ description: '币种', default: 'USDC' })
  @IsString()
  currency: string;

  @ApiPropertyOptional({ description: '商品类型' })
  @IsOptional()
  @IsEnum(['physical', 'service', 'virtual', 'nft', 'skill', 'agent_task'])
  productType?: 'physical' | 'service' | 'virtual' | 'nft' | 'skill' | 'agent_task';

  @ApiPropertyOptional({ description: '使用 Onramp' })
  @IsOptional()
  @IsBoolean()
  usesOnramp?: boolean;

  @ApiPropertyOptional({ description: '使用 Offramp' })
  @IsOptional()
  @IsBoolean()
  usesOfframp?: boolean;

  @ApiPropertyOptional({ description: '使用分佣' })
  @IsOptional()
  @IsBoolean()
  usesSplit?: boolean;

  @ApiPropertyOptional({ description: '分佣计划ID' })
  @IsOptional()
  @IsString()
  splitPlanId?: string;

  @ApiPropertyOptional({ description: '参与方覆盖' })
  @IsOptional()
  @IsObject()
  participantOverrides?: Record<string, string>;
}

export class AllocationPreviewResult {
  grossAmount: number;
  currency: string;
  fees: {
    onrampFee: number;
    offrampFee: number;
    splitFee: number;
    totalFees: number;
  };
  allocations: Array<{
    recipient: string;
    role: string;
    amount: number;
    percentage: number;
    source: string;
  }>;
  merchantNet: number;
  rateBreakdown: {
    onrampRate: string;
    offrampRate: string;
    splitRate: string;
  };
}
