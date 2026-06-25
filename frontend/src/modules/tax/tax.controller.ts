import { Controller, Get, Post, Query, Body, Param } from '@nestjs/common';
import { TaxService } from './tax.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('tax')
@Controller('api/v2/tax')
export class TaxController {
  constructor(private readonly taxService: TaxService) {}

  @Get('rates/:country')
  @ApiOperation({ summary: '获取税费率' })
  @ApiResponse({ status: 200, description: '返回税费率信息' })
  async getTaxRate(
    @Param('country') countryCode: string,
    @Query('region') regionCode?: string,
    @Query('type') taxType?: string,
  ) {
    return this.taxService.getTaxRate(countryCode, regionCode, taxType);
  }

  @Post('calculate')
  @ApiOperation({ summary: '计算税费' })
  @ApiResponse({ status: 200, description: '返回税费计算结果' })
  async calculateTax(
    @Body() body: { amount: number; countryCode: string; regionCode?: string },
  ) {
    return this.taxService.calculateTax(
      body.amount,
      body.countryCode,
      body.regionCode,
    );
  }

  @Get('reports/:merchantId')
  @ApiOperation({ summary: '获取税费报表' })
  @ApiResponse({ status: 200, description: '返回税费报表' })
  async getTaxReport(
    @Param('merchantId') merchantId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.taxService.generateTaxReport(
      merchantId,
      new Date(startDate),
      new Date(endDate),
    );
  }
}

