import { Controller, Post, Get, Body, Param, UseGuards, Request, Query, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MerchantAutoOrderService } from './merchant-auto-order.service';
import { MerchantAICustomerService } from './merchant-ai-customer.service';
import { MerchantAutoMarketingService } from './merchant-auto-marketing.service';
import { WebhookHandlerService, WebhookConfig } from './webhook-handler.service';
import { AutoFulfillmentService } from './auto-fulfillment.service';
import { MultiChainAccountService } from './multi-chain-account.service';
import { ReconciliationService } from './reconciliation.service';
import { SettlementRulesService } from './settlement-rules.service';
import { User } from '../../entities/user.entity';

@Controller('merchant')
@UseGuards(JwtAuthGuard)
export class MerchantController {
  constructor(
    private autoOrderService: MerchantAutoOrderService,
    private aiCustomerService: MerchantAICustomerService,
    private autoMarketingService: MerchantAutoMarketingService,
    private webhookHandlerService: WebhookHandlerService,
    private autoFulfillmentService: AutoFulfillmentService,
    private multiChainAccountService: MultiChainAccountService,
    private reconciliationService: ReconciliationService,
    private settlementRulesService: SettlementRulesService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  // ========== 自动接单 ==========

  @Post('auto-order/configure')
  async configureAutoOrder(@Request() req, @Body() config: any) {
    return this.autoOrderService.configureAutoOrder({
      ...config,
      merchantId: req.user.id,
    });
  }

  @Get('auto-order/config')
  async getAutoOrderConfig(@Request() req) {
    return this.autoOrderService.getAutoOrderConfig(req.user.id);
  }

  @Post('auto-order/process')
  async processOrder(@Request() req, @Body() body: { orderId: string; orderData: any }) {
    return this.autoOrderService.processOrder(req.user.id, body.orderId, body.orderData);
  }

  // ========== AI客服 ==========

  @Post('ai-customer/configure')
  async configureAICustomer(@Request() req, @Body() config: any) {
    return this.aiCustomerService.configureAICustomerService({
      ...config,
      merchantId: req.user.id,
    });
  }

  @Get('ai-customer/config')
  async getAICustomerConfig(@Request() req) {
    return this.aiCustomerService.getAICustomerServiceConfig(req.user.id);
  }

  @Post('ai-customer/message')
  async handleCustomerMessage(@Request() req, @Body() message: any) {
    return this.aiCustomerService.handleCustomerMessage(req.user.id, message);
  }

  // ========== 自动营销 ==========

  @Post('auto-marketing/configure')
  async configureAutoMarketing(@Request() req, @Body() config: any) {
    return this.autoMarketingService.configureAutoMarketing({
      ...config,
      merchantId: req.user.id,
    });
  }

  @Get('auto-marketing/config')
  async getAutoMarketingConfig(@Request() req) {
    return this.autoMarketingService.getAutoMarketingConfig(req.user.id);
  }

  @Post('auto-marketing/trigger')
  async triggerMarketingCampaigns(@Request() req) {
    return this.autoMarketingService.triggerMarketingCampaigns(req.user.id);
  }

  @Post('auto-marketing/campaign/:campaignId/send')
  async sendCampaign(@Param('campaignId') campaignId: string) {
    return this.autoMarketingService.sendCampaign(campaignId);
  }

  // ========== P0功能：Webhook处理 ==========

  @Post('webhook/configure')
  async configureWebhook(@Request() req, @Body() config: WebhookConfig) {
    return this.webhookHandlerService.configureWebhook({
      ...config,
      merchantId: req.user.id,
    });
  }

  @Get('webhook/config')
  async getWebhookConfig(@Request() req) {
    return this.webhookHandlerService.getWebhookConfig(req.user.id);
  }

  @Get('webhook/logs')
  async getWebhookLogs(@Request() req, @Query('limit') limit?: number) {
    return this.webhookHandlerService.getWebhookLogs(req.user.id, limit || 50);
  }

  // ========== P0功能：自动发货 ==========

  @Get('fulfillment/records')
  async getFulfillmentRecords(@Request() req) {
    return this.autoFulfillmentService.getFulfillmentRecords(req.user.id);
  }

  @Post('fulfillment/auto')
  async autoFulfill(@Request() req, @Body() body: { paymentId: string }) {
    return this.autoFulfillmentService.autoFulfill(body.paymentId);
  }

  // ========== P0功能：多链账户 ==========

  @Get('multi-chain/summary')
  async getMultiChainSummary(@Request() req) {
    return this.multiChainAccountService.getMultiChainAccountSummary(req.user.id);
  }

  @Get('multi-chain/balance')
  async getChainBalance(
    @Request() req,
    @Query('chain') chain: string,
    @Query('currency') currency: string,
  ) {
    return this.multiChainAccountService.getChainBalance(req.user.id, chain, currency);
  }

  // ========== P0功能：自动对账 ==========

  @Post('reconciliation/perform')
  async performReconciliation(
    @Request() req,
    @Body() body: { startDate?: string; endDate?: string; type?: 'T+0' | 'T+1' | 'T+7' },
  ) {
    const date = body.startDate ? new Date(body.startDate) : new Date();
    const type = (body.type || 'T+1') as 'T+0' | 'T+1' | 'T+7';
    return this.reconciliationService.performReconciliation(
      req.user.id,
      date,
      type,
    );
  }

  @Get('reconciliation/records')
  async getReconciliationRecords(@Request() req) {
    return this.reconciliationService.getReconciliationRecords(req.user.id);
  }

  // ========== P0功能：结算规则 ==========

  @Post('settlement/rules')
  async createSettlementRule(@Request() req, @Body() rule: any) {
    return this.settlementRulesService.createSettlementRule({
      ...rule,
      merchantId: req.user.id,
    });
  }

  @Get('settlement/rules')
  async getSettlementRule(@Request() req) {
    return this.settlementRulesService.getSettlementRule(req.user.id);
  }

  @Post('settlement/perform')
  async performSettlement(@Request() req, @Body() body: { period?: string }) {
    return this.settlementRulesService.performSettlement(req.user.id, body.period);
  }

  // ========== 支付配置 ==========

  @Get('payment-settings')
  async getPaymentSettings(@Request() req) {
    // 从数据库获取最新的用户信息
    const user = await this.userRepository.findOne({ where: { id: req.user.id } });
    if (!user) {
      throw new BadRequestException('用户不存在');
    }

    // 从User实体的metadata中获取支付配置
    const paymentSettings = user.metadata?.paymentSettings || {
      paymentConfig: 'both',
      autoOffRampEnabled: false,
      preferredFiatCurrency: 'CNY',
      bankAccount: '',
      minOffRampAmount: 10,
    };
    return paymentSettings;
  }

  @Post('payment-settings')
  async updatePaymentSettings(@Request() req, @Body() settings: any) {
    // 验证配置
    if (settings.autoOffRampEnabled && !settings.bankAccount) {
      throw new BadRequestException('启用自动Off-ramp需要填写银行账户信息');
    }

    // 从数据库获取用户
    const user = await this.userRepository.findOne({ where: { id: req.user.id } });
    if (!user) {
      throw new BadRequestException('用户不存在');
    }

    // 更新User实体的metadata
    if (!user.metadata) {
      user.metadata = {};
    }
    user.metadata.paymentSettings = {
      paymentConfig: settings.paymentConfig || 'both',
      autoOffRampEnabled: settings.autoOffRampEnabled || false,
      preferredFiatCurrency: settings.preferredFiatCurrency || 'CNY',
      bankAccount: settings.bankAccount || '',
      minOffRampAmount: settings.minOffRampAmount || 10,
    };

    // 保存到数据库
    await this.userRepository.save(user);

    return {
      success: true,
      settings: user.metadata.paymentSettings,
    };
  }
}

