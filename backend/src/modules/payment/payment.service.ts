import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment, PaymentStatus, PaymentMethod } from '../../entities/payment.entity';
import { CreatePaymentIntentDto, ProcessPaymentDto, CreateProviderPaymentSessionDto } from './dto/payment.dto';
import { StripeService } from './stripe.service';
import { X402Service } from './x402.service';
import { X402AuthorizationService } from './x402-authorization.service';
import { SmartRouterService, RoutingContext, ScenarioType } from './smart-router.service';
import { CommissionCalculatorService, OrderType } from '../commission/commission-calculator.service';
import { FiatToCryptoService } from './fiat-to-crypto.service';
import { EscrowService } from './escrow.service';
import { PaymentAggregatorService } from './payment-aggregator.service';
import { UserService } from '../user/user.service';
import { User } from '../../entities/user.entity';
import { ConfigService } from '@nestjs/config';
import { ReferralService } from '../referral/referral.service';
import { PricingService } from '../pricing/pricing.service';
import { TaxService } from '../tax/tax.service';
import { v4 as uuidv4 } from 'uuid';
import { ethers } from 'ethers';
import { ProviderPaymentFlowService } from './provider-payment-flow.service';
import { RiskAssessmentService } from './risk-assessment.service';
import { QuickPayGrantService } from './quick-pay-grant.service';
import { ExchangeRateService } from './exchange-rate.service';
import { PolicyEngineService } from '../user-agent/policy-engine.service';
import { PayMindRelayerService } from '../relayer/relayer.service';
// import { WebSocketGateway } from '../websocket/websocket.gateway'; // 暂时禁用WebSocket

type PaymentRouteMethod = PaymentMethod | 'fiat_to_crypto' | 'quickpay';

export interface RecommendedRoute {
  id: string;
  label: string;
  scenario: ScenarioType;
  method: PaymentRouteMethod;
  requiresKYC?: boolean;
  requiresWallet?: boolean;
  provider?: string;
  quickPay?: {
    eligible: boolean;
    singleLimit?: number;
    dailyLimit?: number;
  };
  steps: string[];
  badges?: string[];
}

export interface ScenarioMeta {
  type: ScenarioType;
  title: string;
  description: string;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private stripeService: StripeService,
    private x402Service: X402Service,
    private x402AuthService: X402AuthorizationService,
    private smartRouter: SmartRouterService,
    private commissionCalculator: CommissionCalculatorService,
    private fiatToCryptoService: FiatToCryptoService,
    private escrowService: EscrowService,
    private paymentAggregatorService: PaymentAggregatorService,
    private configService: ConfigService,
    private userService: UserService,
    private pricingService: PricingService,
    private taxService: TaxService,
    private providerPaymentFlow: ProviderPaymentFlowService,
    private riskAssessmentService: RiskAssessmentService,
    private quickPayGrantService: QuickPayGrantService,
    private exchangeRateService: ExchangeRateService,
    private policyEngineService: PolicyEngineService,
    @Inject(forwardRef(() => PayMindRelayerService))
    private relayerService?: PayMindRelayerService,
    @Inject(forwardRef(() => ReferralService))
    private referralService?: ReferralService,
    // @Inject(forwardRef(() => WebSocketGateway))
    // private wsGateway: WebSocketGateway, // 暂时禁用WebSocket
  ) {}

  async createPaymentIntent(userId: string | undefined, dto: CreatePaymentIntentDto) {
    // 1. 策略引擎验证 (Policy Engine Validation)
    // 如果是 Agent 发起的交易（通常带有 agentId 或通过 X402 协议）
    const validation = await this.policyEngineService.validateTransaction(userId || '', {
      amount: dto.amount,
      currency: dto.currency,
      metadata: dto.metadata,
    });

    if (!validation.allowed) {
      this.logger.warn(`交易被策略引擎拦截: ${validation.reason}`);
      throw new BadRequestException(`Policy Violation: ${validation.reason}`);
    }

    if (dto.paymentMethod === PaymentMethod.STRIPE) {
      // 先创建支付记录，用于Webhook回调
      const payment = this.paymentRepository.create({
        userId,
        amount: dto.amount,
        currency: dto.currency || 'CNY',
        paymentMethod: PaymentMethod.STRIPE,
        description: dto.description,
        status: PaymentStatus.PENDING,
      });
      const savedPayment = await this.paymentRepository.save(payment);

      // 创建支付意图，包含paymentId用于Webhook回调
      return this.stripeService.createPaymentIntent({
        ...dto,
        userId,
        paymentId: savedPayment.id,
      });
    }
    throw new BadRequestException('不支持的支付方式');
  }

  /**
   * 处理支付（使用智能路由）
   */
  async processPayment(userId: string | undefined, dto: ProcessPaymentDto) {
    // 获取用户信息（用于KYC状态和国家信息）
    const user = userId ? await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'kycLevel', 'kycStatus'],
    }) : null;

    // 构建路由上下文
    const routingContext: RoutingContext = {
      amount: dto.amount,
      currency: dto.currency,
      userCurrency: dto.metadata?.userCurrency,
      merchantCurrency: dto.metadata?.merchantCurrency,
      isOnChain: dto.metadata?.isOnChain || false,
      userKYCLevel: user?.kycLevel,
      isCrossBorder: dto.metadata?.isCrossBorder,
      userCountry: dto.metadata?.userCountry,
      merchantCountry: dto.metadata?.merchantCountry,
      merchantPaymentConfig: dto.metadata?.merchantPaymentConfig || 'both', // 商家收款方式配置
    };

    // 如果使用了汇率锁，验证并补充元数据
    if (dto.metadata?.exchangeRateLockId) {
      const validation = this.exchangeRateService.validateRateLock(
        dto.metadata.exchangeRateLockId,
      );

      if (!validation.lock) {
        throw new BadRequestException('汇率已过期，请重新获取最新汇率后再支付');
      }

      if (!validation.valid) {
        throw new BadRequestException('汇率锁已失效，请重新锁定汇率后再支付');
      }

      dto.metadata = {
        ...dto.metadata,
        exchangeRateLock: validation.lock,
        cryptoAmount: dto.metadata.cryptoAmount || dto.amount,
        convertedCurrency: dto.currency,
        originalAmount: dto.metadata.originalAmount || validation.lock.amount,
        originalCurrency: dto.metadata.originalCurrency || validation.lock.from,
        conversionRate: validation.lock.rate,
      };

      routingContext.userCurrency = dto.metadata.originalCurrency;
    }

    // 处理用户友好的支付方式
    // 如果用户选择了apple_pay、google_pay等，映射到后端支持的方式
    let actualPaymentMethod: PaymentMethod | undefined = dto.paymentMethod;
    const paymentMethodStr = (dto.paymentMethod as string) || '';
    if (paymentMethodStr === 'apple_pay' || paymentMethodStr === 'google_pay') {
      // 用户选择Apple Pay或Google Pay，后端使用stripe处理，但保留用户选择信息
      actualPaymentMethod = PaymentMethod.STRIPE;
      dto.metadata = {
        ...dto.metadata,
        fiatPaymentMethod: paymentMethodStr, // 保存用户选择的支付方式
      };
    } else if (paymentMethodStr === 'crypto') {
      // 用户选择数字货币支付，让智能路由自动选择最优方式（X402或直接转账）
      actualPaymentMethod = undefined; // 不指定，让智能路由决定
    }

    // 如果已经明确指定了支付方式（如wallet），直接使用，不进行路由选择
    // 钱包支付时，如果已经有txHash，说明链上转账已完成，直接处理
    if (actualPaymentMethod === PaymentMethod.WALLET && dto.metadata?.txHash) {
      // 钱包支付已完成链上转账，直接处理，不需要路由选择
      this.logger.log(`Wallet payment with txHash: ${dto.metadata.txHash}, skipping routing`);
    } else if (!actualPaymentMethod && userId) {
      // 如果没有指定支付方式，先检查QuickPay授权
      // 1. 优先检查X402授权（最快、最安全）
      const x402Auth = await this.x402AuthService.checkAuthorization(userId);
      if (x402Auth && x402Auth.isActive && dto.metadata?.isOnChain) {
        // 检查X402限额
        if (dto.amount <= x402Auth.singleLimit) {
          const dailyUsed = x402Auth.usedToday || 0;
          if (dailyUsed + dto.amount <= x402Auth.dailyLimit) {
            actualPaymentMethod = PaymentMethod.X402;
            dto.metadata = {
              ...dto.metadata,
              quickPayType: 'x402',
              x402AuthId: x402Auth.id,
            };
          }
        }
      }

      // 2. 如果没有X402授权，检查其他QuickPay授权
      if (!actualPaymentMethod) {
        const quickPayGrants = await this.quickPayGrantService.getUserGrants(userId);
        const validGrant = await this.findValidQuickPayGrant(
          quickPayGrants,
          dto.amount,
          dto.merchantId,
        );
        
        if (validGrant) {
          // 根据授权类型选择支付方式
          if (validGrant.paymentMethod.type === 'x402') {
            actualPaymentMethod = PaymentMethod.X402;
          } else if (validGrant.paymentMethod.type === 'wallet') {
            actualPaymentMethod = PaymentMethod.WALLET;
          } else if (validGrant.paymentMethod.type === 'stripe') {
            actualPaymentMethod = PaymentMethod.STRIPE;
          }
          
          dto.metadata = {
            ...dto.metadata,
            quickPayType: 'grant',
            quickPayGrantId: validGrant.id,
          };
        }
      }

      // 3. 如果还是没有，使用智能路由选择（但跳过钱包支付，因为钱包支付应该由前端直接调用）
      if (!actualPaymentMethod) {
        try {
          const routing = this.smartRouter.selectBestChannel(
            dto.amount,
            dto.currency,
            dto.metadata?.isOnChain || false,
            routingContext,
          );
          actualPaymentMethod = routing.recommendedMethod;
        } catch (error) {
          // 如果路由选择失败，根据货币类型降级
          const isFiatCurrency = ['CNY', 'USD', 'EUR', 'GBP', 'JPY', 'INR'].includes(dto.currency.toUpperCase());
          if (isFiatCurrency) {
            actualPaymentMethod = PaymentMethod.TRANSAK; // 法币走 Transak
          } else {
            actualPaymentMethod = PaymentMethod.WALLET; // 数字货币走钱包
          }
          this.logger.warn(`Routing failed, using fallback: ${actualPaymentMethod}`);
        }
      }
    }

    // 自动检测是否需要托管交易（Escrow）
    const isEscrow = this.shouldUseEscrow(dto);

    // 如果是托管交易，先创建托管
    let escrowId: string | undefined;
    if (isEscrow) {
      // 获取订单类型和结算配置
      const orderType = (dto.metadata?.orderType || 'product') as 'nft' | 'virtual' | 'service' | 'product' | 'physical';
      const config = this.commissionCalculator.getCommissionAndSettlementConfig(
        orderType,
        dto.amount,
      );

      const escrow = await this.escrowService.createEscrow({
        paymentId: '', // 将在创建支付后更新
        merchantId: dto.merchantId || '',
        userId,
        amount: dto.amount,
        currency: dto.currency,
        commissionRate: dto.metadata?.commissionRate,
        autoReleaseDays: dto.metadata?.autoReleaseDays || config.settlement.autoConfirmDays || 7,
        description: dto.description,
        orderType,
        settlementType: config.settlement.type,
        commission: config.commission,
      });
      escrowId = escrow.escrowId;
    }

    // 创建Session ID（三层ID之一）
    const sessionId = uuidv4();

    // 风险评估（在创建支付记录之前）
    const riskAssessment = await this.riskAssessmentService.assessRisk(
      userId,
      dto.amount,
      actualPaymentMethod || PaymentMethod.STRIPE,
      {
        ...dto.metadata,
        ipAddress: dto.metadata?.ipAddress,
        deviceFingerprint: dto.metadata?.deviceFingerprint,
      },
    );

    // 根据风险评估结果决定是否继续
    if (riskAssessment.decision === 'reject') {
      throw new BadRequestException(
        `交易被拒绝: ${riskAssessment.recommendation || '风险评分过高'}`,
      );
    }

    // 如果是高风险，需要二次确认（这里只是记录，实际应该返回给前端让用户确认）
    if (riskAssessment.decision === 'review') {
      this.logger.warn(
        `高风险交易需要审核 - User: ${userId}, Amount: ${dto.amount}, Risk Score: ${riskAssessment.riskScore}`,
      );
    }

    // 获取产品价格和税费（如果提供了productId和countryCode）
    let productPrice: any = null;
    let taxCalculation: any = null;
    let channelFee = 0;
    let commissionBase = dto.amount; // 默认使用支付金额作为佣金计算基础

    if (dto.metadata?.productId && dto.metadata?.countryCode) {
      try {
        productPrice = await this.pricingService.getProductPriceForCountry(
          dto.metadata.productId,
          dto.metadata.countryCode,
          dto.metadata.regionCode,
        );
        
        taxCalculation = await this.taxService.calculateTax(
          productPrice.amount,
          dto.metadata.countryCode,
          dto.metadata.regionCode,
        );

        // 计算通道费用（根据支付方式）
        channelFee = await this.calculateChannelFee(
          productPrice.amount,
          actualPaymentMethod || PaymentMethod.STRIPE,
        );

        // 佣金计算基础 = 商户税前价格（产品价格，不含税费）
        commissionBase = productPrice.amount;
      } catch (error) {
        this.logger.warn(`获取产品价格失败: ${error.message}，使用默认金额`);
      }
    }

    const payment = this.paymentRepository.create({
      userId,
      amount: dto.amount,
      currency: dto.currency,
      paymentMethod: actualPaymentMethod,
      description: dto.description,
      merchantId: dto.merchantId,
      agentId: dto.agentId,
      countryCode: dto.metadata?.countryCode,
      taxAmount: taxCalculation?.amount || 0,
      taxRate: taxCalculation?.rate || 0,
      channelFee,
      commissionRate: dto.metadata?.commissionRate,
      sessionId,
      metadata: {
        ...dto.metadata,
        escrowId,
        productPrice,
        taxCalculation,
        routing: this.smartRouter.selectBestChannel(
          dto.amount,
          dto.currency,
          dto.metadata?.isOnChain || false,
          routingContext,
        ),
        riskAssessment, // 保存风险评估结果
      },
      status: PaymentStatus.PROCESSING,
    });

    const savedPayment = await this.paymentRepository.save(payment);

    // 记录风险评估结果到数据库
    await this.riskAssessmentService.recordRiskAssessment(
      savedPayment.id,
      {
        ...riskAssessment,
        metadata: {
          ...riskAssessment.metadata,
          paymentId: savedPayment.id,
        },
      },
    );

    // 如果使用了QuickPay授权，记录使用量
    if (dto.metadata?.quickPayGrantId) {
      await this.quickPayGrantService.recordUsage(
        dto.metadata.quickPayGrantId,
        dto.amount,
      );
    }

    // 如果使用了X402授权，记录使用量
    if (dto.metadata?.x402AuthId) {
      await this.x402AuthService.recordUsage(
        dto.metadata.x402AuthId,
        dto.amount,
      );
    }

    // 更新托管交易的paymentId
    if (escrowId) {
      await this.escrowService.updateEscrowPaymentId(escrowId, savedPayment.id);
      this.logger.log(`托管交易 ${escrowId} 关联支付 ${savedPayment.id}`);
    }

    // 根据支付方式处理
    try {
      // 检查是否需要跨境支付（法币转数字货币）
      const isCrossBorder = routingContext.isCrossBorder || 
        (routingContext.userCountry && routingContext.merchantCountry && 
         routingContext.userCountry !== routingContext.merchantCountry);

      if (isCrossBorder && dto.metadata?.crossBorderRoute?.fiatToCrypto) {
        // 跨境支付：需要先进行法币转数字货币
        const exchangeQuote = dto.metadata?.exchangeQuote;
        if (!exchangeQuote) {
          throw new BadRequestException('跨境支付需要提供汇率报价');
        }

        // 锁定汇率
        const lockId = await this.fiatToCryptoService.lockQuote(
          `quote_${savedPayment.id}`,
          exchangeQuote,
        );

        // 执行法币转数字货币（需要前端提供支付方式）
        if (dto.metadata?.fiatPaymentMethod) {
          const exchangeResult = await this.fiatToCryptoService.executeExchange(
            lockId,
            dto.metadata.fiatPaymentMethod,
            dto.metadata.fiatPaymentData,
          );

          savedPayment.metadata = {
            ...savedPayment.metadata,
            exchangeResult,
            cryptoAmount: exchangeResult.cryptoAmount,
            cryptoCurrency: exchangeResult.cryptoCurrency,
          };
        } else {
          // 如果没有提供支付方式，等待前端调用
          savedPayment.status = PaymentStatus.PENDING;
          savedPayment.metadata = {
            ...savedPayment.metadata,
            exchangeLockId: lockId,
            waitingForFiatPayment: true,
          };
          return this.paymentRepository.save(savedPayment);
        }
      }

      // 检查是否使用支付聚合服务商（当没有Stripe账户时）
      // 检查Stripe服务是否可用（通过检查是否有配置）
      const stripeAvailable = this.stripeService && 
        this.configService?.get<string>('STRIPE_SECRET_KEY');
      const useAggregator = !stripeAvailable && 
        (dto.paymentMethod === PaymentMethod.STRIPE || 
         paymentMethodStr === 'apple_pay' || 
         paymentMethodStr === 'google_pay' ||
         paymentMethodStr === 'stripe');

      if (useAggregator) {
        // 使用支付聚合服务商处理法币支付
        const bestAggregator = this.paymentAggregatorService.selectBestAggregator(
          dto.amount,
          dto.currency,
          paymentMethodStr === 'apple_pay' ? 'apple_pay' : 
          paymentMethodStr === 'google_pay' ? 'google_pay' : 'card',
        );

        if (!bestAggregator) {
          throw new BadRequestException('没有可用的支付聚合服务商');
        }

        const aggregatorResult = await this.paymentAggregatorService.processPayment(
          bestAggregator.id,
          {
            amount: dto.amount,
            currency: dto.currency,
            paymentMethod: paymentMethodStr === 'apple_pay' ? 'apple_pay' : 
                          paymentMethodStr === 'google_pay' ? 'google_pay' : 'card',
            paymentData: dto.metadata?.paymentData || {},
            metadata: dto.metadata,
          },
        );

        savedPayment.metadata = {
          ...savedPayment.metadata,
          aggregatorId: bestAggregator.id,
          aggregatorTransactionId: aggregatorResult.transactionId,
        };

        if (aggregatorResult.status === 'completed') {
          savedPayment.status = PaymentStatus.COMPLETED;
          savedPayment.transactionHash = aggregatorResult.transactionId;
        } else {
          savedPayment.status = PaymentStatus.PROCESSING;
        }

        return this.paymentRepository.save(savedPayment);
      }

      if (dto.paymentMethod === PaymentMethod.STRIPE && !useAggregator) {
        // Stripe支付处理（使用自己的Stripe账户）
        if (!this.stripeService) {
          throw new BadRequestException('Stripe未配置，请使用支付聚合服务商');
        }
        if (!dto.paymentIntentId) {
          throw new BadRequestException('Stripe支付需要paymentIntentId');
        }
        const result = await this.stripeService.confirmPayment(
          dto.paymentIntentId,
        );
        savedPayment.status = PaymentStatus.COMPLETED;
        savedPayment.transactionHash = result.id;
      } else if (dto.paymentMethod === PaymentMethod.X402) {
        // X402支付处理（QuickPay）
        // 如果提供了sessionId和signature，直接调用relayer执行支付
        if (dto.metadata?.sessionId && dto.metadata?.signature) {
          try {
            // 使用订单ID进行签名验证（前端签名时使用的是订单ID）
            // 但 Relayer 需要实际的支付ID来查询和更新支付记录
            const orderIdForSignature = dto.metadata?.orderId || savedPayment.id;
            
            const relayerResult = await this.relayerService.processQuickPay({
              sessionId: dto.metadata.sessionId,
              paymentId: savedPayment.id, // 使用实际的支付ID查询记录
              orderId: orderIdForSignature, // 传递订单ID用于签名验证
              to: dto.metadata.to || dto.metadata?.paymentAddress || '0x0000000000000000000000000000000000000000',
              amount: dto.metadata?.amountInSmallestUnit || ethers.parseUnits(
                dto.amount.toString(),
                dto.metadata?.tokenDecimals || 6
              ).toString(),
              tokenDecimals: dto.metadata?.tokenDecimals || 6, // 传递 token 精度
              signature: dto.metadata.signature,
              nonce: dto.metadata.nonce || Date.now(),
            });
            
            // Relayer执行成功，更新支付状态
            savedPayment.status = PaymentStatus.COMPLETED;
            savedPayment.transactionHash = relayerResult.txHash;
            savedPayment.metadata = {
              ...savedPayment.metadata,
              quickPayConfirmed: true,
              confirmedAt: relayerResult.confirmedAt,
              txHash: relayerResult.txHash,
            };
            
            // 保存更新后的支付记录（确保状态和交易哈希被保存）
            const updatedPayment = await this.paymentRepository.save(savedPayment);
            this.logger.log(`✅ QuickPay payment record saved: paymentId=${updatedPayment.id}, status=${updatedPayment.status}, txHash=${updatedPayment.transactionHash || 'pending'}`);
            
            this.logger.log(`QuickPay executed via relayer: paymentId=${savedPayment.id}, txHash=${relayerResult.txHash || 'pending'}`);
            
            // 如果relayer返回了txHash，说明链上执行成功
            if (relayerResult.txHash) {
              this.logger.log(`QuickPay on-chain transaction confirmed: txHash=${relayerResult.txHash}`);
            } else {
              this.logger.warn(`QuickPay confirmed but no txHash returned, payment may be in queue: paymentId=${savedPayment.id}`);
            }
          } catch (relayerError) {
            this.logger.error(`Relayer execution failed: ${relayerError.message}`, relayerError.stack);
            // Relayer执行失败，不应该标记为完成
            // 如果relayer未初始化（Mock模式），则标记为PROCESSING等待批量处理
            // 如果relayer执行失败（合约错误等），标记为FAILED
            const isMockMode = !this.relayerService || relayerError.message?.includes('not initialized');
            if (isMockMode) {
              // Mock模式：创建X402 session等待后续处理
        const result = await this.x402Service.createPaymentSession(
          savedPayment.id,
          dto,
        );
        savedPayment.metadata = {
          ...savedPayment.metadata,
          x402Session: result,
                relayerError: relayerError.message,
                isMockMode: true,
        };
        savedPayment.status = PaymentStatus.PROCESSING;
              this.logger.warn(`QuickPay in mock mode, payment will be processed in batch: paymentId=${savedPayment.id}`);
            } else {
              // 真实执行失败：标记为失败
              savedPayment.status = PaymentStatus.FAILED;
              savedPayment.metadata = {
                ...savedPayment.metadata,
                relayerError: relayerError.message,
                errorDetails: {
                  message: relayerError.message,
                  stack: relayerError.stack,
                },
              };
              this.logger.error(`QuickPay execution failed, payment marked as FAILED: paymentId=${savedPayment.id}`);
            }
          }
        } else {
          // 没有sessionId和signature，创建X402 session
          const result = await this.x402Service.createPaymentSession(
            savedPayment.id,
            dto,
          );
          savedPayment.metadata = {
            ...savedPayment.metadata,
            x402Session: result,
          };
          savedPayment.status = PaymentStatus.PROCESSING;
        }
      } else if (dto.paymentMethod === PaymentMethod.WALLET) {
        // 钱包支付处理（前端已经完成链上转账，这里只需要记录）
        // 如果有txHash，说明链上转账已完成，直接标记为完成
        if (dto.metadata?.txHash) {
          savedPayment.status = PaymentStatus.COMPLETED;
          savedPayment.transactionHash = dto.metadata.txHash;
        } else {
          savedPayment.status = PaymentStatus.PENDING;
        }
      } else if (dto.paymentMethod === PaymentMethod.TRANSAK) {
        // Transak 支付处理（通过 Widget 在前端完成，等待 Webhook 回调）
        // 如果已经有 transakOrderId，说明前端已经创建了订单
        if (dto.metadata?.transakOrderId) {
          savedPayment.status = PaymentStatus.PROCESSING;
          savedPayment.metadata = {
            ...savedPayment.metadata,
            provider: 'transak',
            transakOrderId: dto.metadata.transakOrderId,
          };
        } else {
          // 创建支付记录，等待 Transak Widget 完成支付后通过 Webhook 更新
          savedPayment.status = PaymentStatus.PENDING;
          savedPayment.metadata = {
            ...savedPayment.metadata,
            provider: 'transak',
            waitingForTransak: true,
          };
        }
      } else if (dto.paymentMethod === PaymentMethod.MULTISIG) {
        // 多签支付处理
        savedPayment.status = PaymentStatus.PENDING;
      } else if (dto.metadata?.isSandbox) {
        // Sandbox 支付处理：模拟支付成功并记录，确保在交易历史中显示
        savedPayment.status = PaymentStatus.COMPLETED;
        savedPayment.transactionHash = `sandbox_tx_${Date.now()}`;
        this.logger.log(`Sandbox payment completed: ${savedPayment.id}, amount: ${savedPayment.amount} ${savedPayment.currency}`);
      }

      // 计算分成（根据订单类型，使用新的佣金规则）
      if (savedPayment.status === PaymentStatus.COMPLETED || savedPayment.status === PaymentStatus.PROCESSING) {
        await this.commissionCalculator.calculateAndRecordCommission(
          savedPayment.id,
          savedPayment,
          commissionBase, // 使用商户税前价格作为佣金计算基础
          sessionId, // 传递Session ID
        );

        // 记录推广分成（如果支付完成）
        if (savedPayment.status === PaymentStatus.COMPLETED && this.referralService) {
          try {
            await this.referralService.recordPaymentCommission(savedPayment.id, savedPayment);
          } catch (error) {
            this.logger.warn(`记录推广分成失败: ${error.message}`);
          }
        }
      }

      // 如果是托管交易且支付完成，托管资金
      if (isEscrow && escrowId && savedPayment.status === PaymentStatus.COMPLETED) {
        await this.escrowService.fundEscrow(
          escrowId,
          savedPayment.transactionHash || savedPayment.id,
        );

        // 根据订单类型自动处理结算
        // NFT/虚拟资产：即时结算
        // 服务：等待服务开始
        // 实体商品：等待确认收货（7天自动确认）
        try {
          await this.escrowService.autoSettleByOrderType(escrowId);
        } catch (error) {
          this.logger.error(`自动结算失败: ${escrowId}`, error);
        }
      }

      // ========== 资金流逻辑说明 ==========
      // 
      // 1. 合约分佣处理后，给商家的部分：
      //    - 如果商家要求接受法币：打到商家的 MPC 钱包账户（数字货币）
      //      然后可以自动转入 provider 进行法币结算（通过 Transak Off-ramp）
      //    - 如果商家接受 crypto：可以打到商家自带的 crypto 钱包
      // 
      // 2. Off-ramp 可以单独工作：
      //    - 接受数字货币的商家可以手动走 provider 的 offramp 流程完成兑换
      //    - 通过 WithdrawalService 手动触发 Off-ramp
      // 
      // ======================================
      
      // 处理商家收款方式配置的转换逻辑
      const merchantConfig = dto.metadata?.merchantPaymentConfig || 'both';

      // 场景1：商家只接受数字货币，用户选择法币支付
      // 用户法币支付 → Transak On-ramp 转换成数字货币 → 合约分佣 → 打到商家 MPC 钱包或商家 crypto 钱包
      if (merchantConfig === 'crypto_only' && 
          (paymentMethodStr === 'apple_pay' || paymentMethodStr === 'google_pay' || paymentMethodStr === 'stripe' || paymentMethodStr === 'transak')) {
        savedPayment.metadata = {
          ...savedPayment.metadata,
          needsConversion: true,
          conversionType: 'fiat_to_crypto',
          originalPaymentMethod: paymentMethodStr,
        };
        this.logger.log(`商家只接受数字货币，法币支付将通过 On-ramp 转换为数字货币: ${savedPayment.id}`);
      }

      // 场景2：商家只接受法币，用户选择数字货币支付
      // 用户数字货币支付 → 合约分佣 → 打到商家 MPC 钱包（数字货币）
      // → 自动通过 Transak Off-ramp 转换成法币 → 结算给商家法币账户
      if (merchantConfig === 'fiat_only' && 
          (dto.paymentMethod === PaymentMethod.WALLET || dto.paymentMethod === PaymentMethod.X402)) {
        savedPayment.metadata = {
          ...savedPayment.metadata,
          needsConversion: true,
          conversionType: 'crypto_to_fiat',
          originalPaymentMethod: dto.paymentMethod,
          // 标记需要自动 Off-ramp 转换（从 MPC 钱包自动转换）
          needsOffRamp: true,
          offRampProvider: 'transak', // 使用 Transak 进行 Off-ramp
          autoOffRamp: true, // 自动触发 Off-ramp
        };
        this.logger.log(`商家只接受法币，数字货币支付将通过自动 Off-ramp 转换为法币: ${savedPayment.id}`);
      }

      return this.paymentRepository.save(savedPayment);
    } catch (error) {
      savedPayment.status = PaymentStatus.FAILED;
      await this.paymentRepository.save(savedPayment);
      throw error;
    }
  }

  /**
   * 检查QuickPay授权和额度
   */
  async checkQuickPayEligibility(userId: string | undefined, amount: number): Promise<{
    eligible: boolean;
    hasAuth: boolean;
    withinLimit: boolean;
    isSmallAmount: boolean;
    authorization?: any;
  }> {
    if (!userId) {
      return {
        eligible: false,
        hasAuth: false,
        withinLimit: false,
        isSmallAmount: false,
      };
    }
    const SMALL_AMOUNT_THRESHOLD = 20; // 小额支付阈值（USD）
    const isSmallAmount = amount <= SMALL_AMOUNT_THRESHOLD;

    // 检查X402授权
    const auth = await this.x402AuthService.checkAuthorization(userId);
    const hasAuth = auth !== null && auth.isActive;
    
    // 检查额度
    let withinLimit = false;
    if (hasAuth && auth) {
      const remainingToday = auth.dailyLimit - auth.usedToday;
      withinLimit = amount <= auth.singleLimit && amount <= remainingToday;
    }

    const eligible = hasAuth && withinLimit && isSmallAmount;

    return {
      eligible,
      hasAuth,
      withinLimit,
      isSmallAmount,
      authorization: auth,
    };
  }

  /**
   * 获取支付路由建议（增强版，返回多个选项）
   * V3.0新增：计算总手续费和汇率信息
   */
  async getPaymentRouting(
    userId: string | undefined,
    amount: number,
    currency: string,
    isOnChain?: boolean,
    context?: Partial<RoutingContext>,
  ) {
    // 获取用户信息
    const user = userId ? await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'kycLevel', 'kycStatus'],
    }) : null;

    // 检查QuickPay资格
    const quickPayCheck = userId ? await this.checkQuickPayEligibility(userId, amount) : { 
      eligible: false,
      hasAuth: false,
      withinLimit: false,
      isSmallAmount: false,
      authorization: null
    };

    const routingContext: RoutingContext = {
      amount,
      currency,
      isOnChain: isOnChain || false,
      userKYCLevel: user?.kycLevel,
      quickPayEligible: quickPayCheck.eligible,
      ...context,
    };

    // 获取智能路由建议
    const routing = this.smartRouter.selectBestChannel(amount, currency, isOnChain || false, routingContext);

    // V3.0：计算总手续费和汇率信息
    // 从context中获取订单类型和是否有Agent
    const orderType = (context as any)?.orderType || 'product' as OrderType;
    const hasAgent = !!(context as any)?.agentId;
    const hasProvider = routing.recommendedMethod === PaymentMethod.STRIPE || 
                       routing.channels.some(c => c.method === PaymentMethod.STRIPE);
    
    // 计算总手续费
    const totalFeeRate = this.commissionCalculator.calculateTotalFeeRate(
      orderType,
      hasAgent,
      hasProvider,
      0.03, // Provider手续费默认3%
    );

    // 计算汇率（如果涉及法币和数字货币转换）
    let exchangeRate: { from: string; to: string; rate: number } | undefined;
    if (hasProvider && (currency !== 'USDC' && currency !== 'USDT')) {
      // 使用模拟汇率（实际应该调用实时汇率API）
      // 注意：这里使用与smart-router相同的汇率计算逻辑
      const rates: Record<string, number> = {
        'CNY': 0.142, // 1 CNY = 0.142 USDC
        'USD': 1.0,
        'EUR': 1.08,
        'GBP': 1.27,
        'JPY': 0.0067,
      };
      const usdcRate = rates[currency] || 1.0;
      exchangeRate = {
        from: currency,
        to: 'USDC',
        rate: usdcRate,
      };
    }

    // 如果是法币支付，计算智能路由价格和标准价格
    let optimalPrice: number | null = null;
    let standardPrice: number | null = null;
    
    if (routing.recommendedMethod === PaymentMethod.STRIPE || 
        routing.channels.some(c => c.method === PaymentMethod.STRIPE)) {
      // 智能路由价格（更优汇率）
      optimalPrice = amount * 1.00; // 假设智能路由价格更优
      // 标准法币通道价格
      standardPrice = amount * 1.08; // 标准价格稍高
    }

    const scenarioPlan = this.buildScenarioPlan(
      routing.scenarioType,
      routing,
      quickPayCheck,
      amount,
      currency,
    );

    return {
      ...routing,
      totalFeeRate, // V3.0新增：总手续费
      exchangeRate, // V3.0新增：汇率信息
      quickPay: {
        eligible: quickPayCheck.eligible,
        hasAuth: quickPayCheck.hasAuth,
        withinLimit: quickPayCheck.withinLimit,
        isSmallAmount: quickPayCheck.isSmallAmount,
        authorization: quickPayCheck.authorization,
      },
      prices: {
        optimal: optimalPrice,
        standard: standardPrice,
      },
      scenarioMeta: scenarioPlan.scenarioMeta,
      recommendedRoute: scenarioPlan.recommendedRoute,
      kycStatus: user?.kycStatus || 'not_started',
    };
  }

  private buildScenarioPlan(
    scenarioType: ScenarioType | undefined,
    routing: ReturnType<SmartRouterService['selectBestChannel']>,
    quickPay: Awaited<ReturnType<PaymentService['checkQuickPayEligibility']>>,
    amount: number,
    currency: string,
  ): { scenarioMeta: ScenarioMeta; recommendedRoute: RecommendedRoute } {
    const normalizedScenario: ScenarioType = scenarioType || 'standard';
    const amountLabel = `${currency} ${amount.toFixed(2)}`;
    const providerName = routing.priceComparison?.fiatToCryptoProvider || 'MoonPay';

    const scenarioMetaMap: Record<ScenarioType, ScenarioMeta> = {
      qr_pay: {
        type: 'qr_pay',
        title: '扫码支付 · 法币转数字货币',
        description: '用户扫码进入支付，商家仅收数字货币，系统通过Provider自动完成法币→USDC转换。',
      },
      micro_sub: {
        type: 'micro_sub',
        title: '订阅/API 小额调用',
        description: '单笔≤0.01U，使用 QuickPay/X402 自动扣款，无需重复确认。',
      },
      wallet_direct: {
        type: 'wallet_direct',
        title: '数字钱包直付',
        description: '用户已连接钱包，直接推荐 X402 / WalletConnect，一步签名完成。',
      },
      standard: {
        type: 'standard',
        title: '标准法币支付',
        description: '走 Stripe / Provider 法币链路，适用于普通电商场景。',
      },
    };

    const quickPayRoute: RecommendedRoute = {
      id: 'quickpay_micro',
      label: 'QuickPay · 即时小额扣款',
      scenario: 'micro_sub',
      method: 'quickpay',
      requiresKYC: false,
      requiresWallet: false,
      quickPay: {
        eligible: quickPay.eligible,
        singleLimit: quickPay.authorization?.singleLimit,
        dailyLimit: quickPay.authorization?.dailyLimit,
      },
      badges: ['无需KYC', '≤0.01U', '自动执行'],
      steps: [
        '检测为订阅/API 小额调用',
        quickPay.eligible ? '已检测到有效 QuickPay 授权' : '提示用户开启 QuickPay 授权',
        '生成 PayIntent 并通过 X402 快速执行',
        '记录扣款和额度占用',
      ],
    };

    const qrRoute: RecommendedRoute = {
      id: 'fiat_to_crypto_flow',
      label: `法币转数字货币 · ${providerName}`,
      scenario: 'qr_pay',
      method: 'fiat_to_crypto',
      requiresKYC: true,
      requiresWallet: true,
      provider: providerName,
      badges: ['需要KYC', '支持Apple Pay/扫码', 'USDC结算'],
      steps: [
        '用户扫码进入支付入口',
        '智能路由识别商家仅收数字货币',
        `调用 ${providerName} 获取最优汇率并锁定 ${amountLabel}`,
        '完成KYC后跳转 Provider 支付页面',
        'Provider 完成法币→USDC转换并注入托管账户',
      ],
    };

    const walletRoute: RecommendedRoute = {
      id: 'wallet_direct_flow',
      label: '钱包直付 · 一步签名',
      scenario: 'wallet_direct',
      method: routing.recommendedMethod || PaymentMethod.WALLET,
      requiresWallet: true,
      requiresKYC: false,
      badges: ['无需KYC', '链上签名', '实时返回哈希'],
      steps: [
        '检测用户钱包已连接/Agent已托管',
        '推荐 X402 / WalletConnect 通道并估算 Gas',
        '展示签名提示与权限说明',
        '链上提交交易，返回 Transaction Hash',
      ],
    };

    const standardRoute: RecommendedRoute = {
      id: 'standard_fiat_flow',
      label: '标准法币支付 · Stripe/Provider',
      scenario: 'standard',
      method: routing.recommendedMethod || PaymentMethod.STRIPE,
      requiresWallet: false,
      requiresKYC: false,
      badges: ['支持Apple/Google Pay', '自动对账', '提现便捷'],
      steps: [
        `展示订单金额 ${amountLabel}`,
        '根据商户资质选择 Stripe 或 Provider',
        '若需要，提示完成KYC后继续支付',
        '完成支付并实时同步 PayIntent 状态',
      ],
    };

    const routeMap: Record<ScenarioType, RecommendedRoute> = {
      qr_pay: qrRoute,
      micro_sub: quickPayRoute,
      wallet_direct: walletRoute,
      standard: standardRoute,
    };

    return {
      scenarioMeta: scenarioMetaMap[normalizedScenario],
      recommendedRoute: routeMap[normalizedScenario],
    };
  }

  async createProviderPaymentSession(userId: string | undefined, dto: CreateProviderPaymentSessionDto) {
    return this.providerPaymentFlow.createSession(userId, dto);
  }

  async getProviderPaymentSession(userId: string | undefined, sessionId: string) {
    const where: any = { sessionId };
    if (userId) {
      where.userId = userId;
    }
    const payment = await this.paymentRepository.findOne({
      where,
    });
    if (!payment) {
      throw new NotFoundException('Provider session not found');
    }
    return this.providerPaymentFlow.getSessionStatus(sessionId);
  }

  async completeProviderPaymentSession(
    userId: string | undefined,
    sessionId: string,
    payload?: { transactionHash?: string },
  ) {
    const where: any = { sessionId };
    if (userId) {
      where.userId = userId;
    }
    const payment = await this.paymentRepository.findOne({
      where,
    });
    if (!payment) {
      throw new NotFoundException('Provider session not found');
    }
    return this.providerPaymentFlow.completeSession(sessionId, payload);
  }

  async handleProviderWebhook(
    providerId: string,
    payload: { sessionId: string; status: string; txHash?: string },
  ) {
    await this.providerPaymentFlow.handleWebhook(providerId, payload);
    return { ok: true };
  }

  async getPayment(userId: string, paymentId: string) {
    const payment = await this.paymentRepository.findOne({
      where: { id: paymentId, userId },
    });

    if (!payment) {
      throw new NotFoundException('支付记录不存在');
    }

    return payment;
  }

  /**
   * 获取用户的支付记录列表
   */
  async getUserPayments(
    userId: string,
    options?: {
      status?: string;
      paymentMethod?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    try {
      const limit = options?.limit || 50;
      const offset = options?.offset || 0;

      this.logger.log(`查询用户支付记录: userId=${userId}, options=${JSON.stringify(options)}`);

      const where: any = { userId };

      if (options?.status) {
        // 确保 status 是有效的 PaymentStatus 枚举值
        where.status = options.status as any;
      }

      if (options?.paymentMethod) {
        // 确保 paymentMethod 是有效的 PaymentMethod 枚举值
        where.paymentMethod = options.paymentMethod as any;
      }

      this.logger.debug(`查询条件: ${JSON.stringify(where)}`);

      // 明确指定不加载任何关系，避免 TypeORM 尝试加载不存在的 merchant 关系
      const [payments, total] = await this.paymentRepository.findAndCount({
        where,
        order: { createdAt: 'DESC' },
        take: limit,
        skip: offset,
        relations: [], // 明确指定空数组，确保不加载任何关系
      });

      // 调试日志：记录查询结果
      this.logger.log(`查询用户支付记录: userId=${userId}, total=${total}, found=${payments.length}`);
      if (payments.length > 0) {
        this.logger.debug(`支付记录状态分布: ${
          payments.map(p => `${p.id.slice(0, 8)}:${p.status}:${p.currency}:${p.amount}`).join(', ')
        }`);
      } else {
        this.logger.warn(`未找到支付记录: userId=${userId}, where=${JSON.stringify(where)}`);
      }

      return {
        data: payments,
        total,
        limit,
        offset,
      };
    } catch (error) {
      this.logger.error(`查询用户支付记录失败: userId=${userId}`, error);
      this.logger.error(`错误详情: ${error instanceof Error ? error.message : String(error)}`);
      this.logger.error(`错误堆栈: ${error instanceof Error ? error.stack : 'N/A'}`);
      throw error;
    }
  }

  /**
   * 更新支付状态（用于Webhook回调）
   */
  async updatePaymentStatus(
    paymentId: string,
    status: PaymentStatus,
    transactionHash?: string,
  ) {
    const payment = await this.paymentRepository.findOne({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new NotFoundException('支付记录不存在');
    }

    payment.status = status;
    if (transactionHash) {
      payment.transactionHash = transactionHash;
    }

    return this.paymentRepository.save(payment);
  }

  /**
   * 更新支付状态（用于钱包支付回调）
   */
  async updatePaymentStatusByHash(
    userId: string | undefined,
    paymentId: string,
    transactionHash: string,
  ) {
    const where: any = { id: paymentId };
    if (userId) {
      where.userId = userId;
    }
    const payment = await this.paymentRepository.findOne({
      where,
    });

    if (!payment) {
      throw new NotFoundException('支付记录不存在');
    }

    payment.status = PaymentStatus.COMPLETED;
    payment.transactionHash = transactionHash;

    const savedPayment = await this.paymentRepository.save(payment);

    // 记录推广分成
    if (this.referralService) {
      try {
        await this.referralService.recordPaymentCommission(savedPayment.id, savedPayment);
      } catch (error) {
        this.logger.warn(`记录推广分成失败: ${error.message}`);
      }
    }

    // 通过 WebSocket 发送支付状态更新（暂时禁用）
    // try {
    //   this.wsGateway.sendPaymentStatusUpdate(
    //     userId,
    //     paymentId,
    //     PaymentStatus.COMPLETED,
    //     transactionHash,
    //   );
    // } catch (error) {
    //   this.logger.warn(`WebSocket 推送失败: ${error.message}`);
    // }

    return savedPayment;
  }

  /**
   * 查找有效的QuickPay授权
   */
  private async findValidQuickPayGrant(
    grants: any[],
    amount: number,
    merchantId?: string,
  ): Promise<any | null> {
    for (const grant of grants) {
      const validation = await this.quickPayGrantService.validateGrant(
        grant,
        amount,
        merchantId,
      );
      if (validation.valid) {
        return grant;
      }
    }
    return null;
  }

  /**
   * 计算通道费用
   */
  private async calculateChannelFee(
    amount: number,
    paymentMethod: PaymentMethod,
  ): Promise<number> {
    // 根据支付方式计算通道费用
    const channelFeeRates: Record<PaymentMethod, number> = {
      [PaymentMethod.STRIPE]: 0.029 + 0.003, // 2.9% + $0.30 (简化处理，实际应该按固定费用计算)
      [PaymentMethod.WALLET]: 0.0006, // X402协议约0.06%
      [PaymentMethod.X402]: 0.0006,
      [PaymentMethod.PASSKEY]: 0.0006,
      [PaymentMethod.MULTISIG]: 0.001, // 多签略高
      [PaymentMethod.TRANSAK]: 0.015, // Transak 默认费率 1.5%（可根据实际费率调整）
      [PaymentMethod.STABLECOIN]: 0.015, // Stripe stablecoin 1.5%
    };

    const rate = channelFeeRates[paymentMethod] || 0.03; // 默认3%
    return amount * rate;
  }

  /**
   * 自动检测是否需要托管交易（Escrow）
   * 根据订单类型、商家设置、订单金额等条件判断
   */
  private shouldUseEscrow(dto: ProcessPaymentDto): boolean {
    // 如果metadata中明确指定了escrow，直接使用
    if (dto.metadata?.escrow === true) {
      return true;
    }
    if (dto.metadata?.escrow === false) {
      return false;
    }

    // 获取订单类型
    const orderType = dto.metadata?.orderType || 'product'; // 默认商品订单
    const orderCategory = dto.metadata?.category || '';
    const amount = dto.amount;

    // 电商订单：一般需要托管
    if (orderType === 'product' || orderType === 'physical') {
      // 实物订单：需要托管（需要用户确认收货）
      return true;
    }

    // 虚拟资产/NFT订单：需要托管（智能合约分润）
    if (orderType === 'nft' || orderType === 'virtual' || orderCategory === 'nft' || orderCategory === 'virtual') {
      return true;
    }

    // 服务订单：根据商家设置
    if (orderType === 'service') {
      // 如果商家设置了需要托管，则使用托管
      if (dto.metadata?.merchantEscrowEnabled === true) {
        return true;
      }
      // 默认服务订单不需要托管
      return false;
    }

    // 大额订单（超过阈值）：自动启用托管
    const LARGE_AMOUNT_THRESHOLD = 1000; // 假设阈值为1000
    if (amount >= LARGE_AMOUNT_THRESHOLD) {
      return true;
    }

    // 默认：电商订单需要托管，其他不需要
    return orderType === 'product' || orderType === 'physical';
  }
}

