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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PaymentService } from './payment.service';
import { CreatePaymentIntentDto, ProcessPaymentDto, CreateProviderPaymentSessionDto } from './dto/payment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { FiatToCryptoService } from './fiat-to-crypto.service';
import { EscrowService } from './escrow.service';
import { X402AuthorizationService } from './x402-authorization.service';
import { AgentPaymentService } from './agent-payment.service';
import { X402Service } from './x402.service';
import { FeeEstimationService } from './fee-estimation.service';
import { EstimateFeeDto, ComparePaymentCostsDto } from './dto/fee-estimation.dto';
import { RiskAssessmentService } from './risk-assessment.service';
import { PaymentMethod } from '../../entities/payment.entity';
import { ExchangeRateService } from './exchange-rate.service';
import { ConfigService } from '@nestjs/config';
import { ProviderManagerService } from './provider-manager.service';

import { UnifiedAuthGuard } from '../auth/guards/unified-auth.guard';

@ApiTags('payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly fiatToCryptoService: FiatToCryptoService,
    private readonly escrowService: EscrowService,
    private readonly x402AuthService: X402AuthorizationService,
    private readonly agentPaymentService: AgentPaymentService,
    private readonly x402Service: X402Service,
    private readonly feeEstimationService: FeeEstimationService,
    private readonly riskAssessmentService: RiskAssessmentService,
    private readonly exchangeRateService: ExchangeRateService,
    private readonly configService: ConfigService,
    private readonly providerManagerService: ProviderManagerService,
  ) {}

  @Post('create-intent')
  @ApiOperation({ summary: '创建支付意图（Stripe）' })
  @ApiResponse({ status: 201, description: '支付意图创建成功' })
  @UseGuards(UnifiedAuthGuard)
  async createPaymentIntent(@Request() req, @Body() dto: CreatePaymentIntentDto) {
    return this.paymentService.createPaymentIntent(req.user?.id, dto);
  }

  @Post('process')
  @ApiOperation({ summary: '处理支付' })
  @ApiResponse({ status: 201, description: '支付处理成功' })
  @UseGuards(UnifiedAuthGuard)
  async processPayment(@Request() req, @Body() dto: ProcessPaymentDto) {
    return this.paymentService.processPayment(req.user?.id, dto);
  }

  @Get('routing')
  @ApiOperation({ summary: '获取支付路由建议' })
  @ApiResponse({ status: 200, description: '返回路由建议' })
  @UseGuards(UnifiedAuthGuard)
  async getPaymentRouting(
    @Request() req,
    @Query('amount') amount: number,
    @Query('currency') currency: string = 'CNY',
    @Query('isOnChain') isOnChain?: boolean,
    @Query('userCountry') userCountry?: string,
    @Query('merchantCountry') merchantCountry?: string,
    @Query('merchantPaymentConfig') merchantPaymentConfig?: 'fiat_only' | 'crypto_only' | 'both',
    @Query('orderType') orderType?: 'nft' | 'virtual' | 'service' | 'product' | 'physical', // V3.0新增：订单类型
    @Query('agentId') agentId?: string, // V3.0新增：Agent ID（用于判断是否有Agent）
    @Query('walletConnected') walletConnected?: string,
    @Query('scenario') scenario?: 'qr_pay' | 'micro_sub' | 'wallet_direct' | 'standard',
  ) {
    const parsedWalletConnected =
      typeof walletConnected === 'string' ? walletConnected === 'true' : undefined;

    return this.paymentService.getPaymentRouting(
      req.user?.id,
      Number(amount),
      currency,
      isOnChain === true,
      {
        userCountry,
        merchantCountry,
        isCrossBorder: userCountry && merchantCountry && userCountry !== merchantCountry,
        merchantPaymentConfig: merchantPaymentConfig || 'both', // 默认两种都接受
        orderType: orderType || 'product', // V3.0新增：订单类型
        agentId, // V3.0新增：Agent ID
        walletConnected: parsedWalletConnected,
        scenario,
      } as any,
    );
  }

  @Post(':paymentId/update-status')
  @ApiOperation({ summary: '更新支付状态' })
  @ApiResponse({ status: 200, description: '状态更新成功' })
  @UseGuards(OptionalJwtAuthGuard)
  async updatePaymentStatus(
    @Request() req,
    @Param('paymentId') paymentId: string,
    @Body() body: { transactionHash: string },
  ) {
    return this.paymentService.updatePaymentStatusByHash(
      req.user?.id,
      paymentId,
      body.transactionHash,
    );
  }

  @Post('provider/session')
  @ApiOperation({ summary: '创建Provider支付会话' })
  @ApiResponse({ status: 201, description: 'Provider支付会话已创建' })
  @UseGuards(OptionalJwtAuthGuard)
  async createProviderSession(@Request() req, @Body() dto: CreateProviderPaymentSessionDto) {
    return this.paymentService.createProviderPaymentSession(req.user?.id, dto);
  }

  @Post('provider/transak/session')
  @ApiOperation({ summary: '创建 Transak Session（使用 Create Session API）' })
  @ApiResponse({ status: 201, description: 'Transak Session 已创建' })
  @UseGuards(OptionalJwtAuthGuard)
  async createTransakSession(
    @Request() req,
    @Body() dto: {
      amount: number;
      fiatCurrency?: string;
      cryptoCurrency?: string;
      network?: string;
      walletAddress?: string;
      orderId?: string;
      email?: string;
      redirectURL?: string;
      hideMenu?: boolean;
      disableWalletAddressForm?: boolean;
      disableFiatAmountEditing?: boolean;
      isKYCRequired?: boolean;
      referrerDomain?: string;
      productType?: 'BUY' | 'SELL';  // BUY = onramp (default), SELL = offramp
      isFiatAmount?: boolean;  // true=用户指定法币支出(lock fiatAmount), false=用户指定收到加密货币数量(lock cryptoAmount)
    },
  ) {
    // 调试日志
    console.log('[TransakSession] Raw body:', JSON.stringify(req.body));
    console.log('[TransakSession] Parsed dto:', JSON.stringify(dto));
    console.log('[TransakSession] dto.amount:', dto?.amount, 'type:', typeof dto?.amount);
    
    // 参数验证
    if (!dto || !dto.amount || dto.amount <= 0) {
      throw new BadRequestException(`Amount is required and must be greater than 0. Received: ${JSON.stringify(dto)}`);
    }
    
    const transakProvider = this.providerManagerService.getOnRampProviders().find(
      (p) => p.id === 'transak',
    ) as any;

    if (!transakProvider || !transakProvider.createSession) {
      throw new BadRequestException('Transak provider not available or createSession method not implemented');
    }

    // 获取用户信息
    const user = req.user || {};
    const defaultFrontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';

    const headerValue = (value?: string | string[]): string | undefined => {
      if (!value) {
        return undefined;
      }
      return Array.isArray(value) ? value[0] : value;
    };

    const originHeader =
      headerValue(req.headers?.origin as any) ||
      headerValue(req.headers?.referer as any);

    const extractHost = (value?: string): string | undefined => {
      if (!value) {
        return undefined;
      }
      try {
        return new URL(value).host;
      } catch {
        try {
          return new URL(value.startsWith('http') ? value : `https://${value}`).host;
        } catch {
          return undefined;
        }
      }
    };

    const extractOrigin = (value?: string): string | undefined => {
      if (!value) {
        return undefined;
      }
      try {
        return new URL(value).origin;
      } catch {
        try {
          return new URL(value.startsWith('http') ? value : `https://${value}`).origin;
        } catch {
          return undefined;
        }
      }
    };

    const fallbackDomain = extractHost(defaultFrontendUrl) || 'localhost:3000';
    const referrerDomain = dto.referrerDomain || extractHost(originHeader) || fallbackDomain;

    const redirectURL =
      dto.redirectURL ||
      (extractOrigin(originHeader) ? `${extractOrigin(originHeader)}/payment/callback` : undefined) ||
      `${defaultFrontendUrl.replace(/\/$/, '')}/payment/callback`;

    return transakProvider.createSession({
      amount: dto.amount,
      fiatCurrency: dto.fiatCurrency || 'USD',
      cryptoCurrency: dto.cryptoCurrency || 'USDC',
      network: dto.network || 'bsc',
      walletAddress: dto.walletAddress,
      orderId: dto.orderId,
      userId: user.id,
      email: dto.email || user.email,
      redirectURL,
      hideMenu: dto.hideMenu !== undefined ? dto.hideMenu : true,
      disableWalletAddressForm: dto.disableWalletAddressForm !== undefined ? dto.disableWalletAddressForm : true,
      disableFiatAmountEditing: dto.disableFiatAmountEditing !== undefined ? dto.disableFiatAmountEditing : true,
      isKYCRequired: dto.isKYCRequired !== undefined ? dto.isKYCRequired : true,
      referrerDomain,
      productType: dto.productType || 'BUY',
      isFiatAmount: dto.isFiatAmount === true,  // 透传：true=lock法币金额, false=lock加密货币数量
    });
  }

  @Get('provider/session/:sessionId')
  @ApiOperation({ summary: '查询Provider支付会话状态' })
  @ApiResponse({ status: 200, description: '返回会话状态' })
  @UseGuards(OptionalJwtAuthGuard)
  async getProviderSession(@Request() req, @Param('sessionId') sessionId: string) {
    return this.paymentService.getProviderPaymentSession(req.user?.id, sessionId);
  }

  @Post('provider/session/:sessionId/complete')
  @ApiOperation({ summary: '确认Provider会话已完成（回调/前端）' })
  @ApiResponse({ status: 200, description: '会话状态更新成功' })
  @UseGuards(OptionalJwtAuthGuard)
  async completeProviderSession(
    @Request() req,
    @Param('sessionId') sessionId: string,
    @Body() body: { transactionHash?: string },
  ) {
    return this.paymentService.completeProviderPaymentSession(req.user?.id, sessionId, body);
  }

  // 具体路由必须在参数路由之前定义
  @Get('compare-costs')
  @ApiOperation({ summary: '对比所有支付方式的总成本' })
  @ApiResponse({ status: 200, description: '返回所有支付方式的成本对比' })
  async comparePaymentCosts(
    @Query('amount') amount: number,
    @Query('currency') currency: string = 'USD',
    @Query('chain') chain?: string,
    @Query('targetCurrency') targetCurrency?: string,
  ) {
    return this.feeEstimationService.getAllPaymentCosts(
      Number(amount),
      currency,
      targetCurrency,
      chain,
    );
  }

  @Get('contract-address')
  @ApiOperation({ summary: '获取合约地址' })
  @ApiResponse({ status: 200, description: '返回合约地址信息' })
  async getContractAddress() {
    const commissionAddress = this.configService.get<string>('COMMISSION_CONTRACT_ADDRESS');
    const erc8004Address = this.configService.get<string>('ERC8004_CONTRACT_ADDRESS');
    const usdcAddress = this.configService.get<string>('SETTLEMENT_TOKEN_ADDRESS') || 
                        this.configService.get<string>('BSC_TESTNET_USDC_ADDRESS') ||
                        this.configService.get<string>('USDC_ADDRESS');
    
    if (!commissionAddress) {
      throw new BadRequestException('Commission合约地址未配置，请联系管理员');
    }
    
    return {
      commissionContractAddress: commissionAddress,
      erc8004ContractAddress: erc8004Address,
      usdcAddress: usdcAddress,
    };
  }

  @Get()
  @ApiOperation({ summary: '获取用户的支付记录列表' })
  @ApiResponse({ status: 200, description: '返回支付记录列表' })
  async getUserPayments(
    @Request() req,
    @Query('status') status?: string,
    @Query('paymentMethod') paymentMethod?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.paymentService.getUserPayments(req.user.id, {
      status,
      paymentMethod,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get('history')
  @ApiOperation({ summary: '获取支付历史记录（兼容V2前端）' })
  @ApiResponse({ status: 200, description: '返回支付历史记录' })
  @UseGuards(JwtAuthGuard)
  async getPaymentHistory(
    @Request() req,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('status') status?: string,
    @Query('type') type?: string,
  ) {
    const offset = (page - 1) * limit;
    const result = await this.paymentService.getUserPayments(req.user.id, {
      status,
      limit,
      offset,
    });

    return {
      items: result.data.map(p => ({
        id: p.id,
        orderId: p.metadata?.orderId || '',
        amount: p.amount.toString(),
        currency: p.currency,
        method: p.paymentMethod,
        type: p.paymentMethod === 'stripe' ? 'fiat' : 'crypto',
        status: p.status,
        transactionHash: p.transactionHash,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        metadata: p.metadata
      })),
      total: result.total,
      page: Number(page),
      limit: Number(limit),
      hasMore: result.total > offset + result.data.length,
    };
  }

  @Get(':paymentId')
  @ApiOperation({ summary: '查询支付状态' })
  @ApiResponse({ status: 200, description: '返回支付信息' })
  @UseGuards(OptionalJwtAuthGuard)
  async getPayment(@Request() req, @Param('paymentId') paymentId: string) {
    return this.paymentService.getPayment(req.user?.id, paymentId);
  }

  @Get('fiat-to-crypto/quotes')
  @ApiOperation({ summary: '获取法币转数字货币Provider报价' })
  @ApiResponse({ status: 200, description: '返回所有Provider报价' })
  async getFiatToCryptoQuotes(
    @Query('fromAmount') fromAmount: number,
    @Query('fromCurrency') fromCurrency: string,
    @Query('toCurrency') toCurrency: string,
    @Query('userCountry') userCountry?: string,
  ) {
    return this.fiatToCryptoService.getProviderQuotes(
      Number(fromAmount),
      fromCurrency,
      toCurrency,
      userCountry,
    );
  }

  @Post('fiat-to-crypto/lock')
  @ApiOperation({ summary: '锁定汇率' })
  @ApiResponse({ status: 201, description: '汇率锁定成功' })
  async lockQuote(@Body() body: { quoteId: string; quote: any }) {
    return this.fiatToCryptoService.lockQuote(body.quoteId, body.quote);
  }

  @Post('escrow/create')
  @ApiOperation({ summary: '创建托管交易' })
  @ApiResponse({ status: 201, description: '托管交易创建成功' })
  async createEscrow(@Request() req, @Body() body: any) {
    return this.escrowService.createEscrow({
      ...body,
      userId: req.user.id,
    });
  }

  @Post('escrow/:escrowId/confirm')
  @ApiOperation({ summary: '确认收货（释放资金）' })
  @ApiResponse({ status: 200, description: '资金释放成功' })
  async confirmDelivery(@Request() req, @Param('escrowId') escrowId: string) {
    return this.escrowService.confirmDelivery(escrowId, req.user.id);
  }

  @Get('escrow/:escrowId')
  @ApiOperation({ summary: '查询托管交易' })
  @ApiResponse({ status: 200, description: '返回托管交易信息' })
  async getEscrow(@Param('escrowId') escrowId: string) {
    return this.escrowService.getEscrow(escrowId);
  }

  @Get('x402/authorization')
  @ApiOperation({ summary: '检查X402授权状态' })
  @ApiResponse({ status: 200, description: '返回授权状态' })
  async checkX402Authorization(@Request() req) {
    return this.x402AuthService.checkAuthorization(req.user.id);
  }

  @Post('x402/authorization')
  @ApiOperation({ summary: '创建X402授权' })
  @ApiResponse({ status: 201, description: '授权创建成功' })
  async createX402Authorization(
    @Request() req,
    @Body() body: {
      singleLimit: number;
      dailyLimit: number;
      durationDays?: number;
    },
  ) {
    return this.x402AuthService.createAuthorization(
      req.user.id,
      body.singleLimit,
      body.dailyLimit,
      body.durationDays || 30,
    );
  }

  @Post('x402/session')
  @ApiOperation({ summary: '创建X402支付会话' })
  @ApiResponse({ status: 201, description: '会话创建成功' })
  async createX402Session(
    @Request() req,
    @Body() body: {
      paymentId: string;
      amount: number;
      currency: string;
      metadata?: any;
    },
  ) {
    return this.x402Service.createPaymentSession(
      body.paymentId,
      {
        amount: body.amount,
        currency: body.currency,
        paymentMethod: 'x402' as any,
        metadata: body.metadata,
      },
      req.user.id,
    );
  }

  @Get('autonomy/capabilities')
  @ApiOperation({ summary: '获取主网前自治能力开关（前端适配）' })
  @ApiResponse({ status: 200, description: '返回自治支付与授权能力状态' })
  getAutonomyCapabilities() {
    const erc8004Address = this.configService.get<string>('ERC8004_CONTRACT_ADDRESS');
    const commissionAddress = this.configService.get<string>('COMMISSION_CONTRACT_ADDRESS');
    const relayerKeyConfigured = !!this.configService.get<string>('RELAYER_PRIVATE_KEY');

    return {
      erc8004: {
        enabled: !!erc8004Address,
        contractAddress: erc8004Address || null,
      },
      x402: {
        enabled: true,
        routeThroughCommission: !!commissionAddress,
        commissionContractAddress: commissionAddress || null,
      },
      relayer: {
        enabled: relayerKeyConfigured,
        gasSponsoredByPlatform: relayerKeyConfigured,
      },
      frontendRequiredChanges: {
        showAgentAuthorizationEntry: true,
        requireSessionBeforeQuickPay: true,
        showCommissionRouteHint: true,
        showGasPolicyDisclosure: true,
      },
    };
  }

  @Post('x402/session/:sessionId/execute')
  @ApiOperation({ summary: '执行X402支付' })
  @ApiResponse({ status: 200, description: '支付执行成功' })
  async executeX402Payment(@Param('sessionId') sessionId: string) {
    return this.x402Service.executePayment(sessionId);
  }

  @Post('agent/create')
  @ApiOperation({ summary: '创建Agent代付' })
  @ApiResponse({ status: 201, description: 'Agent代付创建成功' })
  async createAgentPayment(
    @Request() req,
    @Body() body: {
      agentId: string;
      amount: number;
      currency: string;
      merchantId: string;
      description?: string;
      repaymentMethod?: 'offline' | 'system' | 'crypto';
    },
  ) {
    return this.agentPaymentService.createAgentPayment({
      ...body,
      userId: req.user.id,
    });
  }

  @Post('agent/:paymentId/confirm')
  @ApiOperation({ summary: 'Agent确认支付' })
  @ApiResponse({ status: 200, description: '支付确认成功' })
  async confirmAgentPayment(
    @Request() req,
    @Param('paymentId') paymentId: string,
    @Body() body: { transactionHash: string },
  ) {
    return this.agentPaymentService.confirmAgentPayment(
      paymentId,
      req.user.id,
      body.transactionHash,
    );
  }

  @Post('agent/:paymentId/repay')
  @ApiOperation({ summary: '用户还款给Agent' })
  @ApiResponse({ status: 200, description: '还款成功' })
  async repayToAgent(
    @Request() req,
    @Param('paymentId') paymentId: string,
    @Body() body?: { transactionHash?: string },
  ) {
    return this.agentPaymentService.repayToAgent(
      paymentId,
      req.user.id,
      body?.transactionHash,
    );
  }

  @Get('agent/list')
  @ApiOperation({ summary: '获取Agent代付记录' })
  @ApiResponse({ status: 200, description: '返回代付记录列表' })
  async getAgentPayments(@Request() req) {
    return this.agentPaymentService.getAgentPayments(req.user.id);
  }

  @Get('agent/user-list')
  @ApiOperation({ summary: '获取用户的Agent代付记录' })
  @ApiResponse({ status: 200, description: '返回用户的代付记录列表' })
  async getUserAgentPayments(@Request() req) {
    return this.agentPaymentService.getUserAgentPayments(req.user.id);
  }

  @Post('estimate-fee')
  @HttpCode(200)
  @ApiOperation({ summary: '估算支付手续费' })
  @ApiResponse({ status: 200, description: '返回手续费估算结果' })
  async estimateFee(@Body() dto: EstimateFeeDto) {
    const { amount, currency, paymentMethod, chain, targetCurrency } = dto;
    const { PaymentMethod } = await import('../../entities/payment.entity');

    if (paymentMethod === PaymentMethod.STRIPE) {
      return this.feeEstimationService.estimateStripeFee(amount, currency);
    } else if (paymentMethod === PaymentMethod.WALLET) {
      if (chain === 'solana') {
        return this.feeEstimationService.estimateSolanaGasFee(amount);
      } else {
        const chainType = (chain as 'ethereum' | 'bsc' | 'polygon' | 'base') || 'ethereum';
        return this.feeEstimationService.estimateWalletGasFee(chainType, amount);
      }
    } else if (paymentMethod === PaymentMethod.X402) {
      const chainType = (chain as 'ethereum' | 'solana' | 'bsc' | 'polygon') || 'ethereum';
      return this.feeEstimationService.estimateX402Fee(amount, chainType);
    }

    throw new BadRequestException('不支持的支付方式');
  }

  @Post('assess-risk')
  @HttpCode(200)
  @ApiOperation({ summary: '评估交易风险' })
  @ApiResponse({ status: 200, description: '返回风险评估结果' })
  async assessRisk(
    @Request() req,
    @Body() body: {
      amount: number;
      paymentMethod: PaymentMethod;
      metadata?: any;
    },
  ) {
    const assessment = await this.riskAssessmentService.assessRisk(
      req.user.id,
      body.amount,
      body.paymentMethod,
      body.metadata,
    );

    // 记录风险评估结果（如果有关联的支付ID）
    if (body.metadata?.paymentId) {
      await this.riskAssessmentService.recordRiskAssessment(
        body.metadata.paymentId,
        assessment,
      );
    }

    return assessment;
  }

  @Get('exchange-rate/quotes')
  @ApiOperation({ summary: '获取实时汇率' })
  @ApiResponse({ status: 200, description: '返回汇率信息' })
  async getExchangeRate(
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const rate = await this.exchangeRateService.getExchangeRate(from, to);
    return {
      from,
      to,
      rate,
      timestamp: Date.now(),
      source: 'coingecko',
    };
  }

  @Post('exchange-rate/lock')
  @ApiOperation({ summary: '锁定汇率' })
  @ApiResponse({ status: 201, description: '汇率锁定成功' })
  async lockExchangeRate(
    @Body() body: {
      from: string;
      to: string;
      amount: number;
      expiresIn?: number; // 有效期（秒），默认600秒（10分钟）
    },
  ) {
    const lock = await this.exchangeRateService.lockExchangeRate(
      body.from,
      body.to,
      body.amount,
      body.expiresIn,
    );

    return lock;
  }

  @Get('exchange-rate/lock/:lockId')
  @ApiOperation({ summary: '验证锁定汇率' })
  @ApiResponse({ status: 200, description: '返回锁定汇率信息' })
  async getExchangeRateLock(@Param('lockId') lockId: string) {
    const validation = this.exchangeRateService.validateRateLock(lockId);

    if (!validation.lock) {
      return {
        valid: false,
        lockId,
        message: 'Lock not found or expired',
      };
    }

    return {
      valid: validation.valid,
      ...validation.lock,
    };
  }
}

