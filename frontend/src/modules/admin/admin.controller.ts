import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminAuthService } from './services/admin-auth.service';
import { UserManagementService } from './services/user-management.service';
import { MerchantManagementService } from './services/merchant-management.service';
import { DeveloperManagementService } from './services/developer-management.service';
import { PromoterManagementService } from './services/promoter-management.service';
import { SupportTicketService } from './services/support-ticket.service';
import { MarketingManagementService } from './services/marketing-management.service';
import { SystemManagementService } from './services/system-management.service';
import { RiskManagementService } from './services/risk-management.service';
import { AdminLoginDto, QueryAdminUsersDto } from './dto/admin-user.dto';
import { QueryUsersDto, QueryTransactionsDto, UpdateUserStatusDto } from './dto/user-management.dto';
import {
  CreateTicketDto,
  UpdateTicketDto,
  ReplyTicketDto,
  QueryTicketsDto,
} from './dto/support-ticket.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('admin')
@Controller('admin')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminController {
  constructor(
    private adminAuthService: AdminAuthService,
    private userManagementService: UserManagementService,
    private merchantManagementService: MerchantManagementService,
    private developerManagementService: DeveloperManagementService,
    private promoterManagementService: PromoterManagementService,
    private supportTicketService: SupportTicketService,
    private marketingManagementService: MarketingManagementService,
    private systemManagementService: SystemManagementService,
    private riskManagementService: RiskManagementService,
  ) {}

  // ========== 管理员认证 ==========

  @Post('auth/login')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: '管理员登录' })
  async login(@Body() dto: AdminLoginDto, @Request() req) {
    return this.adminAuthService.login(dto, req.ip);
  }

  @Get('auth/me')
  @ApiOperation({ summary: '获取当前管理员信息' })
  async getMe(@Request() req) {
    return this.adminAuthService.findById(req.user.sub);
  }

  // ========== 用户管理 ==========

  @Get('users')
  @ApiOperation({ summary: '获取用户列表' })
  async getUsers(@Query() query: QueryUsersDto) {
    return this.userManagementService.getUsers(query);
  }

  @Get('users/:id')
  @ApiOperation({ summary: '获取用户详情' })
  async getUserById(@Param('id') id: string) {
    return this.userManagementService.getUserById(id);
  }

  @Put('users/:id/status')
  @ApiOperation({ summary: '更新用户状态' })
  async updateUserStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    // 这里需要从body获取status，暂时简化
    return this.userManagementService.updateUserStatus(id, 'active', dto.reason);
  }

  @Post('users/:id/kyc/approve')
  @ApiOperation({ summary: '批准KYC' })
  async approveKYC(@Param('id') id: string) {
    return this.userManagementService.approveKYC(id);
  }

  @Post('users/:id/kyc/reject')
  @ApiOperation({ summary: '拒绝KYC' })
  async rejectKYC(@Param('id') id: string, @Body() body: { reason: string }) {
    return this.userManagementService.rejectKYC(id, body.reason);
  }

  @Get('users/statistics')
  @ApiOperation({ summary: '获取用户统计' })
  async getUserStatistics() {
    return this.userManagementService.getUserStatistics();
  }

  @Get('transactions')
  @ApiOperation({ summary: '获取交易列表' })
  async getTransactions(@Query() query: QueryTransactionsDto) {
    return this.userManagementService.getTransactions(query);
  }

  // ========== 商户管理 ==========

  @Get('merchants')
  @ApiOperation({ summary: '获取商户列表' })
  async getMerchants(@Query() query: any) {
    return this.merchantManagementService.getMerchants(query);
  }

  @Get('merchants/:id')
  @ApiOperation({ summary: '获取商户详情' })
  async getMerchantById(@Param('id') id: string) {
    return this.merchantManagementService.getMerchantById(id);
  }

  @Get('merchants/:id/products')
  @ApiOperation({ summary: '获取商户商品列表' })
  async getMerchantProducts(@Param('id') id: string, @Query() query: any) {
    return this.merchantManagementService.getMerchantProducts(id, query);
  }

  @Get('merchants/:id/orders')
  @ApiOperation({ summary: '获取商户订单列表' })
  async getMerchantOrders(@Param('id') id: string, @Query() query: any) {
    return this.merchantManagementService.getMerchantOrders(id, query);
  }

  @Get('merchants/:id/settlements')
  @ApiOperation({ summary: '获取商户结算列表' })
  async getMerchantSettlements(@Param('id') id: string, @Query() query: any) {
    return this.merchantManagementService.getMerchantSettlements(id, query);
  }

  @Get('merchants/statistics')
  @ApiOperation({ summary: '获取商户统计' })
  async getMerchantStatistics() {
    return this.merchantManagementService.getMerchantStatistics();
  }

  // ========== 开发者管理 ==========

  @Get('developers')
  @ApiOperation({ summary: '获取开发者列表' })
  async getDevelopers(@Query() query: any) {
    return this.developerManagementService.getDevelopers(query);
  }

  @Get('developers/:id')
  @ApiOperation({ summary: '获取开发者详情' })
  async getDeveloperById(@Param('id') id: string) {
    return this.developerManagementService.getDeveloperById(id);
  }

  @Get('developers/:id/agents')
  @ApiOperation({ summary: '获取开发者Agent列表' })
  async getDeveloperAgents(@Param('id') id: string, @Query() query: any) {
    return this.developerManagementService.getDeveloperAgents(id, query);
  }

  // ========== 推广者管理 ==========

  @Get('promoters')
  @ApiOperation({ summary: '获取推广者列表' })
  async getPromoters(@Query() query: any) {
    return this.promoterManagementService.getPromoters(query);
  }

  @Get('promoters/:id')
  @ApiOperation({ summary: '获取推广者详情' })
  async getPromoterById(@Param('id') id: string) {
    return this.promoterManagementService.getPromoterById(id);
  }

  @Get('promoters/:id/referrals')
  @ApiOperation({ summary: '获取推广者推广关系列表' })
  async getPromoterReferrals(@Param('id') id: string, @Query() query: any) {
    return this.promoterManagementService.getPromoterReferrals(id, query);
  }

  @Get('promoters/:id/commissions')
  @ApiOperation({ summary: '获取推广者分成列表' })
  async getPromoterCommissions(@Param('id') id: string, @Query() query: any) {
    return this.promoterManagementService.getPromoterCommissions(id, query);
  }

  // ========== 工单管理 ==========

  @Post('tickets')
  @ApiOperation({ summary: '创建工单' })
  async createTicket(@Body() dto: CreateTicketDto) {
    return this.supportTicketService.createTicket(dto);
  }

  @Get('tickets')
  @ApiOperation({ summary: '获取工单列表' })
  async getTickets(@Query() query: QueryTicketsDto) {
    return this.supportTicketService.getTickets(query);
  }

  @Get('tickets/:id')
  @ApiOperation({ summary: '获取工单详情' })
  async getTicketById(@Param('id') id: string) {
    return this.supportTicketService.getTicketById(id);
  }

  @Put('tickets/:id')
  @ApiOperation({ summary: '更新工单' })
  async updateTicket(@Param('id') id: string, @Body() dto: UpdateTicketDto) {
    return this.supportTicketService.updateTicket(id, dto);
  }

  @Post('tickets/:id/reply')
  @ApiOperation({ summary: '回复工单' })
  async replyTicket(
    @Param('id') id: string,
    @Body() dto: ReplyTicketDto,
    @Request() req,
  ) {
    return this.supportTicketService.replyTicket(
      id,
      dto,
      req.user.sub,
      undefined,
    );
  }

  @Get('tickets/statistics')
  @ApiOperation({ summary: '获取工单统计' })
  async getTicketStatistics() {
    return this.supportTicketService.getTicketStatistics();
  }

  // ========== 数据统计 ==========

  @Get('dashboard/overview')
  @ApiOperation({ summary: '获取仪表盘概览数据' })
  async getDashboardOverview() {
    const [userStats, merchantStats, ticketStats] = await Promise.all([
      this.userManagementService.getUserStatistics(),
      this.merchantManagementService.getMerchantStatistics(),
      this.supportTicketService.getTicketStatistics(),
    ]);

    return {
      users: userStats,
      merchants: merchantStats,
      tickets: ticketStats,
    };
  }

  // ========== P1: 营销管理 ==========

  @Get('marketing/campaigns')
  @ApiOperation({ summary: '获取营销活动列表' })
  async getCampaigns(@Query() query: any) {
    return this.marketingManagementService.getCampaigns(query);
  }

  @Get('marketing/campaigns/:id')
  @ApiOperation({ summary: '获取营销活动详情' })
  async getCampaignById(@Param('id') id: string) {
    return this.marketingManagementService.getCampaignById(id);
  }

  @Post('marketing/campaigns')
  @ApiOperation({ summary: '创建营销活动' })
  async createCampaign(@Body() dto: any) {
    return this.marketingManagementService.createCampaign(dto);
  }

  @Put('marketing/campaigns/:id')
  @ApiOperation({ summary: '更新营销活动' })
  async updateCampaign(@Param('id') id: string, @Body() dto: any) {
    return this.marketingManagementService.updateCampaign(id, dto);
  }

  @Get('marketing/campaigns/statistics')
  @ApiOperation({ summary: '获取营销活动统计' })
  async getCampaignStatistics() {
    return this.marketingManagementService.getCampaignStatistics();
  }

  @Get('marketing/coupons')
  @ApiOperation({ summary: '获取优惠券列表' })
  async getCoupons(@Query() query: any) {
    return this.marketingManagementService.getCoupons(query);
  }

  @Get('marketing/coupons/:id')
  @ApiOperation({ summary: '获取优惠券详情' })
  async getCouponById(@Param('id') id: string) {
    return this.marketingManagementService.getCouponById(id);
  }

  @Post('marketing/coupons')
  @ApiOperation({ summary: '创建优惠券' })
  async createCoupon(@Body() dto: any) {
    return this.marketingManagementService.createCoupon(dto);
  }

  @Put('marketing/coupons/:id')
  @ApiOperation({ summary: '更新优惠券' })
  async updateCoupon(@Param('id') id: string, @Body() dto: any) {
    return this.marketingManagementService.updateCoupon(id, dto);
  }

  @Get('marketing/coupons/statistics')
  @ApiOperation({ summary: '获取优惠券统计' })
  async getCouponStatistics() {
    return this.marketingManagementService.getCouponStatistics();
  }

  // ========== P1: 系统管理 ==========

  @Get('system/admins')
  @ApiOperation({ summary: '获取管理员列表' })
  async getAdminUsers(@Query() query: any) {
    return this.systemManagementService.getAdminUsers(query);
  }

  @Get('system/admins/:id')
  @ApiOperation({ summary: '获取管理员详情' })
  async getAdminUserById(@Param('id') id: string) {
    return this.systemManagementService.getAdminUserById(id);
  }

  @Post('system/admins')
  @ApiOperation({ summary: '创建管理员' })
  async createAdminUser(@Body() dto: any) {
    return this.systemManagementService.createAdminUser(dto);
  }

  @Put('system/admins/:id')
  @ApiOperation({ summary: '更新管理员' })
  async updateAdminUser(@Param('id') id: string, @Body() dto: any) {
    return this.systemManagementService.updateAdminUser(id, dto);
  }

  @Get('system/roles')
  @ApiOperation({ summary: '获取角色列表' })
  async getRoles() {
    return this.systemManagementService.getRoles();
  }

  @Get('system/roles/:id')
  @ApiOperation({ summary: '获取角色详情' })
  async getRoleById(@Param('id') id: string) {
    return this.systemManagementService.getRoleById(id);
  }

  @Post('system/roles')
  @ApiOperation({ summary: '创建角色' })
  async createRole(@Body() dto: any) {
    return this.systemManagementService.createRole(dto);
  }

  @Put('system/roles/:id')
  @ApiOperation({ summary: '更新角色' })
  async updateRole(@Param('id') id: string, @Body() dto: any) {
    return this.systemManagementService.updateRole(id, dto);
  }

  @Get('system/configs')
  @ApiOperation({ summary: '获取系统配置列表' })
  async getConfigs(@Query() query: any) {
    return this.systemManagementService.getConfigs(query);
  }

  @Get('system/configs/:key')
  @ApiOperation({ summary: '获取系统配置' })
  async getConfigByKey(@Param('key') key: string) {
    return this.systemManagementService.getConfigByKey(key);
  }

  @Post('system/configs')
  @ApiOperation({ summary: '创建系统配置' })
  async createConfig(@Body() dto: any) {
    return this.systemManagementService.createConfig(dto);
  }

  @Put('system/configs/:key')
  @ApiOperation({ summary: '更新系统配置' })
  async updateConfig(@Param('key') key: string, @Body() dto: any) {
    return this.systemManagementService.updateConfig(key, dto);
  }

  @Get('system/logs')
  @ApiOperation({ summary: '获取操作日志' })
  async getLogs(@Query() query: any) {
    return this.systemManagementService.getLogs(query);
  }

  // ========== P1: 风控管理 ==========

  @Get('risk/assessments')
  @ApiOperation({ summary: '获取风险评估列表' })
  async getRiskAssessments(@Query() query: any) {
    return this.riskManagementService.getRiskAssessments(query);
  }

  @Get('risk/assessments/:id')
  @ApiOperation({ summary: '获取风险评估详情' })
  async getRiskAssessmentById(@Param('id') id: string) {
    return this.riskManagementService.getRiskAssessmentById(id);
  }

  @Get('risk/statistics')
  @ApiOperation({ summary: '获取风险统计' })
  async getRiskStatistics() {
    return this.riskManagementService.getRiskStatistics();
  }

  @Get('risk/orders')
  @ApiOperation({ summary: '获取风险订单列表' })
  async getRiskOrders(@Query() query: any) {
    return this.riskManagementService.getRiskOrders(query);
  }

  @Post('risk/orders/:id/block')
  @ApiOperation({ summary: '冻结风险订单' })
  async blockOrder(@Param('id') id: string, @Body() body: { reason: string }) {
    return this.riskManagementService.blockOrder(id, body.reason);
  }

  @Post('risk/orders/:id/release')
  @ApiOperation({ summary: '解冻订单' })
  async releaseOrder(@Param('id') id: string) {
    return this.riskManagementService.releaseOrder(id);
  }

  @Get('risk/users')
  @ApiOperation({ summary: '获取风险用户列表' })
  async getRiskUsers(@Query() query: any) {
    return this.riskManagementService.getRiskUsers(query);
  }
}

