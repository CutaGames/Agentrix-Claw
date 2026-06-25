import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Headers,
  HttpException,
  HttpStatus,
  Logger,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity, ApiParam, ApiQuery } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { UnifiedAuthGuard } from '../../auth/guards/unified-auth.guard';
import { SearchService } from '../../search/search.service';
import { ProductService } from '../../product/product.service';
import { OrderService } from '../../order/order.service';
import { PayIntentService, CreatePayIntentDto } from '../../payment/pay-intent.service';
import { PayIntentType } from '../../../entities/pay-intent.entity';
import { OrderStatus } from '../../../entities/order.entity';

/**
 * Marketplace GPTs Controller
 * 
 * 专门为 GPTs Actions 提供的 REST API 端点
 * 符合 OpenAPI 3.1.0 规范，支持标准的 REST API 格式
 */
@ApiTags('Marketplace (GPTs)')
@Controller('marketplace')
@Public() // 允许 GPTs 访问，但通过 UnifiedAuthGuard 支持 API Key 或 JWT
@UseGuards(UnifiedAuthGuard)
export class MarketplaceGPTsController {
  private readonly logger = new Logger(MarketplaceGPTsController.name);

  constructor(
    private searchService: SearchService,
    private productService: ProductService,
    private orderService: OrderService,
    private payIntentService: PayIntentService,
  ) {}

  /**
   * 搜索商品
   * GET /api/marketplace/search
   */
  @Get('search')
  @ApiOperation({ 
    summary: 'Search products',
    description: '搜索商品，支持语义搜索、分类筛选、价格筛选等'
  })
  @ApiSecurity('ApiKeyAuth')
  @ApiQuery({ name: 'query', required: true, description: '搜索查询（支持自然语言）' })
  @ApiQuery({ name: 'category', required: false, description: '商品分类' })
  @ApiQuery({ name: 'priceMin', required: false, type: Number, description: '最低价格' })
  @ApiQuery({ name: 'priceMax', required: false, type: Number, description: '最高价格' })
  @ApiQuery({ name: 'currency', required: false, description: '货币类型' })
  @ApiQuery({ name: 'inStock', required: false, type: Boolean, description: '是否仅显示有库存商品' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '返回结果数量限制' })
  @ApiResponse({ status: 200, description: 'Search results' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async searchProducts(
    @Request() req: any,
    @Query('query') query: string,
    @Query('category') category?: string,
    @Query('priceMin') priceMin?: number,
    @Query('priceMax') priceMax?: number,
    @Query('currency') currency?: string,
    @Query('inStock') inStock?: boolean,
    @Query('limit') limit?: number,
  ) {
    try {
      // 验证必需参数
      if (!query || query.trim().length === 0) {
        throw new HttpException(
          {
            success: false,
            error: 'BAD_REQUEST',
            message: '查询参数 query 是必需的',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      // 通过 API Key 识别用户
      const userId = req.user.id;
      
      // 构建搜索过滤器
      const filters: Record<string, any> = {
        type: 'product', // 只搜索商品
      };
      
      if (category) {
        filters.category = category;
      }
      if (priceMin !== undefined) {
        filters.priceMin = priceMin;
      }
      if (priceMax !== undefined) {
        filters.priceMax = priceMax;
      }
      if (currency) {
        filters.currency = currency;
      }
      if (inStock !== undefined) {
        filters.inStock = inStock;
      }
      
      // 调用搜索服务
      const searchResults = await this.searchService.semanticSearch(
        query,
        limit || 10,
        filters,
      );
      
      // 获取商品详情
      const productIds = searchResults.map(r => r.id);
      const products = await Promise.all(
        productIds.map(id => this.productService.getProduct(id).catch(() => null))
      );
      
      // 过滤掉不存在的商品，并格式化
      const validProducts = products
        .filter(p => p !== null)
        .map(p => this.formatProduct(p));
      
      // 应用库存过滤（如果指定）
      const filteredProducts = inStock !== undefined && inStock
        ? validProducts.filter(p => p.inStock)
        : validProducts;
      
      return {
        success: true,
        message: `找到 ${filteredProducts.length} 个相关商品`,
        data: {
          items: filteredProducts,
          total: filteredProducts.length,
          query: query,
        },
      };
    } catch (error) {
      this.logger.error('搜索商品失败:', error);
      
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        {
          success: false,
          error: 'INTERNAL_ERROR',
          message: error.message || '搜索商品时发生错误',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 获取商品详情
   * GET /api/marketplace/products/{id}
   */
  @Get('products/:id')
  @ApiOperation({ 
    summary: 'Get product details',
    description: '获取商品详情'
  })
  @ApiSecurity('ApiKeyAuth')
  @ApiParam({ name: 'id', description: '商品ID' })
  @ApiResponse({ status: 200, description: 'Product details' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async getProduct(
    @Param('id') id: string,
    @Request() req: any,
  ) {
    try {
      const product = await this.productService.getProduct(id);
      
      if (!product) {
        throw new HttpException(
          {
            success: false,
            error: 'NOT_FOUND',
            message: '商品不存在',
          },
          HttpStatus.NOT_FOUND,
        );
      }
      
      return {
        success: true,
        message: '获取商品详情成功',
        data: this.formatProduct(product),
      };
    } catch (error) {
      this.logger.error('获取商品详情失败:', error);
      
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        {
          success: false,
          error: 'INTERNAL_ERROR',
          message: error.message || '获取商品详情时发生错误',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 创建订单
   * POST /api/marketplace/orders
   * 
   * 注意：为了符合 OpenAPI Schema 并避免与现有 OrderController 冲突，
   * 我们将路径放在 marketplace 下
   */
  @Post('orders')
  @ApiOperation({ 
    summary: 'Create an order',
    description: '创建订单'
  })
  @ApiSecurity('ApiKeyAuth')
  @ApiResponse({ status: 200, description: 'Order created' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createOrder(
    @Body() input: {
      productId: string;
      quantity?: number;
      shippingAddress?: {
        name: string;
        phone: string;
        addressLine: string;
        city?: string;
        postalCode?: string;
        country?: string;
      };
      appointmentTime?: string;
      contactInfo?: string;
      walletAddress?: string;
      chain?: string;
    },
    @Request() req: any,
  ) {
    try {
      // 通过 API Key 识别用户
      const userId = req.user.id;
      if (!userId) {
        throw new HttpException(
          {
            success: false,
            error: 'UNAUTHORIZED',
            message: '需要提供有效的 API Key',
          },
          HttpStatus.UNAUTHORIZED,
        );
      }
      
      // 验证必需参数
      if (!input.productId) {
        throw new HttpException(
          {
            success: false,
            error: 'BAD_REQUEST',
            message: 'productId 是必需的',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      
      // 获取商品信息
      const product = await this.productService.getProduct(input.productId);
      if (!product) {
        throw new HttpException(
          {
            success: false,
            error: 'NOT_FOUND',
            message: '商品不存在',
          },
          HttpStatus.NOT_FOUND,
        );
      }
      
      // 创建订单
      const order = await this.orderService.createOrder(userId, {
        merchantId: product.merchantId,
        productId: input.productId,
        amount: Number(product.price) * (input.quantity || 1),
        currency: (product.metadata as any)?.currency || 'CNY',
        metadata: {
          quantity: input.quantity || 1,
          shippingAddress: input.shippingAddress,
          appointmentTime: input.appointmentTime,
          contactInfo: input.contactInfo,
          walletAddress: input.walletAddress,
          chain: input.chain,
        },
      });
      
      return {
        success: true,
        message: '订单创建成功',
        data: {
          orderId: order.id,
          status: order.status,
          amount: order.amount,
          currency: order.currency,
          productId: order.productId,
          quantity: input.quantity || 1,
          createdAt: order.createdAt.toISOString(),
        },
      };
    } catch (error) {
      this.logger.error('创建订单失败:', error);
      
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        {
          success: false,
          error: 'INTERNAL_ERROR',
          message: error.message || '创建订单时发生错误',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 创建支付意图
   * POST /api/marketplace/payments
   * 
   * 注意：为了符合 OpenAPI Schema 并避免与现有 PaymentController 冲突，
   * 我们将路径放在 marketplace 下
   */
  @Post('payments')
  @ApiOperation({ 
    summary: 'Initiate a payment',
    description: '创建支付意图，返回支付页面URL'
  })
  @ApiSecurity('ApiKeyAuth')
  @ApiResponse({ status: 200, description: 'Payment session created' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async initiatePayment(
    @Body() input: {
      orderId: string;
      method?: string;
    },
    @Request() req: any,
  ) {
    try {
      // 通过 API Key 识别用户
      const userId = req.user.id;
      if (!userId) {
        throw new HttpException(
          {
            success: false,
            error: 'UNAUTHORIZED',
            message: '需要提供有效的 API Key',
          },
          HttpStatus.UNAUTHORIZED,
        );
      }
      
      // 验证必需参数
      if (!input.orderId) {
        throw new HttpException(
          {
            success: false,
            error: 'BAD_REQUEST',
            message: 'orderId 是必需的',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      
      // 获取订单信息
      const order = await this.orderService.getOrder(userId, input.orderId);
      if (!order) {
        throw new HttpException(
          {
            success: false,
            error: 'NOT_FOUND',
            message: '订单不存在',
          },
          HttpStatus.NOT_FOUND,
        );
      }
      
      // 检查订单状态
      if (order.status !== OrderStatus.PENDING) {
        throw new HttpException(
          {
            success: false,
            error: 'BAD_REQUEST',
            message: `订单状态为 ${order.status}，无法支付`,
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      
      // 创建支付意图
      const payIntentDto: CreatePayIntentDto = {
        orderId: input.orderId,
        amount: order.amount,
        currency: order.currency || 'CNY',
        type: PayIntentType.ORDER_PAYMENT,
        paymentMethod: {
          type: input.method || 'crypto',
        },
        metadata: {
          paymentMethod: input.method,
        },
      };
      
      const payIntent = await this.payIntentService.createPayIntent(userId, payIntentDto);
      
      // 生成支付页面URL
      const frontendUrl = process.env.FRONTEND_URL || 'https://www.agentrix.top';
      const paymentUrl = `${frontendUrl}/payment/${payIntent.id}`;
      
      return {
        success: true,
        message: '支付意图创建成功',
        data: {
          paymentId: payIntent.id,
          paymentUrl: paymentUrl,
          status: payIntent.status,
          orderId: input.orderId,
        },
      };
    } catch (error) {
      this.logger.error('创建支付意图失败:', error);
      
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        {
          success: false,
          error: 'INTERNAL_ERROR',
          message: error.message || '创建支付意图时发生错误',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 格式化商品数据，符合 OpenAPI Schema
   */
  private formatProduct(product: any): any {
    const metadata = product.metadata || {};
    const currency = metadata.currency || 'CNY';
    const priceDisplay = this.formatPrice(product.price, currency);
    
    return {
      id: product.id,
      title: product.name,
      name: product.name,
      description: product.description || '',
      price: Number(product.price),
      currency: currency,
      priceDisplay: priceDisplay,
      image: product.image || product.images?.[0] || null,
      images: product.images || [],
      category: product.category || null,
      productType: product.productType || 'physical',
      stock: product.stock || 0,
      inStock: (product.stock || 0) > 0,
      merchantId: product.merchantId || null,
      merchantName: product.merchant?.name || null,
    };
  }

  /**
   * 格式化价格显示
   */
  private formatPrice(price: number, currency: string): string {
    const priceNum = Number(price);
    const symbol = this.getCurrencySymbol(currency);
    return `${symbol}${priceNum.toFixed(2)}`;
  }

  /**
   * 获取货币符号
   */
  private getCurrencySymbol(currency: string): string {
    const symbols: Record<string, string> = {
      CNY: '¥',
      USD: '$',
      EUR: '€',
      GBP: '£',
      JPY: '¥',
    };
    return symbols[currency.toUpperCase()] || currency;
  }
}

