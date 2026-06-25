import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  HttpException,
  HttpStatus,
  Logger,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiParam, ApiQuery, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { StripeConnectService, StripeConnectAccountType } from './stripe-connect.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserService } from '../user/user.service';

/**
 * 创建 Connect 账户 DTO
 */
class CreateConnectAccountDto {
  email: string;
  merchantId: string;
  merchantName?: string;
  country?: string;
  accountType?: StripeConnectAccountType;
  businessType?: 'individual' | 'company';
}

/**
 * 创建 Account Link DTO
 */
class CreateAccountLinkDto {
  accountId: string;
  refreshUrl: string;
  returnUrl: string;
}

/**
 * 创建带分账的 PaymentIntent DTO
 */
class CreatePaymentIntentWithDestinationDto {
  amount: number;
  currency?: string;
  destinationAccountId: string;
  applicationFeeAmount: number;
  customerId?: string;
  metadata?: Record<string, string>;
}

/**
 * 创建 Transfer DTO
 */
class CreateTransferDto {
  amount: number;
  currency?: string;
  destinationAccountId: string;
  sourceTransaction?: string;
  description?: string;
  metadata?: Record<string, string>;
}

/**
 * 计算分账费用 DTO (旧版，兼容)
 */
class CalculateConnectFeesDto {
  amount: number;
  skillLayerType?: string;
  hasAgent?: boolean;
}

/**
 * V5.0 分账费用计算 DTO
 */
class CalculateV5FeesDto {
  amount: number;
  productType?: string;  // PHYSICAL, DIGITAL, SERVICE, INFRA, RESOURCE, LOGIC, COMPOSITE
  hasExecutionAgent?: boolean;
  hasRecommendationAgent?: boolean;
  hasReferralAgent?: boolean;
}

/**
 * V5.0 多方分账执行 DTO
 */
class ExecuteV5TransfersDto {
  paymentIntentId: string;
  amount: number;
  productType?: string;
  merchantAccountId?: string;
  executionAgentAccountId?: string;
  recommendationAgentAccountId?: string;
  referralAgentAccountId?: string;
}

/**
 * Stripe Connect 控制器
 * 
 * 提供商户入驻、分账、资金管理等 API
 */
@ApiTags('Stripe Connect')
@Controller('payments/connect')
export class StripeConnectController {
  private readonly logger = new Logger(StripeConnectController.name);

  constructor(
    private readonly stripeConnectService: StripeConnectService,
    private readonly userService: UserService,
  ) {}

  // ==================== 用户友好端点（需要认证）====================

  @Get('account')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前用户的 Stripe Connect 账户信息' })
  async getCurrentUserAccount(@Request() req: any) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new HttpException('Unauthorized: No user session found', HttpStatus.UNAUTHORIZED);
      }

      // 从用户资料获取 stripeConnectAccountId
      const user = await this.userService.findById(userId);
      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      const stripeAccountId = (user as any).stripeConnectAccountId;
      if (!stripeAccountId) {
        // 用户还没有 Connect 账户，返回 null
        return {
          success: true,
          account: null,
          stats: null,
        };
      }

      const account = await this.stripeConnectService.getAccount(stripeAccountId);
      
      return {
        success: true,
        account: {
          id: account.id,
          status: account.details_submitted ? (account.charges_enabled ? 'active' : 'restricted') : 'pending',
          chargesEnabled: account.charges_enabled,
          payoutsEnabled: account.payouts_enabled,
          email: account.email,
          country: account.country,
          created: account.created,
        },
        stats: {
          totalEarnings: 0,
          pendingSettlement: 0,
          lastSettlement: 0,
          settlementCount: 0,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error('Failed to get current user Connect account:', error);
      throw new HttpException(
        error instanceof Error ? error.message : 'Failed to get Connect account',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('onboarding')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '快速入驻 Stripe Connect（创建账户并生成入驻链接）' })
  @ApiBody({ schema: { properties: { returnUrl: { type: 'string' }, refreshUrl: { type: 'string' } } } })
  async quickOnboarding(@Request() req: any, @Body() body: { returnUrl: string; refreshUrl: string }) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new HttpException('Unauthorized: No user session found', HttpStatus.UNAUTHORIZED);
      }

      const user = await this.userService.findById(userId);
      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      let stripeAccountId = (user as any).stripeConnectAccountId;

      // 如果用户还没有 Connect 账户，创建一个
      if (!stripeAccountId) {
        const account = await this.stripeConnectService.createConnectAccount({
          email: user.email || `user_${userId}@agentrix.io`,
          merchantId: userId,
          merchantName: user.nickname || `Merchant ${userId}`,
          country: 'US',
          accountType: StripeConnectAccountType.EXPRESS,
          businessType: 'individual',
        });
        stripeAccountId = account.id;
        
        // 保存到用户资料
        await this.userService.updateStripeConnectAccountId(userId, stripeAccountId);
      }

      // 生成入驻链接
      const accountLink = await this.stripeConnectService.createAccountLink(
        stripeAccountId,
        body.refreshUrl || `${process.env.FRONTEND_URL}/workbench?mode=merchant&l1=finance&l2=stripe-connect`,
        body.returnUrl || `${process.env.FRONTEND_URL}/workbench?mode=merchant&l1=finance&l2=stripe-connect&success=true`,
      );

      return {
        success: true,
        url: accountLink.url,
        accountId: stripeAccountId,
        expiresAt: accountLink.expires_at,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error('Failed to create onboarding link:', error);
      throw new HttpException(
        error instanceof Error ? error.message : 'Failed to create onboarding link',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ==================== 账户管理 ====================

  @Post('accounts')
  @ApiOperation({ summary: '创建 Connect 账户（商户入驻）' })
  @ApiBody({ type: CreateConnectAccountDto })
  @ApiResponse({ status: 201, description: 'Connect 账户创建成功' })
  async createAccount(@Body() dto: CreateConnectAccountDto) {
    try {
      const account = await this.stripeConnectService.createConnectAccount({
        email: dto.email,
        merchantId: dto.merchantId,
        merchantName: dto.merchantName,
        country: dto.country,
        accountType: dto.accountType,
        businessType: dto.businessType,
      });

      return {
        success: true,
        accountId: account.id,
        type: account.type,
        email: account.email,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        message: 'Connect account created. Please complete onboarding via account link.',
      };
    } catch (error) {
      this.logger.error('Failed to create Connect account:', error);
      throw new HttpException(
        error instanceof Error ? error.message : 'Failed to create Connect account',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('accounts/link')
  @ApiOperation({ summary: '生成账户入驻链接' })
  @ApiBody({ type: CreateAccountLinkDto })
  async createAccountLink(@Body() dto: CreateAccountLinkDto) {
    try {
      const accountLink = await this.stripeConnectService.createAccountLink(
        dto.accountId,
        dto.refreshUrl,
        dto.returnUrl,
      );

      return {
        success: true,
        url: accountLink.url,
        expiresAt: accountLink.expires_at,
      };
    } catch (error) {
      this.logger.error('Failed to create account link:', error);
      throw new HttpException(
        error instanceof Error ? error.message : 'Failed to create account link',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('accounts/:accountId')
  @ApiOperation({ summary: '获取 Connect 账户信息' })
  @ApiParam({ name: 'accountId', description: 'Stripe Connect 账户 ID' })
  async getAccount(@Param('accountId') accountId: string) {
    try {
      const account = await this.stripeConnectService.getAccount(accountId);

      return {
        success: true,
        accountId: account.id,
        type: account.type,
        email: account.email,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted,
        country: account.country,
        metadata: account.metadata,
      };
    } catch (error) {
      this.logger.error(`Failed to get account ${accountId}:`, error);
      throw new HttpException(
        error instanceof Error ? error.message : 'Failed to get account',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('accounts/:accountId/onboarded')
  @ApiOperation({ summary: '检查账户是否已完成入驻' })
  @ApiParam({ name: 'accountId', description: 'Stripe Connect 账户 ID' })
  async isAccountOnboarded(@Param('accountId') accountId: string) {
    try {
      const isOnboarded = await this.stripeConnectService.isAccountOnboarded(accountId);

      return {
        success: true,
        accountId,
        isOnboarded,
        message: isOnboarded 
          ? 'Account is fully onboarded and can accept payments' 
          : 'Account onboarding is incomplete',
      };
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : 'Failed to check onboarding status',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('accounts/:accountId/balance')
  @ApiOperation({ summary: '获取账户余额' })
  @ApiParam({ name: 'accountId', description: 'Stripe Connect 账户 ID' })
  async getAccountBalance(@Param('accountId') accountId: string) {
    try {
      const balance = await this.stripeConnectService.getAccountBalance(accountId);

      return {
        success: true,
        accountId,
        available: balance.available.map(b => ({
          amount: b.amount / 100,
          currency: b.currency.toUpperCase(),
        })),
        pending: balance.pending.map(b => ({
          amount: b.amount / 100,
          currency: b.currency.toUpperCase(),
        })),
      };
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : 'Failed to get account balance',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ==================== 分账功能 ====================

  @Post('payment-intent')
  @ApiOperation({ summary: '创建带分账的 PaymentIntent（推荐）' })
  @ApiBody({ type: CreatePaymentIntentWithDestinationDto })
  async createPaymentIntentWithDestination(
    @Body() dto: CreatePaymentIntentWithDestinationDto,
  ) {
    try {
      const result = await this.stripeConnectService.createPaymentIntentWithDestination({
        amount: dto.amount,
        currency: dto.currency,
        destinationAccountId: dto.destinationAccountId,
        applicationFeeAmount: dto.applicationFeeAmount,
        customerId: dto.customerId,
        metadata: dto.metadata,
      });

      return {
        success: true,
        ...result,
        message: 'PaymentIntent created with destination account and application fee',
      };
    } catch (error) {
      this.logger.error('Failed to create PaymentIntent with destination:', error);
      throw new HttpException(
        error instanceof Error ? error.message : 'Failed to create PaymentIntent',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('transfers')
  @ApiOperation({ summary: '创建 Transfer（手动分账转账）' })
  @ApiBody({ type: CreateTransferDto })
  async createTransfer(@Body() dto: CreateTransferDto) {
    try {
      const transfer = await this.stripeConnectService.createTransfer({
        amount: dto.amount,
        currency: dto.currency,
        destinationAccountId: dto.destinationAccountId,
        sourceTransaction: dto.sourceTransaction,
        description: dto.description,
        metadata: dto.metadata,
      });

      return {
        success: true,
        transferId: transfer.id,
        amount: transfer.amount / 100,
        currency: transfer.currency.toUpperCase(),
        destination: transfer.destination,
        created: new Date(transfer.created * 1000),
      };
    } catch (error) {
      this.logger.error('Failed to create transfer:', error);
      throw new HttpException(
        error instanceof Error ? error.message : 'Failed to create transfer',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('settlements/:settlementId/transfer')
  @ApiOperation({ summary: '执行单笔结算分账' })
  @ApiParam({ name: 'settlementId', description: '结算记录 ID' })
  async executeSettlementTransfer(@Param('settlementId') settlementId: string) {
    try {
      const result = await this.stripeConnectService.executeSettlementTransfer(settlementId);

      if (!result.success) {
        throw new HttpException(result.error!, HttpStatus.BAD_REQUEST);
      }

      return {
        success: true,
        settlementId,
        transferId: result.transfer?.id,
        amount: result.transfer ? result.transfer.amount / 100 : null,
        message: 'Settlement transfer executed successfully',
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error instanceof Error ? error.message : 'Failed to execute settlement transfer',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('settlements/batch-transfer')
  @ApiOperation({ summary: '批量执行结算分账' })
  @ApiBody({ schema: { properties: { settlementIds: { type: 'array', items: { type: 'string' } } } } })
  async executeBatchSettlementTransfers(@Body('settlementIds') settlementIds: string[]) {
    try {
      const result = await this.stripeConnectService.executeBatchSettlementTransfers(settlementIds);

      return {
        success: true,
        ...result,
        message: `Batch transfer completed: ${result.succeeded} succeeded, ${result.failed} failed`,
      };
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : 'Failed to execute batch transfer',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ==================== 报表与查询 ====================

  @Get('transfers')
  @ApiOperation({ summary: '获取 Transfer 列表' })
  @ApiQuery({ name: 'destinationAccountId', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'startingAfter', required: false })
  async listTransfers(
    @Query('destinationAccountId') destinationAccountId?: string,
    @Query('limit') limit?: number,
    @Query('startingAfter') startingAfter?: string,
  ) {
    try {
      const transfers = await this.stripeConnectService.listTransfers({
        destinationAccountId,
        limit: limit ? Number(limit) : undefined,
        startingAfter,
      });

      return {
        success: true,
        hasMore: transfers.has_more,
        transfers: transfers.data.map(t => ({
          id: t.id,
          amount: t.amount / 100,
          currency: t.currency.toUpperCase(),
          destination: t.destination,
          created: new Date(t.created * 1000),
          metadata: t.metadata,
        })),
      };
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : 'Failed to list transfers',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('application-fees')
  @ApiOperation({ summary: '获取平台收取的应用费用列表' })
  @ApiQuery({ name: 'limit', required: false })
  async listApplicationFees(@Query('limit') limit?: number) {
    try {
      const fees = await this.stripeConnectService.listApplicationFees({
        limit: limit ? Number(limit) : undefined,
      });

      return {
        success: true,
        hasMore: fees.has_more,
        fees: fees.data.map(f => ({
          id: f.id,
          amount: f.amount / 100,
          currency: f.currency.toUpperCase(),
          chargeId: f.charge,
          created: new Date(f.created * 1000),
        })),
      };
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : 'Failed to list application fees',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ==================== 费用计算 ====================

  @Post('calculate-fees')
  @ApiOperation({ summary: '计算带 Connect 分账的费用明细（旧版，兼容）' })
  @ApiBody({ type: CalculateConnectFeesDto })
  async calculateConnectFees(@Body() dto: CalculateConnectFeesDto) {
    const result = this.stripeConnectService.calculateConnectFees(
      dto.amount,
      dto.skillLayerType || 'LOGIC',
      dto.hasAgent || false,
    );

    return {
      success: true,
      ...result,
    };
  }

  @Post('calculate-v5-fees')
  @ApiOperation({ summary: 'V5.0 分账费用计算（推荐）' })
  @ApiBody({ type: CalculateV5FeesDto })
  async calculateV5Fees(@Body() dto: CalculateV5FeesDto) {
    const result = this.stripeConnectService.calculateV5ConnectFees(
      dto.amount,
      dto.productType || 'PHYSICAL',
      dto.hasExecutionAgent || false,
      dto.hasRecommendationAgent || false,
      dto.hasReferralAgent || false,
    );

    return {
      success: true,
      ...result,
      summary: {
        '用户支付总额': `$${result.totalAmount.toFixed(2)}`,
        'Stripe 通道费': `-$${result.stripeFee.toFixed(2)}`,
        '可分润净额': `$${result.netAmount.toFixed(2)}`,
        '平台管理费': `-$${result.baseFee.toFixed(2)}`,
        '激励池': `-$${result.poolFee.toFixed(2)}`,
        '商户最终所得': `$${result.merchantAmount.toFixed(2)}`,
        '执行 Agent': `$${result.executionAgentAmount.toFixed(2)}`,
        '推荐 Agent': `$${result.recommendationAgentAmount.toFixed(2)}`,
        '推广 Agent': `$${result.referralAgentAmount.toFixed(2)}`,
        '平台净收益': `$${result.platformNetAmount.toFixed(2)}`,
      },
    };
  }

  @Post('execute-v5-transfers')
  @ApiOperation({ summary: 'V5.0 执行多方分账（4条 Transfer 指令）' })
  @ApiBody({ type: ExecuteV5TransfersDto })
  async executeV5Transfers(@Body() dto: ExecuteV5TransfersDto) {
    try {
      // 1. 计算分账
      const feeCalculation = this.stripeConnectService.calculateV5ConnectFees(
        dto.amount,
        dto.productType || 'PHYSICAL',
        !!dto.executionAgentAccountId,
        !!dto.recommendationAgentAccountId,
        !!dto.referralAgentAccountId,
      );

      // 2. 执行转账
      const result = await this.stripeConnectService.executeV5Transfers(
        dto.paymentIntentId,
        feeCalculation,
        {
          merchantAccountId: dto.merchantAccountId,
          executionAgentAccountId: dto.executionAgentAccountId,
          recommendationAgentAccountId: dto.recommendationAgentAccountId,
          referralAgentAccountId: dto.referralAgentAccountId,
        },
      );

      return {
        success: result.success,
        feeCalculation,
        transfers: result.transfers,
        platformRetained: result.platformRetained,
        message: result.success 
          ? `Successfully executed ${result.transfers.length} transfers` 
          : 'Some transfers failed',
      };
    } catch (error) {
      this.logger.error('Failed to execute V5 transfers:', error);
      throw new HttpException(
        error instanceof Error ? error.message : 'Failed to execute transfers',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('v5-fee-configs')
  @ApiOperation({ summary: '获取 V5.0 分账费率配置表' })
  async getV5FeeConfigs() {
    return {
      success: true,
      configs: {
        PHYSICAL: { baseFee: '0.5%', pool: '2.5%', total: '3%', description: '实物商品' },
        DIGITAL: { baseFee: '1%', pool: '4%', total: '5%', description: '数字商品' },
        SERVICE: { baseFee: '1.5%', pool: '6.5%', total: '8%', description: '服务类' },
        INFRA: { baseFee: '0.5%', pool: '2%', total: '2.5%', description: '基础设施层技能' },
        RESOURCE: { baseFee: '0.5%', pool: '2.5%', total: '3%', description: '资源层技能' },
        LOGIC: { baseFee: '1%', pool: '4%', total: '5%', description: '逻辑层技能' },
        COMPOSITE: { baseFee: '2%', pool: '8%', total: '10%', description: '复合层技能' },
      },
      splitRatios: {
        pool: {
          executionAgent: '70%',
          recommendationAgent: '30%',
        },
        baseFee: {
          referralAgent: '20%',
          platformNet: '80%',
        },
      },
      stripeFee: '2.9% + $0.30',
    };
  }

  @Get('status')
  @ApiOperation({ summary: '检查 Stripe Connect 配置状态' })
  async getConnectStatus() {
    return {
      success: true,
      configured: this.stripeConnectService.isConnectConfigured(),
      features: {
        accountManagement: true,
        destinationCharges: true,
        transfers: true,
        applicationFees: true,
      },
      documentation: 'https://stripe.com/docs/connect',
    };
  }
}
