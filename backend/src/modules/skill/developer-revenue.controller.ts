/**
 * Developer Revenue Controller
 * 
 * 开发者收益API端点
 */

import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Request,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DeveloperRevenueService } from './developer-revenue.service';

@ApiTags('Developer Revenue')
@Controller('api/developer')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DeveloperRevenueController {
  private readonly logger = new Logger(DeveloperRevenueController.name);

  constructor(private readonly revenueService: DeveloperRevenueService) {}

  /**
   * 获取开发者仪表盘
   */
  @Get('dashboard')
  @ApiOperation({ summary: '获取开发者收益仪表盘' })
  @ApiResponse({ status: 200, description: '仪表盘数据' })
  async getDashboard(@Request() req: any) {
    this.logger.log(`Dashboard requested by user: ${req.user?.id}`);
    return this.revenueService.getDeveloperDashboard(req.user.id);
  }

  /**
   * 获取收益汇总
   */
  @Get('revenue/summary')
  @ApiOperation({ summary: '获取收益汇总' })
  @ApiQuery({ name: 'startDate', required: false, description: '开始日期 (ISO string)' })
  @ApiQuery({ name: 'endDate', required: false, description: '结束日期 (ISO string)' })
  @ApiResponse({ status: 200, description: '收益汇总' })
  async getRevenueSummary(
    @Request() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();
    
    return this.revenueService.getRevenueSummary(req.user.id, start, end);
  }

  /**
   * 获取单个Skill的收益详情
   */
  @Get('revenue/skills/:skillId')
  @ApiOperation({ summary: '获取单个Skill的收益详情' })
  @ApiQuery({ name: 'days', required: false, description: '查询天数，默认30' })
  @ApiResponse({ status: 200, description: 'Skill收益详情' })
  async getSkillRevenue(
    @Request() req: any,
    @Param('skillId') skillId: string,
    @Query('days') days?: string,
  ) {
    const daysNum = days ? parseInt(days) : 30;
    return this.revenueService.getSkillRevenue(skillId, req.user.id, daysNum);
  }

  /**
   * 获取最近收益记录
   */
  @Get('revenue/recent')
  @ApiOperation({ summary: '获取最近收益记录' })
  @ApiQuery({ name: 'limit', required: false, description: '返回数量，默认20' })
  @ApiResponse({ status: 200, description: '最近收益记录' })
  async getRecentRevenue(
    @Request() req: any,
    @Query('limit') limit?: string,
  ) {
    const dashboard = await this.revenueService.getDeveloperDashboard(req.user.id);
    const limitNum = limit ? parseInt(limit) : 20;
    return {
      records: dashboard.recentActivity.slice(0, limitNum),
      total: dashboard.overview.totalEarnings,
      pending: dashboard.overview.pendingSettlement,
    };
  }

  /**
   * 获取收益图表数据
   */
  @Get('revenue/chart')
  @ApiOperation({ summary: '获取收益图表数据' })
  @ApiQuery({ name: 'days', required: false, description: '天数，默认30' })
  @ApiResponse({ status: 200, description: '图表数据' })
  async getRevenueChart(
    @Request() req: any,
    @Query('days') days?: string,
  ) {
    const dashboard = await this.revenueService.getDeveloperDashboard(req.user.id);
    return {
      chart: dashboard.earningsChart,
      summary: dashboard.overview,
    };
  }
}
