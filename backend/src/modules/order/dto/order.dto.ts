import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsNotEmpty,
  IsEnum,
  IsBoolean,
} from 'class-validator';
import { AssetType } from '../../../entities/order.entity';

export class CreateOrderDto {
  @ApiProperty({ description: '商户ID', required: false })
  @IsString()
  @IsOptional()
  merchantId?: string;

  @ApiProperty({ description: '商品ID (products表中的ID，Skill购买时可为空)', required: false })
  @IsString()
  @IsOptional()
  productId?: string;

  @ApiProperty({ description: 'Skill ID (skills表中的ID，Skill购买时使用)', required: false })
  @IsString()
  @IsOptional()
  skillId?: string;

  @ApiProperty({ description: '金额' })
  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @ApiProperty({ description: '货币类型', default: 'CNY' })
  @IsString()
  @IsOptional()
  currency: string = 'CNY';

  @ApiProperty({ description: 'Agent ID', required: false })
  @IsString()
  @IsOptional()
  agentId?: string;

  @ApiProperty({ description: '执行 Agent ID', required: false })
  @IsString()
  @IsOptional()
  execAgentId?: string;

  @ApiProperty({ description: '推荐 Agent ID', required: false })
  @IsString()
  @IsOptional()
  refAgentId?: string;

  @ApiProperty({ description: '推广 Agent/BD ID', required: false })
  @IsString()
  @IsOptional()
  promoterId?: string;

  @ApiProperty({ description: '订单资产类型', enum: AssetType, required: false })
  @IsEnum(AssetType)
  @IsOptional()
  assetType?: AssetType;

  @ApiProperty({ description: '巨头渠道税率（如Apple 30%）', required: false })
  @IsNumber()
  @IsOptional()
  platformTaxRate?: number;

  @ApiProperty({ description: '执行 Agent 是否具备钱包', required: false })
  @IsBoolean()
  @IsOptional()
  executorHasWallet?: boolean;

  @ApiProperty({ description: '元数据', required: false })
  @IsOptional()
  metadata?: any;
}

