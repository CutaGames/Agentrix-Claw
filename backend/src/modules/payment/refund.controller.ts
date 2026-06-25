import { Controller, Post, Get, Body, Param, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RefundService, RefundRequest } from './refund.service';

@ApiTags('退款')
@Controller('refunds')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RefundController {
  constructor(private readonly refundService: RefundService) {}

  @Post()
  @ApiOperation({ summary: '创建退款请求' })
  @ApiResponse({ status: 201, description: '退款请求创建成功' })
  async createRefund(@Request() req, @Body() body: { paymentId: string; amount?: number; reason: string }) {
    const request: RefundRequest = {
      paymentId: body.paymentId,
      amount: body.amount,
      reason: body.reason,
      requestedBy: req.user.id,
    };
    return this.refundService.createRefund(request);
  }

  @Get(':refundId')
  @ApiOperation({ summary: '获取退款信息' })
  @ApiResponse({ status: 200, description: '返回退款信息' })
  async getRefund(@Param('refundId') refundId: string) {
    return this.refundService.getRefund(refundId);
  }

  @Get('payment/:paymentId')
  @ApiOperation({ summary: '获取支付的所有退款' })
  @ApiResponse({ status: 200, description: '返回退款列表' })
  async getPaymentRefunds(@Param('paymentId') paymentId: string) {
    return this.refundService.getPaymentRefunds(paymentId);
  }
}

