import { Controller, Get, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { AnalyticsService, AnalyticsQuery, MerchantAnalyticsQuery } from './analytics.service'

@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get()
  @ApiOperation({ summary: '获取通用运营分析数据' })
  async getAnalytics(@Query() query: AnalyticsQuery) {
    return this.analyticsService.getGeneralAnalytics(query)
  }

  @Get('merchant')
  @ApiOperation({ summary: '获取商户分析数据' })
  async getMerchantAnalytics(@Query() query: MerchantAnalyticsQuery) {
    return this.analyticsService.getMerchantAnalytics(query)
  }
}


