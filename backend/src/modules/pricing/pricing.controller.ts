import { Controller, Get, Post, Query, Body, Param, ParseUUIDPipe } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('pricing')
@Controller('v2/pricing')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Get('products/:id/price')
  @ApiOperation({ summary: '获取产品价格（根据国家）' })
  @ApiResponse({ status: 200, description: '返回产品价格信息' })
  async getProductPrice(
    @Param('id', ParseUUIDPipe) productId: string,
    @Query('country') countryCode: string,
    @Query('region') regionCode?: string,
  ) {
    return this.pricingService.getProductPriceForCountry(
      productId,
      countryCode,
      regionCode,
    );
  }

  @Get('products/:id/total')
  @ApiOperation({ summary: '获取产品总价（包含税费）' })
  @ApiResponse({ status: 200, description: '返回产品总价信息' })
  async getTotalPrice(
    @Param('id', ParseUUIDPipe) productId: string,
    @Query('country') countryCode: string,
    @Query('region') regionCode?: string,
  ) {
    return this.pricingService.getTotalPrice(productId, countryCode, regionCode);
  }

  @Post('convert')
  @ApiOperation({ summary: '货币转换' })
  @ApiResponse({ status: 200, description: '返回转换后的金额' })
  async convertCurrency(
    @Body() body: { amount: number; fromCurrency: string; toCurrency: string },
  ) {
    return {
      amount: await this.pricingService.convertCurrency(
        body.amount,
        body.fromCurrency,
        body.toCurrency,
      ),
      currency: body.toCurrency,
    };
  }
}

