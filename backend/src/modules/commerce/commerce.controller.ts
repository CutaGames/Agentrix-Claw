import { Body, Controller, Post, Get, Put, Delete, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CommerceService, CommerceMode, CommerceAction } from './commerce.service';
import { CommercePublishService } from './commerce-publish.service';
import { SplitPlanService } from './split-plan.service';
import { BudgetPoolService } from './budget-pool.service';
import { CreateSplitPlanDto, UpdateSplitPlanDto, PreviewAllocationDto } from './dto/split-plan.dto';
import { 
  CreateBudgetPoolDto, 
  UpdateBudgetPoolDto, 
  FundBudgetPoolDto,
  CreateMilestoneDto,
  SubmitMilestoneDto,
  ApproveMilestoneDto,
  RejectMilestoneDto,
} from './dto/budget-pool.dto';
import { CommerceExecuteDto } from './dto/commerce-execute.dto';
import { CommercePublishDto } from './dto/commerce-publish.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SplitPlanStatus } from '../../entities/split-plan.entity';
import { BudgetPoolStatus } from '../../entities/budget-pool.entity';

@ApiTags('Commerce')
@Controller('commerce')
export class CommerceController {
  constructor(
    private readonly commerceService: CommerceService,
    private readonly commercePublishService: CommercePublishService,
    private readonly splitPlanService: SplitPlanService,
    private readonly budgetPoolService: BudgetPoolService,
  ) {}

  /**
   * 统一执行入口 (MCP Tool 使用)
   */
  @Post('execute')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Execute commerce action' })
  async execute(
    @Request() req,
    @Body() body: CommerceExecuteDto,
  ) {
    return this.commerceService.execute(
      body.action,
      body.mode || 'PAY_AND_SPLIT',
      body.params || {},
      req.user?.id,
      body.idempotencyKey,
    );
  }

  // ===== Commerce Publish APIs =====

  /**
   * Publish a Commerce Skill to the Unified Marketplace
   * One-stop integration: skill creation + pricing + split plan + budget pool + marketplace listing
   */
  @Post('publish')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Publish commerce skill to marketplace' })
  async publishCommerceSkill(@Request() req, @Body() dto: CommercePublishDto) {
    return this.commercePublishService.publishCommerceSkill(req.user.id, dto as any);
  }

  /**
   * Preview publish result before committing
   */
  @Post('publish/preview')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Preview publish result' })
  async publishPreview(@Request() req, @Body() dto: CommercePublishDto) {
    return this.commercePublishService.getPublishPreview(req.user.id, dto as any);
  }

  /**
   * Unpublish a skill (revert to draft)
   */
  @Post('unpublish/:skillId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Unpublish a skill' })
  async unpublishSkill(@Request() req, @Param('skillId') skillId: string) {
    return this.commercePublishService.unpublishSkill(req.user.id, skillId);
  }

  /**
   * Get my published commerce skills
   */
  @Get('my-published')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my published commerce skills' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getMyPublishedSkills(
    @Request() req,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.commercePublishService.getMyPublishedSkills(
      req.user.id,
      Number(page),
      Math.min(Number(limit), 100),
    );
  }

  // ===== Split Plan REST APIs =====

  @Post('split-plans')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a split plan' })
  async createSplitPlan(@Request() req, @Body() dto: CreateSplitPlanDto) {
    return this.splitPlanService.create(req.user.id, dto);
  }

  @Get('split-plans')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user split plans' })
  @ApiQuery({ name: 'status', required: false, enum: SplitPlanStatus })
  @ApiQuery({ name: 'productType', required: false })
  async getSplitPlans(
    @Request() req,
    @Query('status') status?: SplitPlanStatus,
    @Query('productType') productType?: string,
  ) {
    return this.splitPlanService.findByUser(req.user.id, { status, productType });
  }

  @Get('split-plans/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a split plan by ID' })
  async getSplitPlan(@Request() req, @Param('id') id: string) {
    return this.splitPlanService.findById(id, req.user.id);
  }

  @Put('split-plans/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a split plan' })
  async updateSplitPlan(@Request() req, @Param('id') id: string, @Body() dto: UpdateSplitPlanDto) {
    return this.splitPlanService.update(id, req.user.id, dto);
  }

  @Post('split-plans/:id/activate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Activate a split plan' })
  async activateSplitPlan(@Request() req, @Param('id') id: string) {
    return this.splitPlanService.activate(id, req.user.id);
  }

  @Post('split-plans/:id/archive')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Archive a split plan' })
  async archiveSplitPlan(@Request() req, @Param('id') id: string) {
    return this.splitPlanService.archive(id, req.user.id);
  }

  @Delete('split-plans/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a split plan' })
  async deleteSplitPlan(@Request() req, @Param('id') id: string) {
    await this.splitPlanService.remove(id, req.user.id);
    return { success: true };
  }

  @Post('split-plans/preview')
  @ApiOperation({ summary: 'Preview allocation for a transaction' })
  async previewAllocation(@Body() dto: PreviewAllocationDto) {
    return this.splitPlanService.previewAllocation(dto);
  }

  @Get('split-plans/templates/:productType')
  @ApiOperation({ summary: 'Get default template for product type' })
  async getDefaultTemplate(@Param('productType') productType: string) {
    return this.splitPlanService.getDefaultTemplate(productType);
  }

  // ===== Budget Pool REST APIs =====

  @Post('budget-pools')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a budget pool' })
  async createBudgetPool(@Request() req, @Body() dto: CreateBudgetPoolDto) {
    return this.budgetPoolService.createPool(req.user.id, dto);
  }

  @Get('budget-pools')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user budget pools' })
  @ApiQuery({ name: 'status', required: false, enum: BudgetPoolStatus })
  async getBudgetPools(@Request() req, @Query('status') status?: BudgetPoolStatus) {
    return this.budgetPoolService.findPoolsByUser(req.user.id, { status });
  }

  @Get('budget-pools/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a budget pool by ID' })
  async getBudgetPool(@Request() req, @Param('id') id: string) {
    return this.budgetPoolService.findPoolById(id, req.user.id);
  }

  @Put('budget-pools/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a budget pool' })
  async updateBudgetPool(@Request() req, @Param('id') id: string, @Body() dto: UpdateBudgetPoolDto) {
    return this.budgetPoolService.updatePool(id, req.user.id, dto);
  }

  @Post('budget-pools/:id/fund')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Fund a budget pool' })
  async fundBudgetPool(@Request() req, @Param('id') id: string, @Body() dto: FundBudgetPoolDto) {
    return this.budgetPoolService.fundPool(id, req.user.id, dto);
  }

  @Post('budget-pools/:id/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel a budget pool' })
  async cancelBudgetPool(@Request() req, @Param('id') id: string) {
    return this.budgetPoolService.cancelPool(id, req.user.id);
  }

  @Get('budget-pools/:id/stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get budget pool statistics' })
  async getPoolStats(@Request() req, @Param('id') id: string) {
    return this.budgetPoolService.getPoolStats(id, req.user.id);
  }

  // ===== Milestone REST APIs =====

  @Post('milestones')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a milestone' })
  async createMilestone(@Request() req, @Body() dto: CreateMilestoneDto) {
    return this.budgetPoolService.createMilestone(req.user.id, dto);
  }

  @Get('budget-pools/:poolId/milestones')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get milestones for a budget pool' })
  async getMilestones(@Param('poolId') poolId: string) {
    return this.budgetPoolService.findMilestonesByPool(poolId);
  }

  @Get('milestones/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a milestone by ID' })
  async getMilestone(@Param('id') id: string) {
    return this.budgetPoolService.findMilestoneById(id);
  }

  @Post('milestones/:id/start')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Start a milestone' })
  async startMilestone(@Request() req, @Param('id') id: string) {
    return this.budgetPoolService.startMilestone(id, req.user.id);
  }

  @Post('milestones/:id/submit')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit milestone artifacts' })
  async submitMilestone(@Param('id') id: string, @Body() dto: SubmitMilestoneDto) {
    return this.budgetPoolService.submitMilestone(id, dto);
  }

  @Post('milestones/:id/approve')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Approve a milestone' })
  async approveMilestone(@Request() req, @Param('id') id: string, @Body() dto: ApproveMilestoneDto) {
    return this.budgetPoolService.approveMilestone(id, req.user.id, dto);
  }

  @Post('milestones/:id/reject')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reject a milestone' })
  async rejectMilestone(@Request() req, @Param('id') id: string, @Body() dto: RejectMilestoneDto) {
    return this.budgetPoolService.rejectMilestone(id, req.user.id, dto);
  }

  @Post('milestones/:id/release')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Release milestone funds' })
  async releaseMilestone(@Request() req, @Param('id') id: string) {
    return this.budgetPoolService.releaseMilestone(id, req.user.id);
  }

  // ===== 用户转化引导 APIs =====

  @Get('usage-stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user usage statistics' })
  async getUsageStats(@Request() req) {
    return this.commerceService.getUsageStats(req.user.id);
  }

  @Get('conversion-hints')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get personalized conversion hints' })
  async getConversionHints(@Request() req) {
    return this.commerceService.getConversionHints(req.user.id);
  }

  @Get('suggested-marketplace-config')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get suggested Marketplace configuration based on usage patterns' })
  async getSuggestedMarketplaceConfig(@Request() req) {
    return this.commerceService.getSuggestedMarketplaceConfig(req.user.id);
  }

  @Post('dismiss-hint')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Dismiss a conversion hint' })
  async dismissHint(@Request() req, @Body() body: { hintType: string }) {
    return this.commerceService.dismissHint(req.user.id, body.hintType);
  }
}
