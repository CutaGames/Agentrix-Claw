import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { LedgerService } from './ledger.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('ledger')
@ApiBearerAuth()
@Controller('ledger')
@UseGuards(JwtAuthGuard)
export class LedgerController {
  constructor(private readonly ledgerService: LedgerService) {}

  @Get('revenue-share')
  @ApiOperation({ summary: '获取商户分润' })
  @ApiResponse({ status: 200, description: '返回分润信息' })
  async getRevenueShare(
    @Request() req,
    @Query('merchantId') merchantId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.ledgerService.getRevenueShare(
      merchantId || req.user.id,
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Get('platform-commission')
  @ApiOperation({ summary: '获取平台佣金' })
  @ApiResponse({ status: 200, description: '返回平台佣金' })
  async getPlatformCommission(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.ledgerService.getPlatformCommission(
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Post('split-payment')
  @ApiOperation({ summary: '创建分账支付' })
  @ApiResponse({ status: 201, description: '分账支付创建成功' })
  async createSplitPayment(@Body() body: any) {
    return this.ledgerService.createSplitPayment(body);
  }

  @Post('reconciliation')
  @ApiOperation({ summary: '创建日终对账' })
  @ApiResponse({ status: 201, description: '对账创建成功' })
  async createReconciliation(@Body() body: { date: string }) {
    return this.ledgerService.createReconciliation(new Date(body.date));
  }

  @Get('export')
  @ApiOperation({ summary: '导出支付流水' })
  @ApiResponse({ status: 200, description: '返回流水数据' })
  async exportLedger(
    @Request() req,
    @Query('userId') userId?: string,
    @Query('merchantId') merchantId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('format') format: 'csv' | 'json' | 'xlsx' = 'json',
  ) {
    return this.ledgerService.exportLedger({
      userId: userId || req.user.id,
      merchantId,
      startDate: startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 默认30天前
      endDate: endDate ? new Date(endDate) : new Date(), // 默认今天
      format,
    });
  }
}

