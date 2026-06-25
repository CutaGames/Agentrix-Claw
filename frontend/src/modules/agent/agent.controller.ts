import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AgentService } from './agent.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { CartService } from '../cart/cart.service';
import { AgentTemplateService } from './agent-template.service';
import {
  CreateAgentTemplateDto,
  InstantiateAgentDto,
  UpdateAgentTemplateDto,
} from './dto/agent-template.dto';
import { AgentTemplateVisibility } from '../../entities/agent-template.entity';
import { TemplateSubscriptionService } from './template-subscription.service';
import { TemplateReviewService, CreateReviewDto } from './template-review.service';

@ApiTags('agent')
@Controller('agent')
export class AgentController {
  constructor(
    private readonly agentService: AgentService,
    private readonly agentTemplateService: AgentTemplateService,
    private readonly templateSubscriptionService: TemplateSubscriptionService,
    private readonly templateReviewService: TemplateReviewService,
    private readonly cartService: CartService,
  ) {}

  @Get('health')
  @Public()
  @ApiOperation({ summary: 'Agent服务健康检查' })
  @ApiResponse({ status: 200, description: '服务健康状态' })
  async health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'agent',
      version: '3.0',
    };
  }

  @Post('chat')
  @ApiOperation({ summary: 'Agent对话处理（V3.0增强版：支持多轮对话和上下文）' })
  @ApiResponse({ status: 200, description: '返回AI响应和会话ID' })
  @Public()
  async chat(
    @Request() req: any,
    @Body() body: { message: string; context?: any; sessionId?: string },
  ) {
    // 开发环境记录请求
    if (process.env.NODE_ENV === 'development') {
      console.log('📥 Agent对话请求:', {
        message: body.message?.substring(0, 50),
        mode: body.context?.mode,
        sessionId: body.sessionId || 'new',
        userId: req.user?.id || 'anonymous',
      });
    }

    try {
      // 优先从 JWT token 获取 userId，如果没有则从 context 中获取（支持前端直接传递）
      // 允许未登录用户使用基础功能，使用null作为userId（实体允许nullable）
      const userId = req.user?.id || body.context?.userId || null;
      
      // 开发环境记录用户身份
      if (process.env.NODE_ENV === 'development' && userId) {
        console.log('👤 用户身份:', {
          fromToken: !!req.user?.id,
          fromContext: !!body.context?.userId,
          userId,
        });
      }
      
      const result = await this.agentService.processMessage(
        body.message,
        body.context,
        userId,
        body.sessionId,
      );

      // 开发环境记录响应
      if (process.env.NODE_ENV === 'development') {
        console.log('📤 Agent对话响应:', {
          responseLength: result.response?.length,
          type: result.type,
          sessionId: result.sessionId,
        });
      }

      return result;
    } catch (error: any) {
      console.error('❌ Agent对话处理失败:', {
        error: error.message,
        stack: error.stack,
        message: body.message,
      });
      throw error;
    }
  }

  @Get('sessions')
  @ApiOperation({ summary: '获取用户会话列表' })
  @ApiResponse({ status: 200, description: '返回会话列表' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getSessions(@Request() req: any) {
    return this.agentService.getUserSessions(req.user?.id);
  }

  @Get('sessions/:sessionId')
  @ApiOperation({ summary: '获取会话详情和历史消息' })
  @ApiResponse({ status: 200, description: '返回会话详情和消息历史' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getSession(
    @Request() req: any,
    @Param('sessionId') sessionId: string,
  ) {
    return this.agentService.getSessionDetails(req.user?.id, sessionId);
  }

  @Post('recommendations')
  @ApiOperation({ summary: '获取情景感知推荐（V3.0）' })
  @ApiResponse({ status: 200, description: '返回推荐结果' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getRecommendations(
    @Request() req: any,
    @Body() body: { sessionId?: string; query?: string; entities?: any },
  ) {
    return this.agentService.getContextualRecommendations(
      req.user?.id,
      body.sessionId,
      body.query,
      body.entities,
    );
  }

  @Post('search-products')
  @ApiOperation({ summary: '商品搜索/比价（V3.0：多平台聚合、自动比价）' })
  @ApiResponse({ status: 200, description: '返回商品搜索结果和比价信息' })
  @Public()
  async searchProducts(
    @Body() body: {
      query: string;
      filters?: {
        priceMin?: number;
        priceMax?: number;
        category?: string;
        currency?: string;
        inStock?: boolean;
      };
    },
  ) {
    return this.agentService.searchAndCompareProducts(body.query, body.filters);
  }

  @Post('search-services')
  @ApiOperation({ summary: '服务推荐（V3.0：虚拟服务、咨询服务、技术服务）' })
  @ApiResponse({ status: 200, description: '返回服务列表' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async searchServices(
    @Body() body: {
      query: string;
      filters?: {
        type?: 'virtual_service' | 'consultation' | 'technical_service' | 'subscription';
        priceMax?: number;
      };
    },
  ) {
    return this.agentService.searchServices(body.query, body.filters);
  }

  @Post('search-onchain-assets')
  @ApiOperation({ summary: '链上资产识别（V3.0：NFT、Token、链游资产）' })
  @ApiResponse({ status: 200, description: '返回链上资产列表' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async searchOnChainAssets(
    @Body() body: {
      query: string;
      filters?: {
        type?: 'nft' | 'token' | 'game_item';
        chain?: 'solana' | 'ethereum' | 'bsc' | 'polygon';
      };
    },
  ) {
    return this.agentService.searchOnChainAssets(body.query, body.filters);
  }

  @Post('create-order')
  @ApiOperation({ summary: '自动下单（V3.0：全流程自动化）' })
  @ApiResponse({ status: 200, description: '返回订单和支付意图' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async createOrder(
    @Request() req: any,
    @Body() body: {
      productId: string;
      quantity?: number;
      metadata?: any;
    },
  ) {
    return this.agentService.createOrderAutomatically(
      req.user?.id,
      body.productId,
      body.quantity || 1,
      body.metadata,
    );
  }

  @Get('orders')
  @ApiOperation({ summary: '订单查询/物流跟踪（V3.0）' })
  @ApiResponse({ status: 200, description: '返回订单列表和物流信息' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async queryOrders(
    @Request() req: any,
    @Query('orderId') orderId?: string,
  ) {
    return this.agentService.queryOrderAndLogistics(req.user?.id, orderId);
  }

  @Post('refund')
  @ApiOperation({ summary: '处理退款/售后（V3.0）' })
  @ApiResponse({ status: 200, description: '返回退款结果和订单信息' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async processRefund(
    @Request() req: any,
    @Body() body: {
      orderId: string;
      reason?: string;
    },
  ) {
    return this.agentService.processRefund(req.user?.id, body.orderId, body.reason);
  }

  @Post('generate-code')
  @ApiOperation({ summary: '生成API/SDK代码示例（基础版）' })
  @ApiResponse({ status: 200, description: '返回代码示例' })
  async generateCode(
    @Body() body: { prompt: string; language: 'typescript' | 'javascript' | 'python' },
  ) {
    return this.agentService.generateCodeExample(body.prompt, body.language);
  }

  @Post('generate-enhanced-code')
  @ApiOperation({ summary: '增强代码生成（V3.0：支持更多场景）' })
  @ApiResponse({ status: 200, description: '返回增强代码示例' })
  async generateEnhancedCode(
    @Body() body: { prompt: string; language: 'typescript' | 'javascript' | 'python' },
  ) {
    return this.agentService.generateEnhancedCode(body.prompt, body.language);
  }

  @Get('faq')
  @ApiOperation({ summary: '获取FAQ答案' })
  @ApiResponse({ status: 200, description: '返回FAQ答案' })
  async getFaq(@Query('question') question: string) {
    return this.agentService.getFaqAnswer(question);
  }

  @Get('guide')
  @ApiOperation({ summary: '获取操作引导' })
  @ApiResponse({ status: 200, description: '返回引导信息' })
  async getGuide(@Query('type') type: 'register' | 'login' | 'api' | 'payment') {
    return this.agentService.getGuide(type);
  }

  // ========== 购物车操作（支持sessionId，未登录用户可用） ==========
  @Get('cart')
  @Public()
  @ApiOperation({ summary: '获取购物车（支持sessionId）' })
  @ApiResponse({ status: 200, description: '返回购物车及商品详情' })
  async getCart(
    @Request() req: any,
    @Query('sessionId') sessionId?: string,
  ) {
    const userId = req.user?.id;
    const cartIdentifier = userId || sessionId;
    const isSessionId = !userId;
    
    if (!cartIdentifier) {
      throw new Error('需要提供userId或sessionId');
    }
    
    return this.cartService.getCartWithProducts(cartIdentifier, isSessionId);
  }

  @Post('cart/items')
  @Public()
  @ApiOperation({ summary: '添加商品到购物车（支持sessionId）' })
  @ApiResponse({ status: 200, description: '商品已添加到购物车' })
  async addCartItem(
    @Request() req: any,
    @Body() body: { productId: string; quantity: number; sessionId?: string },
  ) {
    const userId = req.user?.id;
    const cartIdentifier = userId || body.sessionId;
    const isSessionId = !userId;
    
    if (!cartIdentifier) {
      throw new Error('需要提供userId或sessionId');
    }
    
    return this.cartService.addToCart(cartIdentifier, body.productId, body.quantity || 1, isSessionId);
  }

  @Put('cart/items/:productId')
  @Public()
  @ApiOperation({ summary: '更新购物车商品数量（支持sessionId）' })
  @ApiResponse({ status: 200, description: '商品数量已更新' })
  async updateCartItem(
    @Request() req: any,
    @Param('productId') productId: string,
    @Body() body: { quantity: number; sessionId?: string },
  ) {
    const userId = req.user?.id;
    const cartIdentifier = userId || body.sessionId;
    const isSessionId = !userId;
    
    if (!cartIdentifier) {
      throw new Error('需要提供userId或sessionId');
    }
    
    return this.cartService.updateCartItemQuantity(cartIdentifier, productId, body.quantity, isSessionId);
  }

  @Delete('cart/items/:productId')
  @Public()
  @ApiOperation({ summary: '从购物车移除商品（支持sessionId）' })
  @ApiResponse({ status: 200, description: '商品已从购物车移除' })
  async removeCartItem(
    @Request() req: any,
    @Param('productId') productId: string,
    @Query('sessionId') sessionId?: string,
  ) {
    const userId = req.user?.id;
    const cartIdentifier = userId || sessionId;
    const isSessionId = !userId;
    
    if (!cartIdentifier) {
      throw new Error('需要提供userId或sessionId');
    }
    
    return this.cartService.removeFromCart(cartIdentifier, productId, isSessionId);
  }

  @Get('templates')
  @Public()
  @ApiOperation({ summary: '获取Agent模板列表' })
  async getTemplates(
    @Request() req: any,
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('tag') tag?: string,
    @Query('visibility') visibility?: AgentTemplateVisibility,
  ) {
    const normalizedVisibility = visibility && Object.values(AgentTemplateVisibility).includes(visibility)
      ? visibility
      : undefined;
    return this.agentTemplateService.listTemplates(
      {
        search,
        category,
        tag,
        visibility: normalizedVisibility,
      },
      req.user?.id,
    );
  }

  @Get('templates/mine')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取我创建的Agent模板' })
  async getMyTemplates(@Request() req: any) {
    return this.agentTemplateService.listMyTemplates(req.user.id);
  }

  @Post('templates')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建Agent模板' })
  async createTemplate(@Request() req: any, @Body() body: CreateAgentTemplateDto) {
    return this.agentTemplateService.createTemplate(req.user.id, body);
  }

  @Put('templates/:templateId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新Agent模板' })
  async updateTemplate(
    @Request() req: any,
    @Param('templateId') templateId: string,
    @Body() body: UpdateAgentTemplateDto,
  ) {
    return this.agentTemplateService.updateTemplate(req.user.id, templateId, body);
  }

  @Post('templates/:templateId/publish')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '发布Agent模板' })
  async publishTemplate(@Request() req: any, @Param('templateId') templateId: string) {
    return this.agentTemplateService.publishTemplate(req.user.id, templateId);
  }

  @Post('templates/:templateId/instantiate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '基于模板生成个人Agent' })
  async instantiateTemplate(
    @Request() req: any,
    @Param('templateId') templateId: string,
    @Body() body: InstantiateAgentDto,
  ) {
    return this.agentTemplateService.instantiateTemplate(req.user.id, {
      ...body,
      templateId,
    });
  }

  @Get('my-agents')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前用户生成的Agent列表' })
  async getMyAgents(@Request() req: any) {
    return this.agentTemplateService.listUserAgents(req.user.id);
  }

  @Get('templates/:templateId/subscription')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '检查模板订阅状态' })
  async checkTemplateSubscription(
    @Request() req: any,
    @Param('templateId') templateId: string,
  ) {
    return this.templateSubscriptionService.checkSubscription(templateId, req.user.id);
  }

  @Post('templates/:templateId/subscription')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '购买模板订阅' })
  async purchaseTemplateSubscription(
    @Request() req: any,
    @Param('templateId') templateId: string,
    @Body('paymentMethod') paymentMethod?: string,
  ) {
    return this.templateSubscriptionService.purchaseSubscription(
      templateId,
      req.user.id,
      paymentMethod,
    );
  }

  @Post('templates/:templateId/reviews')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建模板评论' })
  async createTemplateReview(
    @Request() req: any,
    @Param('templateId') templateId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.templateReviewService.createReview(req.user.id, { ...dto, templateId });
  }

  @Get('templates/:templateId/reviews')
  @ApiOperation({ summary: '获取模板评论列表' })
  async getTemplateReviews(
    @Param('templateId') templateId: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.templateReviewService.getTemplateReviews(templateId, { limit, offset });
  }

  @Put('templates/reviews/:reviewId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新评论' })
  async updateTemplateReview(
    @Request() req: any,
    @Param('reviewId') reviewId: string,
    @Body() dto: Partial<CreateReviewDto>,
  ) {
    return this.templateReviewService.updateReview(reviewId, req.user.id, dto);
  }

  @Delete('templates/reviews/:reviewId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除评论' })
  async deleteTemplateReview(@Request() req: any, @Param('reviewId') reviewId: string) {
    return this.templateReviewService.deleteReview(reviewId, req.user.id);
  }
}

