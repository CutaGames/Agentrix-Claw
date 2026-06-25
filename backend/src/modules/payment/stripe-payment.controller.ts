import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { StripeService } from './stripe.service';
import { StripeProviderService } from './stripe-provider.service';
import { SmartRouterService } from './smart-router.service';
import { StripeSettlementSchedulerService } from './stripe-settlement-scheduler.service';
import { 
  CreateStripePaymentDto,
  CreateStripePaymentPublicDto, 
  CreateStripeRefundDto, 
  StripeCustomerDto,
  CalculateStripeFeeDto,
} from './dto/payment.dto';
import { UnifiedAuthGuard } from '../auth/guards/unified-auth.guard';
import { PaymentMethod } from '../../entities/payment.entity';

@ApiTags('payments/stripe')
@ApiBearerAuth()
@Controller('payments/stripe')
export class StripePaymentController {
  constructor(
    private readonly stripeService: StripeService,
    private readonly stripeProviderService: StripeProviderService,
    private readonly smartRouterService: SmartRouterService,
    private readonly settlementSchedulerService: StripeSettlementSchedulerService,
  ) {}

  /**
   * 公开的 PaymentIntent 创建端点 - 用于结账页面
   * 不需要认证，适用于匿名支付场景
   */
  @Post('create-intent-public')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '创建 Stripe PaymentIntent (公开)' })
  @ApiResponse({ status: 200, description: 'PaymentIntent 创建成功' })
  @ApiBody({ type: CreateStripePaymentPublicDto })
  async createPaymentIntentPublic(
    @Body() dto: CreateStripePaymentPublicDto,
  ) {
    if (!this.stripeService.isStripeConfigured()) {
      throw new BadRequestException('Stripe is not configured on this server');
    }

    // 对于公开端点，userId 可选
    const userId = dto.userId || 'anonymous';

    return this.stripeService.createPaymentIntent({
      amount: dto.amount,
      currency: dto.currency || 'USD',
      paymentMethod: PaymentMethod.STRIPE,
      userId,
      paymentId: undefined,
      description: dto.description,
      orderId: dto.orderId,
      merchantId: dto.merchantId,
      agentId: dto.agentId,
      skillLayerType: dto.skillLayerType,
      commissionRate: dto.commissionRate,
      customerId: dto.customerId,
    });
  }

  @Post('create-intent')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '创建 Stripe PaymentIntent' })
  @ApiResponse({ status: 200, description: 'PaymentIntent 创建成功' })
  @ApiBody({ type: CreateStripePaymentDto })
  @UseGuards(UnifiedAuthGuard)
  async createPaymentIntent(
    @Request() req,
    @Body() dto: CreateStripePaymentDto,
  ) {
    if (!this.stripeService.isStripeConfigured()) {
      throw new BadRequestException('Stripe is not configured on this server');
    }

    // 使用当前用户 ID（如果 dto 中未提供）
    const userId = dto.userId || req.user?.id;
    if (!userId) {
      throw new BadRequestException('User ID is required');
    }

    return this.stripeService.createPaymentIntent({
      amount: dto.amount,
      currency: dto.currency || 'USD',
      paymentMethod: PaymentMethod.STRIPE,
      userId,
      paymentId: undefined, // 将由 service 创建
      description: dto.description,
      orderId: dto.orderId,
      merchantId: dto.merchantId,
      agentId: dto.agentId,
      skillLayerType: dto.skillLayerType,
      commissionRate: dto.commissionRate,
      customerId: dto.customerId,
    });
  }

  @Post('create-payment')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '创建带订单关联的 Stripe 支付' })
  @ApiResponse({ status: 200, description: '支付创建成功' })
  @ApiBody({ type: CreateStripePaymentDto })
  @UseGuards(UnifiedAuthGuard)
  async createPaymentWithOrder(
    @Request() req,
    @Body() dto: CreateStripePaymentDto,
  ) {
    if (!this.stripeService.isStripeConfigured()) {
      throw new BadRequestException('Stripe is not configured on this server');
    }

    const userId = dto.userId || req.user?.id;
    if (!userId) {
      throw new BadRequestException('User ID is required');
    }

    return this.stripeService.createPaymentWithOrder({
      amount: dto.amount,
      currency: dto.currency || 'USD',
      userId,
      orderId: dto.orderId,
      merchantId: dto.merchantId,
      agentId: dto.agentId,
      description: dto.description,
      skillLayerType: dto.skillLayerType,
      commissionRate: dto.commissionRate,
      metadata: dto.metadata,
    });
  }

  @Get('status/:paymentIntentId')
  @ApiOperation({ summary: '获取 Stripe 支付状态' })
  @ApiResponse({ status: 200, description: '返回支付状态' })
  @ApiParam({ name: 'paymentIntentId', description: 'Stripe PaymentIntent ID' })
  @UseGuards(UnifiedAuthGuard)
  async getPaymentStatus(@Param('paymentIntentId') paymentIntentId: string) {
    if (!this.stripeService.isStripeConfigured()) {
      throw new BadRequestException('Stripe is not configured');
    }

    return this.stripeProviderService.getPaymentStatus(paymentIntentId);
  }

  @Post('cancel/:paymentIntentId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '取消 Stripe 支付' })
  @ApiResponse({ status: 200, description: '支付已取消' })
  @ApiParam({ name: 'paymentIntentId', description: 'Stripe PaymentIntent ID' })
  @UseGuards(UnifiedAuthGuard)
  async cancelPayment(@Param('paymentIntentId') paymentIntentId: string) {
    if (!this.stripeService.isStripeConfigured()) {
      throw new BadRequestException('Stripe is not configured');
    }

    const success = await this.stripeProviderService.cancelPayment(paymentIntentId);
    return { success };
  }

  @Post('refund')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '创建 Stripe 退款' })
  @ApiResponse({ status: 200, description: '退款已创建' })
  @ApiBody({ type: CreateStripeRefundDto })
  @UseGuards(UnifiedAuthGuard)
  async createRefund(@Body() dto: CreateStripeRefundDto) {
    if (!this.stripeService.isStripeConfigured()) {
      throw new BadRequestException('Stripe is not configured');
    }

    return this.stripeProviderService.createRefund({
      paymentIntentId: dto.paymentIntentId,
      amount: dto.amount,
      reason: dto.reason,
    });
  }

  @Get('calculate-fee')
  @ApiOperation({ summary: '计算 Stripe 手续费' })
  @ApiResponse({ status: 200, description: '返回手续费计算结果' })
  @ApiQuery({ name: 'amount', description: '支付金额', required: true })
  @ApiQuery({ name: 'isInternational', description: '是否为国际卡', required: false })
  async calculateFee(
    @Query('amount') amount: number,
    @Query('isInternational') isInternational?: string,
  ) {
    const isIntl = isInternational === 'true';
    return this.stripeService.calculateStripeFee(Number(amount), isIntl);
  }

  @Get('fee-comparison')
  @ApiOperation({ summary: '获取 Stripe 与其他通道的费用比较' })
  @ApiResponse({ status: 200, description: '返回费用比较结果' })
  @ApiQuery({ name: 'amount', description: '支付金额', required: true })
  @ApiQuery({ name: 'currency', description: '货币类型', required: true })
  @ApiQuery({ name: 'targetCrypto', description: '目标加密货币（可选）', required: false })
  async getFeeComparison(
    @Query('amount') amount: number,
    @Query('currency') currency: string,
    @Query('targetCrypto') targetCrypto?: string,
  ) {
    return this.stripeProviderService.compareWithOtherChannels(
      Number(amount),
      currency,
      targetCrypto,
    );
  }

  @Post('customer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '创建或获取 Stripe Customer' })
  @ApiResponse({ status: 200, description: '返回 Customer 信息' })
  @ApiBody({ type: StripeCustomerDto })
  @UseGuards(UnifiedAuthGuard)
  async getOrCreateCustomer(
    @Request() req,
    @Body() dto: StripeCustomerDto,
  ) {
    if (!this.stripeService.isStripeConfigured()) {
      throw new BadRequestException('Stripe is not configured');
    }

    const userId = dto.userId || req.user?.id;
    if (!userId) {
      throw new BadRequestException('User ID is required');
    }

    return this.stripeService.getOrCreateCustomer({
      userId,
      email: dto.email,
      name: dto.name,
    });
  }

  @Get('payment-methods/:customerId')
  @ApiOperation({ summary: '获取 Customer 的支付方式列表' })
  @ApiResponse({ status: 200, description: '返回支付方式列表' })
  @ApiParam({ name: 'customerId', description: 'Stripe Customer ID' })
  @UseGuards(UnifiedAuthGuard)
  async listPaymentMethods(@Param('customerId') customerId: string) {
    if (!this.stripeService.isStripeConfigured()) {
      throw new BadRequestException('Stripe is not configured');
    }

    return this.stripeService.listPaymentMethods(customerId);
  }

  @Get('environment')
  @ApiOperation({ summary: '获取 Stripe 环境信息' })
  @ApiResponse({ status: 200, description: '返回环境信息' })
  async getEnvironmentInfo() {
    return {
      configured: this.stripeService.isStripeConfigured(),
      environment: this.stripeService.isStripeConfigured() 
        ? this.stripeService.getEnvironment() 
        : null,
    };
  }

  // ========================================
  // 智能路由相关端点
  // ========================================

  @Post('routing/stripe-or-transak')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取 Stripe vs Transak 路由建议' })
  @ApiResponse({ status: 200, description: '返回推荐的支付通道' })
  async getStripeOrTransakRecommendation(
    @Body() params: {
      amount: number;
      fromCurrency: string;
      toCurrency: string;
      merchantPaymentConfig: 'fiat_only' | 'crypto_only' | 'both';
      isCrossBorder?: boolean;
      preferCrypto?: boolean;
    },
  ) {
    return this.smartRouterService.selectStripeOrTransak(params);
  }

  @Post('routing/multi-channel-quotes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取多通道报价比较' })
  @ApiResponse({ status: 200, description: '返回多通道报价' })
  async getMultiChannelQuotes(
    @Body() params: {
      amount: number;
      fromCurrency: string;
      toCurrency?: string;
      merchantPaymentConfig: 'fiat_only' | 'crypto_only' | 'both';
    },
  ) {
    return this.smartRouterService.getMultiChannelQuotes(params);
  }

  // ========================================
  // 结算相关端点（仅限管理员）
  // ========================================

  @Get('settlement/stats')
  @ApiOperation({ summary: '获取 Stripe 结算统计' })
  @ApiResponse({ status: 200, description: '返回结算统计' })
  @UseGuards(UnifiedAuthGuard)
  async getSettlementStats() {
    return this.settlementSchedulerService.getSettlementStats();
  }

  @Get('settlement/merchant/:merchantId')
  @ApiOperation({ summary: '获取商户结算汇总' })
  @ApiResponse({ status: 200, description: '返回商户结算汇总' })
  @ApiParam({ name: 'merchantId', description: '商户 ID' })
  @UseGuards(UnifiedAuthGuard)
  async getMerchantSettlementSummary(@Param('merchantId') merchantId: string) {
    return this.settlementSchedulerService.getMerchantSettlementSummary(merchantId);
  }

  @Get('settlement/agent/:agentId')
  @ApiOperation({ summary: '获取 Agent 结算汇总' })
  @ApiResponse({ status: 200, description: '返回 Agent 结算汇总' })
  @ApiParam({ name: 'agentId', description: 'Agent ID' })
  @UseGuards(UnifiedAuthGuard)
  async getAgentSettlementSummary(@Param('agentId') agentId: string) {
    return this.settlementSchedulerService.getAgentSettlementSummary(agentId);
  }

  @Post('settlement/manual')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '手动触发结算（仅限管理员）' })
  @ApiResponse({ status: 200, description: '结算已触发' })
  @UseGuards(UnifiedAuthGuard)
  async triggerManualSettlement(
    @Body() params: { daysAgo?: number },
  ) {
    // TODO: 添加管理员权限检查
    return this.settlementSchedulerService.manualSettlement(params.daysAgo || 3);
  }
}
