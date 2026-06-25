import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { CapabilityRegistryService } from './services/capability-registry.service';
import { CapabilityExecutorService } from './services/capability-executor.service';
import { PlatformRegistryService } from './services/platform-registry.service';
import { AIPlatform, ExecutionContext, SystemCapability } from './interfaces/capability.interface';

@Controller('api/ai-capability')
export class AiCapabilityController {
  constructor(
    private capabilityRegistry: CapabilityRegistryService,
    private capabilityExecutor: CapabilityExecutorService,
    private platformRegistry: PlatformRegistryService,
  ) {}

  /**
   * 获取指定平台的所有能力（Function Schemas）
   * GET /api/ai-capability/platform/:platform
   */
  @Get('platform/:platform')
  async getPlatformCapabilities(@Param('platform') platform: AIPlatform) {
    const schemas = await this.capabilityRegistry.getAllCapabilities(platform);
    return {
      platform,
      count: schemas.length,
      functions: schemas,
    };
  }

  /**
   * 获取指定产品的所有能力
   * GET /api/ai-capability/product/:productId
   */
  @Get('product/:productId')
  async getProductCapabilities(
    @Param('productId') productId: string,
    @Query('platform') platform?: AIPlatform,
  ) {
    const schemas = await this.capabilityRegistry.getProductCapabilities(productId, platform);
    return {
      productId,
      platform: platform || 'all',
      count: schemas.length,
      functions: schemas,
    };
  }

  /**
   * 获取所有已注册的平台
   * GET /api/ai-capability/platforms
   */
  @Get('platforms')
  async getAllPlatforms() {
    const platforms = this.platformRegistry.getAllPlatformIds();
    return {
      platforms,
      count: platforms.length,
    };
  }

  /**
   * 获取所有系统级能力（所有平台）
   * GET /api/ai-capability/system-capabilities?platform=openai
   */
  @Get('system-capabilities')
  async getSystemCapabilities(@Query('platform') platform?: string) {
    const platforms = platform ? [platform] : undefined;
    const schemas = this.capabilityRegistry.getSystemCapabilitySchemas(platforms);
    const capabilities = this.capabilityRegistry.getSystemCapabilities();
    
    return {
      capabilities,
      functions: schemas,
      count: capabilities.length,
    };
  }

  /**
   * 注册新的系统级能力
   * POST /api/ai-capability/system-capabilities
   */
  @Post('system-capabilities')
  async registerSystemCapability(@Body() capability: SystemCapability) {
    this.capabilityRegistry.registerSystemCapability(capability);
    return {
      success: true,
      capability,
      message: '系统级能力已注册',
    };
  }

  /**
   * 注册产品能力（手动触发）
   * POST /api/ai-capability/register
   * 如果不指定 platforms，则自动注册所有已注册的平台
   */
  @Post('register')
  async registerCapabilities(
    @Body()
    body: {
      productId?: string;
      productIds?: string[];
      platforms?: AIPlatform[];
    },
  ) {
    const { productId, productIds, platforms } = body;
    // 如果不指定平台，使用所有已注册的平台
    const targetPlatforms = platforms || this.platformRegistry.getAllActivePlatforms();

    if (productId) {
      const schemas = await this.capabilityRegistry.register(productId, targetPlatforms);
      return {
        productId,
        success: true,
        platforms: targetPlatforms,
        count: schemas.length,
        functions: schemas,
      };
    }

    if (productIds && productIds.length > 0) {
      const results = await this.capabilityRegistry.registerBatch(productIds, targetPlatforms);
      return {
        success: true,
        results: Array.from(results.entries()).map(([id, schemas]) => ({
          productId: id,
          count: schemas.length,
          functions: schemas,
        })),
      };
    }

    return {
      success: false,
      error: 'Missing productId or productIds',
    };
  }

  /**
   * 执行能力
   * POST /api/ai-capability/execute
   */
  @Post('execute')
  async executeCapability(
    @Body()
    body: {
      executor: string;
      params: Record<string, any>;
      context?: ExecutionContext;
    },
  ) {
    const { executor, params, context = {} } = body;
    const result = await this.capabilityExecutor.execute(executor, params, context);
    return result;
  }
}


