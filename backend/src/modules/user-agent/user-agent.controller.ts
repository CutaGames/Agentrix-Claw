import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, Request, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UserAgentService } from './user-agent.service';
import { KYCReuseService } from './kyc-reuse.service';
import { MerchantTrustService } from './merchant-trust.service';
import { PaymentMemoryService } from './payment-memory.service';
import { SubscriptionService } from './subscription.service';
import { BudgetService } from './budget.service';
import { TransactionClassificationService } from './transaction-classification.service';
import { PolicyEngineService } from './policy-engine.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserAgent, UserAgentStatus } from '../../entities/user-agent.entity';
import { PolicyType } from '../../entities/policy.entity';

@ApiTags('user-agent')
@Controller('user-agent')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UserAgentController {
  constructor(
    private readonly userAgentService: UserAgentService,
    private readonly kycReuseService: KYCReuseService,
    private readonly merchantTrustService: MerchantTrustService,
    private readonly paymentMemoryService: PaymentMemoryService,
    private readonly subscriptionService: SubscriptionService,
    private readonly budgetService: BudgetService,
    private readonly transactionClassificationService: TransactionClassificationService,
    private readonly policyEngineService: PolicyEngineService,
  ) {}

  @Get('my-agents')
  @ApiOperation({ summary: '获取我的所有Agent' })
  @ApiResponse({ status: 200, description: '返回Agent列表' })
  async getMyAgents(@Request() req: any) {
    return this.userAgentService.getUserAgents(req.user?.id);
  }

  @Get('policies')
  @ApiOperation({ summary: '获取用户策略列表' })
  @ApiResponse({ status: 200, description: '返回策略列表' })
  async getPolicies(@Request() req: any) {
    return this.policyEngineService.getUserPolicies(req.user?.id);
  }

  @Post('policies')
  @ApiOperation({ summary: '更新或创建策略' })
  @ApiResponse({ status: 200, description: '策略已更新' })
  async upsertPolicy(
    @Request() req: any,
    @Body() dto: { type: PolicyType; value: any; enabled?: boolean },
  ) {
    return this.policyEngineService.upsertPolicy(req.user?.id, dto.type, dto.value, dto.enabled);
  }

  // 具体路由必须在参数路由之前定义
  @Get('kyc/status')
  @ApiOperation({ summary: '获取用户KYC状态（用于复用判断）' })
  @ApiResponse({ status: 200, description: '返回KYC状态' })
  async getKYCStatus(@Request() req: any) {
    return this.kycReuseService.getUserKYCStatus(req.user?.id);
  }

  @Get('kyc/check-reuse')
  @ApiOperation({ summary: '检查KYC是否可以复用' })
  @ApiResponse({ status: 200, description: '返回KYC复用状态' })
  async checkKYCReuse(
    @Request() req: any,
    @Query('merchantId') merchantId?: string,
  ) {
    return this.kycReuseService.checkKYCReuse(req.user?.id, merchantId);
  }

  @Get('payment-memory')
  @ApiOperation({ summary: '获取支付记忆（用于自动填充）' })
  @ApiResponse({ status: 200, description: '返回支付记忆' })
  async getPaymentMemory(@Request() req: any) {
    return this.paymentMemoryService.getPaymentMemory(req.user?.id);
  }

  @Get('subscriptions')
  @ApiOperation({ summary: '获取用户订阅列表' })
  @ApiResponse({ status: 200, description: '返回订阅列表' })
  async getSubscriptions(@Request() req: any) {
    return this.subscriptionService.getUserSubscriptions(req.user?.id);
  }

  @Get('budgets')
  @ApiOperation({ summary: '获取用户预算列表' })
  @ApiResponse({ status: 200, description: '返回预算列表' })
  async getBudgets(@Request() req: any) {
    return this.budgetService.getUserBudgets(req.user?.id);
  }

  @Post('budgets/check-alerts')
  @ApiOperation({ summary: '手动触发预算警报检查' })
  @ApiResponse({ status: 200, description: '检查完成' })
  async checkBudgetAlerts(@Request() req: any) {
    await this.budgetService.checkAndSendBudgetAlerts(req.user?.id);
    return { success: true, message: 'Budget alerts checked' };
  }

  @Get('health')
  @ApiOperation({ summary: 'User Agent服务健康检查' })
  @ApiResponse({ status: 200, description: '服务健康状态' })
  async health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'user-agent',
    };
  }

  @Get('transactions/classified')
  @ApiOperation({ summary: '获取已分类的交易记录' })
  @ApiResponse({ status: 200, description: '返回已分类的交易列表' })
  async getClassifiedTransactions(@Request() req: any) {
    return this.transactionClassificationService.getClassifiedTransactions(req.user?.id);
  }

  @Get('transactions/category-statistics')
  @ApiOperation({ summary: '获取交易分类统计' })
  @ApiResponse({ status: 200, description: '返回分类统计' })
  async getCategoryStatistics(@Request() req: any) {
    return this.transactionClassificationService.getCategoryStatistics(req.user?.id);
  }

  @Get('transactions/:paymentId/classify')
  @ApiOperation({ summary: '分类特定交易' })
  @ApiResponse({ status: 200, description: '返回分类结果' })
  async classifyTransaction(
    @Request() req: any,
    @Param('paymentId') paymentId: string,
  ) {
    return this.transactionClassificationService.classifyTransaction(paymentId);
  }

  @Get(':agentId')
  @ApiOperation({ summary: '获取Agent详情' })
  @ApiResponse({ status: 200, description: '返回Agent详情' })
  async getAgent(@Request() req: any, @Param('agentId') agentId: string) {
    return this.userAgentService.getUserAgent(req.user?.id, agentId);
  }

  @Put(':agentId')
  @ApiOperation({ summary: '更新Agent' })
  @ApiResponse({ status: 200, description: '返回更新后的Agent' })
  async updateAgent(
    @Request() req: any,
    @Param('agentId') agentId: string,
    @Body() updates: Partial<UserAgent>,
  ) {
    return this.userAgentService.updateUserAgent(req.user?.id, agentId, updates);
  }

  @Delete(':agentId')
  @ApiOperation({ summary: '删除Agent' })
  @ApiResponse({ status: 200, description: '删除成功' })
  async deleteAgent(@Request() req: any, @Param('agentId') agentId: string) {
    await this.userAgentService.deleteUserAgent(req.user?.id, agentId);
    return { success: true };
  }

  @Put(':agentId/status')
  @ApiOperation({ summary: '切换Agent状态' })
  @ApiResponse({ status: 200, description: '返回更新后的Agent' })
  async toggleStatus(
    @Request() req: any,
    @Param('agentId') agentId: string,
    @Body() body: { status: UserAgentStatus },
  ) {
    return this.userAgentService.toggleAgentStatus(req.user?.id, agentId, body.status);
  }

  @Get('merchant/:merchantId/trust')
  @ApiOperation({ summary: '获取商家可信度评分' })
  @ApiResponse({ status: 200, description: '返回商家可信度评分' })
  async getMerchantTrust(@Param('merchantId') merchantId: string) {
    return this.merchantTrustService.getMerchantTrustScore(merchantId);
  }

  @Get('merchant/:merchantId/statistics')
  @ApiOperation({ summary: '获取商家交易统计' })
  @ApiResponse({ status: 200, description: '返回商家交易统计' })
  async getMerchantStatistics(@Param('merchantId') merchantId: string) {
    return this.merchantTrustService.getMerchantStatistics(merchantId);
  }

  @Get('merchant/:merchantId/preferred-method')
  @ApiOperation({ summary: '获取商户推荐支付方式' })
  @ApiResponse({ status: 200, description: '返回推荐支付方式' })
  async getMerchantPreferredMethod(
    @Request() req: any,
    @Param('merchantId') merchantId: string,
  ) {
    return this.paymentMemoryService.getMerchantPreferredMethod(req.user?.id, merchantId);
  }

  @Post('budget')
  @ApiOperation({ summary: '创建预算' })
  @ApiResponse({ status: 201, description: '返回创建的预算' })
  async createBudget(
    @Request() req: any,
    @Body() body: {
      amount: number;
      currency: string;
      period: 'daily' | 'weekly' | 'monthly' | 'yearly';
      category?: string;
    },
  ) {
    return this.budgetService.createBudget(
      req.user?.id,
      body.amount,
      body.currency,
      body.period,
      body.category,
    );
  }

  @Get(':agentId/stats')
  @ApiOperation({ summary: '获取Agent统计信息' })
  @ApiResponse({ status: 200, description: '返回统计信息' })
  async getStats(@Request() req: any, @Param('agentId') agentId: string) {
    return this.userAgentService.getAgentStats(req.user?.id, agentId);
  }

  @Post('subscribe/:agentId')
  @ApiOperation({ summary: '订阅/购买 Agent' })
  @ApiResponse({ status: 201, description: '订阅成功' })
  async subscribe(@Request() req: any, @Param('agentId') agentId: string) {
    return this.userAgentService.subscribeAgent(req.user?.id, agentId);
  }

  @Post(':agentId/publish')
  @ApiOperation({ summary: '发布Agent到市场' })
  @ApiResponse({ status: 200, description: 'Agent已发布到市场' })
  async publishAgent(@Request() req: any, @Param('agentId') agentId: string) {
    return this.userAgentService.publishToMarketplace(req.user?.id, agentId);
  }

  @Post(':agentId/unpublish')
  @ApiOperation({ summary: '从市场下架Agent' })
  @ApiResponse({ status: 200, description: 'Agent已从市场下架' })
  async unpublishAgent(@Request() req: any, @Param('agentId') agentId: string) {
    return this.userAgentService.unpublishFromMarketplace(req.user?.id, agentId);
  }

  @Get('marketplace/my-listings')
  @ApiOperation({ summary: '获取我发布的Agent列表' })
  @ApiResponse({ status: 200, description: '返回已发布的Agent列表' })
  async getMyPublishedAgents(@Request() req: any) {
    return this.userAgentService.getMyPublishedAgents(req.user?.id);
  }
}

