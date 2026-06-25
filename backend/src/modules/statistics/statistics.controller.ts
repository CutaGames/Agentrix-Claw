import { Controller, Get, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import {
  StatisticsService,
  ApiStatisticsQuery,
  ApiTrendQuery,
  RevenueStatisticsQuery,
  RevenueTrendQuery,
} from './statistics.service'

@ApiTags('statistics')
@Controller('statistics')
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Get('api')
  @ApiOperation({ summary: '获取 API 调用统计' })
  getApiStatistics(@Query() query: ApiStatisticsQuery) {
    return this.statisticsService.getApiStatistics(query)
  }

  @Get('api/trend')
  @ApiOperation({ summary: '获取 API 调用趋势' })
  getApiTrend(@Query() query: ApiTrendQuery) {
    return this.statisticsService.getApiTrend(query)
  }

  @Get('revenue')
  @ApiOperation({ summary: '获取开发者收益统计' })
  getRevenueStatistics(@Query() query: RevenueStatisticsQuery) {
    return this.statisticsService.getDeveloperRevenue(query)
  }

  @Get('revenue/trend')
  @ApiOperation({ summary: '获取开发者收益趋势' })
  getRevenueTrend(@Query() query: RevenueTrendQuery) {
    return this.statisticsService.getRevenueTrend(query)
  }
}


