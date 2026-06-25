import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsNotEmpty,
  Min,
  Max,
  IsEnum,
  IsArray,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProductType } from '../../../entities/product.entity';

/**
 * 批量导入单个商品的数据结构
 * 字段与 CSV/Excel 列对应
 */
export class BatchImportProductItem {
  @ApiProperty({ description: '商品名称', example: 'iPhone 15 Pro' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: '商品描述', example: '苹果最新旗舰手机' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: '价格', example: 7999 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty({ description: '货币', example: 'CNY', default: 'CNY' })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiProperty({ description: '库存数量', example: 100 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  stock?: number;

  @ApiProperty({ description: '分类', example: '电子产品' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiProperty({ 
    description: '商品类型', 
    enum: ['physical', 'service', 'nft', 'ft', 'game_asset', 'rwa'],
    example: 'physical',
    default: 'physical'
  })
  @IsString()
  @IsOptional()
  productType?: string;

  @ApiProperty({ description: '佣金率(%)', example: 5, default: 5 })
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  commissionRate?: number;

  @ApiProperty({ description: '商品图片URL', example: 'https://example.com/image.jpg' })
  @IsString()
  @IsOptional()
  image?: string;

  @ApiProperty({ description: '标签(逗号分隔)', example: '手机,苹果,旗舰' })
  @IsString()
  @IsOptional()
  tags?: string;

  @ApiProperty({ description: 'SKU编码', example: 'SKU-001' })
  @IsString()
  @IsOptional()
  sku?: string;

  // NFT/Token 特有字段
  @ApiProperty({ description: '区块链', example: 'ethereum' })
  @IsString()
  @IsOptional()
  chain?: string;

  @ApiProperty({ description: '合约地址', example: '0x...' })
  @IsString()
  @IsOptional()
  contractAddress?: string;

  @ApiProperty({ description: 'Token ID', example: '1024' })
  @IsString()
  @IsOptional()
  tokenId?: string;

  // 游戏资产特有字段
  @ApiProperty({ description: '游戏名称', example: 'World of Warcraft' })
  @IsString()
  @IsOptional()
  gameName?: string;

  @ApiProperty({ description: '稀有度', example: 'legendary' })
  @IsString()
  @IsOptional()
  rarity?: string;

  // 服务特有字段
  @ApiProperty({ description: '服务时长(分钟)', example: 60 })
  @IsNumber()
  @IsOptional()
  duration?: number;

  @ApiProperty({ description: '交付物', example: '代码Review报告' })
  @IsString()
  @IsOptional()
  deliverables?: string;
}

/**
 * 批量导入请求DTO
 */
export class BatchImportDto {
  @ApiProperty({ 
    description: '商品数据数组', 
    type: [BatchImportProductItem],
    minItems: 1 
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BatchImportProductItem)
  products: BatchImportProductItem[];

  @ApiProperty({ 
    description: '导入模式: create=仅创建新商品, upsert=存在则更新',
    enum: ['create', 'upsert'],
    default: 'create'
  })
  @IsString()
  @IsOptional()
  mode?: 'create' | 'upsert';

  @ApiProperty({ 
    description: '是否跳过错误继续导入',
    default: true
  })
  @IsOptional()
  skipErrors?: boolean;
}

/**
 * 批量导入结果
 */
export class BatchImportResultDto {
  @ApiProperty({ description: '总数' })
  total: number;

  @ApiProperty({ description: '成功数' })
  success: number;

  @ApiProperty({ description: '失败数' })
  failed: number;

  @ApiProperty({ description: '跳过数(重复等)' })
  skipped: number;

  @ApiProperty({ description: '错误详情' })
  errors: Array<{
    row: number;
    name: string;
    error: string;
  }>;

  @ApiProperty({ description: '成功创建的商品ID列表' })
  createdIds: string[];
}

/**
 * CSV/Excel 模板列定义
 */
export const IMPORT_TEMPLATE_COLUMNS = [
  { key: 'name', label: '商品名称', required: true, example: 'iPhone 15 Pro' },
  { key: 'description', label: '商品描述', required: false, example: '苹果最新旗舰手机，A17芯片' },
  { key: 'price', label: '价格', required: true, example: '7999' },
  { key: 'currency', label: '货币', required: false, example: 'CNY', default: 'CNY' },
  { key: 'stock', label: '库存', required: false, example: '100', default: '999' },
  { key: 'category', label: '分类', required: true, example: '电子产品' },
  { key: 'productType', label: '商品类型', required: false, example: 'physical', default: 'physical', 
    note: 'physical/service/nft/ft/game_asset/rwa' },
  { key: 'commissionRate', label: '佣金率(%)', required: false, example: '5', default: '5' },
  { key: 'image', label: '图片URL', required: false, example: 'https://example.com/img.jpg' },
  { key: 'tags', label: '标签(逗号分隔)', required: false, example: '手机,苹果,旗舰' },
  { key: 'sku', label: 'SKU编码', required: false, example: 'SKU-001' },
  { key: 'chain', label: '区块链(NFT/Token)', required: false, example: 'ethereum' },
  { key: 'contractAddress', label: '合约地址(NFT/Token)', required: false, example: '0x...' },
  { key: 'tokenId', label: 'Token ID(NFT)', required: false, example: '1024' },
  { key: 'gameName', label: '游戏名称(游戏资产)', required: false, example: 'World of Warcraft' },
  { key: 'rarity', label: '稀有度(游戏资产)', required: false, example: 'legendary' },
  { key: 'duration', label: '服务时长分钟(服务)', required: false, example: '60' },
  { key: 'deliverables', label: '交付物(服务)', required: false, example: '代码Review报告' },
];
