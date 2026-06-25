/**
 * Commerce Execute DTO
 * 
 * Validation for the unified commerce execute endpoint
 */

import { IsString, IsOptional, IsEnum, IsObject, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { CommerceAction, CommerceMode } from '../commerce.service';

export class CommerceExecuteDto {
  @ApiProperty({
    description: 'The commerce action to perform',
    enum: [
      'createOrder', 'getOrder', 'updateOrder',
      'createPaymentIntent', 'capturePayment', 'refundPayment',
      'createSplitPlan', 'getSplitPlan', 'getSplitPlans', 'updateSplitPlan',
      'activateSplitPlan', 'archiveSplitPlan', 'deleteSplitPlan', 'previewAllocation',
      'createBudgetPool', 'getBudgetPool', 'getBudgetPools', 'updateBudgetPool',
      'fundBudgetPool', 'cancelBudgetPool', 'getPoolStats',
      'createMilestone', 'getMilestones', 'getMilestone', 'startMilestone',
      'submitMilestone', 'approveMilestone', 'rejectMilestone', 'releaseMilestone',
      'getSettlements', 'payoutSettlement',
      'getLedger',
    ],
  })
  @IsString()
  action: CommerceAction;

  @ApiPropertyOptional({
    description: 'Commerce operation mode',
    enum: ['PAY_ONLY', 'SPLIT_ONLY', 'PAY_AND_SPLIT'],
    default: 'PAY_AND_SPLIT',
  })
  @IsOptional()
  @IsEnum(['PAY_ONLY', 'SPLIT_ONLY', 'PAY_AND_SPLIT'] as const)
  mode?: CommerceMode;

  @ApiPropertyOptional({
    description: 'Action-specific parameters',
    type: 'object',
  })
  @IsOptional()
  @IsObject()
  params?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Idempotency key for safe retries',
  })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
