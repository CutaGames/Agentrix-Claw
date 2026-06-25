import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsNotEmpty,
  Min,
  Max,
  IsEnum,
  IsObject,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProductType } from '../../../entities/product.entity';

/**
 * 统一产品数据标准 - 价格信息
 */
class PriceDto {
  @ApiProperty({ description: '价格数值' })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ description: '货币代码 (ISO 4217)', default: 'CNY' })
  @IsString()
  @IsOptional()
  currency?: string;
}

/**
 * 统一产品数据标准 - 库存信息
 */
class InventoryDto {
  @ApiProperty({ description: '库存类型', enum: ['finite', 'unlimited', 'digital'] })
  @IsEnum(['finite', 'unlimited', 'digital'])
  type: 'finite' | 'unlimited' | 'digital';

  @ApiProperty({ description: '库存数量 (finite时必需)', required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  quantity?: number;
}

/**
 * 统一产品数据标准 - 媒体资源
 */
class MediaImageDto {
  @ApiProperty({ description: '图片URL' })
  @IsString()
  url: string;

  @ApiProperty({ description: '图片类型', enum: ['thumbnail', 'gallery', 'detail'] })
  @IsEnum(['thumbnail', 'gallery', 'detail'])
  type: 'thumbnail' | 'gallery' | 'detail';

  @ApiProperty({ description: '替代文本', required: false })
  @IsString()
  @IsOptional()
  alt?: string;
}

/**
 * 统一产品数据标准 - 核心元数据
 */
class CoreMetadataDto {
  @ApiProperty({ description: '媒体资源' })
  @ValidateNested()
  @Type(() => Object)
  media: {
    images: MediaImageDto[];
    videos?: Array<{
      url: string;
      type: 'preview' | 'demo' | 'tutorial';
      thumbnail?: string;
    }>;
  };

  @ApiProperty({ description: '多语言支持', required: false })
  @IsObject()
  @IsOptional()
  i18n?: Record<string, any>;

  @ApiProperty({ description: 'SEO信息', required: false })
  @IsObject()
  @IsOptional()
  seo?: {
    keywords?: string[];
    metaDescription?: string;
  };
}

/**
 * 统一产品数据标准 - 创建产品DTO
 * 支持新旧两种格式，向后兼容
 */
export class CreateProductDto {
  // 基础字段（必需）
  @ApiProperty({ description: '商品名称' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: '商品描述' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ description: '分类' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiProperty({ description: '产品类型', enum: ProductType })
  @IsEnum(ProductType)
  productType: ProductType;

  // --- 向后兼容 & 扁平化支持 ---

  @ApiProperty({ description: '价格（扁平化支持）', required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: any; // 这里使用 any 是因为下面还有一个 price?: PriceDto，我们需要保持兼容性或者是改名

  @ApiProperty({ description: '库存（扁平化支持）', required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  stock?: number;

  @ApiProperty({ description: '图片URL（扁平化支持）', required: false })
  @IsString()
  @IsOptional()
  image?: string;

  @ApiProperty({ description: '分润率（%）', required: false })
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  commissionRate?: number;

  @ApiProperty({ description: '货币代码 (ISO 4217)', default: 'USD', required: false })
  @IsString()
  @IsOptional()
  currency?: string;

  // --- 统一标准格式（优先） ---

  @ApiProperty({ description: '价格信息（统一标准）', required: false })
  @ValidateNested()
  @Type(() => PriceDto)
  @IsOptional()
  price_standard?: PriceDto;

  @ApiProperty({ description: '库存信息（统一标准）', required: false })
  @ValidateNested()
  @Type(() => InventoryDto)
  @IsOptional()
  inventory?: InventoryDto;

  @ApiProperty({ description: '统一元数据', required: false, type: Object })
  @IsObject()
  @IsOptional()
  metadata?: {
    core?: CoreMetadataDto;
    typeSpecific?: Record<string, any>;
    aiCompatible?: Record<string, any>;
    extensions?: Record<string, any>;
  };

  @ApiProperty({ description: '标签', required: false })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiProperty({ description: '子分类', required: false })
  @IsString()
  @IsOptional()
  subcategory?: string;

  // 向后兼容字段（如果提供了统一格式，这些字段会被忽略）
  @ApiProperty({ description: '价格（旧格式，向后兼容）', required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  price_legacy?: number;
}

export class UpdateProductDto {
  @ApiProperty({ description: '商品名称', required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ description: '商品描述', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: '价格', required: false })
  @IsNumber()
  @IsOptional()
  @Min(0)
  price?: number;

  @ApiProperty({ description: '库存', required: false })
  @IsNumber()
  @IsOptional()
  @Min(0)
  stock?: number;

  @ApiProperty({ description: '分润率（%）', required: false })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(100)
  commissionRate?: number;

  @ApiProperty({ description: '商品类型', enum: ProductType, required: false })
  @IsEnum(ProductType)
  @IsOptional()
  productType?: ProductType;

  @ApiProperty({ description: '附加元数据', required: false, type: Object })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}

