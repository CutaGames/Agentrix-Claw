/**
 * Commerce Publish DTO
 * 
 * Validation for the Commerce → Marketplace publish flow
 */

import { IsString, IsOptional, IsNumber, IsBoolean, IsArray, IsObject, ValidateNested, IsEnum, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

class PricingDto {
  @ApiProperty({ enum: ['free', 'per_call', 'subscription', 'revenue_share', 'percentage'] })
  @IsEnum(['free', 'per_call', 'subscription', 'revenue_share', 'percentage'] as const)
  type: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePerCall?: number;

  @ApiPropertyOptional({ default: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  freeQuota?: number;

  @ApiPropertyOptional({ description: 'Commission rate 0-100' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionRate?: number;
}

class SplitRuleDto {
  @ApiProperty()
  @IsString()
  recipient: string;

  @ApiProperty({ description: 'Share in basis points (10000 = 100%)' })
  @IsNumber()
  @Min(0)
  @Max(10000)
  shareBps: number;

  @ApiProperty()
  @IsString()
  role: string;
}

class FeeConfigDto {
  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @IsNumber()
  onrampFeeBps?: number;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @IsNumber()
  offrampFeeBps?: number;

  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @IsNumber()
  splitFeeBps?: number;

  @ApiPropertyOptional({ default: 100000 })
  @IsOptional()
  @IsNumber()
  minSplitFee?: number;
}

class SplitPlanConfigDto {
  @ApiPropertyOptional({ description: 'Use existing split plan' })
  @IsOptional()
  @IsString()
  splitPlanId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  productType?: string;

  @ApiPropertyOptional({ type: [SplitRuleDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SplitRuleDto)
  rules?: SplitRuleDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => FeeConfigDto)
  feeConfig?: FeeConfigDto;
}

class MilestoneConfigDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  reservedAmount: number;
}

class BudgetPoolConfigDto {
  @ApiProperty()
  @IsNumber()
  @Min(0)
  totalBudget: number;

  @ApiPropertyOptional({ default: 'USDC' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deadline?: string;

  @ApiPropertyOptional({ type: [MilestoneConfigDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MilestoneConfigDto)
  milestones?: MilestoneConfigDto[];
}

class ExecutorDto {
  @ApiProperty({ enum: ['http', 'internal', 'mcp', 'contract'] })
  @IsEnum(['http', 'internal', 'mcp', 'contract'] as const)
  type: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endpoint?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  method?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  internalHandler?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mcpServer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contractAddress?: string;
}

class MarketplaceConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  humanAccessible?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  targetPlatforms?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  legacyListing?: boolean;
}

export class CommercePublishDto {
  @ApiPropertyOptional({ description: 'Existing skill ID to publish; omit to create new' })
  @IsOptional()
  @IsString()
  skillId?: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  version?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  tags?: string[];

  @ApiPropertyOptional({ type: ExecutorDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExecutorDto)
  executor?: ExecutorDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  inputSchema?: any;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  outputSchema?: any;

  @ApiProperty({ type: PricingDto })
  @ValidateNested()
  @Type(() => PricingDto)
  pricing: PricingDto;

  @ApiPropertyOptional({ type: SplitPlanConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SplitPlanConfigDto)
  splitPlan?: SplitPlanConfigDto;

  @ApiPropertyOptional({ type: BudgetPoolConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BudgetPoolConfigDto)
  budgetPool?: BudgetPoolConfigDto;

  @ApiPropertyOptional({ type: MarketplaceConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => MarketplaceConfigDto)
  marketplace?: MarketplaceConfigDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  ucpEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  x402Enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
