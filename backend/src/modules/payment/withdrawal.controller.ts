import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WithdrawalService } from './withdrawal.service';

@ApiTags('提现')
@Controller('payments/withdraw')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WithdrawalController {
  constructor(private readonly withdrawalService: WithdrawalService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建提现申请' })
  @ApiResponse({ status: 201, description: '提现申请创建成功' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  async createWithdrawal(
    @Request() req,
    @Body()
    body: {
      amount: number;
      fromCurrency: string;
      toCurrency: string;
      bankAccount: string;
    },
  ) {
    return this.withdrawalService.createWithdrawal(
      req.user.id,
      body.amount,
      body.fromCurrency,
      body.toCurrency,
      body.bankAccount,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: '查询提现状态' })
  @ApiResponse({ status: 200, description: '返回提现记录' })
  @ApiResponse({ status: 404, description: '提现记录不存在' })
  async getWithdrawal(@Param('id') id: string) {
    return this.withdrawalService.getWithdrawal(id);
  }

  @Get()
  @ApiOperation({ summary: '查询提现列表' })
  @ApiResponse({ status: 200, description: '返回提现列表' })
  async getWithdrawals(
    @Request() req,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.withdrawalService.getWithdrawalsByMerchant(
      req.user.id,
      limit || 20,
      offset || 0,
    );
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '取消提现' })
  @ApiResponse({ status: 200, description: '提现已取消' })
  @ApiResponse({ status: 400, description: '无法取消此提现' })
  async cancelWithdrawal(@Request() req, @Param('id') id: string) {
    return this.withdrawalService.cancelWithdrawal(id, req.user.id);
  }
}

