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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { MerchantTaskService, CreateTaskDto, UpdateTaskProgressDto } from './merchant-task.service';
import { TaskMarketplaceService, PublishTaskDto, SearchTasksParams, CreateBidDto } from './task-marketplace.service';
import { TaskCommissionService, TASK_COMMISSION } from './task-commission.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';

@ApiTags('merchant-tasks')
@Controller('merchant-tasks')
export class MerchantTaskController {
  constructor(
    private readonly taskService: MerchantTaskService,
    private readonly marketplaceService: TaskMarketplaceService,
    private readonly commissionService: TaskCommissionService,
  ) {}

  @Post()
  @ApiOperation({ summary: '创建任务（Agent→商户协作）' })
  @ApiResponse({ status: 201, description: '返回创建的任务' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async createTask(
    @Request() req: any,
    @Body() dto: CreateTaskDto,
  ) {
    return this.taskService.createTask(req.user?.id, dto);
  }

  @Put(':taskId/accept')
  @ApiOperation({ summary: '商户接受任务' })
  @ApiResponse({ status: 200, description: '返回更新的任务' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async acceptTask(
    @Request() req: any,
    @Param('taskId') taskId: string,
  ) {
    return this.taskService.acceptTask(req.user?.id, taskId);
  }

  @Put(':taskId/progress')
  @ApiOperation({ summary: '更新任务进度' })
  @ApiResponse({ status: 200, description: '返回更新的任务' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async updateProgress(
    @Request() req: any,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskProgressDto,
  ) {
    return this.taskService.updateTaskProgress(req.user?.id, taskId, dto);
  }

  @Put(':taskId/complete')
  @ApiOperation({ summary: '完成任务' })
  @ApiResponse({ status: 200, description: '返回完成的任务' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async completeTask(
    @Request() req: any,
    @Param('taskId') taskId: string,
  ) {
    return this.taskService.completeTask(req.user?.id, taskId);
  }

  @Get('my-tasks')
  @ApiOperation({ summary: '获取我的任务列表（用户）' })
  @ApiResponse({ status: 200, description: '返回任务列表' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getMyTasks(@Request() req: any, @Query('status') status?: any) {
    return this.taskService.getUserTasks(req.user?.id, status);
  }

  @Put(':taskId/cancel')
  @ApiOperation({ summary: '取消任务' })
  @ApiResponse({ status: 200, description: '返回取消的任务' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async cancelTask(
    @Request() req: any,
    @Param('taskId') taskId: string,
    @Body() body?: { reason?: string },
  ) {
    return this.taskService.cancelTask(req.user?.id, taskId, body?.reason);
  }

  @Get('merchant-tasks')
  @ApiOperation({ summary: '获取商户任务列表' })
  @ApiResponse({ status: 200, description: '返回任务列表' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getMerchantTasks(@Request() req: any) {
    return this.taskService.getMerchantTasks(req.user?.id);
  }

  @Get(':taskId')
  @ApiOperation({ summary: '获取任务详情' })
  @ApiResponse({ status: 200, description: '返回任务详情' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getTask(
    @Request() req: any,
    @Param('taskId') taskId: string,
  ) {
    return this.taskService.getTask(taskId, req.user?.id);
  }

  // ========== 任务市场公开接口 ==========

  @Post('marketplace/publish')
  @ApiOperation({ summary: '发布公开任务到市场' })
  @ApiResponse({ status: 201, description: '返回发布的任务' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async publishTaskToMarketplace(
    @Request() req: any,
    @Body() dto: PublishTaskDto,
  ) {
    return this.marketplaceService.publishTask(req.user?.id, dto);
  }

  @Get('marketplace/search')
  @ApiOperation({ summary: '搜索公开任务市场' })
  @ApiResponse({ status: 200, description: '返回任务列表' })
  @ApiQuery({ name: 'query', required: false, description: '搜索关键词' })
  @ApiQuery({ name: 'type', required: false, description: '任务类型' })
  @ApiQuery({ name: 'budgetMin', required: false, description: '最小预算' })
  @ApiQuery({ name: 'budgetMax', required: false, description: '最大预算' })
  @ApiQuery({ name: 'tags', required: false, description: '标签（逗号分隔）' })
  @ApiQuery({ name: 'page', required: false, description: '页码' })
  @ApiQuery({ name: 'limit', required: false, description: '每页数量' })
  async searchTaskMarketplace(@Query() params: any) {
    const searchParams: SearchTasksParams = {
      query: params.query,
      type: params.type ? (Array.isArray(params.type) ? params.type : [params.type]) : undefined,
      budgetMin: params.budgetMin ? Number(params.budgetMin) : undefined,
      budgetMax: params.budgetMax ? Number(params.budgetMax) : undefined,
      tags: params.tags ? (typeof params.tags === 'string' ? params.tags.split(',') : params.tags) : undefined,
      page: params.page ? Number(params.page) : 1,
      limit: params.limit ? Number(params.limit) : 20,
      sortBy: params.sortBy || 'createdAt',
      sortOrder: params.sortOrder || 'DESC',
    };
    return this.marketplaceService.searchTasks(searchParams);
  }

  @Get('marketplace/tasks/:taskId')
  @ApiOperation({ summary: '获取公开任务详情' })
  @ApiResponse({ status: 200, description: '返回任务详情' })
  async getMarketplaceTaskDetail(
    @Param('taskId') taskId: string,
  ) {
    return this.marketplaceService.getTask(taskId);
  }

  @Post('marketplace/tasks/:taskId/bid')
  @ApiOperation({ summary: '对任务进行竞标' })
  @ApiResponse({ status: 201, description: '返回创建的竞标' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async submitBid(
    @Request() req: any,
    @Param('taskId') taskId: string,
    @Body() dto: CreateBidDto,
  ) {
    return this.marketplaceService.submitBid(req.user?.id, taskId, dto);
  }

  @Get('marketplace/tasks/:taskId/bids')
  @ApiOperation({ summary: '获取任务的所有竞标' })
  @ApiResponse({ status: 200, description: '返回竞标列表' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getTaskBids(
    @Request() req: any,
    @Param('taskId') taskId: string,
  ) {
    return this.marketplaceService.getTaskBids(taskId, req.user?.id);
  }

  @Put('marketplace/tasks/:taskId/bids/:bidId/accept')
  @ApiOperation({ summary: '接受竞标' })
  @ApiResponse({ status: 200, description: '返回更新的竞标和任务' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async acceptBid(
    @Request() req: any,
    @Param('taskId') taskId: string,
    @Param('bidId') bidId: string,
  ) {
    return this.marketplaceService.acceptBid(req.user?.id, bidId);
  }

  @Put('marketplace/tasks/:taskId/bids/:bidId/reject')
  @ApiOperation({ summary: '拒绝竞标' })
  @ApiResponse({ status: 200, description: '返回更新的竞标' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async rejectBid(
    @Request() req: any,
    @Param('taskId') taskId: string,
    @Param('bidId') bidId: string,
  ) {
    return this.marketplaceService.rejectBid(req.user?.id, bidId);
  }

  @Get('marketplace/my-bids')
  @ApiOperation({ summary: '获取我的竞标列表' })
  @ApiResponse({ status: 200, description: '返回竞标列表' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getMyBids(@Request() req: any) {
    return this.marketplaceService.getUserBids(req.user?.id);
  }

  // ========== Commission APIs ==========

  @Get('commission/preview')
  @ApiOperation({ summary: '预览任务佣金' })
  @ApiQuery({ name: 'amount', required: true, description: '任务金额' })
  @ApiQuery({ name: 'currency', required: false, description: '币种' })
  async previewCommission(
    @Query('amount') amount: string,
    @Query('currency') currency?: string,
  ) {
    return this.commissionService.calculateCommission(
      Number(amount),
      currency || 'USD',
      TASK_COMMISSION.DEFAULT_RATE_BPS,
    );
  }

  @Get('commission/summary')
  @ApiOperation({ summary: '获取我的佣金汇总' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getCommissionSummary(@Request() req: any) {
    return this.commissionService.getUserCommissionSummary(req.user?.id);
  }
}

