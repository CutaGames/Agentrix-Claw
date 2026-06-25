/**
 * Unified Marketplace Controller
 * 
 * V2.0: 统一市场 API 控制器
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { UnifiedMarketplaceService, UnifiedSearchParams } from './unified-marketplace.service';
import { ProductSkillConverterService } from '../skill/product-skill-converter.service';
import { SkillLayer, SkillCategory, SkillResourceType, SkillSource } from '../../entities/skill.entity';
import { CallerType, CallPlatform } from '../../entities/skill-analytics.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';

@ApiTags('Unified Marketplace')
@Controller('unified-marketplace')
export class UnifiedMarketplaceController {
  constructor(
    private readonly marketplaceService: UnifiedMarketplaceService,
    private readonly productSkillConverter: ProductSkillConverterService,
  ) {}

  /**
   * 统一搜索 API
   */
  @Get('search')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '统一搜索 Skill' })
  @ApiQuery({ name: 'q', required: false, description: '搜索关键词' })
  @ApiQuery({ name: 'layer', required: false, enum: SkillLayer, isArray: true })
  @ApiQuery({ name: 'category', required: false, enum: SkillCategory, isArray: true })
  @ApiQuery({ name: 'resourceType', required: false, enum: SkillResourceType, isArray: true })
  @ApiQuery({ name: 'source', required: false, enum: SkillSource, isArray: true })
  @ApiQuery({ name: 'excludeOriginalPlatform', required: false, type: String, isArray: true, description: '排除指定原始平台（如 openclaw）' })
  @ApiQuery({ name: 'priceMin', required: false, type: Number })
  @ApiQuery({ name: 'priceMax', required: false, type: Number })
  @ApiQuery({ name: 'rating', required: false, type: Number })
  @ApiQuery({ name: 'humanAccessible', required: false, type: Boolean })
  @ApiQuery({ name: 'callerType', required: false, enum: ['agent', 'human'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['callCount', 'rating', 'createdAt', 'name'] })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'] })
  async search(
    @Query('q') query?: string,
    @Query('layer') layer?: SkillLayer | SkillLayer[],
    @Query('category') category?: SkillCategory | SkillCategory[],
    @Query('resourceType') resourceType?: SkillResourceType | SkillResourceType[],
    @Query('source') source?: SkillSource | SkillSource[],
    @Query('excludeOriginalPlatform') excludeOriginalPlatform?: string | string[],
    @Query('priceMin') priceMin?: number,
    @Query('priceMax') priceMax?: number,
    @Query('rating') rating?: number,
    @Query('humanAccessible') humanAccessible?: boolean,
    @Query('callerType') callerType?: 'agent' | 'human',
    @Query('tags') tags?: string | string[],
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('sortBy') sortBy?: 'callCount' | 'rating' | 'createdAt' | 'name',
    @Query('sortOrder') sortOrder?: 'ASC' | 'DESC',
  ) {
    const params: UnifiedSearchParams = {
      query,
      layer: Array.isArray(layer) ? layer : layer ? [layer] : undefined,
      category: Array.isArray(category) ? category : category ? [category] : undefined,
      resourceType: Array.isArray(resourceType) ? resourceType : resourceType ? [resourceType] : undefined,
      source: Array.isArray(source) ? source : source ? [source] : undefined,
      excludeOriginalPlatform: Array.isArray(excludeOriginalPlatform) ? excludeOriginalPlatform : excludeOriginalPlatform ? [excludeOriginalPlatform] : undefined,
      priceMin: priceMin ? Number(priceMin) : undefined,
      priceMax: priceMax ? Number(priceMax) : undefined,
      rating: rating ? Number(rating) : undefined,
      humanAccessible,
      callerType,
      tags: Array.isArray(tags) ? tags : tags ? [tags] : undefined,
      page: Number(page),
      limit: Math.min(Number(limit), 100),
      sortBy,
      sortOrder,
    };

    return this.marketplaceService.search(params);
  }

  /**
   * 获取热门 Skill
   */
  @Get('trending')
  @ApiOperation({ summary: '获取热门 Skill' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getTrending(@Query('limit') limit = 10) {
    return this.marketplaceService.getTrending(Math.min(Number(limit), 50));
  }

  /**
   * 获取分类列表
   */
  @Get('categories')
  @ApiOperation({ summary: '获取分类列表' })
  async getCategories() {
    return this.marketplaceService.getCategories();
  }

  /**
   * 获取层级统计
   */
  @Get('stats/layers')
  @ApiOperation({ summary: '获取按层级分组的统计' })
  async getStatsByLayer() {
    return this.marketplaceService.getStatsByLayer();
  }

  /**
   * 获取 Skill 详情
   */
  @Get('skills/:id')
  @ApiOperation({ summary: '获取 Skill 详情' })
  async getSkillDetail(@Param('id') id: string) {
    const detail = await this.marketplaceService.getSkillDetail(id);
    if (!detail) {
      throw new NotFoundException(`Skill ${id} not found`);
    }
    return detail;
  }

  /**
   * 获取 Skill 分析数据
   */
  @Get('skills/:id/analytics')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取 Skill 分析数据' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  async getSkillAnalytics(
    @Param('id') id: string,
    @Query('days') days = 30,
  ) {
    return this.marketplaceService.getSkillAnalytics(id, Number(days));
  }

  /**
   * 商品转 Skill
   */
  @Post('convert-product')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '将商品转换为 Skill' })
  async convertProduct(
    @Body() body: { 
      productId: string; 
      config?: {
        autoSync?: boolean;
        useLLMDescription?: boolean;
        descriptionTemplate?: string;
        commissionRateOverride?: number;
      };
    },
  ) {
    const skill = await this.productSkillConverter.convertProductToSkill(
      body.productId,
      body.config,
    );
    return { success: true, skill };
  }

  /**
   * 批量转换商品
   */
  @Post('convert-products/batch')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '批量将商品转换为 Skill' })
  async batchConvertProducts(
    @Body() body: { 
      productIds: string[]; 
      config?: {
        autoSync?: boolean;
        useLLMDescription?: boolean;
      };
    },
  ) {
    return this.productSkillConverter.batchConvertProducts(
      body.productIds,
      body.config,
    );
  }

  /**
   * 获取平台 Schema (OpenAPI/MCP)
   */
  @Get('schema/:platform')
  @ApiOperation({ summary: '获取指定平台的 Schema' })
  async getPlatformSchema(
    @Param('platform') platform: 'openai' | 'claude' | 'gemini' | 'grok',
  ) {
    return this.marketplaceService.getPlatformSchema(platform);
  }

  /**
   * 获取外部 Skill 映射
   */
  @Get('external-mappings')
  @ApiOperation({ summary: '获取外部 Skill 映射' })
  @ApiQuery({ name: 'platform', required: false })
  async getExternalMappings(@Query('platform') platform?: string) {
    return this.marketplaceService.getExternalMappings(platform);
  }

  /**
   * 记录 Skill 调用 (内部 API)
   */
  @Post('analytics/record')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '记录 Skill 调用' })
  async recordSkillCall(
    @Body() body: {
      skillId: string;
      callerType: CallerType;
      callerId?: string;
      platform: CallPlatform;
      executionTimeMs?: number;
      success: boolean;
      errorMessage?: string;
      revenueGenerated?: number;
      orderId?: string;
      sessionId?: string;
    },
  ) {
    return this.marketplaceService.recordSkillCall(body);
  }

  /**
   * 执行 Skill
   */
  @Post('execute')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '执行 Skill' })
  async executeSkill(
    @Body() body: { skillId: string; params?: Record<string, any> },
    @Request() req: any,
  ) {
    try {
      const result = await this.marketplaceService.executeSkill(
        body.skillId,
        body.params || {},
        req.user?.id,
      );
      return { success: true, result, message: '执行成功' };
    } catch (error: any) {
      return { success: false, error: error.message || '执行失败' };
    }
  }

  /**
   * 购买 Skill (商品类)
   */
  @Post('purchase')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '购买 Skill' })
  async purchaseSkill(
    @Body() body: { skillId: string; quantity?: number; paymentMethod?: string },
    @Request() req: any,
  ) {
    try {
      const result = await this.marketplaceService.purchaseSkill(
        body.skillId,
        req.user.id,
        body.quantity || 1,
        body.paymentMethod,
      );
      return { success: true, result, message: '购买成功' };
    } catch (error: any) {
      return { success: false, error: error.message || '购买失败' };
    }
  }

  /**
   * 添加到购物车
   */
  @Post('cart/add')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '添加到购物车' })
  async addToCart(
    @Body() body: { skillId: string; quantity?: number },
    @Request() req: any,
  ) {
    try {
      const result = await this.marketplaceService.addToCart(
        body.skillId,
        req.user.id,
        body.quantity || 1,
      );
      return { success: true, result, message: '已加入购物车' };
    } catch (error: any) {
      return { success: false, error: error.message || '加入购物车失败' };
    }
  }
}
