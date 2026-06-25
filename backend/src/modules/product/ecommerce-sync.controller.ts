import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EcommerceSyncService, CreateConnectionDto } from './ecommerce-sync.service';
import { EcommercePlatform } from '../../entities/ecommerce-connection.entity';

/**
 * 电商平台同步控制器
 */
@ApiTags('Ecommerce Sync')
@Controller('ecommerce')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class EcommerceSyncController {
  constructor(private readonly syncService: EcommerceSyncService) {}

  // ============ 连接管理 ============

  /**
   * 获取支持的平台列表
   */
  @Get('platforms')
  @ApiOperation({ summary: '获取支持的电商平台列表' })
  getPlatforms() {
    return {
      success: true,
      data: [
        {
          id: EcommercePlatform.SHOPIFY,
          name: 'Shopify',
          description: '全球领先的电商平台',
          logo: '/images/platforms/shopify.svg',
          requiredFields: ['accessToken', 'shopDomain'],
          setupGuide: 'https://docs.agentrix.top/integrations/shopify',
        },
        {
          id: EcommercePlatform.WOOCOMMERCE,
          name: 'WooCommerce',
          description: 'WordPress电商插件',
          logo: '/images/platforms/woocommerce.svg',
          requiredFields: ['consumerKey', 'consumerSecret', 'storeUrl'],
          setupGuide: 'https://docs.agentrix.top/integrations/woocommerce',
        },
        {
          id: EcommercePlatform.ETSY,
          name: 'Etsy',
          description: '手工艺品和创意商品平台',
          logo: '/images/platforms/etsy.svg',
          requiredFields: ['apiKey', 'shopId'],
          setupGuide: 'https://docs.agentrix.top/integrations/etsy',
          comingSoon: true,
        },
        {
          id: EcommercePlatform.AMAZON,
          name: 'Amazon',
          description: '全球最大电商平台',
          logo: '/images/platforms/amazon.svg',
          requiredFields: ['sellerId', 'mwsAuthToken'],
          setupGuide: 'https://docs.agentrix.top/integrations/amazon',
          comingSoon: true,
        },
      ],
    };
  }

  /**
   * 获取商户的所有连接
   */
  @Get('connections')
  @ApiOperation({ summary: '获取商户的所有电商平台连接' })
  async getConnections(@Request() req) {
    const connections = await this.syncService.getConnections(req.user.id);
    return {
      success: true,
      data: connections.map(c => ({
        ...c,
        // 隐藏敏感凭证
        credentials: {
          shopDomain: c.credentials.shopDomain,
          hasAccessToken: !!c.credentials.accessToken,
          hasConsumerKey: !!c.credentials.consumerKey,
        },
      })),
    };
  }

  /**
   * 创建新连接
   */
  @Post('connections')
  @ApiOperation({ summary: '创建电商平台连接' })
  @ApiResponse({ status: HttpStatus.CREATED, description: '连接创建成功' })
  async createConnection(@Request() req, @Body() dto: CreateConnectionDto) {
    const connection = await this.syncService.createConnection(req.user.id, dto);
    return {
      success: true,
      message: '连接创建成功',
      data: {
        ...connection,
        credentials: undefined, // 不返回凭证
      },
    };
  }

  /**
   * 测试连接
   */
  @Post('connections/:id/test')
  @ApiOperation({ summary: '测试电商平台连接' })
  async testConnection(@Request() req, @Param('id') id: string) {
    const result = await this.syncService.testConnection(id, req.user.id);
    return {
      success: result.success,
      message: result.message,
    };
  }

  /**
   * 更新连接配置
   */
  @Put('connections/:id')
  @ApiOperation({ summary: '更新连接配置' })
  async updateConnection(
    @Request() req,
    @Param('id') id: string,
    @Body() updates: Partial<CreateConnectionDto>,
  ) {
    const connection = await this.syncService.updateConnection(id, req.user.id, updates);
    return {
      success: true,
      message: '连接配置已更新',
      data: {
        ...connection,
        credentials: undefined,
      },
    };
  }

  @Patch('connections/:id')
  @ApiOperation({ summary: '更新连接配置（PATCH兼容）' })
  async patchConnection(
    @Request() req,
    @Param('id') id: string,
    @Body() updates: any,
  ) {
    const connection = await this.syncService.updateConnection(id, req.user.id, updates);
    return {
      success: true,
      message: '连接配置已更新',
      data: {
        ...connection,
        credentials: undefined,
      },
    };
  }

  /**
   * 删除连接
   */
  @Delete('connections/:id')
  @ApiOperation({ summary: '删除连接' })
  async deleteConnection(@Request() req, @Param('id') id: string) {
    await this.syncService.deleteConnection(id, req.user.id);
    return {
      success: true,
      message: '连接已删除',
    };
  }

  // ============ 商品同步 ============

  /**
   * 触发商品导入
   */
  @Post('connections/:id/sync')
  @ApiOperation({ summary: '从电商平台导入商品' })
  async importProducts(@Request() req, @Param('id') id: string) {
    const result = await this.syncService.importProducts(id, req.user.id);
    return {
      success: result.success,
      message: result.success
        ? `同步完成：导入 ${result.imported}，更新 ${result.updated}，失败 ${result.failed}`
        : '同步失败',
      data: result,
    };
  }

  /**
   * 获取同步映射
   */
  @Get('connections/:id/mappings')
  @ApiOperation({ summary: '获取商品同步映射' })
  async getSyncMappings(@Request() req, @Param('id') id: string) {
    const mappings = await this.syncService.getSyncMappings(id, req.user.id);
    return {
      success: true,
      data: mappings,
    };
  }
}
