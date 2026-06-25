import {
  Controller,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CryptoPaymentService, CryptoPaymentRequest, TransactionBuildRequest } from './crypto-payment.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('payments')
@ApiBearerAuth()
@Controller('payments/crypto')
@UseGuards(JwtAuthGuard)
export class CryptoPaymentController {
  constructor(private readonly cryptoPaymentService: CryptoPaymentService) {}

  @Post('estimate-gas')
  @ApiOperation({ summary: '估算Gas费用' })
  @ApiResponse({ status: 200, description: '返回Gas估算' })
  async estimateGas(@Request() req, @Body() request: CryptoPaymentRequest) {
    return this.cryptoPaymentService.estimateGas(request);
  }

  @Post('build-transaction')
  @ApiOperation({ summary: '构建支付交易' })
  @ApiResponse({ status: 200, description: '返回构建的交易' })
  async buildTransaction(@Request() req, @Body() request: TransactionBuildRequest) {
    return this.cryptoPaymentService.buildTransaction(request);
  }

  @Post()
  @ApiOperation({ summary: '创建加密货币支付' })
  @ApiResponse({ status: 201, description: '支付创建成功' })
  async createPayment(@Request() req, @Body() request: CryptoPaymentRequest) {
    return this.cryptoPaymentService.createPayment(req.user.id, request);
  }

  @Post(':paymentId/submit')
  @ApiOperation({ summary: '提交已签名的交易' })
  @ApiResponse({ status: 200, description: '交易提交成功' })
  async submitSignedTransaction(
    @Request() req,
    @Param('paymentId') paymentId: string,
    @Body() body: { signedTransaction: string; signature?: string },
  ) {
    return this.cryptoPaymentService.submitSignedTransaction(
      paymentId,
      body.signedTransaction,
      body.signature,
    );
  }
}

